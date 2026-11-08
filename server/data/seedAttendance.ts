import crypto from 'crypto';
import type { AttendanceMethod, AttendanceSessionKind, AttendanceStatus, CourseOffering, Student } from '../../src/types/index.js';
import { AttendanceEngine, AttendancePolicy } from '../engines/attendanceEngine.js';

/** First day of teaching in the current term (a Sunday). */
export const SEMESTER_START = '2026-09-20';

/** Weekly section (taken by the teaching assistant) for the sections that have one. */
export const SECTION_SLOTS: Record<string, { day: string; start: string }> = {
  off_cs210_s1: { day: 'الخميس', start: '08:30' },
  off_cs201_s1: { day: 'الخميس', start: '10:00' },
  off_bs101_s1: { day: 'الخميس', start: '11:30' },
  off_bs103_s1: { day: 'الخميس', start: '13:00' },
};

const DAY_INDEX: Record<string, number> = {
  الأحد: 0,
  الإثنين: 1,
  الاثنين: 1,
  الثلاثاء: 2,
  الأربعاء: 3,
  الخميس: 4,
  الجمعة: 5,
  السبت: 6,
};

/** Stable pseudo-random number in [0, 1) for a piece of text. */
const unit = (text: string) => parseInt(crypto.createHash('sha1').update(text).digest('hex').slice(0, 8), 16) / 0x1_0000_0000;

const plainName = (raw?: string) => (raw || '').split('(')[0].trim() || raw || '';

/** The UTC instant of a wall-clock time in Cairo (accounts for daylight saving). */
export function cairoInstant(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  const zoneName =
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', timeZoneName: 'shortOffset' })
      .formatToParts(new Date(wallAsUtc - 2 * 3_600_000))
      .find(p => p.type === 'timeZoneName')?.value || 'GMT+2';
  const match = zoneName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  const offsetMinutes = match ? Number(match[1]) * 60 + Math.sign(Number(match[1])) * Number(match[2] || 0) : 120;
  return new Date(wallAsUtc - offsetMinutes * 60_000);
}

const addDays = (date: string, days: number) => {
  const t = new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};

/** How often a student tends to miss a given course (stable per student and section). */
function absenceRate(studentId: string, offeringId: string): number {
  if (studentId === 'stu_omar') return offeringId === 'off_cs210_s1' ? 0.3 : 0.18;
  if (studentId === 'stu_sara') return 0.03;
  const h = unit(`habit|${studentId}|${offeringId}`);
  if (h < 0.62) return 0.04;
  if (h < 0.84) return 0.12;
  if (h < 0.95) return 0.24;
  return 0.42;
}

export interface SeedAttendanceSession {
  id: string;
  offeringId: string;
  kind: AttendanceSessionKind;
  status: 'CLOSED';
  secret: string;
  startedAt: Date;
  endedAt: Date;
  startedById: string;
  startedByName: string;
}

export interface SeedAttendanceMark {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  markedAt: Date;
  markedById: string | null;
}

/**
 * Lectures and sections already held this term (from the first teaching day up
 * to now) for every section that has students sitting in it, with each
 * student's mark. Deterministic: the same inputs always give the same rows, so
 * the database seed can add them again without duplicates.
 */
