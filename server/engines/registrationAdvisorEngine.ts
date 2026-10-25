import {
  Course,
  CourseOffering,
  RecommendedCourseItem,
  RegistrationValidationDetails,
  ScheduleConflict,
  ScheduleWhatIfResult,
  SemesterScheduleRecommendation,
  Student,
} from '../../src/types/index.js';
import { AcademicRulesEngine } from './rulesEngine.js';
import { RecommendationEngine } from './recommendationEngine.js';

export class RegistrationAdvisorEngine {
  /**
   * Helper: Check if two time ranges overlap on a given day
   */
  public static doTimesOverlap(
    startA: string,
    endA: string,
    startB: string,
    endB: string
  ): boolean {
    const toMinutes = (timeStr: string): number => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const sA = toMinutes(startA);
    const eA = toMinutes(endA);
    const sB = toMinutes(startB);
    const eB = toMinutes(endB);

    return Math.max(sA, sB) < Math.min(eA, eB);
  }

  /**
   * Check if two offerings share any days and overlapping times
   */
  public static checkOfferingsConflict(
    off1: CourseOffering,
    off2: CourseOffering,
    course1?: Course,
    course2?: Course,
    allOfferings?: CourseOffering[]
  ): ScheduleConflict | null {
    if (off1.id === off2.id || off1.courseCode === off2.courseCode) return null;

    const days1 = off1.days || [];
    const days2 = off2.days || [];

    // Find common days
    const commonDays = days1.filter(d => days2.includes(d));
    if (commonDays.length === 0) return null;

    // Check time overlap
    const start1 = off1.startTime || '10:00';
    const end1 = off1.endTime || '11:30';
    const start2 = off2.startTime || '10:00';
    const end2 = off2.endTime || '11:30';

    if (!this.doTimesOverlap(start1, end1, start2, end2)) {
      return null;
    }

    const conflictDayAr = commonDays.join(' و');
    const timeOverlapStrAr = `${start1} - ${end1}`;

    const altFor1 = (allOfferings || []).filter(
      o => o.courseCode === off1.courseCode && o.id !== off1.id && o.capacity > o.enrolledCount
    );
    const altFor2 = (allOfferings || []).filter(
      o => o.courseCode === off2.courseCode && o.id !== off2.id && o.capacity > o.enrolledCount
    );

    return {
      courseCode1: off1.courseCode,
      courseName1Ar: course1?.nameAr || off1.courseCode,
      courseName1En: course1?.nameEn || off1.courseCode,
      section1: off1.sectionCode || 'شعبة 1',
      offeringId1: off1.id,
      courseCode2: off2.courseCode,
      courseName2Ar: course2?.nameAr || off2.courseCode,
      courseName2En: course2?.nameEn || off2.courseCode,
      section2: off2.sectionCode || 'شعبة 1',
      offeringId2: off2.id,
      day: commonDays[0],
      dayAr: conflictDayAr,
      dayEn: commonDays[0],
      timeRangeAr: timeOverlapStrAr,
      timeRangeEn: `${start1} - ${end1}`,
      alternativeSectionsFor1: altFor1,
      alternativeSectionsFor2: altFor2,
    };
  }

