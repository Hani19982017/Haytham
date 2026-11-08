import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { StudentCourseAttendance } from '../../types/index.js';
import {
  PageHeader,
  Panel,
  Chip,
  CodeBadge,
  Loader,
  EmptyState,
  Meter,
  Toast,
  cn,
  chipClass,
  toneColor,
  toneText,
  standingTone,
  standingLabel,
  attendanceStatusLabel,
  attendanceMethodLabel,
  pick,
  personName,
} from '../ui/index.js';
import { ScanLine, QrCode, CalendarCheck, AlertTriangle, RotateCcw, Radio, UserCheck, UserX, Hourglass, Info } from 'lucide-react';
import { QrScannerModal } from './QrScanner.js';

/** How often the page looks for a lecture that has just started taking attendance. */
const REFRESH_MS = 20_000;

const DOT: Record<string, string> = {
  PRESENT: 'bg-sign-600',
  LATE: 'bg-route-400',
  ABSENT: 'bg-signal-500',
  EXCUSED: 'bg-lane-400',
};

/**
 * The student's attendance: scan the lecture QR code to check in, and for each
 * course see how many lectures/sections they attended, missed, and how many
 * absences they still have before the bylaw limit.
 */
export const StudentAttendanceView: React.FC = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [courses, setCourses] = useState<StudentCourseAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(params.get('scan') === '1');
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      try {
        if (!quiet) setLoading(true);
        const list = await api.getMyAttendance();
        setCourses(list);
        setFailed(null);
      } catch (err: any) {
        if (!quiet) {
          const data = err?.response?.data;
          setFailed((language === 'ar' ? data?.messageAr : data?.messageEn) || t('تعذّر تحميل بيانات الحضور.', 'Attendance could not be loaded.'));
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [language, t]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Pick up a lecture that starts taking attendance while the page is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const closeScanner = () => {
    setScannerOpen(false);
    if (params.get('scan')) {
      params.delete('scan');
      setParams(params, { replace: true });
    }
  };

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
        timeZone: 'Africa/Cairo',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    [language]
  );

  if (loading) return <Loader label={t('جارٍ تحميل حضورك…', 'Loading your attendance…')} />;

  const live = courses.filter(c => c.openSessionId && !c.history.some(h => h.sessionId === c.openSessionId && h.status));
  const totals = courses.reduce(
    (acc, c) => ({ attended: acc.attended + c.attended, absent: acc.absent + c.absent, held: acc.held + c.heldSessions }),
    { attended: 0, absent: 0, held: 0 }
  );
  const atRisk = courses.filter(c => c.standing === 'LAST_CHANCE' || c.standing === 'DEPRIVED').length;
  const maxPct = courses[0]?.maxAbsencePercent;

  return (
    <div className="space-y-6">
      {toast && (
        <Toast tone="sign" onClose={() => setToast(null)} closeLabel={t('إغلاق', 'Close')}>
          {toast}
        </Toast>
      )}

      <PageHeader
        icon={ScanLine}
        tone="sign"
        title={t('الحضور', 'Attendance')}
        description={t(
          `امسح رمز QR المعروض في المحاضرة أو السكشن ليُسجَّل حضورك فوراً. لكل مقرر ترى ما حضرته وما غبته والمتبقي لك من الغياب المسموح${maxPct ? ` (${maxPct}% من محاضرات وسكاشن الفصل حسب اللائحة)` : ''}.`,
          `Scan the QR code shown in the lecture or section to check in. For each course you see what you attended, what you missed and how many absences you have left${maxPct ? ` (${maxPct}% of the term's lectures and sections, per the bylaw)` : ''}.`
        )}
        actions={
          <button type="button" onClick={() => setScannerOpen(true)} className="btn btn-primary btn-lg">
            <QrCode aria-hidden="true" />
            {t('امسح رمز الحضور', 'Scan to check in')}
          </button>
        }
      />

      {failed ? (
        <Panel>
          <EmptyState
            icon={AlertTriangle}
            tone="caution"
            title={t('تعذّر تحميل الحضور', 'Attendance could not be loaded')}
            description={failed}
            action={
              <button type="button" onClick={() => load()} className="btn btn-primary">
                <RotateCcw aria-hidden="true" />
                {t('إعادة المحاولة', 'Try again')}
              </button>
            }
          />
        </Panel>
      ) : courses.length === 0 ? (
        <Panel>
          <EmptyState
            icon={CalendarCheck}
            tone="sign"
            title={t('لا مقررات مسجلة لك هذا الفصل بعد', 'No courses registered for you this term yet')}
            description={t(
              'بعد أن يعتمد مرشدك جدولك ستظهر مقرراتك هنا، وتسجّل حضورك في كل محاضرة بمسح رمز QR.',
              'Once your advisor approves your timetable your courses show here, and you check in to each lecture by scanning its QR code.'
            )}
            action={
              <button type="button" onClick={() => navigate('/student/registration')} className="btn btn-primary">
                <CalendarCheck aria-hidden="true" />
                {t('اذهب إلى التسجيل', 'Go to registration')}
              </button>
            }
          />
        </Panel>
      ) : (
        <>
          {/* Lectures taking attendance right now */}
          {live.map(c => (
            <div key={c.offeringId} className="callout callout-lane flex-col sm:flex-row sm:items-center" role="status">
              <Radio aria-hidden="true" className="animate-pulse" />
              <p className="flex-1 font-semibold text-lane-800">
                {t(
                  `${c.openSessionKind === 'SECTION' ? 'سكشن' : 'محاضرة'} ${c.courseCode} تأخذ الحضور الآن. امسح الرمز المعروض على الشاشة.`,
                  `The ${c.courseCode} ${c.openSessionKind === 'SECTION' ? 'section' : 'lecture'} is taking attendance now. Scan the code on the screen.`
                )}
              </p>
              <button type="button" onClick={() => setScannerOpen(true)} className="btn btn-primary shrink-0">
                <QrCode aria-hidden="true" />
                {t('سجّل حضوري', 'Check me in')}
              </button>
            </div>
          ))}

          {/* Term totals */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label={t('مقررات هذا الفصل', 'Courses this term')} value={courses.length} />
            <SummaryTile label={t('مرات الحضور', 'Times attended')} value={totals.attended} hint={t(`من ${totals.held} محاضرة وسكشن`, `of ${totals.held} held`)} tone="sign" />
            <SummaryTile label={t('مرات الغياب', 'Times absent')} value={totals.absent} tone={totals.absent > 0 ? 'caution' : 'ink'} />
            <SummaryTile
              label={t('مقررات عند حد الغياب', 'Courses at the limit')}
              value={atRisk}
              tone={atRisk > 0 ? 'signal' : 'sign'}
              hint={atRisk > 0 ? t('راجع أستاذ المادة', 'See the instructor') : t('لا خطر حرمان', 'No exclusion risk')}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {courses.map(c => (
              <CourseAttendanceCard key={c.offeringId} course={c} dateFmt={dateFmt} onScan={() => setScannerOpen(true)} />
            ))}
          </div>

          <p className="flex items-start gap-2 text-[12.5px] leading-6 text-ink-500">
            <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
            {t(
              'الحضور بعد مرور 15 دقيقة من بدء المحاضرة يُسجَّل «متأخر» ويُحسب حضوراً. الغياب بعذر لا يُحسب من رصيدك. إذا وصلت إلى آخر فرصة أو تجاوزت الحد يصلك إشعار، ويُبلَّغ أستاذ المادة ومرشدك.',
              'Checking in more than 15 minutes after the start counts as “late” but still attended. Excused absences do not use up your allowance. If you reach your last chance or pass the limit you get a notification, and your instructor and advisor are told.'
            )}
          </p>
        </>
      )}

      {scannerOpen && (
        <QrScannerModal
          onClose={closeScanner}
          onCheckedIn={res => {
            setToast(language === 'ar' ? res.messageAr : res.messageEn);
            load(true);
          }}
        />
      )}
    </div>
  );
};

const SummaryTile: React.FC<{ label: string; value: number; hint?: string; tone?: 'ink' | 'sign' | 'caution' | 'signal' }> = ({ label, value, hint, tone = 'ink' }) => (
  <div className="panel stripe-start p-4" style={{ ['--stripe' as any]: toneColor[tone] }}>
    <span className="text-[12.5px] font-medium text-ink-500">{label}</span>
    <div className={cn('mt-1 text-[28px] font-extrabold leading-none', toneText[tone])}>
      <span className="t-num">{value}</span>
    </div>
    {hint && <div className="mt-1.5 text-[12px] text-ink-500">{hint}</div>}
  </div>
);

const CourseAttendanceCard: React.FC<{ course: StudentCourseAttendance; dateFmt: Intl.DateTimeFormat; onScan: () => void }> = ({ course: c, dateFmt, onScan }) => {
  const { t, language } = useLanguage();
  const tone = standingTone[c.standing] || 'ink';
  const used = Math.min(c.absent, c.allowedAbsences);
  const over = Math.max(0, c.absent - c.allowedAbsences);
  const remaining = Math.max(0, c.remainingAbsences);
  const open = !!c.openSessionId && !c.history.some(h => h.sessionId === c.openSessionId && h.status);

  return (
    <article className="panel stripe-start flex flex-col gap-4 p-5" style={{ ['--stripe' as any]: toneColor[tone] }} aria-label={`${c.courseCode} ${language === 'ar' ? c.courseNameAr : c.courseNameEn}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CodeBadge code={c.courseCode} variant="solid" />
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-[15.5px] font-bold leading-6 text-ink-950">{language === 'ar' ? c.courseNameAr : c.courseNameEn}</h2>
            <p className="text-[12px] leading-5 text-ink-500">
              {language === 'ar' ? c.scheduleAr : c.scheduleEn || c.scheduleAr}
              <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
              {personName(c.instructorName, language)}
              {c.assistantName && (
                <>
                  <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                  {t('المعيد:', 'TA:')} {personName(c.assistantName, language)}
                </>
              )}
            </p>
          </div>
        </div>
        <span className={cn(chipClass[tone], 'shrink-0')}>{pick(language, standingLabel[c.standing], c.standing)}</span>
      </header>

      {/* The three numbers students ask about */}
      <dl className="grid grid-cols-3 gap-2 rounded-xl border border-ink-100 bg-ink-50 p-3 text-center">
        <div className="kv items-center">
          <dt className="flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5 text-sign-700" aria-hidden="true" />
            {t('حضرت', 'Attended')}
          </dt>
          <dd className="!text-[22px] text-sign-700">
            <span className="t-num">{c.attended}</span>
            <span className="text-[12px] font-medium text-ink-500"> / {c.heldSessions}</span>
          </dd>
        </div>
        <div className="kv items-center">
          <dt className="flex items-center gap-1">
            <UserX className="h-3.5 w-3.5 text-signal-600" aria-hidden="true" />
            {t('غبت', 'Missed')}
          </dt>
          <dd className={cn('!text-[22px]', c.absent > 0 ? 'text-signal-600' : 'text-ink-800')}>
            <span className="t-num">{c.absent}</span>
          </dd>
        </div>
        <div className="kv items-center">
          <dt className="flex items-center gap-1">
            <Hourglass className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
            {t('متبقي لك', 'Left')}
          </dt>
          <dd className={cn('!text-[22px]', remaining === 0 ? 'text-signal-600' : 'text-ink-900')}>
            <span className="t-num">{remaining}</span>
            <span className="text-[12px] font-medium text-ink-500"> / {c.allowedAbsences}</span>
          </dd>
        </div>
      </dl>

      {/* Absence allowance: one box per allowed absence */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px]">
          <span className="font-semibold text-ink-700">{t('رصيد الغياب المسموح', 'Absence allowance')}</span>
          <span className="text-ink-500">
            {over > 0
              ? t(`تجاوزت الحد بـ ${over}`, `${over} over the limit`)
              : t(`استخدمت ${used} من ${c.allowedAbsences}`, `${used} of ${c.allowedAbsences} used`)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1" aria-hidden="true">
          {Array.from({ length: c.allowedAbsences }).map((_, i) => (
            <span key={i} className={cn('h-3 w-5 rounded-sm', i < used ? (c.standing === 'OK' ? 'bg-caution-400' : 'bg-signal-500') : 'bg-ink-200')} />
          ))}
          {Array.from({ length: Math.min(over, 12) }).map((_, i) => (
            <span key={`o${i}`} className="h-3 w-5 rounded-sm bg-signal-700 ring-1 ring-signal-300" />
          ))}
        </div>
        <p className="mt-1.5 text-[11.5px] text-ink-500">
          {t(
            `عُقد ${c.heldSessions} من ${c.plannedSessions} محاضرة وسكشن مقررة هذا الفصل. نسبة حضورك ${c.attendancePercent}%.`,
            `${c.heldSessions} of ${c.plannedSessions} planned lectures and sections held. Your attendance rate is ${c.attendancePercent}%.`
          )}
        </p>
        <Meter value={c.attendancePercent} tone={tone} className="mt-1.5" label={t('نسبة الحضور', 'Attendance rate')} />
      </div>

      {/* Session by session */}
      {c.history.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-ink-700">{t('محاضرة بمحاضرة', 'Session by session')}</p>
          <ol className="flex flex-wrap gap-1.5">
            {c.history.map(h => {
              const label = h.status ? pick(language, attendanceStatusLabel[h.status], h.status) : t('لم تُسجَّل بعد', 'Not marked yet');
              const how = h.method ? ` — ${pick(language, attendanceMethodLabel[h.method], h.method)}` : '';
              const kind = h.kind === 'SECTION' ? t('سكشن', 'Section') : t('محاضرة', 'Lecture');
              return (
                <li key={h.sessionId}>
                  <span
                    className={cn('block h-4 w-4 rounded-full ring-2 ring-paper', h.status ? DOT[h.status] : 'bg-ink-200', h.kind === 'SECTION' && 'rounded-[4px]')}
                    title={`${kind} ${dateFmt.format(new Date(h.startedAt))}: ${label}${how}`}
                    aria-label={`${kind} ${dateFmt.format(new Date(h.startedAt))}: ${label}`}
                  />
                </li>
              );
            })}
          </ol>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-500">
            <Legend cls="bg-sign-600" label={t('حاضر', 'Present')} />
            <Legend cls="bg-route-400" label={t('متأخر', 'Late')} />
            <Legend cls="bg-signal-500" label={t('غائب', 'Absent')} />
            <Legend cls="bg-lane-400" label={t('بعذر', 'Excused')} />
            <span>{t('الدائرة محاضرة والمربع سكشن', 'Circle = lecture, square = section')}</span>
          </p>
        </div>
      )}

      {open ? (
        <button type="button" onClick={onScan} className="btn btn-primary btn-block mt-auto">
          <QrCode aria-hidden="true" />
          {t(`${c.openSessionKind === 'SECTION' ? 'السكشن' : 'المحاضرة'} تأخذ الحضور الآن — سجّل حضورك`, `Taking attendance now — check in`)}
        </button>
      ) : c.standing === 'DEPRIVED' || c.standing === 'LAST_CHANCE' ? (
        <div className={cn('callout mt-auto !py-2.5 text-[12.5px]', c.standing === 'DEPRIVED' ? 'callout-signal' : 'callout-caution')}>
          <AlertTriangle aria-hidden="true" />
          <p>
            {c.standing === 'DEPRIVED'
              ? t('تجاوزت حد الغياب المسموح وقد تُحرم من دخول الامتحان النهائي. راجع أستاذ المادة ومرشدك فوراً.', 'You passed the absence limit and may be barred from the final exam. See the instructor and your advisor now.')
              : t('استنفدت رصيد الغياب. أي غياب آخر يعرّضك للحرمان من الامتحان النهائي.', 'You have used your whole allowance. One more absence can bar you from the final exam.')}
          </p>
        </div>
      ) : null}
    </article>
  );
};

const Legend: React.FC<{ cls: string; label: string }> = ({ cls, label }) => (
  <span className="inline-flex items-center gap-1">
    <span className={cn('h-2.5 w-2.5 rounded-full', cls)} aria-hidden="true" />
    {label}
  </span>
);
