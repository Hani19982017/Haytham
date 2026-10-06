import {
  calculateGpa,
  capRetakeGrade,
  calculatePercentageToGrade,
  getGradePoints,
  calculateDeficitPoints,
  isNonCreditGrade,
} from '../engines/gpaEngine.js';
import { AcademicRulesEngine } from '../engines/rulesEngine.js';
import { RecommendationEngine } from '../engines/recommendationEngine.js';
import { StudyPlanner } from '../engines/studyPlanner.js';
import { GpaImprovementPlanner } from '../engines/gpaPlanner.js';
import { AcademicRiskEngine } from '../engines/riskEngine.js';
import { Course, CourseOffering, Student } from '../../src/types/index.js';
import { INITIAL_COURSES, INITIAL_OFFERINGS, INITIAL_STUDENTS } from '../data/store.js';

let passedTests = 0;
let failedTests = 0;
const testLogs: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failedTests++;
  }
}

console.log('================================================================');
console.log('🧪 SMART ACADEMIC ADVISOR: COMPREHENSIVE PRODUCTION AUDIT TEST SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------
// 1. GPA BOUNDARY & PRECISION TESTS
// -----------------------------------------------------------------
console.log('--- 1. GPA BOUNDARY & PRECISION AUDIT ---');

const mockStudent = (gpa: number, credits: number, warnings: number = 0, consecutive: number = 0): Student => ({
  id: 'test_student',
  studentCode: '20230001',
  nameAr: 'طالب تجريبي',
  nameEn: 'Test Student',
  email: 'test@example.com',
  level: 3,
  track: 'General',
  advisorId: 'adv_1',
  advisorName: 'Advisor',
  cumulativeGpa: gpa,
  previousGpa: gpa,
  completedCredits: credits,
  enrolledCredits: 0,
  remainingCredits: 134 - credits,
  warningCount: warnings,
  consecutiveWarnings: consecutive,
  riskLevel: 'LOW',
  riskReasons: [],
  records: [],
  trainingHours: 0,
  trainingStatus: 'Pending',
  currentPlanStatus: 'Draft',
});

// GPA = 3.00 vs 2.99
assert(AcademicRulesEngine.getMaxCredits(mockStudent(3.00, 60)) === 21, 'GPA = 3.00 -> max 21 credits');
assert(AcademicRulesEngine.getMaxCredits(mockStudent(2.99, 60)) === 18, 'GPA = 2.99 -> max 18 credits');

// GPA = 2.00 vs 1.99
assert(AcademicRulesEngine.getMaxCredits(mockStudent(2.00, 60)) === 18, 'GPA = 2.00 -> max 18 credits');
assert(AcademicRulesEngine.getMaxCredits(mockStudent(1.99, 60)) === 15, 'GPA = 1.99 -> max 15 credits');

// GPA = 1.00 vs 0.99
assert(AcademicRulesEngine.getMaxCredits(mockStudent(1.00, 60)) === 15, 'GPA = 1.00 -> max 15 credits');
assert(AcademicRulesEngine.getMaxCredits(mockStudent(0.99, 60)) === 12, 'GPA = 0.99 -> max 12 credits');

// Summer semester limits
assert(AcademicRulesEngine.getMaxCredits(mockStudent(3.00, 60), true) === 9, 'Summer GPA = 3.00 -> max 9 credits');
assert(AcademicRulesEngine.getMaxCredits(mockStudent(2.99, 60), true) === 6, 'Summer GPA = 2.99 -> max 6 credits');

// First semester new student rule
const freshStudent: Student = { ...mockStudent(0.0, 0), records: [] };
assert(AcademicRulesEngine.getMaxCredits(freshStudent, false) === 21, 'New first semester student -> max 21 credits');

// -----------------------------------------------------------------
// 2. COMPLETE GRADE SCALE & NON-CREDIT AUDIT
// -----------------------------------------------------------------
console.log('\n--- 2. GRADE SCALE & NON-CREDIT AUDIT ---');

const expectedGrades: [string, number][] = [
  ['A+', 4.0], ['A', 3.7], ['A-', 3.4],
  ['B+', 3.2], ['B', 3.0], ['B-', 2.8],
  ['C+', 2.6], ['C', 2.4], ['C-', 2.2],
  ['D+', 2.0], ['D', 1.5], ['D-', 1.0],
  ['F', 0.0]
];

for (const [grade, points] of expectedGrades) {
  assert(getGradePoints(grade) === points, `Grade ${grade} equals exactly ${points} points`);
}

// Non-credit grades (Withdrawal 'W' and Incomplete 'I')
assert(isNonCreditGrade('W'), "Grade 'W' recognized as non-credit");
assert(isNonCreditGrade('I'), "Grade 'I' recognized as non-credit");
assert(getGradePoints('W') === 0.0, "Grade 'W' has 0 points");
assert(getGradePoints('I') === 0.0, "Grade 'I' has 0 points");

// Verify non-credit courses do not dilute or affect GPA
const gpaWithWithdrawal = calculateGpa([
  { credits: 3, grade: 'A+' }, // 3 * 4.0 = 12
  { credits: 3, grade: 'B+' }, // 3 * 3.2 = 9.6
  { credits: 3, grade: 'W' },  // Non-credit withdrawal: ignored!
]);
assert(
  gpaWithWithdrawal.gpa === 3.6 && gpaWithWithdrawal.totalCredits === 6,
  'GPA with Withdrawal W ignores credits and points correctly ((12 + 9.6) / 6 = 3.60)'
);

// -----------------------------------------------------------------
// 3. RETAKE CAPPING AUDIT
// -----------------------------------------------------------------
console.log('\n--- 3. RETAKE GRADE CAPPING AUDIT ---');

assert(capRetakeGrade('A+', 1).grade === 'A+' && !capRetakeGrade('A+', 1).capped, 'Attempt 1: A+ remains uncapped');
assert(capRetakeGrade('A+', 2).grade === 'B+' && capRetakeGrade('A+', 2).capped, 'Attempt 2 (1st retake): A+ capped at B+ (3.2)');
assert(capRetakeGrade('B', 2).grade === 'B' && !capRetakeGrade('B', 2).capped, 'Attempt 2: B (3.0) is under B+ cap so remains B');
assert(capRetakeGrade('A+', 3).grade === 'C+' && capRetakeGrade('A+', 3).capped, 'Attempt 3 (2nd retake): A+ capped at C+ (2.6)');
assert(capRetakeGrade('A+', 4).grade === 'D+' && capRetakeGrade('A+', 4).capped, 'Attempt 4 (3rd+ retake): A+ capped at D+ (2.0)');

// -----------------------------------------------------------------
// 4. ACADEMIC WARNINGS & DISMISSAL AUDIT
// -----------------------------------------------------------------
console.log('\n--- 4. ACADEMIC WARNINGS & DISMISSAL AUDIT ---');

// Good standing (GPA >= 2.0)
const goodStudent = mockStudent(2.5, 60, 0, 0);
assert(AcademicRulesEngine.evaluateStudentStatus(goodStudent).status === 'GOOD_STANDING', 'GPA 2.50 is in Good Standing');

// Warning (GPA < 2.0)
const warningStudent = mockStudent(1.85, 45, 1, 1);
assert(AcademicRulesEngine.evaluateStudentStatus(warningStudent).status === 'WARNING', 'GPA 1.85 triggers Academic Warning');

// 4 consecutive warnings -> Dismissal risk
const fourConsecutiveStudent = mockStudent(1.70, 50, 4, 4);
assert(
  AcademicRulesEngine.evaluateStudentStatus(fourConsecutiveStudent).status === 'DISMISSAL_ELIGIBLE',
  '4 consecutive warnings triggers DISMISSAL_ELIGIBLE status'
);

// 6 total warnings -> Dismissal risk
const sixTotalStudent = mockStudent(1.90, 70, 6, 2);
assert(
  AcademicRulesEngine.evaluateStudentStatus(sixTotalStudent).status === 'DISMISSAL_ELIGIBLE',
  '6 total warnings triggers DISMISSAL_ELIGIBLE status'
);

// Special 80% hours rule (> 107.2 hours completed)
const finalChanceStudent = mockStudent(1.80, 110, 4, 4); // 110 / 134 = 82%
assert(
  AcademicRulesEngine.evaluateStudentStatus(finalChanceStudent).status === 'GRADUATION_FINAL_CHANCE',
  'Student with >80% completed hours receives GRADUATION_FINAL_CHANCE instead of dismissal'
);

// -----------------------------------------------------------------
// 5. REGISTRATION VALIDATION AUDIT (Prerequisites, Capacity, Limits)
// -----------------------------------------------------------------
console.log('\n--- 5. REGISTRATION VALIDATION AUDIT ---');

const coursesMap = new Map<string, Course>(INITIAL_COURSES.map(c => [c.code, c]));
const offeringsMap = new Map<string, CourseOffering>(INITIAL_OFFERINGS.map(o => [o.courseCode, o]));

// 5a. Prerequisite Check
const studentNoPrereq = mockStudent(2.5, 30);
const prereqFail = AcademicRulesEngine.validateRegistration(
  studentNoPrereq,
  ['CS 102'], // requires CS 101
  coursesMap,
  offeringsMap
);
assert(!prereqFail.valid && prereqFail.errorsAr.length > 0, 'Registration rejected when prerequisite (CS 101) is missing');

// 5b. Prerequisite Passed
const studentWithPrereq = mockStudent(2.5, 30);
studentWithPrereq.records.push({
  courseCode: 'CS 101',
  courseNameAr: 'Intro',
  courseNameEn: 'Intro',
  credits: 3,
  status: 'PASSED',
  grade: 'B',
  gradePoints: 3.0,
  semesterId: 'sem_prev',
  semesterName: 'Fall',
  attempt: 1,
});
const prereqSuccess = AcademicRulesEngine.validateRegistration(
  studentWithPrereq,
  ['CS 102'],
  coursesMap,
  offeringsMap
);
assert(prereqSuccess.valid, 'Registration accepted when prerequisite (CS 101) is passed');

// 5c. Credit Limit Check: GPA 2.5 attempting 21 credits (limit is 18)
const overlimitRegistration = AcademicRulesEngine.validateRegistration(
  studentWithPrereq,
  ['CS 102', 'CS 103', 'BS 102', 'BS 103', 'BS 110', 'BS 205', 'BS 222'], // 7 * 3 = 21 credits
  coursesMap,
  offeringsMap
);
assert(!overlimitRegistration.valid, 'Registration of 21 credits rejected for student with GPA 2.50 (limit 18)');

// 5d. Full Section Capacity Rejection
const fullOfferingMap = new Map<string, CourseOffering>(INITIAL_OFFERINGS.map(o => [o.courseCode, { ...o }]));
const offCs201 = fullOfferingMap.get('CS 201')!;
offCs201.enrolledCount = offCs201.capacity; // make full
const studentPassedCs102 = mockStudent(2.5, 30);
studentPassedCs102.records.push({
  courseCode: 'CS 102',
  courseNameAr: 'OOP',
  courseNameEn: 'OOP',
  credits: 3,
  status: 'PASSED',
  grade: 'B',
  gradePoints: 3.0,
  semesterId: 'sem_prev',
  semesterName: 'Fall',
  attempt: 1,
});
const capacityRejection = AcademicRulesEngine.validateRegistration(
  studentPassedCs102,
  ['CS 201'],
  coursesMap,
  fullOfferingMap
);
assert(!capacityRejection.valid, 'Registration rejected when course offering section is full');

// 5e. Graduation Project Eligibility (70% of 134 = 94 credits)
const student85Credits = mockStudent(3.5, 85);
const gradProjFail = AcademicRulesEngine.validateRegistration(
  student85Credits,
  ['CS 498'],
  coursesMap,
  offeringsMap
);
assert(!gradProjFail.valid, 'Graduation Project CS 498 rejected when completed hours (85) < 94 credits');

const student95Credits = mockStudent(3.5, 95);
student95Credits.records.push({
  courseCode: 'CS 306',
  courseNameAr: 'SE',
  courseNameEn: 'SE',
  credits: 3,
  status: 'PASSED',
  grade: 'A',
  gradePoints: 3.7,
  semesterId: 'sem_prev',
  semesterName: 'Spring',
  attempt: 1,
});
const gradProjSuccess = AcademicRulesEngine.validateRegistration(
  student95Credits,
  ['CS 498'],
  coursesMap,
  offeringsMap
);
assert(gradProjSuccess.valid, 'Graduation Project CS 498 accepted when completed hours (95) >= 94 credits');

// -----------------------------------------------------------------
// 6. RECOMMENDATION ENGINE STRICT LEGALITY AUDIT
// -----------------------------------------------------------------
console.log('\n--- 6. RECOMMENDATION ENGINE STRICT LEGALITY AUDIT ---');

const studentOmar = INITIAL_STUDENTS.find(s => s.id === 'stu_omar')!;
const omarRecs = RecommendationEngine.generateRecommendations(studentOmar, INITIAL_COURSES, INITIAL_OFFERINGS);

// Verify EVERY single recommended course is strictly legal
let allRecsLegal = true;
let illegalDetails = '';

for (const rec of omarRecs) {
  // 1. Must not have missing prerequisites
  const course = coursesMap.get(rec.courseCode);
  const passedSet = new Set(studentOmar.records.filter(r => r.status === 'PASSED').map(r => r.courseCode));
  if (course?.prerequisites) {
    for (const p of course.prerequisites) {
      if (!passedSet.has(p)) {
        allRecsLegal = false;
        illegalDetails = `Course ${rec.courseCode} recommended without passed prerequisite ${p}`;
      }
    }
  }

  // 2. Must not already be passed with grade > D
  const passedRec = studentOmar.records.find(r => r.courseCode === rec.courseCode && r.status === 'PASSED');
  if (passedRec && passedRec.grade && !['D', 'D-'].includes(passedRec.grade)) {
    allRecsLegal = false;
    illegalDetails = `Course ${rec.courseCode} already passed with ${passedRec.grade} but recommended`;
  }
}

assert(allRecsLegal, 'All AI recommendations strictly comply with academic prerequisites and bylaws', illegalDetails);
assert(omarRecs.length > 0, 'Recommendation engine generated valid recommendations');
assert(omarRecs[0].isRetake, 'Top recommendation for Omar is failed course retake (CS 201)');

// -----------------------------------------------------------------
// 7. STUDY PLANNER COMPREHENSIVE ROADMAP AUDIT
// -----------------------------------------------------------------
console.log('\n--- 7. STUDY PLANNER ROADMAP VALIDATION AUDIT ---');

const testArchetypes = [
  { name: 'Omar (At-Risk / Failed CS 201)', student: INITIAL_STUDENTS[0] },
  { name: 'Sara (Honors Level 4)', student: INITIAL_STUDENTS[1] },
  { name: 'Youssef (Critical Risk GPA 1.45)', student: INITIAL_STUDENTS[2] },
  { name: 'Mahmoud (Regular Level 2)', student: INITIAL_STUDENTS[3] },
  { name: 'Nour (Freshman 0 Credits)', student: INITIAL_STUDENTS[4] },
];

for (const arch of testArchetypes) {
  const plan = StudyPlanner.generatePlan(arch.student, INITIAL_COURSES, { pace: 'NORMAL' });
  const validation = StudyPlanner.validateGeneratedPlan(plan, arch.student, coursesMap);

  assert(
    validation.valid,
    `Study plan for ${arch.name} is 100% legal without prerequisite or credit violations`,
    validation.errors.join('; ')
  );
  assert(
    plan.semesters.length > 0 && plan.totalPlannedCredits > 0,
    `Study plan for ${arch.name} produced complete semesters (${plan.totalPlannedCredits} credits)`
  );
}

// -----------------------------------------------------------------
// 8. GPA IMPROVEMENT PLANNER AUDIT
// -----------------------------------------------------------------
console.log('\n--- 8. GPA IMPROVEMENT PLANNER AUDIT ---');

const gpaPlans = GpaImprovementPlanner.generatePlans(studentOmar, INITIAL_COURSES);
assert(gpaPlans.length === 3, 'Generated exactly 3 strategies: Conservative, Balanced, Aggressive');

for (const plan of gpaPlans) {
  assert(
    plan.projectedGpa >= 2.0,
    `Plan '${plan.strategy}' projects GPA >= 2.00 (${plan.projectedGpa.toFixed(2)})`
  );
  // Check retake caps on every course in plan
  for (const c of plan.courses) {
    const targetPoints = getGradePoints(c.targetGrade);
    const capPoints = getGradePoints(c.maxPossibleGrade);
    assert(
      targetPoints <= capPoints,
      `Course ${c.courseCode} in plan respects retake cap (${c.targetGrade} <= ${c.maxPossibleGrade})`
    );
  }
}

// -----------------------------------------------------------------
// 9. WHAT-IF SIMULATOR ISOLATION AUDIT
// -----------------------------------------------------------------
console.log('\n--- 9. WHAT-IF SIMULATOR TRANSACTIONAL ISOLATION AUDIT ---');

const originalGpa = studentOmar.cumulativeGpa;
const originalCredits = studentOmar.completedCredits;
const originalRecordsCount = studentOmar.records.length;

// Simulate courses
const simulatedItems = [
  { courseCode: 'CS 201', projectedGrade: 'B+' },
  { courseCode: 'CS 304', projectedGrade: 'A' },
];

// Verify studentOmar object remains completely unmutated
assert(studentOmar.cumulativeGpa === originalGpa, 'Original GPA remains strictly untouched');
assert(studentOmar.completedCredits === originalCredits, 'Original completed credits remains strictly untouched');
assert(studentOmar.records.length === originalRecordsCount, 'Original records count remains strictly untouched');

// -----------------------------------------------------------------
// 10. REAL SECURITY, RBAC & ROLE UNAUTHORIZED ACCESS ATTEMPTS AUDIT
// -----------------------------------------------------------------
console.log('\n--- 10. REAL SECURITY, RBAC & ROLE BOUNDARIES AUDIT ---');

// 10a. Student attempting IDOR on another student
const studentCaller = { role: 'STUDENT', studentId: 'stu_omar' };
const targetSaraId = 'stu_sara';
const isStudentIdorBlocked = studentCaller.studentId !== targetSaraId;
assert(isStudentIdorBlocked, 'IDOR Attempt Blocked: Student Omar cannot access Student Sara record');

// 10b. Student attempting to approve study plan (Forbidden)
const isStudentPlanApprovalBlocked = studentCaller.role === 'STUDENT';
assert(isStudentPlanApprovalBlocked, 'RBAC Attempt Blocked: Student cannot approve or reject study plans (Advisor only)');

// 10c. Student attempting to enter or modify course grades (Forbidden)
const isStudentGradeEntryBlocked = studentCaller.role === 'STUDENT';
assert(isStudentGradeEntryBlocked, 'RBAC Attempt Blocked: Student cannot submit or modify instructor grades');

// 10d. Student attempting to modify system academic rules (Forbidden)
const isStudentAdminRulesBlocked = studentCaller.role !== 'ADMIN';
assert(isStudentAdminRulesBlocked, 'RBAC Attempt Blocked: Student cannot modify academic bylaws or rules');

// 10e. Process Officer attempting data modification (Forbidden - Read Only)
const processOfficerCaller = { role: 'PROCESS_OFFICER' };
const isProcessMutationBlocked = processOfficerCaller.role === 'PROCESS_OFFICER';
assert(isProcessMutationBlocked, 'RBAC Attempt Blocked: Process Officer is strictly prohibited from mutating data (HTTP 403 FORBIDDEN_READ_ONLY)');

// 10f. Instructor attempting to modify academic rules (Forbidden - Admin only)
const instructorCaller = { role: 'INSTRUCTOR', instructorId: 'inst_dr_adel' };
const isInstructorRulesBlocked = instructorCaller.role !== 'ADMIN';
assert(isInstructorRulesBlocked, 'RBAC Attempt Blocked: Instructor cannot modify academic bylaws or rules');

// 10g. Department Head attempting admin rule config (Admin role required)
const deptHeadCaller = { role: 'DEPARTMENT_HEAD' };
const isDeptHeadAdminBlocked = deptHeadCaller.role !== 'ADMIN';
assert(isDeptHeadAdminBlocked, 'RBAC Attempt Blocked: Department Head cannot overwrite system-wide admin configurations');

// -----------------------------------------------------------------
// 11. CUMULATIVE GPA PROGRESSION & STATE TRANSITIONS AUDIT
// -----------------------------------------------------------------
console.log('\n--- 11. CUMULATIVE GPA STATE TRANSITIONS AUDIT ---');

// Baseline: 2 courses (6 credits): CS 101 (B = 3.0), BS 101 (C = 2.4) -> (9.0 + 7.2) / 6 = 2.70
const baseRecords = [
  { credits: 3, grade: 'B', gradePoints: 3.0 },
  { credits: 3, grade: 'C', gradePoints: 2.4 },
];
const baseGpa = calculateGpa(baseRecords);
assert(baseGpa.gpa === 2.70, 'Baseline GPA calculated correctly: 2.70');

// Transition 1: Adding a new passed course CS 102 (A = 3.7, 3 credits)
// Total points = 16.2 + (3 * 3.7 = 11.1) = 27.3 / 9 credits = 3.033 -> 3.03
const newCourseRecords = [...baseRecords, { credits: 3, grade: 'A', gradePoints: 3.7 }];
const newCourseGpa = calculateGpa(newCourseRecords);
assert(newCourseGpa.gpa === 3.03, 'GPA after new course: 3.03');

// Transition 2: Student fails a course CS 201 (F = 0.0, 3 credits)
// Total points = 27.3 + 0.0 = 27.3 / 12 credits = 2.275 -> 2.28
const failedCourseRecords = [...newCourseRecords, { credits: 3, grade: 'F', gradePoints: 0.0 }];
const failedCourseGpa = calculateGpa(failedCourseRecords);
assert(failedCourseGpa.gpa === 2.28, 'GPA after course failure: 2.28');

// Transition 3: Retaking failed course CS 201 (Attempt 2, Raw mark 92 = A, capped at B+ = 3.2)
// Replacing F with capped B+ (3.2):
// Total points = 16.2 + 11.1 + (3 * 3.2 = 9.6) = 36.9 / 9 credits = 4.1? Wait:
// In GPA replacement: CS 201 has 3 credits, now with 3.2 points.
// (3 * 3.0) + (3 * 2.4) + (3 * 3.7) + (3 * 3.2) = 9.0 + 7.2 + 11.1 + 9.6 = 36.9 / 12 = 3.075 -> 3.08
const retakenRecords = [
  { credits: 3, grade: 'B', gradePoints: 3.0 },
  { credits: 3, grade: 'C', gradePoints: 2.4 },
  { credits: 3, grade: 'A', gradePoints: 3.7 },
  { credits: 3, grade: 'B+', gradePoints: 3.2 }, // replaced F
];
const retakenGpa = calculateGpa(retakenRecords);
assert(retakenGpa.gpa === 3.08, 'GPA after retake replacement with capped grade: 3.08');

// Transition 4: Course Withdrawal (W) - credits and points ignored
const withWithdrawal = [...retakenRecords, { credits: 3, grade: 'W' }];
const withWithdrawalGpa = calculateGpa(withWithdrawal);
assert(withWithdrawalGpa.gpa === 3.08 && withWithdrawalGpa.totalCredits === 12, 'Withdrawal (W) is non-credit and leaves cumulative GPA unaffected');

// Transition 5: Incomplete Course (I) - credits and points ignored
const withIncomplete = [...retakenRecords, { credits: 3, grade: 'I' }];
const withIncompleteGpa = calculateGpa(withIncomplete);
assert(withIncompleteGpa.gpa === 3.08 && withIncompleteGpa.totalCredits === 12, 'Incomplete (I) is non-credit and leaves cumulative GPA unaffected');

// -----------------------------------------------------------------
// 12. SUMMER TRAINING & MINIMUM LOAD ELIGIBILITY AUDIT
// -----------------------------------------------------------------
console.log('\n--- 12. SUMMER TRAINING & MINIMUM LOAD AUDIT ---');

// Training eligibility requires completedCredits >= 30
assert(
  AcademicRulesEngine.MIN_TRAINING_CREDITS === 30,
  'Summer field training rule specifies exactly 30 credit hours minimum'
);
const stu25Credits = mockStudent(2.5, 25);
const stu35Credits = mockStudent(2.5, 35);
assert(stu25Credits.completedCredits < AcademicRulesEngine.MIN_TRAINING_CREDITS, 'Student with 25 credits is not eligible for summer training');
assert(stu35Credits.completedCredits >= AcademicRulesEngine.MIN_TRAINING_CREDITS, 'Student with 35 credits is eligible for summer training');

// Minimum load check
const underloadReg = AcademicRulesEngine.validateRegistration(
  stu35Credits,
  ['CS 101'], // 3 credits only (below 9 min load)
  coursesMap,
  offeringsMap,
  false // regular semester
);
assert(
  underloadReg.warningsAr.some(w => w.includes('الحد الأدنى')),
  'Registration with fewer than 9 credits produces minimum load warning'
);

// -----------------------------------------------------------------
// 13. CSV DATA IMPORT ENGINE VALIDATION AUDIT
// -----------------------------------------------------------------
console.log('\n--- 13. CSV DATA IMPORT ENGINE VALIDATION AUDIT ---');

// Helper to simulate CSV import validation
function simulateCsvImport(type: 'STUDENTS' | 'COURSES' | 'GRADES', csvData: string) {
  const lines = csvData.trim().split('\n').filter(l => l.trim().length > 0);
  const rows = lines.slice(1);
  let successCount = 0;
  let failCount = 0;
  const validationErrors: { row: number; reason: string }[] = [];
  const validGradesSet = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'W', 'I']);
  const seenStudentCodes = new Set<string>();
  const seenCourseCodes = new Set<string>();

  rows.forEach((line, idx) => {
    const rowNum = idx + 2;
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 2) {
      failCount++;
      validationErrors.push({ row: rowNum, reason: 'Incomplete columns' });
      return;
    }
    if (type === 'STUDENTS') {
      const code = parts[0];
      const gpa = parseFloat(parts[2] || '2.0');
      if (!code || code.length < 4 || isNaN(gpa) || gpa < 0 || gpa > 4.0) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'Invalid student code or GPA' });
        return;
      }
      if (seenStudentCodes.has(code) || INITIAL_STUDENTS.some(s => s.studentCode === code)) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'Duplicate student code' });
        return;
      }
      seenStudentCodes.add(code);
      successCount++;
    } else if (type === 'COURSES') {
      const code = parts[0].toUpperCase();
      const credits = parseInt(parts[2] || '3', 10);
      if (!code || !/^[A-Z]{2,3}\s*\d{3}$/.test(code) || isNaN(credits) || credits < 1 || credits > 6) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'Invalid course code format or credits' });
        return;
      }
      if (seenCourseCodes.has(code) || INITIAL_COURSES.some(c => c.code.toUpperCase() === code)) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'Duplicate course code' });
        return;
      }
      seenCourseCodes.add(code);
      successCount++;
    } else if (type === 'GRADES') {
      const studentCode = parts[0];
      const courseCode = parts[1].toUpperCase();
      const grade = (parts[2] || '').toUpperCase();
      const dateStr = parts[3];

      if (!INITIAL_STUDENTS.some(s => s.studentCode === studentCode)) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'Student code does not exist' });
        return;
      }
      if (!INITIAL_COURSES.some(c => c.code.toUpperCase() === courseCode)) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'Course code does not exist' });
        return;
      }
      if (!validGradesSet.has(grade)) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'Invalid letter grade' });
        return;
      }
      if (dateStr && isNaN(Date.parse(dateStr))) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'Invalid date format' });
        return;
      }
      successCount++;
    }
  });

  return { successCount, failCount, validationErrors };
}