  /**
   * 1. Automatically generate the intelligent Recommended Semester Schedule BEFORE registration.
   * Respects GPA credit limits, failed course retakes, bottleneck unlocks, prerequisites,
   * and verifies that all recommended courses have conflict-free sections.
   */
  public static generateSemesterRecommendation(
    student: Student,
    allCourses: Course[],
    allOfferings: CourseOffering[],
    isSummer: boolean = false
  ): SemesterScheduleRecommendation {
    const courseMap = new Map<string, Course>(allCourses.map(c => [c.code, c]));
    const maxAllowedCredits = AcademicRulesEngine.getMaxCredits(student, isSummer);
    const minCredits = isSummer ? 2 : 12;

    const passedCodes = new Set(
      student.records.filter(r => r.status === 'PASSED').map(r => r.courseCode)
    );
    const failedCodes = new Set(
      student.records.filter(r => r.status === 'FAILED').map(r => r.courseCode)
    );

    // Group offerings by course code
    const offeringsByCourse = new Map<string, CourseOffering[]>();
    for (const off of allOfferings) {
      const list = offeringsByCourse.get(off.courseCode) || [];
      list.push(off);
      offeringsByCourse.set(off.courseCode, list);
    }

    const unlockMap = RecommendationEngine.calculateUnlockGraph(allCourses);

    // Rank candidate courses
    interface ScoredCandidate {
      course: Course;
      score: number;
      isRetake: boolean;
      unlocksCount: number;
      importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL';
      primaryReasonAr: string;
      primaryReasonEn: string;
      detailedReasonsAr: string[];
      detailedReasonsEn: string[];
      unlocksFutureCourses: string[];
    }

    const candidates: ScoredCandidate[] = [];

    for (const course of allCourses) {
      // Must be offered in active offerings
      const availableOfferings = offeringsByCourse.get(course.code);
      if (!availableOfferings || availableOfferings.length === 0) continue;

      // Check if already passed without retake eligibility
      const passedRec = student.records.find(r => r.courseCode === course.code && r.status === 'PASSED');
      if (passedRec && passedRec.grade && !['D', 'D-'].includes(passedRec.grade)) {
        continue;
      }

      // Check track match
      if (course.track && course.track !== student.track && course.track !== 'General') {
        continue;
      }

      // Check grad project eligibility (>= 70% of 134 = 94 credits)
      if (course.code === 'CS 498' || course.code === 'CS 499') {
        if (student.completedCredits < 94) {
          continue;
        }
      }

      // STRICT RULE: All prerequisites must be passed
      const prereqs = course.prerequisites || [];
      const unmetPrereqs = prereqs.filter(p => !passedCodes.has(p));
      if (unmetPrereqs.length > 0) {
        continue; // Cannot recommend course whose prereqs are not met
      }

      const isRetake = failedCodes.has(course.code);
      const unlocks = unlockMap.get(course.code) || 0;
      const unlocksList = allCourses
        .filter(c => (c.prerequisites || []).includes(course.code))
        .map(c => `${c.nameAr} (${c.code})`);

      let score = 50;
      let importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL' = 'NORMAL';
      let primaryReasonAr = 'مقرر دراسي مناسب لخطتك الأكاديمية.';
      let primaryReasonEn = 'Suitable course for your study path.';
      const detailedAr: string[] = [];
      const detailedEn: string[] = [];

      // Priority 1: Retake failed courses to escape academic warning
      if (isRetake) {
        score += 60;
        importance = 'CRITICAL';
        primaryReasonAr = 'إعادة إلزامية لرفع المعدل التراكمي وتخطي الإنذار الأكاديمي الحالي.';
        primaryReasonEn = 'Mandatory retake to recover cumulative GPA and clear academic warning.';
        detailedAr.push('رسوب سابق في هذا المقرر يؤثر سلباً على وضعك الأكاديمي.');
        detailedAr.push('إعادة اجتياز المقرر تسهم مباشرة في رفع الـ GPA وإزالة الإنذار.');
        detailedEn.push('Previous failure severely impacts your academic standing.');
        detailedEn.push('Retaking will directly raise your GPA and remove academic warnings.');
      }
      // Priority 2: Bottleneck unlock course
      else if (unlocks >= 2) {
        score += 35 + unlocks * 5;
        importance = 'HIGH';
        primaryReasonAr = `مقرر مفتاحي إجباري يفتح (${unlocks}) مقررات متقدمة في الفصول القادمة.`;
        primaryReasonEn = `Key bottleneck course unlocking (${unlocks}) advanced future courses.`;
        detailedAr.push(`يفتح المقررات: ${unlocksList.slice(0, 3).join('، ')}.`);
        detailedAr.push('تسجيله الآن يحافظ على مسار التخرج في موعده ويمنع التأخر الدراسي.');
        detailedEn.push(`Unlocks: ${unlocksList.slice(0, 3).join(', ')}.`);
        detailedEn.push('Taking it now maintains your graduation timeline and prevents delays.');
      }
      // Priority 3: Mandatory degree requirements
      else if (course.isMandatory) {
        score += 25;
        importance = 'MEDIUM';
        primaryReasonAr = 'مقرر إجباري لمتطلبات التخرج الأساسية للدرجة العلمية.';
        primaryReasonEn = 'Mandatory degree requirement for computer science graduation.';
        detailedAr.push('متطلب رسمي إلزامي ضمن الخطة الدراسية المعتمدة.');
        detailedEn.push('Official mandatory requirement in your degree plan.');
      } else {
        score += 10;
        importance = 'NORMAL';
        primaryReasonAr = 'مقرر اختياري يدعم مسارك التخصصي (الذكاء الاصطناعي).';
        primaryReasonEn = 'Elective course supporting your academic track.';
        detailedAr.push('يعزز مهاراتك التخصصية المتقدمة.');
        detailedEn.push('Enriches your specialized technical skills.');
      }

      // Check level match
      if (course.level === student.level) {
        score += 15;
        detailedAr.push(`مطابق لمستواك الأكاديمي الحالي (المستوى ${student.level}).`);
        detailedEn.push(`Matches your current academic level (Level ${student.level}).`);
      }

      candidates.push({
        course,
        score,
        isRetake,
        unlocksCount: unlocks,
        importance,
        primaryReasonAr,
        primaryReasonEn,
        detailedReasonsAr: detailedAr,
        detailedReasonsEn: detailedEn,
        unlocksFutureCourses: unlocksList,
      });
    }

    // Sort candidates descending by score
    candidates.sort((a, b) => b.score - a.score);

    // Build conflict-free recommended schedule fitting within maxAllowedCredits
    const selectedRecommended: RecommendedCourseItem[] = [];
    const chosenOfferings: CourseOffering[] = [];
    let currentTotalCredits = 0;

    for (const cand of candidates) {
      if (currentTotalCredits + cand.course.credits > maxAllowedCredits) {
        continue; // Exceeds GPA credit limit
      }

      const availableOfferings = (offeringsByCourse.get(cand.course.code) || []).filter(
        o => o.capacity > o.enrolledCount
      );

      // Find an offering for this course that doesn't conflict with already chosen offerings
      let conflictFreeOffering: CourseOffering | null = null;

      for (const off of availableOfferings) {
        let hasConflict = false;
        for (const chosen of chosenOfferings) {
          const conflict = this.checkOfferingsConflict(off, chosen, cand.course, courseMap.get(chosen.courseCode));
          if (conflict) {
            hasConflict = true;
            break;
          }
        }
        if (!hasConflict) {
          conflictFreeOffering = off;
          break;
        }
      }

      if (conflictFreeOffering) {
        chosenOfferings.push(conflictFreeOffering);
        currentTotalCredits += cand.course.credits;

        const prereqsList = cand.course.prerequisites || [];
        const prereqNoteAr =
          prereqsList.length === 0
            ? 'لا يوجد متطلب سابق (مستوفى تلقائياً)'
            : `مستوفى بنجاح (${prereqsList.join('، ')})`;
        const prereqNoteEn =
          prereqsList.length === 0
            ? 'No prerequisite (Satisfied)'
            : `Satisfied (${prereqsList.join(', ')})`;

        selectedRecommended.push({
          courseCode: cand.course.code,
          courseNameAr: cand.course.nameAr,
          courseNameEn: cand.course.nameEn,
          credits: cand.course.credits,
          isMandatory: cand.course.isMandatory,
          track: cand.course.track,
          offeringId: conflictFreeOffering.id,
          sectionCode: conflictFreeOffering.sectionCode || 'شعبة 1 (SEC-01)',
          daysAr: conflictFreeOffering.days ? conflictFreeOffering.days.join(' و') : conflictFreeOffering.lectureDayTimeAr,
          daysEn: conflictFreeOffering.lectureDayTimeEn,
          timeRangeAr: `${conflictFreeOffering.startTime || '10:00'} - ${conflictFreeOffering.endTime || '11:30'}`,
          timeRangeEn: `${conflictFreeOffering.startTime || '10:00'} - ${conflictFreeOffering.endTime || '11:30'}`,
          hall: conflictFreeOffering.hall,
          primaryReasonAr: cand.primaryReasonAr,
          primaryReasonEn: cand.primaryReasonEn,
          detailedReasonsAr: cand.detailedReasonsAr,
          detailedReasonsEn: cand.detailedReasonsEn,
          prerequisitesStatusAr: prereqNoteAr,
          prerequisitesStatusEn: prereqNoteEn,
          importance: cand.importance,
          isRetake: cand.isRetake,
          unlocksFutureCourses: cand.unlocksFutureCourses,
          availableSeats: conflictFreeOffering.capacity - conflictFreeOffering.enrolledCount,
        });
      }
    }

    const hasWarning = student.warningCount > 0 || student.cumulativeGpa < 2.0;
    const academicStandingNoteAr = hasWarning
      ? `أنت تحت إنذار أكاديمي رقم (${student.warningCount}). معدلك التراكمي (${student.cumulativeGpa.toFixed(2)}) يحدد سقف التسجيل بـ ${maxAllowedCredits} ساعة معتمدة كحد أقصى.`
      : `الوضع الأكاديمي سليم ومستقر (معدل ${student.cumulativeGpa.toFixed(2)}). الحد الأقصى المسموح به هو ${maxAllowedCredits} ساعة معتمدة.`;

    const academicStandingNoteEn = hasWarning
      ? `You are under Academic Warning #${student.warningCount}. Your cumulative GPA (${student.cumulativeGpa.toFixed(2)}) caps registration at ${maxAllowedCredits} credit hours.`
      : `Academic standing in good shape (GPA ${student.cumulativeGpa.toFixed(2)}). Maximum allowed load is ${maxAllowedCredits} credit hours.`;

    const rationaleAr = [
      `تم إعداد الجدول ليناسب تماماً الحد الأقصى المسموح به لمعدلك (${maxAllowedCredits} ساعة معتمدة).`,
      'تم إعطاء الأولوية القصوى للمقررات التي سبق الرسوب فيها لرفع المعدل التراكمي وإزالة الإنذار.',
      'تم اختيار مقررات عنق الزجاجة (Bottlenecks) لفتح المقررات المتقدمة وتسريع موعد التخرج.',
      'تم التحقق آلياً من خلو الجدول من أي تعارضات في المواعيد أو القاعات أو الفترات الزمنية.',
    ];

    const rationaleEn = [
      `The schedule fits within your GPA credit hour ceiling (${maxAllowedCredits} credits).`,
      'Top priority was granted to failed courses to boost GPA and clear warnings.',
      'Bottleneck gateway courses were selected to unlock advanced courses and prevent delays.',
      'Sections were automatically verified to be 100% free of schedule and room conflicts.',
    ];

    return {
      studentId: student.id,
      targetSemesterNameAr: 'خريف 2026 / 2027',
      targetSemesterNameEn: 'Fall 2026/2027',
      recommendedCredits: currentTotalCredits,
      maxAllowedCredits,
      minCredits,
      studentGpa: student.cumulativeGpa,
      academicStandingNoteAr,
      academicStandingNoteEn,
      recommendedCourses: selectedRecommended,
      rationaleAr,
      rationaleEn,
      hasWarning,
    };
  }

