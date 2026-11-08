import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import * as XLSX from 'xlsx';

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});
import { AcademicRulesEngine } from '../engines/rulesEngine.js';
import { RecommendationEngine } from '../engines/recommendationEngine.js';
import { StudyPlanner } from '../engines/studyPlanner.js';
import { GpaImprovementPlanner } from '../engines/gpaPlanner.js';
import { AcademicRiskEngine } from '../engines/riskEngine.js';
import { getGradePoints } from '../engines/gpaEngine.js';
import { Course, CourseOffering, Student, UserRole } from '../../src/types/index.js';
import { UniversityAuthService } from '../auth/authService.js';
import { EnterpriseAIService } from '../engines/aiService.js';
import { IbnAlHaythamDataProvider } from '../integration/ibnAlHaitham.js';
import { BackgroundQueueService } from '../jobs/queueService.js';
import { UniversityReportService } from '../reports/reportService.js';
import { openApiSpec } from '../docs/openapi.js';

// PostgreSQL Repositories & Database
import { prisma, checkDatabaseConnection } from '../db/prisma.js';
import { UserRepository } from '../repositories/userRepository.js';
import { StudentRepository } from '../repositories/studentRepository.js';
import { CourseRepository } from '../repositories/courseRepository.js';
import { OfferingRepository } from '../repositories/offeringRepository.js';
import { AcademicRuleRepository } from '../repositories/academicRuleRepository.js';
import { AuditLogRepository } from '../repositories/auditLogRepository.js';
import { NotificationRepository } from '../repositories/notificationRepository.js';
import { StudyPlanRepository } from '../repositories/studyPlanRepository.js';
import { AcademicTransactionService } from '../services/academicTransactionService.js';
import { RegistrationAdvisorEngine } from '../engines/registrationAdvisorEngine.js';
import { INITIAL_STUDENTS } from '../data/store.js';
import { createAttendanceRouter } from './attendance.js';
import { RegistrationRequestRepository } from '../repositories/registrationRequestRepository.js';

export const apiRouter = Router();

// Standard demo identity catalog for auth resolution
const USERS: Array<{
  id: string;
  email: string;
  nameAr: string;
  nameEn: string;
  role: UserRole;
  studentId?: string;
  advisorId?: string;
  instructorId?: string;
}> = [
  {
    id: 'user_admin',
    email: 'admin@example.com',
    nameAr: 'أ. د. عميد الكلية والمسؤول الأكاديمي',
    nameEn: 'Dean & Academic Administrator',
    role: 'ADMIN',
  },
  {
    id: 'user_advisor',
    email: 'advisor@example.com',
    nameAr: 'د. محمود صقر (المرشد الأكاديمي)',
    nameEn: 'Dr. Mahmoud Saqr (Academic Advisor)',
    role: 'ACADEMIC_ADVISOR',
    advisorId: 'adv_dr_mahmoud',
  },
  {
    id: 'user_instructor',
    email: 'instructor@example.com',
    nameAr: 'أ.د. عادل منصور (أستاذ المادة)',
    nameEn: 'Prof. Adel Mansour (Course Instructor)',
    role: 'INSTRUCTOR',
    instructorId: 'inst_dr_adel',
  },
  {
    id: 'user_student',
    email: 'student@example.com',
    nameAr: 'عمر فاروق عبد الرحمن (طالب - تحت الإنذار)',
    nameEn: 'Omar Farouk (Student - At Risk)',
    role: 'STUDENT',
    studentId: 'stu_omar',
  },
  {
    id: 'user_student2',
    email: 'student2@example.com',
    nameAr: 'سارة أحمد الكردي (طالبة - متفوقة)',
    nameEn: 'Sara Ahmed (Honors Student)',
    role: 'STUDENT',
    studentId: 'stu_sara',
  },
  {
    id: 'user_process',
    email: 'process@example.com',
    nameAr: 'أستاذ سامي الديب (مسؤول شؤون الطلاب - اطلاع فقط)',
    nameEn: 'Sami El-Deeb (Process Officer - Read Only)',
    role: 'PROCESS_OFFICER',
  },
  {
    id: 'user_head',
    email: 'head@example.com',
    nameAr: 'أ.د. طارق السعدني (رئيس قسم علوم الحاسب)',
    nameEn: 'Prof. Tariq El-Saadani (Department Head)',
    role: 'DEPARTMENT_HEAD',
  },
  {
    id: 'user_freshman',
    email: 'freshman@example.com',
    nameAr: 'مازن خالد عبد الله (طالب مستجد)',
    nameEn: 'Mazen Khaled (New Student)',
    role: 'STUDENT',
    studentId: 'stu_freshman',
  },
  {
    id: 'user_ta',
    email: 'ta@example.com',
    nameAr: 'م. أحمد سمير (معيد)',
    nameEn: 'Eng. Ahmed Samir (Teaching Assistant)',
    role: 'TEACHING_ASSISTANT',
    instructorId: 'inst_ta_ahmed',
  },
];

// Helper: Append immutable audit log to PostgreSQL
async function addAuditLog(
  userId: string,
  userName: string,
  userRole: UserRole,
  action: string,
  entity: string,
  entityId: string,
  detailsAr: string,
  detailsEn: string,
  before?: any,
  after?: any
) {
  try {
    await AuditLogRepository.createLog({
      userId,
      userName,
      userRole,
      action,
      entity,
      entityId,
      detailsAr,
      detailsEn,
      before,
      after,
    });
  } catch (err) {
    console.warn('[AuditLog] Failed to persist audit log into PostgreSQL:', err);
  }
}

// Display name without the demo-account label, e.g. "عمر فاروق (طالب - تحت الإنذار)" → "عمر فاروق".
const plainName = (raw?: string) => (raw || '').split('(')[0].trim() || raw || '';

// Security: Resolve calling user from headers
function getCaller(req: Request): any {
  const userIdHeader = req.headers['x-user-id'] as string;
  if (userIdHeader) {
    const found = USERS.find(u => u.id === userIdHeader || u.email === userIdHeader || u.studentId === userIdHeader);
    if (found) return found;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = UniversityAuthService.verifyAccessToken(token);
      if (decoded && (decoded.sub || decoded.email)) {
        const match = USERS.find(u => u.id === decoded.sub || u.email === decoded.email);
        if (match) return match;
        return {
          id: decoded.sub || 'user_unknown',
          email: decoded.email || '',
          nameAr: decoded.nameAr || decoded.email || 'مستخدم معتمد',
          nameEn: decoded.nameEn || decoded.email || 'Authenticated User',
          role: decoded.role || 'STUDENT',
          studentId: decoded.studentId,
          advisorId: decoded.advisorId,
          instructorId: decoded.instructorId,
        };
      }
    } catch {
      // ignore decoding error and fall through
    }
    const match = USERS.find(u => token.includes(u.id));
    if (match) return match;
  }
  return null;
}

// Global RBAC middleware: Enforce Process Officer read-only policy.
// Signing in/out and marking one's own notifications as read are not data changes.
apiRouter.use((req: Request, res: Response, next) => {
  const caller = getCaller(req);
  const isPersonalAction = req.path.startsWith('/auth/') || req.path.startsWith('/notifications');
  if (caller && caller.role === 'PROCESS_OFFICER' && req.method !== 'GET' && !isPersonalAction) {
    return res.status(403).json({
      error: 'FORBIDDEN_READ_ONLY',
      messageAr: 'مسؤول شؤون الطلاب لديه صلاحية قراءة واطلاع فقط، ولا يجوز له إجراء تعديلات أو عمليات تسجيل.',
      messageEn: 'Process Officer has strictly read-only access and cannot perform modifications.',
    });
  }
  next();
});

// QR / manual attendance (instructors, teaching assistants and students)
apiRouter.use('/attendance', createAttendanceRouter(getCaller));

// -------------------------------------------------------------
// 1. AUTHENTICATION & IDENTITY (Enterprise Credentials + JWT)
// -------------------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    if (password) {
      // Production path: verify password with bcrypt and return signed JWT tokens
      const { user, tokens } = await UniversityAuthService.authenticate(email, password);
      await addAuditLog(
        user.id,
        user.nameAr,
        user.role,
        'LOGIN_CREDENTIALS',
        'UserSession',
        user.id,
        `تسجيل دخول رسمي ببيانات الاعتماد المشفرة للمستخدم (${user.nameAr}).`,
        `Cryptographic credential login for user (${user.nameEn}).`
      );

      // Set httpOnly cookie for refresh token
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user,
      });
    }

    // Demo/Development fallback path
    const user = USERS.find(u => u.email.toLowerCase() === (email || '').toLowerCase()) || USERS[3];
    const tokens = UniversityAuthService.generateTokens({
      ...user,
      passwordHash: '',
      isActive: true,
      failedLoginAttempts: 0,
    });

    await addAuditLog(
      user.id,
      user.nameAr,
      user.role,
      'LOGIN',
      'UserSession',
      user.id,
      `تسجيل دخول للمستخدم (${user.nameAr}) بدور (${user.role}).`,
      `Login for user (${user.nameEn}) with role (${user.role}).`
    );

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user,
    });
  } catch (err: any) {
    return res.status(401).json({
      error: 'AUTH_FAILED',
      messageAr: err.message || 'بيانات الدخول غير صحيحة',
      messageEn: 'Authentication failed: Invalid credentials',
    });
  }
});

apiRouter.post('/auth/refresh', async (req: Request, res: Response) => {
  const refreshToken = (req as any).cookies?.refreshToken || req.body?.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({
      error: 'NO_REFRESH_TOKEN',
      messageAr: 'لم يتم العثور على رمز التجديد.',
      messageEn: 'Refresh token is required.',
    });
  }

  try {
    const tokens = UniversityAuthService.refreshTokens(refreshToken);
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (err: any) {
    return res.status(401).json({
      error: 'INVALID_REFRESH_TOKEN',
      messageAr: err.message || 'انتهت صلاحية الجلسة.',
      messageEn: 'Invalid or expired refresh token.',
    });
  }
});

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (!caller) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      messageAr: 'غير مصرح: يرجى تسجيل الدخول.',
      messageEn: 'Unauthorized: Authentication required.',
    });
  }
  return res.json({ user: caller });
});

apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller) {
    await addAuditLog(
      caller.id,
      caller.nameAr,
      caller.role,
      'LOGOUT',
      'UserSession',
      caller.id,
      `تسجيل خروج آمن للمستخدم (${caller.nameAr}).`,
      `Secure logout for user (${caller.nameEn}).`
    );
  }
  res.clearCookie('refreshToken');
  return res.json({ success: true, message: 'Logged out successfully' });
});

apiRouter.post('/auth/password-reset', async (req: Request, res: Response) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword || newPassword.length < 6) {
    return res.status(400).json({
      error: 'INVALID_PASSWORD',
      messageAr: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.',
      messageEn: 'New password must be at least 6 characters.',
    });
  }

  const success = await UniversityAuthService.resetPassword(email, newPassword);
  if (!success) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({
    success: true,
    messageAr: 'تم تعيين كلمة المرور بنجاح وتشفيرها.',
    messageEn: 'Password reset and cryptographically hashed successfully.',
  });
});

apiRouter.get('/auth/users', async (req: Request, res: Response) => {
  try {
    const dbUsers = await UserRepository.listAll();
    if (dbUsers.length > 0) {
      return res.json(dbUsers);
    }
  } catch (err) {
    console.warn('[UserRepository] Falling back to default identity list:', err);
  }
  return res.json(USERS);
});

