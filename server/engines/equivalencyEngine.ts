import { calculateGpa, calculatePercentageToGrade, GRADE_POINTS_MAP } from './gpaEngine.js';
import { AcademicRulesEngine } from './rulesEngine.js';
import type { Course, EquivalencyEvaluation, EquivalencyItemInput, EquivalencyItemResult, StudentCourseRecord } from '../../src/types/index.js';

/** Lowest percentage of each of our grades (the scale in gpaEngine). */
const GRADE_FLOOR: Record<string, number> = {
  'A+': 95, A: 90, 'A-': 85, 'B+': 80, B: 75, 'B-': 70, 'C+': 65, C: 60, 'C-': 56, 'D+': 53, D: 50, 'D-': 45, F: 0,
};

/**
 * Equivalency (موازنة / مقاصة) of a student transferring from another faculty.
 *
 * Each course studied there is matched to a course of our bylaw. Its grade is
 * worked out on OUR scale from what the student got there (the percentage, or
 * the letter grade when that is all there is), and the course is credited when:
 *   1. it has an equivalent course in our bylaw;
 *   2. it carried at least as many credit hours as ours;
 *   3. the mark reaches the bylaw minimum (EQUIVALENCY_MIN_PERCENT);
 *   4. it is not the graduation project (always studied here);
 *   5. the student has not already passed our course here;
 *   6. one external course per course of ours (the higher mark is kept);
 *   7. the credited hours stay within EQUIVALENCY_MAX_CREDITS_PERCENT of the degree
 *      (lower-level courses first, as later courses build on them).
 * Credited courses count in the GPA with their converted grade and in the hours.
 */
export class EquivalencyEngine {
  public static readonly NEVER_CREDITED = ['CS 498', 'CS 499'];

  /** Our percentage and grade for what the student got at the other faculty. */
  public static convert(item: Pick<EquivalencyItemInput, 'externalMark' | 'externalGrade'>): { percent: number; grade: string; points: number } | null {
    const mark = item.externalMark === null || item.externalMark === undefined || (item.externalMark as any) === '' ? NaN : Number(item.externalMark);
    if (Number.isFinite(mark) && mark >= 0 && mark <= 100) {
      const g = calculatePercentageToGrade(mark);
      return { percent: Math.round(mark * 10) / 10, grade: g.grade, points: g.points };
    }
    const letter = String(item.externalGrade || '').trim().toUpperCase().replace(/\s+/g, '');
    if (letter && GRADE_POINTS_MAP[letter] !== undefined) {
      return { percent: GRADE_FLOOR[letter] ?? 0, grade: letter, points: GRADE_POINTS_MAP[letter] };
    }
    return null;
  }

  /** Level placement from the hours completed (four levels across the degree). */
  public static levelForCredits(credits: number, totalDegreeCredits = AcademicRulesEngine.TOTAL_DEGREE_CREDITS): number {
    const perLevel = Math.ceil(totalDegreeCredits / 4);
    return Math.min(4, Math.floor(Math.max(0, credits) / perLevel) + 1);
  }

