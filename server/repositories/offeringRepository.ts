import { prisma } from '../db/prisma.js';
import { CourseOffering } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';
import { INITIAL_OFFERINGS } from '../data/store.js';

const WEEK_DAYS_AR: Array<[string, RegExp]> = [
  ['السبت', /السبت/],
  ['الأحد', /الأحد|الاحد/],
  ['الإثنين', /الإثنين|الاثنين/],
  ['الثلاثاء', /الثلاثاء/],
  ['الأربعاء', /الأربعاء|الاربعاء/],
  ['الخميس', /الخميس/],
];

/**
 * The database stores a section's schedule only as text ("الأحد والثلاثاء 10:00 - 11:30 ص").
 * Recover the structured days/start/end the conflict checker needs from that text.
 */
function parseScheduleText(textAr: string): { days?: string[]; startTime?: string; endTime?: string } {
  if (!textAr) return {};
  const days = WEEK_DAYS_AR.filter(([, re]) => re.test(textAr)).map(([name]) => name);
  const m = textAr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  // Lectures run 08:30–16:30, so an hour below 8 is in the afternoon.
  const to24 = (h: string, min: string) => {
    let hour = parseInt(h, 10);
    if (hour < 8) hour += 12;
    return `${String(hour).padStart(2, '0')}:${min}`;
  };
  return {
    days: days.length ? days : undefined,
    startTime: m ? to24(m[1], m[2]) : undefined,
    endTime: m ? to24(m[3], m[4]) : undefined,
  };
}

export class OfferingRepository {
  public static mapToDomain(row: any): CourseOffering {
    const instructorName = row.instructor?.user?.nameAr
      ? `${row.instructor.user.nameAr} (${row.instructor.user.nameEn})`
      : 'أستاذ المادة';

    const lectureDayTimeAr = row.scheduleAr || row.lectureDayTimeAr;
    const parsed = parseScheduleText(lectureDayTimeAr || '');
    const known = INITIAL_OFFERINGS.find(o => o.id === row.id);

    return {
      id: row.id,
      courseCode: row.course?.code || row.courseCode || '',
      sectionCode: row.sectionCode || known?.sectionCode,
      semesterId: row.semesterId,
      instructorId: row.instructorId,
      instructorName,
      capacity: row.capacity,
      enrolledCount: row.enrolledCount,
      lectureDayTimeAr,
      lectureDayTimeEn: row.scheduleEn || row.lectureDayTimeEn,
      // Structured timing for clash detection: the stored text wins, seed data fills gaps.
      days: parsed.days || row.days || known?.days,
      startTime: parsed.startTime || row.startTime || known?.startTime,
      endTime: parsed.endTime || row.endTime || known?.endTime,
      periods: row.periods || known?.periods,
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
