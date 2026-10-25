import { Course, PlannedSemester, StudyPlan, Student } from '../../src/types/index.js';
import { AcademicRulesEngine } from './rulesEngine.js';

export interface PlanOptions {
  pace: 'NORMAL' | 'LIGHT' | 'HEAVY' | 'INCLUDE_SUMMER';
  startSemesterNameAr?: string;
  startSemesterNameEn?: string;
}

export interface PlanValidationReport {
  valid: boolean;
  errors: string[];
  totalCredits: number;
}

export class StudyPlanner {
  /**
   * Generates a fully legal, semester-by-semester graduation study plan.
   * NEVER schedules a course before its prerequisites are met.
   */
  public static generateStudyPlan(
    student: Student,
    allCourses: Course[],
    options: PlanOptions = { pace: 'NORMAL' }
  ): StudyPlan {
    return this.generatePlan(student, allCourses, options);
  }

  public static generatePlan(
    student: Student,
    allCourses: Course[],
    options: PlanOptions = { pace: 'NORMAL' }
  ): StudyPlan {
    const passedCodes = new Set(
      student.records.filter(r => r.status === 'PASSED').map(r => r.courseCode)
    );
    const failedCodes = new Set(
      student.records.filter(r => r.status === 'FAILED').map(r => r.courseCode)
    );

    // Filter candidate courses not yet passed
    const remainingCourses = allCourses.filter(c => {
      if (passedCodes.has(c.code)) return false;
      if (c.track && c.track !== 'General' && c.track !== student.track) return false;
      return true;
    });

    // Pacing rules
    let maxCreditsPerSemester = 18;
    if (options.pace === 'LIGHT') maxCreditsPerSemester = 15;
    else if (options.pace === 'HEAVY') maxCreditsPerSemester = 21;
    else if (student.cumulativeGpa < 2.0) maxCreditsPerSemester = 15;

    const simulatedPassed = new Set(passedCodes);
    let simulatedCompletedCredits = student.completedCredits;
    let pendingCourses = [...remainingCourses];

    const plannedSemesters: PlannedSemester[] = [];
    let semesterIndex = 1;
    const currentYear = new Date().getFullYear();

    const semesterNamesAr = ['خريف', 'ربيع', 'صيف'];
    const semesterNamesEn = ['Fall', 'Spring', 'Summer'];

    let currentTerm = 0; // 0 = Fall, 1 = Spring, 2 = Summer
    let yearOffset = 0;

    while (pendingCourses.length > 0 && semesterIndex <= 12) {
      const isSummer = options.pace === 'INCLUDE_SUMMER' && currentTerm === 2;
      const termLimit = isSummer ? (student.cumulativeGpa >= 3.0 ? 9 : 6) : maxCreditsPerSemester;

      const semesterCourses: {
        courseCode: string;
        courseNameAr: string;
        courseNameEn: string;
        credits: number;
        isRetake: boolean;
        isMandatory: boolean;
      }[] = [];

      let semesterCredits = 0;

      // Sort pending: Retakes first, then lower levels, then unlock potential
      pendingCourses.sort((a, b) => {
        const aRetake = failedCodes.has(a.code) ? 1 : 0;
        const bRetake = failedCodes.has(b.code) ? 1 : 0;
        if (bRetake !== aRetake) return bRetake - aRetake;
        return a.level - b.level;
      });

      const nextPending: Course[] = [];

      for (const course of pendingCourses) {
        // STRICT: Verify prerequisites are in simulatedPassed
        const prereqs = course.prerequisites || [];
        const prereqsMet = prereqs.every(p => simulatedPassed.has(p));

        // STRICT: Verify graduation project eligibility (>= 70% hours = 94 credits)
        const isGradProject = course.code === 'CS 498' || course.code === 'CS 499';
        const gradProjectEligible = simulatedCompletedCredits >= Math.ceil(134 * 0.70);

        if (
          prereqsMet &&
          (!isGradProject || gradProjectEligible) &&
          semesterCredits + course.credits <= termLimit
        ) {
          semesterCourses.push({
            courseCode: course.code,
            courseNameAr: course.nameAr,
            courseNameEn: course.nameEn,
            credits: course.credits,
            isRetake: failedCodes.has(course.code),
            isMandatory: course.isMandatory,
          });
          semesterCredits += course.credits;
        } else {
          nextPending.push(course);
        }
      }

      // Mark scheduled courses as passed in future simulation
      for (const sc of semesterCourses) {
        simulatedPassed.add(sc.courseCode);
        simulatedCompletedCredits += sc.credits;
      }

      if (semesterCourses.length > 0) {
        const termNameAr = `${semesterNamesAr[currentTerm]} ${currentYear + yearOffset}`;
        const termNameEn = `${semesterNamesEn[currentTerm]} ${currentYear + yearOffset}`;

        plannedSemesters.push({
          semesterIndex,
          semesterNameAr: termNameAr,
          semesterNameEn: termNameEn,
          type: currentTerm === 0 ? 'FALL' : currentTerm === 1 ? 'SPRING' : 'SUMMER',
          courses: semesterCourses,
          totalCredits: semesterCredits,
          expectedGpa: Math.min(4.0, Math.max(2.0, student.cumulativeGpa + 0.15)),
          riskNoteAr: semesterCredits > 18 ? 'عبء دراسي مرتفع يتطلب جهداً مضاعفاً' : undefined,
          riskNoteEn: semesterCredits > 18 ? 'High academic load requiring dedicated focus' : undefined,
        });

        semesterIndex++;
      } else {
        break; // No further eligible courses can be scheduled
      }

      // Advance semester term
      if (options.pace === 'INCLUDE_SUMMER') {
        currentTerm = (currentTerm + 1) % 3;
        if (currentTerm === 0) yearOffset++;
      } else {
        currentTerm = currentTerm === 0 ? 1 : 0;
        if (currentTerm === 0) yearOffset++;
      }

      pendingCourses = nextPending;

      if (simulatedCompletedCredits >= AcademicRulesEngine.TOTAL_DEGREE_CREDITS || nextPending.length === 0) {
        break;
      }
    }

    const lastSem = plannedSemesters[plannedSemesters.length - 1];
    const totalPlanned = plannedSemesters.reduce((acc, s) => acc + s.totalCredits, 0);

    return {
      id: `plan_${student.id}_${Date.now()}`,
      studentId: student.id,
      status: student.currentPlanStatus || 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      semesters: plannedSemesters,
      expectedGraduationSemesterAr: lastSem ? lastSem.semesterNameAr : 'ربيع 2027',
      expectedGraduationSemesterEn: lastSem ? lastSem.semesterNameEn : 'Spring 2027',
      totalPlannedCredits: totalPlanned,
    };
  }

