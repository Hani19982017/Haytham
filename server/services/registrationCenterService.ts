import { prisma } from '../db/prisma.js';
import { StudentRepository } from '../repositories/studentRepository.js';
import { CourseRepository } from '../repositories/courseRepository.js';
import { OfferingRepository } from '../repositories/offeringRepository.js';
import { RegistrationRequestRepository } from '../repositories/registrationRequestRepository.js';
import { NotificationRepository } from '../repositories/notificationRepository.js';
import { AcademicRuleRepository } from '../repositories/academicRuleRepository.js';
import { AcademicRulesEngine, RegistrationIssueCode } from '../engines/rulesEngine.js';
import { AcademicTransactionService } from './academicTransactionService.js';
import { addTableSheet, cairoDateTime, fileStamp, newWorkbook, tintCell, toBuffer } from './excel.js';
import type {
  Course,
  CourseOffering,
  EnrollmentCheck,
  RegistrationOverview,
  RegistrationOverviewRow,
  RegistrationRequest,
  RegistrationStage,
  RosterStudent,
  SectionRoster,
  SectionSummary,
  Student,
  UserRole,
} from '../../src/types/index.js';

export interface CenterCaller {
  id: string;
  nameAr: string;
  nameEn: string;
  role: UserRole;
  advisorId?: string;
  instructorId?: string;
  studentId?: string;
  email?: string;
}

export class RegistrationError extends Error {
  constructor(public status: number, public messageAr: string, public messageEn: string, public extra: Record<string, unknown> = {}) {
    super(messageEn);
  }
}

/** Who may see the registration follow-up pages and lists (read-only for the last two). */
const VIEW_ROLES: UserRole[] = ['ADMIN', 'ACADEMIC_ADVISOR', 'PROCESS_OFFICER', 'DEPARTMENT_HEAD'];

export const STAGE_AR: Record<RegistrationStage, string> = {
  NOT_STARTED: 'لم يسجّل بعد',
  DRAFT: 'يختار مقرراته (مسودة)',
  PENDING: 'بانتظار اعتماد المرشد',
  CHANGES_REQUESTED: 'أُعيد للتعديل',
  REGISTERED: 'مسجّل',
};
export const STAGE_EN: Record<RegistrationStage, string> = {
  NOT_STARTED: 'Not registered yet',
  DRAFT: 'Choosing courses (draft)',
  PENDING: 'Waiting for the advisor',
  CHANGES_REQUESTED: 'Sent back for changes',
  REGISTERED: 'Registered',
};
const STAGE_ORDER: RegistrationStage[] = ['NOT_STARTED', 'CHANGES_REQUESTED', 'PENDING', 'DRAFT', 'REGISTERED'];
const STAGE_FILL: Record<RegistrationStage, string> = {
  NOT_STARTED: 'FFFDEDEB',
  DRAFT: 'FFF0F1EF',
  PENDING: 'FFFFF3D6',
  CHANGES_REQUESTED: 'FFFFE7D1',
  REGISTERED: 'FFE8F3EC',
};

/** The automatic first-term registration signs its records with this name. */
export const AUTO_REGISTRATION_NAME = 'التسجيل التلقائي (الفصل الأول حسب اللائحة)';
const SYSTEM_CALLER: CenterCaller = { id: 'system', nameAr: AUTO_REGISTRATION_NAME, nameEn: 'Automatic registration (first term, per the bylaw)', role: 'ADMIN' };

const plainName = (raw?: string) => (raw || '').split('(')[0].trim() || raw || '';
/** Being studied now (no final grade yet). */
const isCurrent = (r: { status: string }) => r.status === 'IN_PROGRESS' || r.status === 'ENROLLED';
/** Registered in this section this term, graded or not (sections are per term). */
const inSection = (r: { status: string; offeringId?: string | null }, offeringId: string) => r.offeringId === offeringId && r.status !== 'WITHDRAWN';
const roleLabelAr = (role: UserRole) => (role === 'ADMIN' ? 'مدير النظام' : role === 'ACADEMIC_ADVISOR' ? 'المرشد' : 'الموظف');

/** True when the two sections meet at overlapping times on a shared day. */
export const sectionsClash = (a: CourseOffering, b: CourseOffering) =>
  a.id !== b.id &&
  (a.days || []).some(d => (b.days || []).includes(d)) &&
  !!a.startTime && !!a.endTime && !!b.startTime && !!b.endTime &&
  a.startTime < b.endTime && b.startTime < a.endTime;

/**
 * One section per course with open seats, nothing clashing with the other picks
 * or the sections already taken (courses with fewest sections first, emptier
 * sections first); when no clash-free set exists, the emptiest section of each.
 */
export function pickSections(codes: string[], offerings: CourseOffering[], alreadyTaken: CourseOffering[]) {
  const optionsOf = (code: string) =>
    offerings
      .filter(o => o.courseCode === code && o.enrolledCount < o.capacity)
      .sort((a, b) => a.enrolledCount / a.capacity - b.enrolledCount / b.capacity);
  const missing = codes.filter(code => optionsOf(code).length === 0);
  const order = codes.filter(code => !missing.includes(code)).sort((a, b) => optionsOf(a).length - optionsOf(b).length);
  const search = (i: number, chosen: CourseOffering[]): CourseOffering[] | null => {
    if (i === order.length) return chosen;
    for (const o of optionsOf(order[i])) {
      if ([...alreadyTaken, ...chosen].some(p => sectionsClash(p, o))) continue;
      const found = search(i + 1, [...chosen, o]);
      if (found) return found;
    }
    return null;
  };
  const picked = search(0, []) || order.map(code => optionsOf(code)[0]);
  return { picked, missing };
}

