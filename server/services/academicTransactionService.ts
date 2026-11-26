import { prisma } from '../db/prisma.js';
import { StudentRepository, STUDENT_INCLUDE } from '../repositories/studentRepository.js';
import { CourseRepository } from '../repositories/courseRepository.js';
import { OfferingRepository } from '../repositories/offeringRepository.js';
import { AcademicRulesEngine, ValidationResult, RegistrationIssueCode } from '../engines/rulesEngine.js';
import { calculatePercentageToGrade, capRetakeGrade, calculateGpa } from '../engines/gpaEngine.js';
import { Course, CourseOffering, Student, UserRole } from '../../src/types/index.js';

export interface RegistrationTxResult {
  success: boolean;
  validation: ValidationResult;
  updatedStudent?: Student;
}

/** How a course came to be registered when the student did not do it themselves. */
export interface RegistrationOptions {
  /** Administrator exception: register despite the problems an exception may cover. */
  override?: boolean;
  overrideReason?: string;
  /** Problems already found by the caller (e.g. a timetable clash), checked the same way. */
  extraIssues?: { code: RegistrationIssueCode; ar: string; en: string }[];
  /** Shown on the student's record and the section list ("registered by …"). */
  registeredByName?: string;
  note?: string;
  /** Audit action, e.g. REGISTER_COURSES_ON_BEHALF or AUTO_REGISTER_FIRST_TERM. */
  auditAction?: string;
}

/** Problems that no exception can cover. */
const HARD_ISSUES: RegistrationIssueCode[] = ['NOT_FOUND', 'ALREADY_TAKING', 'ALREADY_PASSED'];

