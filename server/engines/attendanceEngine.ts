import crypto from 'crypto';
import type { AttendanceFigures, AttendanceStanding, AttendanceStatus, CourseOffering } from '../../src/types/index.js';

let maxAbsencePercent = 25;
let teachingWeeks = 14;

/**
 * Attendance values from the academic bylaw. Both are bylaw rules the admin can
 * change (MAX_ABSENCE_PERCENT, TEACHING_WEEKS); `apply` is called whenever the
 * rules are read or updated, so every calculation uses the current values.
 */
export const AttendancePolicy = {
  /** Largest share of a course's lectures/sections a student may miss before being barred from the final exam. */
  get maxAbsencePercent(): number {
    return maxAbsencePercent;
  },
  /** Lowest attendance rate that is still allowed (100 − maximum absence). */
  get minAttendancePercent(): number {
    return 100 - maxAbsencePercent;
  },
  get teachingWeeks(): number {
    return teachingWeeks;
  },
  apply(rules: { key: string; value: unknown }[]): void {
    const pct = Number(rules.find(r => r.key === 'MAX_ABSENCE_PERCENT')?.value);
    if (Number.isFinite(pct) && pct > 0 && pct < 100) maxAbsencePercent = pct;
    const weeks = Number(rules.find(r => r.key === 'TEACHING_WEEKS')?.value);
    if (Number.isFinite(weeks) && weeks >= 1 && weeks <= 30) teachingWeeks = Math.round(weeks);
  },
};

const hmac = (secret: string, message: string) => crypto.createHmac('sha256', secret).update(message).digest('hex');

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Attendance calculations: how many sessions a course has in the term, how many
 * a student may miss, where they stand, and the rotating QR token / typed code
 * that proves a student was in the room.
 */
export class AttendanceEngine {
  /** The QR token and the typed code change every 30 seconds. */
  public static readonly ROTATION_MS = 30_000;

  /** Students who check in later than this after the start are marked late. */
  public static readonly LATE_AFTER_MINUTES = 15;

  /** Lectures per week from the timetable, plus one section a week when the course has a teaching assistant. */
  public static meetingsPerWeek(offering: Pick<CourseOffering, 'days' | 'assistantId'>): number {
    return Math.max(1, offering.days?.length || 1) + (offering.assistantId ? 1 : 0);
  }

  /** Lectures and sections planned for the whole term. */
  public static plannedSessions(offering: Pick<CourseOffering, 'days' | 'assistantId'>): number {
    return this.meetingsPerWeek(offering) * AttendancePolicy.teachingWeeks;
  }

  /** How many of the planned sessions a student may miss (bylaw percentage, rounded down). */
  public static allowedAbsences(plannedSessions: number, percent = AttendancePolicy.maxAbsencePercent): number {
    return Math.floor((plannedSessions * percent) / 100);
  }

  /** OK → NOTICE (half the allowance used) → LAST_CHANCE (all used) → DEPRIVED (over the limit). */
  public static standing(absent: number, allowed: number): AttendanceStanding {
    if (absent > allowed) return 'DEPRIVED';
    if (allowed > 0 && absent === allowed) return 'LAST_CHANCE';
    if (absent > 0 && absent >= Math.ceil(allowed / 2)) return 'NOTICE';
    return 'OK';
  }

  /**
   * A student's figures for one course from their marks in the sessions held so
   * far (`null` = held but not marked, which counts as absent).
   */
  public static figures(marks: (AttendanceStatus | null)[], plannedSessions: number): AttendanceFigures {
    const held = marks.length;
    const late = marks.filter(m => m === 'LATE').length;
    const attended = marks.filter(m => m === 'PRESENT').length + late;
    const excused = marks.filter(m => m === 'EXCUSED').length;
    const absent = held - attended - excused;
    const allowed = this.allowedAbsences(plannedSessions);
    const counted = held - excused;
    return {
      plannedSessions,
      heldSessions: held,
      attended,
      late,
      excused,
      absent,
      allowedAbsences: allowed,
      remainingAbsences: allowed - absent,
      attendancePercent: counted > 0 ? Math.round((attended / counted) * 1000) / 10 : 100,
      standing: this.standing(absent, allowed),
      maxAbsencePercent: AttendancePolicy.maxAbsencePercent,
    };
  }

  /**
   * Absences expected by the end of term at the student's current rate. Used to
   * warn early ("at this rate you will pass the limit").
   */
  public static projectedAbsences(figures: AttendanceFigures): number {
    const counted = figures.heldSessions - figures.excused;
    if (counted <= 0) return figures.absent;
    const remainingSessions = Math.max(0, figures.plannedSessions - figures.heldSessions);
    return Math.round(figures.absent + (figures.absent / counted) * remainingSessions);
  }

  public static window(now = Date.now()): number {
    return Math.floor(now / this.ROTATION_MS);
  }

  public static rotatesInMs(now = Date.now()): number {
    return this.ROTATION_MS - (now % this.ROTATION_MS);
  }

  /** Token carried by the QR code for one 30-second window. */
  public static token(secret: string, window: number): string {
    return hmac(secret, `qr:${window}`).slice(0, 12).toUpperCase();
  }

  /** Six-digit code shown under the QR code, for students who type it instead of scanning. */
  public static code(secret: string, window: number): string {
    return String(parseInt(hmac(secret, `code:${window}`).slice(0, 8), 16) % 1_000_000).padStart(6, '0');
  }

  /** A token or code is valid in its own window and the one after it (up to a minute), so a scan right before it changes still counts. */
  public static verifyToken(secret: string, token: string, now = Date.now()): boolean {
    const w = this.window(now);
    const given = String(token || '').trim().toUpperCase();
    return [w, w - 1].some(x => sameText(this.token(secret, x), given));
  }

  public static verifyCode(secret: string, code: string, now = Date.now()): boolean {
    const w = this.window(now);
    const given = String(code || '').replace(/\D/g, '');
    return given.length === 6 && [w, w - 1].some(x => sameText(this.code(secret, x), given));
  }
}
