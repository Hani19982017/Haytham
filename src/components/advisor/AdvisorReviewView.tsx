import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { PlanStatus, RegistrationRequestReview, Student, StudyPlan } from '../../types/index.js';
import {
  PageHeader,
  Panel,
  Chip,
  CodeBadge,
  Loader,
  EmptyState,
  Segmented,
  Meter,
  Toast,
  cn,
  chipClass,
  toneColor,
  riskTone,
  riskLabel,
  trackTone,
  trackLabel,
  planStatusTone,
  planStatusLabel,
  requestStatusTone,
  requestStatusLabel,
  bilingualPart,
  personName,
  pick,
} from '../ui/index.js';
import {
  FileCheck2,
  CalendarCheck,
  Route,
  History,
  Check,
  Pencil,
  XCircle,
  Flag,
  MessageSquareText,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  GraduationCap,
} from 'lucide-react';

type Tab = 'REGISTRATION' | 'PLANS' | 'HISTORY';

const errorText = (err: any, language: string, ar: string, en: string) => {
  const data = err?.response?.data;
  return (language === 'ar' ? data?.messageAr : data?.messageEn) || (language === 'ar' ? ar : en);
};

/**
 * What the advisor approves: each student's term timetable (the sections they
 * chose, the GPA recovery route they adopted, the bylaw checks) and their study
 * plans to graduation, with the full contents in front of them.
 */