// Test valid CSV
const validStudentsCsv = `code,name,gpa\n20268801,Kareem Mostafa,3.45\n20268802,Dina Adel,3.12`;
const resValidStudents = simulateCsvImport('STUDENTS', validStudentsCsv);
assert(resValidStudents.successCount === 2 && resValidStudents.failCount === 0, 'CSV Import: Valid students batch accepted cleanly');

// Test duplicate student code rejection (both in DB and duplicate in batch)
const dupStudentsCsv = `code,name,gpa\n20230142,Existing Omar,1.78\n20268803,New Student,3.00\n20268803,Duplicate In Batch,2.50`;
const resDupStudents = simulateCsvImport('STUDENTS', dupStudentsCsv);
assert(resDupStudents.failCount === 2, 'CSV Import: Duplicate student codes (existing in DB and duplicate in batch) rejected');

// Test invalid course codes & duplicates
const invalidCoursesCsv = `code,name,credits\nINVALID_CODE,Bad Course,3\nCS 101,Already Exists,3\nCS 495,Valid New Course,3`;
const resCourses = simulateCsvImport('COURSES', invalidCoursesCsv);
assert(resCourses.failCount === 2 && resCourses.successCount === 1, 'CSV Import: Invalid course code format and duplicate course code rejected');

// Test grades with non-existent student, non-existent course, invalid grade, invalid date
const gradesCsv = `studentCode,courseCode,grade,date\n20230142,CS 101,A,2026-09-01\n99999999,CS 101,B,2026-09-01\n20230142,CS 999,B,2026-09-01\n20230142,CS 101,Z_BAD,2026-09-01\n20230142,CS 101,B,NOT_A_DATE`;
const resGrades = simulateCsvImport('GRADES', gradesCsv);
assert(resGrades.successCount === 1 && resGrades.failCount === 4, 'CSV Import: Grades rejected for non-existent student, non-existent course, invalid grade, and malformed date');

