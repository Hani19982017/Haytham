import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student } from '../../types/index.js';
import {
  ShieldAlert,
  Users,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Search,
  Filter,
  Eye,
  MessageSquare,
  Award,
  X,
  Send,
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('ALL');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'>('APPROVE');
  const [processing, setProcessing] = useState(false);

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

  const handleDecision = async () => {
    if (!selectedStudent) return;
    try {
      setProcessing(true);
      await api.decidePlan(selectedStudent.id, decisionAction, decisionNotes);
      // Reload list
      const refreshed = await api.getAdvisorStudents();
      setStudents(refreshed);
      setSelectedStudent(null);
      setDecisionNotes('');
    } catch (err) {
      console.error('Decision error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const criticalCount = students.filter(s => s.riskLevel === 'CRITICAL').length;
  const highCount = students.filter(s => s.riskLevel === 'HIGH').length;
  const below2Count = students.filter(s => s.cumulativeGpa < 2.0).length;
  const pendingPlansCount = students.filter(s => s.currentPlanStatus === 'Pending Review').length;

  const filtered = students.filter(s => {
    if (activeTab === 'PLANS' && s.currentPlanStatus !== 'Pending Review') return false;
    if (selectedRisk !== 'ALL' && s.riskLevel !== selectedRisk) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.studentCode.includes(q) ||
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              'ترتيب الطلاب آلياً حسب درجة الخطورة الأكاديمية (الحرجة ثم المرتفعة)، لمتابعة حالات الإنذار، نسب الحضور المتدنية، واعتماد الخطط الدراسية.',
              'Students ordered by prioritized academic risk to address warnings, low attendance, and study plan approvals.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            {students.length} {t('طالباً مسنداً إليك', 'assigned students')}
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('حالات الخطر الحرج (فصل وشيك)', 'Critical Risk')}</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-3xl font-extrabold text-rose-600">{criticalCount}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {t('3 إنذارات أو معدل < 1.50', '3 warnings or GPA < 1.50')}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('خطر مرتفع (تحت الإنذار)', 'High Risk')}</span>
            <AlertTriangle className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-3xl font-extrabold text-orange-600">{highCount}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {t('معدل تراكمي أقل من 2.00', 'GPA below 2.00')}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('طلاب تحت المعدل 2.00', 'Below 2.0 GPA')}</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900">{below2Count}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {t('يحتاجون خطة إنقاذ فورية', 'Need recovery plans')}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('خطط بانتظار الاعتماد', 'Plans Pending')}</span>
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
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder={t('البحث بالاسم أو كود الطالب...', 'Search by student name or code...')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
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
                <th className="px-4 py-3">{t('الطالب والكود', 'Student & ID')}</th>
                <th className="px-4 py-3">{t('المستوى والمسار', 'Level & Track')}</th>
                <th className="px-4 py-3">{t('المعدل التراكمي', 'Cumulative GPA')}</th>
                <th className="px-4 py-3">{t('الإنذارات', 'Warnings')}</th>
                <th className="px-4 py-3">{t('مستوى الخطر', 'Risk Level')}</th>
                <th className="px-4 py-3">{t('أبرز أسباب الخطر', 'Top Diagnostic Reason')}</th>
                <th className="px-4 py-3">{t('حالة الخطة', 'Plan Status')}</th>
                <th className="px-4 py-3 text-center">{t('الإجراء', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(student => (
                <tr key={student.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">
                      {language === 'ar' ? student.nameAr : student.nameEn}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {student.studentCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{t(`المستوى ${student.level}`, `Level ${student.level}`)}</div>
                    <span className="text-[10px] text-slate-400">{student.track}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-bold text-sm ${
                        student.cumulativeGpa < 2.0 ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {student.cumulativeGpa.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {student.warningCount > 0 ? (
                      <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        {student.warningCount} {t('إنذار', 'warn')}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        student.currentPlanStatus === 'Approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : student.currentPlanStatus === 'Pending Review'
                          ? 'bg-amber-100 text-amber-800 animate-pulse'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {student.currentPlanStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setSelectedStudent(student)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
                    >
                      {t('مراجعة وتوجيه', 'Review')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
                onClick={() => setSelectedStudent(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
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
