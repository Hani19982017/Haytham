import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { StudentRepository, STUDENT_INCLUDE } from '../repositories/studentRepository.js';
import { CourseRepository } from '../repositories/courseRepository.js';
import { NotificationRepository } from '../repositories/notificationRepository.js';
import { AcademicRuleRepository } from '../repositories/academicRuleRepository.js';
import { EquivalencyEngine } from '../engines/equivalencyEngine.js';
import { calculateGpa } from '../engines/gpaEngine.js';
import { RegistrationError, CenterCaller } from './registrationCenterService.js';
import type { AcademicTrack, EquivalencyCaseSummary, EquivalencyItemInput, Student } from '../../src/types/index.js';

const plainName = (raw?: string) => (raw || '').split('(')[0].trim() || raw || '';
const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : undefined);
const TRACKS: AcademicTrack[] = ['General', 'Networks & Cyber Security', 'Artificial Intelligence'];
export const TRANSFER_DEFAULT_PASSWORD = 'std123456';

interface CaseBody {
  studentId?: string;
  newStudent?: { nameAr?: string; nameEn?: string; email?: string; studentCode?: string; track?: string; advisorId?: string; password?: string };
  previousInstitution?: string;
  previousProgram?: string;
  notes?: string;
  items?: EquivalencyItemInput[];
}

const cleanItems = (items: unknown): EquivalencyItemInput[] =>
  (Array.isArray(items) ? items : []).slice(0, 80).map((raw: any) => ({
    externalCode: raw?.externalCode ? String(raw.externalCode).slice(0, 40) : undefined,
    externalName: String(raw?.externalName || '').slice(0, 160),
    externalCredits: Math.max(0, Math.min(12, Math.round(Number(raw?.externalCredits) || 0))),
    externalMark: raw?.externalMark === '' || raw?.externalMark === null || raw?.externalMark === undefined ? null : Number(raw.externalMark),
    externalGrade: raw?.externalGrade ? String(raw.externalGrade).slice(0, 4) : null,
    courseCode: raw?.courseCode ? String(raw.courseCode).slice(0, 20) : null,
  }));

/**
 * Equivalency (موازنة) cases of transfer students: the administrator records the
 * courses studied at the other faculty, matches each to ours and approves; the
 * credited courses then join the student's record with grades on our scale.
 */
export class EquivalencyService {
  private static assertViewer(caller: CenterCaller | null): asserts caller is CenterCaller {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    if (!['ADMIN', 'DEPARTMENT_HEAD', 'PROCESS_OFFICER', 'ACADEMIC_ADVISOR'].includes(caller.role)) {
      throw new RegistrationError(403, 'الموازنة لمدير النظام (واطلاع رئيس القسم وشؤون الطلاب والمرشد).', 'Equivalency is for the administrator (view: department head, student affairs, advisor).');
    }
  }

  private static assertAdmin(caller: CenterCaller | null): asserts caller is CenterCaller {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    if (caller.role !== 'ADMIN') throw new RegistrationError(403, 'إعداد الموازنة واعتمادها لمدير النظام فقط.', 'Only the administrator prepares and approves equivalencies.');
  }

  private static async catalog() {
    await AcademicRuleRepository.listAll(); // current bylaw thresholds
    return CourseRepository.listAll();
  }

