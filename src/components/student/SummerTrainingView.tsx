import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student } from '../../types/index.js';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Building,
  Calendar,
  Send,
  AlertTriangle,
  Award,
} from 'lucide-react';

export const SummerTrainingView: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [student, setStudent] = useState<Student | null>(null);
  const [company, setCompany] = useState('');
  const [hours, setHours] = useState(120);
  const [periodWeeks, setPeriodWeeks] = useState(4);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
      try {
        setLoading(true);
        const data = await api.getStudentById(studentId);
        setStudent(data);
      } catch (err) {
        console.error('Failed to load training info:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
    setErrorMsg(null);

    try {
      setSubmitting(true);
      const res = await api.submitTraining(studentId, { company, hours, periodWeeks });
      if (res.success) {
        setSubmittedMsg(true);
        const updated = await api.getStudentById(studentId);
        setStudent(updated);
        setCompany('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting training record');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !student) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const isEligible = student.completedCredits >= 30;
  const trainingHours = student.trainingHours || 0;
  const totalRequired = 240; // 2 periods of 120 hrs

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 mb-1 text-indigo-600">
          <Briefcase className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900">
            {t('وحدة التدريب الميداني الصيفي (Summer Field Training)', 'Summer Field Training Module')}
          </h2>
        </div>
        <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
          {t(
            'تشترط اللائحة إتمام فترتين تدريبيتين (120 ساعة لكل فترة بإجمالي 240 ساعة، 4 أسابيع على الأقل) بعد استيفاء 30 ساعة معتمدة.',
            'Bylaws mandate two 120-hour periods (total 240 hrs, min 4 weeks each) in registered software/IT organizations after completing 30 credits.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Progress & Status Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
              {t('حالة التدريب الصيفي الحالية', 'Current Training Status')}
            </span>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-extrabold text-slate-900">{trainingHours}</span>
              <span className="text-xs text-slate-400">/ {totalRequired} {t('ساعة معتمدة', 'hrs required')}</span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-3">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((trainingHours / totalRequired) * 100))}%` }}
              ></div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>{t('حالة الملف:', 'Status:')}</span>
                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  {student.trainingStatus}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{t('أهلية التقديم:', 'Eligibility:')}</span>
                <span className={`font-bold ${isEligible ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isEligible
                    ? t('مؤهل (أنجز > 30 ساعة)', 'Eligible (> 30 credits)')
                    : t('غير مؤهل بعد (< 30 ساعة)', 'Ineligible (< 30 credits)')}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500">
            {t('جهة الاعتماد: لجنة التدريب وشؤون الطلاب بالكلية.', 'Accreditation: Faculty Summer Training Committee.')}
          </div>
        </div>

        {/* Submit Training Record Form */}
        <div className="md:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            {t('تقديم إفادة تدريب صيفي جديدة', 'Submit Training Certificate')}
          </h3>

          {submittedMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t('تم تسجيل طلب التدريب الصيفي بنجاح وإرساله للمراجعة.', 'Training record submitted successfully.')}</span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {t('اسم الشركة أو المؤسسة المعتمدة', 'Organization / Company Name')}
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder={t('مثال: شركة مصر للحلول الرقمية / Vodafone Egypt', 'e.g. Software House / IT Dept')}
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  {t('عدد الساعات المنجزة (120 ساعة كحد أدنى)', 'Training Hours (Min 120)')}
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="number"
                    min="60"
                    max="240"
                    value={hours}
                    onChange={e => setHours(Number(e.target.value))}
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  {t('مدة التدريب بالأسابيع (4 أسابيع على الأقل)', 'Duration (Weeks, min 4)')}
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="number"
                    min="2"
                    max="12"
                    value={periodWeeks}
                    onChange={e => setPeriodWeeks(Number(e.target.value))}
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !isEligible}
              className={`w-full py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                !isEligible
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>{t('إرسال المستندات للجنة شؤون الطلاب', 'Submit for Committee Approval')}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
