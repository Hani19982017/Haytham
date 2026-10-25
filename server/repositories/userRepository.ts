import { prisma } from '../db/prisma.js';
import { UserRole } from '../../src/types/index.js';
import bcrypt from 'bcryptjs';

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

  public static async createUser(data: {
    email: string;
    nameAr: string;
    nameEn: string;
    role: UserRole;
    passwordHash: string;
    studentCode?: string;
    department?: string;
  }): Promise<UserDTO> {
    const email = data.email.toLowerCase().trim();
    const createdUser = await prisma.user.create({
      data: {
        email,
        nameAr: data.nameAr.trim(),
        nameEn: data.nameEn.trim(),
        role: data.role as any,
        passwordHash: data.passwordHash,
      },
    });

    // Create linked role record if applicable
    if (data.role === 'STUDENT') {
      const generatedCode = data.studentCode || `STU${Math.floor(100000 + Math.random() * 900000)}`;
      await prisma.student.create({
        data: {
          userId: createdUser.id,
          studentCode: generatedCode,
          level: 1,
          track: 'General',
          cumulativeGpa: 3.0,
          previousGpa: 3.0,
          completedCredits: 0,
          enrolledCredits: 15,
          warningCount: 0,
          consecutiveWarnings: 0,
          riskLevel: 'LOW',
        },
      });
    } else if (data.role === 'INSTRUCTOR') {
      await prisma.instructor.create({
        data: {
          userId: createdUser.id,
          department: data.department || 'Computer Science',
        },
      });
    } else if (data.role === 'ACADEMIC_ADVISOR') {
      await prisma.advisor.create({
        data: {
          userId: createdUser.id,
          office: 'Building B - Room 204',
        },
      });
    }

    const reloaded = await this.getById(createdUser.id);
    return reloaded || this.mapToDomain(createdUser);
  }

  public static async updateUser(id: string, data: {
    nameAr?: string;
    nameEn?: string;
    email?: string;
    role?: UserRole;
    password?: string;
  }): Promise<UserDTO | null> {
    const updateData: any = {};
    if (data.nameAr) updateData.nameAr = data.nameAr.trim();
    if (data.nameEn) updateData.nameEn = data.nameEn.trim();
    if (data.email) updateData.email = data.email.toLowerCase().trim();
    if (data.role) updateData.role = data.role as any;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    try {
      await prisma.user.update({
        where: { id },
        data: updateData,
      });
      return await this.getById(id);
    } catch (err) {
      console.error(`[UserRepository] updateUser error for ${id}:`, err);
      return null;
    }
  }

  public static async deleteUser(id: string): Promise<boolean> {
    try {
      await prisma.student.deleteMany({ where: { userId: id } });
      await prisma.advisor.deleteMany({ where: { userId: id } });
      await prisma.instructor.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
      return true;
    } catch (err) {
      console.error(`[UserRepository] deleteUser error for ${id}:`, err);
      return false;
    }
  }
}
