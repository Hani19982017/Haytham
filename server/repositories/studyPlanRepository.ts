import { prisma } from '../db/prisma.js';
import { StudyPlan, PlanStatus } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';
import { INITIAL_STUDY_PLANS } from '../data/store.js';

export class StudyPlanRepository {
  public static mapToDomain(row: any): StudyPlan {
    let semesters = [];
    try {
      semesters = typeof row.planDataJson === 'string' ? JSON.parse(row.planDataJson) : (row.planDataJson || []);
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
      createdAt: row.createdAt ? (typeof row.createdAt === 'string' ? row.createdAt : row.createdAt.toISOString()) : new Date().toISOString(),
      updatedAt: row.updatedAt ? (typeof row.updatedAt === 'string' ? row.updatedAt : row.updatedAt.toISOString()) : new Date().toISOString(),
      semesters,
      expectedGraduationSemesterAr: lastSem?.semesterNameAr || 'ربيع 2027',
      expectedGraduationSemesterEn: lastSem?.semesterNameEn || 'Spring 2027',
      totalPlannedCredits: totalPlanned,
    };
  }

  public static async getByStudentId(studentId: string): Promise<StudyPlan | null> {
    try {
      const row = await prisma.studyPlan.findFirst({
        where: { studentId },
        orderBy: { updatedAt: 'desc' },
      });
      if (row) return this.mapToDomain(row);
    } catch (err) {
      console.warn(`[StudyPlanRepository] DB getByStudentId fallback for ${studentId}:`, err);
    }

    return INITIAL_STUDY_PLANS.find(p => p.studentId === studentId) || null;
  }

  public static async savePlan(
    studentId: string,
    plan: StudyPlan,
    status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' = 'DRAFT',
    tx?: Prisma.TransactionClient
  ): Promise<StudyPlan> {
    try {
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
    } catch (err) {
      console.warn(`[StudyPlanRepository] DB savePlan fallback for ${studentId}:`, err);
      const existingIdx = INITIAL_STUDY_PLANS.findIndex(p => p.studentId === studentId);
      const planObj: StudyPlan = {
        ...plan,
        studentId,
        status: (status === 'APPROVED' ? 'Approved' : status === 'PENDING_REVIEW' ? 'Pending Review' : 'Draft') as PlanStatus,
        updatedAt: new Date().toISOString(),
      };
      if (existingIdx !== -1) {
        INITIAL_STUDY_PLANS[existingIdx] = planObj;
      } else {
        INITIAL_STUDY_PLANS.push(planObj);
      }
      return planObj;
    }
  }

  public static async updateStatus(
    studentId: string,
    status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
    advisorNotes?: string,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    try {
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
    } catch {
      const match = INITIAL_STUDY_PLANS.find(p => p.studentId === studentId);
      if (match) {
        match.status = (status === 'APPROVED' ? 'Approved' : status === 'PENDING_REVIEW' ? 'Pending Review' : 'Draft') as PlanStatus;
      }
    }
  }
}