/** A mark outside the bylaw's range (coursework 0–40, final 0–60). */
export class GradeValidationError extends Error {
  constructor(public messageAr: string, public messageEn: string) {
    super(messageEn);
  }
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
    caller?: { id: string; nameAr: string; nameEn: string; role: UserRole },
    /** Sections the student picked; otherwise any section of each course. */
    offeringIds?: string[],
    options: RegistrationOptions = {}
  ): Promise<RegistrationTxResult & { waived?: RegistrationIssueCode[] }> {
    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Fetch live student record
        const studentRow = await tx.student.findUnique({
          where: { id: studentId },
          include: STUDENT_INCLUDE,
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
        // Prefer the picked section of each course.
        const chosenRows = courseCodes
          .map(code => offeringRows.find(o => o.course.code === code && offeringIds?.includes(o.id)) || offeringRows.find(o => o.course.code === code))
          .filter((o): o is (typeof offeringRows)[number] => !!o);
        const offeringMap = new Map<string, CourseOffering>(
          chosenRows.map(o => [o.course.code, OfferingRepository.mapToDomain(o)])
        );

        // 3. Deterministic Bylaws Validation
        const validation = AcademicRulesEngine.validateRegistration(
          student,
          courseCodes,
          allCoursesMap,
          offeringMap,
          isSummer
        );

        // Problems the caller found (e.g. a timetable clash) count like the bylaw's own.
        for (const issue of options.extraIssues || []) {
          validation.errorsAr.push(issue.ar);
          validation.errorsEn.push(issue.en);
          (validation.issueCodes ||= []).push(issue.code);
          validation.valid = false;
        }

        // An administrator's exception covers every problem except the hard ones.
        const codes = validation.issueCodes || [];
        const waived = options.override ? [...new Set(codes.filter(c => !HARD_ISSUES.includes(c)))] : [];
        const blocking = options.override ? codes.filter(c => HARD_ISSUES.includes(c)) : codes;
        if (!validation.valid && (blocking.length > 0 || !options.override || codes.length === 0)) {
          return {
            success: false,
            validation,
          };
        }

        // 4. Atomic seat reservation & record creation
        for (const code of courseCodes) {
          const offRow = chosenRows.find(o => o.course.code === code);
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
              registeredByName: options.registeredByName || null,
              note: options.note || (waived.length ? `استثناء من مدير النظام: ${options.overrideReason || ''}`.trim() : null),
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

        const exceptionAr = waived.length
          ? ` باستثناء من مدير النظام (${waived.join('، ')})${options.overrideReason ? `: ${options.overrideReason}` : ''}`
          : '';
        const exceptionEn = waived.length
          ? ` as an administrator exception (${waived.join(', ')})${options.overrideReason ? `: ${options.overrideReason}` : ''}`
          : '';
        const forStudentAr = actorRole === 'STUDENT' ? '' : ` للطالب ${student.nameAr}`;
        const forStudentEn = actorRole === 'STUDENT' ? '' : ` for ${student.nameEn}`;

        await tx.auditLog.create({
          data: {
            userId: validActorUserId,
            userName: actorName,
            userRole: actorRole as any,
            action: options.auditAction || (waived.length ? 'REGISTER_COURSES_EXCEPTION' : 'REGISTER_COURSES'),
            entity: 'CourseRegistration',
            entityId: student.id,
            detailsAr: `تسجيل المقررات (${courseCodes.join(', ')}) بإجمالي ${totalNewCredits} ساعة معتمدة${forStudentAr}${exceptionAr}.`,
            detailsEn: `Registered courses (${courseCodes.join(', ')}) totaling ${totalNewCredits} credits${forStudentEn}${exceptionEn}.`,
            after: JSON.stringify({ courseCodes, offeringIds: chosenRows.map(o => o.id), totalCredits: totalNewCredits, waived, reason: options.overrideReason || undefined }),
          },
        });

        const updatedRow = await tx.student.findUnique({
          where: { id: studentId },
          include: STUDENT_INCLUDE,
        });

        return {
          success: true,
          validation,
          waived,
          updatedStudent: StudentRepository.mapToDomain(updatedRow),
        };
      });
    } catch (err: any) {
      console.warn(`[AcademicTransactionService] DB transaction fallback for ${studentId}:`, err);
      const memStudent = await StudentRepository.findById(studentId);
      if (!memStudent) {
        throw new Error(`Student ${studentId} not found`);
      }
      const allCourses = await CourseRepository.getAll();
      const allCoursesMap = new Map<string, Course>(allCourses.map(c => [c.code, c]));
      const allOfferings = await OfferingRepository.getAll();
      const offeringMap = new Map<string, CourseOffering>(allOfferings.map(o => [o.courseCode, o]));

      const validation = AcademicRulesEngine.validateRegistration(
        memStudent,
        courseCodes,
        allCoursesMap,
        offeringMap,
        isSummer
      );

      if (!validation.valid && !(options.override && (validation.issueCodes || []).every(c => !HARD_ISSUES.includes(c)))) {
        return { success: false, validation };
      }

      const totalNewCredits = courseCodes.reduce((sum, code) => {
        const c = allCoursesMap.get(code);
        return sum + (c ? c.credits : 3);
      }, 0);

      memStudent.enrolledCredits = (memStudent.enrolledCredits || 0) + totalNewCredits;
      memStudent.currentPlanStatus = 'Pending Review';

      for (const code of courseCodes) {
        const courseDef = allCoursesMap.get(code) || {
          id: `c_${code.replace(/\s+/g, '_')}`,
          code,
          nameAr: code,
          nameEn: code,
          credits: 3,
          level: 1,
          semester: 1,
          isMandatory: true,
          prerequisites: [],
          department: 'Computer Science',
        };
        const prevCount = memStudent.records.filter(r => r.courseCode === code).length;
        memStudent.records.push({
          courseCode: code,
          courseNameAr: courseDef.nameAr,
          courseNameEn: courseDef.nameEn,
          credits: courseDef.credits,
          status: 'IN_PROGRESS',
          semesterId: 'sem_fall_2026',
          semesterName: 'خريف 2026',
          attempt: prevCount + 1,
          attendancePercentage: 100,
        });
      }

      return {
        success: true,
        validation,
        updatedStudent: memStudent,
      };
    }
  }

  /**
   * Transactional Grade Submission:
   * Sets coursework (out of 40) and final marks (out of 60), applies attempt capping
   * according to bylaws, recalculates the cumulative GPA and the term's academic
   * warning (once per term), updates student stats, and logs the audit trail.
   */
  public static async updateCourseGrade(
    courseCode: string,
    studentId: string,
    courseworkMark: number,
    finalMark: number,
    instructorUser?: { id: string; nameAr: string; nameEn: string; role: UserRole }
  ): Promise<GradeUpdateTxResult & { warnedThisTerm?: boolean; dismissal?: boolean; termId?: string }> {
    const { courseworkMax, finalMax, total: maxTotal } = AcademicRulesEngine.markScheme();
    const cw = Number(courseworkMark);
    const fin = Number(finalMark);
    if (!Number.isFinite(cw) || cw < 0 || cw > courseworkMax) {
      throw new GradeValidationError(
        `درجة أعمال السنة يجب أن تكون بين 0 و${courseworkMax}.`,
        `The coursework mark must be between 0 and ${courseworkMax}.`
      );
    }
    if (!Number.isFinite(fin) || fin < 0 || fin > finalMax) {
      throw new GradeValidationError(
        `درجة الامتحان النهائي يجب أن تكون بين 0 و${finalMax}.`,
        `The final exam mark must be between 0 and ${finalMax}.`
      );
    }

    return await prisma.$transaction(async (tx) => {
      const studentRow = await tx.student.findUnique({
        where: { id: studentId },
        include: {
          user: true,
          records: { include: { course: true, offering: true } },
        },
      });

      if (!studentRow) throw new Error(`Student ${studentId} not found`);

      // The attempt being studied now (a retake has older records of the same course).
      const ofCourse = studentRow.records.filter(r => r.course.code === courseCode);
      const targetRecord =
        ofCourse.find(r => r.status === 'IN_PROGRESS' || r.status === 'ENROLLED') ||
        [...ofCourse].sort((a, b) => (b.attempt || 1) - (a.attempt || 1))[0];
      if (!targetRecord) throw new Error(`Course record for ${courseCode} not found for student ${studentId}`);

      const totalMark = cw + fin;
      const percent = maxTotal > 0 ? (totalMark / maxTotal) * 100 : 0;
      const rawGrade = calculatePercentageToGrade(percent);
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
          courseworkMark: cw,
          finalMark: fin,
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

      // 3. The term's academic warning, once per term: worked out from the counters
      // as they stood when this term's first grade came in.
      let termId = targetRecord.offering?.semesterId || null;
      if (!termId) {
        const current = await tx.semester.findFirst({ where: { isCurrent: true }, select: { id: true } });
        termId = current?.id || 'sem_current';
      }
      const sameTerm = studentRow.standingTermId === termId;
      const atTermStart = {
        warningCount: sameTerm ? studentRow.termStartWarnings ?? studentRow.warningCount : studentRow.warningCount,
        consecutiveWarnings: sameTerm ? studentRow.termStartConsecutive ?? studentRow.consecutiveWarnings : studentRow.consecutiveWarnings,
      };
      const standing = AcademicRulesEngine.warningsAfterTerm(atTermStart, gpaResult.gpa);
      const wasDismissal = AcademicRulesEngine.dismissalReached(studentRow);
      const nowDismissal = AcademicRulesEngine.dismissalReached(standing);

      // 4. Update Student Record (the "previous GPA" is the one the term started with)
      await tx.student.update({
        where: { id: studentId },
        data: {
          ...(sameTerm ? {} : { previousGpa: studentRow.cumulativeGpa }),
          cumulativeGpa: gpaResult.gpa,
          completedCredits: passedCredits,
          warningCount: standing.warningCount,
          consecutiveWarnings: standing.consecutiveWarnings,
          standingTermId: termId,
          termStartWarnings: atTermStart.warningCount,
          termStartConsecutive: atTermStart.consecutiveWarnings,
        },
      });

      // 5. Audit Log in same transaction
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
          detailsAr: `رصد درجات مقرر ${courseCode} للطالب ${studentRow.user.nameAr}: أعمال سنة ${cw} من ${courseworkMax} + نهائي ${fin} من ${finalMax} = ${totalMark} (تقدير: ${cappedGrade.grade}). المعدل التراكمي الجديد: ${gpaResult.gpa}، الإنذارات ${standing.warningCount} (متتالية ${standing.consecutiveWarnings}).`,
          detailsEn: `Graded ${courseCode} for ${studentRow.user.nameEn}: coursework ${cw}/${courseworkMax} + final ${fin}/${finalMax} = ${totalMark} (${cappedGrade.grade}). New GPA: ${gpaResult.gpa}; warnings ${standing.warningCount} (${standing.consecutiveWarnings} consecutive).`,
          before: JSON.stringify(beforeSnapshot),
          after: JSON.stringify({
            totalMark,
            grade: cappedGrade.grade,
            gradePoints: cappedGrade.points,
            cumulativeGpa: gpaResult.gpa,
            warningCount: standing.warningCount,
            consecutiveWarnings: standing.consecutiveWarnings,
          }),
        },
      });

      const updatedRow = await tx.student.findUnique({
        where: { id: studentId },
        include: STUDENT_INCLUDE,
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
        warnedThisTerm: standing.warned,
        dismissal: nowDismissal && !wasDismissal,
        termId,
      };
    });
  }

  /**
   * Remove a course registered this term (no marks entered yet): frees the seat
   * and the student's credit hours. Used by the advisor or administrator.
   */
  public static async dropCourse(
    studentId: string,
    offeringOrCourse: string,
    caller: { id: string; nameAr: string; nameEn: string; role: UserRole },
    reason = ''
  ): Promise<{ success: boolean; courseCode?: string; messageAr: string; messageEn: string; updatedStudent?: Student }> {
    return await prisma.$transaction(async (tx) => {
      const record = await tx.courseRecord.findFirst({
        where: {
          studentId,
          status: { in: ['IN_PROGRESS', 'ENROLLED'] },
          OR: [{ offeringId: offeringOrCourse }, { course: { code: offeringOrCourse } }, { id: offeringOrCourse }],
        },
        include: { course: true, student: { include: { user: true } } },
      });
      if (!record) {
        return { success: false, messageAr: 'المقرر غير مسجل للطالب هذا الفصل.', messageEn: 'The course is not registered for this student this term.' };
      }
      if (record.courseworkMark !== null || record.finalMark !== null || record.gradePoints !== null) {
        return {
          success: false,
          courseCode: record.course.code,
          messageAr: 'رُصدت درجات لهذا المقرر، فلا يمكن حذفه من التسجيل.',
          messageEn: 'Marks have been entered for this course, so it cannot be removed.',
        };
      }
      await tx.courseRecord.delete({ where: { id: record.id } });
      if (record.offeringId) {
        await tx.courseOffering.updateMany({ where: { id: record.offeringId, enrolledCount: { gt: 0 } }, data: { enrolledCount: { decrement: 1 } } });
      }
      const credits = record.course.credits;
      await tx.student.update({
        where: { id: studentId },
        data: { enrolledCredits: Math.max(0, (record.student.enrolledCredits || 0) - credits) },
      });
      const actor = await tx.user.findUnique({ where: { id: caller.id }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          userId: actor?.id || null,
          userName: caller.nameAr,
          userRole: caller.role as any,
          action: 'DROP_COURSE_ON_BEHALF',
          entity: 'CourseRegistration',
          entityId: studentId,
          detailsAr: `حذف مقرر ${record.course.code} (${record.course.nameAr}) من تسجيل الطالب ${record.student.user.nameAr}${reason ? `: ${reason}` : ''}.`,
          detailsEn: `Removed ${record.course.code} (${record.course.nameEn}) from ${record.student.user.nameEn}'s registration${reason ? `: ${reason}` : ''}.`,
          before: JSON.stringify({ courseCode: record.course.code, offeringId: record.offeringId }),
        },
      });
      const updatedRow = await tx.student.findUnique({ where: { id: studentId }, include: STUDENT_INCLUDE });
      return {
        success: true,
        courseCode: record.course.code,
        messageAr: `حُذف ${record.course.code} من تسجيل الطالب.`,
        messageEn: `${record.course.code} was removed from the student's registration.`,
        updatedStudent: StudentRepository.mapToDomain(updatedRow),
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
