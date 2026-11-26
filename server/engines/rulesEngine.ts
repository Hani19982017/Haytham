import { Course, Student, CourseOffering, AcademicRuleConfig } from '../../src/types/index.js';

/**
 * Why a registration check failed, one code per error line:
 * NOT_FOUND / ALREADY_TAKING can never be approved as an exception; the others
 * an administrator may approve for a student, with a reason (see `WAIVABLE_ISSUES`).
 */
export type RegistrationIssueCode =
  | 'NOT_FOUND'
  | 'ALREADY_TAKING'
  | 'ALREADY_PASSED'
  | 'PREREQUISITE'
  | 'GRAD_PROJECT_HOURS'
  | 'SECTION_FULL'
  | 'CREDIT_LIMIT'
  | 'TIME_CLASH'
  | 'DISMISSED';

export interface ValidationResult {
  valid: boolean;
  errorsAr: string[];
  errorsEn: string[];
  /** One code for each line of `errorsAr` / `errorsEn`, in the same order. */
  issueCodes?: RegistrationIssueCode[];
  warningsAr: string[];
  warningsEn: string[];
  maxAllowedCredits: number;
}

export class AcademicRulesEngine {
  public static TOTAL_DEGREE_CREDITS = 134;
  public static MIN_CUMULATIVE_GPA = 2.0;
  public static MIN_GRAD_PROJECT_PERCENTAGE = 0.70; // 70% of 134 = 93.8 -> 94 hrs
  public static MIN_TRAINING_CREDITS = 30;
  /** Field training: two periods of 120 hours, counted once the advisor accepts the proof. */
  public static TRAINING_REQUIRED_HOURS = 240;
  /** Dismissal: 4 consecutive warnings OR 6 warnings in all (not necessarily in a row). */
  public static DISMISSAL_CONSECUTIVE_WARNINGS = 4;
  public static DISMISSAL_TOTAL_WARNINGS = 6;
  public static SPECIAL_RULE_PERCENTAGE = 0.80; // 80% of 134 = 107.2 hrs
  /** Marks: coursework out of 40 and the final exam out of 60 (total 100). */
  public static COURSEWORK_MAX_MARK = 40;
  public static FINAL_EXAM_MAX_MARK = 60;
  /** Equivalency of transfer students: lowest percentage credited, and the share of the degree that may be credited. */
  public static EQUIVALENCY_MIN_PERCENT = 60;
  public static EQUIVALENCY_MAX_CREDITS_PERCENT = 50;

  /** Problems an administrator may approve as an exception when registering for a student. */
  public static readonly WAIVABLE_ISSUES: RegistrationIssueCode[] = [
    'PREREQUISITE',
    'GRAD_PROJECT_HOURS',
    'SECTION_FULL',
    'CREDIT_LIMIT',
    'TIME_CLASH',
    'DISMISSED',
  ];

  /** Take the bylaw values the administrator set on the rules page. */
  public static applyRules(rules: Pick<AcademicRuleConfig, 'key' | 'value'>[]): void {
    const num = (key: string, min: number, max: number): number | undefined => {
      const rule = rules.find(r => r.key === key);
      const value = Number(rule?.value);
      return rule && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
    };
    this.TOTAL_DEGREE_CREDITS = num('TOTAL_DEGREE_CREDITS', 60, 250) ?? this.TOTAL_DEGREE_CREDITS;
    this.MIN_CUMULATIVE_GPA = num('MIN_GRADUATION_GPA', 0.5, 4) ?? this.MIN_CUMULATIVE_GPA;
    this.DISMISSAL_CONSECUTIVE_WARNINGS = num('DISMISSAL_CONSECUTIVE_WARNINGS', 1, 20) ?? this.DISMISSAL_CONSECUTIVE_WARNINGS;
    this.DISMISSAL_TOTAL_WARNINGS = num('DISMISSAL_TOTAL_WARNINGS', 1, 30) ?? this.DISMISSAL_TOTAL_WARNINGS;
    this.COURSEWORK_MAX_MARK = num('COURSEWORK_MAX_MARK', 0, 100) ?? this.COURSEWORK_MAX_MARK;
    this.FINAL_EXAM_MAX_MARK = num('FINAL_EXAM_MAX_MARK', 1, 100) ?? this.FINAL_EXAM_MAX_MARK;
    this.EQUIVALENCY_MIN_PERCENT = num('EQUIVALENCY_MIN_PERCENT', 0, 100) ?? this.EQUIVALENCY_MIN_PERCENT;
    this.EQUIVALENCY_MAX_CREDITS_PERCENT = num('EQUIVALENCY_MAX_CREDITS_PERCENT', 1, 100) ?? this.EQUIVALENCY_MAX_CREDITS_PERCENT;
    this.TRAINING_REQUIRED_HOURS = num('TRAINING_REQUIRED_HOURS', 1, 2000) ?? this.TRAINING_REQUIRED_HOURS;
  }

