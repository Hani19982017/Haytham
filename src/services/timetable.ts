import { api } from './api.js';
import type { CourseOffering, RegistrationRequest } from '../types/index.js';

/** True when the two sections meet at overlapping times on a shared day. */
export const sectionsClash = (a: CourseOffering, b: CourseOffering): boolean =>
  (a.days || []).some(d => (b.days || []).includes(d)) &&
  !!a.startTime &&
  !!a.endTime &&
  !!b.startTime &&
  !!b.endTime &&
  a.startTime < b.endTime &&
  b.startTime < a.endTime;

export interface AddToTimetableResult {
  request: RegistrationRequest | null;
  /** Courses now in the timetable (including ones that already were). */
  added: string[];
  /** Courses with no open section this term. */
  missing: string[];
  /** The timetable is with the advisor or already approved, so nothing changed. */
  locked: boolean;
}

/**
 * Put courses into the student's term timetable (the draft kept on the server
 * that the Registration page shows), each in an open section that does not clash
 * with the rest. With nothing saved yet, the draft starts from the suggested
 * timetable, as the Registration page does.
 */
export async function addCoursesToTimetable(
  studentId: string,
  codes: string[],
  known: { offerings?: CourseOffering[]; request?: RegistrationRequest | null } = {}
): Promise<AddToTimetableResult> {
  const [offerings, request] = await Promise.all([
    known.offerings && known.offerings.length ? Promise.resolve(known.offerings) : api.getOfferings(),
    known.request !== undefined ? Promise.resolve(known.request) : api.getRegistrationRequest(studentId).catch(() => null),
  ]);
  if (request && (request.status === 'PENDING' || request.status === 'APPROVED')) {
    return { request, added: [], missing: [], locked: true };
  }

  let current = (request?.offeringIds || []).filter(id => offerings.some(o => o.id === id));
  if (current.length === 0) {
    const suggestion = await api.getRegistrationRecommendation(studentId).catch(() => null);
    current = suggestion ? suggestion.recommendedCourses.map(c => c.offeringId) : [];
  }

  const chosen = current.map(id => offerings.find(o => o.id === id)).filter((o): o is CourseOffering => !!o);
  const added: string[] = [];
  const missing: string[] = [];
  for (const code of [...new Set(codes)]) {
    if (chosen.some(o => o.courseCode === code)) {
      added.push(code);
      continue;
    }
    const options = offerings
      .filter(o => o.courseCode === code && o.enrolledCount < o.capacity)
      .sort((a, b) => a.enrolledCount / a.capacity - b.enrolledCount / b.capacity);
    const pick = options.find(o => !chosen.some(p => sectionsClash(p, o))) || options[0];
    if (pick) {
      chosen.push(pick);
      added.push(code);
    } else {
      missing.push(code);
    }
  }

  const saved = await api.saveRegistrationDraft(studentId, chosen.map(o => o.id));
  return { request: saved, added, missing, locked: false };
}
