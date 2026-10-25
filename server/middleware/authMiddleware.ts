import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../../src/types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'university-secure-academic-secret-key-2026';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  nameAr: string;
  nameEn: string;
  studentId?: string;
  advisorId?: string;
  instructorId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT access tokens from Authorization header or cookie
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Check cookies fallback
  if (!token && (req as any).cookies?.accessToken) {
    token = (req as any).cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      messageAr: 'غير مصرح: يرجى تسجيل الدخول للوصول إلى هذا المورد.',
      messageEn: 'Unauthorized: Authentication token is required.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      role: decoded.role,
      nameAr: decoded.nameAr,
      nameEn: decoded.nameEn,
      studentId: decoded.studentId,
      advisorId: decoded.advisorId,
      instructorId: decoded.instructorId,
    };
    return next();
  } catch (err: any) {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      messageAr: 'رمز الجلسة غير صالح أو منتهي الصلاحية. يرجى إعادة تسجيل الدخول.',
      messageEn: 'Invalid or expired authentication token. Please login again.',
    });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware generator
 */
export function roleMiddleware(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        messageAr: 'يرجى تسجيل الدخول أولاً.',
        messageEn: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        messageAr: `غير مصرح: هذه العملية تتطلب صلاحيات (${allowedRoles.join(' أو ')}).`,
        messageEn: `Forbidden: This operation requires one of the following roles: [${allowedRoles.join(', ')}].`,
      });
    }

    return next();
  };
}

/**
 * Ownership check for students (allows Admin/Advisor or the student themselves)
 */
export function studentOwnershipMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  // Admins and Advisors have systemic access
  if (req.user.role === 'ADMIN' || req.user.role === 'ACADEMIC_ADVISOR' || req.user.role === 'DEPARTMENT_HEAD' || req.user.role === 'PROCESS_OFFICER') {
    return next();
  }

  const requestedStudentId = req.params.studentId || req.params.id;
  if (req.user.role === 'STUDENT' && req.user.studentId && requestedStudentId && req.user.studentId !== requestedStudentId) {
    return res.status(403).json({
      error: 'IDOR_FORBIDDEN',
      messageAr: 'غير مصرح: لا يمكنك الاطلاع على سجلات طالب آخر.',
      messageEn: 'Forbidden: Access to another student record is prohibited.',
    });
  }

  return next();
}
