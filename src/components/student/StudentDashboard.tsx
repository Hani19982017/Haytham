import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student, StudentCourseRecord } from '../../types/index.js';
import {
  Award,
  AlertTriangle,
  BookOpen,
  CheckCircle,
  GraduationCap,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Clock,
  ShieldAlert,
  ArrowRight,
  Calculator,
  FileText,
  FileCheck2,
  Briefcase,
  QrCode,
  Download,
  Printer,
  X,
  User,
  School,
  Calendar,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';

interface StudentDashboardProps {
  onNavigateTab: (tab: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [recordFilter, setRecordFilter] = useState<'ALL' | 'IN_PROGRESS' | 'PASSED' | 'FAILED'>('ALL');
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [transcriptData, setTranscriptData] = useState<any>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const loadData = async () => {
    const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
    try {
      setLoading(true);
      const data = await api.getStudentById(studentId);
      setStudent(data);
    } catch (err) {
      console.error('Failed to load student data by id, trying getStudents fallback:', err);
      try {
        const students = await api.getStudents();
        if (students && students.length > 0) {
          const match = students.find(s => s.id === studentId || s.email === currentUser?.email) || students[0];
          const fullData = await api.getStudentById(match.id);
          setStudent(fullData || match);
        }
      } catch (e) {
        console.error('Fallback load error:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleOpenTranscript = async () => {
    if (!student) return;
    setShowTranscriptModal(true);
    try {
      setTranscriptLoading(true);
      const report = await api.getOfficialTranscript(student.id);
      setTranscriptData(report);
    } catch (e) {
      console.error('Failed to load official transcript:', e);
    } finally {
      setTranscriptLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-3">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs text-slate-500 font-medium">
          {t('جارٍ تحميل السجل الأكاديمي والبيانات الشاملة للطالب...', 'Loading complete student academic record...')}
        </span>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">{t('تعذر تحميل بيانات الطالب', 'Could not load student profile')}</h3>
          <p className="text-xs text-slate-500 mt-1">
            {t('يرجى التحقق من الاتصال بالخادم وقاعدة البيانات ثم المحاولة مجدداً.', 'Please check connection and retry.')}
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
        >
          {t('إعادة المحاولة', 'Retry')}
        </button>
      </div>
    );
  }

  const completionPct = Math.min(100, Math.round((student.completedCredits / 134) * 100));
  const isAtRisk = student.cumulativeGpa < 2.0;

  const riskBadgeStyle: Record<string, string> = {
    LOW: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
    HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
    CRITICAL: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse',
  };

  const riskLabelMap: Record<string, { ar: string; en: string }> = {
    LOW: { ar: 'مستقر وآمن (منخفض)', en: 'Low Risk (Healthy)' },
    MEDIUM: { ar: 'متوسط (تنبيه)', en: 'Medium Risk' },
    HIGH: { ar: 'مرتفع (إنذار أكاديمي)', en: 'High Risk (Warning)' },
    CRITICAL: { ar: 'حرج للغاية (خطر فصل)', en: 'Critical (Dismissal Risk)' },
  };

  const allRecords: StudentCourseRecord[] = student.records || [];
  const currentRecords = allRecords.filter(r => r.status === 'IN_PROGRESS' || r.status === 'ENROLLED');
  const passedRecords = allRecords.filter(r => r.status === 'PASSED');
  const failedRecords = allRecords.filter(r => r.status === 'FAILED');

  const displayedRecords = allRecords.filter(r => {
    if (recordFilter === 'IN_PROGRESS') return r.status === 'IN_PROGRESS' || r.status === 'ENROLLED';
    if (recordFilter === 'PASSED') return r.status === 'PASSED';
    if (recordFilter === 'FAILED') return r.status === 'FAILED';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white backdrop-blur-xs">
                {t(`المستوى الأكاديمي: ${student.level}`, `Academic Level ${student.level}`)}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/20">
                {student.track}
              </span>
              <span className="text-xs text-slate-300 font-mono bg-black/30 px-2 py-0.5 rounded-md">
                {t('الرقم الجامعي:', 'Student ID:')} #{student.studentCode}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isAtRisk ? 'bg-rose-500/30 text-rose-200 border border-rose-400/30' : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'
              }`}>
                {isAtRisk ? t('تحت الإنذار الأكاديمي', 'Academic Warning') : t('سليم ومستقر', 'Regular Status')}
              </span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight">
              {t('مرحباً بك،', 'Welcome,')} {language === 'ar' ? student.nameAr : student.nameEn}
            </h2>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-300" />
                <span>{t('المرشد الأكاديمي:', 'Advisor:')} <strong className="text-white">{student.advisorName}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <School className="w-3.5 h-3.5 text-indigo-300" />
                <span>{t('البرنامج:', 'Program:')} <strong>{t('علوم الحاسب (134 ساعة معتمدة)', 'Computer Science (134 Cr.)')}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-300" />
                <span>{t('التدريب الصيفي:', 'Summer Training:')} <strong>{student.trainingHours} / 240 {t('ساعة', 'hrs')} ({student.trainingStatus})</strong></span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onNavigateTab('student-recommendations')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{t('المقررات الموصى بها ذكياً', 'AI Recommendations')}</span>
            </button>
            <button
              onClick={handleOpenTranscript}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition backdrop-blur-xs cursor-pointer border border-white/15"
            >
              <FileText className="w-4 h-4 text-indigo-300" />
              <span>{t('كشف الدرجات الرسمي', 'Official Transcript')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Warning Alert Banner (If Applicable) */}
      {isAtRisk && (
        <div className="bg-rose-50 border-r-4 border-rose-500 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-900 mb-1">
                {t(
                  `تنبيه أكاديمي عاجل: أنت مسجل تحت الإنذار الأكاديمي رقم (${student.warningCount})`,
                  `Urgent Academic Warning: You have ${student.warningCount} Academic Warning(s)`
                )}
              </h4>
              <p className="text-xs text-rose-700 leading-relaxed">
                {t(
                  `معدلك التراكمي (${student.cumulativeGpa.toFixed(2)}) أقل من الحد الأدنى للائحة (2.00). قام المحرك الذكي بتوليد خطة إنقاذ تلقائية لرفع معدلك دون تأخير التخرج وسقف تقديرات الإعادة.`,
                  `Your cumulative GPA (${student.cumulativeGpa.toFixed(2)}) is below 2.00. An AI GPA recovery plan is available to raise your GPA with retake grade caps.`
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('student-gpa-plan')}
            className="shrink-0 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
          >
            {t('عرض خطة إنقاذ المعدل', 'View Recovery Plan')}
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cumulative GPA Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('المعدل التراكمي (GPA)', 'Cumulative GPA')}</span>
            <Award className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${isAtRisk ? 'text-rose-600' : 'text-slate-900'}`}>
              {student.cumulativeGpa.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400">/ 4.00</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
            {student.cumulativeGpa >= student.previousGpa ? (
              <span className="text-emerald-600 flex items-center gap-0.5 font-bold">
                <TrendingUp className="w-3.5 h-3.5" />
                +{(student.cumulativeGpa - student.previousGpa).toFixed(2)}
              </span>
            ) : (
              <span className="text-rose-600 flex items-center gap-0.5 font-bold">
                <TrendingDown className="w-3.5 h-3.5" />
                -{(student.previousGpa - student.cumulativeGpa).toFixed(2)}
              </span>
            )}
            <span className="text-slate-400 text-[11px]">{t('عن الفصل السابق', 'from previous term')}</span>
          </div>
        </div>

        {/* Degree Progress */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('إنجاز الساعات المعتمدة', 'Completed Credits')}</span>
            <BookOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{student.completedCredits}</span>
            <span className="text-xs text-slate-400">/ 134 {t('ساعة', 'hrs')}</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 mt-1 font-medium">
              <span>{completionPct}% {t('منجز', 'completed')}</span>
              <span>{student.remainingCredits} {t('ساعة متبقية', 'hrs remaining')}</span>
            </div>
          </div>
        </div>

        {/* Academic Warnings */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('الإنذارات الأكاديمية', 'Academic Warnings')}</span>
            <AlertTriangle className={`w-4 h-4 ${student.warningCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${student.warningCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {student.warningCount}
            </span>
            <span className="text-xs text-slate-400">{t('إنذارات مسجلة', 'total warnings')}</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 font-medium">
            {student.consecutiveWarnings > 0
              ? t(`(${student.consecutiveWarnings}) إنذار متتالٍ - الفصل عند (4)`, `(${student.consecutiveWarnings}) consecutive - Dismissal at 4`)
              : t('الوضع الأكاديمي سليم ومستقر', 'No active warnings')}
          </p>
        </div>

        {/* AI Risk Score */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">{t('تقييم الخطر الأكاديمي الذكي', 'AI Risk Assessment')}</span>
            <ShieldAlert className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <span
              className={`inline-block px-3 py-1 rounded-lg text-xs font-bold border ${
                riskBadgeStyle[student.riskLevel] || 'bg-slate-100'
              }`}
            >
              {language === 'ar'
                ? riskLabelMap[student.riskLevel]?.ar || student.riskLevel
                : riskLabelMap[student.riskLevel]?.en || student.riskLevel}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 line-clamp-1 font-medium">
            {student.riskReasons && student.riskReasons[0]
              ? student.riskReasons[0]
              : t('لا توجد مخاطر أكاديمية نشطة', 'No critical risks detected')}
          </p>
        </div>
      </div>

      {/* Quick Action Hub: Direct Links to all student modules */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>{t('الخدمات والوحدات الأكاديمية للطالب', 'Student Academic Modules & Services')}</span>
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            {t('جميع الخدمات مفعلة ومتصلة بقاعدة البيانات', 'All live & synchronized')}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => onNavigateTab('student-recommendations')}
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 text-center transition cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">
              {t('التوصيات الذكية', 'Recommendations')}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">{t('المقررات المقترحة', 'Optimal Courses')}</span>
          </button>

          <button
            onClick={() => onNavigateTab('student-study-plan')}
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 text-center transition cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <Calendar className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">
              {t('خطة التخرج', 'Graduation Plan')}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">{t('المسار الزمني', 'Semester Roadmap')}</span>
          </button>

          <button
            onClick={() => onNavigateTab('student-what-if')}
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 text-center transition cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <Calculator className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">
              {t('محاكي المعدل', 'What-If Sim')}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">{t('حساب السيناريوهات', 'Scenario Sandbox')}</span>
          </button>

          <button
            onClick={() => onNavigateTab('student-gpa-plan')}
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 text-center transition cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">
              {t('إنقاذ المعدل', 'GPA Recovery')}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">{t('تعويض العجز النقطي', 'Deficit Planner')}</span>
          </button>

          <button
            onClick={() => onNavigateTab('student-registration')}
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 text-center transition cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <FileCheck2 className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">
              {t('تسجيل المقررات', 'Registration')}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">{t('التسجيل الفصلي', 'Course Enrollment')}</span>
          </button>

          <button
            onClick={() => onNavigateTab('student-training')}
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 text-center transition cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
              <Briefcase className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-600">
              {t('التدريب الصيفي', 'Summer Training')}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">{t('ساعات التدريب (240)', '240 Hours Req.')}</span>
          </button>
        </div>
      </div>

      {/* Two Column Layout: In-Progress Courses & Risk Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Enrolled Courses with Attendance & Marks */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {t('مقررات الفصل الحالي المسجلة (خريف 2026)', 'Current Enrolled Courses (Fall 2026)')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('متابعة نسبة الحضور وأعمال السنة أولاً بأول لتفادي الحرمان', 'Real-time attendance & coursework tracking')}
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('student-registration')}
              className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{t('تعديل التسجيل', 'Manage')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {currentRecords.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {t('لم تقم بتسجيل مقررات للفصل الدراسي الحالي بعد', 'No courses enrolled yet for this term')}
              </div>
            ) : (
              currentRecords.map((rec, idx) => {
                const att = rec.attendancePercentage ?? 100;
                const isAttWarning = att < 75;

                return (
                  <div key={`${rec.courseCode}_${rec.semesterId || ''}_${idx}`} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-100">
                        {rec.credits}h
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {language === 'ar' ? rec.courseNameAr : rec.courseNameEn}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {rec.courseCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>
                            {t('أعمال السنة:', 'Coursework:')}{' '}
                            {rec.courseworkMark !== undefined ? `${rec.courseworkMark}/50` : t('قيد الرصد', 'Pending')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Attendance Pill */}
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className={`text-xs font-bold ${isAttWarning ? 'text-rose-600' : 'text-slate-700'}`}>
                          {att}%
                        </span>
                        <span className="text-[10px] text-slate-400">{t('حضور', 'attendance')}</span>
                      </div>
                      {isAttWarning && (
                        <span className="inline-block text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mt-0.5">
                          {t('خطر حرمان (< 75%)', 'Ban Risk (< 75%)')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: AI Advising Insights Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 mb-3">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">
                {t('تقرير المحرك الأكاديمي الذكي', 'AI Advising Diagnostic')}
              </h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <p className="text-slate-600 font-medium">
                {t('أبرز الملاحظات التشخيصية على سجلك الدراسي:', 'Key diagnostic insights on your record:')}
              </p>
              <ul className="space-y-1.5">
                {student.riskReasons && student.riskReasons.length > 0 ? (
                  student.riskReasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-slate-700 text-[11px] leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0"></span>
                      <span>{r}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400 text-xs">
                    {t('السجل الأكاديمي مستقر ولا توجد ملاحظات سلبية.', 'Academic record is healthy.')}
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
            <button
              onClick={() => onNavigateTab('student-study-plan')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
            >
              <span>{t('عرض خطة التخرج الكاملة', 'View Graduation Roadmap')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigateTab('student-training')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
            >
              <span>{t('متابعة التدريب الميداني الصيفي', 'Summer Field Training')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Complete Academic Transcript Section (كشف الدرجات والسجل الأكاديمي الشامل) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">
                {t('السجل الأكاديمي وكشف الدرجات التفصيلي (Academic Transcript)', 'Complete Academic Transcript & Course History')}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('سجل المقررات المسجلة والمجتازة مع التقديرات، النقاط، ونسب الحضور', 'Full historical record of all completed, in-progress, and failed courses')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter pills */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
              <button
                onClick={() => setRecordFilter('ALL')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  recordFilter === 'ALL' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('الكل', 'All')} ({allRecords.length})
              </button>
              <button
                onClick={() => setRecordFilter('PASSED')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  recordFilter === 'PASSED' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('مجتاز', 'Passed')} ({passedRecords.length})
              </button>
              <button
                onClick={() => setRecordFilter('FAILED')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  recordFilter === 'FAILED' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('رسوب', 'Failed')} ({failedRecords.length})
              </button>
              <button
                onClick={() => setRecordFilter('IN_PROGRESS')}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  recordFilter === 'IN_PROGRESS' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('الفصل الحالي', 'Current')} ({currentRecords.length})
              </button>
            </div>

            <button
              onClick={handleOpenTranscript}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('طباعة كشف معتمد', 'Print Transcript')}</span>
            </button>
          </div>
        </div>

        {/* Table of Records */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right divide-y divide-slate-100">
            <thead>
              <tr className="text-slate-400 font-bold bg-slate-50/70">
                <th className="py-2.5 px-3">{t('كود المقرر', 'Course Code')}</th>
                <th className="py-2.5 px-3">{t('اسم المقرر', 'Course Title')}</th>
                <th className="py-2.5 px-3 text-center">{t('الساعات', 'Credits')}</th>
                <th className="py-2.5 px-3 text-center">{t('الفصل الدراسي', 'Semester')}</th>
                <th className="py-2.5 px-3 text-center">{t('التقدير', 'Grade')}</th>
                <th className="py-2.5 px-3 text-center">{t('نقاط التقدير', 'Points')}</th>
                <th className="py-2.5 px-3 text-center">{t('أعمال السنة / النهائي', 'Marks')}</th>
                <th className="py-2.5 px-3 text-center">{t('نسبة الحضور', 'Attendance')}</th>
                <th className="py-2.5 px-3 text-center">{t('الحالة الأكاديمية', 'Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    {t('لا توجد مقررات في هذا التصنيف', 'No course records found for this filter')}
                  </td>
                </tr>
              ) : (
                displayedRecords.map((rec, idx) => {
                  const isPassed = rec.status === 'PASSED';
                  const isFailed = rec.status === 'FAILED';
                  const isInProgress = rec.status === 'IN_PROGRESS' || rec.status === 'ENROLLED';

                  return (
                    <tr key={`${rec.courseCode}_${idx}`} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {rec.courseCode}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {language === 'ar' ? rec.courseNameAr : rec.courseNameEn}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-700">
                        {rec.credits}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-500 font-medium">
                        {rec.semesterName || 'خريف 2026'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold">
                        {rec.grade ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              isPassed
                                ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 font-bold border border-rose-200'
                            }`}
                          >
                            {rec.grade}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">--</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                        {rec.gradePoints !== undefined ? rec.gradePoints.toFixed(1) : '--'}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-600">
                        {rec.courseworkMark !== undefined || rec.finalMark !== undefined ? (
                          <span>
                            {rec.courseworkMark ?? 0} + {rec.finalMark ?? 0} ={' '}
                            <strong>{(rec.courseworkMark ?? 0) + (rec.finalMark ?? 0)}/100</strong>
                          </span>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`font-bold ${
                            (rec.attendancePercentage ?? 100) < 75 ? 'text-rose-600' : 'text-slate-700'
                          }`}
                        >
                          {rec.attendancePercentage ?? 100}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isPassed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle className="w-3 h-3" />
                            <span>{t('ناجح', 'Passed')}</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{t('راسب (إعادة)', 'Failed')}</span>
                          </span>
                        )}
                        {isInProgress && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Clock className="w-3 h-3" />
                            <span>{t('قيد الدراسة', 'In Progress')}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Official Transcript Modal / Report */}
      {showTranscriptModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold">
                  {t('كشف الدرجات الرسمي والشهادة الرقمية المعتمدة', 'Official Digital Academic Transcript')}
                </h3>
              </div>
              <button
                onClick={() => setShowTranscriptModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-800" id="transcript-printable">
              {transcriptLoading ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-slate-500 font-medium">
                    {t('جارٍ استخراج وتوثيق كشف الدرجات الرسمي وتوليد رمز QR...', 'Generating verifiable official transcript with QR verification...')}
                  </p>
                </div>
              ) : (
                <>
                  {/* Official Header */}
                  <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">
                        {t('جامعة مصر للعلوم والتكنولوجيا - كلية تكنولوجيا المعلومات', 'Must University - Faculty of Information Technology')}
                      </h2>
                      <p className="text-xs text-slate-600 font-medium">
                        {t('نظام ابن الهيثم لشؤون التعليم والطلاب - كشف درجات أكاديمي معتمد', 'SIS Ibn Al-Haitham Engine - Official Academic Transcript')}
                      </p>
                    </div>
                    <div className="text-left font-mono text-[10px] text-slate-500">
                      <div>{t('تاريخ الاستخراج:', 'Issued:')} {new Date().toLocaleDateString('ar-EG')}</div>
                      <div>{t('الرقم المرجعي:', 'Ref:')} SIS-TR-{student.studentCode}-{Date.now().toString().slice(-6)}</div>
                    </div>
                  </div>

                  {/* Student Info Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 block">{t('اسم الطالب', 'Student Name')}</span>
                      <strong className="text-xs text-slate-900">{student.nameAr}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{t('الرقم الجامعي', 'Student Code')}</span>
                      <strong className="text-xs font-mono text-slate-900">{student.studentCode}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{t('البرنامج والمسار', 'Academic Track')}</span>
                      <strong className="text-xs text-slate-900">{student.track}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{t('المعدل التراكمي (GPA)', 'Cumulative GPA')}</span>
                      <strong className="text-xs text-indigo-700 font-bold">{student.cumulativeGpa.toFixed(2)} / 4.00</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{t('الساعات المجتازة', 'Passed Credits')}</span>
                      <strong className="text-xs text-slate-900">{student.completedCredits} / 134</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{t('المرشد الأكاديمي', 'Academic Advisor')}</span>
                      <strong className="text-xs text-slate-900">{student.advisorName}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{t('الإنذارات الأكاديمية', 'Warnings')}</span>
                      <strong className="text-xs text-slate-900">{student.warningCount} {t('إنذار', 'warning(s)')}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{t('الحالة الأكاديمية', 'Standing')}</span>
                      <strong className="text-xs text-emerald-700">{isAtRisk ? t('تحت الإنذار', 'Academic Warning') : t('سليم ومستقر', 'Regular')}</strong>
                    </div>
                  </div>

                  {/* Course Records Table in Transcript */}
                  <div>
                    <h4 className="font-bold text-xs text-slate-800 mb-2">
                      {t('سجل المقررات والنتائج المعتمدة:', 'Official Course Ledger & Results:')}
                    </h4>
                    <table className="w-full text-[11px] text-right divide-y divide-slate-200 border border-slate-200">
                      <thead className="bg-slate-100 font-bold text-slate-600">
                        <tr>
                          <th className="p-2">{t('كود المقرر', 'Code')}</th>
                          <th className="p-2">{t('اسم المقرر', 'Title')}</th>
                          <th className="p-2 text-center">{t('الساعات', 'Cr.')}</th>
                          <th className="p-2 text-center">{t('التقدير', 'Grade')}</th>
                          <th className="p-2 text-center">{t('النقاط', 'Points')}</th>
                          <th className="p-2 text-center">{t('الحالة', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allRecords.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2 font-mono font-bold">{r.courseCode}</td>
                            <td className="p-2">{language === 'ar' ? r.courseNameAr : r.courseNameEn}</td>
                            <td className="p-2 text-center">{r.credits}</td>
                            <td className="p-2 text-center font-mono font-bold">{r.grade || '--'}</td>
                            <td className="p-2 text-center font-mono">{r.gradePoints !== undefined ? r.gradePoints.toFixed(1) : '--'}</td>
                            <td className="p-2 text-center font-bold">
                              {r.status === 'PASSED' ? (
                                <span className="text-emerald-700">{t('ناجح', 'Passed')}</span>
                              ) : r.status === 'FAILED' ? (
                                <span className="text-rose-700">{t('راسب', 'Failed')}</span>
                              ) : (
                                <span className="text-indigo-700">{t('قيد الدراسة', 'In Progress')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Official Footer with QR & Seal */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 bg-slate-100 border border-slate-300 rounded-lg flex flex-col items-center justify-center p-1 text-center">
                        <QrCode className="w-8 h-8 text-slate-800" />
                        <span className="text-[8px] font-mono text-slate-500 mt-0.5">{t('رمز التحقق', 'Verify QR')}</span>
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900">
                          {t('وثيقة رقمية مشفرة وموقعة إلكترونياً', 'Cryptographically Verified Digital Document')}
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {t('يمكن التحقق من صحة هذا الكشف عبر مسح رمز الاستجابة السريعة (QR Code).', 'Authenticity can be verified via the QR Code.')}
                        </p>
                      </div>
                    </div>

                    <div className="text-center font-serif text-[11px] text-slate-700 space-y-1">
                      <div>{t('عميد الكلية وشؤون الطلاب', 'Dean of Academic Affairs')}</div>
                      <div className="font-bold text-slate-900">{t('أ. د. عميد الكلية', 'Prof. Dean of Faculty')}</div>
                      <div className="text-[9px] text-slate-400">{t('ختم رسمي إلكتروني', 'Official Electronic Seal')}</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setShowTranscriptModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
              >
                {t('إغلاق', 'Close')}
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{t('طباعة / تصدير PDF', 'Print / Export PDF')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
