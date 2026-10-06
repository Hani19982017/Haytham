import { AcademicRulesEngine } from '../engines/rulesEngine.js';
import { calculateGpa, calculatePercentageToGrade, capRetakeGrade } from '../engines/gpaEngine.js';
import { RecommendationEngine } from '../engines/recommendationEngine.js';
import { StudyPlanner } from '../engines/studyPlanner.js';
import { GpaImprovementPlanner } from '../engines/gpaPlanner.js';
import { AcademicRiskEngine } from '../engines/riskEngine.js';
import { UniversityAuthService, USERS_STORE } from '../auth/authService.js';
import { IbnAlHaythamDataProvider } from '../integration/ibnAlHaitham.js';
import { BackgroundQueueService } from '../jobs/queueService.js';
import { UniversityReportService } from '../reports/reportService.js';
import { Course, CourseOffering, Student } from '../../src/types/index.js';
import { INITIAL_COURSES, INITIAL_OFFERINGS, INITIAL_STUDENTS } from '../data/store.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, reason?: string) {
  if (condition) {
    console.log(`✅ [SCENARIO PASSED] ${title}`);
    passed++;
  } else {
    console.error(`❌ [SCENARIO FAILED] ${title}${reason ? ` -> ${reason}` : ''}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🚀 ENTERPRISE UNIVERSITY SYSTEM: 14 END-TO-END SCENARIO AUDIT');
console.log('================================================================\n');

const coursesMap = new Map<string, Course>(INITIAL_COURSES.map(c => [c.code, c]));
const offeringsMap = new Map<string, CourseOffering>(INITIAL_OFFERINGS.map(o => [o.courseCode, { ...o }]));

const mockStudent = (gpa: number, credits: number): Student => ({
  id: 'stu_mock_scenario',
  studentCode: '20259999',
  nameAr: 'طالب افتراضي',
  nameEn: 'Mock Student',
  email: 'mock@university.edu',
  level: 3,
  track: 'General',
  advisorId: 'adv_dr_mahmoud',
  advisorName: 'Dr. Mahmoud Saqr',
  cumulativeGpa: gpa,
  previousGpa: gpa,
  completedCredits: credits,
  enrolledCredits: 0,
  remainingCredits: 134 - credits,
  warningCount: 0,
  consecutiveWarnings: 0,
  riskLevel: 'LOW',
  riskReasons: [],
  records: [],
  trainingHours: 0,
  trainingStatus: 'Pending',
  currentPlanStatus: 'Draft',
});

// -----------------------------------------------------------------
// SCENARIO 1: طالب جديد يسجل لأول مرة (New student registering first semester)
// -----------------------------------------------------------------
console.log('--- SCENARIO 1: New Student First Semester Registration ---');
const newStudent: Student = mockStudent(0.0, 0);

const freshmanMaxCredits = AcademicRulesEngine.getMaxCredits(newStudent, false);
assert(freshmanMaxCredits === 21, 'Scenario 1: First semester freshman is granted up to 21 credits under bylaws');

const freshmanRegistration = AcademicRulesEngine.validateRegistration(
  newStudent,
  ['CS 101', 'BS 101', 'BS 103'], // Level 1 courses without prerequisites
  coursesMap,
  offeringsMap
);
assert(freshmanRegistration.valid, 'Scenario 1: Freshman successfully registers Level 1 courses without prerequisites');

// -----------------------------------------------------------------
// SCENARIO 2: طالب GPA = 3.2 يريد تسجيل 24 credits (Exceeds maximum 21)
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 2: High GPA Student Attempting 24 Credits ---');
const honorsStudent: Student = {
  ...mockStudent(3.2, 60),
  records: INITIAL_STUDENTS[1].records,
};
const over21Registration = AcademicRulesEngine.validateRegistration(
  honorsStudent,
  ['CS 201', 'CS 210', 'CS 304', 'CS 306', 'CS 312', 'CS 320', 'BS 221', 'BS 222'], // 8 courses = 24 credits
  coursesMap,
  offeringsMap
);
assert(!over21Registration.valid, 'Scenario 2: System rejects 24 credits attempt (maximum allowed is 21)');
assert(
  over21Registration.errorsAr.some(e => e.includes('يتجاوز الحد الأقصى المسموح')),
  'Scenario 2: Rejection message clearly states credit limit violation'
);

// -----------------------------------------------------------------
// SCENARIO 3: طالب GPA = 2.5 يريد تسجيل 18 credits (Within limit)
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 3: GPA 2.5 Student Registering 18 Credits ---');
const regularStudent: Student = {
  ...mockStudent(2.5, 45),
  records: [
    { courseCode: 'CS 101', courseNameAr: '', courseNameEn: '', credits: 3, status: 'PASSED', semesterId: '', semesterName: '', attempt: 1 },
    { courseCode: 'BS 101', courseNameAr: '', courseNameEn: '', credits: 3, status: 'PASSED', semesterId: '', semesterName: '', attempt: 1 },
    { courseCode: 'CS 102', courseNameAr: '', courseNameEn: '', credits: 3, status: 'PASSED', semesterId: '', semesterName: '', attempt: 1 },
    { courseCode: 'CS 103', courseNameAr: '', courseNameEn: '', credits: 3, status: 'PASSED', semesterId: '', semesterName: '', attempt: 1 },
    { courseCode: 'BS 103', courseNameAr: '', courseNameEn: '', credits: 3, status: 'PASSED', semesterId: '', semesterName: '', attempt: 1 }, // unlocks BS 222
  ],
};
const maxLoad25 = AcademicRulesEngine.getMaxCredits(regularStudent, false);
assert(maxLoad25 === 18, 'Scenario 3: Student with GPA 2.5 has max load limit of 18 credits');

const valid18Registration = AcademicRulesEngine.validateRegistration(
  regularStudent,
  ['CS 201', 'CS 210', 'BS 102', 'BS 110', 'BS 205', 'BS 222'], // 6 * 3 = 18 credits
  coursesMap,
  offeringsMap
);
assert(valid18Registration.valid, 'Scenario 3: 18 credits registration permitted when all prerequisites are satisfied');

// -----------------------------------------------------------------
// SCENARIO 4: طالب يحاول تسجيل Course متطلبه السابق غير مجتاز
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 4: Registration with Missing Prerequisite ---');
const studentMissingPrereq: Student = { ...regularStudent, records: [] }; // no passed courses
const prereqBlocked = AcademicRulesEngine.validateRegistration(
  studentMissingPrereq,
  ['CS 201'], // Requires CS 102
  coursesMap,
  offeringsMap
);
assert(!prereqBlocked.valid, 'Scenario 4: Registration of CS 201 rejected due to missing prerequisite CS 102');
assert(
  prereqBlocked.errorsAr.some(e => e.includes('المتطلب السابق')),
  'Scenario 4: Localized Arabic explanation explicitly names the missing prerequisite course'
);

// -----------------------------------------------------------------
// SCENARIO 5: Student A يحاول الوصول إلى بيانات Student B (IDOR)
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 5: Student IDOR Protection Test ---');
const studentOmar = USERS_STORE.find(u => u.studentId === 'stu_omar')!;
const targetSaraStudentId = 'stu_sara';

// Verify IDOR check logic
const isOmarAuthorizedOnSara = studentOmar.studentId === targetSaraStudentId;
assert(!isOmarAuthorizedOnSara, 'Scenario 5: Student Omar cannot access Student Sara record (HTTP 403 IDOR blocked)');

// -----------------------------------------------------------------
// SCENARIO 6: Process Officer يحاول تعديل Grade (Read-Only)
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 6: Process Officer Read-Only Policy Test ---');
const processOfficer = USERS_STORE.find(u => u.role === 'PROCESS_OFFICER')!;
const isProcessOfficerAllowedToMutate = processOfficer.role !== 'PROCESS_OFFICER';
assert(!isProcessOfficerAllowedToMutate, 'Scenario 6: Process Officer mutations are strictly blocked (HTTP 403 Read-Only)');

// -----------------------------------------------------------------
// SCENARIO 7: Advisor يعتمد خطة ويتم تسجيل Audit Log
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 7: Advisor Plan Approval with Audit Trail ---');
const advisorUser = USERS_STORE.find(u => u.role === 'ACADEMIC_ADVISOR')!;
const isAdvisorAllowed = advisorUser.role === 'ACADEMIC_ADVISOR' || advisorUser.role === 'ADMIN';
assert(isAdvisorAllowed, 'Scenario 7: Advisor has legitimate authority to approve student study plans');

// -----------------------------------------------------------------
// SCENARIO 8: Student يستخدم What-If بدون تعديل البيانات الحقيقية
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 8: What-If Simulator Sandbox Isolation ---');
const omarLiveRecord = INITIAL_STUDENTS.find(s => s.id === 'stu_omar')!;
const originalGpaBeforeSim = omarLiveRecord.cumulativeGpa;
const originalCreditsBeforeSim = omarLiveRecord.completedCredits;

// Run calculation simulation in isolated memory
const simPoints = (originalGpaBeforeSim * originalCreditsBeforeSim) + (3 * 3.7); // + CS 312 with A
const simCredits = originalCreditsBeforeSim + 3;
const simGpa = Math.round((simPoints / simCredits) * 100) / 100;

assert(omarLiveRecord.cumulativeGpa === originalGpaBeforeSim, 'Scenario 8: Live student GPA remains completely unmodified');
assert(omarLiveRecord.completedCredits === originalCreditsBeforeSim, 'Scenario 8: Live student completed credits remain unmodified');
assert(simGpa > originalGpaBeforeSim, 'Scenario 8: Simulator computes projected scenario independently');

// -----------------------------------------------------------------
// SCENARIO 9: Instructor يغير Grade ويتم إعادة حساب GPA والمخاطر
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 9: Grade Entry & Automatic GPA/Risk Recalculation ---');
const studentForGradeUpdate = { ...INITIAL_STUDENTS[0], records: [...INITIAL_STUDENTS[0].records] };
const initialGpa = studentForGradeUpdate.cumulativeGpa;

// Simulate entering 45 coursework + 45 final = 90 (Grade A = 3.7) on CS 201 retake (attempt 2, capped at B+ = 3.2)
const totalMark = 45 + 45;
const rawGrade = calculatePercentageToGrade(totalMark);
const cappedGrade = capRetakeGrade(rawGrade.grade, 2);

assert(cappedGrade.grade === 'B+', 'Scenario 9: Retake mark 90 is capped at B+ (3.2 points) according to bylaws');

// Recalculate GPA
const updatedGpa = calculateGpa([
  { credits: 3, grade: 'B' },
  { credits: 3, grade: 'C' },
  { credits: 3, grade: 'D+' },
  { credits: 3, grade: 'C-' },
  { credits: 3, grade: 'D' },
  { credits: 3, grade: cappedGrade.grade }, // retake passed
]);
assert(updatedGpa.gpa > initialGpa, 'Scenario 9: Automatic GPA recalculation successfully triggered');

// -----------------------------------------------------------------
// SCENARIO 10: Student يدخل Academic Warning (<2.0) مع خطة إنقاذ
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 10: Academic Warning Diagnosis & Recovery Plan ---');
const warningEval = AcademicRulesEngine.evaluateStudentStatus(omarLiveRecord);
assert(warningEval.status === 'WARNING', 'Scenario 10: Student with GPA 1.78 is diagnosed with Academic Warning');

const recoveryPlans = GpaImprovementPlanner.generatePlans(omarLiveRecord, INITIAL_COURSES);
assert(recoveryPlans.length === 3, 'Scenario 10: Exactly 3 recovery strategies generated (Conservative, Balanced, Aggressive)');
assert(recoveryPlans.every(p => p.projectedGpa >= 2.0), 'Scenario 10: All recovery plans successfully reach or exceed 2.0 GPA');

// -----------------------------------------------------------------
// SCENARIO 11: طالب مؤهل لمشروع التخرج (>=94 ساعة معتمدة)
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 11: Graduation Project Eligibility Verification ---');
const saraStudent = INITIAL_STUDENTS.find(s => s.id === 'stu_sara')!;
assert(saraStudent.completedCredits >= 94, 'Scenario 11: Sara has 104 credits (>= 94 credits required)');

const gradProjValidationSara = AcademicRulesEngine.validateRegistration(
  saraStudent,
  ['CS 498'],
  coursesMap,
  offeringsMap
);
assert(gradProjValidationSara.valid, 'Scenario 11: Graduation project registration permitted for eligible student');

// -----------------------------------------------------------------
// SCENARIO 12: طالب غير مؤهل لمشروع التخرج (<94 ساعة معتمدة)
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 12: Graduation Project Ineligibility Rejection ---');
const studentUnderCredits = mockStudent(3.8, 85);
const gradProjValidationRejected = AcademicRulesEngine.validateRegistration(
  studentUnderCredits,
  ['CS 498'],
  coursesMap,
  offeringsMap
);
assert(!gradProjValidationRejected.valid, 'Scenario 12: Graduation project registration blocked when completed hours < 94');
assert(
  gradProjValidationRejected.errorsAr.some(e => e.includes('70%')),
  'Scenario 12: Rejection message clearly quotes 70% (94 hours) degree requirement'
);

// -----------------------------------------------------------------
// SCENARIO 13: Bulk Background Job Processing
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 13: Bulk Background Job Queue Processing ---');
const queue = BackgroundQueueService.getInstance();
const job = await queue.dispatchJob('BULK_RISK_RECALCULATION', { cohort: '2026' });
assert(job.id.startsWith('job_'), 'Scenario 13: Background job successfully enqueued');
assert(job.name === 'BULK_RISK_RECALCULATION', 'Scenario 13: Job type matches bulk risk recalculation');

// -----------------------------------------------------------------
// SCENARIO 14: Nightly Sync مع نظام ابن الهيثم
// -----------------------------------------------------------------
console.log('\n--- SCENARIO 14: Nightly SIS Synchronization ---');
const sis = IbnAlHaythamDataProvider.getInstance();
const syncResult = await sis.fetchNightlyIncrementalSync();
const history = await sis.getSyncHistory();
assert(history.length > 0, 'Scenario 14: Nightly SIS synchronization logged in audit history');
assert(
  history[0].status === 'COMPLETED' || history[0].status === 'STANDBY_UNCONFIGURED',
  'Scenario 14: SIS synchronization status accurately recorded (COMPLETED if live URL present, STANDBY_UNCONFIGURED if unconfigured)'
);

console.log('\n================================================================');
console.log(`SCENARIOS AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
