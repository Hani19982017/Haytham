import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { StudyPlan } from '../../types/index.js';
import {
  CalendarDays,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  GraduationCap,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';

export const StudyPlanView: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [pace, setPace] = useState<'NORMAL' | 'LIGHT' | 'HEAVY' | 'INCLUDE_SUMMER'>('NORMAL');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  useEffect(() => {
    async function loadPlan() {
      if (!currentUser?.studentId) return;
      try {
        setLoading(true);
        const data = await api.getStudyPlan(currentUser.studentId, pace);
        setPlan(data);
      } catch (err) {
        console.error('Failed to load study plan:', err);
      } finally {
        setLoading(false);
      }
    }
    loadPlan();
  }, [currentUser, pace]);

  const handleSubmitPlan = async () => {
    if (!currentUser?.studentId) return;
    try {
      setSubmitting(true);
      const res = await api.submitStudyPlan(currentUser.studentId);
      if (res.success) {
        setSubmittedSuccess(true);
        if (plan) {
          setPlan({ ...plan, status: 'Pending Review' });
        }
      }
    } catch (err) {
      console.error('Error submitting plan:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge: Record<string, string> = {
    'Draft': 'bg-slate-100 text-slate-700 border-slate-200',
    'Pending Review': 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse',
    'Approved': 'bg-emerald-50 text-emerald-800 border-emerald-200',
    'Rejected': 'bg-rose-50 text-rose-800 border-rose-200',
  };

  const statusLabel: Record<string, { ar: string; en: string }> = {
    'Draft': { ar: 'مسودة قيد الإعداد', en: 'Draft' },
    'Pending Review': { ar: 'بانتظار مراجعة المرشد الأكاديمي', en: 'Pending Advisor Review' },
    'Approved': { ar: 'معتمدة رسمياً من المرشد', en: 'Officially Approved' },
    'Rejected': { ar: 'مرفوضة / بحاجة لتعديل', en: 'Changes Requested' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="space-y-6">
      {/* Header & Control Panel */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {t('خطة التخرج الزمنية المقترحة ذكياً', 'AI-Generated Graduation Study Plan')}
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                statusBadge[plan.status] || 'bg-slate-100'
              }`}
            >
              {language === 'ar' ? statusLabel[plan.status]?.ar : statusLabel[plan.status]?.en}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {t(
              `تاريخ التخرج المتوقع: ${language === 'ar' ? plan.expectedGraduationSemesterAr : plan.expectedGraduationSemesterEn} | إجمالي الساعات المخططة: ${plan.totalPlannedCredits} ساعة.`,
              `Expected Graduation: ${plan.expectedGraduationSemesterEn} | Total Planned Credits: ${plan.totalPlannedCredits} hrs.`
            )}
          </p>
        </div>

        {/* Pacing & Submit Button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 mx-1" />
            <button
              onClick={() => setPace('NORMAL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                pace === 'NORMAL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('المعدل الطبيعي (18)', 'Normal (18h)')}
            </button>
            <button
              onClick={() => setPace('LIGHT')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                pace === 'LIGHT' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('عبء خفيف (12-15)', 'Light Load')}
            </button>
            <button
              onClick={() => setPace('INCLUDE_SUMMER')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                pace === 'INCLUDE_SUMMER' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('تضمين فصول الصيف', 'With Summer')}
            </button>
          </div>

          <button
            disabled={submitting || plan.status === 'Approved' || plan.status === 'Pending Review'}
            onClick={handleSubmitPlan}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
              plan.status === 'Approved'
                ? 'bg-emerald-100 text-emerald-800 cursor-not-allowed'
                : plan.status === 'Pending Review'
                ? 'bg-amber-100 text-amber-800 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {plan.status === 'Approved'
                ? t('الخطة معتمدة', 'Plan Approved')
                : plan.status === 'Pending Review'
                ? t('بانتظار الاعتماد', 'Awaiting Approval')
                : t('إرسال الخطة للاعتماد', 'Submit to Advisor')}
            </span>
          </button>
        </div>
      </div>

      {submittedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-3 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            {t(
              'تم إرسال الخطة بنجاح إلى مرشدك الأكاديمي، ستتلقى إشعاراً فور مراجعتها واعتمادها.',
              'Study plan submitted to your advisor. You will be notified upon review.'
            )}
          </span>
        </div>
      )}

      {/* Timeline Semesters Grid */}
      <div className="space-y-4">
        {plan.semesters.map((sem, sIdx) => {
          const isSummer = sem.type === 'SUMMER';

          return (
            <div
              key={sem.semesterIndex}
              className={`bg-white rounded-2xl p-5 border ${
                isSummer ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200'
              } shadow-xs`}
            >
              {/* Semester Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isSummer ? 'bg-amber-100 text-amber-800' : 'bg-indigo-50 text-indigo-700'
                    }`}
                  >
                    #{sem.semesterIndex}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {language === 'ar' ? sem.semesterNameAr : sem.semesterNameEn}
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      {sem.type === 'SUMMER' ? t('فصل صيفي مكثف (8 أسابيع)', 'Intensive Summer (8 Weeks)') : t('فصل نظامي (15 أسبوع)', 'Regular Semester (15 Weeks)')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="font-bold text-slate-700">
                    {t('المجموع: ', 'Total: ')}
                    <span className="text-indigo-600">{sem.totalCredits}</span> {t('ساعة', 'hrs')}
                  </span>
                </div>
              </div>

              {/* Courses in this semester */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {sem.courses.map(course => (
                  <div
                    key={course.courseCode}
                    className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold text-slate-700 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                        {course.courseCode}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {course.credits} {t('ساعات', 'hrs')}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {language === 'ar' ? course.courseNameAr : course.courseNameEn}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                      {course.isRetake ? (
                        <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">
                          {t('إعادة تحسين', 'Retake')}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {course.isMandatory ? t('إجباري', 'Required') : t('اختياري', 'Elective')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
