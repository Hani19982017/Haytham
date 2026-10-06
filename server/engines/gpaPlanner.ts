import { Course, GpaImprovementPlan, Student } from '../../src/types/index.js';
import { calculateDeficitPoints, capRetakeGrade, getGradePoints } from './gpaEngine.js';

export class GpaImprovementPlanner {
  public static generatePlans(
    student: Student,
    allCourses: Course[]
  ): GpaImprovementPlan[] {
    const deficitInfo = calculateDeficitPoints(student.cumulativeGpa, student.completedCredits, 2.0);
    const failedRecords = student.records.filter(r => r.status === 'FAILED');
    const lowGradeRecords = student.records.filter(
      r => r.status === 'PASSED' && (r.grade === 'D' || r.grade === 'D-' || r.grade === 'D+')
    );

    // Collect retake candidates
    const retakeCandidates: { courseCode: string; credits: number; currentGrade: string; attempt: number }[] = [];

    for (const f of failedRecords) {
      const course = allCourses.find(c => c.code === f.courseCode);
      retakeCandidates.push({
        courseCode: f.courseCode,
        credits: course ? course.credits : 3,
        currentGrade: f.grade || 'F',
        attempt: (f.attempt || 1) + 1,
      });
    }

    for (const d of lowGradeRecords) {
      if (retakeCandidates.length < 5) {
        const course = allCourses.find(c => c.code === d.courseCode);
        retakeCandidates.push({
          courseCode: d.courseCode,
          credits: course ? course.credits : 3,
          currentGrade: d.grade || 'D',
          attempt: (d.attempt || 1) + 1,
        });
      }
    }

    const courseMap = new Map<string, Course>(allCourses.map(c => [c.code, c]));

    // Helper to calculate exact mathematical projected GPA
    const calculateExactProjectedGpa = (
      courses: { credits: number; currentGrade: string; targetGrade: string; isRetake: boolean }[]
    ) => {
      let gainPoints = 0;
      let newCredits = 0;
      let newPoints = 0;

      for (const c of courses) {
        const targetPts = getGradePoints(c.targetGrade);
        if (c.isRetake) {
          const currentPts = getGradePoints(c.currentGrade);
          gainPoints += c.credits * (targetPts - currentPts);
        } else {
          newCredits += c.credits;
          newPoints += c.credits * targetPts;
        }
      }

      const totalEffectiveCredits = student.completedCredits + newCredits;
      if (totalEffectiveCredits <= 0) return 0.0;

      const totalEffectivePoints = (student.cumulativeGpa * student.completedCredits) + gainPoints + newPoints;
      return Math.min(4.0, Math.round((totalEffectivePoints / totalEffectiveCredits) * 100) / 100);
    };

    // 1. Conservative Plan: Moderate targets (C+ / B-), longer recovery, lower stress
    const conservativeCourses = retakeCandidates.slice(0, 3).map(r => {
      const course = courseMap.get(r.courseCode);
      const capped = capRetakeGrade('C+', r.attempt);
      return {
        courseCode: r.courseCode,
        courseNameAr: course ? course.nameAr : r.courseCode,
        courseNameEn: course ? course.nameEn : r.courseCode,
        credits: r.credits,
        currentGrade: r.currentGrade,
        targetGrade: capped.grade,
        isRetake: true,
        maxPossibleGrade: r.attempt === 2 ? 'B+' : r.attempt === 3 ? 'C+' : 'D+',
      };
    });

    const conservativeTotalCredits = conservativeCourses.reduce((sum, c) => sum + c.credits, 0);
    const conservativeProjectedGpa = calculateExactProjectedGpa(conservativeCourses);

    const conservative: GpaImprovementPlan = {
      strategy: 'Conservative',
      titleAr: 'الخطة الهادئة (الآمنة)',
      titleEn: 'Conservative Safe Recovery',
      targetGpa: 2.00,
      projectedGpa: conservativeProjectedGpa,
      semestersNeeded: 2,
      creditHoursTotal: conservativeTotalCredits || 9,
      riskLevel: 'LOW',
      descriptionAr: 'تستهدف درجات واقعية وميسرة (C+ / B-) مع توزيع العبء على فصلين لتجنب الضغط والانتكاس.',
      descriptionEn: 'Targets realistic achievable grades (C+ / B-) distributed across two semesters to avoid burnout.',
      courses: conservativeCourses,
    };

    // 2. Balanced Plan: Good target grades (B / B-), standard recovery
    const balancedCourses = retakeCandidates.slice(0, 4).map(r => {
      const course = courseMap.get(r.courseCode);
      const capped = capRetakeGrade('B', r.attempt);
      return {
        courseCode: r.courseCode,
        courseNameAr: course ? course.nameAr : r.courseCode,
        courseNameEn: course ? course.nameEn : r.courseCode,
        credits: r.credits,
        currentGrade: r.currentGrade,
        targetGrade: capped.grade,
        isRetake: true,
        maxPossibleGrade: r.attempt === 2 ? 'B+' : r.attempt === 3 ? 'C+' : 'D+',
      };
    });

    const balancedTotalCredits = balancedCourses.reduce((sum, c) => sum + c.credits, 0);
    const balancedProjectedGpa = calculateExactProjectedGpa(balancedCourses);

    const balanced: GpaImprovementPlan = {
      strategy: 'Balanced',
      titleAr: 'الخطة المتوازنة (الموصى بها)',
      titleEn: 'Balanced Recovery (Recommended)',
      targetGpa: 2.10,
      projectedGpa: balancedProjectedGpa,
      semestersNeeded: 2,
      creditHoursTotal: balancedTotalCredits || 12,
      riskLevel: 'MEDIUM',
      descriptionAr: 'تحقيق توازن مثالي بين سرعة الخروج من الإنذار الأكاديمي والحصول على تقديرات جيدة (B / B-).',
      descriptionEn: 'Strikes the ideal balance between rapid warning recovery and solid academic performance (B / B-).',
      courses: balancedCourses,
    };

    // 3. Aggressive Plan: Maximum allowable retake grades (capped at B+ / C+), rapid turnaround
    const aggressiveCourses = retakeCandidates.slice(0, 4).map(r => {
      const course = courseMap.get(r.courseCode);
      const capped = capRetakeGrade('A', r.attempt); // capped by attempt
      return {
        courseCode: r.courseCode,
        courseNameAr: course ? course.nameAr : r.courseCode,
        courseNameEn: course ? course.nameEn : r.courseCode,
        credits: r.credits,
        currentGrade: r.currentGrade,
        targetGrade: capped.grade,
        isRetake: true,
        maxPossibleGrade: r.attempt === 2 ? 'B+' : r.attempt === 3 ? 'C+' : 'D+',
      };
    });

    const aggressiveTotalCredits = aggressiveCourses.reduce((sum, c) => sum + c.credits, 0);
    const aggressiveProjectedGpa = calculateExactProjectedGpa(aggressiveCourses);

    const aggressive: GpaImprovementPlan = {
      strategy: 'Aggressive',
      titleAr: 'الخطة السريعة المكثفة',
      titleEn: 'Fast Intensive Recovery',
      targetGpa: 2.15,
      projectedGpa: aggressiveProjectedGpa,
      semestersNeeded: 1,
      creditHoursTotal: aggressiveTotalCredits || 12,
      riskLevel: 'HIGH',
      descriptionAr: 'تستهدف الحد الأقصى المسموح نظاماً لإعادة المقررات (B+ للإعادة الأولى) للخروج الفوري من منطقة الخطر خلال فصل واحد.',
      descriptionEn: 'Targets the maximum permitted retake grade caps (B+ for 1st retake) for rapid single-semester turnaround.',
      courses: aggressiveCourses,
    };

    return [balanced, conservative, aggressive];
  }
}
