import crypto from 'crypto';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import { prisma } from '../db/prisma.js';
import { AttendanceEngine, AttendancePolicy } from '../engines/attendanceEngine.js';
import { OfferingRepository } from '../repositories/offeringRepository.js';
import { NotificationRepository } from '../repositories/notificationRepository.js';
import { AcademicRuleRepository } from '../repositories/academicRuleRepository.js';
import { publicBaseUrl } from '../reports/reportService.js';
import { INSTITUTION } from '../config/institution.js';
import type {
  AttendanceCheckInResult,
  AttendanceCloseResult,
  AttendanceCourseReport,
  AttendanceFigures,
  AttendanceLiveSession,
  AttendanceMethod,
  AttendanceRosterEntry,
  AttendanceSessionKind,
  AttendanceSessionSummary,
  AttendanceStanding,
  AttendanceStatus,
  CourseOffering,
  StudentCourseAttendance,
  TeachingSection,
} from '../../src/types/index.js';

/** An error with a status code and a message the person can read. */
export class AttendanceError extends Error {
  constructor(
    public status: number,
    public messageAr: string,
    public messageEn: string
  ) {
    super(messageEn);
  }
}

/** The signed-in user (see getCaller in routes/api.ts). */
export interface AttendanceCaller {
  id: string;
  role: string;
  nameAr: string;
  nameEn: string;
  instructorId?: string;
  studentId?: string;
}

interface RequestLike {
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
  get(name: string): string | undefined;
}

type MarkRow = { id: string; sessionId: string; studentId: string; status: string; method: string; markedAt: Date; markedById: string | null };
type SessionRow = {
  id: string;
  offeringId: string;
  kind: string;
  status: string;
  secret: string;
  startedAt: Date;
  endedAt: Date | null;
  startedById: string;
  startedByName: string;
  marks: MarkRow[];
};
type RosterStudent = { studentId: string; studentCode: string; nameAr: string; nameEn: string; enrolledAt: Date; advisorId: string | null };

const OFFERING_INCLUDE = {
  course: true,
  instructor: { include: { user: true } },
  assistant: { include: { user: true } },
  semester: true,
} as const;

const STAFF_ROLES = ['INSTRUCTOR', 'TEACHING_ASSISTANT', 'ADMIN', 'DEPARTMENT_HEAD'];

const plainName = (raw?: string | null) => (raw || '').split('(')[0].trim() || raw || '';

/** "مرة واحدة", "مرتين", "5 مرات", "11 مرة" */
const timesAr = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : n % 100 >= 3 && n % 100 <= 10 ? `${n} مرات` : `${n} مرة`);
const timesEn = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;
const studentsAr = (n: number) => (n === 1 ? 'طالب واحد' : n === 2 ? 'طالبان' : n % 100 >= 3 && n % 100 <= 10 ? `${n} طلاب` : `${n} طالباً`);

const KIND_AR: Record<AttendanceSessionKind, string> = { LECTURE: 'محاضرة', SECTION: 'سكشن' };
const KIND_EN: Record<AttendanceSessionKind, string> = { LECTURE: 'lecture', SECTION: 'section' };
const STATUS_AR: Record<AttendanceStatus, string> = { PRESENT: 'حاضر', LATE: 'متأخر', ABSENT: 'غائب', EXCUSED: 'غياب بعذر' };
const METHOD_AR: Record<AttendanceMethod, string> = { QR: 'رمز QR', CODE: 'الكود', MANUAL: 'يدوي', AUTO: 'تلقائي (لم يسجّل)' };
const STANDING_AR: Record<AttendanceStanding, string> = { OK: 'منتظم', NOTICE: 'تنبيه', LAST_CHANCE: 'آخر فرصة', DEPRIVED: 'تجاوز حد الغياب' };

const cairoDate = (d: Date, withTime = true) =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    weekday: withTime ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(d);
const cairoShort = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit' }).format(d);
const cairoTime = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(d);
const fileDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);

/**
 * Attendance by QR code or by hand.
 *
 * The instructor (lectures) or the teaching assistant (sections) starts a
 * session; the screen shows a QR code and a six-digit code that both change
 * every 30 seconds. Students scan it (or type the code) from their phones while
 * the session is open; staff can also mark anyone by hand. Closing the session
 * marks everyone else absent, updates each student's attendance percentage and
 * runs the attendance monitor, which warns students as they use up their
 * allowed absences and reports to the instructor, the TA and the advisor.
 */
export class AttendanceService {
  // ------------------------------------------------------------------ loading

  /** Load the current bylaw values (maximum absence %, teaching weeks). */
  private static async refreshPolicy(): Promise<void> {
    await AcademicRuleRepository.listAll();
  }

  private static async loadOffering(offeringId: string) {
    const row = await prisma.courseOffering.findUnique({ where: { id: offeringId }, include: OFFERING_INCLUDE });
    if (!row) throw new AttendanceError(404, 'الشعبة غير موجودة.', 'Section not found.');
    return { row, offering: OfferingRepository.mapToDomain(row), courseNameAr: row.course.nameAr, courseNameEn: row.course.nameEn };
  }

  /** The caller's part in a section: teaching it, assisting in it, or viewing it (admin / department head). */
  private static roleIn(caller: AttendanceCaller, offering: CourseOffering): 'INSTRUCTOR' | 'ASSISTANT' | 'VIEWER' | null {
    if (caller.instructorId && offering.instructorId === caller.instructorId) return 'INSTRUCTOR';
    if (caller.instructorId && offering.assistantId === caller.instructorId) return 'ASSISTANT';
    if (caller.role === 'ADMIN' || caller.role === 'DEPARTMENT_HEAD') return 'VIEWER';
    return null;
  }

