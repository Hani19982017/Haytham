import { RiskLevel, Student } from '../../src/types/index.js';

export interface RiskFeatureVector {
  cumulativeGpa: number;
  previousGpaDelta: number;
  warningCount: number;
  consecutiveWarnings: number;
  failedCoursesCount: number;
  minAttendancePercentage: number;
  completedCreditsRatio: number;
}

export interface RiskEvaluation {
  engineType: 'Explainable Rule-Based Risk Engine' | 'Machine Learning Predictive Model';
  level: RiskLevel;
  score: number; // 0 to 100
  reasonsAr: string[];
  reasonsEn: string[];
  recommendedActionAr: string;
  recommendedActionEn: string;
  isMLPredicted: false;
  mlFeatures: RiskFeatureVector;
}

/**
 * Explainable Rule-Based Risk Engine
 * 
 * NOTE ON ARCHITECTURE:
 * This system strictly implements an "Explainable Rule-Based Risk Engine"
 * compliant with higher education academic bylaws. It evaluates multi-factor
 * deterministic risk indicators (GPA cutoffs, warning accumulations, attendance,
 * failed bottleneck courses, and semester trends) with full explainability.
 * 
 * Machine Learning Interface:
 * The `extractFeatureVector` method produces normalized numerical vectors
 * ready for future offline/online ML classification models (e.g. Random Forest,
 * XGBoost, Logistic Regression) once institutional training datasets are connected.
 */
export class AcademicRiskEngine {
  public static readonly ENGINE_NAME = 'Explainable Rule-Based Risk Engine';

  /**
   * Extract standardized numerical feature vector for downstream ML model pipelines
   */
  public static extractFeatureVector(student: Student): RiskFeatureVector {
    const minAttendance = student.records
      .filter(r => r.status === 'IN_PROGRESS' && r.attendancePercentage !== undefined)
      .reduce((min, r) => Math.min(min, r.attendancePercentage!), 100);

    const failedCount = student.records.filter(r => r.status === 'FAILED').length;
    const gpaDelta = student.previousGpa > 0 ? student.cumulativeGpa - student.previousGpa : 0;

    return {
      cumulativeGpa: student.cumulativeGpa,
      previousGpaDelta: Math.round(gpaDelta * 100) / 100,
      warningCount: student.warningCount,
      consecutiveWarnings: student.consecutiveWarnings,
      failedCoursesCount: failedCount,
      minAttendancePercentage: minAttendance,
      completedCreditsRatio: Math.min(1.0, Math.round((student.completedCredits / 134) * 100) / 100),
    };
  }

