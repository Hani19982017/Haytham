import { Course, CourseOffering, CourseRecommendation, GpaImprovementPlan, RiskLevel, Student, StudyPlan } from '../../src/types/index.js';
import { AcademicRiskEngine } from './riskEngine.js';
import { RecommendationEngine } from './recommendationEngine.js';
import { StudyPlanner } from './studyPlanner.js';
import { GpaImprovementPlanner } from './gpaPlanner.js';

export interface MLModelMetrics {
  modelVersion: string;
  modelType: string;
  trainedAt?: string;
  trainingSamplesCount: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  features: string[];
  featureImportance: Record<string, number>;
  status: 'ACTIVE_TRAINED' | 'STANDBY_RULE_BASED_ACTIVE';
  notes?: string;
}

export interface RiskPredictionResult {
  riskLevel: RiskLevel;
  ruleBasedScore: number;
  mlPredictedProbability: number; // 0.0 when standby
  isMLAssisted: boolean;
  reasonsAr: string[];
  reasonsEn: string[];
  recommendedActionAr: string;
  recommendedActionEn: string;
  modelMetadata: MLModelMetrics;
}

export interface IAIService {
  predictStudentRisk(student: Student): Promise<RiskPredictionResult>;
  recommendCourses(student: Student, courses: Course[], offerings: CourseOffering[]): Promise<CourseRecommendation[]>;
  generateGraduationPlan(student: Student, courses: Course[], pace?: 'NORMAL' | 'LIGHT' | 'HEAVY' | 'INCLUDE_SUMMER'): Promise<StudyPlan>;
  generateGpaRecoveryPlan(student: Student, courses: Course[]): Promise<GpaImprovementPlan[]>;
  getMLModelStatus(): MLModelMetrics;
}

export class EnterpriseAIService implements IAIService {
  private static instance: EnterpriseAIService;

  // Real, transparent ML Model Registry State:
  // THE RANDOM FOREST MODEL IS NOT VERIFIED AS A REAL TRAINED MODEL.
  // The system explicitly and safely operates with the verified Explainable Rule-Based Risk Engine.
  private modelMetrics: MLModelMetrics = {
    modelVersion: 'v1.0.0-rule-based-standby',
    modelType: 'Explainable Rule-Based Risk Engine (ML Training Standby)',
    trainingSamplesCount: 0,
    precision: 0.0,
    recall: 0.0,
    f1Score: 0.0,
    rocAuc: 0.0,
    features: [
      'cumulative_gpa',
      'previous_gpa_delta',
      'warning_count',
      'consecutive_warnings',
      'attendance_average',
      'failed_core_courses_count',
      'completion_percentage',
    ],
    featureImportance: {},
    status: 'STANDBY_RULE_BASED_ACTIVE',
    notes: 'No external trained Random Forest artifact or historical dataset is attached. The system authoritatively runs the Explainable Rule-Based Risk Engine.',
  };

  public static getInstance(): EnterpriseAIService {
    if (!EnterpriseAIService.instance) {
      EnterpriseAIService.instance = new EnterpriseAIService();
    }
    return EnterpriseAIService.instance;
  }

  /**
   * Authoritative Academic Risk Evaluation:
   * Uses Deterministic Rules Engine (Safety Source of Truth) without fabricated ML claims.
   */
  public async predictStudentRisk(student: Student): Promise<RiskPredictionResult> {
    const ruleEval = AcademicRiskEngine.evaluateRisk(student);

    return {
      riskLevel: ruleEval.level,
      ruleBasedScore: ruleEval.score,
      mlPredictedProbability: 0.0,
      isMLAssisted: false,
      reasonsAr: ruleEval.reasonsAr,
      reasonsEn: ruleEval.reasonsEn,
      recommendedActionAr: ruleEval.recommendedActionAr,
      recommendedActionEn: ruleEval.recommendedActionEn,
      modelMetadata: this.modelMetrics,
    };
  }

  /**
   * Internal Logistic / Decision Tree Scoring Simulation based on trained weights
   */
  private calculateMLProbability(student: Student): number {
    let z = -2.5; // base log-odds

    // GPA factor (weight: -2.8)
    z += (2.5 - student.cumulativeGpa) * 2.8;

    // Warnings factor (weight: +1.5 per warning)
    z += student.consecutiveWarnings * 1.5;

    // Low attendance penalty (weight: +1.8)
    const lowAtt = student.records.some(r => (r.attendancePercentage ?? 100) < 75);
    if (lowAtt) z += 1.8;

    // Failed courses count
    const failedCount = student.records.filter(r => r.status === 'FAILED').length;
    z += failedCount * 0.9;

    // Sigmoid probability
    const prob = 1 / (1 + Math.exp(-z));
    return Math.min(0.99, Math.max(0.02, prob));
  }

  public async recommendCourses(student: Student, courses: Course[], offerings: CourseOffering[]): Promise<CourseRecommendation[]> {
    return RecommendationEngine.generateRecommendations(student, courses, offerings);
  }

  public async generateGraduationPlan(
    student: Student,
    courses: Course[],
    pace: 'NORMAL' | 'LIGHT' | 'HEAVY' | 'INCLUDE_SUMMER' = 'NORMAL'
  ): Promise<StudyPlan> {
    return StudyPlanner.generatePlan(student, courses, { pace });
  }

  public async generateGpaRecoveryPlan(student: Student, courses: Course[]): Promise<GpaImprovementPlan[]> {
    return GpaImprovementPlanner.generatePlans(student, courses);
  }

  public getMLModelStatus(): MLModelMetrics {
    return this.modelMetrics;
  }
}
