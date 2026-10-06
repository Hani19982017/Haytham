import { prisma } from '../db/prisma.js';
import { StudyPlan, PlanStatus } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';

export class StudyPlanRepository {
  public static mapToDomain(row: any): StudyPlan {
    let semesters = [];
    try {
      semesters = JSON.parse(row.planDataJson);
    } catch {}

    const totalPlanned = semesters.reduce((acc: number, s: any) => acc + (s.totalCredits || 0), 0);
    const lastSem = semesters[semesters.length - 1];

    let statusString: PlanStatus = 'Draft';
    if (row.status === 'APPROVED') statusString = 'Approved';
    else if (row.status === 'PENDING_REVIEW') statusString = 'Pending Review';
    else if (row.status === 'REJECTED') statusString = 'Rejected';
    else if (row.status === 'ARCHIVED') statusString = 'Archived';

    return {
      id: row.id,
      studentId: row.studentId,
      status: statusString,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      semesters,
      expectedGraduationSemesterAr: lastSem?.semesterNameAr || 'ربيع 2027',
      expectedGraduationSemesterEn: lastSem?.semesterNameEn || 'Spring 2027',
      totalPlannedCredits: totalPlanned,
    };
  }

  public static async getByStudentId(studentId: string): Promise<StudyPlan | null> {
    const row = await prisma.studyPlan.findFirst({
      where: { studentId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) return null;
    return this.mapToDomain(row);
  }

  public static async savePlan(
    studentId: string,
    plan: StudyPlan,
    status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' = 'DRAFT',
    tx?: Prisma.TransactionClient
  ): Promise<StudyPlan> {
    const client = tx || prisma;
    const existing = await client.studyPlan.findFirst({
      where: { studentId },
    });

    if (existing) {
      const updated = await client.studyPlan.update({
        where: { id: existing.id },
        data: {
          status,
          planDataJson: JSON.stringify(plan.semesters),
        },
      });
      return this.mapToDomain(updated);
    } else {
      const created = await client.studyPlan.create({
        data: {
          id: plan.id || `plan_${studentId}_${Date.now()}`,
          studentId,
          status,
          planDataJson: JSON.stringify(plan.semesters),
        },
      });
      return this.mapToDomain(created);
    }
  }

  public static async updateStatus(
    studentId: string,
    status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
    advisorNotes?: string,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx || prisma;
    const existing = await client.studyPlan.findFirst({
      where: { studentId },
    });

    if (existing) {
      await client.studyPlan.update({
        where: { id: existing.id },
        data: {
          status,
          ...(advisorNotes !== undefined && { advisorNotes }),
        },
      });
    }
  }
}