  public static evaluateRisk(student: Student): RiskEvaluation {
    const reasonsAr: string[] = [];
    const reasonsEn: string[] = [];
    let score = 10;
    const features = this.extractFeatureVector(student);

    // 1. Cumulative GPA evaluation
    if (student.cumulativeGpa < 1.0) {
      score += 50;
      reasonsAr.push(`المعدل التراكمي متدنٍ للغاية (${student.cumulativeGpa}) - تحت 1.00`);
      reasonsEn.push(`Cumulative GPA is critically low (${student.cumulativeGpa}) - under 1.00`);
    } else if (student.cumulativeGpa < 1.5) {
      score += 40;
      reasonsAr.push(`المعدل التراكمي (${student.cumulativeGpa}) تحت الحد الأدنى للإنذار (2.0) بفارق كبير`);
      reasonsEn.push(`Cumulative GPA (${student.cumulativeGpa}) is significantly below 2.0`);
    } else if (student.cumulativeGpa < 2.0) {
      score += 25;
      reasonsAr.push(`المعدل التراكمي (${student.cumulativeGpa}) يقع في نطاق الإنذار الأكاديمي (< 2.00)`);
      reasonsEn.push(`Cumulative GPA (${student.cumulativeGpa}) is in academic warning zone (< 2.00)`);
    } else if (student.cumulativeGpa < 2.3) {
      score += 10;
      reasonsAr.push(`المعدل التراكمي (${student.cumulativeGpa}) قريب من الحد الأدنى للإنذار الأكاديمي`);
      reasonsEn.push(`Cumulative GPA (${student.cumulativeGpa}) is borderline near warning threshold`);
    }

    // 2. Academic Warning count
    if (student.warningCount >= 3 || student.consecutiveWarnings >= 3) {
      score += 40;
      reasonsAr.push(`خطر الفصل الأكاديمي الوشيك: تسجيل ${student.consecutiveWarnings} إنذارات متتالية (${student.warningCount} إجمالياً)`);
      reasonsEn.push(`Imminent dismissal danger: ${student.consecutiveWarnings} consecutive warnings (${student.warningCount} total)`);
    } else if (student.warningCount > 0) {
      score += student.warningCount * 12;
      reasonsAr.push(`سجل الطالب يحتوي على ${student.warningCount} إنذارات أكاديمية سابقة`);
      reasonsEn.push(`Student record has ${student.warningCount} prior academic warning(s)`);
    }

    // 3. GPA trend
    if (student.previousGpa > 0 && student.cumulativeGpa < student.previousGpa - 0.25) {
      score += 15;
      const drop = (student.previousGpa - student.cumulativeGpa).toFixed(2);
      reasonsAr.push(`تراجع ملحوظ في الأداء الأكاديمي بمقدار ${drop} نقطة عن الفصل السابق`);
      reasonsEn.push(`Noticeable performance drop of ${drop} GPA points from previous semester`);
    }

    // 4. Failed courses
    const failedCourses = student.records.filter(r => r.status === 'FAILED');
    if (failedCourses.length >= 3) {
      score += 25;
      const codes = failedCourses.map(f => f.courseCode).join(', ');
      reasonsAr.push(`تراكم ${failedCourses.length} مقررات رسوب غير مجتازة: (${codes})`);
      reasonsEn.push(`Accumulation of ${failedCourses.length} failed courses: (${codes})`);
    } else if (failedCourses.length > 0) {
      score += failedCourses.length * 8;
      const codes = failedCourses.map(f => f.courseCode).join(', ');
      reasonsAr.push(`رسوب سابق في مقرر: (${codes})`);
      reasonsEn.push(`Previous failure in: (${codes})`);
    }

    // 5. Low Attendance checks
    const lowAttendance = student.records.filter(r => r.status === 'IN_PROGRESS' && (r.attendancePercentage ?? 100) < 75);
    if (lowAttendance.length > 0) {
      score += 25;
      for (const item of lowAttendance) {
        reasonsAr.push(`نسبة الحضور في ${item.courseCode} هي (${item.attendancePercentage}%) - أقل من 75% ومحروم من دخول النهائي محتملاً`);
        reasonsEn.push(`Attendance in ${item.courseCode} is (${item.attendancePercentage}%) - below 75% threshold (exam ban risk)`);
      }
    }

    // Determine Level
    let level: RiskLevel = 'LOW';
    let actionAr = 'الاستمرار في الخطة الدراسية الاعتيادية ومتابعة المتطلبات.';
    let actionEn = 'Continue standard study plan and monitor course milestones.';

    if (score >= 70) {
      level = 'CRITICAL';
      actionAr = 'إحالة عاجلة إلى المرشد الأكاديمي ولجنة الإرشاد، وتفعيل خطة إنقاذ المعدل وحصر التسجيل في 12 ساعة كحد أقصى.';
      actionEn = 'Urgent referral to academic advisor & committee; activate GPA recovery plan with max 12 credits load.';
    } else if (score >= 45) {
      level = 'HIGH';
      actionAr = 'إلزام الطالب بإعادة المقررات الراسب فيها وجلسة مراجعة إلزامية مع المرشد قبل تأكيد التسجيل.';
      actionEn = 'Mandate retaking failed courses and schedule mandatory advisor review before registration.';
    } else if (score >= 25) {
      level = 'MEDIUM';
      actionAr = 'تخفيف العبء الفصلي إلى 15 ساعة وتكثيف المتابعة في المقررات ذات الساعات الكثيفة.';
      actionEn = 'Moderate semester load to 15 credits and monitor high-weight core subjects.';
    }

    return {
      engineType: 'Explainable Rule-Based Risk Engine',
      level,
      score: Math.min(100, score),
      reasonsAr: reasonsAr.length > 0 ? reasonsAr : ['لا توجد مؤشرات خطر أكاديمي، الأداء مستقر وممتاز.'],
      reasonsEn: reasonsEn.length > 0 ? reasonsEn : ['No critical risk factors detected. Performance is healthy.'],
      recommendedActionAr: actionAr,
      recommendedActionEn: actionEn,
      isMLPredicted: false,
      mlFeatures: features,
    };
  }
}
