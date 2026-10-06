import { prisma } from '../db/prisma.js';
import { UserRole } from '../../src/types/index.js';

export interface UserDTO {
  id: string;
  email: string;
  nameAr: string;
  nameEn: string;
  role: UserRole;
  studentId?: string;
  advisorId?: string;
  instructorId?: string;
  passwordHash?: string;
}

export class UserRepository {
  public static mapToDomain(row: any): UserDTO {
    return {
      id: row.id,
      email: row.email,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      role: row.role as UserRole,
      studentId: row.student?.id,
      advisorId: row.advisor?.id,
      instructorId: row.instructor?.id,
      passwordHash: row.passwordHash,
    };
  }

  public static async listAll(): Promise<UserDTO[]> {
    const rows = await prisma.user.findMany({
      include: {
        student: true,
        advisor: true,
        instructor: true,
      },
      orderBy: { email: 'asc' },
    });
    return rows.map(r => this.mapToDomain(r));
  }

  public static async getByEmail(email: string): Promise<UserDTO | null> {
    const row = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        student: true,
        advisor: true,
        instructor: true,
      },
    });
    if (!row) return null;
    return this.mapToDomain(row);
  }

  public static async getById(id: string): Promise<UserDTO | null> {
    const row = await prisma.user.findUnique({
      where: { id },
      include: {
        student: true,
        advisor: true,
        instructor: true,
      },
    });
    if (!row) return null;
    return this.mapToDomain(row);
  }

  public static async updatePassword(email: string, passwordHash: string): Promise<boolean> {
    try {
      await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: { passwordHash },
      });
      return true;
    } catch {
      return false;
    }
  }
}
