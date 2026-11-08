import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import type { RegistrationRequest, RegistrationRequestStatus } from '../../src/types/index.js';
import { INITIAL_REGISTRATION_REQUESTS } from '../data/store.js';

const CURRENT_SEMESTER_ID = 'sem_fall_2026';

const parseIds = (json: string | null | undefined): string[] => {
  try {
    const value = JSON.parse(json || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);

/**
 * A student's semester registration request: the sections they picked (and the
 * GPA recovery route they adopted) on its way to the advisor. One live request
 * per student and term; PostgreSQL first, in-memory when it is unavailable.
 */
export class RegistrationRequestRepository {
  public static toDomain(row: any): RegistrationRequest {
    return {
      id: row.id,
      studentId: row.studentId,
      status: row.status as RegistrationRequestStatus,
      offeringIds: Array.isArray(row.offeringIds) ? row.offeringIds : parseIds(row.offeringIdsJson),
      recoveryStrategy: row.recoveryStrategy || undefined,
      recoveryTitleAr: row.recoveryTitleAr || undefined,
      recoveryTitleEn: row.recoveryTitleEn || undefined,
      studentNotes: row.studentNotes || undefined,
      advisorNotes: row.advisorNotes || undefined,
      decidedByName: row.decidedByName || undefined,
      submittedAt: iso(row.submittedAt),
      decidedAt: iso(row.decidedAt),
      updatedAt: iso(row.updatedAt) || new Date().toISOString(),
    };
  }

  /** The student's latest request this term (null when they have none yet). */
  public static async current(studentId: string): Promise<RegistrationRequest | null> {
    try {
      const row = await prisma.registrationRequest.findFirst({
        where: { studentId, OR: [{ semesterId: CURRENT_SEMESTER_ID }, { semesterId: null }] },
        orderBy: { updatedAt: 'desc' },
      });
      return row ? this.toDomain(row) : null;
    } catch {
      const rows = INITIAL_REGISTRATION_REQUESTS.filter(r => r.studentId === studentId);
      return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
    }
  }

  public static async findById(id: string): Promise<RegistrationRequest | null> {
    try {
      const row = await prisma.registrationRequest.findUnique({ where: { id } });
      return row ? this.toDomain(row) : null;
    } catch {
      return INITIAL_REGISTRATION_REQUESTS.find(r => r.id === id) || null;
    }
  }

  /** Create or update the student's current request with the given fields. */
  public static async save(
    studentId: string,
    fields: Partial<Omit<RegistrationRequest, 'id' | 'studentId' | 'updatedAt'>>
  ): Promise<RegistrationRequest> {
    const existing = await this.current(studentId);
    const data: any = {};
    if (fields.status !== undefined) data.status = fields.status;
    if (fields.offeringIds !== undefined) data.offeringIdsJson = JSON.stringify([...new Set(fields.offeringIds)]);
    for (const key of ['recoveryStrategy', 'recoveryTitleAr', 'recoveryTitleEn', 'studentNotes', 'advisorNotes', 'decidedByName'] as const) {
      if (fields[key] !== undefined) data[key] = fields[key] || null;
    }
    if (fields.submittedAt !== undefined) data.submittedAt = fields.submittedAt ? new Date(fields.submittedAt) : null;
    if (fields.decidedAt !== undefined) data.decidedAt = fields.decidedAt ? new Date(fields.decidedAt) : null;

    try {
      const row = existing
        ? await prisma.registrationRequest.update({ where: { id: existing.id }, data })
        : await prisma.registrationRequest.create({
            data: { id: crypto.randomUUID(), studentId, semesterId: CURRENT_SEMESTER_ID, status: 'DRAFT', offeringIdsJson: '[]', ...data },
          });
      return this.toDomain(row);
    } catch (err: any) {
      console.warn('[RegistrationRequestRepository] DB save fallback:', err?.message || err);
      const now = new Date().toISOString();
      const target =
        INITIAL_REGISTRATION_REQUESTS.find(r => r.id === existing?.id) ||
        (() => {
          const created: RegistrationRequest = { id: crypto.randomUUID(), studentId, status: 'DRAFT', offeringIds: [], updatedAt: now };
          INITIAL_REGISTRATION_REQUESTS.push(created);
          return created;
        })();
      Object.assign(target, fields, { updatedAt: now });
      if (fields.offeringIds) target.offeringIds = [...new Set(fields.offeringIds)];
      return target;
    }
  }

  /** Requests from the given students (newest first), e.g. an advisor's advisees. */
  public static async forStudents(studentIds: string[], statuses?: RegistrationRequestStatus[]): Promise<RegistrationRequest[]> {
    try {
      const rows = await prisma.registrationRequest.findMany({
        where: { studentId: { in: studentIds }, ...(statuses ? { status: { in: statuses } } : {}) },
        orderBy: { updatedAt: 'desc' },
      });
      return rows.map(r => this.toDomain(r));
    } catch {
      return INITIAL_REGISTRATION_REQUESTS.filter(r => studentIds.includes(r.studentId) && (!statuses || statuses.includes(r.status))).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      );
    }
  }
}
