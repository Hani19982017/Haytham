import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student, TrainingSubmission } from '../../types/index.js';
import { PageHeader, Panel, PanelHeader, Chip, Meter, Loader, EmptyState, Field, cn, chipClass, trainingLabel, trainingTone, pick } from '../ui/index.js';
import {
  Briefcase,
  CheckCircle2,
  Building2,
  Clock,
  CalendarDays,
  Send,
  AlertTriangle,
  Lock,
  RotateCcw,
  BadgeCheck,
  UploadCloud,
  FileText,
  Paperclip,
  History,
  XCircle,
} from 'lucide-react';

const PERIOD_HOURS = 120;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

const day = (iso: string | undefined, language: string) =>
  iso ? new Date(iso).toLocaleDateString(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const SummerTrainingView: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [student, setStudent] = useState<Student | null>(null);
  const [submissions, setSubmissions] = useState<TrainingSubmission[]>([]);
  const [required, setRequired] = useState(240);
  const [minCredits, setMinCredits] = useState(30);
  const [maxFileMb, setMaxFileMb] = useState(5);
  const [company, setCompany] = useState('');
  const [hours, setHours] = useState(120);
  const [periodWeeks, setPeriodWeeks] = useState(4);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [data, list] = await Promise.all([api.getStudentById(studentId), api.getTrainingSubmissions(studentId).catch(() => null)]);
        setStudent(data);
        if (list) {
          setSubmissions(list.submissions);
          setRequired(list.requiredHours);
          setMinCredits(list.minCredits);
          setMaxFileMb(list.maxFileMb);
        }
      } catch (err) {
        console.error('Failed to load training info:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [studentId, reloadKey]);

  const pickFile = (file: File | null) => {
    setErrorMsg(null);
    if (!file) {
      setProof(null);
      return;
    }
    if (file.size > maxFileMb * 1024 * 1024) {
      setErrorMsg(t(`حجم الملف أكبر من ${maxFileMb} ميجابايت.`, `The file is larger than ${maxFileMb} MB.`));
      setProof(null);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setProof(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmittedMsg(false);
    if (!proof) {
      setErrorMsg(t('ارفع ما يثبت التدريب: شهادة أو خطاب من جهة التدريب (PDF أو صورة).', 'Upload proof of the training: a certificate or a letter from the company (PDF or image).'));
      return;
    }
    try {
      setSubmitting(true);
      const res = await api.submitTraining(studentId, { company, hours, periodWeeks, startDate, endDate, notes }, proof);
      if (res.success) {
        setSubmittedMsg(true);
        setCompany('');
        setNotes('');
        setStartDate('');
        setEndDate('');
        setProof(null);
        if (fileInput.current) fileInput.current.value = '';
        setReloadKey(k => k + 1);
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

  const isEligible = student.completedCredits >= minCredits;
  const trainingHours = student.trainingHours || 0;
  const pendingHours = submissions.filter(s => s.status === 'Pending').reduce((sum, s) => sum + s.hours, 0);
  const creditsMissing = Math.max(0, minCredits - student.completedCredits);
  const statusTone = trainingTone[student.trainingStatus] || 'ink';
  const periodsCount = Math.max(1, Math.round(required / PERIOD_HOURS));
  const periods = Array.from({ length: periodsCount }, (_, i) => {
    const done = Math.max(0, Math.min(PERIOD_HOURS, trainingHours - i * PERIOD_HOURS));
    return { index: i, done, complete: done >= PERIOD_HOURS };
  });
  const totalPct = Math.min(100, Math.round((trainingHours / required) * 100));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Briefcase}
        tone="caution"
        title={t('التدريب الصيفي الميداني', 'Summer field training')}
        description={t(
          `تشترط اللائحة ${required} ساعة تدريب (فترتان، 120 ساعة لكل فترة و4 أسابيع على الأقل) بعد إنجاز ${minCredits} ساعة معتمدة. ارفع لكل فترة ما يثبتها (شهادة أو خطاب من جهة التدريب)، ويعتمدها مرشدك فتُحتسب ساعاتها.`,
          `The bylaw requires ${required} training hours (two periods of 120 hours, at least 4 weeks each) after ${minCredits} completed credit hours. Upload proof for each period (a certificate or company letter); once your advisor accepts it, its hours count.`
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
        {/* ── Progress ─────────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader icon={Clock} tone="caution" title={t('الساعات المعتمدة', 'Accepted hours')} description={t('تُحتسب الساعات بعد قبول المرشد للإثبات.', 'Hours count once your advisor accepts the proof.')} />
          <div className="flex items-baseline gap-1.5">
            <span className="t-num text-[38px] font-extrabold leading-none text-ink-950">{trainingHours}</span>
            <span className="text-[13px] text-ink-500">{t(`من ${required} ساعة (${totalPct}%)`, `of ${required} hours (${totalPct}%)`)}</span>
          </div>
          {pendingHours > 0 && (
            <p className="mt-2 text-[12.5px] font-semibold text-route-700">
              {t(`و${pendingHours} ساعة بانتظار مراجعة المرشد.`, `${pendingHours} more hours are waiting for your advisor.`)}
            </p>
          )}

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
                    {p.index === 0 ? t('الفترة الأولى', 'First period') : p.index === 1 ? t('الفترة الثانية', 'Second period') : t(`الفترة ${p.index + 1}`, `Period ${p.index + 1}`)}
                  </span>
                  <span className="t-num text-[12.5px] font-bold text-ink-700">
                    {p.done} / {PERIOD_HOURS}
                  </span>
                </div>
                <Meter value={(p.done / PERIOD_HOURS) * 100} tone={p.complete ? 'sign' : 'route'} label={t(`الفترة ${p.index + 1}`, `Period ${p.index + 1}`)} />
              </li>
            ))}
          </ol>

          <dl className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-ink-100 bg-ink-50 p-4">
            <div className="kv">
              <dt>{t('الساعات المعتمدة المنجزة', 'Credit hours completed')}</dt>
              <dd>
                <span className={cn('t-num', isEligible ? 'text-sign-700' : 'text-signal-600')}>{student.completedCredits}</span>{' '}
                <span className="text-[12px] font-medium text-ink-500">{t(`ساعة (الشرط ${minCredits})`, `hours (${minCredits} required)`)}</span>
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
            {t('يراجع مرشدك الأكاديمي كل إثبات ويقبله أو يرفضه مع ذكر السبب، ويصلك إشعار بالقرار.', 'Your academic advisor reviews each proof and accepts or rejects it with a reason; you are notified of the decision.')}
          </p>
        </Panel>

        {/* ── Submit a period with its proof ───────────────────────────── */}
        <Panel>
          <PanelHeader
            icon={Send}
            tone="sign"
            title={t('سجّل فترة تدريب وارفع إثباتها', 'Log a training period with its proof')}
            description={t('اكتب بيانات جهة التدريب كما في الشهادة، وارفع الشهادة أو خطاب الجهة.', 'Enter the organisation’s details as on the certificate, and upload the certificate or the company’s letter.')}
          />

          {!isEligible && (
            <div className="callout callout-signal mb-5" role="note">
              <Lock aria-hidden="true" />
              <p>
                {t(
                  `يُفتح التقديم بعد إنجاز ${minCredits} ساعة معتمدة. أنجزت ${student.completedCredits} ساعة، يتبقى لك ${creditsMissing} ساعة.`,
                  `Applications open after ${minCredits} completed credit hours. You have ${student.completedCredits}, so ${creditsMissing} more to go.`
                )}
              </p>
            </div>
          )}

          {submittedMsg && (
            <div className="callout callout-sign mb-5" role="status">
              <CheckCircle2 aria-hidden="true" />
              <p className="font-semibold">{t('أُرسل الإثبات لمرشدك للمراجعة، وستصلك نتيجة المراجعة في الإشعارات.', 'Your proof was sent to your advisor; the decision will reach you in your notifications.')}</p>
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
                  disabled={!isEligible}
                  placeholder={t('مثال: شركة مصر للحلول الرقمية', 'e.g. a software house or an IT department')}
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className="field ps-10"
                />
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label={t('عدد الساعات', 'Hours')} htmlFor="training-hours" hint={t('الفترة الكاملة 120 ساعة.', 'A full period is 120 hours.')}>
                <div className="relative">
                  <Clock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                  <input id="training-hours" type="number" min="1" max="480" disabled={!isEligible} value={hours} onChange={e => setHours(Number(e.target.value))} className="field ps-10" />
                </div>
              </Field>
              <Field label={t('المدة بالأسابيع', 'Duration in weeks')} htmlFor="training-weeks" hint={t('4 أسابيع على الأقل للفترة.', 'At least 4 weeks per period.')}>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                  <input id="training-weeks" type="number" min="1" max="26" disabled={!isEligible} value={periodWeeks} onChange={e => setPeriodWeeks(Number(e.target.value))} className="field ps-10" />
                </div>
              </Field>
              <Field label={t('من تاريخ', 'From')} htmlFor="training-start">
                <input id="training-start" type="date" disabled={!isEligible} value={startDate} onChange={e => setStartDate(e.target.value)} className="field" />
              </Field>
              <Field label={t('إلى تاريخ', 'To')} htmlFor="training-end">
                <input id="training-end" type="date" disabled={!isEligible} value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)} className="field" />
              </Field>
            </div>

            <Field
              label={t('إثبات التدريب (مطلوب)', 'Proof of training (required)')}
              htmlFor="training-proof"
              hint={t(`شهادة أو خطاب من جهة التدريب — PDF أو صورة (JPG/PNG)، حتى ${maxFileMb} ميجابايت.`, `A certificate or a letter from the company — PDF or image (JPG/PNG), up to ${maxFileMb} MB.`)}
            >
              <label
                htmlFor="training-proof"
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 transition',
                  proof ? 'border-sign-400 bg-sign-50' : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50',
                  !isEligible && 'cursor-not-allowed opacity-60'
                )}
              >
                {proof ? <FileText className="h-6 w-6 shrink-0 text-sign-700" aria-hidden="true" /> : <UploadCloud className="h-6 w-6 shrink-0 text-ink-400" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink-800">{proof ? proof.name : t('اختر ملف الشهادة', 'Choose the certificate file')}</span>
                  <span className="block text-[12px] text-ink-500">{proof ? `${Math.max(1, Math.round(proof.size / 1024))} KB` : t('اضغط هنا لاختيار الملف من جهازك أو هاتفك', 'Tap to choose the file from your device or phone')}</span>
                </span>
              </label>
              <input id="training-proof" ref={fileInput} type="file" accept={ACCEPT} disabled={!isEligible} className="sr-only" onChange={e => pickFile(e.target.files?.[0] || null)} />
            </Field>

            <Field label={t('ملاحظات (اختياري)', 'Notes (optional)')} htmlFor="training-notes">
              <input id="training-notes" type="text" disabled={!isEligible} value={notes} onChange={e => setNotes(e.target.value)} className="field" placeholder={t('مثال: تدريب على تطوير الويب', 'e.g. web development training')} />
            </Field>

            <div className="flex flex-col-reverse gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-ink-500">{t('يصل الإثبات لمرشدك ليراجعه، ويُحفظ في ملفك.', 'The proof goes to your advisor for review and is kept in your file.')}</p>
              <button type="submit" disabled={submitting || !isEligible} className="btn btn-primary">
                {submitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" /> : <Send aria-hidden="true" className="rtl:-scale-x-100" />}
                {submitting ? t('جارٍ الإرسال…', 'Sending…') : t('أرسل للمراجعة', 'Send for review')}
              </button>
            </div>
          </form>
        </Panel>
      </div>

      {/* ── What was sent so far ────────────────────────────────────────── */}
      <Panel padded={false}>
        <div className="px-5 pt-5 sm:px-6">
          <PanelHeader icon={History} tone="ink" title={t('فترات التدريب المرسلة', 'Training periods sent')} />
        </div>
        {submissions.length === 0 ? (
          <EmptyState icon={Paperclip} title={t('لم ترسل أي فترة تدريب بعد', 'No training period sent yet')} />
        ) : (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {submissions.map(s => (
              <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{s.company}</span>
                    <span className={chipClass[trainingTone[s.status] || 'ink']}>{pick(language, trainingLabel[s.status], s.status)}</span>
                  </p>
                  <p className="text-[12.5px] text-ink-600">
                    <span className="t-num">{s.hours}</span> {t('ساعة', 'hours')} · <span className="t-num">{s.periodWeeks}</span> {t('أسابيع', 'weeks')}
                    {(s.startDate || s.endDate) && ` · ${day(s.startDate, language)} — ${day(s.endDate, language)}`} · {t('أُرسل', 'sent')} {day(s.createdAt, language)}
                  </p>
                  {s.reviewNotes && (
                    <p className={cn('mt-1 flex items-start gap-1.5 text-[12.5px]', s.status === 'Failed' ? 'text-signal-700' : 'text-ink-600')}>
                      {s.status === 'Failed' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                      {s.reviewedByName ? `${s.reviewedByName}: ` : ''}
                      {s.reviewNotes}
                    </p>
                  )}
                </div>
                {s.proofFileName && (
                  <button
                    type="button"
                    onClick={() => api.openTrainingProof(s.id, s.proofFileName).catch(() => setErrorMsg(t('تعذّر فتح الملف.', 'The file could not be opened.')))}
                    className="btn btn-secondary btn-sm shrink-0"
                  >
                    <Paperclip aria-hidden="true" />
                    <span className="max-w-[180px] truncate">{s.proofFileName}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};
