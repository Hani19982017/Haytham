import { Course, Student, CourseOffering } from '../../src/types/index.js';

export interface ValidationResult {
  valid: boolean;
  errorsAr: string[];
  errorsEn: string[];
  warningsAr: string[];
  warningsEn: string[];
  maxAllowedCredits: number;
}

export class AcademicRulesEngine {
  public static TOTAL_DEGREE_CREDITS = 134;
  public static MIN_CUMULATIVE_GPA = 2.0;
  public static MIN_GRAD_PROJECT_PERCENTAGE = 0.70; // 70% of 134 = 93.8 -> 94 hrs
  public static MIN_TRAINING_CREDITS = 30;
  public static DISMISSAL_CONSECUTIVE_WARNINGS = 4;
  public static DISMISSAL_TOTAL_WARNINGS = 6;
  public static SPECIAL_RULE_PERCENTAGE = 0.80; // 80% of 134 = 107.2 hrs

  /**
   * Determine maximum allowed credits for a student in a regular semester
   */
  public static getMaxCredits(student: Student, isSummer: boolean = false): number {
    const isNewStudent = student.completedCredits === 0 && student.records.length === 0;

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
    const warningsAr: string[] = [];
    const warningsEn: string[] = [];

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
        errorsAr.push(`المقرر ${code} غير موجود في اللائحة.`);
        errorsEn.push(`Course ${code} is not recognized in program bylaws.`);
        continue;
      }

      totalRequestedCredits += course.credits;

      // Check if already passed and not allowed to retake (only F or D/D+ allows retake in credit hour systems)
      const passedRecord = student.records.find(r => r.courseCode === code && r.status === 'PASSED');
      if (passedRecord && passedRecord.grade && !['D', 'D-'].includes(passedRecord.grade)) {
        errorsAr.push(`لقد اجتزت بالفعل مقرر ${course.nameAr} (${code}) بتقدير (${passedRecord.grade}) ولا يجوز إعادته.`);
        errorsEn.push(`You have already passed ${course.nameEn} (${code}) with grade ${passedRecord.grade} and cannot retake it.`);
      }

      // 2. Prerequisite Check
      if (course.prerequisites && course.prerequisites.length > 0) {
        for (const prereq of course.prerequisites) {
          if (!passedCourseCodes.has(prereq)) {
            const prereqCourse = allCourses.get(prereq);
            const prereqName = prereqCourse ? prereqCourse.nameAr : prereq;
            errorsAr.push(`لا يمكنك تسجيل ${course.nameAr} (${code}) لأن المتطلب السابق (${prereqName} - ${prereq}) لم يتم اجتيازه بنجاح.`);
            errorsEn.push(`Cannot register ${course.nameEn} (${code}) because prerequisite (${prereq}) is not passed.`);
          }
        }
      }

      // 3. Graduation Project Check
      if (code === 'CS 498' || code === 'CS 499' || course.nameEn.toLowerCase().includes('graduation project')) {
        const requiredHours = Math.ceil(this.TOTAL_DEGREE_CREDITS * this.MIN_GRAD_PROJECT_PERCENTAGE);
        if (student.completedCredits < requiredHours) {
          errorsAr.push(`مشروع التخرج يتطلب إنجاز 70% على الأقل من ساعات التخرج (${requiredHours} ساعة). رصيدك الحالي (${student.completedCredits} ساعة).`);
          errorsEn.push(`Graduation Project requires completing at least 70% of degree hours (${requiredHours} hrs). You currently have ${student.completedCredits} hrs.`);
        }
      }

      // 4. Offering & Seat Availability Check
      const offering = offerings.get(code);
      if (offering) {
        if (offering.enrolledCount >= offering.capacity) {
          errorsAr.push(`المقرر ${course.nameAr} (${code}) ممتلئ بالكامل (السعة: ${offering.capacity}/${offering.enrolledCount}).`);
          errorsEn.push(`Course ${course.nameEn} (${code}) is full (Capacity: ${offering.capacity}/${offering.enrolledCount}).`);
        }
      }
    }

    // 5. Total Credit Limit Check
    if (totalRequestedCredits > maxAllowedCredits) {
      errorsAr.push(`مجموع الساعات المطلوبة (${totalRequestedCredits} ساعة) يتجاوز الحد الأقصى المسموح به لمعدلك التراكمي (${maxAllowedCredits} ساعة).`);
      errorsEn.push(`Total requested credits (${totalRequestedCredits}) exceeds maximum allowed load for your GPA (${maxAllowedCredits} credits).`);
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
      warningsAr,
      warningsEn,
      maxAllowedCredits,
    };
  }

  /**
   * Evaluate academic warning status and potential dismissal
   */
  public static evaluateStudentStatus(student: Student): {
    status: 'GOOD_STANDING' | 'WARNING' | 'CRITICAL_DISMISSAL_RISK' | 'DISMISSAL_ELIGIBLE' | 'GRADUATION_FINAL_CHANCE';
    messageAr: string;
    messageEn: string;
  } {
    const isSpecialRuleEligible = (student.completedCredits / this.TOTAL_DEGREE_CREDITS) >= this.SPECIAL_RULE_PERCENTAGE;

    if (student.consecutiveWarnings >= this.DISMISSAL_CONSECUTIVE_WARNINGS || student.warningCount >= this.DISMISSAL_TOTAL_WARNINGS) {
      if (isSpecialRuleEligible) {
        return {
          status: 'GRADUATION_FINAL_CHANCE',
          messageAr: 'تطبيق بند فرصة التخرج الاستثنائية: الطالب أنجز أكثر من 80% من الساعات ويمنح فرصة نهائية تحت إشراف لجنة الإرشاد.',
          messageEn: 'Special Graduation Final-Chance Rule: Student completed >80% hours and is granted a final supervised semester.',
        };
      }
      return {
        status: 'DISMISSAL_ELIGIBLE',
        messageAr: 'تنبيه فصل أكاديمي: استنفاد فرص الإنذار الأكاديمي (4 متتالية أو 6 إجمالية) حسب اللائحة التنفيذية.',
        messageEn: 'Dismissal Warning: Reached academic warning limit (4 consecutive or 6 total warnings).',
      };
    }

    if (student.cumulativeGpa < this.MIN_CUMULATIVE_GPA) {
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
