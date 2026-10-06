import { Course, CourseOffering, CourseRecommendation, Student } from '../../src/types/index.js';

export class RecommendationEngine {
  /**
   * Calculate how many courses this course unlocks directly or indirectly
   */
  public static calculateUnlockGraph(allCourses: Course[]): Map<string, number> {
    const unlockCount = new Map<string, number>();
    for (const c of allCourses) {
      unlockCount.set(c.code, 0);
    }

    for (const c of allCourses) {
      if (c.prerequisites) {
        for (const p of c.prerequisites) {
          const current = unlockCount.get(p) || 0;
          unlockCount.set(p, current + 1);
        }
      }
    }
    return unlockCount;
  }

  /**
   * Generate intelligent, rules-compliant course recommendations for a student.
   * Strictly verifies that EVERY recommended course is legally eligible (prerequisites met,
   * student eligible, not previously passed unless allowed retake).
   */
  public static generateRecommendations(
    student: Student,
    allCourses: Course[],
    offerings: CourseOffering[]
  ): CourseRecommendation[] {
    const passedCodes = new Set(
      student.records.filter(r => r.status === 'PASSED').map(r => r.courseCode)
    );
    const failedRecords = student.records.filter(r => r.status === 'FAILED');
    const failedCodes = new Set(failedRecords.map(r => r.courseCode));
    const offeringMap = new Map<string, CourseOffering>();
    for (const off of offerings) {
      offeringMap.set(off.courseCode, off);
    }

    const unlockMap = this.calculateUnlockGraph(allCourses);
    const recommendations: CourseRecommendation[] = [];

    for (const course of allCourses) {
      // 1. If already passed with grade higher than D, skip (cannot retake)
      const passedRecord = student.records.find(r => r.courseCode === course.code && r.status === 'PASSED');
      if (passedRecord && passedRecord.grade && !['D', 'D-'].includes(passedRecord.grade)) {
        continue;
      }

      // 2. Check track match if applicable
      if (course.track && course.track !== student.track && course.track !== 'General') {
        continue;
      }

      // 3. Check graduation project eligibility (>= 70% of 134 hours = 94 credits)
      if (course.code === 'CS 498' || course.code === 'CS 499') {
        const requiredHours = Math.ceil(134 * 0.70);
        if (student.completedCredits < requiredHours) {
          continue; // strictly ineligible
        }
      }

      // 4. Prerequisite Check (STRICT RULE: AI cannot recommend courses whose prerequisites are unsatisfied)
      const prerequisites = course.prerequisites || [];
      const missingPrereqs = prerequisites.filter(p => !passedCodes.has(p));
      if (missingPrereqs.length > 0) {
        continue; // REJECT: Cannot recommend course with unmet prerequisites
      }

      const isRetake = failedCodes.has(course.code);
      const offering = offeringMap.get(course.code);
      const seatsAvailable = offering ? offering.capacity - offering.enrolledCount : 0;
      const isOffered = !!offering;
      const unlocks = unlockMap.get(course.code) || 0;

      // Scoring factors
      let score = 50;
      const reasonsAr: string[] = [];
      const reasonsEn: string[] = [];
      let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL' = 'NORMAL';

      // Factor 1: Failed course retake (vital for GPA recovery)
      if (isRetake) {
        score += 35;
        priority = 'CRITICAL';
        reasonsAr.push('إعادة دراسة مقرر رسبت فيه سابقاً لرفع المعدل التراكمي وتفادي تراكم الساعات.');
        reasonsEn.push('Retaking previously failed course to recover GPA and remove graduation bottleneck.');
      }

      // Factor 2: Bottleneck unlock power
      if (unlocks >= 3) {
        score += 25;
        if (priority !== 'CRITICAL') priority = 'HIGH';
        reasonsAr.push(`مقرر مفتاحي يفتح (${unlocks}) مقررات متقدمة في المستويات القادمة.`);
        reasonsEn.push(`Key gateway course unlocking (${unlocks}) advanced courses in upcoming semesters.`);
      } else if (unlocks > 0) {
        score += unlocks * 6;
        reasonsAr.push(`متطلب سابق لـ (${unlocks}) مقرر.`);
        reasonsEn.push(`Prerequisite for (${unlocks}) downstream course(s).`);
      }

      // Factor 3: Prerequisites verified satisfied
      score += 15;
      reasonsAr.push('جميع المتطلبات السابقة للمقرر مستوفاة بنجاح.');
      reasonsEn.push('All prerequisites verified and satisfied.');

      // Factor 4: Mandatory vs Elective
      if (course.isMandatory) {
        score += 15;
        reasonsAr.push('مقرر إجباري لمتطلبات التخرج الأساسية.');
        reasonsEn.push('Mandatory course for degree graduation requirements.');
      } else {
        score += 5;
        reasonsAr.push('مقرر اختياري يدعم مسارك التخصصي.');
        reasonsEn.push('Elective course aligning with your track.');
      }

      // Factor 5: Offering & Seats
      if (isOffered && seatsAvailable > 0) {
        score += 10;
        reasonsAr.push(`المقرر مطروح حالياً مع توفر مقاعد (${seatsAvailable} مقعد متاح).`);
        reasonsEn.push(`Currently offered with available capacity (${seatsAvailable} seats).`);
      } else if (isOffered && seatsAvailable <= 0) {
        score -= 20;
        reasonsAr.push('المقرر مطروح ولكن الشعب ممتلئة بالكامل حالياً.');
        reasonsEn.push('Course is offered but all sections are currently full.');
      }

      // Graduation impact
      const impactAr = isRetake 
        ? 'تحسين مباشر في المعدل التراكمي وإزالة خطر الإنذار'
        : unlocks >= 2 
        ? 'تسريع مسار التخرج وتفادي التأخر الدراسي'
        : 'استيفاء ساعات الخطة الدراسية المنتظمة';

      const impactEn = isRetake 
        ? 'Direct cumulative GPA recovery and risk reduction'
        : unlocks >= 2 
        ? 'Accelerates graduation track and avoids bottleneck delays'
        : 'Regular academic degree completion';

      // Clamp score
      score = Math.min(99, Math.max(10, score));

      if (score >= 85 && priority !== 'CRITICAL') priority = 'HIGH';
      else if (score >= 65 && priority === 'NORMAL') priority = 'MEDIUM';

      recommendations.push({
        courseCode: course.code,
        courseNameAr: course.nameAr,
        courseNameEn: course.nameEn,
        credits: course.credits,
        isMandatory: course.isMandatory,
        track: course.track,
        priority,
        score,
        reasonsAr,
        reasonsEn,
        prerequisitesMet: true,
        prerequisites,
        unlocksCount: unlocks,
        seatAvailable: isOffered && seatsAvailable > 0,
        availableSeats: Math.max(0, seatsAvailable),
        capacity: offering ? offering.capacity : 0,
        isRetake,
        impactAr,
        impactEn,
      });
    }

    // Sort by priority and score descending
    const priorityWeights: Record<string, number> = {
      CRITICAL: 1000,
      HIGH: 500,
      MEDIUM: 200,
      NORMAL: 50,
    };

    return recommendations.sort((a, b) => {
      const pDiff = (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0);
      if (pDiff !== 0) return pDiff;
      return b.score - a.score;
    });
  }
}
