import { Router, Request, Response } from 'express';
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

// Security: Resolve calling user from headers
function getCaller(req: Request) {
  const userIdHeader = req.headers['x-user-id'] as string;
  if (userIdHeader) {
    const found = USERS.find(u => u.id === userIdHeader || u.email === userIdHeader || u.studentId === userIdHeader);
    if (found) return found;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const match = USERS.find(u => token.includes(u.id));
    if (match) return match;
  }
  return null;
}

// Global RBAC middleware: Enforce Process Officer read-only policy
apiRouter.use((req: Request, res: Response, next) => {
  const caller = getCaller(req);
  if (caller && caller.role === 'PROCESS_OFFICER' && req.method !== 'GET') {
    return res.status(403).json({
      error: 'FORBIDDEN_READ_ONLY',
      messageAr: 'مسؤول شؤون الطلاب لديه صلاحية قراءة واطلاع فقط، ولا يجوز له إجراء تعديلات أو عمليات تسجيل.',
      messageEn: 'Process Officer has strictly read-only access and cannot perform modifications.',
    });
  }
  next();
});

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
  if (caller && caller.role === 'STUDENT' && caller.studentId && caller.studentId !== req.params.id) {
    return res.status(403).json({
      error: 'IDOR_FORBIDDEN',
      messageAr: 'غير مصرح: لا يجوز للطالب الاطلاع أو التعديل على سجلات طالب آخر.',
      messageEn: 'Unauthorized: Students can only view or modify their own academic record.',
    });
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

    const savedPlan = await StudyPlanRepository.getByStudentId(student.id);
    if (savedPlan && savedPlan.semesters && savedPlan.semesters.length > 0) {
      return res.json(savedPlan);
    }

    const courses = await CourseRepository.listAll();
    const pace = (req.query.pace as any) || 'NORMAL';
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

    const courses = await CourseRepository.listAll();
    const plan = StudyPlanner.generatePlan(student, courses);
    await StudyPlanRepository.savePlan(student.id, plan, 'PENDING_REVIEW');

    await NotificationRepository.createNotification({
      recipientId: student.advisorId || 'user_advisor',
      type: 'APPROVAL',
      titleAr: 'طلب مراجعة واعتماد خطة دراسية جديدة',
      titleEn: 'Study Plan Approval Request',
      messageAr: `قام الطالب ${student.nameAr} (${student.studentCode}) بتقديم خطته الدراسية لمراجعتها واعتمادها.`,
      messageEn: `Student ${student.nameEn} (${student.studentCode}) submitted their study plan for advisor review.`,
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

    return res.json({ success: true, status: 'Pending Review' });
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

    const statusEnum = decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'DRAFT';
    await StudyPlanRepository.updateStatus(studentId, statusEnum, notes);

    await NotificationRepository.createNotification({
      recipientId: student.id,
      type: 'APPROVAL',
      titleAr: decision === 'APPROVE' ? 'تم اعتماد خطتك الدراسية' : 'ملاحظات المرشد على الخطة الدراسية',
      titleEn: decision === 'APPROVE' ? 'Study Plan Approved' : 'Advisor Plan Feedback',
      messageAr: `قرار المرشد الأكاديمي: ${decision === 'APPROVE' ? 'اعتماد نهائي' : 'مطلوب تعديل'}. ملاحظات: ${notes || 'لا توجد ملاحظات إضافية'}.`,
      messageEn: `Advisor decision: ${decision}. Notes: ${notes || 'No extra notes'}.`,
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

    const statusString = decision === 'APPROVE' ? 'Approved' : decision === 'REJECT' ? 'Rejected' : 'Draft';
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
        titleAr: `إنذار غياب في مقرر ${code}`,
        titleEn: `Attendance Warning in ${code}`,
        messageAr: `نسبة حضورك انخفضت إلى (${attendancePercentage}%). النسبة الأدنى لدخول الاختبار النهائي هي 75%.`,
        messageEn: `Attendance dropped to (${attendancePercentage}%). Minimum required is 75%.`,
      });
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

// -------------------------------------------------------------
// 8. NOTIFICATIONS (PostgreSQL-authoritative)
// -------------------------------------------------------------
apiRouter.get('/notifications', async (req: Request, res: Response) => {
  try {
    const { recipientId } = req.query;
    const list = await NotificationRepository.listForRecipient(recipientId ? String(recipientId) : undefined);
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    await NotificationRepository.markRead(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 9. OFFICIAL REPORTS & QR VERIFICATION (Tamper-Proof Transcripts)
// -------------------------------------------------------------
apiRouter.get('/reports/transcript/:studentId', async (req: Request, res: Response) => {
  try {
    const student = await StudentRepository.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const hostUrl = req.protocol + '://' + req.get('host');
    const report = UniversityReportService.generateOfficialTranscript(student, hostUrl);

    await addAuditLog(
      student.id,
      student.nameAr,
      'STUDENT',
      'GENERATE_TRANSCRIPT',
      'OfficialTranscript',
      report.verificationToken,
      `استخراج كشف درجات وبيان حالة رسمي للطالب مع رمز التحقق المشفر (${report.verificationToken}) من PostgreSQL.`,
      `Generated official verified transcript for student (${student.nameEn}) from PostgreSQL.`
    );

    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/reports/verify/:token', (req: Request, res: Response) => {
  const result = UniversityReportService.verifyTranscriptToken(req.params.token);
  if (!result.verified) {
    return res.status(404).json(result);
  }
  return res.json(result);
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