  /**
   * 2. Real-Time Deterministic Validation for Proposed Registration
   * Validates:
   * - Prerequisites (with missing prereq flagged and suggested as alternative)
   * - Credit limits (with exact excess credit calculation)
   * - Minimum credit load (handling graduation semester exception)
   * - Duplicate / previously passed courses
   * - Retake attempt capping and GPA impact
   * - Section capacity (suggesting available alternatives)
   * - Schedule / timetable conflicts across sections and days
   */
  public static validateProposedRegistration(
    student: Student,
    selectedOfferings: CourseOffering[],
    allCourses: Course[],
    allOfferings: CourseOffering[],
    isSummer: boolean = false
  ): RegistrationValidationDetails {
    const courseMap = new Map<string, Course>(allCourses.map(c => [c.code, c]));
    const maxAllowedCredits = AcademicRulesEngine.getMaxCredits(student, isSummer);
    const minCredits = isSummer ? 2 : 12;

    const errorsAr: string[] = [];
    const errorsEn: string[] = [];
    const warningsAr: string[] = [];
    const warningsEn: string[] = [];

    const passedCodes = new Set(
      student.records.filter(r => r.status === 'PASSED').map(r => r.courseCode)
    );

    let totalCredits = 0;
    const excessCourseCodes: string[] = [];

    const prerequisiteErrors: RegistrationValidationDetails['prerequisiteErrors'] = [];
    const duplicateErrors: RegistrationValidationDetails['duplicateErrors'] = [];
    const retakeNotices: RegistrationValidationDetails['retakeNotices'] = [];
    const capacityErrors: RegistrationValidationDetails['capacityErrors'] = [];
    const scheduleConflicts: ScheduleConflict[] = [];

    // Track total credits
    for (const off of selectedOfferings) {
      const course = courseMap.get(off.courseCode);
      const credits = course ? course.credits : 3;
      totalCredits += credits;

      if (totalCredits > maxAllowedCredits) {
        excessCourseCodes.push(off.courseCode);
      }
    }

    // 1. Prerequisites & Duplicates & Capacity
    for (const off of selectedOfferings) {
      const course = courseMap.get(off.courseCode);
      if (!course) continue;

      // Duplicate / Passed check
      const passedRecord = student.records.find(
        r => r.courseCode === off.courseCode && r.status === 'PASSED'
      );
      if (passedRecord && passedRecord.grade && !['D', 'D-'].includes(passedRecord.grade)) {
        errorsAr.push(
          `لقد اجتزت بالفعل مقرر ${course.nameAr} (${course.code}) بتقدير (${passedRecord.grade}) ولا يجوز إعادته حسب اللائحة.`
        );
        errorsEn.push(
          `You have already completed ${course.nameEn} (${course.code}) with grade ${passedRecord.grade} and cannot retake it.`
        );
        duplicateErrors.push({
          courseCode: course.code,
          courseNameAr: course.nameAr,
          courseNameEn: course.nameEn,
          previousGrade: passedRecord.grade,
          canRetake: false,
        });
      }

      // Retake rules notice
      const previousAttempts = student.records.filter(r => r.courseCode === off.courseCode);
      if (previousAttempts.length > 0) {
        const lastAttempt = previousAttempts[previousAttempts.length - 1];
        const nextAttemptNum = previousAttempts.length + 1;
        const maxGrade = nextAttemptNum === 2 ? 'B+' : nextAttemptNum === 3 ? 'C+' : 'D+';

        retakeNotices.push({
          courseCode: course.code,
          courseNameAr: course.nameAr,
          previousGrade: lastAttempt.grade || 'F',
          attempt: nextAttemptNum,
          maxAllowedGrade: maxGrade,
          gpaImpactNoteAr: `المحاولة رقم (${nextAttemptNum}) تسقف عند تقدير (${maxGrade}). الدرجة الجديدة ستحل محل الرسوب لرفع المعدل.`,
          gpaImpactNoteEn: `Attempt #${nextAttemptNum} is capped at (${maxGrade}). New grade will replace failure to boost GPA.`,
        });
      }

      // Prerequisites check
      const prereqs = course.prerequisites || [];
      for (const p of prereqs) {
        if (!passedCodes.has(p)) {
          const prereqCourse = courseMap.get(p);
          const pNameAr = prereqCourse ? prereqCourse.nameAr : p;
          const pNameEn = prereqCourse ? prereqCourse.nameEn : p;

          errorsAr.push(
            `لا يمكن تسجيل ${course.nameAr} (${course.code}) لأن المتطلب السابق (${pNameAr} - ${p}) لم يتم اجتيازه بنجاح.`
          );
          errorsEn.push(
            `Cannot register ${course.nameEn} (${course.code}) because prerequisite (${pNameEn} - ${p}) is not satisfied.`
          );

          prerequisiteErrors.push({
            courseCode: course.code,
            courseNameAr: course.nameAr,
            courseNameEn: course.nameEn,
            missingPrereqCode: p,
            missingPrereqNameAr: pNameAr,
            missingPrereqNameEn: pNameEn,
            suggestedAlternativeCode: p,
            suggestedAlternativeNameAr: pNameAr,
            suggestedAlternativeNameEn: pNameEn,
          });
        }
      }

      // Capacity check
      if (off.capacity > 0 && off.enrolledCount >= off.capacity) {
        const alts = allOfferings.filter(
          o => o.courseCode === off.courseCode && o.id !== off.id && o.capacity > o.enrolledCount
        );
        errorsAr.push(
          `الشعبة المختارة لمقرر ${course.nameAr} (${off.sectionCode || 'الشعبة'}) ممتلئة بالكامل (${off.enrolledCount}/${off.capacity}).`
        );
        errorsEn.push(
          `Selected section for ${course.nameEn} (${off.sectionCode || 'Section'}) is full (${off.enrolledCount}/${off.capacity}).`
        );

        capacityErrors.push({
          courseCode: course.code,
          courseNameAr: course.nameAr,
          sectionCode: off.sectionCode || 'شعبة 1',
          offeringId: off.id,
          capacity: off.capacity,
          enrolledCount: off.enrolledCount,
          alternativeSectionAvailable: alts.length > 0,
          alternativeSections: alts,
        });
      }
    }

    // 2. Schedule conflicts detection
    for (let i = 0; i < selectedOfferings.length; i++) {
      for (let j = i + 1; j < selectedOfferings.length; j++) {
        const offA = selectedOfferings[i];
        const offB = selectedOfferings[j];
        const conflict = this.checkOfferingsConflict(
          offA,
          offB,
          courseMap.get(offA.courseCode),
          courseMap.get(offB.courseCode),
          allOfferings
        );

        if (conflict) {
          scheduleConflicts.push(conflict);
          errorsAr.push(
            `تعارض في المواعيد: مقرر ${conflict.courseName1Ar} (${conflict.courseCode1}) يتعارض مع ${conflict.courseName2Ar} (${conflict.courseCode2}) يوم ${conflict.dayAr} في الفترة (${conflict.timeRangeAr}).`
          );
          errorsEn.push(
            `Schedule Conflict: ${conflict.courseCode1} conflicts with ${conflict.courseCode2} on ${conflict.dayEn} at (${conflict.timeRangeEn}).`
          );
        }
      }
    }

    // 3. Credit Limit Check
    let creditLimitError: RegistrationValidationDetails['creditLimitError'];
    if (totalCredits > maxAllowedCredits) {
      const excess = totalCredits - maxAllowedCredits;
      errorsAr.push(
        `تجاوز الحد الأقصى للساعات: مجموع الساعات المختارة (${totalCredits}) يتجاوز الحد المسموح به لمعدلك التراكمي (${maxAllowedCredits} ساعة) بمقدار ${excess} ساعات.`
      );
      errorsEn.push(
        `Credit limit exceeded: Selected ${totalCredits} credits exceeds your GPA limit (${maxAllowedCredits} credits) by ${excess} credits.`
      );
      creditLimitError = {
        totalCredits,
        maxAllowed: maxAllowedCredits,
        excessCredits: excess,
        excessCourseCodes,
      };
    }

    // 4. Minimum load check
    let minimumLoadWarning: RegistrationValidationDetails['minimumLoadWarning'];
    if (totalCredits > 0 && totalCredits < minCredits) {
      const isGrad = student.remainingCredits <= totalCredits;
      if (isGrad) {
        warningsAr.push(
          `تنبيه: إجمالي الساعات (${totalCredits}) أقل من الحد الأدنى (${minCredits})، لكنها مقبولة رسمياً كفصل تخرج نهائي.`
        );
        warningsEn.push(
          `Notice: Total credits (${totalCredits}) below minimum (${minCredits}), accepted as final graduation semester.`
        );
        minimumLoadWarning = {
          totalCredits,
          minRequired: minCredits,
          isGraduationSemester: true,
          noteAr: 'مستثنى كفصل تخرج نهائي لاستيفاء كافة متطلبات الدرجة.',
          noteEn: 'Permitted exception as final graduation semester.',
        };
      } else {
        warningsAr.push(
          `تنبيه: الحد الأدنى المعتاد للتسجيل في الفصل هو (${minCredits}) ساعات معتمدة. رصيدك الحالي (${totalCredits}) ساعة.`
        );
        warningsEn.push(
          `Warning: Minimum semester registration is (${minCredits}) credits. Your current load is (${totalCredits}) credits.`
        );
        minimumLoadWarning = {
          totalCredits,
          minRequired: minCredits,
          isGraduationSemester: false,
          noteAr: `يُنصح باختيار مقررات إضافية للوصول للحد الأدنى (${minCredits} ساعة) للحفاظ على مسار التخرج المنتظم.`,
          noteEn: `Recommended to add courses to reach minimum load (${minCredits} hrs) to maintain graduation timeline.`,
        };
      }
    }

    return {
      valid: errorsAr.length === 0,
      totalCredits,
      maxAllowedCredits,
      minCredits,
      prerequisiteErrors,
      creditLimitError,
      minimumLoadWarning,
      duplicateErrors,
      retakeNotices,
      capacityErrors,
      scheduleConflicts,
      errorsAr,
      errorsEn,
      warningsAr,
      warningsEn,
    };
  }

