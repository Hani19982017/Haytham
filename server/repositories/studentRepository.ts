import { prisma } from '../db/prisma.js';
import { Student, StudentCourseRecord, RiskLevel, TrainingStatus, PlanStatus, AcademicTrack } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';
import { INITIAL_STUDENTS } from '../data/store.js';

export class StudentRepository {
  /**
   * Helper to map Prisma Student + User + Records to Application Student domain model
   */
  public static mapToDomain(row: any): Student {
    const records: StudentCourseRecord[] = (row.records || []).map((r: any) => ({
      courseCode: r.course?.code || r.courseCode || '',
      courseNameAr: r.course?.nameAr || '',
      courseNameEn: r.course?.nameEn || '',
      credits: r.course?.credits ?? 3,
      grade: r.grade || undefined,
      gradePoints: r.gradePoints ?? undefined,
      status: r.status as 'PASSED' | 'FAILED' | 'ENROLLED' | 'IN_PROGRESS',
      semesterId: r.offering?.semesterId || 'sem_fall_2026',
      semesterName: r.offering?.semester?.nameAr || 'خريف 2026',
      attempt: r.attempt || 1,
      attendancePercentage: r.attendancePercentage ?? 100,
      courseworkMark: r.courseworkMark ?? undefined,
      finalMark: r.finalMark ?? undefined,
      totalMark: r.totalMark ?? undefined,
    }));

    // Find latest study plan if any
    const latestPlan = row.studyPlans && row.studyPlans.length > 0 ? row.studyPlans[0] : null;
    const memStu = INITIAL_STUDENTS.find(s => s.id === row.id || s.studentCode === row.studentCode);
    const resolvedPlanStatus: PlanStatus = latestPlan
      ? (latestPlan.status === 'APPROVED' ? 'Approved' : latestPlan.status === 'PENDING_REVIEW' ? 'Pending Review' : latestPlan.status === 'REJECTED' ? 'Rejected' : 'Draft')
      : (memStu?.currentPlanStatus || (row.cumulativeGpa < 2.0 ? 'Pending Review' : 'Approved'));

    return {
      id: row.id,
      studentCode: row.studentCode,
      nameAr: row.user?.nameAr || row.nameAr || '',
      nameEn: row.user?.nameEn || row.nameEn || '',
      email: row.user?.email || row.email || '',
      level: row.level,
      track: row.track as AcademicTrack,
      advisorId: row.advisorId || '',
      advisorName: row.advisor?.user?.nameAr ? `${row.advisor.user.nameAr} (${row.advisor.user.nameEn})` : 'د. محمود صقر',
      cumulativeGpa: row.cumulativeGpa,
      previousGpa: row.previousGpa,
      completedCredits: row.completedCredits,
      enrolledCredits: row.enrolledCredits,
      remainingCredits: Math.max(0, 134 - row.completedCredits),
      warningCount: row.warningCount,
      consecutiveWarnings: row.consecutiveWarnings,
      riskLevel: row.riskLevel as RiskLevel,
      riskReasons: [],
      records,
      trainingHours: row.trainings?.[0]?.hours ?? 0,
      trainingStatus: (row.trainings?.[0]?.status ?? 'Pending') as TrainingStatus,
      currentPlanStatus: resolvedPlanStatus,
    };
  }

