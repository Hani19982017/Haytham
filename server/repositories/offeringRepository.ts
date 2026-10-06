import { prisma } from '../db/prisma.js';
import { CourseOffering } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';

export class OfferingRepository {
  public static mapToDomain(row: any): CourseOffering {
    const instructorName = row.instructor?.user?.nameAr
      ? `${row.instructor.user.nameAr} (${row.instructor.user.nameEn})`
      : 'أستاذ المادة';

    return {
      id: row.id,
      courseCode: row.course?.code || '',
      semesterId: row.semesterId,
      instructorId: row.instructorId,
      instructorName,
      capacity: row.capacity,
      enrolledCount: row.enrolledCount,
      lectureDayTimeAr: row.scheduleAr,
      lectureDayTimeEn: row.scheduleEn,
      hall: row.hall,
    };
  }

  public static async listAll(): Promise<CourseOffering[]> {
    const rows = await prisma.courseOffering.findMany({
      include: {
        course: true,
        instructor: { include: { user: true } },
        semester: true,
      },
      orderBy: { course: { code: 'asc' } },
    });

    return rows.map(r => this.mapToDomain(r));
  }

  public static async findById(id: string): Promise<CourseOffering | null> {
    const row = await prisma.courseOffering.findUnique({
      where: { id },
      include: {
        course: true,
        instructor: { include: { user: true } },
        semester: true,
      },
    });

    if (!row) return null;
    return this.mapToDomain(row);
  }

  public static async findByCourseCode(courseCode: string): Promise<CourseOffering | null> {
    const row = await prisma.courseOffering.findFirst({
      where: { course: { code: courseCode } },
      include: {
        course: true,
        instructor: { include: { user: true } },
        semester: true,
      },
    });

    if (!row) return null;
    return this.mapToDomain(row);
  }

  public static async updateCapacity(id: string, newCapacity: number): Promise<CourseOffering> {
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
  }

  public static async incrementEnrolled(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx || prisma;
    await client.courseOffering.update({
      where: { id },
      data: { enrolledCount: { increment: 1 } },
    });
  }
}
