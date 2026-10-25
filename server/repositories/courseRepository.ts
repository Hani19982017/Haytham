import { prisma } from '../db/prisma.js';
import { Course, AcademicTrack } from '../../src/types/index.js';
import { INITIAL_COURSES } from '../data/store.js';

export class CourseRepository {
  public static mapToDomain(row: any): Course {
    const prerequisites: string[] = (row.prerequisites || []).map((p: any) => p.prereqCode);

    return {
      id: row.id,
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      credits: row.credits,
      level: row.level,
      semester: row.semester as 1 | 2,
      isMandatory: row.isMandatory,
      track: (row.track as AcademicTrack) || undefined,
      prerequisites,
      department: row.department,
      descriptionAr: row.descriptionAr || undefined,
      descriptionEn: row.descriptionEn || undefined,
    };
  }

  public static async listAll(): Promise<Course[]> {
    try {
      const rows = await prisma.course.findMany({
        include: {
          prerequisites: true,
        },
        orderBy: [{ level: 'asc' }, { code: 'asc' }],
      });

      if (rows && rows.length > 0) {
        return rows.map(r => this.mapToDomain(r));
      }
    } catch (err) {
      console.warn('[CourseRepository] DB listAll fallback to memory:', err);
    }

    return INITIAL_COURSES;
  }

  public static async getAll(): Promise<Course[]> {
    return this.listAll();
  }

  public static async findByCode(code: string): Promise<Course | null> {
    try {
      const row = await prisma.course.findUnique({
        where: { code },
        include: {
          prerequisites: true,
        },
      });

      if (row) return this.mapToDomain(row);
    } catch (err) {
      console.warn(`[CourseRepository] DB findByCode fallback for ${code}:`, err);
    }

    return INITIAL_COURSES.find(c => c.code === code) || null;
  }

  public static async upsertCourse(data: {
    code: string;
    nameAr: string;
    nameEn: string;
    credits: number;
    level: number;
    semester: number;
    isMandatory?: boolean;
    track?: string;
    department?: string;
    descriptionAr?: string;
    descriptionEn?: string;
    prerequisites?: string[];
  }): Promise<Course> {
    try {
      const upserted = await prisma.course.upsert({
        where: { code: data.code },
        update: {
          nameAr: data.nameAr,
          nameEn: data.nameEn,
          credits: data.credits,
          level: data.level,
          semester: data.semester,
          isMandatory: data.isMandatory ?? true,
          track: data.track || null,
          department: data.department || 'Computer Science',
          descriptionAr: data.descriptionAr || null,
          descriptionEn: data.descriptionEn || null,
        },
        create: {
          code: data.code,
          nameAr: data.nameAr,
          nameEn: data.nameEn,
          credits: data.credits,
          level: data.level,
          semester: data.semester,
          isMandatory: data.isMandatory ?? true,
          track: data.track || null,
          department: data.department || 'Computer Science',
          descriptionAr: data.descriptionAr || null,
          descriptionEn: data.descriptionEn || null,
        },
        include: {
          prerequisites: true,
        },
      });

      if (data.prerequisites && data.prerequisites.length > 0) {
        for (const prereqCode of data.prerequisites) {
          await prisma.prerequisite.upsert({
            where: {
              courseId_prereqCode: {
                courseId: upserted.id,
                prereqCode,
              },
            },
            update: {},
            create: {
              courseId: upserted.id,
              prereqCode,
            },
          });
        }
      }

      const reloaded = await prisma.course.findUnique({
        where: { id: upserted.id },
        include: { prerequisites: true },
      });
      if (reloaded) return this.mapToDomain(reloaded);
    } catch (err) {
      console.warn(`[CourseRepository] DB upsertCourse fallback for ${data.code}:`, err);
    }

    const memoryMatch = INITIAL_COURSES.find(c => c.code === data.code);
    if (memoryMatch) {
      memoryMatch.nameAr = data.nameAr;
      memoryMatch.nameEn = data.nameEn;
      memoryMatch.credits = data.credits;
      memoryMatch.level = data.level;
      memoryMatch.semester = data.semester as 1 | 2;
      return memoryMatch;
    }

    const newCourse: Course = {
      id: `c_${data.code.toLowerCase().replace(/\s+/g, '_')}`,
      code: data.code,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      credits: data.credits,
      level: data.level,
      semester: data.semester as 1 | 2,
      isMandatory: data.isMandatory ?? true,
      prerequisites: data.prerequisites || [],
      department: data.department || 'Computer Science',
    };
    INITIAL_COURSES.push(newCourse);
    return newCourse;
  }
}