  /** The marks scheme instructors enter grades with. */
  public static markScheme(): { courseworkMax: number; finalMax: number; total: number } {
    return {
      courseworkMax: this.COURSEWORK_MAX_MARK,
      finalMax: this.FINAL_EXAM_MAX_MARK,
      total: this.COURSEWORK_MAX_MARK + this.FINAL_EXAM_MAX_MARK,
    };
  }

  /**
   * A student in their first term: no graded course yet (courses in progress
   * are fine). They have no GPA, so GPA-based rules do not apply to them.
   */
  public static isNewStudent(student: Pick<Student, 'completedCredits' | 'records'>): boolean {
    return (student.completedCredits || 0) === 0 && !student.records.some(r => r.status === 'PASSED' || r.status === 'FAILED');
  }

  /**
   * A freshman in the first term of level 1: the bylaw's first-term courses are
   * registered for them automatically, and they do not build a schedule themselves.
   * (A transfer student starts from their equivalency instead.)
   */
  public static isFreshman(student: Pick<Student, 'completedCredits' | 'records' | 'level'> & { admissionType?: string }): boolean {
    return (student.level || 1) <= 1 && student.admissionType !== 'TRANSFER' && this.isNewStudent(student);
  }

  /** 4 consecutive warnings, or 6 warnings in all (separate). */
  public static dismissalReached(student: Pick<Student, 'warningCount' | 'consecutiveWarnings'>): boolean {
    return (
      (student.consecutiveWarnings || 0) >= this.DISMISSAL_CONSECUTIVE_WARNINGS ||
      (student.warningCount || 0) >= this.DISMISSAL_TOTAL_WARNINGS
    );
  }

  /** One more warning would reach either dismissal limit. */
  public static oneWarningFromDismissal(student: Pick<Student, 'warningCount' | 'consecutiveWarnings'>): boolean {
    return (
      !this.dismissalReached(student) &&
      ((student.consecutiveWarnings || 0) >= this.DISMISSAL_CONSECUTIVE_WARNINGS - 1 ||
        (student.warningCount || 0) >= this.DISMISSAL_TOTAL_WARNINGS - 1)
    );
  }

  /** Has the student finished enough of the degree for the final-chance rule instead of dismissal? */
  public static finalChanceEligible(student: Pick<Student, 'completedCredits'>): boolean {
    return (student.completedCredits || 0) / this.TOTAL_DEGREE_CREDITS >= this.SPECIAL_RULE_PERCENTAGE;
  }

  /**
   * The warning counters once a term's results are in. A term ending under the
   * minimum GPA adds one warning (and one to the run of consecutive warnings); a
   * term ending at or above it ends the run. Worked out from the counters at the
   * start of the term, so entering a term's grades one course at a time (or again)
   * still gives exactly one warning for that term.
   */
  public static warningsAfterTerm(
    atTermStart: { warningCount: number; consecutiveWarnings: number },
    gpaNow: number
  ): { warningCount: number; consecutiveWarnings: number; warned: boolean } {
    const warned = gpaNow < this.MIN_CUMULATIVE_GPA;
    return warned
      ? { warningCount: atTermStart.warningCount + 1, consecutiveWarnings: atTermStart.consecutiveWarnings + 1, warned }
      : { warningCount: atTermStart.warningCount, consecutiveWarnings: 0, warned };
  }

  /** Passing grades low enough that the course may be studied again to raise the GPA (D+, D, D-). */
  public static readonly IMPROVEMENT_RETAKE_GRADES = ['D+', 'D', 'D-'];

  /** Is the student already studying this course this term? */
  public static isTakingNow(student: Pick<Student, 'records'>, courseCode: string): boolean {
    return student.records.some(r => r.courseCode === courseCode && (r.status === 'IN_PROGRESS' || r.status === 'ENROLLED'));
  }

  /** May a course passed with this grade be retaken to improve the GPA? */
  public static canRetakePassedGrade(grade?: string | null): boolean {
    return !grade || this.IMPROVEMENT_RETAKE_GRADES.includes(grade);
  }

  /**
   * Determine maximum allowed credits for a student in a regular semester
   */
  public static getMaxCredits(student: Student, isSummer: boolean = false): number {
    const isNewStudent = this.isNewStudent(student);

    if (isSummer) {
      return student.cumulativeGpa >= 3.0 ? 9 : 6;
    }

    if (isNewStudent) {
      return 21;
    }

    if (student.cumulativeGpa >= 3.0) {
      return 21;
    } else if (student.cumulativeGpa >= 2.0) {
      return 18;
    } else if (student.cumulativeGpa >= 1.0) {
      return 15;
    } else {
      return 12;
    }
  }

