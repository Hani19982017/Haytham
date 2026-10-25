import { axiosClient } from './axiosClient.js';
import {
  AcademicRuleConfig,
  AuditLogItem,
  Course,
  CourseOffering,
  CourseRecommendation,
  GpaImprovementPlan,
  NotificationItem,
  RegistrationValidationDetails,
  ScheduleWhatIfResult,
  SemesterScheduleRecommendation,
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

export function setActiveAuthContext(token: string, userId: string) {
  try {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user_id', userId);
  } catch (e) {}
}

export const api = {
  // Auth
  async login(identifier: string, password?: string): Promise<{ token: string; refreshToken?: string; user: AuthUser }> {
    const res = await axiosClient.post('/auth/login', {
      email: identifier,
      password: password || 'password123',
    });
    const data = res.data;
    if (data.token) {
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      setActiveAuthContext(data.token, data.user.id);
    }
    return data;
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const res = await axiosClient.get('/auth/me');
      return res.data.user;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await axiosClient.post('/auth/logout');
    } catch {}
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_user_id');
  },

  async getUsers(): Promise<AuthUser[]> {
    const res = await axiosClient.get('/users');
    return res.data;
  },

  async createUser(userData: {
    email: string;
    password: string;
    nameAr: string;
    nameEn?: string;
    role: UserRole;
    studentCode?: string;
    department?: string;
  }): Promise<{ success: boolean; user: AuthUser; messageAr?: string; messageEn?: string }> {
    const res = await axiosClient.post('/users', userData);
    return res.data;
  },

  async updateUser(id: string, userData: {
    nameAr?: string;
    nameEn?: string;
    email?: string;
    role?: UserRole;
    password?: string;
  }): Promise<{ success: boolean; user: AuthUser; messageAr?: string; messageEn?: string }> {
    const res = await axiosClient.put(`/users/${encodeURIComponent(id)}`, userData);
    return res.data;
  },

  async deleteUser(id: string): Promise<{ success: boolean; messageAr?: string; messageEn?: string }> {
    const res = await axiosClient.delete(`/users/${encodeURIComponent(id)}`);
    return res.data;
  },

  async resetUserPassword(id: string, newPassword?: string): Promise<{ success: boolean; messageAr?: string; messageEn?: string }> {
    const res = await axiosClient.post(`/users/${encodeURIComponent(id)}/reset-password`, { newPassword });
    return res.data;
  },

  // Courses & Offerings
  async getCourses(): Promise<Course[]> {
    const res = await axiosClient.get('/courses');
    return res.data;
  },

  async saveCourse(course: Course): Promise<{ success: boolean; course: Course }> {
    const res = await axiosClient.post('/courses', course);
    return res.data;
  },

  async getOfferings(): Promise<CourseOffering[]> {
    const res = await axiosClient.get('/offerings');
    return res.data;
  },

  async updateOfferingCapacity(id: string, capacity: number): Promise<{ success: boolean; offering: CourseOffering }> {
    const res = await axiosClient.post(`/offerings/${id}/capacity`, { capacity });
    return res.data;
  },

  // Students
  async getStudents(filters?: { risk?: string; level?: number; track?: string; search?: string }): Promise<Student[]> {
    const res = await axiosClient.get('/students', { params: filters });
    return res.data;
  },

  async getStudentById(id: string): Promise<Student & { riskDetails: any; academicStatus: any }> {
    const res = await axiosClient.get(`/students/${id}`);
    return res.data;
  },

  async getRecommendations(studentId: string): Promise<CourseRecommendation[]> {
    const res = await axiosClient.get(`/students/${studentId}/recommendations`);
    return res.data;
  },

  async getStudyPlan(studentId: string, pace?: string, regenerate?: boolean): Promise<StudyPlan> {
    const res = await axiosClient.get(`/students/${studentId}/study-plan`, {
      params: { pace: pace || 'NORMAL', regenerate: regenerate ? 'true' : 'false' },
    });
    return res.data;
  },

  async submitStudyPlan(studentId: string, pace?: string, plan?: StudyPlan): Promise<{ success: boolean; status: string; plan?: StudyPlan }> {
    const res = await axiosClient.post(`/students/${studentId}/study-plan/submit`, { pace, plan });
    return res.data;
  },

  async resetStudyPlan(studentId: string, pace?: string): Promise<{ success: boolean; status: string; plan?: StudyPlan }> {
    const res = await axiosClient.post(`/students/${studentId}/study-plan/reset`, { pace });
    return res.data;
  },

  async getGpaPlans(studentId: string): Promise<GpaImprovementPlan[]> {
    const res = await axiosClient.get(`/students/${studentId}/gpa-plans`);
    return res.data;
  },

  async simulateWhatIf(studentId: string, items: { courseCode: string; projectedGrade: string }[]): Promise<any> {
    const res = await axiosClient.post(`/students/${studentId}/what-if`, { items });
    return res.data;
  },

  async registerCourses(studentId: string, courseCodes: string[], isSummer?: boolean): Promise<any> {
    const res = await axiosClient.post(`/students/${studentId}/register`, { courseCodes, isSummer });
    return res.data;
  },

  // Intelligent Registration Advisor API Methods
  async getRegistrationRecommendation(studentId: string, isSummer?: boolean): Promise<SemesterScheduleRecommendation> {
    const res = await axiosClient.get(`/students/${studentId}/registration-recommendation`, {
      params: { isSummer: isSummer ? 'true' : 'false' },
    });
    return res.data;
  },

  async validateRegistrationSchedule(
    studentId: string,
    data: { offeringIds?: string[]; courseCodes?: string[]; isSummer?: boolean }
  ): Promise<RegistrationValidationDetails> {
    const res = await axiosClient.post(`/students/${studentId}/validate-registration`, data);
    return res.data;
  },

  async resolveScheduleConflicts(
    studentId: string,
    data: { courseCodes: string[]; currentOfferingIds?: string[] }
  ): Promise<{
    resolved: boolean;
    resolvedOfferings?: CourseOffering[];
    resolutionSummaryAr: string[];
    resolutionSummaryEn: string[];
    reasonAr?: string;
    reasonEn?: string;
  }> {
    const res = await axiosClient.post(`/students/${studentId}/resolve-schedule-conflicts`, data);
    return res.data;
  },

  async simulateScheduleWhatIf(
    studentId: string,
    data: {
      currentCourseCodes: string[];
      action: {
        type: 'ADD' | 'REMOVE' | 'REPLACE';
        targetCourseCode: string;
        replacementCourseCode?: string;
      };
    }
  ): Promise<ScheduleWhatIfResult> {
    const res = await axiosClient.post(`/students/${studentId}/what-if-schedule`, data);
    return res.data;
  },

  async getDegreeGraduationPlan(studentId: string): Promise<StudyPlan> {
    const res = await axiosClient.get(`/students/${studentId}/degree-plan`);
    return res.data;
  },

  async submitProposedSchedule(
    studentId: string,
    data: { offeringIds?: string[]; courseCodes?: string[]; notes?: string }
  ): Promise<any> {
    const res = await axiosClient.post(`/students/${studentId}/submit-proposed-schedule`, data);
    return res.data;
  },

  async approveAdvisorSchedule(data: {
    studentId: string;
    decision: 'APPROVE' | 'REJECT';
    courseCodes?: string[];
    notes?: string;
  }): Promise<any> {
    const res = await axiosClient.post('/advisors/approve-schedule', data);
    return res.data;
  },

  async submitTraining(studentId: string, data: { company: string; hours: number; periodWeeks: number }): Promise<any> {
    const res = await axiosClient.post(`/students/${studentId}/training`, data);
    return res.data;
  },

  async getOfficialTranscript(studentId: string): Promise<any> {
    const res = await axiosClient.get(`/reports/transcript/${encodeURIComponent(studentId)}`);
    return res.data;
  },

  // Advisor
  async getAdvisorStudents(): Promise<Student[]> {
    const res = await axiosClient.get('/advisor/students');
    return res.data;
  },

  async assignStudentsToAdvisor(advisorId: string, studentIds: string[]): Promise<{
    success: boolean;
    advisorId: string;
    assignedCount: number;
    messageAr?: string;
    messageEn?: string;
  }> {
    const res = await axiosClient.post(`/advisors/${encodeURIComponent(advisorId)}/assign-students`, {
      studentIds,
    });
    return res.data;
  },

  async getAdvisorAssignedStudents(advisorId: string): Promise<any[]> {
    const res = await axiosClient.get(`/advisors/${encodeURIComponent(advisorId)}/assigned-students`);
    return res.data;
  },

  async decidePlan(studentId: string, decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES', notes: string): Promise<any> {
    const res = await axiosClient.post(`/advisor/plans/${studentId}/decision`, { decision, notes });
    return res.data;
  },

  // Instructor
  async getInstructorCourses(): Promise<{ offerings: CourseOffering[]; courses: Course[] }> {
    const res = await axiosClient.get('/instructor/courses');
    return res.data;
  },

  async getCourseEnrolledStudents(code: string): Promise<any[]> {
    const res = await axiosClient.get(`/instructor/courses/${encodeURIComponent(code)}/students`);
    return res.data;
  },

  async saveGrades(code: string, studentId: string, courseworkMark: number, finalMark: number): Promise<any> {
    const res = await axiosClient.post(`/instructor/courses/${encodeURIComponent(code)}/grades`, {
      studentId,
      courseworkMark,
      finalMark,
    });
    return res.data;
  },

  async saveAttendance(code: string, studentId: string, attendancePercentage: number): Promise<any> {
    const res = await axiosClient.post(`/instructor/courses/${encodeURIComponent(code)}/attendance`, {
      studentId,
      attendancePercentage,
    });
    return res.data;
  },

  // Admin & Config
  async getAcademicRules(): Promise<AcademicRuleConfig[]> {
    const res = await axiosClient.get('/admin/rules');
    return res.data;
  },

  async updateAcademicRule(id: string, data: Partial<AcademicRuleConfig>): Promise<any> {
    const res = await axiosClient.post(`/admin/rules/${id}`, data);
    return res.data;
  },

  async getAuditLogs(): Promise<AuditLogItem[]> {
    const res = await axiosClient.get('/admin/audit');
    return res.data;
  },

  async importCsvData(type: 'STUDENTS' | 'COURSES' | 'GRADES', csvData: string): Promise<any> {
    const res = await axiosClient.post('/admin/import', { type, csvData });
    return res.data;
  },

  async importStudentsExcel(file: File, wipeData: boolean = false): Promise<{
    success: boolean;
    importedStudentsCount: number;
    totalRegistrationsCount: number;
    wipedData: boolean;
    messageAr: string;
    messageEn: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('wipeData', String(wipeData));

    const res = await axiosClient.post('/admin/import/students-excel', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  // Department Head
  async getDepartmentAnalytics(): Promise<any> {
    const res = await axiosClient.get('/department/analytics');
    return res.data;
  },

  // Notifications
  async getNotifications(recipientId?: string): Promise<NotificationItem[]> {
    const res = await axiosClient.get('/notifications', { params: { recipientId: recipientId || '' } });
    return res.data;
  },

  async markNotificationRead(id: string): Promise<any> {
    const res = await axiosClient.post(`/notifications/${id}/read`);
    return res.data;
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
    const res = await axiosClient.get('/ready');
    return res.data;
  },

  async getSisStatus(): Promise<{
    connected: boolean;
    latencyMs: number;
    sisVersion: string;
    error?: string;
  }> {
    const res = await axiosClient.get('/integration/sis/status');
    return res.data;
  },

  async syncSisNow(): Promise<any> {
    const res = await axiosClient.post('/integration/sis/sync-now');
    return res.data;
  },
};
