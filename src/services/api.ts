import {
  AcademicRuleConfig,
  AuditLogItem,
  Course,
  CourseOffering,
  CourseRecommendation,
  GpaImprovementPlan,
  NotificationItem,
  Student,
  StudyPlan,
  UserRole,
} from '../types/index.js';

export interface AuthUser {
  id: string;
  email: string;
  nameAr: string;
  nameEn: string;
  role: UserRole;
  advisorId?: string;
  instructorId?: string;
  studentId?: string;
}

let activeUserToken: string = '';
let activeUserId: string = 'user_student';

export function setActiveAuthContext(token: string, userId: string) {
  activeUserToken = token;
  activeUserId = userId;
  try {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user_id', userId);
  } catch (e) {}
}

function getHeaders(): HeadersInit {
  const token = activeUserToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') || '' : '');
  const uid = activeUserId || (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_user_id') || '' : '');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || 'jwt_mock_' + uid}`,
    'x-user-id': uid,
  };
}

export const api = {
  // Auth
  async login(email: string): Promise<{ token: string; user: AuthUser }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.token && data.user) {
      setActiveAuthContext(data.token, data.user.id);
    }
    return data;
  },

  async getUsers(): Promise<AuthUser[]> {
    const res = await fetch('/api/auth/users', { headers: getHeaders() });
    return res.json();
  },

  // Courses & Offerings
  async getCourses(): Promise<Course[]> {
    const res = await fetch('/api/courses', { headers: getHeaders() });
    return res.json();
  },

  async saveCourse(course: Course): Promise<{ success: boolean; course: Course }> {
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(course),
    });
    return res.json();
  },

  async getOfferings(): Promise<CourseOffering[]> {
    const res = await fetch('/api/offerings', { headers: getHeaders() });
    return res.json();
  },

  async updateOfferingCapacity(id: string, capacity: number): Promise<{ success: boolean; offering: CourseOffering }> {
    const res = await fetch(`/api/offerings/${id}/capacity`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ capacity }),
    });
    return res.json();
  },

  // Students
  async getStudents(filters?: { risk?: string; level?: number; track?: string; search?: string }): Promise<Student[]> {
    const params = new URLSearchParams();
    if (filters?.risk) params.set('risk', filters.risk);
    if (filters?.level) params.set('level', String(filters.level));
    if (filters?.track) params.set('track', filters.track);
    if (filters?.search) params.set('search', filters.search);

    const res = await fetch(`/api/students?${params.toString()}`, { headers: getHeaders() });
    return res.json();
  },

  async getStudentById(id: string): Promise<Student & { riskDetails: any; academicStatus: any }> {
    const res = await fetch(`/api/students/${id}`, { headers: getHeaders() });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.messageAr || err.error || 'Access denied');
    }
    return res.json();
  },

  async getRecommendations(studentId: string): Promise<CourseRecommendation[]> {
    const res = await fetch(`/api/students/${studentId}/recommendations`, { headers: getHeaders() });
    return res.json();
  },

  async getStudyPlan(studentId: string, pace?: string): Promise<StudyPlan> {
    const res = await fetch(`/api/students/${studentId}/study-plan?pace=${pace || 'NORMAL'}`, { headers: getHeaders() });
    return res.json();
  },

  async submitStudyPlan(studentId: string): Promise<{ success: boolean; status: string }> {
    const res = await fetch(`/api/students/${studentId}/study-plan/submit`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async getGpaPlans(studentId: string): Promise<GpaImprovementPlan[]> {
    const res = await fetch(`/api/students/${studentId}/gpa-plans`, { headers: getHeaders() });
    return res.json();
  },

  async simulateWhatIf(studentId: string, items: { courseCode: string; projectedGrade: string }[]): Promise<any> {
    const res = await fetch(`/api/students/${studentId}/what-if`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ items }),
    });
    return res.json();
  },

  async registerCourses(studentId: string, courseCodes: string[], isSummer?: boolean): Promise<any> {
    const res = await fetch(`/api/students/${studentId}/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ courseCodes, isSummer }),
    });
    return res.json();
  },

  async submitTraining(studentId: string, data: { company: string; hours: number; periodWeeks: number }): Promise<any> {
    const res = await fetch(`/api/students/${studentId}/training`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Advisor
  async getAdvisorStudents(): Promise<Student[]> {
    const res = await fetch('/api/advisor/students', { headers: getHeaders() });
    return res.json();
  },

  async decidePlan(studentId: string, decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES', notes: string): Promise<any> {
    const res = await fetch(`/api/advisor/plans/${studentId}/decision`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ decision, notes }),
    });
    return res.json();
  },

  // Instructor
  async getInstructorCourses(): Promise<{ offerings: CourseOffering[]; courses: Course[] }> {
    const res = await fetch('/api/instructor/courses', { headers: getHeaders() });
    return res.json();
  },

  async getCourseEnrolledStudents(code: string): Promise<any[]> {
    const res = await fetch(`/api/instructor/courses/${encodeURIComponent(code)}/students`, { headers: getHeaders() });
    return res.json();
  },

  async saveGrades(code: string, studentId: string, courseworkMark: number, finalMark: number): Promise<any> {
    const res = await fetch(`/api/instructor/courses/${encodeURIComponent(code)}/grades`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ studentId, courseworkMark, finalMark }),
    });
    return res.json();
  },

  async saveAttendance(code: string, studentId: string, attendancePercentage: number): Promise<any> {
    const res = await fetch(`/api/instructor/courses/${encodeURIComponent(code)}/attendance`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ studentId, attendancePercentage }),
    });
    return res.json();
  },

  // Admin & Config
  async getAcademicRules(): Promise<AcademicRuleConfig[]> {
    const res = await fetch('/api/admin/rules', { headers: getHeaders() });
    return res.json();
  },

  async updateAcademicRule(id: string, data: Partial<AcademicRuleConfig>): Promise<any> {
    const res = await fetch(`/api/admin/rules/${id}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async getAuditLogs(): Promise<AuditLogItem[]> {
    const res = await fetch('/api/admin/audit', { headers: getHeaders() });
    return res.json();
  },

  async importCsvData(type: 'STUDENTS' | 'COURSES' | 'GRADES', csvData: string): Promise<any> {
    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ type, csvData }),
    });
    return res.json();
  },

  // Department Head
  async getDepartmentAnalytics(): Promise<any> {
    const res = await fetch('/api/department/analytics', { headers: getHeaders() });
    return res.json();
  },

  // Notifications
  async getNotifications(recipientId?: string): Promise<NotificationItem[]> {
    const res = await fetch(`/api/notifications?recipientId=${recipientId || ''}`, { headers: getHeaders() });
    return res.json();
  },

  async markNotificationRead(id: string): Promise<any> {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  // System & Integration
  async getSystemReadiness(): Promise<{
    ready: boolean;
    database: string;
    latencyMs: number;
    bylawsEngine: string;
    academicRulesCount: number;
    activeOfferingsCount: number;
    persistedStudentsCount: number;
  }> {
    const res = await fetch('/api/ready', { headers: getHeaders() });
    return res.json();
  },

  async getSisStatus(): Promise<{
    connected: boolean;
    latencyMs: number;
    sisVersion: string;
    error?: string;
  }> {
    const res = await fetch('/api/integration/sis/status', { headers: getHeaders() });
    return res.json();
  },

  async syncSisNow(): Promise<any> {
    const res = await fetch('/api/integration/sis/sync-now', {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },
};
