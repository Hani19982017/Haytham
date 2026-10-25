import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { GpaImprovementPlan, Student } from '../../types/index.js';
import {
  TrendingUp,
  ShieldCheck,
  Zap,
  CheckCircle,
  AlertTriangle,
  Award,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CalendarCheck,
  BookOpen,
  CheckCircle2,
  X,
  Clock,
  Flame,
} from 'lucide-react';

interface GpaImprovementViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const GpaImprovementView: React.FC<GpaImprovementViewProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [plans, setPlans] = useState<GpaImprovementPlan[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [adoptedStrategy, setAdoptedStrategy] = useState<string | null>(null);
  const [activeModalPlan, setActiveModalPlan] = useState<GpaImprovementPlan | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [plansData, studentData] = await Promise.all([
          api.getGpaPlans(studentId),
          api.getStudentById(studentId),
        ]);
        setPlans(plansData);
        setStudent(studentData);

        // Check for previously adopted plan
        try {
          const saved = localStorage.getItem(`gpa_adopted_strategy_${studentId}`);
          if (saved) {
            setAdoptedStrategy(saved);
          }
        } catch {}
      } catch (err) {
        console.error('Failed to load GPA plans:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [studentId]);

  const handleApplyPlan = (plan: GpaImprovementPlan) => {
    setAdoptedStrategy(plan.strategy);
    try {
      localStorage.setItem(`gpa_adopted_strategy_${studentId}`, plan.strategy);
      // Stage course codes for automatic preselection in registration
      const stagedCodes = plan.courses.map(c => c.courseCode);
      localStorage.setItem(`staged_recovery_courses_${studentId}`, JSON.stringify(stagedCodes));
      localStorage.setItem('staged_recovery_courses', JSON.stringify(stagedCodes));
    } catch {}

    setActiveModalPlan(plan);
    setSuccessToast(
      language === 'ar'
        ? `تم اعتماد ${plan.titleAr} بنجاح وإدراج مقرراتها في خطتك الدراسية.`
        : `Successfully adopted ${plan.titleEn} and staged courses in your study plan.`
    );

    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  const handleNavigate = (tab: string, path: string) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    } else {
      navigate(path);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const deficitPoints = student
    ? Math.max(0, Math.round((2.0 * student.completedCredits - student.cumulativeGpa * student.completedCredits) * 100) / 100)
    : 0;

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 start-6 z-50 bg-emerald-900 text-white px-5 py-3.5 rounded-2xl shadow-xl border border-emerald-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold leading-relaxed">{successToast}</span>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-emerald-300 hover:text-white ms-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Overview & Deficit Card */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold tracking-tight">
                {t('مخطط إنقاذ وتحسين المعدل التراكمي (GPA Recovery)', 'GPA Recovery & Warning Removal Planner')}
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              {t(
                'يقوم النظام بحساب العجز النقطي الدقيق اللازم لتخطي حاجز 2.00 وإلغاء الإنذارات، وتوليد 3 استراتيجيات واقعية مع تطبيق سقف تقدير الإعادة المعتمد باللائحة.',
                'The engine calculates point deficits required to surpass the 2.00 safety threshold and generates 3 tailored strategies respecting retake caps.'
              )}
            </p>
          </div>

          {/* Deficit Badge */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/15 text-center min-w-[200px]">
            <span className="text-xs text-slate-300 block mb-1">
              {t('العجز النقطي المطلوب تعويضه', 'Net Points Deficit')}
            </span>
            <span className="text-3xl font-extrabold text-amber-300">
              +{deficitPoints} {t('نقطة', 'pts')}
            </span>
            <span className="text-[10px] text-slate-400 block mt-1">
              {t('للوصول إلى معدل 2.00 الآمن', 'to reach 2.00 threshold')}
            </span>
          </div>
        </div>
      </div>

      {/* Retake Cap Rules Callout */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block mb-0.5">
            {t('ضوابط لائحة إعادة المقررات الرسمية:', 'Official Retake Grade Cap Bylaw:')}
          </span>
          <p className="text-amber-800 leading-relaxed">
            {t(
              'الإعادة الأولى بعد الرسوب تسقف عند تقدير B+ (3.2 نقطة)، الإعادة الثانية تسقف عند C+ (2.6 نقطة)، والإعادة الثالثة تسقف عند D+ (2.0 نقطة). جميع الخطط أدناه تراعي هذه الأسقف تلقائياً.',
              'First retake is capped at B+ (3.2), second at C+ (2.6), and subsequent at D+ (2.0). All generated strategies below strictly adhere to these caps.'
            )}
          </p>
        </div>
      </div>

      {/* 3 Strategy Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {plans.map(plan => {
          const isRecommended = plan.strategy === 'Balanced';
          const isCurrentlyAdopted = adoptedStrategy === plan.strategy;

          return (
            <div
              key={plan.strategy}
              className={`bg-white rounded-2xl p-5 border flex flex-col justify-between shadow-xs transition-all hover:shadow-md ${
                isCurrentlyAdopted
                  ? 'border-emerald-500 ring-2 ring-emerald-300 bg-emerald-50/10'
                  : isRecommended
                  ? 'border-indigo-500 ring-2 ring-indigo-200'
                  : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isCurrentlyAdopted
                          ? 'bg-emerald-600 text-white'
                          : isRecommended
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isCurrentlyAdopted
                        ? t('الخطة المعتمدة حالياً', 'Active Adopted Plan')
                        : isRecommended
                        ? t('الخيار الموصى به', 'Recommended')
                        : plan.strategy}
                    </span>
                    {isCurrentlyAdopted && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        ✓ {t('نشطة', 'Active')}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-500">
                    {plan.semestersNeeded} {t('فصول دراسية', 'Semesters')}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-1">
                  {language === 'ar' ? plan.titleAr : plan.titleEn}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  {language === 'ar' ? plan.descriptionAr : plan.descriptionEn}
                </p>

                {/* KPI Pill */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl mb-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">{t('المعدل المتوقع', 'Projected GPA')}</span>
                    <span className="font-bold text-emerald-600 text-sm">{plan.projectedGpa.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">{t('الساعات المقترحة', 'Total Credits')}</span>
                    <span className="font-bold text-slate-800 text-sm">{plan.creditHoursTotal} {t('ساعة', 'hrs')}</span>
                  </div>
                </div>

                {/* Target Courses in this strategy */}
                <div className="space-y-2 mb-4">
                  <span className="text-xs font-bold text-slate-700 block">
                    {t('المقررات والتقديرات المستهدفة:', 'Target Courses & Grades:')}
                  </span>
                  {plan.courses.map((c, cIdx) => (
                    <div
                      key={`${c.courseCode}_${cIdx}`}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <span className="font-mono text-slate-600">{c.courseCode}</span>
                          <span className="text-[10px] text-slate-400">({c.credits}h)</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                          {language === 'ar' ? c.courseNameAr : c.courseNameEn}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end font-bold">
                          <span className="text-rose-500 line-through text-[11px]">{c.currentGrade}</span>
                          <span className="text-slate-400 text-[10px]">➔</span>
                          <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            {c.targetGrade}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          {t('السقف: ', 'Cap: ')} {c.maxPossibleGrade}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleApplyPlan(plan)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  isCurrentlyAdopted
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                    : isRecommended
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                }`}
              >
                {isCurrentlyAdopted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t('الخطة المعتمدة (اضغط للاستعراض والإجراءات)', 'Adopted Plan (Click to View Actions)')}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{t('اعتماد هذه الخطة في خطتي الدراسية', 'Apply This Recovery Plan')}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Plan Adoption Modal */}
      {activeModalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {t('تم اعتماد خطة تحسين المعدل بنجاح! 🎉', 'GPA Recovery Plan Adopted! 🎉')}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {language === 'ar' ? activeModalPlan.titleAr : activeModalPlan.titleEn}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalPlan(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Plan Highlights */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-bold mb-0.5">
                    {t('المعدل المتوقع', 'Projected GPA')}
                  </span>
                  <span className="text-base font-extrabold text-emerald-600 font-mono">
                    {activeModalPlan.projectedGpa.toFixed(2)}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-bold mb-0.5">
                    {t('إجمالي الساعات', 'Total Hours')}
                  </span>
                  <span className="text-base font-extrabold text-indigo-700 font-mono">
                    {activeModalPlan.creditHoursTotal}h
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-bold mb-0.5">
                    {t('المدة المقترحة', 'Duration')}
                  </span>
                  <span className="text-base font-extrabold text-slate-800 font-mono">
                    {activeModalPlan.semestersNeeded} {t('فصل', 'Terms')}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1.5">
                  {t('المقررات المجدولة لإعادة التسجيل ورفع المعدل:', 'Target Retake & Recovery Courses:')}
                </span>
                <div className="space-y-1.5">
                  {activeModalPlan.courses.map((c, idx) => (
                    <div
                      key={`${c.courseCode}_${idx}`}
                      className="bg-white px-3 py-2 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {c.courseCode}
                        </span>
                        <span className="font-medium text-slate-800">
                          {language === 'ar' ? c.courseNameAr : c.courseNameEn}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span className="text-rose-500 line-through text-[11px]">{c.currentGrade}</span>
                        <span className="text-slate-400 text-[10px]">➔</span>
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {c.targetGrade}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Next Action Choices */}
            <div className="space-y-2.5 pt-2">
              <span className="text-xs font-bold text-slate-600 block">
                {t('ما هي خطوتك التالية؟', 'What would you like to do next?')}
              </span>

              <button
                onClick={() => {
                  setActiveModalPlan(null);
                  handleNavigate('student-registration', '/student/registration');
                }}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-between shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4" />
                  <span>{t('الانتقال للتسجيل الفصلي المباشر (تسجيل مقررات الخطة)', 'Go to Course Registration (Enroll Staged Courses)')}</span>
                </div>
                {language === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => {
                  setActiveModalPlan(null);
                  handleNavigate('student-study-plan', '/student/study-plan');
                }}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  <span>{t('استعراض وتحديث خطة التخرج الزمنية', 'View & Update Degree Study Plan')}</span>
                </div>
                {language === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>

              <button
                onClick={() => {
                  setActiveModalPlan(null);
                  handleNavigate('student-what-if', '/student/what-if');
                }}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  <span>{t('محاكاة المعدل مع تقديرات مختلفة (What-If Sandbox)', 'Simulate GPA Projections in What-If Sandbox')}</span>
                </div>
                {language === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>

              <div className="pt-2 text-center">
                <button
                  onClick={() => setActiveModalPlan(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold transition cursor-pointer"
                >
                  {t('البقاء في صفحة تحسين المعدل', 'Stay on this page')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
