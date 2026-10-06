export type UserRole = 
  | 'ADMIN' 
  | 'INSTRUCTOR' 
  | 'ACADEMIC_ADVISOR' 
  | 'STUDENT' 
  | 'PROCESS_OFFICER' 
  | 'DEPARTMENT_HEAD';

export type AcademicTrack = 'General' | 'Networks & Cyber Security' | 'Artificial Intelligence';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PlanStatus = 'Draft' | 'Pending Review' | 'Approved' | 'Rejected' | 'Archived';

export type TrainingStatus = 'Pending' | 'Accepted' | 'Passed' | 'Failed';

export interface Course {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  credits: number;
  level: number;
  semester: 1 | 2; // Fall = 1, Spring = 2
  isMandatory: boolean;
  track?: AcademicTrack;
  prerequisites: string[]; // Course codes
  department: string;
  unlockedCoursesCount?: number;
  descriptionAr?: string;
  descriptionEn?: string;
}

export interface StudentCourseRecord {
  courseCode: string;
  courseNameAr: string;
  courseNameEn: string;
  credits: number;
  grade?: string; // A+, B, F, etc.
  gradePoints?: number;
  status: 'PASSED' | 'FAILED' | 'ENROLLED' | 'IN_PROGRESS';
  semesterId: string;
  semesterName: string;
  attempt: number;
  attendancePercentage?: number;
  courseworkMark?: number; // e.g. out of 50
  finalMark?: number;      // e.g. out of 50
  totalMark?: number;      // e.g. out of 100
}

export interface Student {
  id: string;
  studentCode: string;
  nameAr: string;
  nameEn: string;
  email: string;
  level: number;
  track: AcademicTrack;
  advisorId: string;
  advisorName: string;
  cumulativeGpa: number;
  previousGpa: number;
  completedCredits: number;
  enrolledCredits: number;
  remainingCredits: number;
  warningCount: number;
  consecutiveWarnings: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
  records: StudentCourseRecord[];
  trainingHours: number;
  trainingStatus: TrainingStatus;
  currentPlanStatus: PlanStatus;
}

export interface CourseOffering {
  id: string;
  courseCode: string;
  semesterId: string;
  instructorId: string;
  instructorName: string;
  capacity: number;
  enrolledCount: number;
  lectureDayTimeAr: string;
  lectureDayTimeEn: string;
  hall: string;
}

export interface AcademicRuleConfig {
  id: string;
  key: string;
  titleAr: string;
  titleEn: string;
  value: any;
  defaultValue: any;
  needsVerification: boolean;
  notesAr: string;
  notesEn: string;
}

export interface AuditLogItem {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  detailsAr: string;
  detailsEn: string;
  before?: any;
  after?: any;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  type: 'WARNING' | 'RISK' | 'APPROVAL' | 'REGISTRATION' | 'GRADE' | 'GENERAL';
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  createdAt: string;
  read: boolean;
}

export interface CourseRecommendation {
  courseCode: string;
  courseNameAr: string;
  courseNameEn: string;
  credits: number;
  isMandatory: boolean;
  track?: AcademicTrack;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL';
  score: number;
  reasonsAr: string[];
  reasonsEn: string[];
  prerequisitesMet: boolean;
  prerequisites: string[];
  unlocksCount: number;
  seatAvailable: boolean;
  availableSeats: number;
  capacity: number;
  isRetake: boolean;
  impactAr: string;
  impactEn: string;
}

export interface PlannedSemester {
  semesterIndex: number;
  semesterNameAr: string;
  semesterNameEn: string;
  type: 'FALL' | 'SPRING' | 'SUMMER';
  courses: {
    courseCode: string;
    courseNameAr: string;
    courseNameEn: string;
    credits: number;
    isRetake: boolean;
    isMandatory: boolean;
  }[];
  totalCredits: number;
  expectedGpa?: number;
  riskNoteAr?: string;
  riskNoteEn?: string;
}

export interface StudyPlan {
  id: string;
  studentId: string;
  status: PlanStatus;
  advisorNotes?: string;
  createdAt: string;
  updatedAt: string;
  semesters: PlannedSemester[];
  expectedGraduationSemesterAr: string;
  expectedGraduationSemesterEn: string;
  totalPlannedCredits: number;
}

export interface GpaImprovementPlan {
  strategy: 'Conservative' | 'Balanced' | 'Aggressive';
  titleAr: string;
  titleEn: string;
  targetGpa: number;
  projectedGpa: number;
  semestersNeeded: number;
  creditHoursTotal: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  descriptionAr: string;
  descriptionEn: string;
  courses: {
    courseCode: string;
    courseNameAr: string;
    courseNameEn: string;
    credits: number;
    currentGrade?: string;
    targetGrade: string;
    isRetake: boolean;
    maxPossibleGrade: string;
  }[];
}
