import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student } from '../../types/index.js';
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
} from 'lucide-react';

interface StudentDashboardProps {
  onNavigateTab: (tab: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!currentUser?.studentId) return;
      try {
        setLoading(true);
        const data = await api.getStudentById(currentUser.studentId);
        setStudent(data);
      } catch (err) {
        console.error('Failed to load student data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center text-slate-500">
        {t('تعذر تحميل بيانات الطالب', 'Could not load student profile')}
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

  const currentRecords = student.records.filter(r => r.status === 'IN_PROGRESS');

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white backdrop-blur-xs">
                {t(`المستوى ${student.level}`, `Level ${student.level}`)}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/20">
                {student.track}
              </span>
              <span className="text-xs text-slate-300 font-mono">
                #{student.studentCode}
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-1">
              {t('مرحباً بك،', 'Welcome back,')} {language === 'ar' ? student.nameAr : student.nameEn}
            </h2>
            <p className="text-xs text-slate-300 max-w-xl">
              {t(
                `المرشد الأكاديمي المخصص: ${student.advisorName} | الخطة المعتمدة: 134 ساعة معتمدة.`,
                `Assigned Academic Advisor: ${student.advisorName} | Program: 134 Total Credits.`
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab('student-recommendations')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{t('المقررات الموصى بها ذكياً', 'AI Recommendations')}</span>
            </button>
            <button
              onClick={() => onNavigateTab('student-what-if')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition backdrop-blur-xs cursor-pointer"
            >
              <Calculator className="w-4 h-4" />
              <span>{t('محاكي المعدل', 'What-If')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Warning Alert Banner (If Applicable) */}
      {isAtRisk && (
        <div className="bg-rose-50 border-r-4 border-rose-500 rounded-xl p-4 flex items-start justify-between gap-3 shadow-xs">
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
                  `معدلك التراكمي (${student.cumulativeGpa}) أقل من الحد الأدنى للائحة (2.00). قمنا بتوليد خطة إنقاذ تلقائية لرفع معدلك دون تأخير التخرج.`,
                  `Your cumulative GPA (${student.cumulativeGpa}) is below 2.00. An AI GPA recovery plan is available to raise your GPA.`
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('student-gpa-plan')}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
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
              <span className="text-emerald-600 flex items-center gap-0.5">
                <TrendingUp className="w-3.5 h-3.5" />
                +{(student.cumulativeGpa - student.previousGpa).toFixed(2)}
              </span>
            ) : (
              <span className="text-rose-600 flex items-center gap-0.5">
                <TrendingDown className="w-3.5 h-3.5" />
                -{(student.previousGpa - student.cumulativeGpa).toFixed(2)}
              </span>
            )}
            <span className="text-slate-400 text-[11px]">{t('عن الفصل السابق', 'from previous')}</span>
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
            <span className="text-xs font-bold">{t('تقييم الخطر الذكي', 'AI Risk Assessment')}</span>
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
            {student.riskReasons[0] || t('لا توجد مخاطر أكاديمية نشطة', 'No critical risks detected')}
          </p>
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
              currentRecords.map(rec => {
                const att = rec.attendancePercentage ?? 100;
                const isAttWarning = att < 75;

                return (
                  <div key={rec.courseCode} className="py-3 flex items-center justify-between gap-4">
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
                          <span>{t('أعمال السنة:', 'Coursework:')} {rec.courseworkMark ? `${rec.courseworkMark}/50` : t('قيد الرصد', 'Pending')}</span>
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
                {student.riskReasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-700 text-[11px] leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0"></span>
                    <span>{r}</span>
                  </li>
                ))}
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
    </div>
  );
};