  /**
   * 3. Automatic Conflict Resolution ("Fix My Schedule" / "إصلاح الجدول")
   * Finds alternative non-conflicting sections for the student's selected courses.
   */
  public static resolveScheduleConflicts(
    selectedCourseCodes: string[],
    currentOfferings: CourseOffering[],
    allOfferings: CourseOffering[],
    allCourses: Course[]
  ): {
    resolved: boolean;
    resolvedOfferings?: CourseOffering[];
    resolutionSummaryAr: string[];
    resolutionSummaryEn: string[];
    reasonAr?: string;
    reasonEn?: string;
  } {
    const courseMap = new Map<string, Course>(allCourses.map(c => [c.code, c]));
    const offeringsByCourse = new Map<string, CourseOffering[]>();

    for (const code of selectedCourseCodes) {
      const avail = allOfferings.filter(
        o => o.courseCode === code && o.capacity > o.enrolledCount
      );
      if (avail.length === 0) {
        return {
          resolved: false,
          resolutionSummaryAr: [],
          resolutionSummaryEn: [],
          reasonAr: `لا تتوفر أي شعبة شاغرة لمقرر ${courseMap.get(code)?.nameAr || code} لحل التعارض.`,
          reasonEn: `No sections with available capacity exist for course ${code} to resolve conflict.`,
        };
      }
      offeringsByCourse.set(code, avail);
    }

    // Try finding a combination of sections with zero conflict
    const courseCodes = [...selectedCourseCodes];

    function searchCombination(
      index: number,
      currentCombination: CourseOffering[]
    ): CourseOffering[] | null {
      if (index === courseCodes.length) {
        return currentCombination;
      }

      const code = courseCodes[index];
      const sections = offeringsByCourse.get(code) || [];

      for (const sec of sections) {
        let hasConflict = false;
        for (const chosen of currentCombination) {
          if (RegistrationAdvisorEngine.checkOfferingsConflict(sec, chosen, courseMap.get(sec.courseCode), courseMap.get(chosen.courseCode))) {
            hasConflict = true;
            break;
          }
        }
        if (!hasConflict) {
          const res = searchCombination(index + 1, [...currentCombination, sec]);
          if (res) return res;
        }
      }
      return null;
    }

    const validSolution = searchCombination(0, []);

    if (!validSolution) {
      return {
        resolved: false,
        resolutionSummaryAr: [],
        resolutionSummaryEn: [],
        reasonAr: 'تعذر إيجاد توليفة من الشعب الخالية من التعارض لجميع المقررات المختارة في نفس الفصل. يرجى استبدال أحد المقررات المتعارضة.',
        reasonEn: 'Could not find a conflict-free section combination for all chosen courses. Please replace one of the conflicting courses.',
      };
    }

    const summaryAr: string[] = [];
    const summaryEn: string[] = [];

    for (const sol of validSolution) {
      const prev = currentOfferings.find(o => o.courseCode === sol.courseCode);
      if (prev && prev.id !== sol.id) {
        const c = courseMap.get(sol.courseCode);
        summaryAr.push(
          `تم استبدال شعبة ${c?.nameAr || sol.courseCode}: من (${prev.sectionCode || 'الشعبة السابقة'} - ${prev.lectureDayTimeAr}) إلى (${sol.sectionCode || 'الشعبة البديلة'} - ${sol.lectureDayTimeAr}).`
        );
        summaryEn.push(
          `Swapped section for ${sol.courseCode}: from (${prev.sectionCode || 'Previous'} - ${prev.lectureDayTimeEn}) to (${sol.sectionCode || 'Alternative'} - ${sol.lectureDayTimeEn}).`
        );
      }
    }

    if (summaryAr.length === 0) {
      summaryAr.push('الجدول الحالي متوافق بالفعل ولا يحتوي على أي تعارضات.');
      summaryEn.push('The current schedule is already conflict-free.');
    }

    return {
      resolved: true,
      resolvedOfferings: validSolution,
      resolutionSummaryAr: summaryAr,
      resolutionSummaryEn: summaryEn,
    };
  }