  public static evaluate(
    inputs: EquivalencyItemInput[],
    catalog: Course[],
    existingRecords: StudentCourseRecord[] = [],
    rules: { minPercent?: number; maxCreditsPercent?: number; totalDegreeCredits?: number } = {}
  ): EquivalencyEvaluation {
    const minPercent = rules.minPercent ?? AcademicRulesEngine.EQUIVALENCY_MIN_PERCENT;
    const maxCreditsPercent = rules.maxCreditsPercent ?? AcademicRulesEngine.EQUIVALENCY_MAX_CREDITS_PERCENT;
    const totalDegreeCredits = rules.totalDegreeCredits ?? AcademicRulesEngine.TOTAL_DEGREE_CREDITS;
    const maxTransferableCredits = Math.floor((totalDegreeCredits * maxCreditsPercent) / 100);
    const byCode = new Map(catalog.map(c => [c.code, c]));
    const passedHere = new Set(existingRecords.filter(r => r.status === 'PASSED' && r.source !== 'EQUIVALENCY').map(r => r.courseCode));
    const creditedBefore = new Set(existingRecords.filter(r => r.status === 'PASSED' && r.source === 'EQUIVALENCY').map(r => r.courseCode));

    const items: EquivalencyItemResult[] = inputs.map(input => {
      const item: EquivalencyItemResult = {
        ...input,
        externalName: String(input.externalName || '').trim(),
        externalCode: input.externalCode ? String(input.externalCode).trim() : undefined,
        externalCredits: Math.max(0, Math.round(Number(input.externalCredits) || 0)),
        courseCode: input.courseCode ? String(input.courseCode).trim() : null,
        accepted: false,
      };
      const reject = (ar: string, en: string) => Object.assign(item, { accepted: false, reasonAr: ar, reasonEn: en });
      const course = item.courseCode ? byCode.get(item.courseCode) : undefined;
      if (course) Object.assign(item, { courseNameAr: course.nameAr, courseNameEn: course.nameEn, courseCredits: course.credits });
      const converted = this.convert(item);
      if (converted) Object.assign(item, { percent: converted.percent, grade: converted.grade, gradePoints: converted.points });

      if (!item.externalName) return reject('اكتب اسم المقرر كما درسه الطالب.', 'Write the course name as the student studied it.');
      if (!item.courseCode) return reject('لا يوجد مقرر مكافئ في لائحة الكلية.', 'No equivalent course in our bylaw.');
      if (!course) return reject(`المقرر ${item.courseCode} غير موجود في لائحة الكلية.`, `${item.courseCode} is not in our bylaw.`);
      if (this.NEVER_CREDITED.includes(course.code) || /graduation project/i.test(course.nameEn)) {
        return reject('مشروع التخرج لا يُعادَل ويُدرس بالكلية.', 'The graduation project is never credited; it is done here.');
      }
      if (passedHere.has(course.code)) return reject('الطالب اجتاز هذا المقرر بالكلية بالفعل.', 'The student already passed this course here.');
      if (creditedBefore.has(course.code)) return reject('عودل هذا المقرر للطالب في موازنة سابقة.', 'This course was already credited in an earlier equivalency.');
      if (item.externalCredits < course.credits) {
        return reject(
          `ساعات المقرر هناك (${item.externalCredits}) أقل من ساعات ${course.code} عندنا (${course.credits}).`,
          `It carried ${item.externalCredits} credit hours there, fewer than ${course.code}'s ${course.credits}.`
        );
      }
      if (!converted) return reject('أدخل النسبة المئوية أو التقدير الذي حصل عليه الطالب.', 'Enter the percentage or grade the student got.');
      if (converted.percent < minPercent) {
        return reject(
          `النسبة ${converted.percent}% أقل من الحد الأدنى للمعادلة (${minPercent}%).`,
          `${converted.percent}% is under the equivalency minimum of ${minPercent}%.`
        );
      }
      item.accepted = true;
      item.reasonAr = undefined;
      item.reasonEn = undefined;
      return item;
    });

    // One external course per course of ours: keep the higher mark.
    const best = new Map<string, EquivalencyItemResult>();
    for (const item of items.filter(i => i.accepted)) {
      const current = best.get(item.courseCode!);
      if (!current || (item.percent ?? 0) > (current.percent ?? 0)) best.set(item.courseCode!, item);
    }
    for (const item of items.filter(i => i.accepted)) {
      if (best.get(item.courseCode!) !== item) {
        Object.assign(item, {
          accepted: false,
          reasonAr: `عودل ${item.courseCode} بمقرر آخر درجته أعلى.`,
          reasonEn: `${item.courseCode} is already credited from a course with a higher mark.`,
        });
      }
    }

    // Credited hours within the bylaw's share of the degree (lower levels first, then higher marks).
    const candidates = items
      .filter(i => i.accepted)
      .sort((a, b) => (byCode.get(a.courseCode!)!.level - byCode.get(b.courseCode!)!.level) || (b.percent ?? 0) - (a.percent ?? 0));
    const earlier = existingRecords.filter(r => r.status === 'PASSED' && r.source === 'EQUIVALENCY').reduce((sum, r) => sum + r.credits, 0);
    let credited = 0;
    for (const item of candidates) {
      const credits = byCode.get(item.courseCode!)!.credits;
      if (earlier + credited + credits > maxTransferableCredits) {
        Object.assign(item, {
          accepted: false,
          reasonAr: `تجاوز الحد الأقصى للساعات المعادلة (${maxTransferableCredits} ساعة = ${maxCreditsPercent}% من البرنامج).`,
          reasonEn: `Over the most that can be credited (${maxTransferableCredits} credit hours = ${maxCreditsPercent}% of the degree).`,
        });
        continue;
      }
      credited += credits;
    }

    const accepted = items.filter(i => i.accepted);
    const graded = [
      ...existingRecords
        .filter(r => r.gradePoints !== undefined && r.gradePoints !== null)
        .map(r => ({ credits: r.credits, gradePoints: r.gradePoints!, grade: r.grade })),
      ...accepted.map(i => ({ credits: byCode.get(i.courseCode!)!.credits, gradePoints: i.gradePoints!, grade: i.grade })),
    ];
    const passedCredits = existingRecords.filter(r => r.status === 'PASSED').reduce((sum, r) => sum + r.credits, 0) + credited;


    return {
      items,
      acceptedCredits: credited,
      acceptedCourses: accepted.length,
      maxTransferableCredits,
      minPercent,
      gpa: calculateGpa(graded).gpa,
      level: this.levelForCredits(passedCredits, totalDegreeCredits),
      remainingCredits: Math.max(0, totalDegreeCredits - passedCredits),
    };
  }
}