  public static async findById(id: string): Promise<Student | null> {
    if (!id || id === 'undefined' || id === 'null') {
      return INITIAL_STUDENTS[0] || null;
    }
    try {
      let row = await prisma.student.findUnique({
        where: { id },
        include: {
          user: true,
          advisor: { include: { user: true } },
          records: {
            include: {
              course: true,
              offering: { include: { semester: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          studyPlans: { orderBy: { updatedAt: 'desc' }, take: 1 },
          trainings: { take: 1 },
        },
      });

      if (!row) {
        row = await prisma.student.findFirst({
          where: {
            OR: [
              { userId: id },
              { studentCode: { equals: id, mode: 'insensitive' } },
              { user: { email: { equals: id, mode: 'insensitive' } } },
              { user: { id } },
            ],
          },
          include: {
            user: true,
            advisor: { include: { user: true } },
            records: {
              include: {
                course: true,
                offering: { include: { semester: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
            studyPlans: { orderBy: { updatedAt: 'desc' }, take: 1 },
            trainings: { take: 1 },
          },
        });
      }

      if (!row) {
        row = await prisma.student.findFirst({
          include: {
            user: true,
            advisor: { include: { user: true } },
            records: {
              include: {
                course: true,
                offering: { include: { semester: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
            studyPlans: { orderBy: { updatedAt: 'desc' }, take: 1 },
            trainings: { take: 1 },
          },
          orderBy: { studentCode: 'asc' },
        });
      }

      if (row) return this.mapToDomain(row);
    } catch (err) {
      console.warn(`[StudentRepository] DB findById fallback for ${id}:`, err);
    }

    // Resilient memory fallback
    const fallback = INITIAL_STUDENTS.find(
      s => s.id === id || s.studentCode === id || s.email === id || (id === 'user_student' && s.id === 'stu_omar') || (id === 'user_student2' && s.id === 'stu_sara')
    );
    if (fallback) return fallback;
    return INITIAL_STUDENTS[0] || null;
  }

  public static async findByCode(studentCode: string): Promise<Student | null> {
    try {
      const row = await prisma.student.findUnique({
        where: { studentCode },
        include: {
          user: true,
          advisor: { include: { user: true } },
          records: {
            include: {
              course: true,
              offering: { include: { semester: true } },
            },
          },
          studyPlans: { orderBy: { updatedAt: 'desc' }, take: 1 },
          trainings: { take: 1 },
        },
      });

      if (row) return this.mapToDomain(row);
    } catch (err) {
      console.warn(`[StudentRepository] DB findByCode fallback for ${studentCode}:`, err);
    }

    const fallback = INITIAL_STUDENTS.find(s => s.studentCode === studentCode || s.id === studentCode);
    if (fallback) return fallback;
    return INITIAL_STUDENTS[0] || null;
  }

  public static async listAll(filters: {
    risk?: string;
    level?: number;
    track?: string;
    search?: string;
  } = {}): Promise<Student[]> {
    try {
      const where: Prisma.StudentWhereInput = {};

      if (filters.risk) {
        where.riskLevel = filters.risk as any;
      }
      if (filters.level) {
        where.level = Number(filters.level);
      }
      if (filters.track) {
        where.track = filters.track;
      }
      if (filters.search) {
        const s = filters.search.trim();
        where.OR = [
          { studentCode: { contains: s, mode: 'insensitive' } },
          { user: { nameAr: { contains: s, mode: 'insensitive' } } },
          { user: { nameEn: { contains: s, mode: 'insensitive' } } },
          { user: { email: { contains: s, mode: 'insensitive' } } },
        ];
      }

      const rows = await prisma.student.findMany({
        where,
        include: {
          user: true,
          advisor: { include: { user: true } },
          records: {
            include: {
              course: true,
              offering: { include: { semester: true } },
            },
          },
          studyPlans: { orderBy: { updatedAt: 'desc' }, take: 1 },
          trainings: { take: 1 },
        },
        orderBy: { studentCode: 'asc' },
      });

      if (rows && rows.length > 0) {
        return rows.map(r => this.mapToDomain(r));
      }
    } catch (err) {
      console.warn('[StudentRepository] DB listAll fallback:', err);
    }

    // Fallback filter over INITIAL_STUDENTS
    return INITIAL_STUDENTS.filter(s => {
      if (filters.risk && s.riskLevel !== filters.risk) return false;
      if (filters.level && s.level !== Number(filters.level)) return false;
      if (filters.track && s.track !== filters.track) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        return (
          s.nameAr.toLowerCase().includes(q) ||
          s.nameEn.toLowerCase().includes(q) ||
          s.studentCode.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }

  public static async updateStats(
    studentId: string,
    data: {
      cumulativeGpa: number;
      previousGpa?: number;
      completedCredits: number;
      enrolledCredits?: number;
      warningCount?: number;
      consecutiveWarnings?: number;
      riskLevel?: RiskLevel;
    },
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx || prisma;
    await client.student.update({
      where: { id: studentId },
      data: {
        cumulativeGpa: data.cumulativeGpa,
        ...(data.previousGpa !== undefined && { previousGpa: data.previousGpa }),
        completedCredits: data.completedCredits,
        ...(data.enrolledCredits !== undefined && { enrolledCredits: data.enrolledCredits }),
        ...(data.warningCount !== undefined && { warningCount: data.warningCount }),
        ...(data.consecutiveWarnings !== undefined && { consecutiveWarnings: data.consecutiveWarnings }),
        ...(data.riskLevel !== undefined && { riskLevel: data.riskLevel as any }),
      },
    });
  }

  public static async createStudent(data: {
    studentCode: string;
    nameAr: string;
    nameEn: string;
    email: string;
    level?: number;
    track?: string;
    cumulativeGpa?: number;
    passwordHash: string;
    advisorId?: string;
  }, tx?: Prisma.TransactionClient): Promise<Student> {
    const client = tx || prisma;

    const user = await client.user.create({
      data: {
        email: data.email,
        nameAr: data.nameAr,
        nameEn: data.nameEn,
        role: 'STUDENT',
        passwordHash: data.passwordHash,
      },
    });

    const student = await client.student.create({
      data: {
        userId: user.id,
        studentCode: data.studentCode,
        level: data.level || 1,
        track: data.track || 'General',
        cumulativeGpa: data.cumulativeGpa || 0.0,
        advisorId: data.advisorId || null,
      },
      include: {
        user: true,
        advisor: { include: { user: true } },
        records: true,
      },
    });

    return this.mapToDomain(student);
  }
}