  private static async requireStaff(caller: AttendanceCaller, offeringId: string, write: boolean) {
    const loaded = await this.loadOffering(offeringId);
    const role = this.roleIn(caller, loaded.offering);
    if (!role || (write && role === 'VIEWER')) {
      throw new AttendanceError(403, 'هذه الشعبة ليست من شعبك.', 'This is not one of your sections.');
    }
    return { ...loaded, role };
  }

  private static async loadSession(sessionId: string): Promise<SessionRow> {
    const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId }, include: { marks: true } });
    if (!session) throw new AttendanceError(404, 'المحاضرة غير موجودة.', 'Session not found.');
    return session as SessionRow;
  }

  /** Students sitting in this section this term. */
  private static async roster(offeringId: string): Promise<RosterStudent[]> {
    const rows = await prisma.courseRecord.findMany({
      where: { offeringId, status: 'IN_PROGRESS' },
      include: { student: { include: { user: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Set<string>();
    return rows
      .filter(r => (seen.has(r.studentId) ? false : (seen.add(r.studentId), true)))
      .map(r => ({
        studentId: r.studentId,
        studentCode: r.student.studentCode,
        nameAr: plainName(r.student.user.nameAr),
        nameEn: plainName(r.student.user.nameEn),
        enrolledAt: r.createdAt,
        advisorId: r.student.advisorId,
      }))
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
  }

  private static async sessionsOf(offeringId: string, studentId?: string): Promise<SessionRow[]> {
    return (await prisma.attendanceSession.findMany({
      where: { offeringId },
      include: { marks: studentId ? { where: { studentId } } : true },
      orderBy: { startedAt: 'asc' },
    })) as SessionRow[];
  }

  /**
   * The marks that count for a student: every closed session since they joined
   * the section (unmarked = absent), plus open sessions they already checked into.
   */
  private static marksFor(studentId: string, sessions: SessionRow[], enrolledAt?: Date): (AttendanceStatus | null)[] {
    const result: (AttendanceStatus | null)[] = [];
    for (const s of sessions) {
      const mark = s.marks.find(m => m.studentId === studentId);
      if (s.status === 'CLOSED') {
        if (!mark && enrolledAt && s.startedAt.getTime() < enrolledAt.getTime()) continue;
        result.push((mark?.status as AttendanceStatus) ?? null);
      } else if (mark) {
        result.push(mark.status as AttendanceStatus);
      }
    }
    return result;
  }

  private static summary(session: SessionRow, offering: CourseOffering, courseNameAr: string, courseNameEn: string, rosterCount: number): AttendanceSessionSummary {
    const count = (status: string) => session.marks.filter(m => m.status === status).length;
    const present = count('PRESENT');
    const late = count('LATE');
    const excused = count('EXCUSED');
    const absent = session.status === 'CLOSED' ? Math.max(0, rosterCount - present - late - excused) : count('ABSENT');
    return {
      id: session.id,
      offeringId: session.offeringId,
      courseCode: offering.courseCode,
      courseNameAr,
      courseNameEn,
      sectionCode: offering.sectionCode,
      kind: session.kind as AttendanceSessionKind,
      status: session.status as 'OPEN' | 'CLOSED',
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      startedByName: session.startedByName,
      rosterCount,
      presentCount: present + late,
      lateCount: late,
      absentCount: absent,
      excusedCount: excused,
    };
  }

  private static rosterEntries(roster: RosterStudent[], sessions: SessionRow[], planned: number, current?: SessionRow): AttendanceRosterEntry[] {
    return roster.map(st => {
      const figures = AttendanceEngine.figures(this.marksFor(st.studentId, sessions, st.enrolledAt), planned);
      const mark = current?.marks.find(m => m.studentId === st.studentId);
      return {
        studentId: st.studentId,
        studentCode: st.studentCode,
        nameAr: st.nameAr,
        nameEn: st.nameEn,
        ...figures,
        status: (mark?.status as AttendanceStatus) ?? (current?.status === 'CLOSED' ? 'ABSENT' : null),
        method: mark?.method as AttendanceMethod | undefined,
        markedAt: mark?.markedAt.toISOString(),
      };
    });
  }

  private static async teachingSection(row: any, caller: AttendanceCaller): Promise<TeachingSection> {
    const offering = OfferingRepository.mapToDomain(row);
    const roster = await this.roster(offering.id);
    const sessions = await this.sessionsOf(offering.id);
    const planned = AttendanceEngine.plannedSessions(offering);
    const figures = roster.map(st => AttendanceEngine.figures(this.marksFor(st.studentId, sessions, st.enrolledAt), planned));
    const withSessions = figures.filter(f => f.heldSessions > 0);
    const open = sessions.find(s => s.status === 'OPEN');
    const closed = sessions.filter(s => s.status === 'CLOSED');
    return {
      offering,
      courseNameAr: row.course.nameAr,
      courseNameEn: row.course.nameEn,
      role: this.roleIn(caller, offering) === 'ASSISTANT' ? 'ASSISTANT' : 'INSTRUCTOR',
      rosterCount: roster.length,
      plannedSessions: planned,
      heldSessions: closed.length,
      allowedAbsences: AttendanceEngine.allowedAbsences(planned),
      averageAttendance: withSessions.length
        ? Math.round((withSessions.reduce((sum, f) => sum + f.attendancePercent, 0) / withSessions.length) * 10) / 10
        : 100,
      atRiskCount: figures.filter(f => f.standing === 'LAST_CHANCE').length,
      deprivedCount: figures.filter(f => f.standing === 'DEPRIVED').length,
      openSessionId: open?.id,
      lastSessionAt: (open || closed[closed.length - 1])?.startedAt.toISOString(),
    };
  }

  // ------------------------------------------------------------ staff screens

  /** Sections the instructor teaches or the TA assists in (all taught sections for admin / department head). */
  public static async sectionsFor(caller: AttendanceCaller): Promise<TeachingSection[]> {
    if (!STAFF_ROLES.includes(caller.role)) throw new AttendanceError(403, 'هذه الصفحة لأعضاء هيئة التدريس.', 'This page is for teaching staff.');
    await this.refreshPolicy();
    const mine = caller.instructorId || '__none__';
    const where =
      caller.role === 'TEACHING_ASSISTANT'
        ? { assistantId: mine }
        : caller.role === 'INSTRUCTOR'
          ? { OR: [{ instructorId: mine }, { assistantId: mine }] }
          : { records: { some: { status: 'IN_PROGRESS' as const } } };
    const rows = await prisma.courseOffering.findMany({ where, include: OFFERING_INCLUDE, orderBy: [{ course: { code: 'asc' } }, { id: 'asc' }] });
    const sections: TeachingSection[] = [];
    for (const row of rows) sections.push(await this.teachingSection(row, caller));
    return sections;
  }

  /** Start a lecture (instructor) or section (TA) for this course, or return the one already running. */
  public static async start(caller: AttendanceCaller, offeringId: string, kind: string | undefined, req: RequestLike): Promise<AttendanceLiveSession> {
    const { role } = await this.requireStaff(caller, offeringId, true);
    const open = await prisma.attendanceSession.findFirst({ where: { offeringId, status: 'OPEN' } });
    if (open) return this.live(caller, open.id, req);
    const session = await prisma.attendanceSession.create({
      data: {
        id: crypto.randomUUID(),
        offeringId,
        kind: kind === 'LECTURE' || kind === 'SECTION' ? kind : role === 'ASSISTANT' ? 'SECTION' : 'LECTURE',
        status: 'OPEN',
        secret: crypto.randomBytes(32).toString('hex'),
        startedById: caller.id,
        startedByName: plainName(caller.nameAr),
      },
    });
    return this.live(caller, session.id, req);
  }

  /** What the instructor's screen shows: the current QR code and code, and who has checked in. */
  public static async live(caller: AttendanceCaller, sessionId: string, req: RequestLike): Promise<AttendanceLiveSession> {
    await this.refreshPolicy();
    const session = await this.loadSession(sessionId);
    const { offering, courseNameAr, courseNameEn } = await this.requireStaff(caller, session.offeringId, false);
    const roster = await this.roster(session.offeringId);
    const sessions = await this.sessionsOf(session.offeringId);
    const planned = AttendanceEngine.plannedSessions(offering);
    const now = Date.now();
    const isOpen = session.status === 'OPEN';
    const window = AttendanceEngine.window(now);
    const token = isOpen ? AttendanceEngine.token(session.secret, window) : '';
    const { checkInUrl, qrText } = isOpen ? this.checkInLink(publicBaseUrl(req).url, token) : { checkInUrl: '', qrText: '' };
    return {
      ...this.summary(session, offering, courseNameAr, courseNameEn, roster.length),
      token,
      code: isOpen ? AttendanceEngine.code(session.secret, window) : '',
      checkInUrl,
      // Full quiet zone (4 modules) and Q error correction, so phone cameras read it off a screen or projector.
      qrSvg: isOpen ? await QRCode.toString(qrText, { type: 'svg', errorCorrectionLevel: 'Q', margin: 4, color: { dark: '#000000', light: '#ffffff' } }) : '',
      rotatesInMs: AttendanceEngine.rotatesInMs(now),
      roster: this.rosterEntries(roster, sessions, planned, session),
    };
  }

  /**
   * The link a student's phone opens: <site>/a/<token>. Kept short, and written
   * in capitals inside the QR code (web addresses ignore the case of the site
   * name; the token is already capitals), so the code uses the compact
   * alphanumeric QR mode: 29×29 modules instead of 37×37, easier to read from a
   * distance and on a phone screen.
   */
  private static checkInLink(baseUrl: string, token: string): { checkInUrl: string; qrText: string } {
    const checkInUrl = `${baseUrl}/a/${token}`;
    let qrText = checkInUrl;
    try {
      const url = new URL(baseUrl);
      if (url.pathname === '/' || url.pathname === '') qrText = `${url.origin.toUpperCase()}/A/${token}`;
    } catch {
      // keep the link as it is
    }
    return { checkInUrl, qrText };
  }

  /** Mark a student by hand (present, late, absent or excused), during or after the session. */
  public static async mark(caller: AttendanceCaller, sessionId: string, studentId: string, status: string, req: RequestLike): Promise<AttendanceLiveSession> {
    if (!['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'].includes(status)) {
      throw new AttendanceError(400, 'حالة الحضور غير صحيحة.', 'Invalid attendance status.');
    }
    const session = await this.loadSession(sessionId);
    await this.requireStaff(caller, session.offeringId, true);
    const roster = await this.roster(session.offeringId);
    if (!roster.some(r => r.studentId === studentId)) {
      throw new AttendanceError(404, 'الطالب غير مسجل في هذه الشعبة.', 'The student is not in this section.');
    }
    await prisma.attendanceMark.upsert({
      where: { sessionId_studentId: { sessionId, studentId } },
      create: { id: crypto.randomUUID(), sessionId, studentId, status, method: 'MANUAL', markedById: caller.id },
      update: { status, method: 'MANUAL', markedById: caller.id, markedAt: new Date() },
    });
    if (session.status === 'CLOSED') {
      await this.recomputePercentages(session.offeringId);
      await this.monitor(session.offeringId, { studentIds: [studentId] });
    }
    return this.live(caller, sessionId, req);
  }

  /**
   * End the session: everyone who did not check in is marked absent, attendance
   * percentages are updated, the monitor sends its warnings, and the instructor
   * and TA get the end-of-session report.
   */
  public static async close(caller: AttendanceCaller, sessionId: string): Promise<AttendanceCloseResult> {
    const session = await this.loadSession(sessionId);
    const { offering, courseNameAr, courseNameEn } = await this.requireStaff(caller, session.offeringId, true);
    const roster = await this.roster(session.offeringId);
    if (session.status === 'OPEN') {
      const marked = new Set(session.marks.map(m => m.studentId));
      await prisma.attendanceMark.createMany({
        data: roster
          .filter(r => !marked.has(r.studentId))
          .map(r => ({ id: crypto.randomUUID(), sessionId, studentId: r.studentId, status: 'ABSENT', method: 'AUTO', markedById: caller.id })),
        skipDuplicates: true,
      });
      await prisma.attendanceSession.update({ where: { id: sessionId }, data: { status: 'CLOSED', endedAt: new Date() } });
    }
    await this.recomputePercentages(session.offeringId);
    const warningsSent = await this.monitor(session.offeringId, { sessionId });
    const closed = await this.loadSession(sessionId);
    const summary = this.summary(closed, offering, courseNameAr, courseNameEn, roster.length);
    await this.sendSessionReport(summary, offering);
    return { session: summary, warningsSent };
  }

  /** Whole-term picture of a section: every session and every student's marks and standing. */
  public static async courseReport(caller: AttendanceCaller, offeringId: string): Promise<AttendanceCourseReport> {
    await this.refreshPolicy();
    const { row, offering, courseNameAr, courseNameEn } = await this.requireStaff(caller, offeringId, false);
    const roster = await this.roster(offeringId);
    const sessions = await this.sessionsOf(offeringId);
    const planned = AttendanceEngine.plannedSessions(offering);
    const entries = this.rosterEntries(roster, sessions, planned);
    return {
      section: await this.teachingSection(row, caller),
      sessions: sessions.map(s => this.summary(s, offering, courseNameAr, courseNameEn, roster.length)),
      students: entries.map(entry => {
        const enrolledAt = roster.find(r => r.studentId === entry.studentId)?.enrolledAt;
        const marks: Record<string, AttendanceStatus | null> = {};
        for (const s of sessions) {
          const mark = s.marks.find(m => m.studentId === entry.studentId);
          if (mark) marks[s.id] = mark.status as AttendanceStatus;
          else if (s.status === 'CLOSED' && !(enrolledAt && s.startedAt.getTime() < enrolledAt.getTime())) marks[s.id] = 'ABSENT';
          else marks[s.id] = null;
        }
        return { ...entry, marks };
      }),
    };
  }

  // ------------------------------------------------------------------ student

  private static courseAttendance(row: any, sessions: SessionRow[], studentId: string, enrolledAt?: Date): StudentCourseAttendance {
    const offering = OfferingRepository.mapToDomain(row);
    const planned = AttendanceEngine.plannedSessions(offering);
    const open = sessions.find(s => s.status === 'OPEN');
    return {
      offeringId: offering.id,
      courseCode: offering.courseCode,
      courseNameAr: row.course.nameAr,
      courseNameEn: row.course.nameEn,
      sectionCode: offering.sectionCode,
      instructorName: offering.instructorName,
      assistantName: offering.assistantName,
      scheduleAr: offering.lectureDayTimeAr,
      scheduleEn: offering.lectureDayTimeEn,
      ...AttendanceEngine.figures(this.marksFor(studentId, sessions, enrolledAt), planned),
      openSessionId: open?.id,
      openSessionKind: open?.kind as AttendanceSessionKind | undefined,
      history: sessions
        .filter(s => {
          const mark = s.marks.find(m => m.studentId === studentId);
          return mark || (s.status === 'CLOSED' && !(enrolledAt && s.startedAt.getTime() < enrolledAt.getTime()));
        })
        .map(s => {
          const mark = s.marks.find(m => m.studentId === studentId);
          return {
            sessionId: s.id,
            startedAt: s.startedAt.toISOString(),
            kind: s.kind as AttendanceSessionKind,
            status: (mark?.status as AttendanceStatus) ?? (s.status === 'CLOSED' ? 'ABSENT' : null),
            method: mark?.method as AttendanceMethod | undefined,
          };
        }),
    };
  }

  /** The signed-in student's current courses with attendance figures. */
  public static async forStudent(caller: AttendanceCaller): Promise<StudentCourseAttendance[]> {
    if (caller.role !== 'STUDENT' || !caller.studentId) {
      throw new AttendanceError(403, 'هذه الصفحة للطلاب.', 'This page is for students.');
    }
    await this.refreshPolicy();
    const records = await prisma.courseRecord.findMany({
      where: { studentId: caller.studentId, status: 'IN_PROGRESS', offeringId: { not: null } },
      include: { offering: { include: OFFERING_INCLUDE } },
      orderBy: { createdAt: 'asc' },
    });
    const result: StudentCourseAttendance[] = [];
    for (const record of records) {
      if (!record.offering) continue;
      const sessions = await this.sessionsOf(record.offering.id, caller.studentId);
      result.push(this.courseAttendance(record.offering, sessions, caller.studentId, record.createdAt));
    }
    return result.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  }

  /** A student checks in by scanning the QR code (session + token) or typing the six-digit code. */
  public static async checkIn(caller: AttendanceCaller, input: { sessionId?: string; token?: string; code?: string }): Promise<AttendanceCheckInResult> {
    if (caller.role !== 'STUDENT' || !caller.studentId) {
      throw new AttendanceError(403, 'تسجيل الحضور للطلاب فقط. سجّل الدخول بحساب الطالب.', 'Only students can check in. Sign in with a student account.');
    }
    const studentId = caller.studentId;
    await this.refreshPolicy();
    const records = await prisma.courseRecord.findMany({
      where: { studentId, status: 'IN_PROGRESS', offeringId: { not: null } },
      select: { offeringId: true, createdAt: true },
    });
    const mySections = records.map(r => r.offeringId!) as string[];

    let session: { id: string; offeringId: string; status: string; secret: string; startedAt: Date } | null = null;
    let method: AttendanceMethod = 'QR';
    if (!input.sessionId && input.token) {
      // Short link (<site>/a/<token>): the token tells which open session it belongs to.
      const open = await prisma.attendanceSession.findMany({ where: { status: 'OPEN' } });
      session = open.find(s => AttendanceEngine.verifyToken(s.secret, String(input.token))) || null;
      if (!session) {
        throw new AttendanceError(
          410,
          'انتهت صلاحية رمز QR أو انتهى تسجيل الحضور. امسح الرمز المعروض الآن على الشاشة.',
          'This QR code has expired or attendance has closed. Scan the one on the screen now.'
        );
      }
    } else if (input.sessionId) {
      session = await prisma.attendanceSession.findUnique({ where: { id: String(input.sessionId) } });
      if (!session) throw new AttendanceError(404, 'رمز الحضور غير صحيح.', 'This attendance code is not valid.');
      if (session.status !== 'OPEN') throw new AttendanceError(409, 'انتهى تسجيل الحضور لهذه المحاضرة.', 'Attendance for this session has closed.');
      if (!AttendanceEngine.verifyToken(session.secret, String(input.token || ''))) {
        throw new AttendanceError(410, 'انتهت صلاحية رمز QR. امسح الرمز المعروض الآن على الشاشة.', 'This QR code has expired. Scan the one on the screen now.');
      }
    } else if (input.code) {
      method = 'CODE';
      const open = await prisma.attendanceSession.findMany({ where: { status: 'OPEN', offeringId: { in: mySections } } });
      session = open.find(s => AttendanceEngine.verifyCode(s.secret, String(input.code))) || null;
      if (!session) {
        throw new AttendanceError(
          400,
          'الكود غير صحيح أو انتهت صلاحيته، أو لا توجد محاضرة مفتوحة الآن في مقرراتك.',
          'The code is wrong or expired, or none of your courses has an open session now.'
        );
      }
    } else {
      throw new AttendanceError(400, 'امسح رمز QR أو اكتب الكود المعروض.', 'Scan the QR code or type the code shown.');
    }

    if (!mySections.includes(session.offeringId)) {
      throw new AttendanceError(403, 'أنت غير مسجل في هذه الشعبة، فلا يمكن تسجيل حضورك فيها.', 'You are not registered in this section.');
    }

    const existing = await prisma.attendanceMark.findUnique({ where: { sessionId_studentId: { sessionId: session.id, studentId } } });
    let status = existing?.status as AttendanceStatus | undefined;
    if (!existing) {
      const minutes = (Date.now() - session.startedAt.getTime()) / 60_000;
      status = minutes > AttendanceEngine.LATE_AFTER_MINUTES ? 'LATE' : 'PRESENT';
      try {
        await prisma.attendanceMark.create({ data: { id: crypto.randomUUID(), sessionId: session.id, studentId, status, method } });
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
      }
    }

    const row = await prisma.courseOffering.findUnique({ where: { id: session.offeringId }, include: OFFERING_INCLUDE });
    const sessions = await this.sessionsOf(session.offeringId, studentId);
    const enrolledAt = records.find(r => r.offeringId === session!.offeringId)?.createdAt;
    const course = this.courseAttendance(row, sessions, studentId, enrolledAt);
    if (existing) {
      return {
        success: true,
        alreadyMarked: true,
        status,
        messageAr: `حضورك مسجل بالفعل في ${course.courseCode}.`,
        messageEn: `You are already checked in to ${course.courseCode}.`,
        course,
      };
    }
    return {
      success: true,
      status,
      messageAr: status === 'LATE' ? `تم تسجيل حضورك في ${course.courseCode} (متأخر).` : `تم تسجيل حضورك في ${course.courseCode}.`,
      messageEn: status === 'LATE' ? `Checked in to ${course.courseCode} (late).` : `Checked in to ${course.courseCode}.`,
      course,
    };
  }

  // ------------------------------------------------------------------ monitor

  /** Keep each current course's attendance percentage in step with its sessions. */
  public static async recomputePercentages(offeringId?: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "CourseRecord" r SET "attendancePercentage" = sub.pct
       FROM (
         SELECT m."studentId", s."offeringId",
                ROUND(100.0 * SUM(CASE WHEN m.status IN ('PRESENT','LATE') THEN 1 ELSE 0 END)
                      / NULLIF(SUM(CASE WHEN m.status <> 'EXCUSED' THEN 1 ELSE 0 END), 0), 1) AS pct
         FROM "AttendanceMark" m JOIN "AttendanceSession" s ON s.id = m."sessionId"
         WHERE s.status = 'CLOSED' ${offeringId ? `AND s."offeringId" = $1` : ''}
         GROUP BY m."studentId", s."offeringId"
       ) sub
       WHERE r."studentId" = sub."studentId" AND r."offeringId" = sub."offeringId"
         AND r.status = 'IN_PROGRESS' AND sub.pct IS NOT NULL`,
      ...(offeringId ? [offeringId] : [])
    );
  }

  private static warningText(f: AttendanceFigures, projected: number, code: string, courseAr: string, courseEn: string) {
    const share = `${f.maxAbsencePercent}%`;
    if (f.standing === 'DEPRIVED') {
      return {
        titleAr: `تجاوزت حد الغياب في ${code}`,
        titleEn: `You passed the absence limit in ${code}`,
        messageAr: `بلغ غيابك في ${courseAr} ${timesAr(f.absent)}، والمسموح ${timesAr(f.allowedAbsences)} فقط (${share} من ${f.plannedSessions} محاضرة وسكشن في الفصل). أنت معرّض للحرمان من دخول الامتحان النهائي؛ راجع أستاذ المادة ومرشدك الأكاديمي فوراً.`,
        messageEn: `You have missed ${courseEn} ${timesEn(f.absent)}; only ${f.allowedAbsences} are allowed (${share} of the term's ${f.plannedSessions} lectures and sections). You may be barred from the final exam — see the instructor and your advisor now.`,
      };
    }
    if (f.standing === 'LAST_CHANCE') {
      return {
        titleAr: `آخر فرصة: الغياب في ${code}`,
        titleEn: `Last chance: absences in ${code}`,
        messageAr: `استنفدت كل مرات الغياب المسموح بها في ${courseAr} (${timesAr(f.allowedAbsences)}). أي غياب آخر يعرّضك للحرمان من دخول الامتحان النهائي.`,
        messageEn: `You have used all ${f.allowedAbsences} allowed absences in ${courseEn}. One more absence can bar you from the final exam.`,
      };
    }
    const projection =
      projected > f.allowedAbsences
        ? ` بمعدل غيابك الحالي يُتوقع أن تصل إلى نحو ${projected} غيابات قبل نهاية الفصل، وهذا أكثر من المسموح.`
        : '';
    const projectionEn = projected > f.allowedAbsences ? ` At your current rate you would reach about ${projected} absences by the end of term, over the limit.` : '';
    return {
      titleAr: `تنبيه غياب في ${code}`,
      titleEn: `Absence notice in ${code}`,
      messageAr: `غبت ${timesAr(f.absent)} من ${f.heldSessions} في ${courseAr}. المسموح لك ${timesAr(f.allowedAbsences)} طوال الفصل (${share} من ${f.plannedSessions})، والمتبقي ${timesAr(Math.max(0, f.remainingAbsences))}.${projection}`,
      messageEn: `You have missed ${courseEn} ${timesEn(f.absent)} out of ${f.heldSessions}. You may miss ${f.allowedAbsences} in the whole term (${share} of ${f.plannedSessions}); ${Math.max(0, f.remainingAbsences)} left.${projectionEn}`,
    };
  }

  /**
   * The attendance monitor. For each student in the section it works out where
   * they stand against the bylaw limit and, the first time they reach a level
   * (half the allowance used, all of it used, over the limit), warns them — with
   * a projection of where their current rate leads. Students who reach or pass
   * the limit are reported to the instructor and the TA, and those over it to
   * their advisor. Each message goes out once per level, student and course.
   */
  public static async monitor(
    offeringId: string,
    options: { studentIds?: string[]; sessionId?: string } = {}
  ): Promise<AttendanceCloseResult['warningsSent']> {
    await this.refreshPolicy();
    const { offering, courseNameAr, courseNameEn } = await this.loadOffering(offeringId);
    const roster = (await this.roster(offeringId)).filter(st => !options.studentIds || options.studentIds.includes(st.studentId));
    const sessions = await this.sessionsOf(offeringId);
    const planned = AttendanceEngine.plannedSessions(offering);
    const sent: AttendanceCloseResult['warningsSent'] = [];

    for (const st of roster) {
      const f = AttendanceEngine.figures(this.marksFor(st.studentId, sessions, st.enrolledAt), planned);
      if (f.standing === 'OK') continue;
      const text = this.warningText(f, AttendanceEngine.projectedAbsences(f), offering.courseCode, courseNameAr, courseNameEn);
      const created = await NotificationRepository.createOnce(`att_${f.standing}_${offeringId}_${st.studentId}`, {
        recipientId: st.studentId,
        type: 'RISK',
        ...text,
      });
      if (!created) continue;
      sent.push({ studentId: st.studentId, nameAr: st.nameAr, nameEn: st.nameEn, standing: f.standing, absent: f.absent, allowedAbsences: f.allowedAbsences });
      if (f.standing === 'DEPRIVED' && st.advisorId) {
        await NotificationRepository.createOnce(`att_adv_${offeringId}_${st.studentId}`, {
          recipientId: st.advisorId,
          type: 'RISK',
          titleAr: `${st.nameAr} تجاوز حد الغياب في ${offering.courseCode}`,
          titleEn: `${st.nameEn} passed the absence limit in ${offering.courseCode}`,
          messageAr: `غياب ${st.nameAr} (${st.studentCode}) في ${courseNameAr} بلغ ${timesAr(f.absent)} من ${f.allowedAbsences} مسموح، وهو معرّض للحرمان من الامتحان النهائي.`,
          messageEn: `${st.nameEn} (${st.studentCode}) has missed ${courseNameEn} ${timesEn(f.absent)} (${f.allowedAbsences} allowed) and may be barred from the final exam.`,
        });
      }
    }

    const serious = sent.filter(w => w.standing !== 'NOTICE');
    if (serious.length) {
      const reportId = options.sessionId || `bulk_${new Date().toISOString().slice(0, 10)}`;
      const listAr = serious.map(w => `${w.nameAr}: ${timesAr(w.absent)} من ${w.allowedAbsences} مسموح (${STANDING_AR[w.standing]})`).join('، ');
      const listEn = serious.map(w => `${w.nameEn}: ${w.absent} of ${w.allowedAbsences} allowed`).join(', ');
      for (const staffId of [offering.instructorId, offering.assistantId].filter(Boolean) as string[]) {
        await NotificationRepository.createOnce(`att_rep_${reportId}_${offeringId}_${staffId}`, {
          recipientId: staffId,
          type: 'RISK',
          titleAr: `تقرير غياب ${offering.courseCode}: ${studentsAr(serious.length)} عند حد الغياب أو بعده`,
          titleEn: `Absence report ${offering.courseCode}: ${serious.length} at or over the limit`,
          messageAr: `${listAr}. التفاصيل وملف Excel في صفحة الحضور.`,
          messageEn: `${listEn}. Details and an Excel file on the Attendance page.`,
        });
      }
    }
    return sent;
  }

  /** End-of-session report to the instructor and the TA: how many attended. */
  private static async sendSessionReport(s: AttendanceSessionSummary, offering: CourseOffering): Promise<void> {
    const pct = s.rosterCount - s.excusedCount > 0 ? Math.round((s.presentCount / (s.rosterCount - s.excusedCount)) * 100) : 100;
    const when = cairoDate(new Date(s.startedAt));
    for (const staffId of [offering.instructorId, offering.assistantId].filter(Boolean) as string[]) {
      await NotificationRepository.createOnce(`att_sum_${s.id}_${staffId}`, {
        recipientId: staffId,
        type: 'GENERAL',
        titleAr: `حضور ${KIND_AR[s.kind]} ${s.courseCode}: ${s.presentCount} من ${s.rosterCount}`,
        titleEn: `${s.courseCode} ${KIND_EN[s.kind]} attendance: ${s.presentCount} of ${s.rosterCount}`,
        messageAr: `${when} — حضر ${s.presentCount}${s.lateCount ? ` (منهم ${s.lateCount} متأخر)` : ''}، وغاب ${s.absentCount}${s.excusedCount ? `، وبعذر ${s.excusedCount}` : ''}. نسبة الحضور ${pct}%. كشف Excel متاح في صفحة الحضور.`,
        messageEn: `${s.presentCount} attended${s.lateCount ? ` (${s.lateCount} late)` : ''}, ${s.absentCount} absent${s.excusedCount ? `, ${s.excusedCount} excused` : ''} — ${pct}%. An Excel sheet is on the Attendance page.`,
      });
    }
  }

  // ------------------------------------------------------------------- Excel

  private static styleHeaderBlock(ws: ExcelJS.Worksheet, lines: string[], width: number) {
    lines.forEach((text, i) => {
      const row = ws.getRow(i + 1);
      row.getCell(1).value = text;
      ws.mergeCells(i + 1, 1, i + 1, width);
      row.getCell(1).font = { bold: i < 3, size: i === 0 ? 15 : i === 2 ? 13 : 11, color: { argb: i < 2 ? 'FF064226' : 'FF191E1B' } };
      row.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
      row.height = i === 0 ? 24 : 19;
    });
  }

  private static styleTableHeader(row: ExcelJS.Row) {
    row.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B6439' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF064226' } } };
    });
    row.height = 30;
  }

  private static readonly STATUS_FILL: Record<string, string> = {
    PRESENT: 'FFE8F3EC',
    LATE: 'FFFFF3D6',
    ABSENT: 'FFFDEDEB',
    EXCUSED: 'FFF0F1EF',
  };

  private static async toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** One session's register: who attended, how, and their standing for the term. */
  public static async sessionWorkbook(caller: AttendanceCaller, sessionId: string): Promise<{ buffer: Buffer; filename: string }> {
    await this.refreshPolicy();
    const session = await this.loadSession(sessionId);
    const { offering, courseNameAr } = await this.requireStaff(caller, session.offeringId, false);
    const roster = await this.roster(session.offeringId);
    const sessions = await this.sessionsOf(session.offeringId);
    const planned = AttendanceEngine.plannedSessions(offering);
    const entries = this.rosterEntries(roster, sessions, planned, session);
    const s = this.summary(session, offering, courseNameAr, '', roster.length);
    const pct = s.rosterCount - s.excusedCount > 0 ? Math.round((s.presentCount / (s.rosterCount - s.excusedCount)) * 100) : 100;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Smart Academic Advisor';
    const ws = wb.addWorksheet('كشف الحضور', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 7 }] });
    const headers = ['م', 'الرقم الجامعي', 'اسم الطالب', 'الحالة', 'طريقة التسجيل', 'وقت التسجيل', 'غياب الفصل', 'المسموح', 'الوضع'];
    this.styleHeaderBlock(
      ws,
      [
        `${INSTITUTION.universityAr} — ${INSTITUTION.facultyAr}`,
        INSTITUTION.officeAr,
        `كشف حضور ${KIND_AR[s.kind]}: ${s.courseCode} ${courseNameAr} — ${plainName(offering.sectionCode)}`,
        `${cairoDate(session.startedAt)} — بواسطة ${session.startedByName}${session.status === 'OPEN' ? ' (المحاضرة ما زالت مفتوحة)' : ''}`,
        `المسجلون ${s.rosterCount} · حضر ${s.presentCount}${s.lateCount ? ` (منهم ${s.lateCount} متأخر)` : ''} · غاب ${s.absentCount} · بعذر ${s.excusedCount} · نسبة الحضور ${pct}%`,
      ],
      headers.length
    );
    const headerRow = ws.getRow(7);
    headerRow.values = headers;
    this.styleTableHeader(headerRow);
    entries.forEach((e, i) => {
      const row = ws.addRow([
        i + 1,
        e.studentCode,
        e.nameAr,
        e.status ? STATUS_AR[e.status] : 'لم يسجّل بعد',
        e.method ? METHOD_AR[e.method] : '—',
        e.markedAt && e.status !== 'ABSENT' ? cairoTime(new Date(e.markedAt)) : '—',
        e.absent,
        e.allowedAbsences,
        STANDING_AR[e.standing],
      ]);
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      const fill = e.status ? this.STATUS_FILL[e.status] : undefined;
      if (fill) row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      if (e.standing === 'DEPRIVED' || e.standing === 'LAST_CHANCE') {
        row.getCell(9).font = { bold: true, color: { argb: 'FFB53022' } };
      }
    });
    ws.columns = [{ width: 6 }, { width: 14 }, { width: 30 }, { width: 13 }, { width: 18 }, { width: 13 }, { width: 12 }, { width: 10 }, { width: 16 }];
    ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: headers.length } };
    return {
      buffer: await this.toBuffer(wb),
      filename: `attendance_${s.courseCode.replace(/\s+/g, '')}_${fileDate(session.startedAt)}_${s.kind === 'SECTION' ? 'section' : 'lecture'}.xlsx`,
    };
  }

  /** A section's whole term: one column per session, totals and standing per student, and a sheet of sessions. */
  public static async courseWorkbook(caller: AttendanceCaller, offeringId: string): Promise<{ buffer: Buffer; filename: string }> {
    const report = await this.courseReport(caller, offeringId);
    const { section, sessions, students } = report;
    const o = section.offering;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Smart Academic Advisor';

    const fixed = ['م', 'الرقم الجامعي', 'اسم الطالب'];
    const sessionCols = sessions.map(s => `${cairoShort(new Date(s.startedAt))}\n${s.kind === 'SECTION' ? 'سكشن' : 'محاضرة'}`);
    const totals = ['حضر', 'غاب', 'بعذر', 'نسبة الحضور', 'المتبقي من الغياب', 'الوضع'];
    const headers = [...fixed, ...sessionCols, ...totals];
    const ws = wb.addWorksheet('الغياب', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 7, xSplit: 3 }] });
    this.styleHeaderBlock(
      ws,
      [
        `${INSTITUTION.universityAr} — ${INSTITUTION.facultyAr}`,
        INSTITUTION.officeAr,
        `تقرير الغياب: ${o.courseCode} ${section.courseNameAr} — ${plainName(o.sectionCode)}`,
        `أستاذ المادة: ${plainName(o.instructorName)}${o.assistantName ? ` · المعيد: ${plainName(o.assistantName)}` : ''} · حتى ${cairoDate(new Date(), false)}`,
        `المقرر في الفصل ${section.plannedSessions} محاضرة وسكشن · عُقد منها ${section.heldSessions} · الغياب المسموح ${section.allowedAbsences} (${AttendancePolicy.maxAbsencePercent}%) · متوسط الحضور ${section.averageAttendance}%`,
      ],
      Math.min(headers.length, 14)
    );
    const headerRow = ws.getRow(7);
    headerRow.values = headers;
    this.styleTableHeader(headerRow);
    headerRow.height = 36;

    const symbol: Record<AttendanceStatus, string> = { PRESENT: '✓', LATE: 'متأخر', ABSENT: '✗', EXCUSED: 'عذر' };
    students.forEach((st, i) => {
      const row = ws.addRow([
        i + 1,
        st.studentCode,
        st.nameAr,
        ...sessions.map(s => (st.marks[s.id] ? symbol[st.marks[s.id]!] : '')),
        st.attended,
        st.absent,
        st.excused,
        `${st.attendancePercent}%`,
        st.remainingAbsences,
        STANDING_AR[st.standing],
      ]);
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      sessions.forEach((s, j) => {
        const mark = st.marks[s.id];
        if (mark) row.getCell(fixed.length + j + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: this.STATUS_FILL[mark] } };
      });
      const standingCell = row.getCell(headers.length);
      if (st.standing === 'DEPRIVED' || st.standing === 'LAST_CHANCE') {
        standingCell.font = { bold: true, color: { argb: 'FFB53022' } };
        standingCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDEDEB' } };
      } else if (st.standing === 'NOTICE') {
        standingCell.font = { bold: true, color: { argb: 'FFC26505' } };
      }
    });
    ws.columns = [{ width: 6 }, { width: 14 }, { width: 28 }, ...sessions.map(() => ({ width: 9 })), { width: 8 }, { width: 8 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 16 }];
    ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: headers.length } };

    const list = wb.addWorksheet('المحاضرات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    list.addRow(['م', 'التاريخ والوقت', 'النوع', 'بواسطة', 'المسجلون', 'حضر', 'متأخر', 'غاب', 'بعذر', 'نسبة الحضور']);
    this.styleTableHeader(list.getRow(1));
    sessions.forEach((s, i) => {
      const counted = s.rosterCount - s.excusedCount;
      list.addRow([
        i + 1,
        cairoDate(new Date(s.startedAt)),
        s.kind === 'SECTION' ? 'سكشن' : 'محاضرة',
        s.startedByName,
        s.rosterCount,
        s.presentCount,
        s.lateCount,
        s.absentCount,
        s.excusedCount,
        counted > 0 ? `${Math.round((s.presentCount / counted) * 100)}%` : '—',
      ]).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    list.columns = [{ width: 6 }, { width: 34 }, { width: 10 }, { width: 22 }, { width: 11 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 12 }];

    return { buffer: await this.toBuffer(wb), filename: `attendance_report_${o.courseCode.replace(/\s+/g, '')}_${o.id}.xlsx` };
  }
}
