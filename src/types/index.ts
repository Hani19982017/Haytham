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
  sectionCode?: string; // e.g. "SEC-1", "SEC-2", "شعبة 1", "شعبة 2"
  semesterId: string;
  instructorId: string;
  instructorName: string;
  capacity: number;
  enrolledCount: number;
  lectureDayTimeAr: string;
  lectureDayTimeEn: string;
  days?: string[]; // e.g. ['Sun', 'Tue'] or ['الأحد', 'الثلاثاء']
  startTime?: string; // "10:00"
  endTime?: string; // "11:30"
  periods?: number[]; // [1, 2]
  hall: string;
}

export interface ScheduleConflict {
  courseCode1: string;
  courseName1Ar: string;
  courseName1En: string;
  section1: string;
  offeringId1: string;
  courseCode2: string;
  courseName2Ar: string;
  courseName2En: string;
  section2: string;
  offeringId2: string;
  day: string;
  dayAr: string;
  dayEn: string;
  timeRangeAr: string;
  timeRangeEn: string;
  alternativeSectionsFor1?: CourseOffering[];
  alternativeSectionsFor2?: CourseOffering[];
}

export interface RecommendedCourseItem {
  courseCode: string;
  courseNameAr: string;
  courseNameEn: string;
  credits: number;
  isMandatory: boolean;
  track?: AcademicTrack;
  offeringId: string;
  sectionCode: string;
  daysAr: string;
  daysEn: string;
  timeRangeAr: string;
  timeRangeEn: string;
  hall: string;
  primaryReasonAr: string;
  primaryReasonEn: string;
  detailedReasonsAr: string[];
  detailedReasonsEn: string[];
  prerequisitesStatusAr: string;
  prerequisitesStatusEn: string;
  importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL';
  isRetake: boolean;
  unlocksFutureCourses: string[];
  availableSeats: number;
}

export interface SemesterScheduleRecommendation {
  studentId: string;
  targetSemesterNameAr: string;
  targetSemesterNameEn: string;
  recommendedCredits: number;
  maxAllowedCredits: number;
  minCredits: number;
  studentGpa: number;
  academicStandingNoteAr: string;
  academicStandingNoteEn: string;
  recommendedCourses: RecommendedCourseItem[];
  rationaleAr: string[];
  rationaleEn: string[];
  hasWarning: boolean;
}

export interface RegistrationValidationDetails {
  valid: boolean;
  totalCredits: number;
  maxAllowedCredits: number;
  minCredits: number;
  prerequisiteErrors: {
    courseCode: string;
    courseNameAr: string;
    courseNameEn: string;
    missingPrereqCode: string;
    missingPrereqNameAr: string;
    missingPrereqNameEn: string;
    suggestedAlternativeCode?: string;
    suggestedAlternativeNameAr?: string;
    suggestedAlternativeNameEn?: string;
  }[];
  creditLimitError?: {
    totalCredits: number;
    maxAllowed: number;
    excessCredits: number;
    excessCourseCodes: string[];
  };
  minimumLoadWarning?: {
    totalCredits: number;
    minRequired: number;
    isGraduationSemester: boolean;
    noteAr: string;
    noteEn: string;
  };
  duplicateErrors: {
    courseCode: string;
    courseNameAr: string;
    courseNameEn: string;
    previousGrade: string;
    canRetake: boolean;
  }[];
  retakeNotices: {
    courseCode: string;
    courseNameAr: string;
    previousGrade: string;
    attempt: number;
    maxAllowedGrade: string;
    gpaImpactNoteAr: string;
    gpaImpactNoteEn: string;
  }[];
  capacityErrors: {
    courseCode: string;
    courseNameAr: string;
    sectionCode: string;
    offeringId: string;
    capacity: number;
    enrolledCount: number;
    alternativeSectionAvailable: boolean;
    alternativeSections?: CourseOffering[];
  }[];
  scheduleConflicts: ScheduleConflict[];
  errorsAr: string[];
  errorsEn: string[];
  warningsAr: string[];
  warningsEn: string[];
}

export interface ScheduleWhatIfResult {
  currentCredits: number;
  projectedCredits: number;
  currentGpa: number;
  projectedGpa: number;
  gpaChange: number;
  unlockedCoursesCount: number;
  unlockedCourses: string[];
  expectedGraduationSemesterAr: string;
  expectedGraduationSemesterEn: string;
  graduationDelayed: boolean;
  notesAr: string[];
  notesEn: string[];
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

export type PlannedCourse = PlannedSemester['courses'][number];

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
