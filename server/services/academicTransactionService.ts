import { prisma } from '../db/prisma.js';
import { StudentRepository } from '../repositories/studentRepository.js';
import { CourseRepository } from '../repositories/courseRepository.js';
import { OfferingRepository } from '../repositories/offeringRepository.js';
import { AcademicRulesEngine, ValidationResult } from '../engines/rulesEngine.js';
import { calculatePercentageToGrade, capRetakeGrade, calculateGpa } from '../engines/gpaEngine.js';
import { Course, CourseOffering, Student, UserRole } from '../../src/types/index.js';

export interface RegistrationTxResult {
  success: boolean;
  validation: ValidationResult;
  updatedStudent?: Student;
}

export interface GradeUpdateTxResult {
  success: boolean;
  updatedStudent?: Student;
  gradeAssigned?: {
    rawGrade: string;
    finalGrade: string;
    points: number;
    capped: boolean;
  };
}

export class AcademicTransactionService {
  /**
   * Transactional Course Registration:
   * Validates bylaws atomically, increments offering capacity, inserts CourseRecord,
   * updates Student enrolled hours, and appends an immutable AuditLog.
   * If any step fails or constraint is violated, the whole transaction rolls back.
   */
  public static async registerCourses(
    studentId: string,
    courseCodes: string[],
    isSummer: boolean = false,
    caller?: { id: string; nameAr: string; nameEn: string; role: UserRole }
  ): Promise<RegistrationTxResult> {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch live student record
      const studentRow = await tx.student.findUnique({
        where: { id: studentId },
        include: {
          user: true,
          advisor: { include: { user: true } },
          records: {
            include: {
              course: true,
              offering: { include: { semester: true } },
            },
          },
          studyPlans: { take: 1 },
          trainings: { take: 1 },
        },
      });

      if (!studentRow) {
        throw new Error(`Student ${studentId} not found in PostgreSQL database`);
      }

      const student = StudentRepository.mapToDomain(studentRow);

      // 2. Fetch catalog courses and active offerings
      const courseRows = await tx.course.findMany({
        where: { code: { in: courseCodes } },
        include: { prerequisites: true },
      });
      const allCoursesList = await tx.course.findMany({ include: { prerequisites: true } });
      const allCoursesMap = new Map<string, Course>(
        allCoursesList.map(c => [c.code, CourseRepository.mapToDomain(c)])
      );

      const offeringRows = await tx.courseOffering.findMany({
        where: { course: { code: { in: courseCodes } } },
        include: { course: true, instructor: { include: { user: true } }, semester: true },
      });
      const offeringMap = new Map<string, CourseOffering>(
        offeringRows.map(o => [o.course.code, OfferingRepository.mapToDomain(o)])
      );

      // 3. Deterministic Bylaws Validation
      const validation = AcademicRulesEngine.validateRegistration(
        student,
        courseCodes,
        allCoursesMap,
        offeringMap,
        isSummer
      );

      if (!validation.valid) {
        return {
          success: false,
          validation,
        };
      }

      // 4. Atomic seat reservation & record creation
      for (const code of courseCodes) {
        const offRow = offeringRows.find(o => o.course.code === code);
        if (offRow) {
          await tx.courseOffering.update({
            where: { id: offRow.id },
            data: { enrolledCount: { increment: 1 } },
          });
        }

        const courseDef = allCoursesMap.get(code)!;
        const previousAttempts = student.records.filter(r => r.courseCode === code).length;

        await tx.courseRecord.create({
          data: {
            id: `rec_${student.id}_${code.replace(/\s+/g, '_')}_${Date.now()}`,
            studentId: student.id,
            courseId: courseDef.id,
            offeringId: offRow ? offRow.id : null,
            attempt: previousAttempts + 1,
            status: 'IN_PROGRESS',
            attendancePercentage: 100,
          },
        });
      }

      // 5. Update student enrolled credits
      const totalNewCredits = courseCodes.reduce((sum, code) => {
        const c = allCoursesMap.get(code);
        return sum + (c ? c.credits : 3);
      }, 0);

      await tx.student.update({
        where: { id: student.id },
        data: {
          enrolledCredits: { increment: totalNewCredits },
        },
      });

      // 6. Audit Log in same transaction
      let validActorUserId: string | null = null;
      if (caller?.id) {
        const u = await tx.user.findUnique({ where: { id: caller.id } });
        if (u) validActorUserId = u.id;
      }
      if (!validActorUserId) {
        validActorUserId = studentRow.userId;
      }
      const actorName = caller?.nameAr || student.nameAr;
      const actorRole = caller?.role || 'STUDENT';

      await tx.auditLog.create({
        data: {
          userId: validActorUserId,
          userName: actorName,
          userRole: actorRole as any,
          action: 'REGISTER_COURSES',
          entity: 'CourseRegistration',
          entityId: student.id,
          detailsAr: `تسجيل المقررات (${courseCodes.join(', ')}) بإجمالي ${totalNewCredits} ساعة معتمدة.`,
          detailsEn: `Registered courses (${courseCodes.join(', ')}) totaling ${totalNewCredits} credits.`,
          after: JSON.stringify({ courseCodes, totalCredits: totalNewCredits }),
        },
      });

      const updatedRow = await tx.student.findUnique({
        where: { id: studentId },
        include: {
          user: true,
          advisor: { include: { user: true } },
          records: {
            include: { course: true, offering: { include: { semester: true } } },
          },
          studyPlans: { take: 1 },
          trainings: { take: 1 },
        },
      });

      return {
        success: true,
        validation,
        updatedStudent: StudentRepository.mapToDomain(updatedRow),
      };
    });
  }

  /**
   * Transactional Grade Submission:
   * Sets coursework and final marks, applies attempt capping according to bylaws,
   * recalculates Cumulative GPA and warnings, updates student stats, and logs audit trail.
   */
  public static async updateCourseGrade(
    courseCode: string,
    studentId: string,
    courseworkMark: number,
    finalMark: number,
    instructorUser?: { id: string; nameAr: string; nameEn: string; role: UserRole }
  ): Promise<GradeUpdateTxResult> {
    return await prisma.$transaction(async (tx) => {
      const studentRow = await tx.student.findUnique({
        where: { id: studentId },
        include: {
          user: true,
          records: { include: { course: true } },
        },
      });

      if (!studentRow) throw new Error(`Student ${studentId} not found`);

      const targetRecord = studentRow.records.find(r => r.course.code === courseCode);
      if (!targetRecord) throw new Error(`Course record for ${courseCode} not found for student ${studentId}`);

      const totalMark = Number(courseworkMark) + Number(finalMark);
      const rawGrade = calculatePercentageToGrade(totalMark);
      const cappedGrade = capRetakeGrade(rawGrade.grade, targetRecord.attempt || 1);

      const beforeSnapshot = {
        grade: targetRecord.grade,
        gradePoints: targetRecord.gradePoints,
        courseworkMark: targetRecord.courseworkMark,
        finalMark: targetRecord.finalMark,
      };

      // 1. Update the CourseRecord
      await tx.courseRecord.update({
        where: { id: targetRecord.id },
        data: {
          courseworkMark: Number(courseworkMark),
          finalMark: Number(finalMark),
          totalMark,
          grade: cappedGrade.grade,
          gradePoints: cappedGrade.points,
          status: cappedGrade.grade === 'F' ? 'FAILED' : 'PASSED',
        },
      });

      // 2. Fetch all student records to compute new Cumulative GPA
      const allRecords = await tx.courseRecord.findMany({
        where: { studentId },
        include: { course: true },
      });

      const gradedRecords = allRecords.filter(r => r.gradePoints !== null && r.gradePoints !== undefined);
      const gpaResult = calculateGpa(
        gradedRecords.map(r => ({
          credits: r.course.credits,
          gradePoints: r.gradePoints!,
          grade: r.grade || undefined,
        }))
      );

      const passedCredits = allRecords
        .filter(r => r.status === 'PASSED')
        .reduce((sum, r) => sum + r.course.credits, 0);

      const newWarningCount = gpaResult.gpa < 2.0
        ? studentRow.warningCount + 1
        : studentRow.warningCount;
      const newConsecutiveWarnings = gpaResult.gpa < 2.0
        ? studentRow.consecutiveWarnings + 1
        : 0;

      // 3. Update Student Record
      await tx.student.update({
        where: { id: studentId },
        data: {
          previousGpa: studentRow.cumulativeGpa,
          cumulativeGpa: gpaResult.gpa,
          completedCredits: passedCredits,
          warningCount: newWarningCount,
          consecutiveWarnings: newConsecutiveWarnings,
        },
      });

      // 4. Audit Log in same transaction
      let validInstUserId: string | null = null;
      if (instructorUser?.id) {
        const u = await tx.user.findUnique({ where: { id: instructorUser.id } });
        if (u) validInstUserId = u.id;
      }
      if (!validInstUserId) {
        const defaultInst = await tx.user.findFirst({ where: { role: 'INSTRUCTOR' } });
        validInstUserId = defaultInst?.id || studentRow.userId;
      }

      await tx.auditLog.create({
        data: {
          userId: validInstUserId,
          userName: instructorUser?.nameAr || 'أ.د. عادل منصور',
          userRole: instructorUser?.role || 'INSTRUCTOR',
          action: 'SUBMIT_GRADE',
          entity: 'CourseRecord',
          entityId: targetRecord.id,
          detailsAr: `رصد درجات مقرر ${courseCode}: أعمال سنة ${courseworkMark} + نهائي ${finalMark} = ${totalMark} (تقدير: ${cappedGrade.grade}). المعدل التراكمي الجديد: ${gpaResult.gpa}.`,
          detailsEn: `Graded course ${courseCode}: coursework ${courseworkMark} + final ${finalMark} = ${totalMark} (${cappedGrade.grade}). New GPA: ${gpaResult.gpa}.`,
          before: JSON.stringify(beforeSnapshot),
          after: JSON.stringify({
            totalMark,
            grade: cappedGrade.grade,
            gradePoints: cappedGrade.points,
            cumulativeGpa: gpaResult.gpa,
          }),
        },
      });

      const updatedRow = await tx.student.findUnique({
        where: { id: studentId },
        include: {
          user: true,
          advisor: { include: { user: true } },
          records: { include: { course: true, offering: { include: { semester: true } } } },
          studyPlans: { take: 1 },
          trainings: { take: 1 },
        },
      });

      return {
        success: true,
        updatedStudent: StudentRepository.mapToDomain(updatedRow),
        gradeAssigned: {
          rawGrade: rawGrade.grade,
          finalGrade: cappedGrade.grade,
          points: cappedGrade.points,
          capped: cappedGrade.capped,
        },
      };
    });
  }

  /**
   * Transactional Study Plan Decision:
   * Sets study plan status, updates student plan status, notifies student, and logs audit trail.
   */
  public static async decideStudyPlan(
    studentId: string,
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES',
    notes: string = '',
    advisorUser?: { id: string; nameAr: string; nameEn: string; role: UserRole }
  ): Promise<{ success: boolean; status: string }> {
    return await prisma.$transaction(async (tx) => {
      const studentRow = await tx.student.findUnique({
        where: { id: studentId },
        include: { user: true },
      });
      if (!studentRow) throw new Error(`Student ${studentId} not found`);

      const dbStatus = decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'DRAFT';
      const appStatus = decision === 'APPROVE' ? 'Approved' : decision === 'REJECT' ? 'Rejected' : 'Draft';

      const planRow = await tx.studyPlan.findFirst({
        where: { studentId },
      });

      if (planRow) {
        await tx.studyPlan.update({
          where: { id: planRow.id },
          data: {
            status: dbStatus,
            advisorNotes: notes,
          },
        });
      } else {
        await tx.studyPlan.create({
          data: {
            id: `plan_${studentId}_${Date.now()}`,
            studentId,
            status: dbStatus,
            advisorNotes: notes,
            planDataJson: JSON.stringify([]),
          },
        });
      }

      // Notify student
      await tx.notification.create({
        data: {
          recipientId: studentRow.userId,
          type: 'APPROVAL',
          titleAr: decision === 'APPROVE' ? 'تم اعتماد خطتك الدراسية' : 'ملاحظات المرشد الأكاديمي على خطتك الدراسية',
          titleEn: decision === 'APPROVE' ? 'Study Plan Approved' : 'Advisor Plan Feedback',
          messageAr: `قرار المرشد: ${decision === 'APPROVE' ? 'اعتماد نهائي' : 'مطلوب مراجعة'}. ملاحظات: ${notes || 'تم بنجاح'}.`,
          messageEn: `Advisor decision: ${decision}. Notes: ${notes || 'Completed successfully'}.`,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: advisorUser?.id || 'user_advisor',
          userName: advisorUser?.nameAr || 'المرشد الأكاديمي',
          userRole: advisorUser?.role || 'ACADEMIC_ADVISOR',
          action: `PLAN_${decision}`,
          entity: 'StudyPlan',
          entityId: studentId,
          detailsAr: `اتخاذ قرار (${decision}) بشأن الخطة الدراسية للطالب ${studentRow.user.nameAr}.`,
          detailsEn: `Advisor decision (${decision}) on study plan for student ${studentRow.user.nameEn}.`,
          after: JSON.stringify({ decision, notes }),
        },
      });

      return { success: true, status: appStatus };
    });
  }
}