/** Where the student is with this term's registration. */
export function stageOf(student: Student, request: RegistrationRequest | null, registeredThisTerm = student.records.some(isCurrent)): RegistrationStage {
  if (request?.status === 'PENDING') return 'PENDING';
  if (registeredThisTerm) return 'REGISTERED';
  if (request?.status === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED';
  if (request?.status === 'DRAFT' && request.offeringIds.length > 0) return 'DRAFT';
  return 'NOT_STARTED';
}

export class RegistrationCenterService {
  private static inFlight = new Set<string>();

  // ---------------------------------------------------------------- access

  static assertViewer(caller: CenterCaller | null): asserts caller is CenterCaller {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    if (!VIEW_ROLES.includes(caller.role)) {
      throw new RegistrationError(403, 'هذه الصفحة للمرشد ومدير النظام وشؤون الطلاب ورئيس القسم.', 'This page is for advisors, administrators, student affairs and the department head.');
    }
  }

  /** The advisor for their own students; the administrator for anyone. */
  static assertCanAct(caller: CenterCaller | null, student: Student): asserts caller is CenterCaller {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    if (caller.role === 'ADMIN') return;
    if (caller.role === 'ACADEMIC_ADVISOR') {
      if (caller.advisorId && caller.advisorId === student.advisorId) return;
      throw new RegistrationError(403, 'هذا الطالب ليس من طلابك؛ التسجيل له لمرشده أو لمدير النظام.', 'This student is not yours; their advisor or the administrator can register for them.');
    }
    throw new RegistrationError(403, 'التسجيل نيابة عن الطالب للمرشد الأكاديمي ومدير النظام فقط.', 'Only the academic advisor or the administrator can register for a student.');
  }

  static async requireStudent(key: string): Promise<Student> {
    const student = await StudentRepository.findExact(key);
    if (!student) throw new RegistrationError(404, 'الطالب غير موجود.', 'Student not found.');
    return student;
  }

  static async currentSemester(): Promise<{ id: string; nameAr: string; nameEn: string }> {
    try {
      const s = await prisma.semester.findFirst({ where: { isCurrent: true } });
      if (s) return { id: s.id, nameAr: s.nameAr, nameEn: s.nameEn };
    } catch {
      /* in-memory data */
    }
    return { id: 'sem_fall_2026', nameAr: 'خريف 2026 / 2027', nameEn: 'Fall 2026 / 2027' };
  }

  // ---------------------------------------------------------------- overview

  /** Every student the caller follows, with where they are with this term's registration. */
  static async overview(caller: CenterCaller | null): Promise<RegistrationOverview> {
    this.assertViewer(caller);
    const [all, courses, offerings, semester] = await Promise.all([
      StudentRepository.listAll(),
      CourseRepository.listAll(),
      OfferingRepository.listAll(),
      this.currentSemester(),
    ]);
    const students = caller.role === 'ACADEMIC_ADVISOR' ? all.filter(s => s.advisorId === caller.advisorId) : all;
    const requests = await RegistrationRequestRepository.forStudents(students.map(s => s.id));
    const latest = new Map<string, RegistrationRequest>();
    for (const r of requests) if (!latest.has(r.studentId)) latest.set(r.studentId, r);

    const credits = (code: string) => courses.find(c => c.code === code)?.credits ?? 3;
    const termSections = new Set(offerings.filter(o => !o.semesterId || o.semesterId === semester.id).map(o => o.id));
    const rows: RegistrationOverviewRow[] = students.map(s => {
      const request = latest.get(s.id) || null;
      const current = s.records.filter(r => isCurrent(r) || (!!r.offeringId && termSections.has(r.offeringId) && (r.status as string) !== 'WITHDRAWN'));
      const requested = (request?.offeringIds || [])
        .map(id => offerings.find(o => o.id === id)?.courseCode)
        .filter((c): c is string => !!c);
      const by = [...new Set(current.map(r => r.registeredByName).filter(Boolean))].join('، ');
      return {
        studentId: s.id,
        studentCode: s.studentCode,
        nameAr: plainName(s.nameAr),
        nameEn: plainName(s.nameEn),
        level: s.level,
        track: s.track,
        cumulativeGpa: s.cumulativeGpa,
        isNewStudent: AcademicRulesEngine.isNewStudent(s),
        admissionType: s.admissionType === 'TRANSFER' ? 'TRANSFER' : 'REGULAR',
        advisorId: s.advisorId,
        advisorName: plainName(s.advisorName),
        stage: stageOf(s, request, current.length > 0),
        registeredCourses: current.map(r => r.courseCode),
        registeredCredits: current.reduce((sum, r) => sum + (r.credits || credits(r.courseCode)), 0),
        requestedCourses: requested,
        requestedCredits: requested.reduce((sum, c) => sum + credits(c), 0),
        maxAllowedCredits: AcademicRulesEngine.getMaxCredits(s),
        registeredBy: by || undefined,
        advisorNotes: request?.advisorNotes,
        submittedAt: request?.submittedAt,
        updatedAt: request?.updatedAt || current.map(r => r.registeredAt).filter(Boolean).sort().pop(),
        requestId: request?.id,
        dismissal: AcademicRulesEngine.dismissalReached(s) && !AcademicRulesEngine.finalChanceEligible(s),
      };
    });
    const counts = { NOT_STARTED: 0, DRAFT: 0, PENDING: 0, CHANGES_REQUESTED: 0, REGISTERED: 0 } as Record<RegistrationStage, number>;
    for (const r of rows) counts[r.stage] += 1;
    return { semesterNameAr: semester.nameAr, semesterNameEn: semester.nameEn, counts, rows };
  }

  // ---------------------------------------------------------------- sections and rosters

  private static summaryOf(o: CourseOffering, courses: Course[], students: Student[]): SectionSummary {
    const course = courses.find(c => c.code === o.courseCode);
    return {
      offering: o,
      courseNameAr: course?.nameAr || o.courseCode,
      courseNameEn: course?.nameEn || o.courseCode,
      credits: course?.credits ?? 3,
      level: course?.level ?? 1,
      registeredCount: students.filter(s => s.records.some(r => inSection(r, o.id))).length,
    };
  }

  /** May the caller see this section's list? Staff yes; an instructor or TA for their own sections. */
  private static canSeeSection(caller: CenterCaller, o: CourseOffering): boolean {
    if (VIEW_ROLES.includes(caller.role)) return true;
    if (caller.role === 'INSTRUCTOR' || caller.role === 'TEACHING_ASSISTANT') {
      return !!caller.instructorId && (o.instructorId === caller.instructorId || o.assistantId === caller.instructorId);
    }
    return false;
  }

  static async sections(caller: CenterCaller | null): Promise<SectionSummary[]> {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    const [offerings, courses, students] = await Promise.all([OfferingRepository.listAll(), CourseRepository.listAll(), StudentRepository.listAll()]);
    const visible = offerings.filter(o => this.canSeeSection(caller, o));
    if (visible.length === 0 && !VIEW_ROLES.includes(caller.role)) {
      throw new RegistrationError(403, 'لا تملك صلاحية الاطلاع على كشوف الشعب.', 'You cannot view section lists.');
    }
    return visible
      .map(o => this.summaryOf(o, courses, students))
      .sort((a, b) => a.offering.courseCode.localeCompare(b.offering.courseCode) || String(a.offering.sectionCode).localeCompare(String(b.offering.sectionCode)));
  }

  private static rosterRow(s: Student, offering: CourseOffering | undefined, record: Student['records'][number]): RosterStudent {
    return {
      studentId: s.id,
      studentCode: s.studentCode,
      nameAr: plainName(s.nameAr),
      nameEn: plainName(s.nameEn),
      email: s.email,
      level: s.level,
      track: s.track,
      cumulativeGpa: s.cumulativeGpa,
      isNewStudent: AcademicRulesEngine.isNewStudent(s),
      advisorName: plainName(s.advisorName),
      attempt: record.attempt || 1,
      attendancePercentage: record.attendancePercentage ?? 100,
      registeredAt: record.registeredAt,
      registeredBy: record.registeredByName,
      offeringId: offering?.id,
      sectionCode: offering?.sectionCode,
    };
  }

  /** The students registered in one section this term, by name. */
  static async sectionRoster(caller: CenterCaller | null, offeringId: string): Promise<SectionRoster> {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    const [offerings, courses, students] = await Promise.all([OfferingRepository.listAll(), CourseRepository.listAll(), StudentRepository.listAll()]);
    const offering = offerings.find(o => o.id === offeringId);
    if (!offering) throw new RegistrationError(404, 'الشعبة غير موجودة.', 'Section not found.');
    if (!this.canSeeSection(caller, offering)) throw new RegistrationError(403, 'لا تملك صلاحية الاطلاع على كشف هذه الشعبة.', 'You cannot view this section’s list.');
    const rows = students
      .map(s => ({ s, record: s.records.find(r => inSection(r, offering.id)) }))
      .filter((x): x is { s: Student; record: Student['records'][number] } => !!x.record)
      .map(({ s, record }) => this.rosterRow(s, offering, record))
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    return { section: { ...this.summaryOf(offering, courses, students), registeredCount: rows.length }, students: rows };
  }

  /** Every section of a course, with their students. */
  static async courseRoster(caller: CenterCaller | null, courseCode: string): Promise<{ course: Course; sections: SectionRoster[] }> {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    const courses = await CourseRepository.listAll();
    const course = courses.find(c => c.code === courseCode);
    if (!course) throw new RegistrationError(404, 'المقرر غير موجود.', 'Course not found.');
    const offerings = (await OfferingRepository.listAll()).filter(o => o.courseCode === courseCode && this.canSeeSection(caller, o));
    if (offerings.length === 0) throw new RegistrationError(404, 'لا توجد شعب لهذا المقرر يمكنك الاطلاع عليها.', 'No sections of this course you can view.');
    const sections: SectionRoster[] = [];
    for (const o of offerings) sections.push(await this.sectionRoster(caller, o.id));
    return { course, sections };
  }

  // ---------------------------------------------------------------- Excel

  static async overviewWorkbook(
    caller: CenterCaller | null,
    filters: { stage?: string; level?: string; q?: string; advisorId?: string }
  ): Promise<{ buffer: Buffer; filename: string }> {
    const overview = await this.overview(caller);
    const q = (filters.q || '').trim().toLowerCase();
    const stages = (filters.stage || '').split(',').filter(Boolean) as RegistrationStage[];
    const rows = overview.rows
      .filter(r => stages.length === 0 || stages.includes(r.stage))
      .filter(r => !filters.level || String(r.level) === String(filters.level))
      .filter(r => !filters.advisorId || r.advisorId === filters.advisorId)
      .filter(r => !q || r.nameAr.toLowerCase().includes(q) || r.nameEn.toLowerCase().includes(q) || r.studentCode.toLowerCase().includes(q))
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.nameAr.localeCompare(b.nameAr, 'ar'));

    const wb = newWorkbook();
    const scope =
      caller!.role === 'ACADEMIC_ADVISOR' ? `طلاب المرشد: ${plainName(caller!.nameAr)}` : 'كل طلاب البرنامج';
    const filterText = [
      stages.length ? `الحالة: ${stages.map(s => STAGE_AR[s]).join('، ')}` : 'كل الحالات',
      filters.level ? `المستوى ${filters.level}` : '',
      q ? `بحث: «${filters.q}»` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const ws = addTableSheet(
      wb,
      'حالة التسجيل',
      [
        `متابعة تسجيل الطلاب — ${overview.semesterNameAr}`,
        `${scope} · ${filterText}`,
        `عدد الطلاب في الكشف ${rows.length} · ${STAGE_ORDER.map(s => `${STAGE_AR[s]} ${rows.filter(r => r.stage === s).length}`).join(' · ')} · حتى ${cairoDateTime(new Date())}`,
      ],
      [
        { header: 'م', width: 6 },
        { header: 'الرقم الجامعي', width: 14 },
        { header: 'اسم الطالب', width: 30, align: 'right' },
        { header: 'المستوى', width: 9 },
        { header: 'المعدل', width: 9 },
        { header: 'حالة التسجيل', width: 22 },
        { header: 'المقررات المسجلة', width: 28, align: 'right' },
        { header: 'الساعات المسجلة', width: 11 },
        { header: 'المقررات في الطلب', width: 28, align: 'right' },
        { header: 'الحد الأقصى للساعات', width: 12 },
        { header: 'المرشد', width: 24, align: 'right' },
        { header: 'سُجّل بواسطة', width: 26, align: 'right' },
        { header: 'آخر تحديث', width: 17 },
        { header: 'ملاحظات المرشد', width: 34, align: 'right' },
      ],
      rows.map((r, i) => [
        i + 1,
        r.studentCode,
        `${r.nameAr}${r.admissionType === 'TRANSFER' ? ' (محوّل)' : ''}`,
        r.level,
        r.isNewStudent ? '—' : r.cumulativeGpa.toFixed(2),
        `${STAGE_AR[r.stage]}${r.dismissal ? ' — بلغ حد الفصل' : ''}`,
        r.registeredCourses.join('، ') || '—',
        r.registeredCredits,
        r.stage === 'REGISTERED' && r.requestedCourses.join() === r.registeredCourses.join() ? '—' : r.requestedCourses.join('، ') || '—',
        r.maxAllowedCredits,
        r.advisorName || '—',
        r.registeredBy || (r.stage === 'REGISTERED' ? 'الطالب (باعتماد المرشد)' : '—'),
        cairoDateTime(r.updatedAt),
        r.advisorNotes || '',
      ])
    );
    rows.forEach((r, i) => tintCell(ws, i, 6, STAGE_FILL[r.stage], r.stage === 'NOT_STARTED' || r.dismissal ? 'FFB53022' : undefined));
    const stageName = stages.length === 1 ? { NOT_STARTED: 'not-registered', DRAFT: 'draft', PENDING: 'pending', CHANGES_REQUESTED: 'returned', REGISTERED: 'registered' }[stages[0]] : 'all';
    return { buffer: await toBuffer(wb), filename: `registration_${stageName}_${fileStamp()}.xlsx` };
  }

  private static rosterColumns(withSection: boolean) {
    return [
      { header: 'م', width: 6 },
      ...(withSection ? [{ header: 'الشعبة', width: 16 }] : []),
      { header: 'الرقم الجامعي', width: 14 },
      { header: 'اسم الطالب', width: 30, align: 'right' as const },
      { header: 'البريد الجامعي', width: 28 },
      { header: 'المستوى', width: 9 },
      { header: 'المعدل', width: 9 },
      { header: 'المرشد', width: 24, align: 'right' as const },
      { header: 'المحاولة', width: 9 },
      { header: 'نسبة الحضور', width: 11 },
      { header: 'تاريخ التسجيل', width: 17 },
      { header: 'سُجّل بواسطة', width: 26, align: 'right' as const },
    ];
  }

  private static rosterValues(st: RosterStudent, i: number, withSection: boolean) {
    return [
      i + 1,
      ...(withSection ? [plainName(st.sectionCode)] : []),
      st.studentCode,
      st.nameAr,
      st.email,
      st.level,
      st.isNewStudent ? '—' : st.cumulativeGpa.toFixed(2),
      st.advisorName || '—',
      st.attempt > 1 ? `إعادة (${st.attempt})` : 'أولى',
      `${Math.round(st.attendancePercentage)}%`,
      cairoDateTime(st.registeredAt),
      st.registeredBy || 'الطالب (باعتماد المرشد)',
    ];
  }

  static async sectionWorkbook(caller: CenterCaller | null, offeringId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { section, students } = await this.sectionRoster(caller, offeringId);
    const o = section.offering;
    const wb = newWorkbook();
    addTableSheet(
      wb,
      'كشف الطلاب',
      [
        `كشف الطلاب المسجلين: ${o.courseCode} ${section.courseNameAr} — ${plainName(o.sectionCode)}`,
        `أستاذ المادة: ${plainName(o.instructorName)}${o.assistantName ? ` · المعيد: ${plainName(o.assistantName)}` : ''} · ${o.lectureDayTimeAr || ''} · ${o.hall || ''}`,
        `المسجلون ${students.length} من سعة ${o.capacity} · ${section.credits} ساعات معتمدة · حتى ${cairoDateTime(new Date())}`,
      ],
      this.rosterColumns(false),
      students.map((st, i) => this.rosterValues(st, i, false))
    );
    return { buffer: await toBuffer(wb), filename: `students_${o.courseCode.replace(/\s+/g, '')}_${(o.sectionCode || o.id).replace(/[^\w-]+/g, '').slice(-6) || 'section'}_${fileStamp()}.xlsx` };
  }

  static async courseWorkbook(caller: CenterCaller | null, courseCode: string): Promise<{ buffer: Buffer; filename: string }> {
    const { course, sections } = await this.courseRoster(caller, courseCode);
    const wb = newWorkbook();
    const all = sections.flatMap(sec => sec.students);
    addTableSheet(
      wb,
      'كل الشعب',
      [
        `كشف الطلاب المسجلين: ${course.code} ${course.nameAr} (كل الشعب)`,
        sections.map(sec => `${plainName(sec.section.offering.sectionCode)}: ${sec.students.length}/${sec.section.offering.capacity}`).join(' · '),
        `إجمالي المسجلين ${all.length} · ${course.credits} ساعات معتمدة · حتى ${cairoDateTime(new Date())}`,
      ],
      this.rosterColumns(true),
      all.map((st, i) => this.rosterValues(st, i, true))
    );
    for (const sec of sections) {
      addTableSheet(
        wb,
        plainName(sec.section.offering.sectionCode) || sec.section.offering.id,
        [
          `${course.code} ${course.nameAr} — ${plainName(sec.section.offering.sectionCode)}`,
          `أستاذ المادة: ${plainName(sec.section.offering.instructorName)} · ${sec.section.offering.lectureDayTimeAr || ''}`,
          `المسجلون ${sec.students.length} من سعة ${sec.section.offering.capacity}`,
        ],
        this.rosterColumns(false),
        sec.students.map((st, i) => this.rosterValues(st, i, false))
      );
    }
    return { buffer: await toBuffer(wb), filename: `students_${course.code.replace(/\s+/g, '')}_all-sections_${fileStamp()}.xlsx` };
  }

  // ---------------------------------------------------------------- registering for a student

  /** Check sections an advisor or administrator wants to register for a student. */
  static async check(
    caller: CenterCaller | null,
    studentKey: string,
    offeringIds: string[]
  ): Promise<EnrollmentCheck & { currentCredits: number; student: Student; selected: CourseOffering[] }> {
    const student = await this.requireStudent(studentKey);
    this.assertCanAct(caller, student);
    const [offerings, courses] = await Promise.all([OfferingRepository.listAll(), CourseRepository.listAll()]);
    const courseMap = new Map(courses.map(c => [c.code, c]));
    const issues: EnrollmentCheck['issues'] = [];
    const add = (code: RegistrationIssueCode | 'DUPLICATE_COURSE' | 'NO_SECTIONS', ar: string, en: string) =>
      issues.push({ code, ar, en, hard: !AcademicRulesEngine.WAIVABLE_ISSUES.includes(code as RegistrationIssueCode) });

    const ids = [...new Set(offeringIds.map(String))];
    const selected = ids.map(id => offerings.find(o => o.id === id)).filter((o): o is CourseOffering => !!o);
    if (ids.length === 0) add('NO_SECTIONS', 'اختر شعبة واحدة على الأقل.', 'Choose at least one section.');
    for (const id of ids) if (!offerings.some(o => o.id === id)) add('NOT_FOUND', `الشعبة ${id} غير موجودة.`, `Section ${id} does not exist.`);
    const codes = selected.map(o => o.courseCode);
    for (const code of new Set(codes.filter((c, i) => codes.indexOf(c) !== i))) {
      add('DUPLICATE_COURSE', `اخترت أكثر من شعبة لمقرر ${code}؛ اختر شعبة واحدة.`, `More than one section of ${code} was chosen; pick one.`);
    }

    const uniqueCodes = [...new Set(codes)];
    const offeringByCode = new Map(selected.map(o => [o.courseCode, o]));
    const validation = AcademicRulesEngine.validateRegistration(student, uniqueCodes, courseMap, offeringByCode, false);
    validation.errorsAr.forEach((ar, i) => {
      const code = validation.issueCodes?.[i] || 'NOT_FOUND';
      if (code === 'CREDIT_LIMIT') return; // checked below with the courses already registered
      add(code, ar, validation.errorsEn[i] || ar);
    });

    // The load includes what the student is already registered in this term.
    const current = student.records.filter(isCurrent);
    const currentCredits = current.reduce((sum, r) => sum + (r.credits || 3), 0);
    const requestedCredits = uniqueCodes.reduce((sum, c) => sum + (courseMap.get(c)?.credits ?? 3), 0);
    const maxAllowedCredits = AcademicRulesEngine.getMaxCredits(student);
    if (currentCredits + requestedCredits > maxAllowedCredits) {
      add(
        'CREDIT_LIMIT',
        `مجموع الساعات (${currentCredits} مسجلة + ${requestedCredits} جديدة = ${currentCredits + requestedCredits}) يتجاوز الحد الأقصى للطالب (${maxAllowedCredits} ساعة).`,
        `The load (${currentCredits} registered + ${requestedCredits} new = ${currentCredits + requestedCredits}) is over the student's ceiling of ${maxAllowedCredits} credit hours.`
      );
    }

    // Timetable clashes among the new sections and with the ones the student already sits in.
    const taken = current.map(r => offerings.find(o => o.id === r.offeringId)).filter((o): o is CourseOffering => !!o);
    const pool = [...taken, ...selected];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (j < taken.length) continue; // two sections already registered
        if (pool[i].courseCode === pool[j].courseCode) continue;
        if (sectionsClash(pool[i], pool[j])) {
          add(
            'TIME_CLASH',
            `تعارض في المواعيد بين ${pool[i].courseCode} (${pool[i].lectureDayTimeAr}) و${pool[j].courseCode} (${pool[j].lectureDayTimeAr}).`,
            `Timetable clash between ${pool[i].courseCode} (${pool[i].lectureDayTimeEn}) and ${pool[j].courseCode} (${pool[j].lectureDayTimeEn}).`
          );
        }
      }
    }

    if (AcademicRulesEngine.dismissalReached(student) && !AcademicRulesEngine.finalChanceEligible(student)) {
      add(
        'DISMISSED',
        `الطالب بلغ حد الفصل (${student.consecutiveWarnings} متتالية، ${student.warningCount} إجمالاً)؛ تسجيله يحتاج استثناءً من مدير النظام.`,
        `The student reached the dismissal limit (${student.consecutiveWarnings} consecutive, ${student.warningCount} in all); registering needs an administrator exception.`
      );
    }

    const valid = issues.length === 0;
    return {
      valid,
      canOverride: caller!.role === 'ADMIN' && !valid && issues.every(i => !i.hard),
      totalCredits: currentCredits + requestedCredits,
      maxAllowedCredits,
      issues,
      warningsAr: validation.warningsAr,
      warningsEn: validation.warningsEn,
      currentCredits,
      student,
      selected,
    };
  }

  /** Register sections for a student (advisor within the bylaw; administrator also as an exception). */
  static async enroll(
    caller: CenterCaller | null,
    studentKey: string,
    offeringIds: string[],
    options: { override?: boolean; reason?: string; note?: string } = {}
  ) {
    const result = await this.check(caller, studentKey, offeringIds);
    const { student, selected } = result;
    const reason = (options.reason || '').trim();
    if (!result.valid) {
      if (!options.override) {
        throw new RegistrationError(
          422,
          caller!.role === 'ADMIN'
            ? 'لا يمكن التسجيل لوجود مخالفات للائحة. يمكنك تسجيله كاستثناء مع كتابة السبب.'
            : 'لا يمكن التسجيل لوجود مخالفات للائحة؛ الاستثناء منها لمدير النظام.',
          caller!.role === 'ADMIN'
            ? 'The bylaw check failed. You can register it as an exception with a reason.'
            : 'The bylaw check failed; only the administrator can make an exception.',
          { check: this.publicCheck(result) }
        );
      }
      if (caller!.role !== 'ADMIN') {
        throw new RegistrationError(403, 'الاستثناء من اللائحة لمدير النظام فقط.', 'Only the administrator can make an exception to the bylaw.', { check: this.publicCheck(result) });
      }
      if (!result.canOverride) {
        throw new RegistrationError(422, 'بعض المشكلات لا يغطيها الاستثناء (مثل مقرر مسجل أو ناجح فيه بالفعل).', 'Some problems cannot be covered by an exception (e.g. a course already registered or passed).', { check: this.publicCheck(result) });
      }
      if (reason.length < 3) {
        throw new RegistrationError(400, 'اكتب سبب الاستثناء؛ يُحفظ في سجل العمليات.', 'Write the reason for the exception; it is kept in the audit log.', { check: this.publicCheck(result) });
      }
    }

    const override = !result.valid;
    const byName = `${roleLabelAr(caller!.role)}: ${plainName(caller!.nameAr)}`;
    const extraIssues = override
      ? result.issues
          .filter(i => i.code === 'TIME_CLASH' || i.code === 'DISMISSED' || i.code === 'CREDIT_LIMIT')
          .map(i => ({ code: i.code as RegistrationIssueCode, ar: i.ar, en: i.en }))
      : [];
    const tx = await AcademicTransactionService.registerCourses(
      student.id,
      [...new Set(selected.map(o => o.courseCode))],
      false,
      caller!,
      selected.map(o => o.id),
      {
        override,
        overrideReason: reason,
        extraIssues,
        registeredByName: byName,
        note: options.note,
        auditAction: override ? 'REGISTER_COURSES_EXCEPTION' : 'REGISTER_COURSES_ON_BEHALF',
      }
    );
    if (!tx.success) {
      throw new RegistrationError(422, 'تعذّر التسجيل: تغيّرت بيانات الشعب أثناء العملية. راجع الفحص وحاول مرة أخرى.', 'Registration failed: the sections changed meanwhile. Check again and retry.', {
        validation: tx.validation,
      });
    }
    const updated = tx.updatedStudent || (await this.requireStudent(student.id));
    const currentIds = updated.records.filter(isCurrent).map(r => r.offeringId).filter((id): id is string => !!id);
    const codes = selected.map(o => o.courseCode);
    const actorAr = caller!.role === 'ADMIN' ? 'مدير النظام' : `مرشدك ${plainName(caller!.nameAr)}`;
    const actorEn = caller!.role === 'ADMIN' ? 'The administrator' : `Your advisor ${plainName(caller!.nameEn)}`;
    await RegistrationRequestRepository.save(student.id, {
      status: 'APPROVED',
      offeringIds: currentIds,
      decidedByName: plainName(caller!.nameAr),
      decidedAt: new Date().toISOString(),
      advisorNotes: override ? `سُجّلت كاستثناء من مدير النظام: ${reason}` : `سجّل ${roleLabelAr(caller!.role)} المقررات نيابة عن الطالب.`,
    });
    await NotificationRepository.create({
      recipientId: student.id,
      type: 'REGISTRATION',
      titleAr: 'سُجّلت لك مقررات هذا الفصل',
      titleEn: 'Courses were registered for you',
      messageAr: `${actorAr} سجّل لك: ${codes.join('، ')}.${override ? ` (استثناء من اللائحة: ${reason})` : ''} تجد جدولك في صفحة «التسجيل».`,
      messageEn: `${actorEn} registered you in ${codes.join(', ')}.${override ? ` (Bylaw exception: ${reason})` : ''} Your timetable is on the Registration page.`,
    }).catch(() => undefined);
    if (caller!.role === 'ADMIN' && student.advisorId) {
      await NotificationRepository.create({
        recipientId: student.advisorId,
        type: 'REGISTRATION',
        titleAr: `تسجيل من مدير النظام لطالبك ${plainName(student.nameAr)}`,
        titleEn: `The administrator registered ${plainName(student.nameEn)}`,
        messageAr: `سجّل مدير النظام للطالب ${plainName(student.nameAr)} (${student.studentCode}) المقررات: ${codes.join('، ')}.${override ? ` استثناء: ${reason}` : ''}`,
        messageEn: `The administrator registered ${plainName(student.nameEn)} (${student.studentCode}) in ${codes.join(', ')}.${override ? ` Exception: ${reason}` : ''}`,
      }).catch(() => undefined);
    }
    return { success: true, registered: codes, waived: tx.waived || [], exception: override, student: updated };
  }

  /** Remove a course registered this term (before any marks). */
  static async drop(caller: CenterCaller | null, studentKey: string, offeringOrCourse: string, reason = '') {
    const student = await this.requireStudent(studentKey);
    this.assertCanAct(caller, student);
    const result = await AcademicTransactionService.dropCourse(student.id, offeringOrCourse, caller!, reason);
    if (!result.success) throw new RegistrationError(409, result.messageAr, result.messageEn);
    const updated = result.updatedStudent!;
    const request = await RegistrationRequestRepository.current(student.id);
    if (request && request.status !== 'PENDING') {
      await RegistrationRequestRepository.save(student.id, {
        offeringIds: updated.records.filter(isCurrent).map(r => r.offeringId).filter((id): id is string => !!id),
      });
    }
    await NotificationRepository.create({
      recipientId: student.id,
      type: 'REGISTRATION',
      titleAr: `حُذف ${result.courseCode} من تسجيلك`,
      titleEn: `${result.courseCode} was removed from your registration`,
      messageAr: `${caller!.role === 'ADMIN' ? 'مدير النظام' : 'مرشدك'} حذف ${result.courseCode} من مقررات هذا الفصل${reason ? `: ${reason}` : ''}.`,
      messageEn: `${caller!.role === 'ADMIN' ? 'The administrator' : 'Your advisor'} removed ${result.courseCode} from this term's courses${reason ? `: ${reason}` : ''}.`,
    }).catch(() => undefined);
    return { success: true, removed: result.courseCode, student: updated };
  }

  static publicCheck(c: EnrollmentCheck & Record<string, any>): EnrollmentCheck & { currentCredits: number } {
    return {
      valid: c.valid,
      canOverride: c.canOverride,
      totalCredits: c.totalCredits,
      maxAllowedCredits: c.maxAllowedCredits,
      issues: c.issues,
      warningsAr: c.warningsAr,
      warningsEn: c.warningsEn,
      currentCredits: c.currentCredits,
    };
  }

  // ---------------------------------------------------------------- first-term students

  /** The bylaw's courses for the first term of level 1. */
  static firstTermCourses(courses: Course[]): Course[] {
    return courses.filter(c => Number(c.level) === 1 && Number(c.semester) === 1 && c.isMandatory && (!c.track || c.track === 'General'));
  }

  /**
   * Register a first-term student (level 1, nothing graded yet) in the bylaw's
   * first-term courses, one open section each without clashes. Does nothing when
   * the student is not a freshman or already has courses this term.
   */
  static async autoRegisterFreshman(studentKey: string): Promise<{ status: 'REGISTERED' | 'SKIPPED' | 'FAILED'; registered: string[]; missing: string[]; reason?: string }> {
    const student = await StudentRepository.findExact(studentKey);
    if (!student) return { status: 'SKIPPED', registered: [], missing: [], reason: 'NOT_FOUND' };
    if (!AcademicRulesEngine.isFreshman(student)) return { status: 'SKIPPED', registered: [], missing: [], reason: 'NOT_FRESHMAN' };
    if (student.records.some(isCurrent)) return { status: 'SKIPPED', registered: [], missing: [], reason: 'ALREADY_REGISTERED' };
    if (this.inFlight.has(student.id)) return { status: 'SKIPPED', registered: [], missing: [], reason: 'IN_PROGRESS' };
    this.inFlight.add(student.id);
    try {
      const [courses, offerings] = await Promise.all([CourseRepository.listAll(), OfferingRepository.listAll()]);
      const plan = this.firstTermCourses(courses).map(c => c.code);
      if (plan.length === 0) return { status: 'SKIPPED', registered: [], missing: [], reason: 'NO_FIRST_TERM_COURSES' };
      const { picked, missing } = pickSections(plan, offerings, []);
      if (picked.length === 0) {
        await this.notifyIncompleteFreshman(student, [], missing);
        return { status: 'FAILED', registered: [], missing, reason: 'NO_OPEN_SECTIONS' };
      }
      const tx = await AcademicTransactionService.registerCourses(
        student.id,
        picked.map(o => o.courseCode),
        false,
        SYSTEM_CALLER,
        picked.map(o => o.id),
        {
          registeredByName: AUTO_REGISTRATION_NAME,
          note: 'مقررات الفصل الأول بالمستوى الأول حسب اللائحة',
          auditAction: 'AUTO_REGISTER_FIRST_TERM',
        }
      );
      if (!tx.success) {
        await this.notifyIncompleteFreshman(student, [], plan);
        return { status: 'FAILED', registered: [], missing: plan, reason: (tx.validation.errorsEn || []).join(' | ') };
      }
      const codes = picked.map(o => o.courseCode);
      await RegistrationRequestRepository.save(student.id, {
        status: 'APPROVED',
        offeringIds: picked.map(o => o.id),
        decidedByName: AUTO_REGISTRATION_NAME,
        decidedAt: new Date().toISOString(),
        advisorNotes: 'سُجّلت مقررات الفصل الأول تلقائياً حسب اللائحة؛ لا يحتاج الطالب المستجد إلى اختيارها بنفسه.',
      });
      await NotificationRepository.createOnce(`auto_registration_${student.id}`, {
        recipientId: student.id,
        type: 'REGISTRATION',
        titleAr: 'سُجّلت مقررات فصلك الأول تلقائياً',
        titleEn: 'Your first-term courses were registered for you',
        messageAr: `حسب اللائحة، مقررات الفصل الأول بالمستوى الأول تُسجَّل للطالب المستجد تلقائياً: ${codes.join('، ')}. تجد مواعيدها في صفحة «التسجيل»، ولأي تعديل راجع مرشدك.`,
        messageEn: `Per the bylaw, level-1 first-term courses are registered for new students automatically: ${codes.join(', ')}. The timetable is on the Registration page; ask your advisor for any change.`,
      }).catch(() => undefined);
      if (missing.length) await this.notifyIncompleteFreshman(student, codes, missing);
      return { status: 'REGISTERED', registered: codes, missing };
    } finally {
      this.inFlight.delete(student.id);
    }
  }

  private static async notifyIncompleteFreshman(student: Student, registered: string[], missing: string[]) {
    if (!student.advisorId) return;
    await NotificationRepository.createOnce(`auto_registration_incomplete_${student.id}`, {
      recipientId: student.advisorId,
      type: 'REGISTRATION',
      titleAr: `أكمل تسجيل الطالب المستجد ${plainName(student.nameAr)}`,
      titleEn: `Complete ${plainName(student.nameEn)}'s first-term registration`,
      messageAr: `لم تُسجَّل تلقائياً المقررات (${missing.join('، ')}) للطالب ${plainName(student.nameAr)} (${student.studentCode}) لعدم وجود شعبة متاحة${registered.length ? `، وسُجّلت (${registered.join('، ')})` : ''}. سجّلها له من صفحة «متابعة التسجيل».`,
      messageEn: `${missing.join(', ')} could not be registered automatically for ${plainName(student.nameEn)} (${student.studentCode}) — no open section${registered.length ? `; ${registered.join(', ')} were registered` : ''}. Register them on the Registration follow-up page.`,
    }).catch(() => undefined);
  }

  /** Every first-term student who has no courses yet. */
  static async autoRegisterAllFreshmen(): Promise<{ registered: number; failed: number; students: { studentCode: string; registered: string[]; missing: string[] }[] }> {
    const students = await StudentRepository.listAll();
    const out = { registered: 0, failed: 0, students: [] as { studentCode: string; registered: string[]; missing: string[] }[] };
    for (const s of students) {
      if (!AcademicRulesEngine.isFreshman(s) || s.records.some(isCurrent)) continue;
      const r = await this.autoRegisterFreshman(s.id);
      if (r.status === 'REGISTERED') out.registered += 1;
      if (r.status === 'FAILED') out.failed += 1;
      if (r.status !== 'SKIPPED') out.students.push({ studentCode: s.studentCode, registered: r.registered, missing: r.missing });
    }
    return out;
  }

  // ---------------------------------------------------------------- upkeep on start

  /** A section's seat count is the number of students really registered in it. */
  static async reconcileSeatCounts(): Promise<number> {
    const [groups, offerings] = await Promise.all([
      prisma.courseRecord.groupBy({ by: ['offeringId'], where: { status: { not: 'WITHDRAWN' }, offeringId: { not: null } }, _count: { _all: true } }),
      prisma.courseOffering.findMany({ select: { id: true, enrolledCount: true } }),
    ]);
    let fixed = 0;
    for (const o of offerings) {
      const actual = groups.find(g => g.offeringId === o.id)?._count._all ?? 0;
      if (actual !== o.enrolledCount) {
        await prisma.courseOffering.update({ where: { id: o.id }, data: { enrolledCount: actual } });
        fixed += 1;
      }
    }
    return fixed;
  }

  /** Coursework entered on the old 50-mark scale (no final yet) moves to the 40-mark scale. */
  static async normalizeLegacyCoursework(): Promise<number> {
    const max = AcademicRulesEngine.COURSEWORK_MAX_MARK;
    const rows = await prisma.courseRecord.findMany({ where: { courseworkMark: { gt: max }, finalMark: null }, select: { id: true, courseworkMark: true } });
    for (const r of rows) {
      const scaled = Math.min(max, Math.round(((r.courseworkMark || 0) * max) / 50));
      await prisma.courseRecord.update({ where: { id: r.id }, data: { courseworkMark: scaled } });
    }
    return rows.length;
  }

  /** Run once the database is ready (each start). */
  static async startupMaintenance(): Promise<void> {
    try {
      await AcademicRuleRepository.listAll(); // current bylaw values
      const marks = await this.normalizeLegacyCoursework();
      if (marks) console.log(`[Registration] Moved ${marks} coursework marks to the 40-mark scale.`);
      const auto = await this.autoRegisterAllFreshmen();
      if (auto.registered || auto.failed) console.log(`[Registration] First-term automatic registration: ${auto.registered} registered, ${auto.failed} need the advisor.`);
      const seats = await this.reconcileSeatCounts();
      if (seats) console.log(`[Registration] Corrected the seat count of ${seats} sections to their real registrations.`);
    } catch (err: any) {
      console.warn('[Registration] Start-up upkeep skipped:', err?.message || err);
    }
  }
}