export function buildAttendanceHistory({
  students,
  offerings,
  now = new Date(),
  userIdOfInstructor,
}: {
  students: Student[];
  offerings: CourseOffering[];
  now?: Date;
  userIdOfInstructor: (instructorId: string) => string;
}): { sessions: SeedAttendanceSession[]; marks: SeedAttendanceMark[] } {
  const rosters = new Map<string, string[]>();
  for (const s of students) {
    for (const r of s.records) {
      if (r.status !== 'IN_PROGRESS' || !r.offeringId) continue;
      if (!rosters.has(r.offeringId)) rosters.set(r.offeringId, []);
      rosters.get(r.offeringId)!.push(s.id);
    }
  }

  const sessions: SeedAttendanceSession[] = [];
  const marks: SeedAttendanceMark[] = [];
  const MIN = 60_000;

  for (const o of offerings) {
    const roster = rosters.get(o.id);
    if (!roster?.length || !o.startTime) continue;
    const slots: { day: string; time: string; kind: AttendanceSessionKind }[] = [
      ...(o.days || []).map(day => ({ day, time: o.startTime!, kind: 'LECTURE' as const })),
      ...(o.assistantId && SECTION_SLOTS[o.id] ? [{ day: SECTION_SLOTS[o.id].day, time: SECTION_SLOTS[o.id].start, kind: 'SECTION' as const }] : []),
    ];

    for (let week = 0; week < AttendancePolicy.teachingWeeks; week++) {
      for (const slot of slots) {
        const dayIndex = DAY_INDEX[slot.day];
        if (dayIndex === undefined) continue;
        const date = addDays(SEMESTER_START, week * 7 + dayIndex);
        const startedAt = cairoInstant(date, slot.time);
        const endedAt = new Date(startedAt.getTime() + 90 * MIN);
        if (endedAt.getTime() > now.getTime()) continue;

        const id = `ses_${o.id}_${date.replace(/-/g, '')}_${slot.kind === 'LECTURE' ? 'L' : 'S'}`;
        const byInstructor = slot.kind === 'LECTURE' ? o.instructorId : o.assistantId!;
        const byUserId = userIdOfInstructor(byInstructor);
        sessions.push({
          id,
          offeringId: o.id,
          kind: slot.kind,
          status: 'CLOSED',
          secret: crypto.createHash('sha256').update(`secret|${id}`).digest('hex'),
          startedAt,
          endedAt,
          startedById: byUserId,
          startedByName: plainName(slot.kind === 'LECTURE' ? o.instructorName : o.assistantName),
        });

        for (const studentId of roster) {
          const p = absenceRate(studentId, o.id);
          const u = unit(`${id}|${studentId}`);
          let status: AttendanceStatus = 'PRESENT';
          let method: AttendanceMethod = unit(`method|${id}|${studentId}`) < 0.85 ? 'QR' : 'MANUAL';
          let minutes = 2 + Math.floor(unit(`time|${id}|${studentId}`) * 10);
          if (u < p) {
            status = 'ABSENT';
            method = 'AUTO';
            minutes = 90;
          } else if (u < p + 0.06) {
            status = 'LATE';
            minutes = AttendanceEngine.LATE_AFTER_MINUTES + 1 + Math.floor(unit(`late|${id}|${studentId}`) * 14);
          } else if (u < p + 0.08) {
            status = 'EXCUSED';
            method = 'MANUAL';
            minutes = 90;
          }
          marks.push({
            id: `mk_${id}_${studentId}`,
            sessionId: id,
            studentId,
            status,
            method,
            markedAt: new Date(startedAt.getTime() + minutes * MIN),
            markedById: method === 'MANUAL' || method === 'AUTO' ? byUserId : null,
          });
        }
      }
    }
  }

  return { sessions, marks };
}

/** Attendance percentage per student and section from the generated history. */
export function attendancePercentages(
  history: { sessions: SeedAttendanceSession[]; marks: SeedAttendanceMark[] },
  offerings: CourseOffering[]
): Map<string, number> {
  const offeringOfSession = new Map(history.sessions.map(s => [s.id, s.offeringId]));
  const byKey = new Map<string, AttendanceStatus[]>();
  for (const m of history.marks) {
    const key = `${m.studentId}|${offeringOfSession.get(m.sessionId)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(m.status);
  }
  const result = new Map<string, number>();
  for (const [key, statuses] of byKey) {
    const offering = offerings.find(o => o.id === key.split('|')[1]);
    if (!offering) continue;
    result.set(key, AttendanceEngine.figures(statuses, AttendanceEngine.plannedSessions(offering)).attendancePercent);
  }
  return result;
}
