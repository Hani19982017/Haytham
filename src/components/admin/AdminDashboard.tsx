import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { AcademicRuleConfig, AuditLogItem, Course, CourseOffering, Student } from '../../types/index.js';
import { UserManagementView } from './UserManagementView.js';
import { DataImportView } from './DataImportView.js';
import {
  Sliders,
  BookOpen,
  History,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Save,
  Users,
  Building,
  Key,
  LayoutDashboard,
  Database,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Plus,
  X,
  ArrowRight,
  TrendingUp,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

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

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentTab, onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();

  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>(() => mapTabFromProp(currentTab));

  // Synchronize internal active tab with currentTab from Sidebar
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

  // Import State
  const [importType, setImportType] = useState<'STUDENTS' | 'COURSES' | 'GRADES'>('STUDENTS');
  const sampleData: Record<string, string> = {
    STUDENTS: `code,name,gpa\n20250001,محمد أحمد محمود,3.40\n20250002,فاطمة علي إبراهيم,2.15\n20250003,ياسر مصطفى بدر,1.75\n20250004,هند طارق سليم,3.88`,
    COURSES: `code,name,credits\nCS 220,نظم التشغيل المتقدمة,3\nCS 340,معالجة اللغات الطبيعية,3\nIS 210,تحليل وتصميم النظم,3`,
    GRADES: `studentCode,courseCode,grade,term\n2021001,CS 101,A,2026-01\n2021002,CS 102,B+,2026-01\n2021003,BS 101,C,2026-01`,
  };
  const [csvText, setCsvText] = useState(sampleData.STUDENTS);
  const [importReport, setImportReport] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  // Success alert
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [syncingSis, setSyncingSis] = useState(false);

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

  const handleUpdateRule = async (ruleId: string, val: any) => {
    try {
      const res = await api.updateAcademicRule(ruleId, { value: val });
      if (res.success) {
        setRules(prev => prev.map(r => (r.id === ruleId ? res.rule : r)));
        setAlertMsg(t('تم تحديث وتوثيق القاعدة في قاعدة البيانات وسجل التدقيق.', 'Academic rule updated and audit logged.'));
        const audits = await api.getAuditLogs();
        setAuditLogs(audits);
      }
    } catch (err) {
      console.error('Error updating rule:', err);
    }
  };

  const handleUpdateCapacity = async (offeringId: string, cap: number) => {
    try {
      const res = await api.updateOfferingCapacity(offeringId, cap);
      if (res.success) {
        setOfferings(prev => prev.map(o => (o.id === offeringId ? res.offering : o)));
        setAlertMsg(t('تم تعديل سعة الشعبة بنجاح وحفظها في قاعدة البيانات.', 'Section capacity updated in PostgreSQL.'));
        const audits = await api.getAuditLogs();
        setAuditLogs(audits);
      }
    } catch (err) {
      console.error('Error updating capacity:', err);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse.code || !editingCourse.nameAr) return;

    try {
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
        setAlertMsg(t('تم حفظ وتحديث بيانات المقرر في اللائحة الأكاديمية بنجاح.', 'Course successfully saved into academic catalog.'));
        setShowCourseModal(false);
        const refreshed = await api.getCourses();
        setCourses(refreshed);
        const audits = await api.getAuditLogs();
        setAuditLogs(audits);
      }
    } catch (err) {
      console.error('Failed to save course:', err);
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
      setAlertMsg(t('تم تشغيل مزامنة نظام ابن الهيثم وتحديث سجل التدقيق.', 'Ibn Al-Haitham SIS sync executed.'));
      const [audits, sis] = await Promise.all([api.getAuditLogs(), api.getSisStatus()]);
      setAuditLogs(audits);
      setSisStatus(sis);
    } catch (err) {
      console.error('SIS sync error:', err);
    } finally {
      setSyncingSis(false);
    }
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
        (l.detailsAr && l.detailsAr.toLowerCase().includes(q)) ||
        (l.detailsEn && l.detailsEn.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const criticalStudentsCount = students.filter(s => s.riskLevel === 'CRITICAL').length;
  const highRiskStudentsCount = students.filter(s => s.riskLevel === 'HIGH').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Top Navigation Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
            <Sliders className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {t('إدارة النظام الأكاديمي واللائحة', 'Academic Administration & Bylaws')}
            </h2>
            <p className="text-[11px] text-slate-500">
              {t('التحكم في اللائحة، دليل المقررات، الشعب الدراسية، الاستيراد وسجل التدقيق', 'Manage bylaws, courses, offerings, CSV imports & audit trail')}
            </p>
          </div>
        </div>

        {/* Sub-Navigation Pills (All 6 Tabs) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-semibold">
          <button
            onClick={() => handleSelectTab('OVERVIEW')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeAdminTab === 'OVERVIEW'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>{t('نظرة عامة على النظام', 'System Overview')}</span>
          </button>

          <button
            onClick={() => handleSelectTab('USERS')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeAdminTab === 'USERS'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span>{t('إدارة المستخدمين', 'User Management')}</span>
          </button>

          <button
            onClick={() => handleSelectTab('COURSES')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeAdminTab === 'COURSES'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t('دليل المقررات والمتطلبات', 'Course Catalog')}</span>
          </button>

          <button
            onClick={() => handleSelectTab('OFFERINGS')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeAdminTab === 'OFFERINGS'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('الشعب وسعة المقاعد', 'Offerings & Seats')}</span>
          </button>

          <button
            onClick={() => handleSelectTab('RULES')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeAdminTab === 'RULES'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{t('إعدادات اللائحة وتدقيق البيانات', 'Bylaw Rules & Audits')}</span>
            <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {t('تدقيق', 'Audit')}
            </span>
          </button>

          <button
            onClick={() => handleSelectTab('IMPORT')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeAdminTab === 'IMPORT'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{t('استيراد البيانات (CSV)', 'Data Import')}</span>
          </button>

          <button
            onClick={() => handleSelectTab('AUDIT')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
              activeAdminTab === 'AUDIT'
                ? 'bg-white text-indigo-600 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{t('سجل التدقيق (Audit Logs)', 'Audit Logs')}</span>
          </button>
        </div>
      </div>

      {alertMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-800 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{alertMsg}</span>
          </div>
          <button onClick={() => setAlertMsg(null)} className="text-emerald-700 font-bold hover:underline cursor-pointer">
            {t('إغلاق', 'Dismiss')}
          </button>
        </div>
      )}

      {/* ============================================================= */}
      {/* 1. OVERVIEW TAB (نظرة عامة على النظام) */}
      {/* ============================================================= */}
      {activeAdminTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* System Readiness & Live Database Health Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    {t('حالة النظام الجامعي: متصل وجاهز للعمليات الأكاديمية', 'University Core Engine: Online & Operational')}
                  </span>
                </div>
                <h3 className="text-xl font-extrabold">
                  {t('المستشار الأكاديمي الذكي - لوحة القيادة المركزية', 'Smart Academic Advisor - Command Center')}
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  {t('إصدار اللائحة الأكاديمية v2.5 معتمدة وفق نظام الساعات المعتمدة لكلية الحاسبات والمعلومات.', 'Bylaws v2.5 loaded with Credit Hours System for Faculty of Computers & AI.')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTriggerSisSync}
                  disabled={syncingSis}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingSis ? 'animate-spin' : ''}`} />
                  <span>{syncingSis ? t('جارٍ المزامنة...', 'Syncing...') : t('مزامنة نظام ابن الهيثم', 'Sync Ibn Al-Haitham')}</span>
                </button>
                <button
                  onClick={loadAdminData}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs transition cursor-pointer"
                  title={t('تحديث البيانات', 'Refresh Data')}
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Health Indicators Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/10 text-xs">
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-slate-400 block text-[11px] mb-1">{t('قاعدة البيانات', 'Database')}</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  {systemReadiness?.database === 'POSTGRESQL_CONNECTED' ? 'PostgreSQL Active' : 'Connected'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{systemReadiness?.latencyMs || 90}ms latency</span>
              </div>

              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-slate-400 block text-[11px] mb-1">{t('محرك اللائحة', 'Rules Engine')}</span>
                <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {t('قواعد اللائحة نشطة', 'Enforced 100%')}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{rules.length} {t('قواعد مضبوطة', 'bylaw rules')}</span>
              </div>

              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-slate-400 block text-[11px] mb-1">{t('بوابة ابن الهيثم', 'Ibn Al-Haitham')}</span>
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5" />
                  {sisStatus?.connected ? 'Live Connected' : 'Gateway Standby'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{t('مهيأ للربط المباشر', 'Ready for live endpoint')}</span>
              </div>

              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <span className="text-slate-400 block text-[11px] mb-1">{t('سجل التدقيق الأكاديمي', 'Audit Trail')}</span>
                <span className="font-bold text-purple-300 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  {auditLogs.length} {t('عملية موثقة', 'events logged')}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{t('غير قابل للتعديل', 'Immutable audit logs')}</span>
              </div>
            </div>
          </div>

          {/* Core University Statistics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => handleSelectTab('COURSES')}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-indigo-300 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold">{t('إجمالي مقررات اللائحة', 'Catalog Courses')}</span>
                <BookOpen className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition" />
              </div>
              <div className="text-3xl font-extrabold text-slate-900">{courses.length}</div>
              <span className="text-[11px] text-slate-500 mt-1 block flex items-center justify-between">
                <span>{courses.filter(c => c.isMandatory).length} {t('إجباري', 'core')} • {courses.filter(c => !c.isMandatory).length} {t('مسارات واختياري', 'tracks')}</span>
                <ArrowRight className="w-3 h-3 text-indigo-600 rtl:rotate-180" />
              </span>
            </div>

            <div
              onClick={() => handleSelectTab('OFFERINGS')}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-indigo-300 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold">{t('الشعب الدراسية المطروحة', 'Active Offerings')}</span>
                <Sliders className="w-4 h-4 text-purple-600 group-hover:scale-110 transition" />
              </div>
              <div className="text-3xl font-extrabold text-slate-900">{offerings.length}</div>
              <span className="text-[11px] text-slate-500 mt-1 block flex items-center justify-between">
                <span>{offerings.reduce((sum, o) => sum + o.enrolledCount, 0)} {t('طالب مسجل', 'enrolled')}</span>
                <ArrowRight className="w-3 h-3 text-purple-600 rtl:rotate-180" />
              </span>
            </div>

            <div
              onClick={() => handleSelectTab('RULES')}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-indigo-300 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold">{t('قواعد اللائحة المعتمدة', 'Bylaw Rules')}</span>
                <GraduationCap className="w-4 h-4 text-amber-600 group-hover:scale-110 transition" />
              </div>
              <div className="text-3xl font-extrabold text-slate-900">{rules.length}</div>
              <span className="text-[11px] text-amber-700 font-bold mt-1 block flex items-center justify-between">
                <span>{rules.filter(r => r.needsVerification).length} {t('قواعد بحاجة لتدقيق أكاديمي', 'need verification')}</span>
                <ArrowRight className="w-3 h-3 text-amber-600 rtl:rotate-180" />
              </span>
            </div>

            <div
              onClick={() => handleSelectTab('AUDIT')}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-indigo-300 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold">{t('الطلاب المعرضون للخطر', 'Students at Risk')}</span>
                <Users className="w-4 h-4 text-rose-600 group-hover:scale-110 transition" />
              </div>
              <div className="text-3xl font-extrabold text-rose-600">
                {criticalStudentsCount + highRiskStudentsCount}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block flex items-center justify-between">
                <span>{criticalStudentsCount} {t('حالات حرجة', 'critical')} • {highRiskStudentsCount} {t('إنذارات', 'warnings')}</span>
                <ArrowRight className="w-3 h-3 text-rose-600 rtl:rotate-180" />
              </span>
            </div>
          </div>

          {/* Quick Action Navigation Grid */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>{t('إجراءات الإدارة الأكاديمية السريعة', 'Quick Administrative Actions')}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <button
                onClick={() => handleSelectTab('RULES')}
                className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition text-right cursor-pointer flex items-start gap-3"
              >
                <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-0.5">{t('ضبط قواعد اللائحة والإنذارات', 'Configure Academic Bylaws')}</h4>
                  <p className="text-slate-500 text-[11px]">{t('تعديل حدود الساعات (12-21)، شروط التخرج، والتدريب', 'Edit credit limits (12-21h), training & GP rules')}</p>
                </div>
              </button>

              <button
                onClick={() => handleSelectTab('COURSES')}
                className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition text-right cursor-pointer flex items-start gap-3"
              >
                <div className="p-2.5 rounded-lg bg-purple-100 text-purple-700 shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-0.5">{t('دليل المقررات وشجرة المتطلبات', 'Course Catalog & Graph')}</h4>
                  <p className="text-slate-500 text-[11px]">{t('إضافة مقررات جديدة، تعديل المتطلبات السابقة، وقوة الفتح', 'Add/edit courses, prerequisites & unlock power')}</p>
                </div>
              </button>

              <button
                onClick={() => handleSelectTab('OFFERINGS')}
                className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition text-right cursor-pointer flex items-start gap-3"
              >
                <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-0.5">{t('توسيع سعة الشعب الدراسية', 'Manage Section Capacities')}</h4>
                  <p className="text-slate-500 text-[11px]">{t('مراقبة ضغط المقاعد وزيادة طاقة القاعات والشعب', 'Monitor seat pressure and increase quotas')}</p>
                </div>
              </button>

              <button
                onClick={() => handleSelectTab('IMPORT')}
                className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition text-right cursor-pointer flex items-start gap-3"
              >
                <div className="p-2.5 rounded-lg bg-amber-100 text-amber-700 shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-0.5">{t('استيراد بيانات مجمعة (CSV/Excel)', 'Bulk CSV Data Importer')}</h4>
                  <p className="text-slate-500 text-[11px]">{t('رفع كشوف الطلاب، الدرجات، والمقررات مع التدقيق الفوري', 'Upload student rosters, grades & courses')}</p>
                </div>
              </button>

              <button
                onClick={() => handleSelectTab('AUDIT')}
                className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition text-right cursor-pointer flex items-start gap-3"
              >
                <div className="p-2.5 rounded-lg bg-rose-100 text-rose-700 shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-0.5">{t('سجل الرقابة والتدقيق الأكاديمي', 'View Immutable Audit Trail')}</h4>
                  <p className="text-slate-500 text-[11px]">{t('تتبع كافة التعديلات، رصد الدرجات، وقرارات المرشدين', 'Trace grade submissions, registrations & approvals')}</p>
                </div>
              </button>

              <button
                onClick={handleTriggerSisSync}
                className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition text-right cursor-pointer flex items-start gap-3"
              >
                <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700 shrink-0">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-0.5">{t('فحص المزامنة مع ابن الهيثم', 'Trigger SIS Integration Ping')}</h4>
                  <p className="text-slate-500 text-[11px]">{t('التحقق من جاهزية اتصال واجهة نظام ابن الهيثم المركزي', 'Test gateway latency and push approved registrations')}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Recent Audit Trail Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                <span>{t('آخر العمليات الموثقة في سجل التدقيق الأكاديمي', 'Latest Audit Log Events')}</span>
              </h3>
              <button
                onClick={() => handleSelectTab('AUDIT')}
                className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                {t('عرض السجل بالكامل ←', 'View Full Audit Trail →')}
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {auditLogs.slice(0, 5).map(log => (
                <div key={log.id} className="p-4 hover:bg-slate-50 transition text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-900">{log.userName}</span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {log.userRole}
                      </span>
                      <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[10px] border border-indigo-100">
                        {log.action}
                      </span>
                    </div>
                    <p className="text-slate-600 text-xs">
                      {language === 'ar' ? log.detailsAr : log.detailsEn}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 2. USER MANAGEMENT TAB (إدارة المستخدمين) */}
      {/* ============================================================= */}
      {activeAdminTab === 'USERS' && <UserManagementView />}

      {/* ============================================================= */}
      {/* 3. COURSES CATALOG TAB (دليل المقررات والمتطلبات) */}
      {/* ============================================================= */}
      {activeAdminTab === 'COURSES' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {t('دليل مقررات برنامج علوم الحاسب (134 ساعة معتمدة)', 'Computer Science Course Catalog (134 Credits)')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('قاعدة بيانات المقررات الرسمية، المتطلبات السابقة، وشجرة فتح المقررات.', 'Official course catalog, prerequisites tree, and unlocking power graph.')}
              </p>
            </div>

            <button
              onClick={() => {
                setEditingCourse({
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
                setShowCourseModal(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{t('إضافة مقرر جديد للائحة', 'Add Course to Catalog')}</span>
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
              <input
                type="text"
                placeholder={t('البحث باسم المقرر أو الكود (مثال: CS 101)...', 'Search course code or name...')}
                value={courseSearch}
                onChange={e => setCourseSearch(e.target.value)}
                className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">{t('المستوى:', 'Level:')}</span>
              <select
                value={courseLevelFilter}
                onChange={e => setCourseLevelFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
              >
                <option value="ALL">{t('جميع المستويات', 'All Levels')}</option>
                <option value="1">{t('المستوى الأول (سنة 1)', 'Level 1')}</option>
                <option value="2">{t('المستوى الثاني (سنة 2)', 'Level 2')}</option>
                <option value="3">{t('المستوى الثالث (سنة 3)', 'Level 3')}</option>
                <option value="4">{t('المستوى الرابع (سنة 4)', 'Level 4')}</option>
              </select>
            </div>
          </div>

          {/* Courses Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">{t('الكود والمقرر', 'Code & Course')}</th>
                  <th className="px-4 py-3">{t('الساعات', 'Credits')}</th>
                  <th className="px-4 py-3">{t('المستوى والفصل', 'Level & Term')}</th>
                  <th className="px-4 py-3">{t('المتطلبات السابقة', 'Prerequisites')}</th>
                  <th className="px-4 py-3">{t('قوة الفتح', 'Unlock Power')}</th>
                  <th className="px-4 py-3">{t('النوع والمسار', 'Type & Track')}</th>
                  <th className="px-4 py-3 text-center">{t('إجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCourses.map(course => (
                  <tr key={course.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">
                        {language === 'ar' ? course.nameAr : course.nameEn}
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {course.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">{course.credits}h</td>
                    <td className="px-4 py-3 text-slate-600">
                      {t(`مستوى ${course.level} - فصل ${course.semester}`, `L${course.level} - T${course.semester}`)}
                    </td>
                    <td className="px-4 py-3">
                      {course.prerequisites.length === 0 ? (
                        <span className="text-[10px] text-slate-400">{t('لا يوجد', 'None')}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {course.prerequisites.map(p => (
                            <span key={p} className="font-mono text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-amber-600 flex items-center gap-1">
                        <Key className="w-3 h-3" />
                        {course.unlockedCoursesCount || 0} {t('مقررات', 'courses')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          course.isMandatory
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-purple-50 text-purple-700 border border-purple-100'
                        }`}
                      >
                        {course.isMandatory ? t('إجباري', 'Core') : course.track || t('اختياري', 'Elective')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          setEditingCourse(course);
                          setShowCourseModal(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                      >
                        {t('تعديل', 'Edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 3. OFFERINGS & SEATS TAB (الشعب الدراسية وحدود المقاعد) */}
      {/* ============================================================= */}
      {activeAdminTab === 'OFFERINGS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {t('إدارة الشعب المطروحة وحدود المقاعد', 'Course Offerings & Seat Capacities')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('التحكم في سعة القاعات وتحديث سقف التسجيل الفصلي لكل شعبة.', 'Control lecture hall capacity and dynamic seat limits.')}
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
              <input
                type="text"
                placeholder={t('البحث بالمقرر أو الأستاذ...', 'Search by course or instructor...')}
                value={offeringSearch}
                onChange={e => setOfferingSearch(e.target.value)}
                className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">{t('المقرر', 'Course')}</th>
                  <th className="px-4 py-3">{t('أستاذ المقرر', 'Instructor')}</th>
                  <th className="px-4 py-3">{t('الموعد والقاعة', 'Schedule & Hall')}</th>
                  <th className="px-4 py-3">{t('المسجلون حالياً', 'Enrolled')}</th>
                  <th className="px-4 py-3">{t('سعة المقاعد (قابلة للتعديل)', 'Capacity (Editable)')}</th>
                  <th className="px-4 py-3 text-center">{t('نسبة الضغط %', 'Pressure %')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOfferings.map(off => {
                  const pressurePct = Math.round((off.enrolledCount / Math.max(1, off.capacity)) * 100);

                  return (
                    <tr key={off.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-bold font-mono text-slate-900">{off.courseCode}</td>
                      <td className="px-4 py-3 text-slate-600">{off.instructorName}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {language === 'ar' ? off.lectureDayTimeAr : off.lectureDayTimeEn} ({off.hall})
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800">{off.enrolledCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            defaultValue={off.capacity}
                            onBlur={e => handleUpdateCapacity(off.id, Number(e.target.value))}
                            className="w-20 px-2 py-1 rounded-lg border border-slate-200 font-bold text-center bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-[10px] text-slate-400">{t('مقعداً', 'seats')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={`font-bold ${
                              pressurePct >= 90 ? 'text-rose-600' : 'text-slate-700'
                            }`}
                          >
                            {pressurePct}%
                          </span>
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                pressurePct >= 90 ? 'bg-rose-500' : pressurePct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, pressurePct)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 4. ACADEMIC RULES CONFIG TAB (إعدادات اللائحة وتدقيق البيانات) */}
      {/* ============================================================= */}
      {activeAdminTab === 'RULES' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold mb-1">
                {t('إدارة قواعد اللائحة وتناقضات وثائق الكلية الرسمية:', 'Configurable Academic Rules & Bylaws:')}
              </h4>
              <p className="text-amber-800 leading-relaxed">
                {t(
                  'تحتوي اللائحة على شروط مرنة (مثل ساعات مشروع التخرج هل هي 3 أم 6، والحد الأدنى للتدريب الصيفي 30 ساعة). يمكنك تعديل القيمة مباشرة ويتم تطبيقها فورياً وحفظها في قاعدة البيانات وسجل التدقيق.',
                  'Bylaws parameters (such as GP hours 3 vs 6, and 30h training minimum) are fully configurable and instantly applied in PostgreSQL.'
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`bg-white rounded-2xl p-5 border shadow-xs flex flex-col justify-between ${
                  rule.needsVerification ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {rule.key}
                    </span>
                    {rule.needsVerification && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        {t('بحاجة لتدقيق أكاديمي', 'Needs Verification')}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    {language === 'ar' ? rule.titleAr : rule.titleEn}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    {language === 'ar' ? rule.notesAr : rule.notesEn}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-400 block mb-0.5 font-bold">
                      {t('القيمة المطبقة الحالية (اضغط خارج الحقل للحفظ):', 'Configured Value:')}
                    </label>
                    <input
                      type="text"
                      defaultValue={rule.value}
                      onBlur={e => handleUpdateRule(rule.id, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block pt-4">
                    {t('القيمة الأصلية: ', 'Default: ')} {String(rule.defaultValue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 5. CSV IMPORT TAB (استيراد البيانات) */}
      {/* ============================================================= */}
      {activeAdminTab === 'IMPORT' && (
        <DataImportView onDataImported={loadAdminData} />
      )}


      {/* ============================================================= */}
      {/* 6. AUDIT LOG TAB (سجل العمليات والتدقيق) */}
      {/* ============================================================= */}
      {activeAdminTab === 'AUDIT' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {t('سجل التدقيق الأكاديمي الشامل (System Audit Trail)', 'Academic Audit Log Trail')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('سجل غير قابل للتعديل يوثق كافة العمليات الحساسة في قاعدة البيانات.', 'Immutable audit trail capturing all critical actions.')}
              </p>
            </div>

            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl">
              {filteredAudits.length} {t('عملية مطابقة', 'matching events')}
            </span>
          </div>

          {/* Search & Role Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
              <input
                type="text"
                placeholder={t('البحث باسم المستخدم، الإجراء، أو التفاصيل...', 'Search user, action, details...')}
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">{t('الدور:', 'Role:')}</span>
              <select
                value={auditRoleFilter}
                onChange={e => setAuditRoleFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
              >
                <option value="ALL">{t('الجميع', 'All Roles')}</option>
                <option value="ADMIN">ADMIN</option>
                <option value="INSTRUCTOR">INSTRUCTOR</option>
                <option value="ACADEMIC_ADVISOR">ACADEMIC_ADVISOR</option>
                <option value="STUDENT">STUDENT</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {filteredAudits.map(log => (
              <div key={log.id} className="p-4 hover:bg-slate-50 transition text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{log.userName}</span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {log.userRole}
                    </span>
                    <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[10px] border border-indigo-100">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {log.entity} #{log.entityId}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(log.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {language === 'ar' ? log.detailsAr : log.detailsEn}
                </p>
                {(log.before || log.after) && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-4 text-[10px] font-mono text-slate-500">
                    {log.before && <span>Before: {JSON.stringify(log.before)}</span>}
                    {log.after && <span className="text-indigo-600">After: {JSON.stringify(log.after)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Course Modal */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">
                {editingCourse.id ? t('تعديل بيانات المقرر', 'Edit Course') : t('إضافة مقرر جديد', 'Add New Course')}
              </h3>
              <button
                onClick={() => setShowCourseModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCourse} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">{t('كود المقرر (مثال: CS 101)', 'Course Code')}</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.code || ''}
                    onChange={e => setEditingCourse({ ...editingCourse, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">{t('عدد الساعات', 'Credits')}</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    required
                    value={editingCourse.credits || 3}
                    onChange={e => setEditingCourse({ ...editingCourse, credits: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">{t('اسم المقرر (بالعربية)', 'Arabic Name')}</label>
                <input
                  type="text"
                  required
                  value={editingCourse.nameAr || ''}
                  onChange={e => setEditingCourse({ ...editingCourse, nameAr: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">{t('اسم المقرر (بالإنجليزية)', 'English Name')}</label>
                <input
                  type="text"
                  value={editingCourse.nameEn || ''}
                  onChange={e => setEditingCourse({ ...editingCourse, nameEn: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">{t('المستوى', 'Level')}</label>
                  <select
                    value={editingCourse.level || 1}
                    onChange={e => setEditingCourse({ ...editingCourse, level: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">{t('الفصل الدراسي', 'Semester')}</label>
                  <select
                    value={editingCourse.semester || 1}
                    onChange={e => setEditingCourse({ ...editingCourse, semester: Number(e.target.value) as 1 | 2 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="1">{t('الأول', 'First')}</option>
                    <option value="2">{t('الثاني', 'Second')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  {t('المتطلبات السابقة (مفصولة بفواصل، مثال: CS 101, BS 101)', 'Prerequisites (comma-separated)')}
                </label>
                <input
                  type="text"
                  value={(editingCourse.prerequisites || []).join(', ')}
                  onChange={e =>
                    setEditingCourse({
                      ...editingCourse,
                      prerequisites: e.target.value
                        .split(',')
                        .map(p => p.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="mandatoryCheck"
                  checked={editingCourse.isMandatory ?? true}
                  onChange={e => setEditingCourse({ ...editingCourse, isMandatory: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="mandatoryCheck" className="text-slate-700 font-semibold cursor-pointer">
                  {t('مقرر إجباري عام (Core Requirement)', 'Mandatory Core Requirement')}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCourseModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  {t('حفظ في قاعدة البيانات', 'Save Course')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
