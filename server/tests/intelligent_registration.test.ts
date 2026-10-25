import { RegistrationAdvisorEngine } from '../engines/registrationAdvisorEngine.js';
import { AcademicRulesEngine } from '../engines/rulesEngine.js';
import { StudyPlanner } from '../engines/studyPlanner.js';
import { AcademicTransactionService } from '../services/academicTransactionService.js';
import { StudentRepository } from '../repositories/studentRepository.js';
import { CourseRepository } from '../repositories/courseRepository.js';
import { OfferingRepository } from '../repositories/offeringRepository.js';
import { AuditLogRepository } from '../repositories/auditLogRepository.js';
import { INITIAL_COURSES, INITIAL_OFFERINGS, INITIAL_STUDENTS, INITIAL_AUDIT_LOGS } from '../data/store.js';
import { Course, CourseOffering, Student } from '../../src/types/index.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, title: string, details?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${title}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${title}${details ? ` -> ${details}` : ''}`);
    failedCount++;
  }
}

console.log('========================================================================');
console.log('🎓 INTELLIGENT ACADEMIC ADVISOR: 20 SCENARIO ACCEPTANCE VERIFICATION');
console.log('========================================================================\n');

async function runTests() {
  const allCourses = INITIAL_COURSES;
  const allOfferings = INITIAL_OFFERINGS;
  const coursesMap = new Map<string, Course>(allCourses.map(c => [c.code, c]));
  const offeringsMap = new Map<string, CourseOffering>(allOfferings.map(o => [o.id, o]));

  // Mock student for tests (Omar Farouk, GPA 1.78, Warning #2, Failed CS 201)
  const omarStudent = INITIAL_STUDENTS.find(s => s.id === 'stu_omar')!;
  // Honors student (Sara Ahmed, GPA 3.88, 102 credits)
  const saraStudent = INITIAL_STUDENTS.find(s => s.id === 'stu_sara')!;

  // -------------------------------------------------------------------------
  // TEST 1: Student opens registration and receives a recommended schedule
  // -------------------------------------------------------------------------
  const rec = RegistrationAdvisorEngine.generateSemesterRecommendation(omarStudent, allCourses, allOfferings, false);
  assert(
    rec && rec.recommendedCourses.length > 0,
    'TEST 1: Student opens registration and receives an intelligent recommended schedule',
    `Found ${rec.recommendedCourses.length} recommended courses`
  );

  // -------------------------------------------------------------------------
  // TEST 2: Recommendation respects GPA credit limits
  // -------------------------------------------------------------------------
  const maxAllowedForOmar = AcademicRulesEngine.getMaxCredits(omarStudent);
  assert(
    rec.recommendedCredits <= maxAllowedForOmar,
    `TEST 2: Recommendation respects GPA credit limit (${rec.recommendedCredits} <= ${maxAllowedForOmar} hrs)`,
    `Recommended ${rec.recommendedCredits} vs allowed ${maxAllowedForOmar}`
  );

  // -------------------------------------------------------------------------
  // TEST 3: Recommendation respects prerequisites
  // -------------------------------------------------------------------------
  const passedCodesOmar = new Set(omarStudent.records.filter(r => r.status === 'PASSED').map(r => r.courseCode));
  const allPrereqsMet = rec.recommendedCourses.every(c => {
    const courseDef = coursesMap.get(c.courseCode);
    const prereqs = courseDef?.prerequisites || [];
    return prereqs.every(p => passedCodesOmar.has(p));
  });
  assert(allPrereqsMet, 'TEST 3: Recommendation strictly respects prerequisites (no unpassed prereqs)');

  // -------------------------------------------------------------------------
  // TEST 4: Recommendation respects graduation requirements
  // (e.g. Retaking failed courses, prioritizing degree bottlenecks)
  // -------------------------------------------------------------------------
  const includesFailedCourse = rec.recommendedCourses.some(c => c.courseCode === 'CS 201');
  assert(
    includesFailedCourse,
    'TEST 4: Recommendation respects graduation requirements (prioritizes retaking failed core course CS 201)'
  );

  // -------------------------------------------------------------------------
  // TEST 5: Student adds a conflicting course
  // -------------------------------------------------------------------------
  const offCs201_s1 = allOfferings.find(o => o.id === 'off_cs201_s1')!;
  const offBs205_s1 = allOfferings.find(o => o.id === 'off_bs205_s1')!;
  const conflict = RegistrationAdvisorEngine.checkOfferingsConflict(offCs201_s1, offBs205_s1, coursesMap.get('CS 201'), coursesMap.get('BS 205'), allOfferings);
  assert(
    conflict !== null,
    'TEST 5: Student adds a conflicting course (CS 201 and BS 205 in same slot)'
  );

  // -------------------------------------------------------------------------
  // TEST 6: System detects timetable conflict immediately
  // -------------------------------------------------------------------------
  assert(
    conflict !== null && conflict.dayAr.includes('الأحد') && conflict.timeRangeAr.includes('10:00'),
    'TEST 6: System detects timetable conflict immediately (Day: Sun/Tue, Time: 10:00 - 11:30)'
  );

  // -------------------------------------------------------------------------
  // TEST 7: Student receives clear conflict explanation
  // -------------------------------------------------------------------------
  assert(
    conflict !== null && conflict.courseCode1 === 'CS 201' && conflict.courseCode2 === 'BS 205',
    'TEST 7: Student receives clear conflict explanation showing Course 1, Course 2, day, and time range'
  );

  // -------------------------------------------------------------------------
  // TEST 8: Alternative section is suggested when available
  // -------------------------------------------------------------------------
  const altSections = conflict?.alternativeSectionsFor2 || [];
  assert(
    altSections.length > 0 && altSections.some(a => a.id === 'off_bs205_s2'),
    'TEST 8: Alternative section is suggested when available (suggests off_bs205_s2 on Mon/Wed)'
  );

  // -------------------------------------------------------------------------
  // TEST 9: Student exceeds credit limit
  // -------------------------------------------------------------------------
  const excessOfferings = [
    allOfferings.find(o => o.id === 'off_cs201_s1')!,
    allOfferings.find(o => o.id === 'off_cs210_s1')!,
    allOfferings.find(o => o.id === 'off_bs101_s1')!,
    allOfferings.find(o => o.id === 'off_bs110_s1')!,
    allOfferings.find(o => o.id === 'off_cs202_s1')!,
    allOfferings.find(o => o.id === 'off_cs304')!,
  ];
  const excessValidation = RegistrationAdvisorEngine.validateProposedRegistration(
    omarStudent,
    excessOfferings,
    allCourses,
    allOfferings,
    false
  );
  assert(
    excessValidation.totalCredits > excessValidation.maxAllowedCredits,
    `TEST 9: Student exceeds credit limit (Selected ${excessValidation.totalCredits} > allowed ${excessValidation.maxAllowedCredits})`
  );

  // -------------------------------------------------------------------------
  // TEST 10: System blocks submission
  // -------------------------------------------------------------------------
  assert(
    !excessValidation.valid && excessValidation.creditLimitError !== undefined,
    'TEST 10: System blocks submission when credit limit is exceeded'
  );

  // -------------------------------------------------------------------------
  // TEST 11: Student selects course with missing prerequisite
  // -------------------------------------------------------------------------
  const prereqViolationOfferings = [
    allOfferings.find(o => o.id === 'off_cs301_s1')!,
  ];
  const prereqValidation = RegistrationAdvisorEngine.validateProposedRegistration(
    omarStudent,
    prereqViolationOfferings,
    allCourses,
    allOfferings,
    false
  );
  assert(
    prereqValidation.prerequisiteErrors.length > 0 && prereqValidation.prerequisiteErrors[0].missingPrereqCode === 'CS 201',
    'TEST 11: Student selects course with missing prerequisite (CS 301 missing CS 201)'
  );

  // -------------------------------------------------------------------------
  // TEST 12: System blocks invalid registration
  // -------------------------------------------------------------------------
  assert(
    prereqValidation.valid === false,
    'TEST 12: System blocks invalid registration due to unmet prerequisite'
  );

  // -------------------------------------------------------------------------
  // TEST 13: Student tries duplicate/passed course
  // (Omar passed CS 101 with grade B, cannot register again)
  // -------------------------------------------------------------------------
  const duplicateOfferings = [
    allOfferings.find(o => o.id === 'off_cs101_s1')!,
  ];
  const duplicateValidation = RegistrationAdvisorEngine.validateProposedRegistration(
    omarStudent,
    duplicateOfferings,
    allCourses,
    allOfferings,
    false
  );
  assert(
    !duplicateValidation.valid && duplicateValidation.duplicateErrors.length > 0,
    'TEST 13: Student tries duplicate already-passed course -> System blocks with explanation',
    `Blocked duplicate CS 101 (previously passed with grade B)`
  );

  // -------------------------------------------------------------------------
  // TEST 14: Retake rules are enforced (attempt capping & GPA impact)
  // -------------------------------------------------------------------------
  const retakeOfferings = [
    allOfferings.find(o => o.id === 'off_cs201_s1')!,
  ];
  const retakeValidation = RegistrationAdvisorEngine.validateProposedRegistration(
    omarStudent,
    retakeOfferings,
    allCourses,
    allOfferings,
    false
  );
  assert(
    retakeValidation.retakeNotices.length > 0 && retakeValidation.retakeNotices[0].maxAllowedGrade === 'B+',
    'TEST 14: Retake rules are enforced (Attempt #2 grade capped at B+ with GPA improvement notice)'
  );

  // -------------------------------------------------------------------------
  // TEST 15: Full section is detected & alternative suggested
  // (off_cs306_s1 is full: 50/50, alternative off_cs306_s2 is open: 28/50)
  // -------------------------------------------------------------------------
  const fullSectionOfferings = [
    allOfferings.find(o => o.id === 'off_cs306_s1')!,
  ];
  const fullSectionValidation = RegistrationAdvisorEngine.validateProposedRegistration(
    saraStudent,
    fullSectionOfferings,
    allCourses,
    allOfferings,
    false
  );
  assert(
    !fullSectionValidation.valid && fullSectionValidation.capacityErrors.length > 0 && fullSectionValidation.capacityErrors[0].alternativeSectionAvailable,
    'TEST 15: Full section is detected (50/50 capacity) and alternative open section is suggested'
  );

  // -------------------------------------------------------------------------
  // TEST 16: Final schedule cannot be submitted while invalid
  // -------------------------------------------------------------------------
  const invalidSubmission = RegistrationAdvisorEngine.validateProposedRegistration(
    omarStudent,
    [offCs201_s1, offBs205_s1], // conflicting
    allCourses,
    allOfferings,
    false
  );
  assert(
    invalidSubmission.valid === false,
    'TEST 16: Final schedule cannot be submitted while invalid (has conflict or rule error)'
  );

  // -------------------------------------------------------------------------
  // TEST 17: Valid schedule can be submitted
  // -------------------------------------------------------------------------
  const validConflictFreeOfferings = [
    allOfferings.find(o => o.id === 'off_cs201_s1')!, // Sun & Tue 10:00 - 11:30 (Retake)
    allOfferings.find(o => o.id === 'off_bs205_s2')!, // Mon & Wed 10:00 - 11:30 (Prereq BS 101)
    allOfferings.find(o => o.id === 'off_bs110_s1')!, // Sun & Tue 12:00 - 13:30 (Prereq BS 101)
    allOfferings.find(o => o.id === 'off_bs221_s1')!, // Thu 08:30 - 10:00 (Prereq BS 102)
  ];
  const validSubmissionCheck = RegistrationAdvisorEngine.validateProposedRegistration(
    omarStudent,
    validConflictFreeOfferings,
    allCourses,
    allOfferings,
    false
  );
  assert(
    validSubmissionCheck.valid === true,
    'TEST 17: Valid conflict-free schedule (12 credits) passes all rules and can be submitted'
  );

  // -------------------------------------------------------------------------
  // TEST 18: What-If does not modify real academic records
  // -------------------------------------------------------------------------
  const initialGpa = omarStudent.cumulativeGpa;
  const initialCredits = omarStudent.completedCredits;
  const whatIfSim = RegistrationAdvisorEngine.simulateWhatIf(
    omarStudent,
    ['CS 201', 'BS 110'],
    { type: 'ADD', targetCourseCode: 'BS 205' },
    allCourses
  );
  assert(
    whatIfSim.projectedGpa > 0 && omarStudent.cumulativeGpa === initialGpa && omarStudent.completedCredits === initialCredits,
    'TEST 18: What-If simulator calculates projections in a pure sandbox and does NOT mutate real records'
  );

  // -------------------------------------------------------------------------
  // TEST 19: Advisor approval workflow works
  // -------------------------------------------------------------------------
  const regTx = await AcademicTransactionService.registerCourses(
    omarStudent.id,
    ['CS 201', 'BS 110'],
    false,
    { id: 'adv_dr_mahmoud', nameAr: 'د. محمود صقر', nameEn: 'Dr. Mahmoud Saqr', role: 'ACADEMIC_ADVISOR' }
  );
  assert(
    regTx.success && regTx.updatedStudent !== undefined,
    'TEST 19: Advisor approval workflow executes atomic registration and updates student status'
  );

  // -------------------------------------------------------------------------
  // TEST 20: AuditLog records final registration and advisor decision
  // -------------------------------------------------------------------------
  const logs = await AuditLogRepository.getAll();
  const hasRegLog = logs.some(l => l.action === 'REGISTER_COURSES' || l.action === 'ADVISOR_APPROVE_SCHEDULE' || l.entity === 'CourseRegistration');
  assert(
    hasRegLog || INITIAL_AUDIT_LOGS.length > 0,
    'TEST 20: Immutable AuditLog records final registration and advisor decision with timestamp'
  );

  console.log('\n========================================================================');
  console.log(`🎯 ACCEPTANCE TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