// Full RESTful Users management for Admin
apiRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const caller = getCaller(req);
    // Allow admin, advisors, department heads to view users directory
    const dbUsers = await UserRepository.listAll();
    if (dbUsers.length > 0) {
      return res.json(dbUsers);
    }
    return res.json(USERS);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const caller = getCaller(req);
    if (caller && caller.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        messageAr: 'غير مصرح: إضافة المستخدمين تقتصر على الآدمن فقط.',
        messageEn: 'Unauthorized: Creating new users requires Admin privileges.',
      });
    }

    const { email, password, nameAr, nameEn, role, studentCode, department } = req.body;

    if (!email || !password || !nameAr || !role) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        messageAr: 'يرجى ملء جميع الحقول المطلوبة (البريد، كلمة المرور، الاسم، والدور).',
        messageEn: 'All required fields (email, password, name, and role) must be provided.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        messageAr: 'كلمة المرور يجب أن تتكون من 6 أحرف على الأقل.',
        messageEn: 'Password must be at least 6 characters.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await UserRepository.getByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({
        error: 'USER_ALREADY_EXISTS',
        messageAr: 'هذا البريد الإلكتروني مسجل بالفعل لمستخدم آخر.',
        messageEn: 'This email is already registered to another user.',
      });
    }

    // Cryptographic Bcrypt hash (10 salt rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await UserRepository.createUser({
      email: cleanEmail,
      nameAr,
      nameEn: nameEn || nameAr,
      role,
      passwordHash,
      studentCode,
      department,
    });

    // Immutable Audit Log entry
    await addAuditLog(
      caller?.id || 'admin',
      caller?.nameAr || 'الآدمن',
      caller?.role || 'ADMIN',
      'CREATE_USER',
      'User',
      newUser.id,
      `إضافة مستخدم جديد بنجاح (${newUser.nameAr}) بالدور [${newUser.role}] والبريد [${newUser.email}].`,
      `Successfully created new user (${newUser.nameEn}) with role [${newUser.role}].`,
      undefined,
      { id: newUser.id, email: newUser.email, role: newUser.role, nameAr: newUser.nameAr }
    );

    return res.status(201).json({
      success: true,
      user: newUser,
      messageAr: 'تم إنشاء المستخدم وحفظه وتشفير كلمة المرور بنجاح.',
      messageEn: 'User created and password securely hashed with Bcrypt.',
    });
  } catch (err: any) {
    console.error('Error in POST /users:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const caller = getCaller(req);
    if (caller && caller.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        messageAr: 'غير مصرح: تعديل بيانات المستخدمين تقتصر على الآدمن فقط.',
        messageEn: 'Unauthorized: Editing users requires Admin privileges.',
      });
    }

    const { id } = req.params;
    const { nameAr, nameEn, email, role, password } = req.body;

    const updated = await UserRepository.updateUser(id, {
      nameAr,
      nameEn,
      email,
      role,
      password: password && password.trim().length >= 6 ? password : undefined,
    });

    if (!updated) {
      // In-memory update fallback for predefined USERS
      const idx = USERS.findIndex(u => u.id === id || u.email === id);
      if (idx !== -1) {
        if (nameAr) USERS[idx].nameAr = nameAr;
        if (nameEn) USERS[idx].nameEn = nameEn;
        if (email) USERS[idx].email = email;
        if (role) USERS[idx].role = role;
        return res.json({
          success: true,
          user: USERS[idx],
          messageAr: 'تم تحديث بيانات المستخدم بنجاح.',
          messageEn: 'User details updated successfully.',
        });
      }
      return res.status(404).json({ error: 'User not found' });
    }

    await addAuditLog(
      caller?.id || 'admin',
      caller?.nameAr || 'الآدمن',
      caller?.role || 'ADMIN',
      'UPDATE_USER',
      'User',
      id,
      `تعديل بيانات المستخدم (${updated.nameAr}) بنجاح.`,
      `Updated details for user (${updated.nameEn}).`
    );

    return res.json({
      success: true,
      user: updated,
      messageAr: 'تم تحديث بيانات المستخدم بنجاح في قاعدة البيانات.',
      messageEn: 'User updated successfully.',
    });
  } catch (err: any) {
    console.error('Error in PUT /users/:id:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const caller = getCaller(req);
    if (caller && caller.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        messageAr: 'غير مصرح: حذف المستخدمين يقتصر على الآدمن فقط.',
        messageEn: 'Unauthorized: Deleting users requires Admin privileges.',
      });
    }

    const { id } = req.params;

    if (caller && (caller.id === id || caller.email === id)) {
      return res.status(400).json({
        error: 'CANNOT_DELETE_SELF',
        messageAr: 'لا يمكن حذف الحساب الإداري الحالي المسجل الدخول به.',
        messageEn: 'Cannot delete the currently active admin account.',
      });
    }

    const deleted = await UserRepository.deleteUser(id);

    // Also remove from in-memory USERS array if exists
    const uIdx = USERS.findIndex(u => u.id === id || u.email === id);
    if (uIdx !== -1) {
      USERS.splice(uIdx, 1);
    }

    await addAuditLog(
      caller?.id || 'admin',
      caller?.nameAr || 'الآدمن',
      caller?.role || 'ADMIN',
      'DELETE_USER',
      'User',
      id,
      `حذف المستخدم ذي المعرف (${id}) نهائياً من النظام.`,
      `Deleted user (${id}) from database.`
    );

    return res.json({
      success: true,
      messageAr: 'تم حذف المستخدم نهائياً من النظام وقاعدة البيانات.',
      messageEn: 'User deleted successfully.',
    });
  } catch (err: any) {
    console.error('Error in DELETE /users/:id:', err);
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const caller = getCaller(req);
    if (caller && caller.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        messageAr: 'غير مصرح: إعادة تعيين كلمات المرور تقتصر على الآدمن.',
        messageEn: 'Unauthorized: Resetting passwords requires Admin privileges.',
      });
    }

    const { id } = req.params;
    const { newPassword } = req.body;
    const passwordToSet = newPassword || 'password123';

    const passwordHash = await bcrypt.hash(passwordToSet, 10);
    const user = await UserRepository.getById(id);

    if (user) {
      await UserRepository.updatePassword(user.email, passwordHash);
    }

    await addAuditLog(
      caller?.id || 'admin',
      caller?.nameAr || 'الآدمن',
      caller?.role || 'ADMIN',
      'RESET_PASSWORD',
      'User',
      id,
      `إعادة تعيين كلمة المرور للمستخدم (${user?.nameAr || id}) وتشفيرها بـ Bcrypt.`,
      `Reset password for user (${id}).`
    );

    return res.json({
      success: true,
      messageAr: `تم إعادة تعيين كلمة المرور بنجاح إلى (${passwordToSet}) وتشفيرها.`,
      messageEn: `Password successfully reset to (${passwordToSet}).`,
    });
  } catch (err: any) {
    console.error('Error in POST /users/:id/reset-password:', err);
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. COURSES & OFFERINGS (PostgreSQL-authoritative)
// -------------------------------------------------------------
apiRouter.get('/courses', async (req: Request, res: Response) => {
  try {
    const courses = await CourseRepository.listAll();
    const unlockMap = RecommendationEngine.calculateUnlockGraph(courses);
    const enriched = courses.map(c => ({
      ...c,
      unlockedCoursesCount: unlockMap.get(c.code) || 0,
    }));
    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/courses', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller && caller.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'ROLE_FORBIDDEN',
      messageAr: 'غير مصرح: تعديل بيانات المقررات مقتصر على مدير النظام.',
      messageEn: 'Unauthorized: Modifying courses requires Administrator privileges.',
    });
  }

  const newCourse = req.body as Course;
  if (!newCourse.code || !newCourse.nameAr) {
    return res.status(400).json({ error: 'Course code and name are required' });
  }

  try {
    const saved = await CourseRepository.upsertCourse({
      code: newCourse.code,
      nameAr: newCourse.nameAr,
      nameEn: newCourse.nameEn,
      credits: newCourse.credits,
      level: newCourse.level,
      semester: newCourse.semester,
      isMandatory: newCourse.isMandatory,
      track: newCourse.track,
      department: newCourse.department,
      descriptionAr: newCourse.descriptionAr,
      descriptionEn: newCourse.descriptionEn,
      prerequisites: newCourse.prerequisites,
    });

    await addAuditLog(
      caller?.id || 'user_admin',
      caller?.nameAr || 'مدير النظام',
      caller?.role || 'ADMIN',
      'COURSE_SAVED',
      'Course',
      newCourse.code,
      `إضافة أو تعديل بيانات المقرر ${newCourse.code} في اللائحة الأكاديمية بقاعدة بيانات PostgreSQL.`,
      `Added/updated course ${newCourse.code} in PostgreSQL academic catalog.`
    );

    return res.json({ success: true, course: saved });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/offerings', async (req: Request, res: Response) => {
  try {
    const offerings = await OfferingRepository.listAll();
    return res.json(offerings);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/offerings/:id/capacity', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller && caller.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'ROLE_FORBIDDEN',
      messageAr: 'غير مصرح: تعديل سعة الشعب مقتصر على مدير النظام.',
      messageEn: 'Unauthorized: Updating offering capacity requires Administrator privileges.',
    });
  }

  const { id } = req.params;
  const { capacity } = req.body;

  try {
    const off = await OfferingRepository.findById(id);
    if (!off) return res.status(404).json({ error: 'Offering not found' });

    const oldCapacity = off.capacity;
    const updated = await OfferingRepository.updateCapacity(id, Number(capacity));

    await addAuditLog(
      caller?.id || 'user_admin',
      caller?.nameAr || 'مدير النظام',
      caller?.role || 'ADMIN',
      'UPDATE_CAPACITY',
      'CourseOffering',
      off.courseCode,
      `تعديل سعة شعبة المقرر ${off.courseCode} من ${oldCapacity} إلى ${updated.capacity} مقعداً في PostgreSQL.`,
      `Updated capacity for ${off.courseCode} from ${oldCapacity} to ${updated.capacity} in PostgreSQL.`,
      { capacity: oldCapacity },
      { capacity: updated.capacity }
    );

    return res.json({ success: true, offering: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. STUDENTS & INDIVIDUAL VIEWS (PostgreSQL-authoritative)
// -------------------------------------------------------------
apiRouter.get('/students', async (req: Request, res: Response) => {
  const { risk, level, track, search } = req.query;

  try {
    let filtered = await StudentRepository.listAll({
      risk: risk ? String(risk) : undefined,
      level: level ? Number(level) : undefined,
      track: track ? String(track) : undefined,
      search: search ? String(search) : undefined,
    });

    // Recalculate dynamic risk on read
    filtered = filtered.map(st => {
      const riskEval = AcademicRiskEngine.evaluateRisk(st);
      return {
        ...st,
        riskLevel: riskEval.level,
        riskReasons: riskEval.reasonsAr,
      };
    });

    return res.json(filtered);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Unified IDOR protection for all student scoped routes
apiRouter.use('/students/:id', (req: Request, res: Response, next) => {
  const caller = getCaller(req);
  if (caller && caller.role === 'STUDENT') {
    const reqId = req.params.id;
    const isOwner = (
      reqId === 'me' ||
      reqId === caller.studentId ||
      reqId === caller.id ||
      reqId === caller.email ||
      (caller.email === 'student@example.com' && (reqId === 'stu_omar' || reqId === 'user_student')) ||
      (caller.email === 'student2@example.com' && (reqId === 'stu_sara' || reqId === 'user_student2'))
    );
    if (!isOwner) {
      return res.status(403).json({
        error: 'IDOR_FORBIDDEN',
        messageAr: 'غير مصرح: لا يجوز للطالب الاطلاع أو التعديل على سجلات طالب آخر.',
        messageEn: 'Unauthorized: Students can only view or modify their own academic record.',
      });
    }
  }
  next();
});

apiRouter.get('/students/:id', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const riskEval = AcademicRiskEngine.evaluateRisk(student);
    const statusEval = AcademicRulesEngine.evaluateStudentStatus(student);

    return res.json({
      ...student,
      riskLevel: riskEval.level,
      riskReasons: riskEval.reasonsAr,
      riskDetails: riskEval,
      academicStatus: statusEval,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Student AI Recommendations
apiRouter.get('/students/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const courses = await CourseRepository.listAll();
    const offerings = await OfferingRepository.listAll();
    const recs = RecommendationEngine.generateRecommendations(student, courses, offerings);
    return res.json(recs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Student Study Plan
apiRouter.get('/students/:id/study-plan', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const pace = (req.query.pace as any) || 'NORMAL';
    const forceRegenerate = req.query.regenerate === 'true';

    // If pace is requested or forceRegenerate is true or saved plan has fewer than 3 semesters, regenerate dynamic plan
    if (!forceRegenerate && (!req.query.pace || req.query.pace === 'NORMAL')) {
      const savedPlan = await StudyPlanRepository.getByStudentId(student.id);
      if (savedPlan && savedPlan.semesters && savedPlan.semesters.length > 2) {
        return res.json(savedPlan);
      }
    }

    const courses = await CourseRepository.listAll();
    const plan = StudyPlanner.generatePlan(student, courses, { pace });
    return res.json(plan);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Submit / Update Study Plan
apiRouter.post('/students/:id/study-plan/submit', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const pace = (req.body?.pace as any) || 'NORMAL';
    const courses = await CourseRepository.listAll();
    const plan = req.body?.plan || StudyPlanner.generatePlan(student, courses, { pace });
    plan.status = 'Pending Review';
    await StudyPlanRepository.savePlan(student.id, plan, 'PENDING_REVIEW');

    await NotificationRepository.createNotification({
      recipientId: student.advisorId || 'user_advisor',
      type: 'APPROVAL',
      titleAr: 'طلب مراجعة واعتماد خطة دراسية جديدة',
      titleEn: 'Study Plan Approval Request',
      messageAr: `خطة دراسية جديدة من ${plainName(student.nameAr)} (${student.studentCode}) بانتظار مراجعتك واعتمادك.`,
      messageEn: `${plainName(student.nameEn)} (${student.studentCode}) submitted a study plan for your review.`,
    });

    await addAuditLog(
      student.id,
      student.nameAr,
      'STUDENT',
      'SUBMIT_PLAN',
      'StudyPlan',
      student.id,
      `إرسال الخطة الدراسية إلى المرشد الأكاديمي (${student.advisorName}) للمراجعة والاعتماد.`,
      `Submitted study plan to advisor (${student.advisorName}) for review.`
    );

    return res.json({ success: true, status: 'Pending Review', plan });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Reset Study Plan to Draft for Student Editing
apiRouter.post('/students/:id/study-plan/reset', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const pace = (req.body?.pace as any) || 'NORMAL';
    const courses = await CourseRepository.listAll();
    const plan = StudyPlanner.generatePlan(student, courses, { pace });
    plan.status = 'Draft';
    await StudyPlanRepository.savePlan(student.id, plan, 'DRAFT');

    return res.json({ success: true, status: 'Draft', plan });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Student GPA Improvement Plans
apiRouter.get('/students/:id/gpa-plans', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const courses = await CourseRepository.listAll();
    const plans = GpaImprovementPlanner.generatePlans(student, courses);
    return res.json(plans);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// What-If Simulator (Strictly transactional & sandboxed: live database remains 100% untouched)
apiRouter.post('/students/:id/what-if', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const courses = await CourseRepository.listAll();
    const items = (req.body.items || []) as { courseCode: string; projectedGrade: string }[];

    const courseMap = new Map<string, Course>(courses.map(c => [c.code, c]));
    let simulatedPoints = student.cumulativeGpa * student.completedCredits;
    let simulatedCredits = student.completedCredits;
    let simulatedTermPoints = 0;
    let simulatedTermCredits = 0;

    for (const item of items) {
      const course = courseMap.get(item.courseCode);
      const credits = course ? course.credits : 3;
      const gradePoints = getGradePoints(item.projectedGrade);

      const existingPassed = student.records.find(r => r.courseCode === item.courseCode && r.status === 'PASSED');
      const existingFailed = student.records.find(r => r.courseCode === item.courseCode && r.status === 'FAILED');

      if (existingPassed) {
        const oldPoints = (existingPassed.gradePoints || 0) * credits;
        simulatedPoints = simulatedPoints - oldPoints + (gradePoints * credits);
      } else if (existingFailed) {
        simulatedPoints += gradePoints * credits;
        simulatedCredits += credits;
      } else {
        simulatedPoints += gradePoints * credits;
        simulatedCredits += credits;
      }

      simulatedTermPoints += gradePoints * credits;
      simulatedTermCredits += credits;
    }

    const newCumulativeGpa = simulatedCredits > 0 ? Math.round((simulatedPoints / simulatedCredits) * 100) / 100 : 0;
    const semesterGpa = simulatedTermCredits > 0 ? Math.round((simulatedTermPoints / simulatedTermCredits) * 100) / 100 : 0;
    const remainingCredits = Math.max(0, 134 - simulatedCredits);
    const degreeProgress = Math.min(100, Math.round((simulatedCredits / 134) * 100));

    let projectedRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (newCumulativeGpa < 1.5) projectedRisk = 'CRITICAL';
    else if (newCumulativeGpa < 2.0) projectedRisk = 'HIGH';
    else if (newCumulativeGpa < 2.3) projectedRisk = 'MEDIUM';

    return res.json({
      originalGpa: student.cumulativeGpa,
      newCumulativeGpa,
      semesterGpa,
      originalCredits: student.completedCredits,
      simulatedCredits,
      remainingCredits,
      degreeProgress,
      projectedRisk,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Course Registration Validation & Submission (Real PostgreSQL Transaction)
apiRouter.post('/students/:id/register', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller && caller.role === 'STUDENT' && caller.studentId && caller.studentId !== req.params.id) {
    return res.status(403).json({
      error: 'IDOR_FORBIDDEN',
      messageAr: 'غير مصرح: لا يمكنك تسجيل مقررات لطالب آخر.',
      messageEn: 'Unauthorized: Students cannot register courses for other students.',
    });
  }

  const { courseCodes, isSummer } = req.body;
  if (!Array.isArray(courseCodes)) {
    return res.status(400).json({ error: 'courseCodes must be an array' });
  }

  try {
    const result = await AcademicTransactionService.registerCourses(
      req.params.id,
      courseCodes,
      !!isSummer,
      caller || undefined
    );

    if (!result.success) {
      return res.status(422).json({
        success: false,
        messageAr: 'تم رفض طلب التسجيل لتعارضه مع اللائحة الأكاديمية.',
        messageEn: 'Registration rejected due to academic bylaw violations.',
        validation: result.validation,
      });
    }

    return res.json({
      success: true,
      messageAr: 'تم تسجيل المقررات بنجاح واعتمادها وفق اللائحة وحفظها في قاعدة بيانات PostgreSQL.',
      messageEn: 'Courses successfully registered according to bylaws and persisted in PostgreSQL.',
      validation: result.validation,
      enrolledCredits: result.updatedStudent?.enrolledCredits,
      student: result.updatedStudent,
    });
  } catch (err: any) {
    return res.status(err.message?.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// INTELLIGENT REGISTRATION ADVISOR ENDPOINTS
// -------------------------------------------------------------

// 1. Get AI Recommended Semester Schedule BEFORE Registration
apiRouter.get('/students/:id/registration-recommendation', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const allCourses = await CourseRepository.getAll();
    const allOfferings = await OfferingRepository.getAll();
    const isSummer = req.query.isSummer === 'true';

    const recommendation = RegistrationAdvisorEngine.generateSemesterRecommendation(
      student,
      allCourses,
      allOfferings,
      isSummer
    );

    return res.json(recommendation);
  } catch (err: any) {
    console.error('Error generating registration recommendation:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Real-Time Proposed Schedule Validation (Conflicts, Prereqs, Limits, Retakes, Capacity)
apiRouter.post('/students/:id/validate-registration', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { offeringIds, courseCodes, isSummer } = req.body;
    const allCourses = await CourseRepository.getAll();
    const allOfferings = await OfferingRepository.getAll();
    const offeringMap = new Map<string, CourseOffering>(allOfferings.map(o => [o.id, o]));
    const offeringByCourse = new Map<string, CourseOffering>(allOfferings.map(o => [o.courseCode, o]));

    // Resolve selected offerings
    let selectedOfferings: CourseOffering[] = [];
    if (Array.isArray(offeringIds) && offeringIds.length > 0) {
      selectedOfferings = offeringIds
        .map((id: string) => offeringMap.get(id))
        .filter((o): o is CourseOffering => !!o);
    } else if (Array.isArray(courseCodes) && courseCodes.length > 0) {
      selectedOfferings = courseCodes
        .map((code: string) => offeringByCourse.get(code))
        .filter((o): o is CourseOffering => !!o);
    }

    const validation = RegistrationAdvisorEngine.validateProposedRegistration(
      student,
      selectedOfferings,
      allCourses,
      allOfferings,
      !!isSummer
    );

    return res.json(validation);
  } catch (err: any) {
    console.error('Error validating registration schedule:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. Automatic Conflict Resolution ("Fix My Schedule")
apiRouter.post('/students/:id/resolve-schedule-conflicts', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { courseCodes, currentOfferingIds } = req.body;
    if (!Array.isArray(courseCodes) || courseCodes.length === 0) {
      return res.status(400).json({ error: 'courseCodes array is required' });
    }

    const allCourses = await CourseRepository.getAll();
    const allOfferings = await OfferingRepository.getAll();
    const offeringMap = new Map<string, CourseOffering>(allOfferings.map(o => [o.id, o]));

    const currentOfferings = (currentOfferingIds || [])
      .map((id: string) => offeringMap.get(id))
      .filter((o: any): o is CourseOffering => !!o);

    const result = RegistrationAdvisorEngine.resolveScheduleConflicts(
      courseCodes,
      currentOfferings,
      allOfferings,
      allCourses
    );

    return res.json(result);
  } catch (err: any) {
    console.error('Error resolving schedule conflicts:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. What-If Schedule Sandbox (Never modifies real record)
apiRouter.post('/students/:id/what-if-schedule', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { currentCourseCodes, action } = req.body;
    if (!Array.isArray(currentCourseCodes) || !action) {
      return res.status(400).json({ error: 'currentCourseCodes and action object are required' });
    }

    const allCourses = await CourseRepository.getAll();
    const result = RegistrationAdvisorEngine.simulateWhatIf(
      student,
      currentCourseCodes,
      action,
      allCourses
    );

    return res.json(result);
  } catch (err: any) {
    console.error('Error simulating what-if schedule:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 5. Long-term Graduation Degree Plan (Level B Planning)
apiRouter.get('/students/:id/degree-plan', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const allCourses = await CourseRepository.getAll();
    const plan = StudyPlanner.generateStudyPlan(student, allCourses);
    return res.json(plan);
  } catch (err: any) {
    console.error('Error generating graduation plan:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 6. Submit Proposed Schedule for Advisor Review
apiRouter.post('/students/:id/submit-proposed-schedule', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  try {
    const student = await studentForCaller(req, res, true);
    if (!student) return;

    const { offeringIds, courseCodes, notes } = req.body;
    const allCourses = await CourseRepository.getAll();
    const allOfferings = await OfferingRepository.getAll();
    const offeringMap = new Map<string, CourseOffering>(allOfferings.map(o => [o.id, o]));
    const offeringByCourse = new Map<string, CourseOffering>(allOfferings.map(o => [o.courseCode, o]));

    const selectedOfferings = (Array.isArray(offeringIds) && offeringIds.length > 0)
      ? offeringIds.map((id: string) => offeringMap.get(id)).filter((o): o is CourseOffering => !!o)
      : (Array.isArray(courseCodes) ? courseCodes.map((c: string) => offeringByCourse.get(c)).filter((o): o is CourseOffering => !!o) : []);

    // Strict real-time validation before submitting
    const validation = RegistrationAdvisorEngine.validateProposedRegistration(
      student,
      selectedOfferings,
      allCourses,
      allOfferings,
      false
    );

    if (!validation.valid) {
      return res.status(422).json({
        success: false,
        messageAr: 'لا يمكن إرسال الجدول لوجود تعارضات أو مخالفات في اللائحة الأكاديمية.',
        messageEn: 'Cannot submit schedule due to unresolved timetable conflicts or bylaw errors.',
        validation,
      });
    }

    const current = await RegistrationRequestRepository.current(student.id);
    if (current?.status === 'PENDING') {
      return res.status(409).json({ success: false, messageAr: 'جدولك عند المرشد بالفعل وينتظر قراره.', messageEn: 'Your schedule is already with your advisor.' });
    }
    if (current?.status === 'APPROVED') {
      return res.status(409).json({ success: false, messageAr: 'تم اعتماد جدولك وتسجيل مقرراتك لهذا الفصل بالفعل.', messageEn: 'Your schedule for this term is already approved.' });
    }
    const request = await RegistrationRequestRepository.save(student.id, {
      status: 'PENDING',
      offeringIds: selectedOfferings.map(o => o.id),
      studentNotes: typeof notes === 'string' ? notes : '',
      submittedAt: new Date().toISOString(),
    });

    // Log to Audit Log
    await addAuditLog(
      caller?.id || student.id,
      caller?.nameAr || student.nameAr,
      (caller?.role as any) || 'STUDENT',
      'SUBMIT_PROPOSED_SCHEDULE',
      'ProposedSchedule',
      student.id,
      `تقديم جدول فصلي مقترح للمرشد الأكاديمي بإجمالي (${validation.totalCredits}) ساعة معتمدة ومقررات (${selectedOfferings.map(o => o.courseCode).join(', ')}).`,
      `Submitted proposed semester schedule to advisor totaling (${validation.totalCredits}) credits: (${selectedOfferings.map(o => o.courseCode).join(', ')}).`,
      undefined,
      { courseCodes: selectedOfferings.map(o => o.courseCode), offeringIds: selectedOfferings.map(o => o.id), notes }
    );

    // Notify Advisor
    await NotificationRepository.create({
      recipientId: student.advisorId || 'adv_dr_mahmoud',
      type: 'APPROVAL',
      titleAr: `طلب اعتماد جدول فصلي: ${plainName(student.nameAr)}`,
      titleEn: `Semester schedule to review: ${plainName(student.nameEn)}`,
      messageAr: `جدول مقترح من ${plainName(student.nameAr)} (${student.studentCode}) يضم ${selectedOfferings.length} مقررات (${validation.totalCredits} ساعة)${request.recoveryTitleAr ? ` وفق خطة تحسين المعدل «${request.recoveryTitleAr}»` : ''}، بانتظار مراجعتك واعتمادك.`,
      messageEn: `${plainName(student.nameEn)} (${student.studentCode}) sent a schedule with ${selectedOfferings.length} courses (${validation.totalCredits} credits)${request.recoveryTitleEn ? ` following the GPA recovery route “${request.recoveryTitleEn}”` : ''} for your review.`,
    });

    return res.json({
      success: true,
      messageAr: 'تم إرسال الجدول الدراسي المقترح إلى المرشد الأكاديمي بنجاح، وستصلك إفادة فور الاعتماد.',
      messageEn: 'Proposed semester schedule submitted to academic advisor for review.',
      validation,
      status: 'PENDING',
      request,
    });
  } catch (err: any) {
    console.error('Error submitting proposed schedule:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 7. Semester registration requests: the student's schedule on its way to the advisor
// -------------------------------------------------------------------------------------

/** True when the two sections meet at overlapping times on a shared day. */
const sectionsClash = (a: CourseOffering, b: CourseOffering) =>
  (a.days || []).some(d => (b.days || []).includes(d)) &&
  !!a.startTime && !!a.endTime && !!b.startTime && !!b.endTime &&
  a.startTime < b.endTime && b.startTime < a.endTime;

/**
 * Pick one section per course with open seats, so that nothing clashes with the
 * other picks or with the sections the student already sits in. Tries every
 * combination (courses with fewest sections first, emptier sections first); if no
 * clash-free set exists it falls back to the emptiest section of each course.
 */
function pickSections(codes: string[], offerings: CourseOffering[], alreadyTaken: CourseOffering[]) {
  const optionsOf = (code: string) =>
    offerings
      .filter(o => o.courseCode === code && o.enrolledCount < o.capacity)
      .sort((a, b) => a.enrolledCount / a.capacity - b.enrolledCount / b.capacity);
  const missing = codes.filter(code => optionsOf(code).length === 0);
  const order = codes.filter(code => !missing.includes(code)).sort((a, b) => optionsOf(a).length - optionsOf(b).length);

  const search = (i: number, chosen: CourseOffering[]): CourseOffering[] | null => {
    if (i === order.length) return chosen;
    for (const o of optionsOf(order[i])) {
      if ([...alreadyTaken, ...chosen].some(p => sectionsClash(p, o))) continue;
      const found = search(i + 1, [...chosen, o]);
      if (found) return found;
    }
    return null;
  };
  const picked = search(0, []) || order.map(code => optionsOf(code)[0]);
  return { picked, missing };
}

/**
 * The student the caller may act for. Students only for themselves; for changes
 * (`write`), otherwise only the student's advisor or an administrator.
 */
async function studentForCaller(req: Request, res: Response, write = false): Promise<Student | null> {
  const caller = getCaller(req);
  if (!caller) {
    res.status(401).json({ error: 'UNAUTHORIZED', messageAr: 'غير مصرح: يرجى تسجيل الدخول.', messageEn: 'Unauthorized: Authentication required.' });
    return null;
  }
  const student = await StudentRepository.findById(req.params.id);
  if (!student || (student.id !== req.params.id && student.studentCode !== req.params.id)) {
    res.status(404).json({ error: 'Student not found', messageAr: 'الطالب غير موجود.', messageEn: 'Student not found.' });
    return null;
  }
  if (caller.role === 'STUDENT' && caller.studentId !== student.id && caller.studentId !== student.studentCode) {
    res.status(403).json({ error: 'FORBIDDEN', messageAr: 'يمكنك الاطلاع على تسجيلك فقط.', messageEn: 'You can only view your own registration.' });
    return null;
  }
  if (
    write &&
    caller.role !== 'STUDENT' &&
    caller.role !== 'ADMIN' &&
    !(caller.role === 'ACADEMIC_ADVISOR' && caller.advisorId && caller.advisorId === student.advisorId)
  ) {
    res.status(403).json({ error: 'FORBIDDEN', messageAr: 'تعديل جدول الطالب للطالب نفسه أو لمرشده فقط.', messageEn: 'Only the student or their advisor can change this timetable.' });
    return null;
  }
  return student;
}

// The student's registration request for this term (null if none yet).
apiRouter.get('/students/:id/registration-request', async (req: Request, res: Response) => {
  try {
    const student = await studentForCaller(req, res);
    if (!student) return;
    return res.json({ request: await RegistrationRequestRepository.current(student.id) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Save the draft selection (kept on the server, so it is there on any device).
apiRouter.put('/students/:id/registration-request', async (req: Request, res: Response) => {
  try {
    const student = await studentForCaller(req, res, true);
    if (!student) return;
    const current = await RegistrationRequestRepository.current(student.id);
    if (current?.status === 'PENDING' || current?.status === 'APPROVED') {
      return res.status(409).json({
        error: 'LOCKED',
        messageAr: current.status === 'PENDING' ? 'جدولك عند المرشد الآن، ولا يمكن تعديله حتى يصدر قراره.' : 'تم اعتماد جدولك وتسجيل مقرراتك لهذا الفصل.',
        messageEn: current.status === 'PENDING' ? 'Your schedule is with your advisor and cannot change until they decide.' : 'Your schedule for this term is already approved.',
        request: current,
      });
    }
    const offeringIds = Array.isArray(req.body?.offeringIds) ? req.body.offeringIds.map(String) : [];
    const request = await RegistrationRequestRepository.save(student.id, {
      offeringIds,
      ...(req.body?.clearRecovery ? { recoveryStrategy: '', recoveryTitleAr: '', recoveryTitleEn: '' } : {}),
    });
    return res.json({ request });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Adopt a GPA recovery route: its courses go into this term's schedule (a section is picked for each).
apiRouter.post('/students/:id/recovery-plan/adopt', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  try {
    const student = await studentForCaller(req, res, true);
    if (!student) return;
    const courses = await CourseRepository.listAll();
    const plan = GpaImprovementPlanner.generatePlans(student, courses).find(p => p.strategy === req.body?.strategy);
    if (!plan) {
      return res.status(404).json({ error: 'PLAN_NOT_FOUND', messageAr: 'خطة تحسين المعدل غير موجودة.', messageEn: 'GPA recovery route not found.' });
    }
    const current = await RegistrationRequestRepository.current(student.id);
    if (current?.status === 'PENDING' || current?.status === 'APPROVED') {
      return res.status(409).json({
        error: 'LOCKED',
        messageAr: current.status === 'PENDING' ? 'جدولك عند المرشد الآن؛ انتظر قراره قبل تغيير الخطة.' : 'تم اعتماد جدولك لهذا الفصل بالفعل.',
        messageEn: current.status === 'PENDING' ? 'Your schedule is with your advisor; wait for their decision.' : 'Your schedule for this term is already approved.',
        request: current,
      });
    }

    const offerings = await OfferingRepository.listAll();
    const inProgress = new Set(student.records.filter(r => r.status === 'IN_PROGRESS').map(r => r.courseCode));
    const takenNow = offerings.filter(o => student.records.some(r => r.status === 'IN_PROGRESS' && r.offeringId === o.id));
    const planCodes = [...new Set(plan.courses.map(c => c.courseCode))].filter(code => !inProgress.has(code));
    const { picked, missing } = pickSections(planCodes, offerings, takenNow);

    // Keep the sections already in the draft for other courses, within the credit limit and without clashes.
    const credits = (o: CourseOffering) => courses.find(c => c.code === o.courseCode)?.credits ?? 3;
    const maxCredits = AcademicRulesEngine.getMaxCredits(student);
    const finalSections = [...picked];
    let total = finalSections.reduce((sum, o) => sum + credits(o), 0);
    for (const id of current?.offeringIds || []) {
      const o = offerings.find(x => x.id === id);
      if (!o || finalSections.some(p => p.courseCode === o.courseCode || sectionsClash(p, o))) continue;
      if (total + credits(o) > maxCredits) continue;
      finalSections.push(o);
      total += credits(o);
    }

    const request = await RegistrationRequestRepository.save(student.id, {
      offeringIds: finalSections.map(o => o.id),
      recoveryStrategy: plan.strategy,
      recoveryTitleAr: plan.titleAr,
      recoveryTitleEn: plan.titleEn,
    });
    await addAuditLog(
      caller?.id || student.id,
      caller?.nameAr || student.nameAr,
      (caller?.role as UserRole) || 'STUDENT',
      'ADOPT_GPA_RECOVERY_PLAN',
      'RegistrationRequest',
      request.id,
      `اعتماد خطة تحسين المعدل «${plan.titleAr}» وإضافة مقرراتها (${picked.map(o => o.courseCode).join(', ') || '—'}) إلى جدول الفصل.`,
      `Adopted the GPA recovery route “${plan.titleEn}” and added its courses (${picked.map(o => o.courseCode).join(', ') || '—'}) to the term schedule.`
    );
    return res.json({ request, added: picked.map(o => o.courseCode), missing, alreadyRegistered: plan.courses.map(c => c.courseCode).filter(c => inProgress.has(c)) });
  } catch (err: any) {
    console.error('Error adopting GPA recovery plan:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Everything the advisor needs to decide on one request. */
function reviewOf(request: any, student: Student, offerings: CourseOffering[], courses: Course[]) {
  const selected = (request.offeringIds as string[]).map(id => offerings.find(o => o.id === id)).filter((o): o is CourseOffering => !!o);
  const courseOf = (code: string) => courses.find(c => c.code === code);
  return {
    request,
    student: {
      id: student.id,
      studentCode: student.studentCode,
      nameAr: plainName(student.nameAr),
      nameEn: plainName(student.nameEn),
      level: student.level,
      track: student.track,
      cumulativeGpa: student.cumulativeGpa,
      completedCredits: student.completedCredits,
      warningCount: student.warningCount,
      riskLevel: AcademicRiskEngine.evaluateRisk(student).level,
      isNewStudent: AcademicRulesEngine.isNewStudent(student),
      failedCourses: student.records.filter(r => r.status === 'FAILED').map(r => r.courseCode),
      currentCourses: student.records.filter(r => r.status === 'IN_PROGRESS').map(r => r.courseCode),
      planStatus: student.currentPlanStatus,
    },
    offerings: selected.map(o => ({
      ...o,
      courseNameAr: courseOf(o.courseCode)?.nameAr || o.courseCode,
      courseNameEn: courseOf(o.courseCode)?.nameEn || o.courseCode,
      credits: courseOf(o.courseCode)?.credits ?? 3,
    })),
    totalCredits: selected.reduce((sum, o) => sum + (courseOf(o.courseCode)?.credits ?? 3), 0),
    maxAllowedCredits: AcademicRulesEngine.getMaxCredits(student),
    validation: request.status === 'PENDING' ? RegistrationAdvisorEngine.validateProposedRegistration(student, selected, courses, offerings, false) : null,
  };
}

// Advisor: requests from my students (waiting first, then recent decisions).
apiRouter.get('/advisor/registration-requests', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (!caller || !['ACADEMIC_ADVISOR', 'ADMIN'].includes(caller.role)) {
    return res.status(403).json({ error: 'ROLE_FORBIDDEN', messageAr: 'هذه الصفحة للمرشد الأكاديمي.', messageEn: 'This page is for academic advisors.' });
  }
  try {
    const students = await StudentRepository.listAll();
    const mine = caller.role === 'ADMIN' ? students : students.filter(s => s.advisorId === caller.advisorId);
    const requests = await RegistrationRequestRepository.forStudents(
      mine.map(s => s.id),
      ['PENDING', 'APPROVED', 'CHANGES_REQUESTED']
    );
    const [offerings, courses] = await Promise.all([OfferingRepository.listAll(), CourseRepository.listAll()]);
    const ordered = [...requests.filter(r => r.status === 'PENDING'), ...requests.filter(r => r.status !== 'PENDING').slice(0, 20)];
    return res.json(ordered.map(r => reviewOf(r, mine.find(s => s.id === r.studentId)!, offerings, courses)));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** Approve (register the courses) or send back with the changes needed. */
async function decideRegistration(caller: any, requestId: string, decision: string, notes: string, res: Response) {
  const request = await RegistrationRequestRepository.findById(requestId);
  if (!request) return res.status(404).json({ error: 'NOT_FOUND', messageAr: 'طلب التسجيل غير موجود.', messageEn: 'Registration request not found.' });
  const student = await StudentRepository.findById(request.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (caller.role === 'ACADEMIC_ADVISOR' && student.advisorId !== caller.advisorId) {
    return res.status(403).json({ error: 'FORBIDDEN', messageAr: 'هذا الطالب ليس من طلابك.', messageEn: 'This student is not assigned to you.' });
  }
  if (request.status !== 'PENDING') {
    return res.status(409).json({ error: 'ALREADY_DECIDED', messageAr: 'تم البت في هذا الطلب بالفعل.', messageEn: 'This request has already been decided.', request });
  }
  const advisorName = plainName(caller.nameAr);
  const note = (notes || '').trim();

  if (decision === 'APPROVE') {
    const offerings = await OfferingRepository.listAll();
    const selected = request.offeringIds.map(id => offerings.find(o => o.id === id)).filter((o): o is CourseOffering => !!o);
    const codes = selected.map(o => o.courseCode);
    const result = await AcademicTransactionService.registerCourses(student.id, codes, false, caller, selected.map(o => o.id));
    if (!result.success) {
      return res.status(422).json({
        success: false,
        messageAr: 'تعذر الاعتماد لوجود مخالفات في اللائحة؛ اطلب من الطالب تعديل جدوله.',
        messageEn: 'Could not approve because of bylaw violations; ask the student to change the schedule.',
        validation: result.validation,
      });
    }
    const saved = await RegistrationRequestRepository.save(student.id, {
      status: 'APPROVED',
      advisorNotes: note,
      decidedByName: advisorName,
      decidedAt: new Date().toISOString(),
    });
    await addAuditLog(caller.id, caller.nameAr, caller.role, 'ADVISOR_APPROVE_SCHEDULE', 'RegistrationRequest', saved.id,
      `اعتماد جدول ${plainName(student.nameAr)} وتسجيل المقررات (${codes.join(', ')}).${note ? ` ملاحظات: ${note}` : ''}`,
      `Approved ${plainName(student.nameEn)}'s schedule and registered (${codes.join(', ')}).${note ? ` Notes: ${note}` : ''}`);
    await NotificationRepository.create({
      recipientId: student.id,
      type: 'REGISTRATION',
      titleAr: 'تم اعتماد جدولك وتسجيل مقرراتك',
      titleEn: 'Your schedule is approved and your courses are registered',
      messageAr: `اعتمد ${advisorName} جدولك، وأصبحت المقررات (${codes.join('، ')}) مسجلة رسمياً هذا الفصل.${saved.recoveryTitleAr ? ` الجدول يتبع خطة تحسين المعدل «${saved.recoveryTitleAr}».` : ''}${note ? ` ملاحظة المرشد: ${note}` : ''}`,
      messageEn: `${plainName(caller.nameEn)} approved your schedule; ${codes.join(', ')} are now officially registered.${note ? ` Advisor note: ${note}` : ''}`,
    });
    return res.json({ success: true, request: saved, messageAr: 'تم اعتماد الجدول وتسجيل المقررات.', messageEn: 'Schedule approved and courses registered.' });
  }

  if (decision === 'REQUEST_CHANGES') {
    if (!note) {
      return res.status(400).json({ error: 'NOTES_REQUIRED', messageAr: 'اكتب للطالب المطلوب تعديله.', messageEn: 'Tell the student what to change.' });
    }
    const saved = await RegistrationRequestRepository.save(student.id, {
      status: 'CHANGES_REQUESTED',
      advisorNotes: note,
      decidedByName: advisorName,
      decidedAt: new Date().toISOString(),
    });
    await addAuditLog(caller.id, caller.nameAr, caller.role, 'ADVISOR_RETURN_SCHEDULE', 'RegistrationRequest', saved.id,
      `إعادة جدول ${plainName(student.nameAr)} للتعديل: ${note}`, `Returned ${plainName(student.nameEn)}'s schedule for changes: ${note}`);
    await NotificationRepository.create({
      recipientId: student.id,
      type: 'REGISTRATION',
      titleAr: 'مطلوب تعديل جدولك الدراسي',
      titleEn: 'Changes needed on your schedule',
      messageAr: `طلب ${advisorName}: «${note}». عدّل جدولك من صفحة «التسجيل» ثم أعد إرساله.`,
      messageEn: `${plainName(caller.nameEn)} asked: “${note}”. Update your schedule on the Registration page and send it again.`,
    });
    return res.json({ success: true, request: saved, messageAr: 'أُعيد الجدول للطالب مع ملاحظاتك.', messageEn: 'Returned to the student with your notes.' });
  }

  return res.status(400).json({ error: 'BAD_DECISION', messageAr: 'القرار غير معروف.', messageEn: 'Unknown decision.' });
}

apiRouter.post('/advisor/registration-requests/:id/decision', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (!caller || !['ACADEMIC_ADVISOR', 'ADMIN'].includes(caller.role)) {
    return res.status(403).json({ error: 'ROLE_FORBIDDEN', messageAr: 'هذه العملية للمرشد الأكاديمي.', messageEn: 'Only academic advisors can do this.' });
  }
  try {
    return await decideRegistration(caller, req.params.id, String(req.body?.decision || ''), String(req.body?.notes || ''), res);
  } catch (err: any) {
    console.error('Error deciding registration request:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Older form of the decision (by student): decides the student's waiting request.
apiRouter.post('/advisors/approve-schedule', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (!caller || !['ACADEMIC_ADVISOR', 'ADMIN'].includes(caller.role)) {
    return res.status(403).json({ error: 'ROLE_FORBIDDEN', messageAr: 'هذه العملية للمرشد الأكاديمي.', messageEn: 'Only academic advisors can do this.' });
  }
  try {
    const { studentId, decision, notes } = req.body || {};
    const request = studentId ? await RegistrationRequestRepository.current(String(studentId)) : null;
    if (!request || request.status !== 'PENDING') {
      return res.status(404).json({ error: 'NO_PENDING_REQUEST', messageAr: 'لا يوجد جدول مُرسل من هذا الطالب بانتظار القرار.', messageEn: 'This student has no schedule waiting for a decision.' });
    }
    return await decideRegistration(caller, request.id, decision === 'APPROVE' ? 'APPROVE' : 'REQUEST_CHANGES', String(notes || ''), res);
  } catch (err: any) {
    console.error('Error processing advisor schedule decision:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Summer Training Submission
apiRouter.post('/students/:id/training', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { company, hours, periodWeeks } = req.body;

    if (student.completedCredits < AcademicRulesEngine.MIN_TRAINING_CREDITS) {
      return res.status(400).json({
        error: `لا يحق للطالب التقديم للتدريب الصيفي قبل إنجاز ${AcademicRulesEngine.MIN_TRAINING_CREDITS} ساعة معتمدة. رصيدك الحالي (${student.completedCredits}).`,
      });
    }

    const trainingHours = (student.trainingHours || 0) + Number(hours || 120);

    await prisma.summerTraining.create({
      data: {
        studentId: student.id,
        company: company || 'شركة برمجيات متخصصة',
        hours: trainingHours,
        periodWeeks: Number(periodWeeks || 6),
        status: 'PENDING',
      },
    });

    await addAuditLog(
      student.id,
      student.nameAr,
      'STUDENT',
      'SUBMIT_TRAINING',
      'TrainingRecord',
      student.id,
      `تقديم إفادة تدريب صيفي لدى شركة (${company || 'شركة برمجيات'}) بعدد (${hours || 120}) ساعة في PostgreSQL.`,
      `Submitted summer training record for (${company}) with (${hours}) hours in PostgreSQL.`
    );

    return res.json({
      success: true,
      trainingStatus: 'Pending',
      trainingHours,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. ADVISOR WORKFLOW
// -------------------------------------------------------------
apiRouter.get('/advisor/students', async (req: Request, res: Response) => {
  try {
    const students = await StudentRepository.listAll();

    const priorityMap: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    const enriched = students.map(s => {
      const riskEval = AcademicRiskEngine.evaluateRisk(s);
      return {
        ...s,
        riskLevel: riskEval.level,
        riskReasons: riskEval.reasonsAr,
        riskScore: riskEval.score,
      };
    });

    enriched.sort((a, b) => {
      const diff = (priorityMap[b.riskLevel] || 0) - (priorityMap[a.riskLevel] || 0);
      if (diff !== 0) return diff;
      return a.cumulativeGpa - b.cumulativeGpa;
    });

    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin Assignment: Assign a list of students to an academic advisor
apiRouter.post('/advisors/:id/assign-students', async (req: Request, res: Response) => {
  try {
    const caller = getCaller(req);
    if (caller && caller.role !== 'ADMIN' && caller.role !== 'ACADEMIC_ADVISOR') {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        messageAr: 'غير مصرح: إسناد الطلاب للمرشدين يتطلب صلاحيات الآدمن.',
        messageEn: 'Unauthorized: Assigning students to advisors requires Admin privileges.',
      });
    }

    const { id } = req.params;
    const { studentIds } = req.body; // Array of student IDs / codes

    if (!Array.isArray(studentIds)) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        messageAr: 'يجب توفير قائمة معرفات الطلاب كـ مصفوفة.',
        messageEn: 'studentIds must be an array of student identifiers.',
      });
    }

    // 1. Resolve Advisor record in database
    let advisor = await prisma.advisor.findFirst({
      where: {
        OR: [
          { id },
          { userId: id },
          { user: { email: id } },
        ],
      },
      include: { user: true },
    });

    if (!advisor) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id },
            { email: id },
          ],
        },
      });

      if (user && user.role === 'ACADEMIC_ADVISOR') {
        advisor = await prisma.advisor.create({
          data: {
            id: `adv_${user.id}`,
            userId: user.id,
            office: 'مبنى الحاسبات - قسم الإرشاد الأكاديمي',
          },
          include: { user: true },
        });
      }
    }

    const advisorDbId = advisor?.id || id;
    const advisorNameAr = advisor?.user?.nameAr || 'المرشد الأكاديمي';
    const advisorNameEn = advisor?.user?.nameEn || 'Academic Advisor';

    // 2. Update Student records in database
    try {
      const targetStudents = await prisma.student.findMany({
        where: {
          OR: [
            { id: { in: studentIds } },
            { studentCode: { in: studentIds } },
            { userId: { in: studentIds } },
          ],
        },
      });

      const targetIds = targetStudents.map(s => s.id);

      if (targetIds.length > 0) {
        await prisma.student.updateMany({
          where: { id: { in: targetIds } },
          data: { advisorId: advisorDbId },
        });
      }
    } catch (dbErr) {
      console.warn('[AssignStudents] Prisma update fallback:', dbErr);
    }

    // Update in-memory fallback store as well
    for (const s of INITIAL_STUDENTS) {
      if (studentIds.includes(s.id) || studentIds.includes(s.studentCode) || studentIds.includes((s as any).userId)) {
        s.advisorId = advisorDbId;
        s.advisorName = `${advisorNameAr} (${advisorNameEn})`;
      }
    }

    // 3. Log into Immutable Audit Trail
    await addAuditLog(
      caller?.id || 'admin',
      caller?.nameAr || 'مدير النظام',
      caller?.role || 'ADMIN',
      'ASSIGN_STUDENTS',
      'Advisor',
      advisorDbId,
      `تم إسناد ${studentIds.length} طالب بنجاح إلى المرشد الأكاديمي (${advisorNameAr}).`,
      `Assigned ${studentIds.length} students to Academic Advisor (${advisorNameEn}).`,
      undefined,
      { advisorId: advisorDbId, studentCount: studentIds.length, studentIds }
    );

    // 4. Create Notification for Advisor
    await NotificationRepository.createNotification({
      recipientId: advisor?.userId || advisorDbId || 'user_advisor',
      type: 'GENERAL',
      titleAr: 'تم إسناد طلاب جدد لمتابعتهم أكاديمياً',
      titleEn: 'New Students Assigned to Your Advising Roster',
      messageAr: `قام مدير النظام بإسناد ${studentIds.length} طالب إلى قائمتك للإشراف الأكاديمي ومتابعة خطط التخرج.`,
      messageEn: `Administrator assigned ${studentIds.length} students to your advising roster.`,
    });

    return res.json({
      success: true,
      advisorId: advisorDbId,
      assignedCount: studentIds.length,
      messageAr: `تم إسناد ${studentIds.length} طالب بنجاح إلى المرشد الأكاديمي (${advisorNameAr}) وحفظ التعيين في قاعدة البيانات.`,
      messageEn: `Successfully assigned ${studentIds.length} students to Academic Advisor (${advisorNameEn}).`,
    });
  } catch (err: any) {
    console.error('Error assigning students:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Get currently assigned students for a specific advisor
apiRouter.get('/advisors/:id/assigned-students', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let students: any[] = [];
    try {
      const rows = await prisma.student.findMany({
        where: {
          OR: [
            { advisorId: id },
            { advisor: { id } },
            { advisor: { userId: id } },
            { advisor: { user: { email: id } } },
          ],
        },
        include: {
          user: true,
        },
      });

      if (rows && rows.length > 0) {
        students = rows.map(r => ({
          id: r.id,
          studentCode: r.studentCode,
          nameAr: r.user?.nameAr || '',
          nameEn: r.user?.nameEn || '',
          email: r.user?.email || '',
          level: r.level,
          cumulativeGpa: r.cumulativeGpa,
          riskLevel: r.riskLevel,
        }));
      }
    } catch (e) {}

    if (students.length === 0) {
      students = INITIAL_STUDENTS.filter(s => s.advisorId === id || id.includes('advisor') || id === 'user_advisor' || id === 'adv_dr_mahmoud').map(s => ({
        id: s.id,
        studentCode: s.studentCode,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        email: s.email,
        level: s.level,
        cumulativeGpa: s.cumulativeGpa,
        riskLevel: s.riskLevel,
      }));
    }

    return res.json(students);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/advisor/plans/:studentId/decision', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller && caller.role === 'STUDENT') {
    return res.status(403).json({
      error: 'ROLE_FORBIDDEN',
      messageAr: 'غير مصرح: لا يجوز للطالب اعتماد أو رفض الخطط الدراسية (مقتصر على المرشد الأكاديمي).',
      messageEn: 'Unauthorized: Students cannot approve or reject study plans (Advisor role required).',
    });
  }

  const { studentId } = req.params;
  const { decision, notes } = req.body; // 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'

  try {
    const student = await StudentRepository.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const statusEnum = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await StudyPlanRepository.updateStatus(student.id, statusEnum, notes);

    await NotificationRepository.createNotification({
      recipientId: student.id,
      type: 'APPROVAL',
      titleAr: decision === 'APPROVE' ? 'تم اعتماد خطتك الدراسية' : 'ملاحظات المرشد على الخطة الدراسية',
      titleEn: decision === 'APPROVE' ? 'Study Plan Approved' : 'Advisor Plan Feedback',
      messageAr: `قرار المرشد الأكاديمي: ${decision === 'APPROVE' ? 'اعتماد نهائي' : 'مطلوب تعديل'}. ملاحظات: ${notes || 'لا توجد ملاحظات إضافية'}.`,
      messageEn: `Advisor decision: ${decision === 'APPROVE' ? 'approved' : decision === 'REJECT' ? 'rejected' : 'changes requested'}. Notes: ${notes || 'No extra notes'}.`,
    });

    await addAuditLog(
      caller?.id || 'user_advisor',
      caller?.nameAr || 'د. محمود صقر',
      'ACADEMIC_ADVISOR',
      `PLAN_${decision}`,
      'StudyPlan',
      student.id,
      `اتخاذ قرار (${decision}) بشأن الخطة الدراسية للطالب ${student.nameAr} في PostgreSQL. الملاحظات: ${notes || 'تم الاعتماد'}.`,
      `Advisor decision (${decision}) on study plan for student ${student.nameEn}.`
    );

    const statusString = decision === 'APPROVE' ? 'Approved' : 'Rejected';
    return res.json({ success: true, status: statusString });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. INSTRUCTOR WORKFLOW (Grades & Attendance via PostgreSQL)
// -------------------------------------------------------------
apiRouter.get('/instructor/courses', async (req: Request, res: Response) => {
  try {
    const instructorOfferings = await OfferingRepository.listAll();
    const myOfferings = instructorOfferings.filter(o => o.instructorId === 'inst_dr_adel');
    const courses = await CourseRepository.listAll();
    const courseCodes = new Set(myOfferings.map(o => o.courseCode));
    const myCourses = courses.filter(c => courseCodes.has(c.code));

    return res.json({
      offerings: myOfferings,
      courses: myCourses,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/instructor/courses/:code/students', async (req: Request, res: Response) => {
  const { code } = req.params;
  try {
    const students = await StudentRepository.listAll();
    const enrolled = students
      .filter(s => s.records.some(r => r.courseCode === code))
      .map(s => {
        const record = s.records.find(r => r.courseCode === code)!;
        return {
          studentId: s.id,
          studentCode: s.studentCode,
          nameAr: s.nameAr,
          nameEn: s.nameEn,
          cumulativeGpa: s.cumulativeGpa,
          warningCount: s.warningCount,
          record,
        };
      });

    return res.json(enrolled);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/instructor/courses/:code/grades', async (req: Request, res: Response) => {
  if (getCaller(req)?.role === 'TEACHING_ASSISTANT') {
    return res.status(403).json({ error: 'ROLE_FORBIDDEN', messageAr: 'المعيد يأخذ الحضور فقط ولا يرصد الدرجات.', messageEn: 'Teaching assistants take attendance but do not enter grades.' });
  }
  const caller = getCaller(req);
  if (caller && caller.role === 'STUDENT') {
    return res.status(403).json({
      error: 'ROLE_FORBIDDEN',
      messageAr: 'غير مصرح: لا يجوز للطلاب رصد أو تعديل درجات المقررات.',
      messageEn: 'Unauthorized: Students cannot submit or modify instructor grades.',
    });
  }

  const { code } = req.params;
  const { studentId, courseworkMark, finalMark } = req.body;

  try {
    const result = await AcademicTransactionService.updateCourseGrade(
      code,
      studentId,
      Number(courseworkMark ?? 0),
      Number(finalMark ?? 0),
      caller || undefined
    );

    const st = result.updatedStudent!;
    const finalGrade = result.gradeAssigned?.finalGrade;
    await NotificationRepository.createNotification({
      recipientId: studentId,
      type: 'GRADE',
      titleAr: `رُصدت درجتك في ${code}`,
      titleEn: `Your grade for ${code} was posted`,
      messageAr: `أعمال السنة ${Number(courseworkMark ?? 0)} من 50 والامتحان النهائي ${Number(finalMark ?? 0)} من 50${finalGrade ? `، والتقدير ${finalGrade}` : ''}. معدلك التراكمي الآن ${Number(st.cumulativeGpa).toFixed(2)}.`,
      messageEn: `Coursework ${Number(courseworkMark ?? 0)}/50 and final exam ${Number(finalMark ?? 0)}/50${finalGrade ? `, grade ${finalGrade}` : ''}. Your cumulative GPA is now ${Number(st.cumulativeGpa).toFixed(2)}.`,
    });

    return res.json({
      success: true,
      newCumulativeGpa: st.cumulativeGpa,
      newWarningCount: st.warningCount,
      newRiskLevel: st.riskLevel,
      gradeAssigned: result.gradeAssigned,
    });
  } catch (err: any) {
    return res.status(err.message?.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

apiRouter.post('/instructor/courses/:code/attendance', async (req: Request, res: Response) => {
  if (getCaller(req)?.role === 'TEACHING_ASSISTANT') {
    return res.status(403).json({ error: 'ROLE_FORBIDDEN', messageAr: 'المعيد يأخذ الحضور فقط ولا يرصد الدرجات.', messageEn: 'Teaching assistants take attendance but do not enter grades.' });
  }
  const caller = getCaller(req);
  if (caller && caller.role === 'STUDENT') {
    return res.status(403).json({
      error: 'ROLE_FORBIDDEN',
      messageAr: 'غير مصرح: لا يجوز للطلاب تعديل سجلات الحضور والغياب.',
      messageEn: 'Unauthorized: Students cannot modify attendance records.',
    });
  }

  const { code } = req.params;
  const { studentId, attendancePercentage } = req.body;

  try {
    const student = await StudentRepository.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const record = student.records.find(r => r.courseCode === code);
    if (!record) return res.status(404).json({ error: 'Course record not found' });

    await prisma.courseRecord.updateMany({
      where: {
        studentId,
        course: { code },
      },
      data: {
        attendancePercentage: Number(attendancePercentage),
      },
    });

    if (Number(attendancePercentage) < 75) {
      await NotificationRepository.createNotification({
        recipientId: student.id,
        type: 'RISK',
        titleAr: `تنبيه حضور في ${code}`,
        titleEn: `Attendance alert in ${code}`,
        messageAr: `نسبة حضورك في ${code} (${record.courseNameAr}) أصبحت ${attendancePercentage}% وهي أقل من الحد الأدنى 75%. استمرار الغياب قد يحرمك من دخول الامتحان النهائي.`,
        messageEn: `Your attendance in ${code} (${record.courseNameEn}) is now ${attendancePercentage}%, below the 75% minimum. More absences can bar you from the final exam.`,
      });

      // Let the student's advisor know as well.
      if (student.advisorId) {
        await NotificationRepository.createNotification({
          recipientId: student.advisorId,
          type: 'RISK',
          titleAr: `حضور منخفض: ${plainName(student.nameAr)}`,
          titleEn: `Low attendance: ${plainName(student.nameEn)}`,
          messageAr: `أصبحت نسبة حضور ${plainName(student.nameAr)} (${student.studentCode}) في ${code} ${attendancePercentage}%، وهي أقل من الحد الأدنى 75%.`,
          messageEn: `${plainName(student.nameEn)} (${student.studentCode}) is now at ${attendancePercentage}% attendance in ${code}, below the 75% minimum.`,
        });
      }
    }

    const newRisk = AcademicRiskEngine.evaluateRisk(student);

    await addAuditLog(
      caller?.id || 'user_instructor',
      caller?.nameAr || 'أ.د. عادل منصور',
      'INSTRUCTOR',
      'UPDATE_ATTENDANCE',
      'StudentCourseRecord',
      `${code}_${student.studentCode}`,
      `تحديث نسبة حضور الطالب ${student.nameAr} في ${code} إلى ${attendancePercentage}% في PostgreSQL.`,
      `Updated attendance for ${student.nameEn} in ${code} to ${attendancePercentage}%.`
    );

    return res.json({
      success: true,
      attendancePercentage: Number(attendancePercentage),
      riskLevel: newRisk.level,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. DEPARTMENT HEAD ANALYTICS (Live PostgreSQL Aggregations)
// -------------------------------------------------------------
apiRouter.get('/department/analytics', async (req: Request, res: Response) => {
  try {
    const students = await StudentRepository.listAll();
    const courses = await CourseRepository.listAll();
    const offerings = await OfferingRepository.listAll();

    const totalStudents = students.length;
    const criticalCount = students.filter(s => s.riskLevel === 'CRITICAL').length;
    const highRiskCount = students.filter(s => s.riskLevel === 'HIGH').length;
    const mediumRiskCount = students.filter(s => s.riskLevel === 'MEDIUM').length;
    const lowRiskCount = students.filter(s => s.riskLevel === 'LOW').length;
    const below2GpaCount = students.filter(s => s.cumulativeGpa < 2.0).length;

    // Failure hotspots: courses with most F grades
    const failCounts: Record<string, { code: string; nameAr: string; nameEn: string; count: number }> = {};
    for (const st of students) {
      for (const rec of st.records) {
        if (rec.status === 'FAILED') {
          if (!failCounts[rec.courseCode]) {
            failCounts[rec.courseCode] = {
              code: rec.courseCode,
              nameAr: rec.courseNameAr,
              nameEn: rec.courseNameEn,
              count: 0,
            };
          }
          failCounts[rec.courseCode].count += 1;
        }
      }
    }

    const hotspots = Object.values(failCounts).sort((a, b) => b.count - a.count);

    // Seat pressure & demand
    const seatStats = offerings.map(o => {
      const course = courses.find(c => c.code === o.courseCode);
      const pressurePct = Math.round((o.enrolledCount / Math.max(1, o.capacity)) * 100);
      return {
        courseCode: o.courseCode,
        courseNameAr: course ? course.nameAr : o.courseCode,
        courseNameEn: course ? course.nameEn : o.courseCode,
        capacity: o.capacity,
        enrolledCount: o.enrolledCount,
        pressurePct,
        isFull: o.enrolledCount >= o.capacity,
      };
    });

    // Track breakdown
    const tracks: Record<string, number> = {
      'General': 0,
      'Networks & Cyber Security': 0,
      'Artificial Intelligence': 0,
    };
    for (const st of students) {
      if (tracks[st.track] !== undefined) {
        tracks[st.track] += 1;
      }
    }

    return res.json({
      totalStudents,
      riskSummary: {
        critical: criticalCount,
        high: highRiskCount,
        medium: mediumRiskCount,
        low: lowRiskCount,
        below2Gpa: below2GpaCount,
      },
      hotspots,
      seatStats,
      trackDistribution: tracks,
      expectedGraduationDelays: Math.round(totalStudents * 0.14),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. ADMIN RULES CONFIGURATION & DATA IMPORT (PostgreSQL-authoritative)
// -------------------------------------------------------------
apiRouter.get('/admin/rules', async (req: Request, res: Response) => {
  try {
    const rules = await AcademicRuleRepository.listAll();
    return res.json(rules);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/rules/:id', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller && caller.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'ROLE_FORBIDDEN',
      messageAr: 'غير مصرح: تعديل قواعد اللائحة مقتصر على مدير النظام فقط.',
      messageEn: 'Unauthorized: Modifying academic rules requires Administrator privileges.',
    });
  }

  const { id } = req.params;
  const { value, needsVerification, notesAr, notesEn } = req.body;

  try {
    const existing = await AcademicRuleRepository.findById(id);
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const oldValue = existing.value;
    const updated = await AcademicRuleRepository.updateRule(id, {
      value,
      needsVerification,
      notesAr,
      notesEn,
    });

    await addAuditLog(
      caller?.id || 'user_admin',
      caller?.nameAr || 'مدير النظام الأكاديمي',
      'ADMIN',
      'UPDATE_ACADEMIC_RULE',
      'AcademicRuleConfig',
      existing.key,
      `تعديل اللائحة الأكاديمية للقاعدة (${existing.titleAr}) من [${oldValue}] إلى [${value}] في PostgreSQL.`,
      `Updated academic rule (${existing.titleEn}) from [${oldValue}] to [${value}] in PostgreSQL.`,
      { value: oldValue },
      { value }
    );

    return res.json({ success: true, rule: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/admin/audit', async (req: Request, res: Response) => {
  try {
    const logs = await AuditLogRepository.listRecent(100);
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// CSV Sample Data Import with full validation report & PostgreSQL persistence
apiRouter.post('/admin/import', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller && caller.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'ROLE_FORBIDDEN',
      messageAr: 'غير مصرح: استيراد البيانات مقتصر على مدير النظام فقط.',
      messageEn: 'Unauthorized: Importing data requires Administrator privileges.',
    });
  }

  const { type, csvData } = req.body; // type: 'STUDENTS' | 'COURSES' | 'GRADES'

  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({ error: 'csvData string is required' });
  }

  const lines = csvData.trim().split('\n').filter(l => l.trim().length > 0);
  if (lines.length <= 1) {
    return res.status(400).json({ error: 'CSV file is empty or missing headers' });
  }

  const rows = lines.slice(1);

  let successCount = 0;
  let failCount = 0;
  const validationErrors: { row: number; reason: string }[] = [];

  const validGradesSet = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'W', 'I']);
  const seenStudentCodesInBatch = new Set<string>();
  const seenCourseCodesInBatch = new Set<string>();

  try {
    const existingStudents = await StudentRepository.listAll();
    const existingCourses = await CourseRepository.listAll();

    for (let idx = 0; idx < rows.length; idx++) {
      const line = rows[idx];
      const rowNum = idx + 2;
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 2) {
        failCount++;
        validationErrors.push({ row: rowNum, reason: 'السطر يحتوي على بيانات ناقصة (أعمدة غير مكتملة).' });
        continue;
      }

      if (type === 'STUDENTS') {
        const code = parts[0];
        const name = parts[1];
        const gpa = parseFloat(parts[2] || '2.0');

        if (!code || code.length < 4) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `كود الطالب (${code}) غير صالح.` });
          continue;
        }
        if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `المعدل التراكمي (${parts[2]}) غير صالح (يجب أن يكون بين 0.00 و 4.00).` });
          continue;
        }
        if (seenStudentCodesInBatch.has(code) || existingStudents.some(s => s.studentCode === code)) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `كود الطالب (${code}) مكرر بالفعل في النظام أو الملف.` });
          continue;
        }
        seenStudentCodesInBatch.add(code);

        // Persist to PostgreSQL
        await StudentRepository.createStudent({
          studentCode: code,
          nameAr: name,
          nameEn: `Student ${code}`,
          email: `${code.toLowerCase()}@university.edu`,
          level: 1,
          cumulativeGpa: gpa,
          passwordHash: '$2a$10$wK1WfQ/J3W.bI.j4yG1aZe3zVlY7FqHkUf4tM9oQeZ1wE2rT3yU4i', // hashed
        });
        successCount++;
      } else if (type === 'COURSES') {
        const code = parts[0].toUpperCase();
        const name = parts[1];
        const credits = parseInt(parts[2] || '3', 10);

        if (!code || !/^[A-Z]{2,3}\s*\d{3}$/.test(code)) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `رمز المقرر (${code}) غير مطابق لصيغة المقررات الأكاديمية (مثال: CS 101).` });
          continue;
        }
        if (isNaN(credits) || credits < 1 || credits > 6) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `عدد الساعات المعتمدة (${parts[2]}) غير صالحة (يجب أن تكون بين 1 و 6).` });
          continue;
        }
        if (seenCourseCodesInBatch.has(code) || existingCourses.some(c => c.code.toUpperCase() === code)) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `رمز المقرر (${code}) مكرر ومسجل مسبقاً في لائحة الكلية.` });
          continue;
        }
        seenCourseCodesInBatch.add(code);

        // Persist to PostgreSQL
        await CourseRepository.upsertCourse({
          code,
          nameAr: name,
          nameEn: `Course ${code}`,
          credits,
          level: 1,
          semester: 1,
        });
        successCount++;
      } else if (type === 'GRADES') {
        const studentCode = parts[0];
        const courseCode = parts[1].toUpperCase();
        const rawGrade = (parts[2] || '').toUpperCase();
        const semesterDate = parts[3];

        const targetStudent = existingStudents.find(s => s.studentCode === studentCode || s.id === studentCode);
        if (!targetStudent) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `كود الطالب (${studentCode}) غير مسجل في قاعدة بيانات الجامعة.` });
          continue;
        }

        const targetCourse = existingCourses.find(c => c.code.toUpperCase() === courseCode);
        if (!targetCourse) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `رمز المقرر (${courseCode}) غير موجود في اللائحة الأكاديمية.` });
          continue;
        }

        if (!validGradesSet.has(rawGrade)) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `التقدير الأكاديمي (${rawGrade}) غير معتمد في لائحة الدرجات الجامعية.` });
          continue;
        }

        if (semesterDate && isNaN(Date.parse(semesterDate))) {
          failCount++;
          validationErrors.push({ row: rowNum, reason: `تاريخ الفصل أو الرصد (${semesterDate}) غير صالح بصيغة ISO/تاريخ صحيحة.` });
          continue;
        }

        // Persist Course Record into PostgreSQL
        const gradePoints = getGradePoints(rawGrade);
        await prisma.courseRecord.create({
          data: {
            id: `rec_${targetStudent.id}_${courseCode.replace(/\s+/g, '_')}_${Date.now()}`,
            studentId: targetStudent.id,
            courseId: targetCourse.id,
            grade: rawGrade,
            gradePoints,
            status: rawGrade === 'F' ? 'FAILED' : 'PASSED',
            attempt: 1,
            attendancePercentage: 100,
          },
        });
        successCount++;
      } else {
        successCount++;
      }
    }

    await addAuditLog(
      caller?.id || 'user_admin',
      caller?.nameAr || 'مدير النظام',
      'ADMIN',
      'CSV_DATA_IMPORT',
      'DataImport',
      type,
      `استيراد ملف CSV لنوع (${type}) إلى PostgreSQL: إجمالي (${rows.length}) صفاً، نجح (${successCount})، فشل (${failCount}).`,
      `CSV import for (${type}) to PostgreSQL: Total ${rows.length}, Success ${successCount}, Failed ${failCount}.`
    );

    return res.json({
      totalRows: rows.length,
      successfulRows: successCount,
      failedRows: failCount,
      validationErrors,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Bulk Data Import via Excel (.xlsx) for Students and Course Registrations
apiRouter.post('/admin/import/students-excel', excelUpload.single('file'), async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller && caller.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'ROLE_FORBIDDEN',
      messageAr: 'غير مصرح: استيراد البيانات مقتصر على مدير النظام فقط.',
      messageEn: 'Unauthorized: Importing data requires Administrator privileges.',
    });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({
      error: 'NO_FILE_UPLOADED',
      messageAr: 'لم يتم استلام أي ملف إكسل. يرجى اختيار ملف بصيغة .xlsx.',
      messageEn: 'No file received. Please provide an .xlsx file.',
    });
  }

  const wipeData = req.body.wipeData === true || req.body.wipeData === 'true' || req.body.wipeData === '1';

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({
        error: 'EMPTY_WORKBOOK',
        messageAr: 'ملف الإكسل فارغ ولا يحتوي على صفحات عمل.',
        messageEn: 'The Excel workbook is empty.',
      });
    }
    const worksheet = workbook.Sheets[firstSheetName];

    // CRITICAL: Headers are on row 5, so skip the first 4 metadata rows using range: 4
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { range: 4 });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({
        error: 'NO_DATA_ROWS',
        messageAr: 'لم يتم العثور على أي صفوف بيانات بعد السطر الرابع في ملف الإكسل.',
        messageEn: 'No data rows found after row 4 in the sheet.',
      });
    }

    interface ExcelCourseRow {
      courseCode: string;
      courseName: string;
      courseType: string;
      courseLevel: number;
      credits: number;
      passCount: number;
      failCount: number;
      withdrawCount: number;
    }

    interface StudentGroup {
      studentCode: string;
      name: string;
      gpa: number;
      earnedHours: number;
      level: number;
      courses: ExcelCourseRow[];
    }

    const studentGroups = new Map<string, StudentGroup>();

    for (const rawRow of rawRows) {
      const row: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawRow)) {
        if (k != null) {
          row[String(k).trim()] = v;
        }
      }

      const rawCode = row['كود الطالب'];
      if (!rawCode) continue;
      const studentCode = String(rawCode).trim();
      if (!studentCode) continue;

      const name = String(row['الاسم'] || '').trim();
      const rawGpa = row['المعدل التراكمى'] ?? row['المعدل التراكمي'] ?? 0;
      const gpa = typeof rawGpa === 'number' ? rawGpa : parseFloat(String(rawGpa).replace(',', '.')) || 0;

      const rawHours = row['الساعات المكتسبه'] ?? row['الساعات المكتسبة'] ?? 0;
      const earnedHours = typeof rawHours === 'number' ? rawHours : parseInt(String(rawHours), 10) || 0;

      const rawLevel = row['المستوي'] ?? row['المستوى'] ?? 1;
      let level = 1;
      if (typeof rawLevel === 'number') {
        level = rawLevel;
      } else {
        const sLevel = String(rawLevel).trim();
        if (sLevel.includes('4') || sLevel.includes('رابع')) level = 4;
        else if (sLevel.includes('3') || sLevel.includes('ثالث')) level = 3;
        else if (sLevel.includes('2') || sLevel.includes('ثان')) level = 2;
        else level = parseInt(sLevel, 10) || 1;
      }

      const courseCode = String(row['كود المقرر'] || '').trim().toUpperCase();
      const courseName = String(row['اسم المقرر'] || '').trim();
      const courseType = String(row['نوع المقرر'] || '').trim();
      const courseLevel = parseInt(String(row['مستوى المقرر'] || '1'), 10) || 1;
      const credits = parseInt(String(row['الساعات المعتمدة'] || '3'), 10) || 3;
      const passCount = parseInt(String(row['عدد مرات النجاح'] || '0'), 10) || 0;
      const failCount = parseInt(String(row['عدد مرات الرسوب'] || '0'), 10) || 0;
      const withdrawCount = parseInt(String(row['عدد مرات الانسحاب'] || '0'), 10) || 0;

      if (!studentGroups.has(studentCode)) {
        studentGroups.set(studentCode, {
          studentCode,
          name,
          gpa,
          earnedHours,
          level,
          courses: [],
        });
      }

      const group = studentGroups.get(studentCode)!;
      if (!group.name && name) group.name = name;
      if (gpa > 0 && group.gpa === 0) group.gpa = gpa;
      if (earnedHours > 0 && group.earnedHours === 0) group.earnedHours = earnedHours;

      if (courseCode) {
        group.courses.push({
          courseCode,
          courseName,
          courseType,
          courseLevel,
          credits,
          passCount,
          failCount,
          withdrawCount,
        });
      }
    }

    if (studentGroups.size === 0) {
      return res.status(400).json({
        error: 'NO_VALID_STUDENTS',
        messageAr: 'لم يتم العثور على أي بيانات طلاب صالحة بعد استخراج الحقول.',
        messageEn: 'No valid students found in the file.',
      });
    }

    const defaultPasswordHash = await bcrypt.hash('std123456', 10);
    let totalCoursesProcessed = 0;

    // Wrap the entire import in a Prisma Transaction
    await prisma.$transaction(
      async (tx) => {
        // Wipe logic: If wipeData is true, clear relevant tables before importing
        if (wipeData) {
          await tx.courseRecord.deleteMany({});
          await tx.studyPlan.deleteMany({});
          await tx.summerTraining.deleteMany({});
          await tx.graduationProject.deleteMany({});
          await tx.student.deleteMany({});
          await tx.user.deleteMany({
            where: { role: 'STUDENT' },
          });
        }

        for (const student of studentGroups.values()) {
          const email = `${student.studentCode.toLowerCase().replace(/[^a-z0-9]/g, '')}@student.edu`;
          const studentNameAr = student.name || `طالب ${student.studentCode}`;
          const studentNameEn = `Student ${student.studentCode}`;

          // a. Upsert User (Role: STUDENT, password hashed 'std123456')
          let dbUser = await tx.user.findFirst({
            where: {
              OR: [
                { email },
                { student: { studentCode: student.studentCode } },
              ],
            },
          });

          if (dbUser) {
            dbUser = await tx.user.update({
              where: { id: dbUser.id },
              data: {
                nameAr: studentNameAr,
                nameEn: studentNameEn,
                passwordHash: defaultPasswordHash,
                role: 'STUDENT',
              },
            });
          } else {
            dbUser = await tx.user.create({
              data: {
                id: `usr_${student.studentCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                email,
                nameAr: studentNameAr,
                nameEn: studentNameEn,
                passwordHash: defaultPasswordHash,
                role: 'STUDENT',
              },
            });
          }

          // b. Upsert Student profile
          const dbStudent = await tx.student.upsert({
            where: { studentCode: student.studentCode },
            create: {
              id: `stu_${student.studentCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
              userId: dbUser.id,
              studentCode: student.studentCode,
              level: student.level,
              track: 'General',
              cumulativeGpa: student.gpa,
              previousGpa: student.gpa,
              completedCredits: student.earnedHours,
              enrolledCredits: 0,
              warningCount: student.gpa < 2.0 ? 1 : 0,
              riskLevel: student.gpa < 2.0 ? 'HIGH' : student.gpa < 2.5 ? 'MEDIUM' : 'LOW',
            },
            update: {
              level: student.level,
              cumulativeGpa: student.gpa,
              completedCredits: student.earnedHours,
              riskLevel: student.gpa < 2.0 ? 'HIGH' : student.gpa < 2.5 ? 'MEDIUM' : 'LOW',
            },
          });

          // c. Link courses and create records with attempts
          for (const c of student.courses) {
            totalCoursesProcessed++;

            const dbCourse = await tx.course.upsert({
              where: { code: c.courseCode },
              create: {
                id: `c_${c.courseCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                code: c.courseCode,
                nameAr: c.courseName || c.courseCode,
                nameEn: `Course ${c.courseCode}`,
                credits: c.credits > 0 ? c.credits : 3,
                level: c.courseLevel > 0 ? c.courseLevel : 1,
                semester: 1,
                isMandatory: c.courseType.includes('إجباري') || c.courseType.includes('اجباري') || true,
                department: c.courseCode.startsWith('CS')
                  ? 'Computer Science'
                  : c.courseCode.startsWith('IS')
                  ? 'Information Systems'
                  : c.courseCode.startsWith('BS')
                  ? 'Basic Sciences'
                  : 'Computer Science',
              },
              update: {
                nameAr: c.courseName || undefined,
                credits: c.credits > 0 ? c.credits : undefined,
                level: c.courseLevel > 0 ? c.courseLevel : undefined,
              },
            });

            // If not wiping everything, delete existing records for this student and course
            if (!wipeData) {
              await tx.courseRecord.deleteMany({
                where: {
                  studentId: dbStudent.id,
                  courseId: dbCourse.id,
                },
              });
            }

            // Record failed attempts
            for (let f = 1; f <= c.failCount; f++) {
              await tx.courseRecord.create({
                data: {
                  id: `rec_${dbStudent.id}_${dbCourse.id}_f${f}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  studentId: dbStudent.id,
                  courseId: dbCourse.id,
                  attempt: f,
                  status: 'FAILED',
                  grade: 'F',
                  gradePoints: 0.0,
                  attendancePercentage: 100,
                },
              });
            }

            // Record withdrawals
            if (c.withdrawCount > 0 && c.passCount === 0) {
              for (let w = 1; w <= c.withdrawCount; w++) {
                await tx.courseRecord.create({
                  data: {
                    id: `rec_${dbStudent.id}_${dbCourse.id}_w${w}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    studentId: dbStudent.id,
                    courseId: dbCourse.id,
                    attempt: c.failCount + w,
                    status: 'WITHDRAWN',
                    grade: 'W',
                    gradePoints: 0.0,
                    attendancePercentage: 100,
                  },
                });
              }
            }

            // Record passed attempt
            if (c.passCount > 0) {
              await tx.courseRecord.create({
                data: {
                  id: `rec_${dbStudent.id}_${dbCourse.id}_p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  studentId: dbStudent.id,
                  courseId: dbCourse.id,
                  attempt: c.failCount + 1,
                  status: 'PASSED',
                  grade: 'B',
                  gradePoints: 3.0,
                  attendancePercentage: 100,
                },
              });
            }

            // Record current enrollment (0 pass, 0 fail, 0 withdraw)
            if (c.passCount === 0 && c.failCount === 0 && c.withdrawCount === 0) {
              await tx.courseRecord.create({
                data: {
                  id: `rec_${dbStudent.id}_${dbCourse.id}_en_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  studentId: dbStudent.id,
                  courseId: dbCourse.id,
                  attempt: 1,
                  status: 'ENROLLED',
                  attendancePercentage: 100,
                },
              });
            }
          }
        }
      },
      { timeout: 90000 }
    );

    // Record audit log
    await addAuditLog(
      caller?.id || 'user_admin',
      caller?.nameAr || 'مدير النظام',
      'ADMIN',
      'EXCEL_BULK_STUDENT_IMPORT',
      'DataImport',
      req.file.originalname,
      `استيراد ذكي من ملف إكسل (${req.file.originalname}): تم استيراد (${studentGroups.size}) طالباً، (${totalCoursesProcessed}) تسجيلاً وسجلاً دراسياً. مسح البيانات القديمة: ${wipeData ? 'نعم' : 'لا'}.`,
      `Excel bulk student import (${req.file.originalname}): ${studentGroups.size} students, ${totalCoursesProcessed} course records. Wipe data: ${wipeData ? 'YES' : 'NO'}.`
    );

    return res.json({
      success: true,
      importedStudentsCount: studentGroups.size,
      totalRegistrationsCount: totalCoursesProcessed,
      wipedData: wipeData,
      messageAr: `تم بنجاح استيراد ${studentGroups.size} طالباً ومزامنة ${totalCoursesProcessed} تسجيلاً أكاديمياً.`,
      messageEn: `Successfully imported ${studentGroups.size} students and synchronized ${totalCoursesProcessed} academic records.`,
    });
  } catch (err: any) {
    console.error('[ExcelImportError]', err);
    return res.status(500).json({
      error: 'IMPORT_PROCESSING_FAILED',
      message: err.message,
      messageAr: `حدث خطأ أثناء معالجة ملف الإكسل: ${err.message}`,
    });
  }
});

// -------------------------------------------------------------
// 8. NOTIFICATIONS (PostgreSQL-authoritative)
// Personal: the signed-in user only ever sees and updates their own.
// -------------------------------------------------------------
const notificationAuthError = {
  error: 'UNAUTHORIZED',
  messageAr: 'غير مصرح: يرجى تسجيل الدخول.',
  messageEn: 'Unauthorized: Authentication required.',
};

apiRouter.get('/notifications', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (!caller) return res.status(401).json(notificationAuthError);
  try {
    return res.json(await NotificationRepository.listFor(caller));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/notifications/read-all', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (!caller) return res.status(401).json(notificationAuthError);
  try {
    const updated = await NotificationRepository.markAllRead(caller);
    return res.json({ success: true, updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/notifications/:id/read', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (!caller) return res.status(401).json(notificationAuthError);
  try {
    const updated = await NotificationRepository.markRead(req.params.id, caller);
    if (!updated) return res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 9. OFFICIAL REPORTS & QR VERIFICATION (Tamper-Proof Transcripts)
// -------------------------------------------------------------
apiRouter.get('/reports/transcript/:studentId', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (!caller) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      messageAr: 'غير مصرح: يرجى تسجيل الدخول.',
      messageEn: 'Unauthorized: Authentication required.',
    });
  }
  try {
    const student = await StudentRepository.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // A verified transcript is an official document: students can only issue their own.
    if (caller.role === 'STUDENT' && student.id !== caller.studentId && student.studentCode !== caller.studentId) {
      return res.status(403).json({
        error: 'ROLE_FORBIDDEN',
        messageAr: 'يمكنك إصدار سجلك الأكاديمي فقط.',
        messageEn: 'You can only issue your own transcript.',
      });
    }

    // The QR code links to the public verification page (/verify/<code>) on an address phones can open.
    const report = await UniversityReportService.generateOfficialTranscript(student, req);

    await addAuditLog(
      caller.id,
      caller.nameAr,
      caller.role,
      'GENERATE_TRANSCRIPT',
      'OfficialTranscript',
      report.verificationToken,
      `إصدار سجل أكاديمي موثق للطالب ${plainName(student.nameAr)} (${student.studentCode}) برمز التحقق ${report.verificationToken}.`,
      `Issued a verified transcript for ${plainName(student.nameEn)} (${student.studentCode}) with verification code ${report.verificationToken}.`
    );

    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// JSON form of the public verification page (/verify/<code>).
apiRouter.get('/reports/verify/:token', async (req: Request, res: Response) => {
  try {
    const result = await UniversityReportService.verifyTranscript(req.params.token);
    return res.status(result.valid ? 200 : 404).json({ verified: result.valid, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10. IBN AL-HAITHAM UNIVERSITY SIS INTEGRATION & SYNC
// -------------------------------------------------------------
apiRouter.get('/integration/sis/status', async (req: Request, res: Response) => {
  const sis = IbnAlHaythamDataProvider.getInstance();
  const status = await sis.testConnection();
  return res.json(status);
});

apiRouter.post('/integration/sis/sync-now', async (req: Request, res: Response) => {
  const caller = getCaller(req);
  if (caller && caller.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin privilege required to trigger SIS sync' });
  }

  const sis = IbnAlHaythamDataProvider.getInstance();
  const result = await sis.fetchNightlyIncrementalSync();

  await addAuditLog(
    caller?.id || 'admin',
    caller?.nameAr || 'مدير النظام',
    'ADMIN',
    'SIS_INCREMENTAL_SYNC',
    'UniversitySIS',
    'IbnAlHaitham',
    'تشغيل مزامنة فورية تراكمية مع نظام ابن الهيثم لإدارة شؤون الطلاب والامتحانات.',
    'Executed manual incremental sync with Ibn Al-Haitham SIS.'
  );

  return res.json({ success: true, message: 'Sync completed successfully', result });
});

apiRouter.get('/integration/sis/history', async (req: Request, res: Response) => {
  const sis = IbnAlHaythamDataProvider.getInstance();
  const history = await sis.getSyncHistory();
  return res.json(history);
});

// -------------------------------------------------------------
// 11. BACKGROUND JOBS QUEUE (Redis / BullMQ Ready)
// -------------------------------------------------------------
apiRouter.get('/jobs/recent', (req: Request, res: Response) => {
  const queue = BackgroundQueueService.getInstance();
  return res.json(queue.listRecentJobs());
});

apiRouter.post('/jobs/dispatch', async (req: Request, res: Response) => {
  const { name, data } = req.body;
  const queue = BackgroundQueueService.getInstance();
  const job = await queue.dispatchJob(name, data || {});
  return res.json({ success: true, job });
});

// -------------------------------------------------------------
// 12. AI & MACHINE LEARNING MODEL REGISTRY STATUS
// -------------------------------------------------------------
apiRouter.get('/ai/ml-status', (req: Request, res: Response) => {
  const aiService = EnterpriseAIService.getInstance();
  return res.json(aiService.getMLModelStatus());
});

// -------------------------------------------------------------
// 13. OPENAPI / SWAGGER SPECIFICATION
// -------------------------------------------------------------
apiRouter.get('/docs/openapi.json', (req: Request, res: Response) => {
  return res.json(openApiSpec);
});

// -------------------------------------------------------------
// 14. HEALTH & READINESS PROBES (Real Database Ping)
// -------------------------------------------------------------
apiRouter.get('/health', (req: Request, res: Response) => {
  return res.json({
    status: 'HEALTHY',
    service: 'Smart Academic Advisor University Core',
    version: '2.5.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

apiRouter.get('/ready', async (req: Request, res: Response) => {
  const dbStatus = await checkDatabaseConnection();
  const rulesCount = await prisma.academicRule.count().catch(() => 0);
  const offeringsCount = await prisma.courseOffering.count().catch(() => 0);
  const studentsCount = await prisma.student.count().catch(() => 0);

  return res.json({
    ready: dbStatus.connected,
    database: dbStatus.connected ? 'POSTGRESQL_CONNECTED' : 'DISCONNECTED',
    latencyMs: dbStatus.latencyMs,
    bylawsEngine: 'LOADED',
    academicRulesCount: rulesCount,
    activeOfferingsCount: offeringsCount,
    persistedStudentsCount: studentsCount,
  });
});
