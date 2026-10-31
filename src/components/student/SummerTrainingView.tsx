import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student } from '../../types/index.js';
import {
  PageHeader,
  Panel,
  PanelHeader,
  Chip,
  Meter,
  Loader,
  EmptyState,
  Field,
  cn,
  chipClass,
  trainingLabel,
  trainingTone,
  pick,
} from '../ui/index.js';
import { Briefcase, CheckCircle2, Building2, Clock, CalendarDays, Send, AlertTriangle, Lock, RotateCcw, BadgeCheck } from 'lucide-react';

const PERIOD_HOURS = 120;
const TOTAL_REQUIRED = 240; // 2 periods of 120 hrs
const MIN_CREDITS = 30;

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
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [currentUser, reloadKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
    setErrorMsg(null);
    setSubmittedMsg(false);

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
      const data = err?.response?.data;
      const serverMsg = language === 'ar' ? data?.messageAr || data?.error : data?.messageEn || data?.messageAr || data?.error;
      setErrorMsg(serverMsg || t('تعذّر إرسال طلب التدريب. حاول مرة أخرى.', 'The training record could not be sent. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loader label={t('جارٍ تحميل ملف التدريب…', 'Loading your training record…')} />;
  }

  if (!student) {
    return (
      <Panel>
        <EmptyState
          icon={AlertTriangle}
          tone="caution"
          title={t('تعذّر تحميل ملف التدريب', 'Your training record could not be loaded')}
          description={t('الخادم لم يرد. تأكد أن الخادم يعمل ثم أعد المحاولة.', 'The server did not respond. Check that it is running, then try again.')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setReloadKey(k => k + 1)}>
              <RotateCcw aria-hidden="true" />
              {t('إعادة المحاولة', 'Try again')}
            </button>
          }
        />
      </Panel>
    );
  }

  const isEligible = student.completedCredits >= MIN_CREDITS;
  const trainingHours = student.trainingHours || 0;
  const creditsMissing = Math.max(0, MIN_CREDITS - student.completedCredits);
  const statusTone = trainingTone[student.trainingStatus] || 'ink';
  const periods = [0, 1].map(i => {
    const done = Math.max(0, Math.min(PERIOD_HOURS, trainingHours - i * PERIOD_HOURS));
    return { index: i, done, complete: done >= PERIOD_HOURS };
  });
  const totalPct = Math.min(100, Math.round((trainingHours / TOTAL_REQUIRED) * 100));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Briefcase}
        tone="caution"
        title={t('التدريب الصيفي الميداني', 'Summer field training')}
        description={t(
          'تشترط اللائحة فترتين تدريبيتين، 120 ساعة لكل فترة و4 أسابيع على الأقل، في جهة برمجيات أو تقنية معلومات بعد إنجاز 30 ساعة معتمدة.',
          'The bylaws require two training periods of 120 hours each (at least 4 weeks) at a software or IT organisation, after you complete 30 credit hours.'
        )}
        meta={
          <>
            <span className={chipClass[statusTone]}>
              {t('حالة الملف:', 'Status:')} {pick(language, trainingLabel[student.trainingStatus], student.trainingStatus)}
            </span>
            <Chip tone={isEligible ? 'sign' : 'signal'} icon={isEligible ? CheckCircle2 : Lock}>
              {isEligible ? t('مؤهل للتقديم', 'Eligible to apply') : t('غير مؤهل بعد', 'Not eligible yet')}
            </Chip>
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* ── Progress: two periods of 120 hours ─────────────────────────── */}
        <Panel>
          <PanelHeader
            icon={Clock}
            tone="caution"
            title={t('ساعات التدريب', 'Training hours')}
            description={t('فترتان، كل فترة 120 ساعة.', 'Two periods of 120 hours each.')}
          />
          <div className="flex items-baseline gap-1.5">
            <span className="t-num text-[38px] font-extrabold leading-none text-ink-950">{trainingHours}</span>
            <span className="text-[13px] text-ink-500">{t(`من ${TOTAL_REQUIRED} ساعة (${totalPct}%)`, `of ${TOTAL_REQUIRED} hours (${totalPct}%)`)}</span>
          </div>

          <ol className="mt-5 space-y-4">
            {periods.map(p => (
              <li key={p.index}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2 font-semibold text-ink-800">
                    <span
                      className={cn(
                        'grid h-6 w-6 place-items-center rounded-full text-[11.5px] font-extrabold',
                        p.complete ? 'bg-sign-600 text-white' : p.done > 0 ? 'bg-route-400 text-ink-950' : 'bg-ink-100 text-ink-600'
                      )}
                      aria-hidden="true"
                    >
                      {p.complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : p.index + 1}
                    </span>
                    {p.index === 0 ? t('الفترة الأولى', 'First period') : t('الفترة الثانية', 'Second period')}
                  </span>
                  <span className="t-num text-[12.5px] font-bold text-ink-700">
                    {p.done} / {PERIOD_HOURS}
                  </span>
                </div>
                <Meter
                  value={(p.done / PERIOD_HOURS) * 100}
                  tone={p.complete ? 'sign' : 'route'}
                  label={p.index === 0 ? t('الفترة الأولى', 'First period') : t('الفترة الثانية', 'Second period')}
                />
              </li>
            ))}
          </ol>

          <dl className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-ink-100 bg-ink-50 p-4">
            <div className="kv">
              <dt>{t('الساعات المعتمدة المنجزة', 'Credit hours completed')}</dt>
              <dd>
                <span className={cn('t-num', isEligible ? 'text-sign-700' : 'text-signal-600')}>{student.completedCredits}</span>{' '}
                <span className="text-[12px] font-medium text-ink-500">{t(`ساعة (الشرط ${MIN_CREDITS})`, `hours (${MIN_CREDITS} required)`)}</span>
              </dd>
            </div>
            <div className="kv">
              <dt>{t('حالة الملف', 'Record status')}</dt>
              <dd>
                <span className={chipClass[statusTone]}>{pick(language, trainingLabel[student.trainingStatus], student.trainingStatus)}</span>
              </dd>
            </div>
          </dl>

          <p className="mt-4 flex items-start gap-2 text-[12px] leading-5 text-ink-500">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
            {t('تراجع لجنة التدريب وشؤون الطلاب بالكلية كل طلب وتعتمده.', 'The faculty training committee and student affairs review and approve every record.')}
          </p>
        </Panel>

        {/* ── Submit a training period ──────────────────────────────────── */}
        <Panel>
          <PanelHeader
            icon={Send}
            tone="sign"
            title={t('سجّل فترة تدريب', 'Log a training period')}
            description={t('أدخل بيانات جهة التدريب كما في الإفادة الرسمية.', 'Enter the organisation’s details as they appear on the official certificate.')}
          />

          {!isEligible && (
            <div className="callout callout-signal mb-5" role="note">
              <Lock aria-hidden="true" />
              <p>
                {t(
                  `يُفتح التقديم بعد إنجاز ${MIN_CREDITS} ساعة معتمدة. أنجزت ${student.completedCredits} ساعة، يتبقى لك ${creditsMissing} ساعة.`,
                  `Applications open after ${MIN_CREDITS} completed credit hours. You have ${student.completedCredits}, so ${creditsMissing} more to go.`
                )}
              </p>
            </div>
          )}

          {submittedMsg && (
            <div className="callout callout-sign mb-5" role="status">
              <CheckCircle2 aria-hidden="true" />
              <p className="font-semibold">
                {t('سُجّل طلب التدريب وأُرسل للمراجعة. ستتغير حالة الملف بعد اعتماد اللجنة.', 'Your training record was sent for review. Its status changes once the committee approves it.')}
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="callout callout-signal mb-5" role="alert">
              <AlertTriangle aria-hidden="true" />
              <p>{errorMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label={t('اسم الشركة أو الجهة', 'Organisation name')} htmlFor="training-company">
              <div className="relative">
                <Building2 className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                <input
                  id="training-company"
                  type="text"
                  required
                  placeholder={t('مثال: شركة مصر للحلول الرقمية', 'e.g. a software house or an IT department')}
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className="field ps-10"
                />
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label={t('عدد الساعات المنجزة', 'Hours completed')}
                htmlFor="training-hours"
                hint={t('الفترة الكاملة 120 ساعة (من 60 إلى 240).', 'A full period is 120 hours (60 to 240 allowed).')}
              >
                <div className="relative">
                  <Clock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                  <input
                    id="training-hours"
                    type="number"
                    min="60"
                    max="240"
                    value={hours}
                    onChange={e => setHours(Number(e.target.value))}
                    className="field ps-10"
                  />
                </div>
              </Field>

              <Field
                label={t('المدة بالأسابيع', 'Duration in weeks')}
                htmlFor="training-weeks"
                hint={t('4 أسابيع على الأقل للفترة (من 2 إلى 12).', 'At least 4 weeks per period (2 to 12 allowed).')}
              >
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                  <input
                    id="training-weeks"
                    type="number"
                    min="2"
                    max="12"
                    value={periodWeeks}
                    onChange={e => setPeriodWeeks(Number(e.target.value))}
                    className="field ps-10"
                  />
                </div>
              </Field>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-ink-500">
                {t('يُضاف الطلب إلى ملفك وسجل العمليات بعد الإرسال.', 'The record is added to your file and the audit log once sent.')}
              </p>
              <button type="submit" disabled={submitting || !isEligible} className="btn btn-primary">
                {submitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                ) : (
                  <Send aria-hidden="true" className="rtl:-scale-x-100" />
                )}
                {submitting ? t('جارٍ الإرسال…', 'Sending…') : t('أرسل للجنة التدريب', 'Send to the training committee')}
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
};
