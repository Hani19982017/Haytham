import { calculateGpa, capRetakeGrade, calculatePercentageToGrade } from '../engines/gpaEngine.js';
import { AcademicRulesEngine } from '../engines/rulesEngine.js';
import { Course, CourseOffering, Student } from '../../src/types/index.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
    failedTests++;
  }
}

console.log('--- RUNNING SMART ACADEMIC ADVISOR ENGINE TESTS ---');

// 1. GPA Engine Tests
console.log('\n[1. GPA Engine Tests]');
const sampleCourses = [
  { credits: 3, gradePoints: 4.0 }, // A+
  { credits: 3, gradePoints: 3.0 }, // B
  { credits: 3, gradePoints: 2.0 }, // D+
];
const gpaRes = calculateGpa(sampleCourses);
assert(gpaRes.gpa === 3.0, 'GPA computation: (3*4 + 3*3 + 3*2)/9 = 3.00');

// Percentage to Grade scale test
assert(calculatePercentageToGrade(95).grade === 'A+', 'Score 95 yields A+');
assert(calculatePercentageToGrade(80).grade === 'B+', 'Score 80 yields B+');
assert(calculatePercentageToGrade(40).grade === 'F', 'Score 40 yields F');

// Retake capping tests
assert(capRetakeGrade('A', 1).grade === 'A', '1st attempt: no capping (A)');
assert(capRetakeGrade('A', 2).grade === 'B+', '2nd attempt (1st retake): capped at B+ (3.2)');
assert(capRetakeGrade('B', 2).grade === 'B', '2nd attempt with B: remains B (below B+ cap)');
assert(capRetakeGrade('A', 3).grade === 'C+', '3rd attempt (2nd retake): capped at C+ (2.6)');
assert(capRetakeGrade('A', 4).grade === 'D+', '4th attempt (3rd retake): capped at D+ (2.0)');

// 2. Rules Engine: Credit Limits by GPA
console.log('\n[2. Rules Engine Credit Limit Tests]');
const makeMockStudent = (gpa: number, credits: number, warnings: number = 0): Student => ({
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
  consecutiveWarnings: warnings,
  riskLevel: 'LOW',
  riskReasons: [],
  records: [],
  trainingHours: 0,
  trainingStatus: 'Pending',
  currentPlanStatus: 'Draft',
});

// GPA >= 3.0 -> Max 21 credits
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(3.5, 60)) === 21, 'GPA 3.5 allows max 21 credits');
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(3.0, 60)) === 21, 'GPA exactly 3.0 allows max 21 credits');

// 2.0 <= GPA < 3.0 -> Max 18 credits
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(2.5, 60)) === 18, 'GPA 2.5 allows max 18 credits');
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(2.0, 60)) === 18, 'GPA exactly 2.0 allows max 18 credits');

// 1.0 <= GPA < 2.0 -> Max 15 credits
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(1.5, 60)) === 15, 'GPA 1.5 allows max 15 credits');
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(1.0, 60)) === 15, 'GPA exactly 1.0 allows max 15 credits');

// GPA < 1.0 -> Max 12 credits
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(0.8, 60)) === 12, 'GPA 0.8 allows max 12 credits');

// Summer limits
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(3.2, 60), true) === 9, 'Summer with GPA 3.2 allows max 9 credits');
assert(AcademicRulesEngine.getMaxCredits(makeMockStudent(2.5, 60), true) === 6, 'Summer with GPA 2.5 allows max 6 credits');

// 3. Prerequisite & Registration Validation Tests
console.log('\n[3. Registration & Prerequisite Validation Tests]');
const mockCoursesMap = new Map<string, Course>([
  [
    'CS 101',
    {
      id: 'c1',
      code: 'CS 101',
      nameAr: 'مقدمة حاسب',
      nameEn: 'Intro to CS',
      credits: 3,
      level: 1,
      semester: 1,
      isMandatory: true,
      prerequisites: [],
      department: 'CS',
    },
  ],
  [
    'CS 102',
    {
      id: 'c2',
      code: 'CS 102',
      nameAr: 'برمجة كائنية',
      nameEn: 'OOP',
      credits: 3,
      level: 1,
      semester: 2,
      isMandatory: true,
      prerequisites: ['CS 101'],
      department: 'CS',
    },
  ],
  [
    'CS 498',
    {
      id: 'c3',
      code: 'CS 498',
      nameAr: 'مشروع تخرج 1',
      nameEn: 'Grad Project 1',
      credits: 3,
      level: 4,
      semester: 1,
      isMandatory: true,
      prerequisites: [],
      department: 'CS',
    },
  ],
]);

const mockOfferingsMap = new Map<string, CourseOffering>([
  [
    'CS 102',
    {
      id: 'off1',
      courseCode: 'CS 102',
      semesterId: 'sem1',
      instructorId: 'inst1',
      instructorName: 'Dr. Test',
      capacity: 50,
      enrolledCount: 30,
      lectureDayTimeAr: 'Sun',
      lectureDayTimeEn: 'Sun',
      hall: 'H1',
    },
  ],
]);

// Missing Prerequisite Test
const studentWithoutPrereq = makeMockStudent(2.5, 30);
const resPrereqFail = AcademicRulesEngine.validateRegistration(
  studentWithoutPrereq,
  ['CS 102'],
  mockCoursesMap,
  mockOfferingsMap
);
assert(!resPrereqFail.valid, 'Registration of CS 102 rejected when prerequisite CS 101 not passed');

// Passed Prerequisite Test
const studentWithPrereq = makeMockStudent(2.5, 30);
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
const resPrereqPass = AcademicRulesEngine.validateRegistration(
  studentWithPrereq,
  ['CS 102'],
  mockCoursesMap,
  mockOfferingsMap
);
assert(resPrereqPass.valid, 'Registration of CS 102 accepted when prerequisite CS 101 is passed');

// Graduation Project Eligibility Test (70% of 134 = 94 credits)
const studentUnder94Hrs = makeMockStudent(3.5, 80);
const resGradProjFail = AcademicRulesEngine.validateRegistration(
  studentUnder94Hrs,
  ['CS 498'],
  mockCoursesMap,
  mockOfferingsMap
);
assert(!resGradProjFail.valid, 'Graduation Project CS 498 rejected when completed hours (80) < 94 credits');

const studentOver94Hrs = makeMockStudent(3.5, 100);
const resGradProjPass = AcademicRulesEngine.validateRegistration(
  studentOver94Hrs,
  ['CS 498'],
  mockCoursesMap,
  mockOfferingsMap
);
assert(resGradProjPass.valid, 'Graduation Project CS 498 accepted when completed hours (100) >= 94 credits');

console.log(`\n========================================`);
console.log(`RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log(`========================================\n`);

if (failedTests > 0) {
  process.exit(1);
}
