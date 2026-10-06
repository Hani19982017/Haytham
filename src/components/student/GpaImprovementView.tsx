import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

export const GpaImprovementView: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [plans, setPlans] = useState<GpaImprovementPlan[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!currentUser?.studentId) return;
      try {
        setLoading(true);
        const [plansData, studentData] = await Promise.all([
          api.getGpaPlans(currentUser.studentId),
          api.getStudentById(currentUser.studentId),
        ]);
        setPlans(plansData);
        setStudent(studentData);
      } catch (err) {
        console.error('Failed to load GPA plans:', err);
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

  const deficitPoints = student
    ? Math.max(0, Math.round((2.0 * student.completedCredits - student.cumulativeGpa * student.completedCredits) * 100) / 100)
    : 0;

  return (
    <div className="space-y-6">
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

          return (
            <div
              key={plan.strategy}
              className={`bg-white rounded-2xl p-5 border flex flex-col justify-between shadow-xs transition-all hover:shadow-md ${
                isRecommended
                  ? 'border-indigo-500 ring-2 ring-indigo-200'
                  : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      isRecommended
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {isRecommended ? t('الخيار الموصى به', 'Recommended') : plan.strategy}
                  </span>
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
                  {plan.courses.map(c => (
                    <div
                      key={c.courseCode}
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
                className={`w-full py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isRecommended
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                }`}
              >
                {t('اعتماد هذه الخطة في خطتي الدراسية', 'Apply This Recovery Plan')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
