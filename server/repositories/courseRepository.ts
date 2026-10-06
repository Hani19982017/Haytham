import { prisma } from '../db/prisma.js';
import { Course, AcademicTrack } from '../../src/types/index.js';

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
    const rows = await prisma.course.findMany({
      include: {
        prerequisites: true,
      },
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
    });

    return rows.map(r => this.mapToDomain(r));
  }

  public static async findByCode(code: string): Promise<Course | null> {
    const row = await prisma.course.findUnique({
      where: { code },
      include: {
        prerequisites: true,
      },
    });

    if (!row) return null;
    return this.mapToDomain(row);
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

    // Handle prerequisites update if provided
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

    return this.mapToDomain(await prisma.course.findUnique({
      where: { id: upserted.id },
      include: { prerequisites: true },
    }));
  }
}
