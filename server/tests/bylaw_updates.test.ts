// Bylaw updates: warnings (4 consecutive OR 6 separate), marks 40/60, first-term
// students, and the equivalency of transfer students. Pure engine checks (no database).
import { calculatePercentageToGrade } from '../engines/gpaEngine.js';
import { AcademicRulesEngine } from '../engines/rulesEngine.js';
import { EquivalencyEngine } from '../engines/equivalencyEngine.js';
import { INITIAL_COURSES } from '../data/store.js';
import { Student, StudentCourseRecord } from '../../src/types/index.js';

let passed = 0;
let failed = 0;
function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${name}`);
    failed++;
  }
}

const student = (over: Partial<Student> = {}): Student => ({
  id: 's1',
  studentCode: '20260001',
  nameAr: 'طالب',
  nameEn: 'Student',
  email: 's@example.com',
  level: 2,
  track: 'General',
  advisorId: 'adv',
  advisorName: 'Advisor',
  cumulativeGpa: 1.8,
  previousGpa: 1.8,
  completedCredits: 40,
  enrolledCredits: 0,
  remainingCredits: 94,
  warningCount: 0,
  consecutiveWarnings: 0,
  riskLevel: 'LOW',
  riskReasons: [],
  records: [],
  trainingHours: 0,
  trainingStatus: 'Pending',
  currentPlanStatus: 'Draft',
  ...over,
});

console.log('\n[1. Dismissal: 4 consecutive OR 6 separate warnings]');
assert(AcademicRulesEngine.dismissalReached({ consecutiveWarnings: 4, warningCount: 4 }), '4 consecutive → dismissal');
assert(AcademicRulesEngine.dismissalReached({ consecutiveWarnings: 1, warningCount: 6 }), '6 separate (not in a row) → dismissal');
assert(!AcademicRulesEngine.dismissalReached({ consecutiveWarnings: 3, warningCount: 5 }), '3 consecutive and 5 in all → not yet');
assert(AcademicRulesEngine.oneWarningFromDismissal({ consecutiveWarnings: 3, warningCount: 3 }), '3 consecutive → one warning away');
assert(AcademicRulesEngine.oneWarningFromDismissal({ consecutiveWarnings: 1, warningCount: 5 }), '5 separate → one warning away');
assert(!AcademicRulesEngine.oneWarningFromDismissal({ consecutiveWarnings: 2, warningCount: 4 }), '2 consecutive / 4 in all → not one away');

// Terms alternating under / over 2.00: the run resets, the total keeps growing.
let state = { warningCount: 0, consecutiveWarnings: 0 };
const terms = [1.8, 2.2, 1.9, 2.1, 1.7, 2.3, 1.9, 2.4, 1.6, 2.2, 1.9];
let dismissedAt = -1;
terms.forEach((gpa, i) => {
  const next = AcademicRulesEngine.warningsAfterTerm(state, gpa);
  state = { warningCount: next.warningCount, consecutiveWarnings: next.consecutiveWarnings };
  if (dismissedAt < 0 && AcademicRulesEngine.dismissalReached(state)) dismissedAt = i;
});
assert(state.warningCount === 6 && state.consecutiveWarnings === 1, 'alternating terms: 6 warnings in all, never 2 in a row');
assert(dismissedAt === terms.length - 1, 'dismissed on the 6th separate warning');

state = { warningCount: 0, consecutiveWarnings: 0 };
[1.8, 1.7, 1.9, 1.6].forEach(gpa => {
  const next = AcademicRulesEngine.warningsAfterTerm(state, gpa);
  state = { warningCount: next.warningCount, consecutiveWarnings: next.consecutiveWarnings };
});
assert(AcademicRulesEngine.dismissalReached(state) && state.consecutiveWarnings === 4, 'four failing terms in a row → dismissal');
const keep = AcademicRulesEngine.warningsAfterTerm({ warningCount: 2, consecutiveWarnings: 2 }, 2.05);
assert(keep.warningCount === 2 && keep.consecutiveWarnings === 0 && !keep.warned, 'a good term ends the run but keeps the total');
const again = AcademicRulesEngine.warningsAfterTerm({ warningCount: 2, consecutiveWarnings: 2 }, 1.5);
const twice = AcademicRulesEngine.warningsAfterTerm({ warningCount: 2, consecutiveWarnings: 2 }, 1.4);
assert(again.warningCount === 3 && twice.warningCount === 3, 'grades entered again in the same term still give one warning (worked out from the term start)');

assert(AcademicRulesEngine.evaluateStudentStatus(student({ warningCount: 6, consecutiveWarnings: 1 })).status === 'DISMISSAL_ELIGIBLE', 'status: dismissal at 6 separate');
assert(AcademicRulesEngine.evaluateStudentStatus(student({ warningCount: 5, consecutiveWarnings: 1 })).status === 'CRITICAL_DISMISSAL_RISK', 'status: critical at 5 separate');
assert(AcademicRulesEngine.evaluateStudentStatus(student({ warningCount: 3, consecutiveWarnings: 3 })).status === 'CRITICAL_DISMISSAL_RISK', 'status: critical at 3 consecutive');
assert(AcademicRulesEngine.evaluateStudentStatus(student({ warningCount: 6, consecutiveWarnings: 1, completedCredits: 110 })).status === 'GRADUATION_FINAL_CHANCE', 'final-chance rule past 80% of the hours');
assert(/4 إنذارات متتالية أو 6 إنذارات منفصلة/.test(AcademicRulesEngine.evaluateStudentStatus(student({ warningCount: 6, consecutiveWarnings: 1 })).messageAr), 'dismissal message states both limits');

console.log('\n[2. Marks: coursework 40 + final 60]');
const scheme = AcademicRulesEngine.markScheme();
assert(scheme.courseworkMax === 40 && scheme.finalMax === 60 && scheme.total === 100, 'mark scheme 40 / 60');
assert(calculatePercentageToGrade(((40 + 60) / scheme.total) * 100).grade === 'A+', '40 + 60 = 100 → A+');
assert(calculatePercentageToGrade(((24 + 36) / scheme.total) * 100).grade === 'C', '24 + 36 = 60 → C');
AcademicRulesEngine.applyRules([{ key: 'COURSEWORK_MAX_MARK', value: 30 }, { key: 'FINAL_EXAM_MAX_MARK', value: 70 }]);
assert(AcademicRulesEngine.markScheme().courseworkMax === 30, 'marks follow the bylaw page');
AcademicRulesEngine.applyRules([{ key: 'COURSEWORK_MAX_MARK', value: 40 }, { key: 'FINAL_EXAM_MAX_MARK', value: 60 }]);
AcademicRulesEngine.applyRules([{ key: 'DISMISSAL_CONSECUTIVE_WARNINGS', value: 'abc' }]);
assert(AcademicRulesEngine.DISMISSAL_CONSECUTIVE_WARNINGS === 4, 'a bad rule value is ignored');

console.log('\n[3. First-term students]');
assert(AcademicRulesEngine.isFreshman(student({ level: 1, completedCredits: 0 })), 'level 1, nothing graded → freshman');
assert(!AcademicRulesEngine.isFreshman(student({ level: 2, completedCredits: 0 })), 'level 2 → not a freshman');
assert(!AcademicRulesEngine.isFreshman(student({ level: 1, completedCredits: 0, admissionType: 'TRANSFER' })), 'transfer student → not a freshman');
const passedOne: StudentCourseRecord = { courseCode: 'CS 101', courseNameAr: '', courseNameEn: '', credits: 3, status: 'PASSED', grade: 'B', gradePoints: 3, semesterId: 'x', semesterName: 'x', attempt: 1 };
assert(!AcademicRulesEngine.isFreshman(student({ level: 1, completedCredits: 3, records: [passedOne] })), 'after the first results → not a freshman');
const firstTerm = INITIAL_COURSES.filter(c => c.level === 1 && c.semester === 1 && c.isMandatory).map(c => c.code).sort();
assert(JSON.stringify(firstTerm) === JSON.stringify(['BS 101', 'BS 103', 'CS 101']), 'bylaw first term (level 1): BS 101, BS 103, CS 101');

console.log('\n[4. Equivalency of transfer students]');
assert(EquivalencyEngine.convert({ externalMark: 88 })?.grade === 'A-', '88% → A- on our scale');
assert(EquivalencyEngine.convert({ externalMark: 61 })?.grade === 'C', '61% → C');
assert(EquivalencyEngine.convert({ externalGrade: 'b+' })?.points === 3.2, 'letter B+ → 3.2 points');
assert(EquivalencyEngine.convert({}) === null, 'nothing entered → no grade');
assert(EquivalencyEngine.levelForCredits(0) === 1 && EquivalencyEngine.levelForCredits(34) === 2 && EquivalencyEngine.levelForCredits(70) === 3 && EquivalencyEngine.levelForCredits(110) === 4, 'level from credited hours');
const ev = EquivalencyEngine.evaluate(
  [
    { externalName: 'Calculus', externalCredits: 3, externalMark: 88, courseCode: 'BS 101' },
    { externalName: 'Calculus again', externalCredits: 4, externalMark: 70, courseCode: 'BS 101' },
    { externalName: 'Physics', externalCredits: 3, externalMark: 59, courseCode: 'BS 103' },
    { externalName: 'Programming', externalCredits: 2, externalMark: 95, courseCode: 'CS 101' },
    { externalName: 'Project', externalCredits: 3, externalMark: 99, courseCode: 'CS 499' },
    { externalName: 'Drawing', externalCredits: 2, externalMark: 90, courseCode: null },
    { externalName: 'Discrete', externalCredits: 3, externalGrade: 'C+', courseCode: 'BS 205' },
  ],
  INITIAL_COURSES,
  []
);
assert(ev.items[0].accepted && !ev.items[1].accepted, 'two courses for BS 101: the higher mark is credited');
assert(!ev.items[2].accepted, '59% under the 60% minimum is not credited');
assert(!ev.items[3].accepted, '2 credit hours for a 3-hour course is not credited');
assert(!ev.items[4].accepted, 'graduation project is not credited');
assert(!ev.items[5].accepted, 'no equivalent course is not credited');
assert(ev.items[6].accepted && ev.items[6].grade === 'C+', 'letter grade C+ credited as C+');
assert(ev.acceptedCredits === 6 && ev.gpa === Math.round(((3 * 3.4 + 3 * 2.6) / 6) * 100) / 100, 'GPA by our calculation (A- and C+)');
const passedHere: StudentCourseRecord = { ...passedOne, courseCode: 'BS 101', source: 'REGULAR' };
const ev2 = EquivalencyEngine.evaluate([{ externalName: 'Calculus', externalCredits: 3, externalMark: 90, courseCode: 'BS 101' }], INITIAL_COURSES, [passedHere]);
assert(!ev2.items[0].accepted, 'a course already passed here is not credited again');
const many = INITIAL_COURSES.filter(c => !['CS 498', 'CS 499'].includes(c.code)).map(c => ({ externalName: c.nameEn, externalCredits: c.credits, externalMark: 80, courseCode: c.code }));
const ev3 = EquivalencyEngine.evaluate(many, INITIAL_COURSES, []);
assert(ev3.acceptedCredits <= Math.floor(134 * 0.5) && ev3.acceptedCredits > 60, 'credited hours capped at 50% of the degree', );
const acceptedLevels = ev3.items.filter(i => i.accepted).map(i => INITIAL_COURSES.find(c => c.code === i.courseCode)!.level);
const rejectedLevels = ev3.items.filter(i => !i.accepted).map(i => INITIAL_COURSES.find(c => c.code === i.courseCode)!.level);
assert(Math.max(...acceptedLevels) <= Math.min(...rejectedLevels), 'lower-level courses are credited first');

console.log(`\n========================================`);
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);
if (failed > 0) process.exit(1);
