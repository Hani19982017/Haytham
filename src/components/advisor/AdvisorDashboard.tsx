import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student, PlanStatus } from '../../types/index.js';
import { TranscriptReportModal } from '../reports/TranscriptReportModal.js';
import {
  ShieldAlert,
  Users,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Search,
  Filter,
  Award,
  X,
  FileText,
  Check,
  XCircle,
  BookOpen,
  GraduationCap,
} from 'lucide-react';

interface AdvisorDashboardProps {
  currentTab?: string;
  onNavigateTab?: (tab: string) => void;
}

const mapAdvisorTab = (tab?: string): 'TRIAGE' | 'PLANS' | 'STUDENTS' => {
  if (tab === 'advisor-plans') return 'PLANS';
  if (tab === 'advisor-students') return 'STUDENTS';
  return 'TRIAGE';
};

export const AdvisorDashboard: React.FC<AdvisorDashboardProps> = ({ currentTab, onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'TRIAGE' | 'PLANS' | 'STUDENTS'>(() => mapAdvisorTab(currentTab));

  useEffect(() => {
    if (currentTab) {
      setActiveTab(mapAdvisorTab(currentTab));
    }
  }, [currentTab]);

  const handleSelectTab = (tab: 'TRIAGE' | 'PLANS' | 'STUDENTS') => {
    setActiveTab(tab);
    if (onNavigateTab) {
      if (tab === 'PLANS') onNavigateTab('advisor-plans');
      else if (tab === 'STUDENTS') onNavigateTab('advisor-students');
      else onNavigateTab('advisor-dashboard');
    }
  };

  const [students, setStudents] = useState<Student[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [selectedTrack, setSelectedTrack] = useState('ALL');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<'PENDING' | 'REVIEWED' | 'ALL'>('PENDING');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transcriptStudentId, setTranscriptStudentId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'>('APPROVE');
  const [processing, setProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadAdvisorStudents() {
      try {
        setLoading(true);
        const data = await api.getAdvisorStudents();
        setStudents(data);
      } catch (err) {
        console.error('Failed to load advisor students:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAdvisorStudents();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 4000);
  };

  const applyStudentDecisionOptimistically = (
    student: Student,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'
  ) => {
    const newStatus: PlanStatus = action === 'APPROVE' ? 'Approved' : 'Rejected';
    setReviewedIds(prev => {
      const next = new Set(prev);
      next.add(student.id);
      return next;
    });
    setStudents(prev =>
      prev.map(s => (s.id === student.id ? { ...s, currentPlanStatus: newStatus } : s))
    );
  };

  const handleDecision = async () => {
    if (!selectedStudent) return;
    const targetStudent = selectedStudent;
    const action = decisionAction;
    const notes = decisionNotes;

    try {
      setProcessing(true);
      // 1. Optimistically update local state immediately so student is removed from active queue right away
      applyStudentDecisionOptimistically(targetStudent, action);
      setSelectedStudent(null);
      setDecisionNotes('');

      showToast(
        t(
          `تم حفظ التوجيه الأكاديمي للطالب "${targetStudent.nameAr}" وإزالته من قائمة الانتظار.`,
          `Saved guidance for "${targetStudent.nameEn}" and removed from pending queue.`
        )
      );

      // 2. Persist decision on backend
      await api.decidePlan(targetStudent.id, action, notes);
    } catch (err) {
      console.error('Decision error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleQuickPlanDecision = async (
    student: Student,
    action: 'APPROVE' | 'REJECT'
  ) => {
    applyStudentDecisionOptimistically(student, action);
    showToast(
      action === 'APPROVE'
        ? t(
            `تم اعتماد الخطة الدراسية للطالب "${student.nameAr}" وإزالته من قائمة الانتظار.`,
            `Approved study plan for "${student.nameEn}".`
          )
        : t(
            `تم رفض الخطة الدراسية للطالب "${student.nameAr}" وإرسال طلب التعديل.`,
            `Rejected study plan for "${student.nameEn}".`
          )
    );
    try {
      await api.decidePlan(
        student.id,
        action,
        action === 'APPROVE'
          ? 'تم اعتماد الخطة الدراسية من المرشد الأكاديمي.'
          : 'يرجى مراجعة المرشد الأكاديمي وتعديل المقررات المختارة.'
      );
    } catch (err) {
      console.error('Quick decision error:', err);
    }
  };

  const isStudentReviewed = (s: Student): boolean => {
    if (reviewedIds.has(s.id)) return true;
    return s.currentPlanStatus === 'Approved' || s.currentPlanStatus === 'Rejected';
  };

  const criticalCount = students.filter(s => s.riskLevel === 'CRITICAL').length;
  const highCount = students.filter(s => s.riskLevel === 'HIGH').length;
  const below2Count = students.filter(s => s.cumulativeGpa < 2.0).length;
  const pendingPlansCount = students.filter(s => !isStudentReviewed(s)).length;
  const reviewedPlansCount = students.filter(s => isStudentReviewed(s)).length;

  // Filtered list for TRIAGE tab
  const triageFiltered = students.filter(s => {
    const reviewed = isStudentReviewed(s);
    if (reviewStatusFilter === 'PENDING' && reviewed) return false;
    if (reviewStatusFilter === 'REVIEWED' && !reviewed) return false;
    if (selectedRisk !== 'ALL' && s.riskLevel !== selectedRisk) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.studentCode.toLowerCase().includes(q) ||
        s.nameAr.toLowerCase().includes(q) ||
        s.nameEn.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filtered list for PLANS tab (only unreviewed plans by default, or search)
  const plansFiltered = students.filter(s => {
    if (isStudentReviewed(s)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.studentCode.toLowerCase().includes(q) ||
        s.nameAr.toLowerCase().includes(q) ||
        s.nameEn.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filtered list for STUDENTS directory tab (shows all assigned students with level/track filters)
  const directoryFiltered = students.filter(s => {
    if (selectedLevel !== 'ALL' && String(s.level) !== selectedLevel) return false;
    if (selectedTrack !== 'ALL' && s.track !== selectedTrack) return false;
    if (selectedRisk !== 'ALL' && s.riskLevel !== selectedRisk) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.studentCode.toLowerCase().includes(q) ||
        s.nameAr.toLowerCase().includes(q) ||
        s.nameEn.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const riskBadge: Record<string, string> = {
    CRITICAL: 'bg-rose-100 text-rose-800 border-rose-200 animate-pulse',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200',
    LOW: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  };

  const getMaxAllowedCredits = (gpa: number) => {
    if (gpa >= 3.0) return 21;
    if (gpa >= 2.0) return 18;
    if (gpa >= 1.5) return 15;
    return 12;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-emerald-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Navigation Bar (Synchronized with Sidebar) */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleSelectTab('TRIAGE')}
          className={`flex-1 min-w-[180px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'TRIAGE'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>{t('تصنيف الطلاب حسب الخطر', 'Risk Triage & Overview')}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'TRIAGE' ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {pendingPlansCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('PLANS')}
          className={`flex-1 min-w-[180px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'PLANS'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>{t('اعتماد ومراجعة الخطط الدراسية', 'Study Plans Approval')}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'PLANS' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {pendingPlansCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('STUDENTS')}
          className={`flex-1 min-w-[180px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'STUDENTS'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t('سجل الطلاب والمتابعة الأكاديمية', 'Assigned Students Directory')}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === 'STUDENTS' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {students.length}
          </span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: RISK TRIAGE & GUIDANCE QUEUE                       */}
      {/* ========================================================= */}
      {activeTab === 'TRIAGE' && (
        <>
          {/* Header Banner */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1 text-indigo-600">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">
                  {t('منظومة الإرشاد الأكاديمي وتصنيف المخاطر', 'Academic Advisor Triage & Risk Management')}
                </h2>
              </div>
              <p className="text-xs text-slate-500 max-w-2xl">
                {t(
                  'ترتيب الطلاب آلياً حسب درجة الخطورة الأكاديمية (الحرجة ثم المرتفعة). بمجرد مراجعة الطالب وتوجيهه يُزال فوراً من قائمة الانتظار.',
                  'Students ordered by academic risk priority. Once reviewed and guided, the student is immediately removed from your pending queue.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                {students.length} {t('طالباً مسنداً إليك', 'assigned students')}
              </span>
            </div>
          </div>

          {/* Interactive KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => {
                setSelectedRisk(selectedRisk === 'CRITICAL' ? 'ALL' : 'CRITICAL');
              }}
              className={`bg-white rounded-2xl p-5 border transition cursor-pointer ${
                selectedRisk === 'CRITICAL'
                  ? 'border-rose-500 ring-2 ring-rose-500/20'
                  : 'border-slate-200 hover:border-rose-300'
              } shadow-xs`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold">{t('حالات الخطر الحرج (فصل وشيك)', 'Critical Risk')}</span>
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-3xl font-extrabold text-rose-600">{criticalCount}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {t('3 إنذارات أو معدل < 1.50 (اضغط للتصفية)', '3 warnings or GPA < 1.50 (Click to filter)')}
              </span>
            </div>

            <div
              onClick={() => {
                setSelectedRisk(selectedRisk === 'HIGH' ? 'ALL' : 'HIGH');
              }}
              className={`bg-white rounded-2xl p-5 border transition cursor-pointer ${
                selectedRisk === 'HIGH'
                  ? 'border-orange-500 ring-2 ring-orange-500/20'
                  : 'border-slate-200 hover:border-orange-300'
              } shadow-xs`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold">{t('خطر مرتفع (تحت الإنذار)', 'High Risk')}</span>
                <AlertTriangle className="w-4 h-4 text-orange-600" />
              </div>
              <div className="text-3xl font-extrabold text-orange-600">{highCount}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {t('معدل تراكمي أقل من 2.00 (اضغط للتصفية)', 'GPA below 2.00 (Click to filter)')}
              </span>
            </div>

            <div
              onClick={() => {
                setSelectedRisk('ALL');
                setReviewStatusFilter('PENDING');
              }}
              className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-amber-300 transition cursor-pointer shadow-xs"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold">{t('طلاب تحت المعدل 2.00', 'Below 2.0 GPA')}</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-3xl font-extrabold text-slate-900">{below2Count}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {t('يحتاجون خطة إنقاذ فورية', 'Need recovery plans')}
              </span>
            </div>

            <div
              onClick={() => handleSelectTab('PLANS')}
              className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-300 transition cursor-pointer shadow-xs"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold">{t('بانتظار المراجعة والتوجيه', 'Pending Guidance')}</span>
                <FileCheck2 className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-3xl font-extrabold text-indigo-600">{pendingPlansCount}</div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {t('تتطلب مراجعة واعتماد المرشد', 'Require advisor decision')}
              </span>
            </div>
          </div>

          {/* Triage Students Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Table Filters */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    placeholder={t('البحث بالاسم أو كود الطالب...', 'Search by student name or code...')}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setReviewStatusFilter('PENDING')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      reviewStatusFilter === 'PENDING'
                        ? 'bg-white text-indigo-600 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t(`بانتظار التوجيه (${pendingPlansCount})`, `Pending (${pendingPlansCount})`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewStatusFilter('REVIEWED')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      reviewStatusFilter === 'REVIEWED'
                        ? 'bg-white text-emerald-600 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t(`تمت مراجعتهم (${reviewedPlansCount})`, `Reviewed (${reviewedPlansCount})`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewStatusFilter('ALL')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      reviewStatusFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t(`الكل (${students.length})`, `All (${students.length})`)}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedRisk}
                  onChange={e => setSelectedRisk(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">{t('جميع مستويات الخطر', 'All Risk Levels')}</option>
                  <option value="CRITICAL">{t('حرج (CRITICAL)', 'Critical Only')}</option>
                  <option value="HIGH">{t('مرتفع (HIGH)', 'High Risk')}</option>
                  <option value="MEDIUM">{t('متوسط (MEDIUM)', 'Medium')}</option>
                  <option value="LOW">{t('مستقر (LOW)', 'Low')}</option>
                </select>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">{t('الطالب والكود', 'Student & ID')}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('المستوى والمسار', 'Level & Track')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('المعدل التراكمي', 'Cumulative GPA')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('الإنذارات', 'Warnings')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('مستوى الخطر', 'Risk Level')}</th>
                    <th className="px-4 py-3">{t('أبرز أسباب الخطر', 'Top Diagnostic Reason')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('حالة الخطة', 'Plan Status')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('الإجراء', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {triageFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-400 font-bold">
                        {t(
                          'لا يوجد طلاب في هذه القائمة حالياً — تمت مراجعة وتوجيه جميع الطلاب بنجاح.',
                          'No students in this queue — all students have been reviewed and guided.'
                        )}
                      </td>
                    </tr>
                  ) : (
                    triageFiltered.map(student => (
                      <tr key={student.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {language === 'ar' ? student.nameAr : student.nameEn}
                          </div>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {student.studentCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          <div>{t(`المستوى ${student.level}`, `Level ${student.level}`)}</div>
                          <span className="text-[10px] text-slate-400">{student.track}</span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`font-bold text-sm ${
                              student.cumulativeGpa < 2.0 ? 'text-rose-600 font-extrabold' : 'text-slate-900'
                            }`}
                          >
                            {student.cumulativeGpa.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {student.warningCount > 0 ? (
                            <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 shadow-2xs whitespace-nowrap">
                              <span>{student.warningCount}</span>
                              <span>{t('إنذار', 'warn')}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200 whitespace-nowrap">
                              0
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              riskBadge[student.riskLevel] || 'bg-slate-100'
                            }`}
                          >
                            {student.riskLevel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                          {student.riskReasons[0] || t('أداء مستقر', 'Stable')}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              student.currentPlanStatus === 'Approved'
                                ? 'bg-emerald-50 text-emerald-700'
                                : student.currentPlanStatus === 'Rejected'
                                ? 'bg-rose-50 text-rose-700'
                                : student.currentPlanStatus === 'Pending Review'
                                ? 'bg-amber-100 text-amber-800 animate-pulse'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {student.currentPlanStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(student)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
                          >
                            {t('مراجعة وتوجيه', 'Review')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================= */}
      {/* TAB 2: STUDY PLANS APPROVAL QUEUE                         */}
      {/* ========================================================= */}
      {activeTab === 'PLANS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1 text-emerald-600">
                <FileCheck2 className="w-5 h-5" />
                <h2 className="text-lg font-bold text-slate-900">
                  {t('اعتماد ومراجعة الخطط الدراسية للفصل الحالي', 'Semester Study Plans Approval Queue')}
                </h2>
              </div>
              <p className="text-xs text-slate-500 max-w-2xl">
                {t(
                  'مراجعة العبء الفصلي المسموح به لكل طالب وفق لائحة الـ 134 ساعة واعتماد تسجيل المقررات أو طلب تعديلها. بمجرد الاعتماد يُزال الطالب فوراً من هذه القائمة.',
                  'Verify allowed credit loads under the 134-hour bylaw and approve or reject student study plans.'
                )}
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder={t('بحث باسم الطالب أو الكود...', 'Search student...')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {plansFiltered.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900">
                {t('تمت مراجعة واعتماد جميع الخطط الدراسية المعلقة!', 'All pending study plans have been reviewed!')}
              </h3>
              <p className="text-xs text-slate-500">
                {t(
                  'لا توجد خطط دراسية بانتظار الاعتماد حالياً. يمكنك استعراض جميع الطلاب من تبويب "سجل الطلاب والمتابعة الأكاديمية".',
                  'No pending plans remaining. You can view all students in the Assigned Students Directory.'
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plansFiltered.map(student => {
                const maxCredits = getMaxAllowedCredits(student.cumulativeGpa);
                return (
                  <div
                    key={student.id}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between gap-4 hover:border-indigo-200 transition"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">
                            {language === 'ar' ? student.nameAr : student.nameEn}
                          </h3>
                          <span className="font-mono text-[11px] text-slate-500">
                            {student.studentCode} • {t(`المستوى ${student.level}`, `Level ${student.level}`)} • {student.track}
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            riskBadge[student.riskLevel] || 'bg-slate-100'
                          }`}
                        >
                          {student.riskLevel}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block">{t('المعدل التراكمي', 'GPA')}</span>
                          <span
                            className={`font-extrabold ${
                              student.cumulativeGpa < 2.0 ? 'text-rose-600' : 'text-slate-900'
                            }`}
                          >
                            {student.cumulativeGpa.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">{t('سقف الساعات باللائحة', 'Max Load')}</span>
                          <span className="font-extrabold text-indigo-700">
                            {maxCredits} {t('ساعة', 'hrs')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">{t('المنجز / 134', 'Completed')}</span>
                          <span className="font-bold text-slate-800">{student.completedCredits} / 134</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-600 bg-amber-50/70 border border-amber-100 rounded-xl p-2.5">
                        <strong className="text-amber-900 block mb-0.5">
                          {t('التشخيص الأكاديمي:', 'Diagnostic Note:')}
                        </strong>
                        <span>{student.riskReasons[0] || t('خطة دراسية بانتظار موافقة المرشد.', 'Study plan awaiting advisor approval.')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleQuickPlanDecision(student, 'APPROVE')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>{t('اعتماد فوراً', 'Quick Approve')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStudent(student)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
                      >
                        <span>{t('مراجعة وتوجيه', 'Review & Guide')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickPlanDecision(student, 'REJECT')}
                        className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer"
                        title={t('رفض وطلب تعديل', 'Reject Plan')}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: ASSIGNED STUDENTS DIRECTORY & ACADEMIC FOLLOW-UP   */}
      {/* ========================================================= */}
      {activeTab === 'STUDENTS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1 text-indigo-600">
                <GraduationCap className="w-5 h-5" />
                <h2 className="text-lg font-bold text-slate-900">
                  {t('سجل الطلاب المسندين والمتابعة الأكاديمية الشاملة', 'Assigned Students Roster & Academic Progress')}
                </h2>
              </div>
              <p className="text-xs text-slate-500 max-w-2xl">
                {t(
                  'متابعة الساعات المنجزة من أصل 134 ساعة، ساعات التدريب الصيفي الميداني، واستخراج السجل الأكاديمي الموثق (QR) لأي طالب مسند إليك.',
                  'Monitor credit progress towards 134 hours, summer field training, and view official verified transcripts (QR).'
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                {directoryFiltered.length} / {students.length} {t('طالب', 'students')}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Directory Filters */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  placeholder={t('البحث بالاسم أو كود الطالب...', 'Search by student name or code...')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedLevel}
                  onChange={e => setSelectedLevel(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 cursor-pointer"
                >
                  <option value="ALL">{t('جميع المستويات', 'All Levels')}</option>
                  <option value="1">{t('المستوى الأول (Level 1)', 'Level 1')}</option>
                  <option value="2">{t('المستوى الثاني (Level 2)', 'Level 2')}</option>
                  <option value="3">{t('المستوى الثالث (Level 3)', 'Level 3')}</option>
                  <option value="4">{t('المستوى الرابع (Level 4)', 'Level 4')}</option>
                </select>

                <select
                  value={selectedTrack}
                  onChange={e => setSelectedTrack(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 cursor-pointer"
                >
                  <option value="ALL">{t('جميع المسارات العلمية', 'All Tracks')}</option>
                  <option value="General">{t('عام (General)', 'General')}</option>
                  <option value="Artificial Intelligence">{t('الذكاء الاصطناعي (AI)', 'Artificial Intelligence')}</option>
                  <option value="Networks & Cyber Security">{t('الشبكات والأمن السيبراني', 'Networks & Cyber Security')}</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">{t('الطالب والكود', 'Student & ID')}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('المستوى والمسار', 'Level & Track')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('المعدل التراكمي', 'GPA')}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('تقدم الساعات (من 134)', 'Credits Progress')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('الإنذارات', 'Warnings')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('حالة التوجيه', 'Guidance Status')}</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">{t('الإجراءات', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {directoryFiltered.map(student => {
                    const pct = Math.min(100, Math.round((student.completedCredits / 134) * 100));
                    const reviewed = isStudentReviewed(student);
                    return (
                      <tr key={student.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {language === 'ar' ? student.nameAr : student.nameEn}
                          </div>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {student.studentCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          <div>{t(`المستوى ${student.level}`, `Level ${student.level}`)}</div>
                          <span className="text-[10px] text-slate-400">{student.track}</span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`font-bold text-sm ${
                              student.cumulativeGpa < 2.0 ? 'text-rose-600 font-extrabold' : 'text-slate-900'
                            }`}
                          >
                            {student.cumulativeGpa.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap min-w-[160px]">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-bold text-slate-700">{student.completedCredits} / 134</span>
                            <span className="text-slate-400">{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {student.warningCount > 0 ? (
                            <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200 whitespace-nowrap">
                              <span>{student.warningCount}</span>
                              <span>{t('إنذار', 'warn')}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200 whitespace-nowrap">
                              0
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {reviewed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{t('تمت المراجعة', 'Reviewed')}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <span>{t('بانتظار التوجيه', 'Pending')}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setTranscriptStudentId(student.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer inline-flex items-center gap-1"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>{t('السجل (QR)', 'Transcript')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedStudent(student)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
                            >
                              {t('توجيه', 'Guide')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Official Verified Transcript Modal for Advisor */}
      {transcriptStudentId && (
        <TranscriptReportModal
          studentId={transcriptStudentId}
          onClose={() => setTranscriptStudentId(null)}
        />
      )}

      {/* Review & Decision Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-slate-400 block">
                  {t('جلسة الإرشاد الأكاديمي واعتماد الخطة', 'Academic Advising & Plan Decision')}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {language === 'ar' ? selectedStudent.nameAr : selectedStudent.nameEn} ({selectedStudent.studentCode})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">{t('المعدل التراكمي', 'GPA')}</span>
                <span className={`font-bold text-sm ${selectedStudent.cumulativeGpa < 2.0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {selectedStudent.cumulativeGpa.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">{t('الساعات المنجزة', 'Completed')}</span>
                <span className="font-bold text-slate-800 text-sm">{selectedStudent.completedCredits} / 134</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">{t('الإنذارات الأكاديمية', 'Warnings')}</span>
                <span className="font-bold text-amber-600 text-sm">{selectedStudent.warningCount}</span>
              </div>
            </div>

            {/* Diagnostic Reasons */}
            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-slate-700 block">
                {t('تقرير فحص اللائحة ومؤشرات الخطر:', 'Bylaw Diagnostic Findings:')}
              </span>
              <ul className="space-y-1 bg-rose-50/60 p-3 rounded-xl border border-rose-100">
                {selectedStudent.riskReasons.map((r, i) => (
                  <li key={i} className="text-rose-900 flex items-start gap-1.5 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Decision Controls */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {t('قرار المرشد الأكاديمي', 'Advisor Decision')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDecisionAction('APPROVE')}
                    className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      decisionAction === 'APPROVE'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {t('اعتماد الخطة (Approve)', 'Approve Plan')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisionAction('REQUEST_CHANGES')}
                    className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      decisionAction === 'REQUEST_CHANGES'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {t('طلب تعديلات (Changes)', 'Request Changes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisionAction('REJECT')}
                    className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      decisionAction === 'REJECT'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {t('رفض الخطة (Reject)', 'Reject Plan')}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {t('ملاحظات وتوجيهات المرشد الأكاديمي للطالب', 'Advisor Advisory Notes')}
                </label>
                <textarea
                  rows={3}
                  value={decisionNotes}
                  onChange={e => setDecisionNotes(e.target.value)}
                  placeholder={t(
                    'مثال: تم اعتماد الخطة مع التأكيد على التركيز في إعادة مقرر هياكل البيانات CS 201 وعدم تجاوز 15 ساعة...',
                    'e.g. Approved with condition to prioritize CS 201 retake...'
                  )}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={handleDecision}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
              >
                {processing ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ وإرسال القرار للطالب', 'Save & Notify Student')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