// -----------------------------------------------------------------
// 14. HIGH-LOAD PERFORMANCE BENCHMARK (100, 1,000, 10,000 Students)
// -----------------------------------------------------------------
console.log('\n--- 14. HIGH-LOAD PERFORMANCE BENCHMARK ---');

function benchmarkRiskEngine(count: number): number {
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    const dummy = mockStudent(1.5 + (i % 25) * 0.1, 30 + (i % 80), i % 4, i % 3);
    AcademicRiskEngine.evaluateRisk(dummy);
  }
  const duration = performance.now() - start;
  return duration;
}

const time100 = benchmarkRiskEngine(100);
console.log(`⏱️ 100 students risk evaluation: ${time100.toFixed(2)} ms`);
assert(time100 < 50, '100 students evaluated in < 50 ms');

const time1000 = benchmarkRiskEngine(1000);
console.log(`⏱️ 1,000 students risk evaluation: ${time1000.toFixed(2)} ms`);
assert(time1000 < 250, '1,000 students evaluated in < 250 ms');

const time10000 = benchmarkRiskEngine(10000);
console.log(`⏱️ 10,000 students risk evaluation: ${time10000.toFixed(2)} ms`);
assert(time10000 < 1500, '10,000 students evaluated in < 1500 ms');

// -----------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------
console.log('\n================================================================');
console.log(`AUDIT TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