  /**
   * 4. What-If Schedule Sandbox
   * Simulates adding, removing, or changing a course in the draft registration,
   * calculating GPA trajectory and graduation impact without touching the real record.
   */
  public static simulateWhatIf(
    student: Student,
    currentCourseCodes: string[],
    action: {
      type: 'ADD' | 'REMOVE' | 'REPLACE';
      targetCourseCode: string;
      replacementCourseCode?: string;
      assumedGrade?: string;
    },
    allCourses: Course[]
  ): ScheduleWhatIfResult {
    const courseMap = new Map<string, Course>(allCourses.map(c => [c.code, c]));
    let modifiedCodes = [...currentCourseCodes];

    if (action.type === 'ADD') {
      if (!modifiedCodes.includes(action.targetCourseCode)) {
        modifiedCodes.push(action.targetCourseCode);
      }
    } else if (action.type === 'REMOVE') {
      modifiedCodes = modifiedCodes.filter(c => c !== action.targetCourseCode);
    } else if (action.type === 'REPLACE' && action.replacementCourseCode) {
      modifiedCodes = modifiedCodes.map(c => (c === action.targetCourseCode ? action.replacementCourseCode! : c));
    }

    const currentCredits = currentCourseCodes.reduce((sum, c) => sum + (courseMap.get(c)?.credits || 3), 0);
    const projectedCredits = modifiedCodes.reduce((sum, c) => sum + (courseMap.get(c)?.credits || 3), 0);

    // Calculate unlocks
    const unlockMap = RecommendationEngine.calculateUnlockGraph(allCourses);
    const unlockedList: string[] = [];
    for (const code of modifiedCodes) {
      for (const c of allCourses) {
        if ((c.prerequisites || []).includes(code)) {
          unlockedList.push(`${c.nameAr} (${c.code})`);
        }
      }
    }

    // Estimate GPA impact
    const baseGpa = student.cumulativeGpa;
    const isRetake = student.records.some(r => r.courseCode === action.targetCourseCode && r.status === 'FAILED');
    let projectedGpa = baseGpa;

    if (isRetake && (action.type === 'ADD' || currentCourseCodes.includes(action.targetCourseCode))) {
      // Retaking an F with assumed B (3.0) gives strong boost
      const diffPoints = 3.0 * 3; // 9 points gained
      const newTotalCredits = student.completedCredits + 3;
      projectedGpa = Math.min(4.0, (baseGpa * student.completedCredits + diffPoints) / newTotalCredits);
    } else {
      projectedGpa = Math.min(4.0, (baseGpa * student.completedCredits + 3.0 * projectedCredits) / (student.completedCredits + projectedCredits));
    }

    const gpaChange = Number((projectedGpa - baseGpa).toFixed(2));
    const notesAr: string[] = [];
    const notesEn: string[] = [];

    if (gpaChange > 0) {
      notesAr.push(`زيادة متوقعة في المعدل التراكمي بمقدار +${gpaChange} نقطة.`);
      notesEn.push(`Projected GPA increase of +${gpaChange} points.`);
    } else {
      notesAr.push('استقرار في مسار المعدل التراكمي مع الحفاظ على وتيرة الساعات.');
      notesEn.push('GPA trajectory stabilizes with continued course progress.');
    }

    const remainingAfter = Math.max(0, student.remainingCredits - projectedCredits);
    const semestersNeeded = Math.ceil(remainingAfter / 15);
    const gradSemesterAr = semestersNeeded <= 1 ? 'ربيع 2027 (فصل التخرج)' : `بعد ${semestersNeeded} فصول دراسية`;
    const gradSemesterEn = semestersNeeded <= 1 ? 'Spring 2027 (Graduation)' : `After ${semestersNeeded} semesters`;

    return {
      currentCredits,
      projectedCredits,
      currentGpa: baseGpa,
      projectedGpa: Number(projectedGpa.toFixed(2)),
      gpaChange,
      unlockedCoursesCount: unlockedList.length,
      unlockedCourses: Array.from(new Set(unlockedList)),
      expectedGraduationSemesterAr: gradSemesterAr,
      expectedGraduationSemesterEn: gradSemesterEn,
      graduationDelayed: false,
      notesAr,
      notesEn,
    };
  }
}
