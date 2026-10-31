import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { AcademicRuleConfig, AuditLogItem, Course, CourseOffering, Student } from '../../types/index.js';
import { UserManagementView } from './UserManagementView.js';
import { DataImportView } from './DataImportView.js';
import {
  PageHeader,
  Panel,
  PanelHeader,
  Chip,
  CodeBadge,
  Meter,
  Loader,
  EmptyState,
  Segmented,
  Modal,
  Toast,
  Field,
  cn,
  chipClass,
  toneColor,
  roleLabel,
  roleTone,
  trackLabel,
  trackTone,
  pick,
  personName,
  type Tone,
} from '../ui/index.js';
import {
  Gauge,
  BookOpen,
  SlidersHorizontal,
  Scale,
  UploadCloud,
  History,
  UserCog,
  RefreshCw,
  RotateCcw,
  Search,
  Plus,
  Pencil,
  Key,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface AdminDashboardProps {
  currentTab?: string;
  onNavigateTab?: (tab: string) => void;
}

type AdminTab = 'OVERVIEW' | 'USERS' | 'COURSES' | 'OFFERINGS' | 'RULES' | 'IMPORT' | 'AUDIT';

const mapTabFromProp = (tab?: string): AdminTab => {
  switch (tab) {
    case 'admin-users':
      return 'USERS';
    case 'admin-courses':
      return 'COURSES';
    case 'admin-offerings':
      return 'OFFERINGS';
    case 'admin-rules':
      return 'RULES';
    case 'admin-import':
      return 'IMPORT';
    case 'admin-audit':
      return 'AUDIT';
    case 'admin-dashboard':
    default:
      return 'OVERVIEW';
  }
};

// --- Audit vocabulary ---------------------------------------------------------
const AUDIT_ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  LOGIN: { ar: 'تسجيل دخول', en: 'Signed in' },
  LOGIN_CREDENTIALS: { ar: 'تسجيل دخول', en: 'Signed in' },
  LOGOUT: { ar: 'تسجيل خروج', en: 'Signed out' },
  CREATE_USER: { ar: 'إنشاء حساب', en: 'Account created' },
  UPDATE_USER: { ar: 'تعديل حساب', en: 'Account updated' },
  DELETE_USER: { ar: 'حذف حساب', en: 'Account deleted' },
  RESET_PASSWORD: { ar: 'إعادة تعيين كلمة المرور', en: 'Password reset' },
  ASSIGN_STUDENTS: { ar: 'إسناد طلاب لمرشد', en: 'Students assigned' },
  COURSE_SAVED: { ar: 'حفظ مقرر', en: 'Course saved' },
  UPDATE_CAPACITY: { ar: 'تعديل سعة شعبة', en: 'Section capacity changed' },
  UPDATE_ACADEMIC_RULE: { ar: 'تعديل قاعدة لائحة', en: 'Bylaw rule changed' },
  CONFIGURE_ACADEMIC_RULE: { ar: 'ضبط قاعدة لائحة', en: 'Bylaw rule configured' },
  CSV_DATA_IMPORT: { ar: 'استيراد CSV', en: 'CSV import' },
  EXCEL_BULK_STUDENT_IMPORT: { ar: 'استيراد ملف Excel', en: 'Excel import' },
  SIS_INCREMENTAL_SYNC: { ar: 'مزامنة ابن الهيثم', en: 'Ibn Al-Haitham sync' },
  GENERATE_TRANSCRIPT: { ar: 'إصدار سجل موثق', en: 'Transcript issued' },
  REGISTER_COURSES: { ar: 'تسجيل مقررات', en: 'Courses registered' },
  SUBMIT_PLAN: { ar: 'إرسال خطة دراسية', en: 'Study plan submitted' },
  APPROVE_STUDY_PLAN: { ar: 'اعتماد خطة دراسية', en: 'Study plan approved' },
  PLAN_APPROVE: { ar: 'اعتماد خطة دراسية', en: 'Study plan approved' },
  PLAN_REJECT: { ar: 'رفض خطة دراسية', en: 'Study plan rejected' },
  PLAN_REQUEST_CHANGES: { ar: 'طلب تعديل خطة', en: 'Plan changes requested' },
  SUBMIT_PROPOSED_SCHEDULE: { ar: 'إرسال جدول مقترح', en: 'Schedule submitted' },
  ADVISOR_APPROVE_SCHEDULE: { ar: 'اعتماد جدول', en: 'Schedule approved' },
  ADVISOR_REJECT_SCHEDULE: { ar: 'رفض جدول', en: 'Schedule rejected' },
  SUBMIT_GRADE: { ar: 'رصد درجة', en: 'Grade recorded' },
  UPDATE_GRADES: { ar: 'رصد درجات', en: 'Grades recorded' },
  UPDATE_ATTENDANCE: { ar: 'تحديث الحضور', en: 'Attendance updated' },
  SUBMIT_TRAINING: { ar: 'تقديم تدريب صيفي', en: 'Training submitted' },
  APPROVE: { ar: 'اعتماد', en: 'Approved' },
};

const AUDIT_ENTITY_LABELS: Record<string, { ar: string; en: string }> = {
  Course: { ar: 'مقرر', en: 'Course' },
  CourseOffering: { ar: 'شعبة', en: 'Section' },
  AcademicRuleConfig: { ar: 'قاعدة لائحة', en: 'Bylaw rule' },
  AcademicRule: { ar: 'قاعدة لائحة', en: 'Bylaw rule' },
  UniversitySIS: { ar: 'نظام ابن الهيثم', en: 'Ibn Al-Haitham SIS' },
  User: { ar: 'حساب', en: 'Account' },
  Student: { ar: 'طالب', en: 'Student' },
  StudyPlan: { ar: 'خطة دراسية', en: 'Study plan' },
  Registration: { ar: 'تسجيل', en: 'Registration' },
  Transcript: { ar: 'سجل موثق', en: 'Transcript' },
};