  /**
   * Validate a planned or submitted course registration against all bylaws
   */
  public static validateRegistration(
    student: Student,
    selectedCourseCodes: string[],
    allCourses: Map<string, Course>,
    offerings: Map<string, CourseOffering>,
    isSummer: boolean = false
  ): ValidationResult {
    const errorsAr: string[] = [];
    const errorsEn: string[] = [];
    const issueCodes: RegistrationIssueCode[] = [];
    const warningsAr: string[] = [];
    const warningsEn: string[] = [];
    const fail = (code: RegistrationIssueCode, ar: string, en: string) => {
      errorsAr.push(ar);
      errorsEn.push(en);
      issueCodes.push(code);
    };

    const maxAllowedCredits = this.getMaxCredits(student, isSummer);
    const minCredits = isSummer ? 2 : 9;

    let totalRequestedCredits = 0;
    const passedCourseCodes = new Set(
      student.records.filter(r => r.status === 'PASSED').map(r => r.courseCode)
    );

    // 1. Check each course
    for (const code of selectedCourseCodes) {
      const course = allCourses.get(code);
      if (!course) {
        fail('NOT_FOUND', `المقرر ${code} غير موجود في اللائحة.`, `Course ${code} is not recognized in program bylaws.`);
        continue;
      }

      totalRequestedCredits += course.credits;

      if (AcademicRulesEngine.isTakingNow(student, code)) {
        fail('ALREADY_TAKING', `أنت مسجل بالفعل في مقرر ${course.nameAr} (${code}) هذا الفصل.`, `You are already registered in ${course.nameEn} (${code}) this term.`);
        continue;
      }

      // Check if already passed and not allowed to retake (only D+/D/D- may be retaken to improve the GPA)
      const passedRecord = student.records.find(r => r.courseCode === code && r.status === 'PASSED');
      if (passedRecord && !AcademicRulesEngine.canRetakePassedGrade(passedRecord.grade)) {
        fail('ALREADY_PASSED', `لقد اجتزت بالفعل مقرر ${course.nameAr} (${code}) بتقدير (${passedRecord.grade}) ولا يجوز إعادته.`, `You have already passed ${course.nameEn} (${code}) with grade ${passedRecord.grade} and cannot retake it.`);
      }

      // 2. Prerequisite Check
      if (course.prerequisites && course.prerequisites.length > 0) {
        for (const prereq of course.prerequisites) {
          if (!passedCourseCodes.has(prereq)) {
            const prereqCourse = allCourses.get(prereq);
            const prereqName = prereqCourse ? prereqCourse.nameAr : prereq;
            fail('PREREQUISITE', `لا يمكنك تسجيل ${course.nameAr} (${code}) لأن المتطلب السابق (${prereqName} - ${prereq}) لم يتم اجتيازه بنجاح.`, `Cannot register ${course.nameEn} (${code}) because prerequisite (${prereq}) is not passed.`);
          }
        }
      }

      // 3. Graduation Project Check
      if (code === 'CS 498' || code === 'CS 499' || course.nameEn.toLowerCase().includes('graduation project')) {
        const requiredHours = Math.ceil(this.TOTAL_DEGREE_CREDITS * this.MIN_GRAD_PROJECT_PERCENTAGE);
        if (student.completedCredits < requiredHours) {
          fail('GRAD_PROJECT_HOURS', `مشروع التخرج يتطلب إنجاز 70% على الأقل من ساعات التخرج (${requiredHours} ساعة). رصيدك الحالي (${student.completedCredits} ساعة).`, `Graduation Project requires completing at least 70% of degree hours (${requiredHours} hrs). You currently have ${student.completedCredits} hrs.`);
        }
      }

      // 4. Offering & Seat Availability Check
      const offering = offerings.get(code);
      if (offering) {
        if (offering.enrolledCount >= offering.capacity) {
          fail('SECTION_FULL', `المقرر ${course.nameAr} (${code}) ممتلئ بالكامل (السعة: ${offering.capacity}/${offering.enrolledCount}).`, `Course ${course.nameEn} (${code}) is full (Capacity: ${offering.capacity}/${offering.enrolledCount}).`);
        }
      }
    }

    // 5. Total Credit Limit Check
    if (totalRequestedCredits > maxAllowedCredits) {
      fail('CREDIT_LIMIT', `مجموع الساعات المطلوبة (${totalRequestedCredits} ساعة) يتجاوز الحد الأقصى المسموح به لمعدلك التراكمي (${maxAllowedCredits} ساعة).`, `Total requested credits (${totalRequestedCredits}) exceeds maximum allowed load for your GPA (${maxAllowedCredits} credits).`);
    }

    // 6. Minimum Load Warning/Error
    if (totalRequestedCredits > 0 && totalRequestedCredits < minCredits) {
      if (student.remainingCredits <= totalRequestedCredits) {
        warningsAr.push(`تنبيه: الساعات المسجلة (${totalRequestedCredits}) أقل من الحد الأدنى (${minCredits})، ولكن مسموح بها كفصل تخرج.`);
        warningsEn.push(`Notice: Registered credits (${totalRequestedCredits}) below minimum (${minCredits}), permitted as final graduation semester.`);
      } else {
        warningsAr.push(`تنبيه: الحد الأدنى المعتاد للتسجيل في الفصل الدراسي هو ${minCredits} ساعات معتمدة.`);
        warningsEn.push(`Warning: Typical minimum semester registration is ${minCredits} credit hours.`);
      }
    }

    // 7. Academic Warning Status
    if (student.warningCount > 0) {
      warningsAr.push(`تنبيه أكاديمي: لديك (${student.warningCount}) إنذارات أكاديمية سابقة. يجب التركيز على رفع المعدل فوق 2.0.`);
      warningsEn.push(`Academic Warning: You have ${student.warningCount} previous academic warnings. Focus on raising GPA above 2.0.`);
    }

    return {
      valid: errorsAr.length === 0,
      errorsAr,
      errorsEn,
      issueCodes,
      warningsAr,
      warningsEn,
      maxAllowedCredits,
    };
  }

