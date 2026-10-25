import { prisma } from '../db/prisma.js';
import { CourseOffering } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';
import { INITIAL_OFFERINGS } from '../data/store.js';

export class OfferingRepository {
  public static mapToDomain(row: any): CourseOffering {
    const instructorName = row.instructor?.user?.nameAr
      ? `${row.instructor.user.nameAr} (${row.instructor.user.nameEn})`
      : 'أستاذ المادة';

    return {
      id: row.id,
      courseCode: row.course?.code || row.courseCode || '',
      semesterId: row.semesterId,
      instructorId: row.instructorId,
      instructorName,
      capacity: row.capacity,
      enrolledCount: row.enrolledCount,
      lectureDayTimeAr: row.scheduleAr || row.lectureDayTimeAr,
      lectureDayTimeEn: row.scheduleEn || row.lectureDayTimeEn,
      hall: row.hall,
    };
  }

  public static async listAll(): Promise<CourseOffering[]> {
    try {
      const rows = await prisma.courseOffering.findMany({
        include: {
          course: true,
          instructor: { include: { user: true } },
          semester: true,
        },
        orderBy: { course: { code: 'asc' } },
      });

      if (rows && rows.length > 0) {
        return rows.map(r => this.mapToDomain(r));
      }
    } catch (err) {
      console.warn('[OfferingRepository] DB listAll fallback to memory:', err);
    }

    return INITIAL_OFFERINGS;
  }

  public static async getAll(): Promise<CourseOffering[]> {
    return this.listAll();
  }

  public static async findById(id: string): Promise<CourseOffering | null> {
    try {
      const row = await prisma.courseOffering.findUnique({
        where: { id },
        include: {
          course: true,
          instructor: { include: { user: true } },
          semester: true,
        },
      });

      if (row) return this.mapToDomain(row);
    } catch (err) {
      console.warn(`[OfferingRepository] DB findById fallback for ${id}:`, err);
    }

    return INITIAL_OFFERINGS.find(o => o.id === id) || null;
  }

  public static async findByCourseCode(courseCode: string): Promise<CourseOffering | null> {
    try {
      const row = await prisma.courseOffering.findFirst({
        where: { course: { code: courseCode } },
        include: {
          course: true,
          instructor: { include: { user: true } },
          semester: true,
        },
      });

      if (row) return this.mapToDomain(row);
    } catch (err) {
      console.warn(`[OfferingRepository] DB findByCourseCode fallback for ${courseCode}:`, err);
    }

    return INITIAL_OFFERINGS.find(o => o.courseCode === courseCode) || null;
  }

  public static async updateCapacity(id: string, newCapacity: number): Promise<CourseOffering> {
    try {
      const updated = await prisma.courseOffering.update({
        where: { id },
        data: { capacity: newCapacity },
        include: {
          course: true,
          instructor: { include: { user: true } },
          semester: true,
        },
      });

      return this.mapToDomain(updated);
    } catch (err) {
      console.warn(`[OfferingRepository] DB updateCapacity fallback for ${id}:`, err);
      const match = INITIAL_OFFERINGS.find(o => o.id === id);
      if (match) {
        match.capacity = newCapacity;
        return match;
      }
      return INITIAL_OFFERINGS[0];
    }
  }

  public static async incrementEnrolled(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      const client = tx || prisma;
      await client.courseOffering.update({
        where: { id },
        data: { enrolledCount: { increment: 1 } },
      });
    } catch {
      const match = INITIAL_OFFERINGS.find(o => o.id === id);
      if (match) match.enrolledCount = Math.min(match.capacity, match.enrolledCount + 1);
    }
  }
}