  /**
   * Automated Plan Validator: Strictly validates a generated study plan to ensure
   * NO course violates prerequisites, credit limits, or graduation rules.
   */
  public static validateGeneratedPlan(
    plan: StudyPlan,
    student: Student,
    coursesMap: Map<string, Course>
  ): PlanValidationReport {
    const errors: string[] = [];
    const passedSet = new Set(
      student.records.filter(r => r.status === 'PASSED').map(r => r.courseCode)
    );
    let runningCredits = student.completedCredits;

    for (const sem of plan.semesters) {
      // 1. Check max credits in semester
      const maxTermLimit = sem.type === 'SUMMER' ? 9 : 21;
      if (sem.totalCredits > maxTermLimit) {
        errors.push(`Semester ${sem.semesterIndex} exceeds max limit: ${sem.totalCredits} > ${maxTermLimit}`);
      }

      // 2. Check each course in semester
      for (const c of sem.courses) {
        const courseDef = coursesMap.get(c.courseCode);
        if (courseDef?.prerequisites) {
          for (const prereq of courseDef.prerequisites) {
            if (!passedSet.has(prereq)) {
              errors.push(
                `Prerequisite violation in Semester ${sem.semesterIndex}: Course ${c.courseCode} scheduled before passing ${prereq}`
              );
            }
          }
        }

        // Check graduation project eligibility
        if (c.courseCode === 'CS 498' || c.courseCode === 'CS 499') {
          if (runningCredits < Math.ceil(134 * 0.70)) {
            errors.push(
              `Graduation project ${c.courseCode} scheduled when running hours (${runningCredits}) < 94`
            );
          }
        }
      }

      // Add to passedSet for subsequent semesters
      for (const c of sem.courses) {
        passedSet.add(c.courseCode);
        runningCredits += c.credits;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      totalCredits: plan.totalPlannedCredits,
    };
  }
}