  /**
   * Evaluate academic warning status and potential dismissal
   * (4 consecutive warnings OR 6 warnings in all).
   */
  public static evaluateStudentStatus(student: Student): {
    status: 'GOOD_STANDING' | 'WARNING' | 'CRITICAL_DISMISSAL_RISK' | 'DISMISSAL_ELIGIBLE' | 'GRADUATION_FINAL_CHANCE';
    messageAr: string;
    messageEn: string;
  } {
    const consecutiveLimit = this.DISMISSAL_CONSECUTIVE_WARNINGS;
    const totalLimit = this.DISMISSAL_TOTAL_WARNINGS;

    if (this.dismissalReached(student)) {
      if (this.finalChanceEligible(student)) {
        return {
          status: 'GRADUATION_FINAL_CHANCE',
          messageAr: 'تطبيق بند فرصة التخرج الاستثنائية: الطالب أنجز أكثر من 80% من الساعات ويمنح فرصة نهائية تحت إشراف لجنة الإرشاد.',
          messageEn: 'Special Graduation Final-Chance Rule: Student completed >80% hours and is granted a final supervised semester.',
        };
      }
      const byConsecutive = student.consecutiveWarnings >= consecutiveLimit;
      return {
        status: 'DISMISSAL_ELIGIBLE',
        messageAr: `تنبيه فصل أكاديمي: ${byConsecutive ? `${student.consecutiveWarnings} إنذارات متتالية` : `${student.warningCount} إنذارات منفصلة`} — اللائحة تفصل الطالب عند ${consecutiveLimit} إنذارات متتالية أو ${totalLimit} إنذارات منفصلة.`,
        messageEn: `Dismissal: ${byConsecutive ? `${student.consecutiveWarnings} consecutive warnings` : `${student.warningCount} warnings in all`} — the bylaw dismisses at ${consecutiveLimit} consecutive or ${totalLimit} separate warnings.`,
      };
    }

    if (this.oneWarningFromDismissal(student)) {
      return {
        status: 'CRITICAL_DISMISSAL_RISK',
        messageAr: `خطر فصل وشيك: ${student.consecutiveWarnings} إنذارات متتالية و${student.warningCount} إجمالاً؛ إنذار واحد آخر يبلغ حد الفصل (${consecutiveLimit} متتالية أو ${totalLimit} منفصلة).`,
        messageEn: `Dismissal is one warning away: ${student.consecutiveWarnings} consecutive and ${student.warningCount} in all (limit: ${consecutiveLimit} consecutive or ${totalLimit} separate).`,
      };
    }

    if (student.cumulativeGpa < this.MIN_CUMULATIVE_GPA && !this.isNewStudent(student)) {
      return {
        status: 'WARNING',
        messageAr: `المعدل التراكمي (${student.cumulativeGpa}) أقل من الحد الأدنى (2.0). إنذار أكاديمي رقم ${student.warningCount}.`,
        messageEn: `Cumulative GPA (${student.cumulativeGpa}) is below minimum (2.0). Academic Warning #${student.warningCount}.`,
      };
    }

    return {
      status: 'GOOD_STANDING',
      messageAr: 'الوضع الأكاديمي سليم ومستقر.',
      messageEn: 'Academic standing is in good shape.',
    };
  }
}