const humanize = (code: string) => {
  const s = code.replace(/_/g, ' ').toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const auditActionTone = (action: string): Tone => {
  if (/DELETE|REJECT/.test(action)) return 'signal';
  if (/RESET/.test(action)) return 'caution';
  if (/IMPORT|SYNC/.test(action)) return 'plum';
  if (/LOGIN|LOGOUT/.test(action)) return 'ink';
  if (/APPROVE|CREATE|SAVED/.test(action)) return 'sign';
  return 'lane';
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentTab, onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();

  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>(() => mapTabFromProp(currentTab));

  // Keep the internal tab in step with the header route line.
  useEffect(() => {
    if (currentTab) {
      setActiveAdminTab(mapTabFromProp(currentTab));
    }
  }, [currentTab]);

  const handleSelectTab = (tab: AdminTab) => {
    setActiveAdminTab(tab);
    if (onNavigateTab) {
      switch (tab) {
        case 'OVERVIEW':
          onNavigateTab('admin-dashboard');
          break;
        case 'USERS':
          onNavigateTab('admin-users');
          break;
        case 'COURSES':
          onNavigateTab('admin-courses');
          break;
        case 'OFFERINGS':
          onNavigateTab('admin-offerings');
          break;
        case 'RULES':
          onNavigateTab('admin-rules');
          break;
        case 'IMPORT':
          onNavigateTab('admin-import');
          break;
        case 'AUDIT':
          onNavigateTab('admin-audit');
          break;
      }
    }
  };

  const [rules, setRules] = useState<AcademicRuleConfig[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [systemReadiness, setSystemReadiness] = useState<any>(null);
  const [sisStatus, setSisStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [courseSearch, setCourseSearch] = useState('');
  const [courseLevelFilter, setCourseLevelFilter] = useState('ALL');
  const [offeringSearch, setOfferingSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditRoleFilter, setAuditRoleFilter] = useState('ALL');

  // Course Add/Edit Modal
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Partial<Course>>({
    code: '',
    nameAr: '',
    nameEn: '',
    credits: 3,
    level: 1,
    semester: 1,
    isMandatory: true,
    department: 'Computer Science',
    prerequisites: [],
  });
  // Raw text of the prerequisites field, so commas can be typed freely.
  const [prereqText, setPrereqText] = useState('');
  const [savingCourse, setSavingCourse] = useState(false);

  // Import State (kept for the legacy CSV path; the IMPORT tab uses DataImportView)
  const [importType, setImportType] = useState<'STUDENTS' | 'COURSES' | 'GRADES'>('STUDENTS');
  const sampleData: Record<string, string> = {
    STUDENTS: `code,name,gpa\n20250001,محمد أحمد محمود,3.40\n20250002,فاطمة علي إبراهيم,2.15\n20250003,ياسر مصطفى بدر,1.75\n20250004,هند طارق سليم,3.88`,
    COURSES: `code,name,credits\nCS 220,نظم التشغيل المتقدمة,3\nCS 340,معالجة اللغات الطبيعية,3\nIS 210,تحليل وتصميم النظم,3`,
    GRADES: `studentCode,courseCode,grade,term\n2021001,CS 101,A,2026-01\n2021002,CS 102,B+,2026-01\n2021003,BS 101,C,2026-01`,
  };
  const [csvText, setCsvText] = useState(sampleData.STUDENTS);
  const [importReport, setImportReport] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  // Feedback toast (replaces the old inline alert banner)
  const [toast, setToast] = useState<{ tone: 'sign' | 'signal' | 'caution'; text: string } | null>(null);
  const [syncingSis, setSyncingSis] = useState(false);

  const notify = (text: string, tone: 'sign' | 'signal' | 'caution' = 'sign') => setToast({ tone, text });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const serverMessage = (err: any, fallbackAr: string, fallbackEn: string) => {
    const data = err?.response?.data;
    if (language === 'ar') return data?.messageAr || fallbackAr;
    return data?.messageEn || data?.error || fallbackEn;
  };

  async function loadAdminData() {
    try {
      setLoading(true);
      const [rulesData, coursesData, offeringsData, auditData, studentsData, readyData, sisData] = await Promise.all([
        api.getAcademicRules().catch(() => []),
        api.getCourses().catch(() => []),
        api.getOfferings().catch(() => []),
        api.getAuditLogs().catch(() => []),
        api.getStudents().catch(() => []),
        api.getSystemReadiness().catch(() => null),
        api.getSisStatus().catch(() => null),
      ]);
      setRules(rulesData);
      setCourses(coursesData);
      setOfferings(offeringsData);
      setAuditLogs(auditData);
      setStudents(studentsData);
      setSystemReadiness(readyData);
      setSisStatus(sisData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleUpdateRule = async (ruleId: string, val: any): Promise<boolean> => {
    try {
      const res = await api.updateAcademicRule(ruleId, { value: val });
      if (res.success) {
        setRules(prev => prev.map(r => (r.id === ruleId ? res.rule : r)));
        notify(t('حُفظت القاعدة وسُجّل التعديل في سجل العمليات.', 'Rule saved and recorded in the audit log.'));
        const audits = await api.getAuditLogs();
        setAuditLogs(audits);
        return true;
      }
      notify(t('لم تُحفظ القاعدة. حاول مرة أخرى.', 'The rule was not saved. Try again.'), 'signal');
      return false;
    } catch (err) {
      console.error('Error updating rule:', err);
      notify(serverMessage(err, 'لم تُحفظ القاعدة. تأكد من الاتصال بالخادم.', 'The rule was not saved. Check the server connection.'), 'signal');
      return false;
    }
  };

  const handleUpdateCapacity = async (offeringId: string, cap: number): Promise<boolean> => {
    try {
      const res = await api.updateOfferingCapacity(offeringId, cap);
      if (res.success) {
        setOfferings(prev => prev.map(o => (o.id === offeringId ? res.offering : o)));
        notify(t('حُفظت سعة الشعبة الجديدة.', 'New section capacity saved.'));
        const audits = await api.getAuditLogs();
        setAuditLogs(audits);
        return true;
      }
      notify(t('لم تُحفظ السعة. حاول مرة أخرى.', 'Capacity was not saved. Try again.'), 'signal');
      return false;
    } catch (err) {
      console.error('Error updating capacity:', err);
      notify(serverMessage(err, 'لم تُحفظ السعة. تأكد من الاتصال بالخادم.', 'Capacity was not saved. Check the server connection.'), 'signal');
      return false;
    }
  };

  /** Save a capacity field on blur/Enter — skips unchanged or invalid values. */
  const commitCapacity = async (off: CourseOffering, input: HTMLInputElement) => {
    const raw = input.value.trim();
    const next = Number(raw);
    if (raw === '' || !Number.isFinite(next) || next < 0) {
      input.value = String(off.capacity);
      return;
    }
    const rounded = Math.round(next);
    if (rounded === off.capacity) return;
    const ok = await handleUpdateCapacity(off.id, rounded);
    if (!ok) input.value = String(off.capacity);
  };

  /** Save a rule value on blur/Enter — skips unchanged values. */
  const commitRule = async (rule: AcademicRuleConfig, input: HTMLInputElement) => {
    const next = input.value.trim();
    if (next === String(rule.value ?? '')) return;
    if (next === '') {
      input.value = String(rule.value ?? '');
      return;
    }
    const ok = await handleUpdateRule(rule.id, next);
    if (!ok) input.value = String(rule.value ?? '');
  };

  const openCourseModal = (course?: Course) => {
    const base: Partial<Course> = course || {
      code: '',
      nameAr: '',
      nameEn: '',
      credits: 3,
      level: 1,
      semester: 1,
      isMandatory: true,
      department: 'Computer Science',
      prerequisites: [],
    };
    setEditingCourse(base);
    setPrereqText((base.prerequisites || []).join(', '));
    setShowCourseModal(true);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse.code || !editingCourse.nameAr) return;

    try {
      setSavingCourse(true);
      const res = await api.saveCourse({
        id: editingCourse.id || `c_${Date.now()}`,
        code: editingCourse.code.toUpperCase(),
        nameAr: editingCourse.nameAr,
        nameEn: editingCourse.nameEn || editingCourse.nameAr,
        credits: Number(editingCourse.credits) || 3,
        level: Number(editingCourse.level) || 1,
        semester: (Number(editingCourse.semester) || 1) as 1 | 2,
        isMandatory: editingCourse.isMandatory ?? true,
        track: editingCourse.track,
        department: editingCourse.department || 'Computer Science',
        prerequisites: editingCourse.prerequisites || [],
      });

      if (res.success) {
        notify(t(`حُفظ المقرر ${editingCourse.code.toUpperCase()} في دليل المقررات.`, `Course ${editingCourse.code.toUpperCase()} saved to the catalogue.`));
        setShowCourseModal(false);
        const refreshed = await api.getCourses();
        setCourses(refreshed);
        const audits = await api.getAuditLogs();
        setAuditLogs(audits);
      }
    } catch (err) {
      console.error('Failed to save course:', err);
      notify(serverMessage(err, 'لم يُحفظ المقرر. راجع البيانات وحاول مرة أخرى.', 'The course was not saved. Check the details and try again.'), 'signal');
    } finally {
      setSavingCourse(false);
    }
  };

  const handleRunImport = async () => {
    try {
      setImporting(true);
      setImportReport(null);
      const res = await api.importCsvData(importType, csvText);
      setImportReport(res);
      const [audits, studentsRefreshed, coursesRefreshed] = await Promise.all([
        api.getAuditLogs(),
        api.getStudents(),
        api.getCourses(),
      ]);
      setAuditLogs(audits);
      setStudents(studentsRefreshed);
      setCourses(coursesRefreshed);
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setImporting(false);
    }
  };

  const handleTriggerSisSync = async () => {
    try {
      setSyncingSis(true);
      const res = await api.syncSisNow();
      const [audits, sis] = await Promise.all([api.getAuditLogs(), api.getSisStatus()]);
      setAuditLogs(audits);
      setSisStatus(sis);
      const pulledStudents = res?.result?.students?.length ?? 0;
      const pulledCourses = res?.result?.courses?.length ?? 0;
      if (sis && !sis.connected) {
        notify(
          t(
            'سُجّلت محاولة المزامنة، لكن بوابة ابن الهيثم غير مربوطة بعد فلم تصل بيانات جديدة.',
            'The sync attempt was logged, but the Ibn Al-Haitham gateway is not connected yet, so no new data arrived.'
          ),
          'caution'
        );
      } else {
        notify(
          t(
            `اكتملت المزامنة: ${pulledStudents} طالب و${pulledCourses} مقرر من ابن الهيثم.`,
            `Sync finished: ${pulledStudents} students and ${pulledCourses} courses from Ibn Al-Haitham.`
          )
        );
      }
    } catch (err) {
      console.error('SIS sync error:', err);
      notify(serverMessage(err, 'فشلت المزامنة مع ابن الهيثم. حاول لاحقاً.', 'The Ibn Al-Haitham sync failed. Try again later.'), 'signal');
    } finally {
      setSyncingSis(false);
    }
  };

  const formatDateTime = (iso: string, withDate = true) => {
    try {
      return new Date(iso).toLocaleString(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
        ...(withDate ? { day: 'numeric', month: 'short' } : {}),
        hour: '2-digit',
        minute: '2-digit',
      } as Intl.DateTimeFormatOptions);
    } catch {
      return iso;
    }
  };

  const formatDay = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const actionLabel = (action: string) => {
    const known = AUDIT_ACTION_LABELS[action];
    if (known) return language === 'ar' ? known.ar : known.en;
    return humanize(action);
  };

  const entityLabel = (entity: string) => {
    const known = AUDIT_ENTITY_LABELS[entity];
    if (known) return language === 'ar' ? known.ar : known.en;
    return entity;
  };

  const filteredCourses = courses.filter(c => {
    if (courseLevelFilter !== 'ALL' && c.level !== Number(courseLevelFilter)) return false;
    if (courseSearch) {
      const q = courseSearch.toLowerCase();
      return (
        c.code.toLowerCase().includes(q) ||
        c.nameAr.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredOfferings = offerings.filter(o => {
    if (offeringSearch) {
      const q = offeringSearch.toLowerCase();
      return (
        o.courseCode.toLowerCase().includes(q) ||
        o.instructorName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredAudits = auditLogs.filter(l => {
    if (auditRoleFilter !== 'ALL' && l.userRole !== auditRoleFilter) return false;
    if (auditSearch) {
      const q = auditSearch.toLowerCase();
      return (
        l.userName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        actionLabel(l.action).toLowerCase().includes(q) ||
        (l.detailsAr && l.detailsAr.toLowerCase().includes(q)) ||
        (l.detailsEn && l.detailsEn.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const criticalStudentsCount = students.filter(s => s.riskLevel === 'CRITICAL').length;
  const highRiskStudentsCount = students.filter(s => s.riskLevel === 'HIGH').length;

  if (loading) {
    return <Loader label={t('جارٍ تحميل بيانات الإدارة…', 'Loading administration data…')} />;
  }

  const Chevron = language === 'ar' ? ChevronLeft : ChevronRight;
  const courseNameByCode: Record<string, Course> = {};
  courses.forEach(c => {
    courseNameByCode[c.code] = c;
  });
  const rulesNeedingReview = rules.filter(r => r.needsVerification).length;
  const totalEnrolled = offerings.reduce((sum, o) => sum + o.enrolledCount, 0);
  const fullSections = offerings.filter(o => o.enrolledCount >= o.capacity).length;
  const nearFullSections = offerings.filter(o => o.enrolledCount < o.capacity && o.enrolledCount / Math.max(1, o.capacity) >= 0.9).length;

  // ---------------------------------------------------------------------------
  // Status board rows (overview)
  // ---------------------------------------------------------------------------
  type SignalState = 'ok' | 'warn' | 'down' | 'unknown';
  const stateTone: Record<SignalState, Tone> = { ok: 'sign', warn: 'caution', down: 'signal', unknown: 'ink' };

  const dbState: SignalState = !systemReadiness
    ? 'unknown'
    : systemReadiness.database === 'POSTGRESQL_CONNECTED'
    ? 'ok'
    : 'down';
  const sisNotConfigured =
    !!sisStatus && !sisStatus.connected && typeof sisStatus.error === 'string' && sisStatus.error.includes('IBN_ALHAITHAM_API_URL');
  const sisState: SignalState = !sisStatus ? 'unknown' : sisStatus.connected ? 'ok' : sisNotConfigured ? 'warn' : 'down';
  const rulesState: SignalState = systemReadiness?.bylawsEngine === 'LOADED' || rules.length > 0 ? 'ok' : 'warn';

  const signals: Array<{
    key: string;
    name: string;
    state: SignalState;
    status: string;
    detail: string;
    action?: React.ReactNode;
  }> = [
    {
      key: 'db',
      name: t('قاعدة البيانات', 'Database'),
      state: dbState,
      status:
        dbState === 'ok' ? t('متصلة', 'Connected') : dbState === 'down' ? t('منقطعة', 'Disconnected') : t('لا رد', 'No response'),
      detail:
        dbState === 'ok'
          ? t(`PostgreSQL، زمن الاستجابة ${systemReadiness?.latencyMs ?? 0} مللي ثانية`, `PostgreSQL, ${systemReadiness?.latencyMs ?? 0} ms response time`)
          : t('تحقق من تشغيل خادم قاعدة البيانات ومتغير DATABASE_URL.', 'Check the database server and the DATABASE_URL setting.'),
    },
    {
      key: 'rules',
      name: t('محرك اللائحة', 'Bylaw engine'),
      state: rulesState,
      status: rulesState === 'ok' ? t('يعمل', 'Running') : t('بلا قواعد', 'No rules'),
      detail: t(
        `${rules.length} قاعدة محمّلة، منها ${rulesNeedingReview} بحاجة لتدقيق`,
        `${rules.length} rules loaded, ${rulesNeedingReview} need review`
      ),
      action: (
        <button type="button" onClick={() => handleSelectTab('RULES')} className="btn btn-ghost btn-sm">
          {t('مراجعة القواعد', 'Review rules')}
        </button>
      ),
    },
    {
      key: 'sis',
      name: t('ربط ابن الهيثم', 'Ibn Al-Haitham link'),
      state: sisState,
      status:
        sisState === 'ok'
          ? t('متصل', 'Connected')
          : sisState === 'warn'
          ? t('بانتظار الربط', 'Not set up')
          : sisState === 'down'
          ? t('غير متاح', 'Unavailable')
          : t('لا رد', 'No response'),
      detail:
        sisState === 'ok'
          ? `${sisStatus?.sisVersion || ''}${sisStatus?.latencyMs ? t(`، ${sisStatus.latencyMs} مللي ثانية`, `, ${sisStatus.latencyMs} ms`) : ''}`
          : sisState === 'warn'
          ? t('لم يُضبط عنوان البوابة IBN_ALHAITHAM_API_URL في إعدادات الخادم بعد.', 'The gateway address IBN_ALHAITHAM_API_URL is not set on the server yet.')
          : t('تعذر الوصول إلى بوابة ابن الهيثم.', 'The Ibn Al-Haitham gateway could not be reached.'),
      action: (
        <button type="button" onClick={handleTriggerSisSync} disabled={syncingSis} className="btn btn-ghost btn-sm">
          <RefreshCw aria-hidden="true" className={syncingSis ? 'animate-spin' : ''} />
          {syncingSis ? t('جارٍ المزامنة…', 'Syncing…') : t('مزامنة الآن', 'Sync now')}
        </button>
      ),
    },
    {
      key: 'audit',
      name: t('سجل العمليات', 'Audit log'),
      state: 'ok',
      status: t('يسجّل', 'Recording'),
      detail: auditLogs[0]
        ? t(`${auditLogs.length} عملية، آخرها ${formatDateTime(auditLogs[0].timestamp)}`, `${auditLogs.length} entries, latest ${formatDateTime(auditLogs[0].timestamp)}`)
        : t('لا توجد عمليات مسجلة بعد.', 'Nothing recorded yet.'),
      action: (
        <button type="button" onClick={() => handleSelectTab('AUDIT')} className="btn btn-ghost btn-sm">
          {t('فتح السجل', 'Open log')}
        </button>
      ),
    },
  ];

  const areas: Array<{ tab: AdminTab; icon: LucideIcon; title: string; purpose: string; hint?: string; hintTone?: Tone }> = [
    {
      tab: 'USERS',
      icon: UserCog,
      title: t('المستخدمون والصلاحيات', 'Users and roles'),
      purpose: t('إنشاء الحسابات، تعديل الأدوار، وإسناد الطلاب للمرشدين.', 'Create accounts, change roles and assign students to advisors.'),
    },
    {
      tab: 'COURSES',
      icon: BookOpen,
      title: t('دليل المقررات', 'Course catalogue'),
      purpose: t('المقررات ومتطلباتها السابقة وعدد ما يفتحه كل مقرر.', 'Courses, their prerequisites and what each one unlocks.'),
      hint: t(`${courses.length} مقرر`, `${courses.length} courses`),
    },
    {
      tab: 'OFFERINGS',
      icon: SlidersHorizontal,
      title: t('الشعب والمقاعد', 'Sections and seats'),
      purpose: t('سعة كل شعبة ونسبة امتلائها.', 'Capacity and fill rate of every section.'),
      hint: fullSections > 0 ? t(`${fullSections} ممتلئة`, `${fullSections} full`) : undefined,
      hintTone: 'signal',
    },
    {
      tab: 'RULES',
      icon: Scale,
      title: t('قواعد اللائحة', 'Bylaw rules'),
      purpose: t('حدود الساعات، أسقف الإعادة، وشروط التخرج والتدريب.', 'Credit limits, retake caps, graduation and training conditions.'),
      hint: rulesNeedingReview > 0 ? t(`${rulesNeedingReview} بحاجة لتدقيق`, `${rulesNeedingReview} to review`) : undefined,
      hintTone: 'caution',
    },
    {
      tab: 'IMPORT',
      icon: UploadCloud,
      title: t('استيراد البيانات', 'Data import'),
      purpose: t('رفع كشوف الطلاب والمقررات من Excel أو نص CSV.', 'Upload student and course sheets from Excel or CSV text.'),
    },
    {
      tab: 'AUDIT',
      icon: History,
      title: t('سجل العمليات', 'Audit log'),
      purpose: t('من غيّر ماذا ومتى، في كل أجزاء النظام.', 'Who changed what and when, across the system.'),
      hint: t(`${auditLogs.length} عملية`, `${auditLogs.length} entries`),
    },
  ];

  // Audit grouping by day + role options present in the log
  const auditGroups: Array<{ day: string; label: string; items: AuditLogItem[] }> = [];
  filteredAudits.forEach(log => {
    const d = new Date(log.timestamp);
    const key = isNaN(d.getTime()) ? log.timestamp : d.toDateString();
    let group = auditGroups.find(g => g.day === key);
    if (!group) {
      group = { day: key, label: formatDay(log.timestamp), items: [] };
      auditGroups.push(group);
    }
    group.items.push(log);
  });

  const roleCounts: Record<string, number> = {};
  auditLogs.forEach(l => {
    roleCounts[l.userRole] = (roleCounts[l.userRole] || 0) + 1;
  });
  const presentRoles = Object.keys(roleCounts).sort((a, b) => roleCounts[b] - roleCounts[a]);
  if (auditRoleFilter !== 'ALL' && !presentRoles.includes(auditRoleFilter)) presentRoles.push(auditRoleFilter);

  const renderChange = (before: any, after: any) => {
    const asRecord = (v: any): Record<string, any> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
    const b = asRecord(before);
    const a = asRecord(after);
    const show = (v: any) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (b || a) {
      const keys = Array.from(new Set([...Object.keys(b || {}), ...Object.keys(a || {})]));
      return keys.map(k => (
        <span key={k} className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-ink-50 px-2 py-1 text-[12px] ring-1 ring-ink-200">
          <span className="text-ink-500">{k}:</span>
          <span className="t-num text-ink-600 line-through decoration-signal-400">{show(b?.[k])}</span>
          <Chevron className="h-3 w-3 text-ink-400" aria-hidden="true" />
          <span className="t-num font-bold text-ink-900">{show(a?.[k])}</span>
        </span>
      ));
    }
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-ink-50 px-2 py-1 text-[12px] ring-1 ring-ink-200">
        <span className="t-num text-ink-600 line-through decoration-signal-400">{show(before)}</span>
        <Chevron className="h-3 w-3 text-ink-400" aria-hidden="true" />
        <span className="t-num font-bold text-ink-900">{show(after)}</span>
      </span>
    );
  };

  const searchField = (value: string, onChange: (v: string) => void, placeholder: string, label: string, id: string) => (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="field ps-9"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      {toast && (
        <Toast tone={toast.tone} onClose={() => setToast(null)} closeLabel={t('إغلاق', 'Close')}>
          {toast.text}
        </Toast>
      )}

      {/* ===================================================================
          OVERVIEW — system status board
          =================================================================== */}
      {activeAdminTab === 'OVERVIEW' && (
        <>
          <PageHeader
            icon={Gauge}
            title={t('حالة النظام', 'System status')}
            description={t(
              'قاعدة البيانات ومحرك اللائحة والربط مع ابن الهيثم في مكان واحد، مع أرقام الكلية الأساسية.',
              'The database, bylaw engine and Ibn Al-Haitham link in one place, with the faculty’s key figures.'
            )}
            actions={
              <>
                <button type="button" onClick={loadAdminData} className="btn btn-secondary">
                  <RotateCcw aria-hidden="true" />
                  {t('تحديث البيانات', 'Refresh data')}
                </button>
                <button type="button" onClick={handleTriggerSisSync} disabled={syncingSis} className="btn btn-primary">
                  <RefreshCw aria-hidden="true" className={syncingSis ? 'animate-spin' : ''} />
                  {syncingSis ? t('جارٍ المزامنة…', 'Syncing…') : t('مزامنة ابن الهيثم', 'Sync Ibn Al-Haitham')}
                </button>
              </>
            }
          />

          {/* Service status board */}
          <Panel padded={false}>
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:px-6">
              <h2 className="text-[16px] font-bold text-ink-950">{t('حالة الخدمات', 'Service status')}</h2>
              <span className="text-[12px] text-ink-500">
                {signals.every(s => s.state === 'ok')
                  ? t('كل الخدمات تعمل', 'All services running')
                  : t(`${signals.filter(s => s.state !== 'ok').length} خدمة تحتاج انتباهك`, `${signals.filter(s => s.state !== 'ok').length} need attention`)}
              </span>
            </div>
            <ul className="divide-y divide-ink-100">
              {signals.map(sig => {
                const tone = stateTone[sig.state];
                return (
                  <li
                    key={sig.key}
                    className="stripe-start grid grid-cols-1 gap-2 px-5 py-4 sm:px-6 md:grid-cols-[200px_130px_minmax(0,1fr)_auto] md:items-center md:gap-4"
                    style={{ ['--stripe' as any]: toneColor[tone] }}
                  >
                    <span className="flex items-center gap-2.5 text-[14px] font-bold text-ink-900">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: toneColor[tone],
                          boxShadow: `0 0 0 4px color-mix(in srgb, ${toneColor[tone]} 18%, transparent)`,
                        }}
                        aria-hidden="true"
                      />
                      {sig.name}
                    </span>
                    <span>
                      <span className={chipClass[tone]}>{sig.status}</span>
                    </span>
                    <span className="text-[13px] leading-6 text-ink-600">{sig.detail}</span>
                    <span className="md:justify-self-end">{sig.action}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* Figures strip */}
          <Panel padded={false}>
            <div className="grid grid-cols-2 lg:grid-cols-5">
              {[
                {
                  key: 'students',
                  label: t('الطلاب', 'Students'),
                  value: students.length || systemReadiness?.persistedStudentsCount || 0,
                  foot: t(`${criticalStudentsCount} حرج، ${highRiskStudentsCount} مرتفع الخطر`, `${criticalStudentsCount} critical, ${highRiskStudentsCount} high risk`),
                  footTone: criticalStudentsCount + highRiskStudentsCount > 0 ? 'text-signal-600' : 'text-ink-500',
                },
                {
                  key: 'courses',
                  label: t('المقررات', 'Courses'),
                  value: courses.length,
                  foot: t(
                    `${courses.filter(c => c.isMandatory).length} إجباري، ${courses.filter(c => !c.isMandatory).length} اختياري`,
                    `${courses.filter(c => c.isMandatory).length} required, ${courses.filter(c => !c.isMandatory).length} elective`
                  ),
                  tab: 'COURSES' as AdminTab,
                },
                {
                  key: 'sections',
                  label: t('الشعب المطروحة', 'Sections offered'),
                  value: offerings.length,
                  foot: t(`${totalEnrolled} مقعد مشغول`, `${totalEnrolled} seats taken`),
                  tab: 'OFFERINGS' as AdminTab,
                },
                {
                  key: 'rules',
                  label: t('قواعد اللائحة', 'Bylaw rules'),
                  value: rules.length,
                  foot: t(`${rulesNeedingReview} بحاجة لتدقيق`, `${rulesNeedingReview} to review`),
                  footTone: rulesNeedingReview > 0 ? 'text-caution-700' : 'text-ink-500',
                  tab: 'RULES' as AdminTab,
                },
                {
                  key: 'audit',
                  label: t('عمليات مسجلة', 'Logged actions'),
                  value: auditLogs.length,
                  foot: t('لا يمكن تعديلها أو حذفها', 'Cannot be edited or deleted'),
                  tab: 'AUDIT' as AdminTab,
                },
              ].map((fig, i) => {
                const body = (
                  <>
                    <span className="block text-[12.5px] font-medium text-ink-500">{fig.label}</span>
                    <span className="t-num mt-1 block text-[28px] font-extrabold leading-none text-ink-950">{fig.value}</span>
                    <span className={cn('mt-2 block text-[12px] leading-5', fig.footTone || 'text-ink-500')}>{fig.foot}</span>
                  </>
                );
                const cellCls = cn(
                  'px-5 py-5 text-start sm:px-6',
                  i > 0 && 'border-ink-100',
                  i % 2 === 1 && 'border-s',
                  i >= 2 && 'border-t lg:border-t-0',
                  i > 0 && 'lg:border-s',
                  i === 4 && 'col-span-2 lg:col-span-1'
                );
                return fig.tab ? (
                  <button
                    key={fig.key}
                    type="button"
                    onClick={() => handleSelectTab(fig.tab!)}
                    className={cn(cellCls, 'transition hover:bg-ink-50')}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={fig.key} className={cellCls}>
                    {body}
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Admin areas */}
            <Panel>
              <PanelHeader
                icon={Gauge}
                title={t('أقسام الإدارة', 'Admin areas')}
                description={t('كل ما يمكنك ضبطه في النظام.', 'Everything you can configure in the system.')}
              />
              <ul className="-mx-2 space-y-1">
                {areas.map(area => {
                  const Icon = area.icon;
                  return (
                    <li key={area.tab}>
                      <button
                        type="button"
                        onClick={() => handleSelectTab(area.tab)}
                        className="group flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-start transition hover:bg-ink-50"
                      >
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-700 transition group-hover:bg-sign-600 group-hover:text-white">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-ink-900">
                            {area.title}
                            {area.hint && <span className={chipClass[area.hintTone || 'ink']}>{area.hint}</span>}
                          </span>
                          <span className="block text-[12.5px] leading-5 text-ink-500">{area.purpose}</span>
                        </span>
                        <Chevron className="mt-2 h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-ink-700" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {/* Recent audit */}
            <Panel>
              <PanelHeader
                icon={History}
                title={t('آخر العمليات', 'Latest activity')}
                description={t('أحدث خمس عمليات في سجل العمليات.', 'The five most recent audit entries.')}
                actions={
                  <button type="button" onClick={() => handleSelectTab('AUDIT')} className="btn btn-secondary btn-sm">
                    {t('عرض السجل كاملاً', 'View full log')}
                  </button>
                }
              />
              {auditLogs.length === 0 ? (
                <EmptyState icon={History} title={t('لا توجد عمليات بعد', 'No activity yet')} />
              ) : (
                <ol className="space-y-0">
                  {auditLogs.slice(0, 5).map((log, i, arr) => {
                    const tone = auditActionTone(log.action);
                    return (
                      <li key={log.id} className="relative ps-6 pb-4 last:pb-0">
                        {i < arr.length - 1 && (
                          <span className="absolute start-[5px] top-4 bottom-0 w-[2px] bg-ink-200" aria-hidden="true" />
                        )}
                        <span
                          className="absolute start-0 top-1.5 h-3 w-3 rounded-full ring-2 ring-white"
                          style={{ background: toneColor[tone] }}
                          aria-hidden="true"
                        />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[13px] font-bold text-ink-900">{actionLabel(log.action)}</span>
                          <span className="text-[12px] text-ink-500">{formatDateTime(log.timestamp)}</span>
                        </div>
                        <p className="text-[12.5px] leading-6 text-ink-600">
                          <span className="font-semibold text-ink-800">{log.userName}</span>
                          {' '}
                          <span className="text-ink-400">({pick(language, roleLabel[log.userRole], log.userRole)})</span>
                          {': '}
                          {language === 'ar' ? log.detailsAr : log.detailsEn}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          </div>
        </>
      )}

      {/* ===================================================================
          USERS — owned by UserManagementView
          =================================================================== */}
      {activeAdminTab === 'USERS' && <UserManagementView />}

      {/* ===================================================================
          COURSES — catalogue
          =================================================================== */}
      {activeAdminTab === 'COURSES' && (
        <>
          <PageHeader
            icon={BookOpen}
            title={t('دليل المقررات', 'Course catalogue')}
            description={t(
              `${courses.length} مقرراً في برنامج علوم الحاسب مع متطلباتها السابقة وما يفتحه كل مقرر. عدّل أي مقرر أو أضف مقرراً جديداً.`,
              `${courses.length} Computer Science courses with their prerequisites and what each unlocks. Edit any course or add a new one.`
            )}
            actions={
              <button type="button" onClick={() => openCourseModal()} className="btn btn-primary">
                <Plus aria-hidden="true" />
                {t('إضافة مقرر', 'Add course')}
              </button>
            }
          />

          <Panel padded={false}>
            <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              {searchField(
                courseSearch,
                setCourseSearch,
                t('ابحث بالكود أو الاسم، مثل CS 101', 'Search by code or name, e.g. CS 101'),
                t('بحث في المقررات', 'Search courses'),
                'admin-course-search'
              )}
              <Segmented
                ariaLabel={t('تصفية حسب المستوى', 'Filter by level')}
                value={courseLevelFilter}
                onChange={setCourseLevelFilter}
                options={[
                  { value: 'ALL', label: t('كل المستويات', 'All levels'), count: courses.length },
                  ...[1, 2, 3, 4].map(lvl => ({
                    value: String(lvl),
                    label: t(`المستوى ${lvl}`, `Level ${lvl}`),
                    count: courses.filter(c => c.level === lvl).length,
                  })),
                ]}
              />
            </div>

            <div className="scroll-x border-t border-ink-100">
              <table className="data-table min-w-[920px]">
                <thead>
                  <tr>
                    <th>{t('المقرر', 'Course')}</th>
                    <th className="num">{t('الساعات', 'Credits')}</th>
                    <th>{t('المستوى والفصل', 'Level and term')}</th>
                    <th>{t('المتطلبات السابقة', 'Prerequisites')}</th>
                    <th>{t('يفتح', 'Unlocks')}</th>
                    <th>{t('النوع والمسار', 'Type and track')}</th>
                    <th className="num">
                      <span className="sr-only">{t('إجراءات', 'Actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={Search}
                          title={t('لا توجد مقررات مطابقة', 'No matching courses')}
                          description={t('غيّر كلمة البحث أو المستوى.', 'Change the search words or the level.')}
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredCourses.map(course => (
                      <tr key={course.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <CodeBadge code={course.code} variant="solid" />
                            <div className="min-w-0">
                              <p className="font-semibold text-ink-900">{language === 'ar' ? course.nameAr : course.nameEn}</p>
                              <p className="text-[12px] text-ink-500">{language === 'ar' ? course.nameEn : course.nameAr}</p>
                            </div>
                          </div>
                        </td>
                        <td className="num font-bold">{course.credits}</td>
                        <td className="whitespace-nowrap text-ink-600">
                          {t(`المستوى ${course.level}، الفصل ${course.semester === 2 ? 'الثاني' : 'الأول'}`, `Level ${course.level}, term ${course.semester}`)}
                        </td>
                        <td>
                          {course.prerequisites.length === 0 ? (
                            <span className="text-[12.5px] text-ink-400">{t('بلا متطلبات', 'None')}</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {course.prerequisites.map(p => (
                                <CodeBadge key={p} code={p} title={courseNameByCode[p] ? (language === 'ar' ? courseNameByCode[p].nameAr : courseNameByCode[p].nameEn) : undefined} />
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-route-800">
                            <Key className="h-3.5 w-3.5" aria-hidden="true" />
                            {t(`${course.unlockedCoursesCount || 0} مقررات`, `${course.unlockedCoursesCount || 0} courses`)}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            <Chip tone={course.isMandatory ? 'ink' : 'route'}>{course.isMandatory ? t('إجباري', 'Required') : t('اختياري', 'Elective')}</Chip>
                            {course.track && <Chip tone={trackTone[course.track] || 'ink'}>{pick(language, trackLabel[course.track], course.track)}</Chip>}
                          </div>
                        </td>
                        <td className="num">
                          <button
                            type="button"
                            onClick={() => openCourseModal(course)}
                            className="btn btn-ghost btn-sm"
                            aria-label={t(`تعديل ${course.code}`, `Edit ${course.code}`)}
                          >
                            <Pencil aria-hidden="true" />
                            {t('تعديل', 'Edit')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {/* ===================================================================
          OFFERINGS — sections and seats
          =================================================================== */}
      {activeAdminTab === 'OFFERINGS' && (
        <>
          <PageHeader
            icon={SlidersHorizontal}
            title={t('الشعب والمقاعد', 'Sections and seats')}
            description={t(
              'سعة كل شعبة ونسبة امتلائها. اكتب السعة الجديدة ثم اضغط Enter أو انتقل خارج الحقل لحفظها.',
              'Capacity and fill rate for every section. Type a new capacity, then press Enter or leave the field to save it.'
            )}
            meta={
              <>
                <Chip tone="ink">{t(`${offerings.length} شعبة`, `${offerings.length} sections`)}</Chip>
                <Chip tone="sign">{t(`${totalEnrolled} مقعد مشغول`, `${totalEnrolled} seats taken`)}</Chip>
                {fullSections > 0 && <Chip tone="signal">{t(`${fullSections} ممتلئة`, `${fullSections} full`)}</Chip>}
                {nearFullSections > 0 && <Chip tone="caution">{t(`${nearFullSections} شبه ممتلئة`, `${nearFullSections} nearly full`)}</Chip>}
              </>
            }
          />

          <Panel padded={false}>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              {searchField(
                offeringSearch,
                setOfferingSearch,
                t('ابحث بكود المقرر أو اسم الأستاذ', 'Search by course code or instructor'),
                t('بحث في الشعب', 'Search sections'),
                'admin-offering-search'
              )}
              <span className="text-[12.5px] text-ink-500">
                {t(`${filteredOfferings.length} من ${offerings.length} شعبة`, `${filteredOfferings.length} of ${offerings.length} sections`)}
              </span>
            </div>

            <div className="scroll-x border-t border-ink-100">
              <table className="data-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>{t('المقرر والشعبة', 'Course and section')}</th>
                    <th>{t('الأستاذ', 'Instructor')}</th>
                    <th>{t('الموعد والقاعة', 'Time and room')}</th>
                    <th className="num">{t('المسجلون', 'Enrolled')}</th>
                    <th>{t('السعة', 'Capacity')}</th>
                    <th>{t('الامتلاء', 'Fill rate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOfferings.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState icon={Search} title={t('لا توجد شعب مطابقة', 'No matching sections')} description={t('غيّر كلمة البحث.', 'Change the search words.')} />
                      </td>
                    </tr>
                  ) : (
                    filteredOfferings.map(off => {
                      const pressurePct = Math.round((off.enrolledCount / Math.max(1, off.capacity)) * 100);
                      const fillTone: Tone = pressurePct >= 90 ? 'signal' : pressurePct >= 75 ? 'caution' : 'sign';
                      const course = courseNameByCode[off.courseCode];
                      return (
                        <tr key={off.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <CodeBadge code={off.courseCode} variant="solid" />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-ink-900">
                                  {course ? (language === 'ar' ? course.nameAr : course.nameEn) : off.courseCode}
                                </p>
                                <p className="text-[12px] text-ink-500">{off.sectionCode || t('شعبة واحدة', 'Single section')}</p>
                              </div>
                            </div>
                          </td>
                          <td className="text-ink-700">{personName(off.instructorName, language)}</td>
                          <td className="text-ink-600">
                            <span className="block">{language === 'ar' ? off.lectureDayTimeAr : off.lectureDayTimeEn}</span>
                            <span className="block text-[12px] text-ink-500">{off.hall}</span>
                          </td>
                          <td className="num font-bold">{off.enrolledCount}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <input
                                key={`${off.id}:${off.capacity}`}
                                type="number"
                                min={0}
                                inputMode="numeric"
                                defaultValue={off.capacity}
                                onBlur={e => commitCapacity(off, e.currentTarget)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                  if (e.key === 'Escape') {
                                    e.currentTarget.value = String(off.capacity);
                                    e.currentTarget.blur();
                                  }
                                }}
                                aria-label={t(`سعة شعبة ${off.courseCode}`, `Capacity of ${off.courseCode}`)}
                                className="field field-sm w-24 text-center font-bold"
                              />
                              <span className="text-[12px] text-ink-500">{t('مقعد', 'seats')}</span>
                            </div>
                          </td>
                          <td className="min-w-[160px]">
                            <div className="mb-1 flex items-center justify-between text-[12px]">
                              <span className={cn('t-num font-bold', fillTone === 'signal' ? 'text-signal-600' : fillTone === 'caution' ? 'text-caution-700' : 'text-ink-700')}>
                                {pressurePct}%
                              </span>
                              {off.enrolledCount >= off.capacity && <span className="font-semibold text-signal-600">{t('ممتلئة', 'Full')}</span>}
                            </div>
                            <Meter value={pressurePct} tone={fillTone} label={t('نسبة امتلاء الشعبة', 'Section fill rate')} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {/* ===================================================================
          RULES — bylaw values
          =================================================================== */}
      {activeAdminTab === 'RULES' && (
        <>
          <PageHeader
            icon={Scale}
            title={t('قواعد اللائحة', 'Bylaw rules')}
            description={t(
              'القيم التي يطبقها النظام عند التسجيل والتخطيط. يُحفظ التعديل عند الخروج من الحقل أو الضغط على Enter، ويظهر في سجل العمليات.',
              'The values the system applies to registration and planning. A change saves when you leave the field or press Enter, and appears in the audit log.'
            )}
            meta={
              <>
                <Chip tone="ink">{t(`${rules.length} قاعدة`, `${rules.length} rules`)}</Chip>
                {rulesNeedingReview > 0 && (
                  <Chip tone="caution" icon={AlertTriangle}>
                    {t(`${rulesNeedingReview} بحاجة لتدقيق`, `${rulesNeedingReview} need review`)}
                  </Chip>
                )}
              </>
            }
          />

          {rulesNeedingReview > 0 && (
            <div className="callout callout-caution">
              <AlertTriangle aria-hidden="true" />
              <p>
                {t(
                  'بعض القواعد تختلف بين وثائق الكلية (مثل ساعات مشروع التخرج 3 أم 6، وساعات التدريب الصيفي). راجع القيمة المعتمدة رسمياً وعدّلها هنا؛ تُطبق فوراً على التسجيل والخطط.',
                  'Some rules differ between faculty documents (for example graduation project hours, 3 or 6, and summer training hours). Check the officially approved value and set it here; it applies to registration and plans immediately.'
                )}
              </p>
            </div>
          )}

          <Panel padded={false}>
            {rules.length === 0 ? (
              <EmptyState icon={Scale} title={t('لا توجد قواعد محمّلة', 'No rules loaded')} description={t('تأكد من تشغيل قاعدة البيانات ثم حدّث الصفحة.', 'Make sure the database is running, then refresh.')} />
            ) : (
              <ul className="divide-y divide-ink-100">
                {rules.map(rule => {
                  const isDefault = String(rule.value) === String(rule.defaultValue);
                  return (
                    <li
                      key={rule.id}
                      className={cn(
                        'stripe-start grid grid-cols-1 gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center',
                        rule.needsVerification && 'bg-caution-50/40'
                      )}
                      style={{ ['--stripe' as any]: rule.needsVerification ? toneColor.caution : 'transparent' }}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[14.5px] font-bold text-ink-950">{language === 'ar' ? rule.titleAr : rule.titleEn}</h3>
                          {rule.needsVerification && (
                            <Chip tone="caution" icon={AlertTriangle}>
                              {t('بحاجة لتدقيق', 'Needs review')}
                            </Chip>
                          )}
                        </div>
                        <p className="mt-1 max-w-[70ch] text-[13px] leading-6 text-ink-600">{language === 'ar' ? rule.notesAr : rule.notesEn}</p>
                        <p className="mt-1 text-[11.5px] text-ink-400" dir="ltr">
                          {rule.key}
                        </p>
                      </div>

                      <div>
                        <label htmlFor={`rule-${rule.id}`} className="field-label">
                          {t('القيمة المطبقة', 'Value in use')}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id={`rule-${rule.id}`}
                            key={`${rule.id}:${String(rule.value)}`}
                            type="text"
                            dir="ltr"
                            defaultValue={rule.value}
                            onBlur={e => commitRule(rule, e.currentTarget)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') {
                                e.currentTarget.value = String(rule.value ?? '');
                                e.currentTarget.blur();
                              }
                            }}
                            className="field w-32 text-center font-bold"
                          />
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => handleUpdateRule(rule.id, String(rule.defaultValue))}
                              className="btn btn-ghost btn-sm"
                              title={t('إرجاع القيمة الأصلية', 'Restore the original value')}
                            >
                              <Undo2 aria-hidden="true" />
                              {t('الأصلية', 'Default')}
                            </button>
                          )}
                        </div>
                        <p className="field-hint">
                          {t('القيمة الأصلية:', 'Original value:')}{' '}
                          <span className="t-num font-semibold text-ink-700">{String(rule.defaultValue)}</span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      )}

      {/* ===================================================================
          IMPORT — owned by DataImportView
          =================================================================== */}
      {activeAdminTab === 'IMPORT' && <DataImportView onDataImported={loadAdminData} />}

      {/* ===================================================================
          AUDIT — timeline
          =================================================================== */}
      {activeAdminTab === 'AUDIT' && (
        <>
          <PageHeader
            icon={History}
            title={t('سجل العمليات', 'Audit log')}
            description={t(
              'كل تغيير في النظام: من قام به ومتى وعلى أي سجل. السجل للقراءة فقط ولا يمكن تعديله.',
              'Every change in the system: who made it, when, and on which record. The log is read-only.'
            )}
            meta={<Chip tone="ink">{t(`${filteredAudits.length} عملية مطابقة`, `${filteredAudits.length} matching entries`)}</Chip>}
          />

          <Panel padded={false}>
            <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              {searchField(
                auditSearch,
                setAuditSearch,
                t('ابحث باسم المستخدم أو العملية أو التفاصيل', 'Search by user, action or details'),
                t('بحث في السجل', 'Search the log'),
                'admin-audit-search'
              )}
              <Segmented
                ariaLabel={t('تصفية حسب الدور', 'Filter by role')}
                value={auditRoleFilter}
                onChange={setAuditRoleFilter}
                options={[
                  { value: 'ALL', label: t('الجميع', 'Everyone'), count: auditLogs.length },
                  ...presentRoles.map(r => ({
                    value: r,
                    label: pick(language, roleLabel[r], r),
                    count: roleCounts[r] || 0,
                  })),
                ]}
              />
            </div>

            <div className="border-t border-ink-100 px-4 py-5 sm:px-6">
              {auditGroups.length === 0 ? (
                <EmptyState
                  icon={History}
                  title={t('لا توجد عمليات مطابقة', 'No matching entries')}
                  description={t('غيّر كلمة البحث أو الدور.', 'Change the search words or the role.')}
                />
              ) : (
                <div className="space-y-6">
                  {auditGroups.map(group => (
                    <section key={group.day}>
                      <h3 className="mb-3 text-[13px] font-bold text-ink-700">{group.label}</h3>
                      <ol>
                        {group.items.map((log, i) => {
                          const tone = auditActionTone(log.action);
                          return (
                            <li key={log.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
                              <time dateTime={log.timestamp} className="t-num pt-0.5 text-[12px] text-ink-500">
                                {formatDateTime(log.timestamp, false)}
                              </time>
                              <div className="relative ps-6 pb-5">
                                {i < group.items.length - 1 && (
                                  <span className="absolute start-[5px] top-4 bottom-0 w-[2px] bg-ink-200" aria-hidden="true" />
                                )}
                                <span
                                  className="absolute start-0 top-1.5 h-3 w-3 rounded-full ring-2 ring-white"
                                  style={{ background: toneColor[tone] }}
                                  aria-hidden="true"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[13.5px] font-bold text-ink-950">{actionLabel(log.action)}</span>
                                  <Chip tone={roleTone[log.userRole] || 'ink'}>{pick(language, roleLabel[log.userRole], log.userRole)}</Chip>
                                  <span className="text-[12px] text-ink-500">
                                    {entityLabel(log.entity)}
                                    {log.entityId && (
                                      <>
                                        {' '}
                                        <span dir="ltr" className="font-semibold text-ink-700">
                                          {log.entityId}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[13px] leading-6 text-ink-700 [overflow-wrap:anywhere]">
                                  <span className="font-semibold text-ink-900">{log.userName}</span>
                                  {': '}
                                  {language === 'ar' ? log.detailsAr : log.detailsEn}
                                </p>
                                {(log.before || log.after) && <div className="mt-2 flex flex-wrap gap-2">{renderChange(log.before, log.after)}</div>}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </>
      )}

      {/* ===================================================================
          Add / edit course
          =================================================================== */}
      {showCourseModal && (
        <Modal
          onClose={() => setShowCourseModal(false)}
          icon={BookOpen}
          size="lg"
          title={editingCourse.id ? t(`تعديل المقرر ${editingCourse.code || ''}`, `Edit course ${editingCourse.code || ''}`) : t('إضافة مقرر جديد', 'Add a new course')}
          subtitle={t('يظهر التعديل فوراً في التوصيات والخطط والتسجيل.', 'Changes show up immediately in recommendations, plans and registration.')}
          closeLabel={t('إغلاق', 'Close')}
          dismissible={!savingCourse}
          footer={
            <>
              <button type="button" onClick={() => setShowCourseModal(false)} className="btn btn-ghost" disabled={savingCourse}>
                {t('إلغاء', 'Cancel')}
              </button>
              <button type="submit" form="admin-course-form" className="btn btn-primary" disabled={savingCourse}>
                {savingCourse ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المقرر', 'Save course')}
              </button>
            </>
          }
        >
          <form id="admin-course-form" onSubmit={handleSaveCourse} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('كود المقرر', 'Course code')} htmlFor="course-code" hint={t('مثل CS 101', 'For example CS 101')}>
              <input
                id="course-code"
                type="text"
                required
                dir="ltr"
                value={editingCourse.code || ''}
                onChange={e => setEditingCourse({ ...editingCourse, code: e.target.value })}
                className="field uppercase rtl:text-end"
              />
            </Field>
            <Field label={t('عدد الساعات المعتمدة', 'Credit hours')} htmlFor="course-credits">
              <input
                id="course-credits"
                type="number"
                min="1"
                max="6"
                required
                value={editingCourse.credits || 3}
                onChange={e => setEditingCourse({ ...editingCourse, credits: Number(e.target.value) })}
                className="field"
              />
            </Field>
            <Field label={t('اسم المقرر بالعربية', 'Arabic name')} htmlFor="course-name-ar" className="sm:col-span-2">
              <input
                id="course-name-ar"
                type="text"
                required
                dir="rtl"
                value={editingCourse.nameAr || ''}
                onChange={e => setEditingCourse({ ...editingCourse, nameAr: e.target.value })}
                className="field"
              />
            </Field>
            <Field
              label={t('اسم المقرر بالإنجليزية', 'English name')}
              htmlFor="course-name-en"
              hint={t('إذا تُرك فارغاً يُستخدم الاسم العربي.', 'If left empty, the Arabic name is used.')}
              className="sm:col-span-2"
            >
              <input
                id="course-name-en"
                type="text"
                dir="ltr"
                value={editingCourse.nameEn || ''}
                onChange={e => setEditingCourse({ ...editingCourse, nameEn: e.target.value })}
                className="field rtl:text-end"
              />
            </Field>
            <Field label={t('المستوى', 'Level')} htmlFor="course-level">
              <select
                id="course-level"
                value={editingCourse.level || 1}
                onChange={e => setEditingCourse({ ...editingCourse, level: Number(e.target.value) })}
                className="field"
              >
                {[1, 2, 3, 4].map(l => (
                  <option key={l} value={l}>
                    {t(`المستوى ${l}`, `Level ${l}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('الفصل الدراسي', 'Term')} htmlFor="course-semester">
              <select
                id="course-semester"
                value={editingCourse.semester || 1}
                onChange={e => setEditingCourse({ ...editingCourse, semester: Number(e.target.value) as 1 | 2 })}
                className="field"
              >
                <option value="1">{t('الفصل الأول', 'First term')}</option>
                <option value="2">{t('الفصل الثاني', 'Second term')}</option>
              </select>
            </Field>
            <Field label={t('المسار', 'Track')} htmlFor="course-track" hint={t('للمقررات الاختيارية الخاصة بمسار.', 'For electives that belong to a track.')}>
              <select
                id="course-track"
                value={editingCourse.track || ''}
                onChange={e =>
                  setEditingCourse({
                    ...editingCourse,
                    track: (e.target.value || undefined) as Course['track'],
                  })
                }
                className="field"
              >
                <option value="">{t('بدون مسار', 'No track')}</option>
                {Object.keys(trackLabel).map(tr => (
                  <option key={tr} value={tr}>
                    {pick(language, trackLabel[tr], tr)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('المتطلبات السابقة', 'Prerequisites')}
              htmlFor="course-prereqs"
              hint={t('أكواد مفصولة بفاصلة، مثل CS 101, BS 101', 'Codes separated by commas, e.g. CS 101, BS 101')}
            >
              <input
                id="course-prereqs"
                type="text"
                dir="ltr"
                value={prereqText}
                onChange={e => {
                  setPrereqText(e.target.value);
                  setEditingCourse({
                    ...editingCourse,
                    prerequisites: e.target.value
                      .split(',')
                      .map(p => p.trim().toUpperCase())
                      .filter(Boolean),
                  });
                }}
                className="field rtl:text-end"
              />
            </Field>
            {(editingCourse.prerequisites || []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
                <span className="text-[12px] text-ink-500">{t('سيُحفظ:', 'Will be saved:')}</span>
                {(editingCourse.prerequisites || []).map(p => (
                  <CodeBadge key={p} code={p} variant={courseNameByCode[p] ? 'soft' : 'signal'} title={courseNameByCode[p] ? undefined : t('كود غير موجود في الدليل', 'Code not in the catalogue')} />
                ))}
              </div>
            )}
            <label htmlFor="mandatoryCheck" className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 bg-ink-50 p-3 sm:col-span-2">
              <input
                type="checkbox"
                id="mandatoryCheck"
                checked={editingCourse.isMandatory ?? true}
                onChange={e => setEditingCourse({ ...editingCourse, isMandatory: e.target.checked })}
                className="mt-1 h-4 w-4 accent-[var(--color-sign-600)]"
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-ink-900">{t('مقرر إجباري', 'Required course')}</span>
                <span className="block text-[12.5px] text-ink-500">
                  {t('يجب أن يجتازه كل طلاب البرنامج للتخرج.', 'Every student in the programme must pass it to graduate.')}
                </span>
              </span>
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
};