export const AdvisorReviewView: React.FC<{
  students: Student[];
  onPlanDecided: (studentId: string, status: PlanStatus) => void;
}> = ({ students, onPlanDecided }) => {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState<Tab>('REGISTRATION');
  const [reviews, setReviews] = useState<RegistrationRequestReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'sign' | 'signal'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setReviews(await api.getAdvisorRegistrationRequests());
      setFailed(null);
    } catch (err: any) {
      setFailed(errorText(err, language, 'تعذّر تحميل جداول التسجيل.', 'The timetables could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === 'sign' ? 5000 : 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const pending = reviews.filter(r => r.request.status === 'PENDING');
  const decided = reviews.filter(r => r.request.status !== 'PENDING');
  const pendingPlans = useMemo(() => students.filter(s => s.currentPlanStatus === 'Pending Review'), [students]);

  return (
    <div className="space-y-6">
      {toast && (
        <Toast tone={toast.tone} onClose={() => setToast(null)} closeLabel={t('إغلاق', 'Close')}>
          {toast.text}
        </Toast>
      )}

      <PageHeader
        icon={FileCheck2}
        tone="sign"
        title={t('الاعتمادات', 'Approvals')}
        description={t(
          'كل ما أرسله طلابك لاعتمادك بتفاصيله: المقررات والشعب التي اختاروها، وخطة تحسين المعدل إن اعتمدوها، ونتيجة فحص اللائحة. اعتمد ليُسجَّل الطالب في مقرراته، أو أعِده مع ما يلزم تعديله.',
          'Everything your students sent for approval, in full: the courses and sections they chose, the GPA recovery route if they adopted one, and the bylaw check. Approve to register them, or send it back with what to change.'
        )}
        meta={
          <>
            <Chip tone={pending.length ? 'lane' : 'sign'}>{t(`${pending.length} جدول تسجيل بانتظارك`, `${pending.length} timetables waiting`)}</Chip>
            <Chip tone={pendingPlans.length ? 'route' : 'sign'}>{t(`${pendingPlans.length} خطة دراسية بانتظارك`, `${pendingPlans.length} study plans waiting`)}</Chip>
          </>
        }
        actions={
          <Segmented
            ariaLabel={t('نوع الاعتماد', 'What to review')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'REGISTRATION', label: t('جداول التسجيل', 'Timetables'), count: pending.length, icon: CalendarCheck },
              { value: 'PLANS', label: t('خطط الدراسة', 'Study plans'), count: pendingPlans.length, icon: Route },
              { value: 'HISTORY', label: t('قراراتك', 'Your decisions'), count: decided.length, icon: History },
            ]}
          />
        }
      />

      {tab === 'REGISTRATION' &&
        (loading ? (
          <Loader label={t('جارٍ تحميل جداول طلابك…', 'Loading your students’ timetables…')} />
        ) : failed ? (
          <Panel>
            <EmptyState
              icon={AlertTriangle}
              tone="caution"
              title={t('تعذّر التحميل', 'Could not load')}
              description={failed}
              action={
                <button type="button" onClick={load} className="btn btn-primary">
                  <RotateCcw aria-hidden="true" />
                  {t('إعادة المحاولة', 'Try again')}
                </button>
              }
            />
          </Panel>
        ) : pending.length === 0 ? (
          <Panel>
            <EmptyState
              icon={CheckCircle2}
              tone="sign"
              title={t('لا توجد جداول تسجيل تنتظر قرارك', 'No timetables are waiting for you')}
              description={t('عندما يرسل طالب جدوله من صفحة التسجيل يظهر هنا بكل مقرراته، ويصلك إشعار.', 'When a student sends a timetable from the Registration page it shows here with all its courses, and you are notified.')}
            />
          </Panel>
        ) : (
          <div className="space-y-5">
            {pending.map(review => (
              <RegistrationReviewCard
                key={review.request.id}
                review={review}
                onDone={(text, ok) => {
                  setToast({ tone: ok ? 'sign' : 'signal', text });
                  if (ok) load();
                }}
              />
            ))}
          </div>
        ))}

      {tab === 'PLANS' &&
        (pendingPlans.length === 0 ? (
          <Panel>
            <EmptyState icon={CheckCircle2} tone="sign" title={t('لا توجد خطط دراسية تنتظر قرارك', 'No study plans are waiting for you')} />
          </Panel>
        ) : (
          <div className="space-y-4">
            {pendingPlans.map(student => (
              <PlanReviewCard
                key={student.id}
                student={student}
                onDecided={(status, text) => {
                  onPlanDecided(student.id, status);
                  setToast({ tone: 'sign', text });
                }}
                onError={text => setToast({ tone: 'signal', text })}
              />
            ))}
          </div>
        ))}

      {tab === 'HISTORY' &&
        (decided.length === 0 ? (
          <Panel>
            <EmptyState icon={History} title={t('لم تتخذ قرارات على جداول التسجيل بعد', 'No timetable decisions yet')} />
          </Panel>
        ) : (
          <Panel padded={false}>
            <ul className="divide-y divide-ink-100">
              {decided.map(r => (
                <li key={r.request.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">{language === 'ar' ? r.student.nameAr : r.student.nameEn}</span>
                      <span className="t-num text-[12px] text-ink-500">{r.student.studentCode}</span>
                      <span className={chipClass[requestStatusTone[r.request.status]]}>{pick(language, requestStatusLabel[r.request.status], r.request.status)}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {r.offerings.map(o => (
                        <CodeBadge key={o.id} code={o.courseCode} />
                      ))}
                    </p>
                    {r.request.advisorNotes && <p className="mt-1 text-[12.5px] text-ink-600">«{r.request.advisorNotes}»</p>}
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-500">
                    {r.request.decidedAt &&
                      new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.request.decidedAt))}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
    </div>
  );
};

/* -------------------------------------------------------- timetable request */

const RegistrationReviewCard: React.FC<{ review: RegistrationRequestReview; onDone: (text: string, ok: boolean) => void }> = ({ review, onDone }) => {
  const { t, language } = useLanguage();
  const { request, student, offerings, validation } = review;
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'APPROVE' | 'REQUEST_CHANGES' | null>(null);
  const [needNotes, setNeedNotes] = useState(false);
  const name = language === 'ar' ? student.nameAr : student.nameEn;
  const over = review.totalCredits > review.maxAllowedCredits;
  const recoveryTitle = language === 'ar' ? request.recoveryTitleAr : request.recoveryTitleEn;
  const sent = request.submittedAt
    ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.submittedAt))
    : '';

  const decide = async (decision: 'APPROVE' | 'REQUEST_CHANGES') => {
    if (decision === 'REQUEST_CHANGES' && !notes.trim()) {
      setNeedNotes(true);
      return;
    }
    try {
      setBusy(decision);
      const res = await api.decideRegistrationRequest(request.id, decision, notes.trim());
      onDone(
        decision === 'APPROVE'
          ? t(`اعتمدت جدول ${name}، وسُجلت مقرراته (${offerings.map(o => o.courseCode).join('، ')}).`, `Approved ${name}'s timetable; ${offerings.map(o => o.courseCode).join(', ')} registered.`)
          : t(`أُعيد جدول ${name} إليه مع ملاحظاتك.`, `${name}'s timetable was returned with your notes.`),
        !!res.success
      );
    } catch (err: any) {
      onDone(errorText(err, language, 'تعذّر حفظ القرار.', 'The decision was not saved.'), false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="panel stripe-start overflow-hidden" style={{ ['--stripe' as any]: toneColor[riskTone[student.riskLevel] || 'ink'] }} aria-label={name}>
      {/* Student */}
      <header className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[16.5px] font-bold text-ink-950">{name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="chip chip-ink">
              <span className="t-num">{student.studentCode}</span>
            </span>
            <Chip tone="ink">{t(`المستوى ${student.level}`, `Level ${student.level}`)}</Chip>
            <Chip tone={trackTone[student.track] || 'ink'}>{pick(language, trackLabel[student.track], student.track)}</Chip>
            {student.isNewStudent ? (
              <Chip tone="sign">{t('طالب مستجد', 'New student')}</Chip>
            ) : (
              <span className={chipClass[riskTone[student.riskLevel] || 'ink']}>{pick(language, riskLabel[student.riskLevel], student.riskLevel)}</span>
            )}
          </div>
        </div>
        <span className="text-[12px] text-ink-500">{t(`أُرسل ${sent}`, `Sent ${sent}`)}</span>
      </header>

      <dl className="grid grid-cols-2 gap-px border-y border-ink-100 bg-ink-100 sm:grid-cols-4">
        <Fact label={t('المعدل التراكمي', 'GPA')} value={student.isNewStudent ? '—' : student.cumulativeGpa.toFixed(2)} tone={!student.isNewStudent && student.cumulativeGpa < 2 ? 'text-signal-600' : ''} />
        <Fact label={t('الساعات المنجزة', 'Credits done')} value={`${student.completedCredits} / 134`} />
        <Fact label={t('الإنذارات', 'Warnings')} value={String(student.warningCount)} tone={student.warningCount > 0 ? 'text-caution-700' : ''} />
        <Fact label={t('حد العبء هذا الفصل', 'Load ceiling')} value={String(review.maxAllowedCredits)} unit={t('ساعة', 'cr')} />
      </dl>

      <div className="space-y-4 p-5">
        {(recoveryTitle || request.studentNotes) && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {recoveryTitle && (
              <div className="callout callout-sign !py-2.5 text-[13px]">
                <Flag aria-hidden="true" />
                <p>
                  <span className="font-bold">{t('اعتمد خطة تحسين المعدل: ', 'Adopted GPA recovery route: ')}</span>«{recoveryTitle}»
                </p>
              </div>
            )}
            {request.studentNotes && (
              <div className="callout callout-lane !py-2.5 text-[13px]">
                <MessageSquareText aria-hidden="true" />
                <p>
                  <span className="font-bold">{t('ملاحظة الطالب: ', 'Student’s note: ')}</span>«{request.studentNotes}»
                </p>
              </div>
            )}
          </div>
        )}

        {/* The timetable itself */}
        <div className="scroll-x rounded-xl border border-ink-200">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th>{t('المقرر', 'Course')}</th>
                <th className="num">{t('الساعات', 'Credits')}</th>
                <th>{t('الشعبة والمحاضر', 'Section and instructor')}</th>
                <th>{t('الموعد', 'Schedule')}</th>
                <th>{t('القاعة', 'Room')}</th>
                <th className="num">{t('المقاعد', 'Seats')}</th>
              </tr>
            </thead>
            <tbody>
              {offerings.map(o => {
                const retake = student.failedCourses.includes(o.courseCode);
                return (
                  <tr key={o.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <CodeBadge code={o.courseCode} variant={retake ? 'signal' : 'soft'} />
                        <div className="min-w-0">
                          <span className="block font-semibold text-ink-900">{language === 'ar' ? o.courseNameAr : o.courseNameEn}</span>
                          {retake && <span className="text-[11.5px] font-semibold text-signal-600">{t('إعادة مقرر راسب فيه', 'Retake of a failed course')}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="num font-semibold">{o.credits}</td>
                    <td>
                      <span className="font-medium text-ink-800">{bilingualPart(o.sectionCode, language, t('شعبة', 'Section'))}</span>
                      <span className="block text-[12px] text-ink-500">{personName(o.instructorName, language)}</span>
                    </td>
                    <td className="whitespace-nowrap text-ink-700">{language === 'ar' ? o.lectureDayTimeAr : o.lectureDayTimeEn}</td>
                    <td className="text-ink-600">{o.hall}</td>
                    <td className="num t-num">
                      {o.capacity - o.enrolledCount} / {o.capacity}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
              <span className="font-semibold text-ink-700">{t('إجمالي الساعات', 'Total credits')}</span>
              <span className={cn('t-num font-extrabold', over ? 'text-signal-600' : 'text-ink-900')}>
                {review.totalCredits} / {review.maxAllowedCredits}
              </span>
            </div>
            <Meter value={(review.totalCredits / Math.max(1, review.maxAllowedCredits)) * 100} tone={over ? 'signal' : 'sign'} label={t('الساعات من الحد', 'Credits of the ceiling')} />
            {student.currentCourses.length > 0 && (
              <p className="mt-3 text-[12.5px] text-ink-600">
                <span className="font-semibold">{t('مسجل فيها بالفعل هذا الفصل: ', 'Already registered this term: ')}</span>
                {student.currentCourses.join('، ')}
              </p>
            )}
            {student.failedCourses.length > 0 && (
              <p className="mt-1 text-[12.5px] text-ink-600">
                <span className="font-semibold">{t('مقررات راسب فيها: ', 'Failed courses: ')}</span>
                {student.failedCourses.join('، ')}
              </p>
            )}
          </div>

          {/* Bylaw check */}
          <div className="space-y-2">
            {validation?.valid ? (
              <div className="callout callout-sign !py-2.5 text-[13px]">
                <CheckCircle2 aria-hidden="true" />
                <p className="font-semibold">{t('الجدول يطابق اللائحة: لا تعارض في المواعيد، والمتطلبات والحد الأقصى مستوفاة.', 'The timetable meets the bylaw: no clashes, prerequisites and the ceiling are respected.')}</p>
              </div>
            ) : validation ? (
              <div className="callout callout-signal !items-start !py-2.5 text-[13px]">
                <AlertCircle aria-hidden="true" />
                <div>
                  <p className="font-bold">{t('مخالفات يجب تعديلها قبل الاعتماد:', 'Problems to fix before approval:')}</p>
                  <ul className="mt-1 list-disc space-y-0.5 ps-5">
                    {(language === 'ar' ? validation.errorsAr : validation.errorsEn).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {validation && (validation.warningsAr.length > 0 || validation.minimumLoadWarning) && (
              <div className="callout callout-caution !items-start !py-2.5 text-[12.5px]">
                <AlertTriangle aria-hidden="true" />
                <ul className="space-y-0.5">
                  {validation.warningsAr.length > 0
                    ? (language === 'ar' ? validation.warningsAr : validation.warningsEn).map((w, i) => <li key={i}>{w}</li>)
                    : validation.minimumLoadWarning && <li>{language === 'ar' ? validation.minimumLoadWarning.noteAr : validation.minimumLoadWarning.noteEn}</li>}
                </ul>
              </div>
            )}
            {validation && validation.retakeNotices.length > 0 && (
              <div className="callout callout-lane !items-start !py-2.5 text-[12.5px]">
                <Info aria-hidden="true" />
                <ul className="space-y-0.5">
                  {validation.retakeNotices.map(n => (
                    <li key={n.courseCode}>
                      <span className="font-semibold" dir="ltr">
                        {n.courseCode}
                      </span>{' '}
                      {language === 'ar' ? n.gpaImpactNoteAr : n.gpaImpactNoteEn}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Decision */}
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <label htmlFor={`notes_${request.id}`} className="field-label">
            {t('ملاحظاتك للطالب', 'Your notes to the student')}
            <span className="ms-1 font-normal text-ink-500">{t('(مطلوبة عند طلب التعديل)', '(required to ask for changes)')}</span>
          </label>
          <textarea
            id={`notes_${request.id}`}
            rows={2}
            value={notes}
            onChange={e => {
              setNotes(e.target.value);
              if (e.target.value.trim()) setNeedNotes(false);
            }}
            aria-invalid={needNotes || undefined}
            placeholder={t('مثلاً: استبدل CS 304 بـ CS 210 حتى تجتاز المتطلب أولاً.', 'For example: swap CS 304 for CS 210 until you pass its prerequisite.')}
            className="field"
          />
          {needNotes && <p className="field-hint !text-signal-600">{t('اكتب للطالب ما يجب تعديله.', 'Tell the student what to change.')}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => decide('APPROVE')} disabled={!!busy || validation?.valid === false} className="btn btn-primary">
              <Check aria-hidden="true" />
              {busy === 'APPROVE' ? t('جارٍ الاعتماد والتسجيل…', 'Approving and registering…') : t('اعتماد وتسجيل المقررات', 'Approve and register the courses')}
            </button>
            <button type="button" onClick={() => decide('REQUEST_CHANGES')} disabled={!!busy} className="btn btn-secondary">
              <Pencil aria-hidden="true" />
              {busy === 'REQUEST_CHANGES' ? t('جارٍ الإرسال…', 'Sending…') : t('أعِد للطالب للتعديل', 'Send back for changes')}
            </button>
          </div>
          {validation?.valid === false && (
            <p className="mt-2 text-[12px] text-ink-500">{t('الاعتماد متاح بعد أن يصحح الطالب المخالفات؛ أعِد الجدول إليه مع ملاحظاتك.', 'Approval is available once the student fixes the problems; send it back with your notes.')}</p>
          )}
        </div>
      </div>
    </article>
  );
};

const Fact: React.FC<{ label: string; value: string; unit?: string; tone?: string }> = ({ label, value, unit, tone }) => (
  <div className="bg-paper px-5 py-3">
    <dt className="text-[12px] font-medium text-ink-500">{label}</dt>
    <dd className={cn('text-[18px] font-extrabold text-ink-950', tone)}>
      <span className="t-num">{value}</span>
      {unit && <span className="ms-1 text-[13px] font-semibold text-ink-500">{unit}</span>}
    </dd>
  </div>
);

/* -------------------------------------------------------------- study plan */

const PlanReviewCard: React.FC<{
  student: Student;
  onDecided: (status: PlanStatus, text: string) => void;
  onError: (text: string) => void;
}> = ({ student, onDecided, onError }) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const name = personName(language === 'ar' ? student.nameAr : student.nameEn, language);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !plan) {
      try {
        setLoading(true);
        setPlan(await api.getStudyPlan(student.id));
      } catch (err: any) {
        onError(errorText(err, language, 'تعذّر تحميل الخطة.', 'The plan could not be loaded.'));
      } finally {
        setLoading(false);
      }
    }
  };

  const decide = async (decision: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT') => {
    if (decision !== 'APPROVE' && !notes.trim()) {
      onError(t('اكتب للطالب سبب القرار وما يجب تعديله.', 'Tell the student why and what to change.'));
      return;
    }
    try {
      setBusy(true);
      await api.decidePlan(student.id, decision, notes.trim() || t('تم اعتماد الخطة الدراسية من المرشد الأكاديمي.', 'Study plan approved by the academic advisor.'));
      onDecided(
        decision === 'APPROVE' ? 'Approved' : 'Rejected',
        decision === 'APPROVE' ? t(`اعتمدت خطة ${name}.`, `Approved ${name}'s plan.`) : t(`أُعيدت خطة ${name} إليه مع ملاحظاتك.`, `${name}'s plan was sent back with your notes.`)
      );
    } catch (err: any) {
      onError(errorText(err, language, 'تعذّر حفظ القرار.', 'The decision was not saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel stripe-start" style={{ ['--stripe' as any]: toneColor[riskTone[student.riskLevel] || 'ink'] }}>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-bold text-ink-950">{name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="chip chip-ink">
              <span className="t-num">{student.studentCode}</span>
            </span>
            <Chip tone="ink">{t(`المستوى ${student.level}`, `Level ${student.level}`)}</Chip>
            <span className={chipClass[planStatusTone[student.currentPlanStatus] || 'ink']}>{pick(language, planStatusLabel[student.currentPlanStatus], student.currentPlanStatus)}</span>
            <span className="text-[12.5px] text-ink-600">
              {t('المعدل', 'GPA')} <span className="t-num font-bold">{student.cumulativeGpa.toFixed(2)}</span>
              <span className="mx-1.5 text-ink-300">|</span>
              {t(`${student.completedCredits} ساعة منجزة`, `${student.completedCredits} credits done`)}
            </span>
          </div>
        </div>
        <button type="button" onClick={toggle} className="btn btn-secondary shrink-0" aria-expanded={open}>
          {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {open ? t('إخفاء الخطة', 'Hide the plan') : t('اعرض الخطة واتخذ القرار', 'Show the plan and decide')}
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-ink-100 p-5">
          {loading || !plan ? (
            <Loader compact label={t('جارٍ تحميل الخطة…', 'Loading the plan…')} />
          ) : (
            <>
              <p className="flex items-center gap-2 text-[13px] text-ink-700">
                <GraduationCap className="h-4 w-4 text-ink-500" aria-hidden="true" />
                {t(
                  `${plan.semesters.length} فصول، ${plan.totalPlannedCredits} ساعة، التخرج المتوقع ${plan.expectedGraduationSemesterAr}.`,
                  `${plan.semesters.length} terms, ${plan.totalPlannedCredits} credits, expected graduation ${plan.expectedGraduationSemesterEn}.`
                )}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {plan.semesters.map(sem => (
                  <section key={sem.semesterIndex} className="rounded-xl border border-ink-200">
                    <header className="flex items-center justify-between gap-2 border-b border-ink-100 bg-ink-50 px-3 py-2">
                      <span className="text-[13px] font-bold text-ink-900">{language === 'ar' ? sem.semesterNameAr : sem.semesterNameEn}</span>
                      <span className="text-[12px] font-semibold text-ink-600">
                        <span className="t-num">{sem.totalCredits}</span> {t('ساعة', 'cr')}
                      </span>
                    </header>
                    <ul className="divide-y divide-ink-100">
                      {sem.courses.map(c => (
                        <li key={c.courseCode} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                          <span className="flex min-w-0 items-center gap-2">
                            <CodeBadge code={c.courseCode} variant={c.isRetake ? 'signal' : 'soft'} />
                            <span className="truncate text-ink-800">{language === 'ar' ? c.courseNameAr : c.courseNameEn}</span>
                          </span>
                          <span className="t-num shrink-0 text-ink-500">{c.credits}</span>
                        </li>
                      ))}
                    </ul>
                    {(sem.riskNoteAr || sem.riskNoteEn) && <p className="border-t border-ink-100 px-3 py-2 text-[11.5px] text-caution-700">{language === 'ar' ? sem.riskNoteAr : sem.riskNoteEn}</p>}
                  </section>
                ))}
              </div>

              <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
                <label htmlFor={`plan_notes_${student.id}`} className="field-label">
                  {t('ملاحظاتك للطالب', 'Your notes to the student')}
                </label>
                <textarea id={`plan_notes_${student.id}`} rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="field" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => decide('APPROVE')} disabled={busy} className="btn btn-primary">
                    <Check aria-hidden="true" />
                    {t('اعتماد الخطة', 'Approve the plan')}
                  </button>
                  <button type="button" onClick={() => decide('REQUEST_CHANGES')} disabled={busy} className="btn btn-secondary">
                    <Pencil aria-hidden="true" />
                    {t('طلب تعديلات', 'Ask for changes')}
                  </button>
                  <button type="button" onClick={() => decide('REJECT')} disabled={busy} className="btn btn-danger-soft">
                    <XCircle aria-hidden="true" />
                    {t('رفض', 'Reject')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
};