  private static async summary(row: any, student?: Student | null): Promise<EquivalencyCaseSummary> {
    const catalog = await this.catalog();
    const st = student ?? (await StudentRepository.findExact(row.studentId));
    const items: EquivalencyItemInput[] = [...(row.items || [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((i: any) => ({
        externalCode: i.externalCode || undefined,
        externalName: i.externalName,
        externalCredits: i.externalCredits,
        externalMark: i.externalMark,
        externalGrade: i.externalGrade,
        courseCode: i.courseCode,
      }));
    // A draft is re-checked against today's record and rules; an approved case shows what was credited.
    const existing = (st?.records || []).filter(r => row.status === 'APPROVED' ? r.source !== 'EQUIVALENCY' : true);
    let evaluation = EquivalencyEngine.evaluate(items, catalog, existing);
    if (row.status === 'APPROVED') {
      const stored = [...row.items].sort((a: any, b: any) => a.position - b.position);
      evaluation = {
        ...evaluation,
        items: evaluation.items.map((it, idx) => ({
          ...it,
          id: stored[idx]?.id,
          accepted: !!stored[idx]?.accepted,
          grade: stored[idx]?.grade || it.grade,
          gradePoints: stored[idx]?.gradePoints ?? it.gradePoints,
          reasonAr: stored[idx]?.reasonAr || undefined,
          reasonEn: stored[idx]?.reasonEn || undefined,
        })),
        acceptedCourses: stored.filter((i: any) => i.accepted).length,
        acceptedCredits: stored
          .filter((i: any) => i.accepted)
          .reduce((sum: number, i: any) => sum + (catalog.find(c => c.code === i.courseCode)?.credits ?? 0), 0),
        gpa: st?.cumulativeGpa ?? evaluation.gpa,
        level: st?.level ?? evaluation.level,
        remainingCredits: st?.remainingCredits ?? evaluation.remainingCredits,
      };
    }
    return {
      id: row.id,
      studentId: row.studentId,
      studentCode: st?.studentCode || '',
      studentNameAr: plainName(st?.nameAr),
      studentNameEn: plainName(st?.nameEn),
      previousInstitution: row.previousInstitution,
      previousProgram: row.previousProgram || undefined,
      status: row.status === 'APPROVED' ? 'APPROVED' : 'DRAFT',
      notes: row.notes || undefined,
      createdByName: row.createdByName,
      approvedByName: row.approvedByName || undefined,
      approvedAt: iso(row.approvedAt),
      createdAt: iso(row.createdAt) || new Date().toISOString(),
      updatedAt: iso(row.updatedAt) || new Date().toISOString(),
      evaluation,
    };
  }

  static async list(caller: CenterCaller | null): Promise<EquivalencyCaseSummary[]> {
    this.assertViewer(caller);
    const rows = await prisma.equivalencyCase.findMany({ include: { items: true }, orderBy: { updatedAt: 'desc' } });
    const visible = caller.role === 'ACADEMIC_ADVISOR' ? [] as typeof rows : rows;
    if (caller.role === 'ACADEMIC_ADVISOR') {
      const mine = await prisma.student.findMany({ where: { advisorId: caller.advisorId || '__none__' }, select: { id: true } });
      const ids = new Set(mine.map(m => m.id));
      visible.push(...rows.filter(r => ids.has(r.studentId)));
    }
    const out: EquivalencyCaseSummary[] = [];
    for (const row of visible) out.push(await this.summary(row));
    return out;
  }

  static async get(caller: CenterCaller | null, id: string): Promise<EquivalencyCaseSummary> {
    this.assertViewer(caller);
    const row = await prisma.equivalencyCase.findUnique({ where: { id }, include: { items: true } });
    if (!row) throw new RegistrationError(404, 'ملف الموازنة غير موجود.', 'Equivalency not found.');
    return this.summary(row);
  }

  /** Grades and decisions for a list of courses, without saving (live while typing). */
  static async preview(caller: CenterCaller | null, body: { studentId?: string; items?: unknown }) {
    this.assertViewer(caller);
    const catalog = await this.catalog();
    const student = body.studentId ? await StudentRepository.findExact(String(body.studentId)) : null;
    return EquivalencyEngine.evaluate(cleanItems(body.items), catalog, student?.records || []);
  }

  /** Replace a case's lines with an evaluation worked out beforehand (only `tx` is used inside the transaction). */
  private static async writeItems(tx: any, caseId: string, evaluation: ReturnType<typeof EquivalencyEngine.evaluate>) {
    await tx.equivalencyItem.deleteMany({ where: { caseId } });
    if (evaluation.items.length) {
      await tx.equivalencyItem.createMany({
        data: evaluation.items.map((it, position) => ({
          id: crypto.randomUUID(),
          caseId,
          position,
          externalCode: it.externalCode || null,
          externalName: it.externalName || '—',
          externalCredits: it.externalCredits,
          externalMark: Number.isFinite(Number(it.externalMark)) && it.externalMark !== null ? Number(it.externalMark) : null,
          externalGrade: it.externalGrade || null,
          courseCode: it.courseCode || null,
          grade: it.grade || null,
          gradePoints: it.gradePoints ?? null,
          accepted: it.accepted,
          reasonAr: it.reasonAr || null,
          reasonEn: it.reasonEn || null,
        })),
      });
    }
    return evaluation;
  }

  /** Open an equivalency for an existing student or for a new transfer student. */
  static async create(caller: CenterCaller | null, body: CaseBody) {
    this.assertAdmin(caller);
    const institution = String(body.previousInstitution || '').trim();
    if (institution.length < 2) throw new RegistrationError(400, 'اكتب اسم الجامعة أو الكلية التي جاء منها الطالب.', 'Write the university or faculty the student came from.');
    const items = cleanItems(body.items);
    if (items.length === 0) throw new RegistrationError(400, 'أضف مقرراً واحداً على الأقل مما درسه الطالب.', 'Add at least one course the student took.');

    let studentId = body.studentId ? String(body.studentId) : '';
    let createdAccount: { email: string; password: string } | undefined;
    if (studentId) {
      const st = await StudentRepository.findExact(studentId);
      if (!st) throw new RegistrationError(404, 'الطالب غير موجود.', 'Student not found.');
      studentId = st.id;
    } else {
      const n = body.newStudent || {};
      const nameAr = String(n.nameAr || '').trim();
      const nameEn = String(n.nameEn || '').trim() || nameAr;
      const email = String(n.email || '').trim().toLowerCase();
      const studentCode = String(n.studentCode || '').trim();
      if (nameAr.length < 3) throw new RegistrationError(400, 'اكتب اسم الطالب بالعربية.', 'Write the student’s name in Arabic.');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new RegistrationError(400, 'اكتب بريداً جامعياً صحيحاً للطالب.', 'Write a valid university email for the student.');
      if (!/^[A-Za-z0-9_-]{4,20}$/.test(studentCode)) throw new RegistrationError(400, 'الرقم الجامعي من 4 إلى 20 رقماً أو حرفاً.', 'The student code has 4 to 20 letters or digits.');
      const [emailTaken, codeTaken] = await Promise.all([
        prisma.user.findUnique({ where: { email }, select: { id: true } }),
        prisma.student.findUnique({ where: { studentCode }, select: { id: true } }),
      ]);
      if (emailTaken) throw new RegistrationError(409, 'هذا البريد مستخدم لحساب آخر.', 'This email belongs to another account.');
      if (codeTaken) throw new RegistrationError(409, 'هذا الرقم الجامعي مستخدم لطالب آخر.', 'This student code belongs to another student.');
      const advisorId = n.advisorId
        ? (await prisma.advisor.findUnique({ where: { id: String(n.advisorId) }, select: { id: true } }))?.id
        : (await prisma.advisor.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
      const password = String(n.password || '').length >= 6 ? String(n.password) : TRANSFER_DEFAULT_PASSWORD;
      const user = await prisma.user.create({
        data: { email, nameAr, nameEn, role: 'STUDENT', passwordHash: bcrypt.hashSync(password, 10) },
      });
      const student = await prisma.student.create({
        data: {
          userId: user.id,
          studentCode,
          level: 1,
          track: TRACKS.includes(n.track as AcademicTrack) ? String(n.track) : 'General',
          advisorId: advisorId || null,
          admissionType: 'TRANSFER',
          previousInstitution: institution,
        },
      });
      studentId = student.id;
      createdAccount = { email, password };
    }

    const st = await StudentRepository.findExact(studentId);
    const evaluation = EquivalencyEngine.evaluate(items, await this.catalog(), st?.records || []);
    const row = await prisma.$transaction(async tx => {
      await tx.student.update({ where: { id: studentId }, data: { admissionType: 'TRANSFER', previousInstitution: institution } });
      const c = await tx.equivalencyCase.create({
        data: {
          id: crypto.randomUUID(),
          studentId,
          previousInstitution: institution,
          previousProgram: body.previousProgram ? String(body.previousProgram).trim() : null,
          notes: body.notes ? String(body.notes).trim() : null,
          createdByName: plainName(caller.nameAr),
        },
      });
      await this.writeItems(tx, c.id, evaluation);
      return tx.equivalencyCase.findUnique({ where: { id: c.id }, include: { items: true } });
    });
    await prisma.auditLog.create({
      data: {
        userId: (await prisma.user.findUnique({ where: { id: caller.id }, select: { id: true } }))?.id || null,
        userName: caller.nameAr,
        userRole: caller.role as any,
        action: 'CREATE_EQUIVALENCY',
        entity: 'EquivalencyCase',
        entityId: row!.id,
        detailsAr: `فتح ملف موازنة للطالب ${plainName(st?.nameAr)} (${st?.studentCode}) القادم من ${institution} بعدد ${items.length} مقرراً.${createdAccount ? ' وأُنشئ حساب الطالب.' : ''}`,
        detailsEn: `Opened an equivalency for ${plainName(st?.nameEn)} (${st?.studentCode}) from ${institution} with ${items.length} courses.${createdAccount ? ' The student account was created.' : ''}`,
      },
    }).catch(() => undefined);
    return { case: await this.summary(row, st), createdAccount };
  }

  static async update(caller: CenterCaller | null, id: string, body: CaseBody) {
    this.assertAdmin(caller);
    const existing = await prisma.equivalencyCase.findUnique({ where: { id } });
    if (!existing) throw new RegistrationError(404, 'ملف الموازنة غير موجود.', 'Equivalency not found.');
    if (existing.status !== 'DRAFT') throw new RegistrationError(409, 'اعتُمدت هذه الموازنة ولا يمكن تعديلها.', 'This equivalency is approved and cannot change.');
    const st = await StudentRepository.findExact(existing.studentId);
    const items = body.items !== undefined ? cleanItems(body.items) : undefined;
    const evaluation = items ? EquivalencyEngine.evaluate(items, await this.catalog(), st?.records || []) : undefined;
    const row = await prisma.$transaction(async tx => {
      await tx.equivalencyCase.update({
        where: { id },
        data: {
          ...(body.previousInstitution !== undefined && String(body.previousInstitution).trim() ? { previousInstitution: String(body.previousInstitution).trim() } : {}),
          ...(body.previousProgram !== undefined ? { previousProgram: String(body.previousProgram || '').trim() || null } : {}),
          ...(body.notes !== undefined ? { notes: String(body.notes || '').trim() || null } : {}),
        },
      });
      if (evaluation) await this.writeItems(tx, id, evaluation);
      return tx.equivalencyCase.findUnique({ where: { id }, include: { items: true } });
    });
    return { case: await this.summary(row, st) };
  }

  static async remove(caller: CenterCaller | null, id: string) {
    this.assertAdmin(caller);
    const existing = await prisma.equivalencyCase.findUnique({ where: { id } });
    if (!existing) throw new RegistrationError(404, 'ملف الموازنة غير موجود.', 'Equivalency not found.');
    if (existing.status !== 'DRAFT') throw new RegistrationError(409, 'لا يمكن حذف موازنة معتمدة.', 'An approved equivalency cannot be deleted.');
    await prisma.equivalencyCase.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Approve: the accepted courses join the student's record as passed (with our
   * grade), and the GPA, completed hours and level are worked out again.
   */
  static async approve(caller: CenterCaller | null, id: string) {
    this.assertAdmin(caller);
    const catalog = await this.catalog();
    const result = await prisma.$transaction(async tx => {
      const row = await tx.equivalencyCase.findUnique({ where: { id }, include: { items: true, student: { include: STUDENT_INCLUDE } } });
      if (!row) throw new RegistrationError(404, 'ملف الموازنة غير موجود.', 'Equivalency not found.');
      if (row.status !== 'DRAFT') throw new RegistrationError(409, 'اعتُمدت هذه الموازنة من قبل.', 'This equivalency is already approved.');
      const student = StudentRepository.mapToDomain(row.student);
      const items: EquivalencyItemInput[] = [...row.items]
        .sort((a, b) => a.position - b.position)
        .map(i => ({ externalCode: i.externalCode || undefined, externalName: i.externalName, externalCredits: i.externalCredits, externalMark: i.externalMark, externalGrade: i.externalGrade, courseCode: i.courseCode }));
      const evaluation = EquivalencyEngine.evaluate(items, catalog, student.records);
      const accepted = evaluation.items.filter(i => i.accepted);
      if (accepted.length === 0) {
        throw new RegistrationError(422, 'لا يوجد مقرر مقبول للمعادلة؛ راجع المقررات وأسباب الرفض.', 'No course can be credited; check the courses and the reasons shown.');
      }

      for (const it of accepted) {
        const course = catalog.find(c => c.code === it.courseCode)!;
        await tx.courseRecord.create({
          data: {
            id: `rec_${student.id}_${course.code.replace(/\s+/g, '_')}_eq_${row.id.slice(0, 8)}`,
            studentId: student.id,
            courseId: course.id,
            attempt: 1,
            status: 'PASSED',
            grade: it.grade!,
            gradePoints: it.gradePoints!,
            totalMark: it.percent ?? null,
            attendancePercentage: 100,
            source: 'EQUIVALENCY',
            registeredByName: `موازنة: ${plainName(caller.nameAr)}`,
            note: `معادلة من ${row.previousInstitution}: ${[it.externalCode, it.externalName].filter(Boolean).join(' ')}${it.percent !== undefined ? ` (${it.percent}%)` : ''}`,
          },
        });
      }
      // Keep each line's final decision with the case.
      const stored = [...row.items].sort((a, b) => a.position - b.position);
      for (let i = 0; i < stored.length; i++) {
        const it = evaluation.items[i];
        await tx.equivalencyItem.update({
          where: { id: stored[i].id },
          data: { accepted: it.accepted, grade: it.grade || null, gradePoints: it.gradePoints ?? null, reasonAr: it.reasonAr || null, reasonEn: it.reasonEn || null },
        });
      }

      const all = await tx.courseRecord.findMany({ where: { studentId: student.id }, include: { course: true } });
      const gpa = calculateGpa(all.filter(r => r.gradePoints !== null).map(r => ({ credits: r.course.credits, gradePoints: r.gradePoints!, grade: r.grade || undefined }))).gpa;
      const completed = all.filter(r => r.status === 'PASSED').reduce((sum, r) => sum + r.course.credits, 0);
      const level = EquivalencyEngine.levelForCredits(completed);
      await tx.student.update({
        where: { id: student.id },
        data: { cumulativeGpa: gpa, previousGpa: gpa, completedCredits: completed, level, admissionType: 'TRANSFER', previousInstitution: row.previousInstitution },
      });
      await tx.equivalencyCase.update({ where: { id }, data: { status: 'APPROVED', approvedByName: plainName(caller.nameAr), approvedAt: new Date() } });
      const actor = await tx.user.findUnique({ where: { id: caller.id }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          userId: actor?.id || null,
          userName: caller.nameAr,
          userRole: caller.role as any,
          action: 'APPROVE_EQUIVALENCY',
          entity: 'EquivalencyCase',
          entityId: id,
          detailsAr: `اعتماد موازنة الطالب ${plainName(student.nameAr)} (${student.studentCode}) من ${row.previousInstitution}: عودل ${accepted.length} مقرراً (${accepted.reduce((s, i) => s + (i.courseCredits || 0), 0)} ساعة): ${accepted.map(i => `${i.courseCode} ${i.grade}`).join('، ')}. المعدل ${gpa}، المستوى ${level}.`,
          detailsEn: `Approved ${plainName(student.nameEn)}'s (${student.studentCode}) equivalency from ${row.previousInstitution}: ${accepted.length} courses credited: ${accepted.map(i => `${i.courseCode} ${i.grade}`).join(', ')}. GPA ${gpa}, level ${level}.`,
          after: JSON.stringify({ credited: accepted.map(i => ({ code: i.courseCode, grade: i.grade, points: i.gradePoints })), gpa, completed, level }),
        },
      });
      return { student, accepted, gpa, completed, level };
    });

    const { student, accepted, gpa, completed, level } = result;
    await NotificationRepository.create({
      recipientId: student.id,
      type: 'GENERAL',
      titleAr: 'اعتُمدت موازنة مقرراتك',
      titleEn: 'Your course equivalency was approved',
      messageAr: `عودل لك ${accepted.length} مقرراً (${accepted.map(i => `${i.courseCode} بتقدير ${i.grade}`).join('، ')}) محسوبة بمقياس الكلية. ساعاتك المنجزة ${completed}، ومعدلك ${gpa.toFixed(2)}، ومستواك ${level}.`,
      messageEn: `${accepted.length} courses were credited (${accepted.map(i => `${i.courseCode} ${i.grade}`).join(', ')}) on our grading scale. You now have ${completed} credit hours, GPA ${gpa.toFixed(2)}, level ${level}.`,
    }).catch(() => undefined);
    if (student.advisorId) {
      await NotificationRepository.create({
        recipientId: student.advisorId,
        type: 'GENERAL',
        titleAr: `موازنة معتمدة لطالبك ${plainName(student.nameAr)}`,
        titleEn: `Equivalency approved for ${plainName(student.nameEn)}`,
        messageAr: `اعتُمدت موازنة الطالب المحوَّل ${plainName(student.nameAr)} (${student.studentCode}): ${accepted.length} مقرراً بـ${completed} ساعة، معدل ${gpa.toFixed(2)}، المستوى ${level}. راجع خطته وسجّل له مقررات هذا الفصل.`,
        messageEn: `${plainName(student.nameEn)} (${student.studentCode}) was credited ${accepted.length} courses (${completed} hours, GPA ${gpa.toFixed(2)}, level ${level}). Review the plan and register this term's courses.`,
      }).catch(() => undefined);
    }
    return { case: await this.get(caller, id) };
  }
}
