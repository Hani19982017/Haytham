import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { StudentRepository } from '../repositories/studentRepository.js';
import { NotificationRepository } from '../repositories/notificationRepository.js';
import { AcademicRuleRepository } from '../repositories/academicRuleRepository.js';
import { AcademicRulesEngine } from '../engines/rulesEngine.js';
import { RegistrationError, CenterCaller } from './registrationCenterService.js';
import type { Student, TrainingStatus, TrainingSubmission } from '../../src/types/index.js';

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const plainName = (raw?: string) => (raw || '').split('(')[0].trim() || raw || '';
const STATUS: Record<string, TrainingStatus> = { PENDING: 'Pending', ACCEPTED: 'Accepted', PASSED: 'Passed', FAILED: 'Failed' };

/**
 * File names arrive from the upload as Latin-1 text even when the browser sent
 * UTF-8 (e.g. an Arabic name like «شهادة تدريب.pdf»); read them back as UTF-8.
 */
export function utf8Name(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

/** What the file really is, from its first bytes (the name and browser type can be anything). */
export function sniffProof(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

const toSubmission = (row: any, student?: Pick<Student, 'studentCode' | 'nameAr' | 'nameEn'> | null): TrainingSubmission => ({
  id: row.id,
  studentId: row.studentId,
  studentCode: student?.studentCode ?? row.student?.studentCode,
  studentNameAr: plainName(student?.nameAr ?? row.student?.user?.nameAr),
  studentNameEn: plainName(student?.nameEn ?? row.student?.user?.nameEn),
  company: row.company,
  hours: row.hours,
  periodWeeks: row.periodWeeks,
  startDate: row.startDate ? new Date(row.startDate).toISOString() : undefined,
  endDate: row.endDate ? new Date(row.endDate).toISOString() : undefined,
  status: STATUS[row.status] || 'Pending',
  studentNotes: row.studentNotes || undefined,
  proofFileName: row.proofFileName || undefined,
  proofMimeType: row.proofMimeType || undefined,
  proofSize: row.proofSize ?? undefined,
  reviewNotes: row.reviewNotes || undefined,
  reviewedByName: row.reviewedByName || undefined,
  reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : undefined,
  createdAt: new Date(row.createdAt).toISOString(),
});

/** Columns of a submission without the file itself. */
const LIST_SELECT = {
  id: true, studentId: true, company: true, hours: true, periodWeeks: true, status: true, startDate: true, endDate: true,
  studentNotes: true, proofFileName: true, proofMimeType: true, proofSize: true, reviewNotes: true, reviewedByName: true,
  reviewedAt: true, createdAt: true,
  student: { select: { studentCode: true, advisorId: true, user: { select: { nameAr: true, nameEn: true } } } },
} as const;

/**
 * Summer training: the student submits each training period with a proof
 * (certificate or company letter, PDF or image); their advisor (or the
 * administrator) accepts or rejects it. Only accepted periods count towards the
 * 240 hours.
 */
export class TrainingService {
  private static async ownStudent(caller: CenterCaller | null, studentKey: string): Promise<Student> {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    const student = await StudentRepository.findExact(studentKey === 'me' ? caller.studentId || caller.id : studentKey);
    if (!student) throw new RegistrationError(404, 'الطالب غير موجود.', 'Student not found.');
    return student;
  }

  private static canSee(caller: CenterCaller, student: { id: string; advisorId?: string | null }) {
    if (['ADMIN', 'PROCESS_OFFICER', 'DEPARTMENT_HEAD'].includes(caller.role)) return true;
    if (caller.role === 'STUDENT') return caller.studentId === student.id;
    if (caller.role === 'ACADEMIC_ADVISOR') return !!caller.advisorId && caller.advisorId === student.advisorId;
    return false;
  }

  static async listForStudent(caller: CenterCaller | null, studentKey: string): Promise<{ submissions: TrainingSubmission[]; requiredHours: number; minCredits: number; maxFileMb: number }> {
    const student = await this.ownStudent(caller, studentKey);
    if (!this.canSee(caller!, student)) throw new RegistrationError(403, 'لا تملك صلاحية الاطلاع على تدريب هذا الطالب.', 'You cannot view this student’s training.');
    await AcademicRuleRepository.listAll();
    const rows = await prisma.summerTraining.findMany({ where: { studentId: student.id }, select: LIST_SELECT, orderBy: { createdAt: 'desc' } });
    return {
      submissions: rows.map(r => toSubmission(r, student)),
      requiredHours: AcademicRulesEngine.TRAINING_REQUIRED_HOURS,
      minCredits: AcademicRulesEngine.MIN_TRAINING_CREDITS,
      maxFileMb: MAX_PROOF_BYTES / (1024 * 1024),
    };
  }

  /** Submissions waiting for (or decided by) the advisor: their students; staff: everyone. */
  static async listForReview(caller: CenterCaller | null, status?: string): Promise<TrainingSubmission[]> {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    if (!['ADMIN', 'PROCESS_OFFICER', 'DEPARTMENT_HEAD', 'ACADEMIC_ADVISOR'].includes(caller.role)) {
      throw new RegistrationError(403, 'مراجعة إثباتات التدريب للمرشد ومدير النظام.', 'Training proofs are reviewed by advisors and the administrator.');
    }
    const wanted = status && STATUS[status.toUpperCase()] ? status.toUpperCase() : undefined;
    const rows = await prisma.summerTraining.findMany({
      where: {
        ...(wanted ? { status: wanted as any } : {}),
        ...(caller.role === 'ACADEMIC_ADVISOR' ? { student: { advisorId: caller.advisorId || '__none__' } } : {}),
      },
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(r => toSubmission(r));
  }

  static async submit(
    caller: CenterCaller | null,
    studentKey: string,
    body: Record<string, unknown>,
    file?: { buffer: Buffer; originalname: string; mimetype: string; size: number }
  ): Promise<{ success: true; submission: TrainingSubmission; trainingHours: number; trainingStatus: TrainingStatus }> {
    const student = await this.ownStudent(caller, studentKey);
    if (!(caller!.role === 'STUDENT' && caller!.studentId === student.id) && caller!.role !== 'ADMIN') {
      throw new RegistrationError(403, 'يرفع الطالب إثبات تدريبه بنفسه.', 'Students submit their own training proof.');
    }
    await AcademicRuleRepository.listAll();
    if (student.completedCredits < AcademicRulesEngine.MIN_TRAINING_CREDITS) {
      throw new RegistrationError(
        400,
        `لا يحق للطالب التقديم للتدريب الصيفي قبل إنجاز ${AcademicRulesEngine.MIN_TRAINING_CREDITS} ساعة معتمدة. رصيدك الحالي (${student.completedCredits}).`,
        `Summer training opens after ${AcademicRulesEngine.MIN_TRAINING_CREDITS} completed credit hours; you have ${student.completedCredits}.`
      );
    }
    const company = String(body.company || '').trim();
    if (company.length < 2) throw new RegistrationError(400, 'اكتب اسم جهة التدريب.', 'Write where you trained.');
    const hours = Math.round(Number(body.hours || 120));
    if (!Number.isFinite(hours) || hours < 1 || hours > 480) throw new RegistrationError(400, 'عدد الساعات من 1 إلى 480.', 'Hours must be between 1 and 480.');
    const weeks = Math.round(Number(body.periodWeeks || 4));
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 26) throw new RegistrationError(400, 'مدة التدريب من أسبوع إلى 26 أسبوعاً.', 'The period is 1 to 26 weeks.');
    const date = (v: unknown) => {
      if (!v) return null;
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const startDate = date(body.startDate);
    const endDate = date(body.endDate);
    if (startDate && endDate && endDate < startDate) throw new RegistrationError(400, 'تاريخ النهاية قبل تاريخ البداية.', 'The end date is before the start date.');
    if (!file || !file.buffer?.length) {
      throw new RegistrationError(400, 'ارفع ما يثبت التدريب (شهادة أو خطاب من جهة التدريب) بصيغة PDF أو صورة.', 'Upload proof of the training (a certificate or a letter from the company) as a PDF or an image.');
    }
    if (file.size > MAX_PROOF_BYTES) throw new RegistrationError(400, 'حجم الملف أكبر من 5 ميجابايت.', 'The file is larger than 5 MB.');
    const kind = sniffProof(file.buffer);
    if (!kind) throw new RegistrationError(400, 'الملف يجب أن يكون PDF أو صورة (JPG أو PNG أو WEBP).', 'The file must be a PDF or an image (JPG, PNG or WEBP).');

    const safeName = utf8Name(file.originalname || `proof.${kind.ext}`).replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(-120);
    const row = await prisma.summerTraining.create({
      data: {
        id: crypto.randomUUID(),
        studentId: student.id,
        company: company.slice(0, 160),
        hours,
        periodWeeks: weeks,
        startDate,
        endDate,
        status: 'PENDING',
        studentNotes: body.notes ? String(body.notes).slice(0, 800) : null,
        proofFileName: safeName,
        proofMimeType: kind.mime,
        proofSize: file.size,
        proofData: new Uint8Array(file.buffer),
      },
      select: LIST_SELECT,
    });
    if (student.advisorId) {
      await NotificationRepository.create({
        recipientId: student.advisorId,
        type: 'APPROVAL',
        titleAr: `إثبات تدريب صيفي للمراجعة: ${plainName(student.nameAr)}`,
        titleEn: `Training proof to review: ${plainName(student.nameEn)}`,
        messageAr: `رفع ${plainName(student.nameAr)} (${student.studentCode}) إثبات تدريب لدى «${company}» (${hours} ساعة). راجعه واعتمده من صفحة «الاعتمادات».`,
        messageEn: `${plainName(student.nameEn)} (${student.studentCode}) uploaded proof of training at “${company}” (${hours} hours). Review it on the Approvals page.`,
      }).catch(() => undefined);
    }
    await prisma.auditLog.create({
      data: {
        userId: (await prisma.user.findUnique({ where: { id: caller!.id }, select: { id: true } }))?.id || null,
        userName: caller!.nameAr,
        userRole: caller!.role as any,
        action: 'SUBMIT_TRAINING',
        entity: 'SummerTraining',
        entityId: row.id,
        detailsAr: `رفع إثبات تدريب صيفي لدى (${company}) بعدد ${hours} ساعة (${safeName}).`,
        detailsEn: `Submitted summer training proof for (${company}), ${hours} hours (${safeName}).`,
      },
    }).catch(() => undefined);
    const fresh = await StudentRepository.findExact(student.id);
    return { success: true, submission: toSubmission(row, student), trainingHours: fresh?.trainingHours ?? 0, trainingStatus: fresh?.trainingStatus ?? 'Pending' };
  }

  /** The uploaded proof, for the student, their advisor and staff. */
  static async proof(caller: CenterCaller | null, id: string): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    const row = await prisma.summerTraining.findUnique({
      where: { id },
      select: { id: true, proofData: true, proofMimeType: true, proofFileName: true, studentId: true, student: { select: { id: true, advisorId: true } } },
    });
    if (!row || !row.proofData) throw new RegistrationError(404, 'لا يوجد ملف مرفق.', 'No file attached.');
    if (!this.canSee(caller, row.student)) throw new RegistrationError(403, 'لا تملك صلاحية فتح هذا الملف.', 'You cannot open this file.');
    return { buffer: Buffer.from(row.proofData), mime: row.proofMimeType || 'application/octet-stream', filename: row.proofFileName || 'proof' };
  }

  static async review(caller: CenterCaller | null, id: string, decision: string, notes = '') {
    if (!caller) throw new RegistrationError(401, 'غير مصرح: يرجى تسجيل الدخول.', 'Unauthorized: please sign in.');
    const row = await prisma.summerTraining.findUnique({ where: { id }, select: { ...LIST_SELECT, student: { select: { id: true, studentCode: true, advisorId: true, user: { select: { nameAr: true, nameEn: true } } } } } });
    if (!row) throw new RegistrationError(404, 'طلب التدريب غير موجود.', 'Training submission not found.');
    const mayDecide = caller.role === 'ADMIN' || (caller.role === 'ACADEMIC_ADVISOR' && !!caller.advisorId && caller.advisorId === row.student.advisorId);
    if (!mayDecide) throw new RegistrationError(403, 'يعتمد إثبات التدريب مرشد الطالب أو مدير النظام.', 'The student’s advisor or the administrator decides on training proofs.');
    const d = decision.toUpperCase();
    if (d !== 'ACCEPT' && d !== 'REJECT') throw new RegistrationError(400, 'القرار غير معروف.', 'Unknown decision.');
    const note = notes.trim();
    if (d === 'REJECT' && note.length < 3) throw new RegistrationError(400, 'اكتب للطالب سبب رفض الإثبات.', 'Tell the student why the proof was rejected.');
    const updated = await prisma.summerTraining.update({
      where: { id },
      data: { status: d === 'ACCEPT' ? 'ACCEPTED' : 'FAILED', reviewNotes: note || null, reviewedByName: plainName(caller.nameAr), reviewedAt: new Date() },
      select: LIST_SELECT,
    });
    const student = await StudentRepository.findExact(row.studentId);
    await NotificationRepository.create({
      recipientId: row.studentId,
      type: 'APPROVAL',
      titleAr: d === 'ACCEPT' ? 'قُبل إثبات تدريبك الصيفي' : 'رُفض إثبات تدريبك الصيفي',
      titleEn: d === 'ACCEPT' ? 'Your training proof was accepted' : 'Your training proof was rejected',
      messageAr:
        d === 'ACCEPT'
          ? `قُبل تدريبك لدى «${row.company}» (${row.hours} ساعة). رصيدك المعتمد الآن ${student?.trainingHours ?? row.hours} من ${AcademicRulesEngine.TRAINING_REQUIRED_HOURS} ساعة.${note ? ` ملاحظة: ${note}` : ''}`
          : `رُفض إثبات تدريبك لدى «${row.company}»: ${note}. ارفع إثباتاً صحيحاً من صفحة «التدريب الصيفي».`,
      messageEn:
        d === 'ACCEPT'
          ? `Your training at “${row.company}” (${row.hours} hours) was accepted. You now have ${student?.trainingHours ?? row.hours} of ${AcademicRulesEngine.TRAINING_REQUIRED_HOURS} hours.${note ? ` Note: ${note}` : ''}`
          : `Your proof of training at “${row.company}” was rejected: ${note}. Upload a valid proof on the Training page.`,
    }).catch(() => undefined);
    await prisma.auditLog.create({
      data: {
        userId: (await prisma.user.findUnique({ where: { id: caller.id }, select: { id: true } }))?.id || null,
        userName: caller.nameAr,
        userRole: caller.role as any,
        action: d === 'ACCEPT' ? 'ACCEPT_TRAINING' : 'REJECT_TRAINING',
        entity: 'SummerTraining',
        entityId: id,
        detailsAr: `${d === 'ACCEPT' ? 'قبول' : 'رفض'} إثبات تدريب ${plainName(row.student.user.nameAr)} (${row.student.studentCode}) لدى ${row.company} (${row.hours} ساعة)${note ? `: ${note}` : ''}.`,
        detailsEn: `${d === 'ACCEPT' ? 'Accepted' : 'Rejected'} ${plainName(row.student.user.nameEn)}'s training proof at ${row.company} (${row.hours} hours)${note ? `: ${note}` : ''}.`,
      },
    }).catch(() => undefined);
    return { success: true, submission: toSubmission(updated), trainingHours: student?.trainingHours ?? 0, trainingStatus: student?.trainingStatus ?? 'Pending' };
  }
}
