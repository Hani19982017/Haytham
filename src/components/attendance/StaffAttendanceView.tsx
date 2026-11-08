import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type {
  AttendanceCloseResult,
  AttendanceCourseReport,
  AttendanceLiveSession,
  AttendanceRosterEntry,
  AttendanceStatus,
  TeachingSection,
} from '../../types/index.js';
import {
  PageHeader,
  Panel,
  PanelHeader,
  Chip,
  CodeBadge,
  Loader,
  EmptyState,
  Modal,
  Toast,
  Segmented,
  Meter,
  cn,
  chipClass,
  toneColor,
  toneText,
  standingTone,
  standingLabel,
  attendanceStatusLabel,
  attendanceStatusTone,
  attendanceMethodLabel,
  pick,
  personName,
  bilingualPart,
} from '../ui/index.js';
import {
  QrCode,
  Play,
  Square,
  Users,
  FileSpreadsheet,
  BarChart3,
  ArrowRight,
  ArrowLeft,
  Maximize2,
  Search,
  CheckCircle2,
  Clock,
  UserX,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Radio,
  CalendarClock,
  MapPin,
  Download,
} from 'lucide-react';

/** How often the live screen refreshes the check-in list. */
const LIVE_REFRESH_MS = 3000;

type View = { kind: 'LIST' } | { kind: 'LIVE'; sessionId: string } | { kind: 'REPORT'; offeringId: string };

const MARK_BUTTONS: { status: AttendanceStatus; ar: string; en: string; icon: typeof CheckCircle2 }[] = [
  { status: 'PRESENT', ar: 'حاضر', en: 'Present', icon: CheckCircle2 },
  { status: 'LATE', ar: 'متأخر', en: 'Late', icon: Clock },
  { status: 'ABSENT', ar: 'غائب', en: 'Absent', icon: UserX },
  { status: 'EXCUSED', ar: 'بعذر', en: 'Excused', icon: ShieldCheck },
];

const MARK_ACTIVE: Record<AttendanceStatus, string> = {
  PRESENT: 'border-sign-600 bg-sign-600 text-white',
  LATE: 'border-route-500 bg-route-400 text-ink-950',
  ABSENT: 'border-signal-500 bg-signal-500 text-white',
  EXCUSED: 'border-lane-500 bg-lane-500 text-white',
};

const DOT: Record<string, string> = {
  PRESENT: 'bg-sign-600',
  LATE: 'bg-route-400',
  ABSENT: 'bg-signal-500',
  EXCUSED: 'bg-lane-400',
};

const errorText = (err: any, language: string, ar: string, en: string) => {
  const data = err?.response?.data;
  return (language === 'ar' ? data?.messageAr : data?.messageEn) || (language === 'ar' ? ar : en);
};

/**
 * Attendance for teaching staff. The instructor (lectures) or the teaching
 * assistant (sections) starts a session and projects a QR code that changes
 * every 30 seconds; students scan it from their phones. Anyone can also be
 * marked by hand. Ending the session marks the rest absent, warns students who
 * reach the bylaw limit, and gives an Excel register.
 */
export const StaffAttendanceView: React.FC<{ onOpenGrades?: () => void }> = ({ onOpenGrades }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [sections, setSections] = useState<TeachingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'LIST' });
  const [starting, setStarting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'sign' | 'signal'; text: string } | null>(null);
  const [closeResult, setCloseResult] = useState<AttendanceCloseResult | null>(null);

  const isTA = currentUser?.role === 'TEACHING_ASSISTANT';
  const viewOnly = currentUser?.role === 'ADMIN' || currentUser?.role === 'DEPARTMENT_HEAD';

  const loadSections = useCallback(async () => {
    try {
      setLoading(true);
      setSections(await api.getTeachingSections());
      setFailed(null);
    } catch (err: any) {
      setFailed(errorText(err, language, 'تعذّر تحميل شعبك.', 'Your sections could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === 'sign' ? 5000 : 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const start = async (section: TeachingSection) => {
    if (section.openSessionId) {
      setView({ kind: 'LIVE', sessionId: section.openSessionId });
      return;
    }
    try {
      setStarting(section.offering.id);
      const live = await api.startAttendanceSession(section.offering.id, section.role === 'ASSISTANT' ? 'SECTION' : 'LECTURE');
      setView({ kind: 'LIVE', sessionId: live.id });
    } catch (err: any) {
      setToast({ tone: 'signal', text: errorText(err, language, 'تعذّر بدء تسجيل الحضور.', 'Attendance could not be started.') });
    } finally {
      setStarting(null);
    }
  };

  const backToList = () => {
    setView({ kind: 'LIST' });
    loadSections();
  };

  return (
    <div className="space-y-6">
      {toast && (
        <Toast tone={toast.tone} onClose={() => setToast(null)} closeLabel={t('إغلاق', 'Close')}>
          {toast.text}
        </Toast>
      )}

      {view.kind === 'LIVE' ? (
        <LiveSession
          sessionId={view.sessionId}
          onBack={backToList}
          onClosed={result => {
            setCloseResult(result);
            backToList();
          }}
          onError={text => setToast({ tone: 'signal', text })}
        />
      ) : view.kind === 'REPORT' ? (
        <CourseReport offeringId={view.offeringId} onBack={backToList} onError={text => setToast({ tone: 'signal', text })} />
      ) : (
        <>
          <PageHeader
            icon={QrCode}
            tone={isTA ? 'route' : 'plum'}
            title={t('الحضور', 'Attendance')}
            description={
              isTA
                ? t(
                    'ابدأ السكشن ليظهر رمز QR يتجدد كل 30 ثانية؛ يمسحه الطلاب بهواتفهم فيُسجَّل حضورهم. يمكنك التسجيل يدوياً أيضاً. عند الإنهاء يُحسب الغائبون، ويصل التنبيه لكل طالب يقترب من حد الغياب، ويصلك كشف Excel.',
                    'Start the section to show a QR code that changes every 30 seconds; students scan it with their phones to check in. You can also mark by hand. Ending it counts the absentees, warns students nearing the absence limit, and gives you an Excel register.'
                  )
                : t(
                    'ابدأ المحاضرة ليظهر رمز QR يتجدد كل 30 ثانية؛ يمسحه الطلاب بهواتفهم فيُسجَّل حضورهم. يمكنك التسجيل يدوياً أيضاً. عند الإنهاء يُحسب الغائبون، ويصل التنبيه لكل طالب يقترب من حد الغياب، ويصلك كشف Excel.',
                    'Start the lecture to show a QR code that changes every 30 seconds; students scan it with their phones to check in. You can also mark by hand. Ending it counts the absentees, warns students nearing the absence limit, and gives you an Excel register.'
                  )
            }
            meta={
              viewOnly ? (
                <Chip tone="ink">{t('عرض فقط: أعضاء هيئة التدريس هم من يأخذون الحضور', 'View only: teaching staff take attendance')}</Chip>
              ) : undefined
            }
            actions={
              onOpenGrades ? (
                <button type="button" onClick={onOpenGrades} className="btn btn-secondary">
                  <BookOpen aria-hidden="true" />
                  {t('رصد الدرجات', 'Grades')}
                </button>
              ) : undefined
            }
          />

          {loading ? (
            <Loader label={t('جارٍ تحميل شعبك…', 'Loading your sections…')} />
          ) : failed ? (
            <Panel>
              <EmptyState
                icon={AlertTriangle}
                tone="caution"
                title={t('تعذّر تحميل الشعب', 'Sections could not be loaded')}
                description={failed}
                action={
                  <button type="button" onClick={loadSections} className="btn btn-primary">
                    <RotateCcw aria-hidden="true" />
                    {t('إعادة المحاولة', 'Try again')}
                  </button>
                }
              />
            </Panel>
          ) : sections.length === 0 ? (
            <Panel>
              <EmptyState
                icon={Users}
                title={t('لا توجد شعب مسندة إليك', 'No sections are assigned to you')}
                description={t('عندما تُسند إليك شعبة ستظهر هنا مع طلابها.', 'When a section is assigned to you it shows here with its students.')}
              />
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {sections.map(section => (
                <SectionCard
                  key={section.offering.id}
                  section={section}
                  viewOnly={viewOnly}
                  starting={starting === section.offering.id}
                  onStart={() => start(section)}
                  onReport={() => setView({ kind: 'REPORT', offeringId: section.offering.id })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {closeResult && <CloseSummary result={closeResult} onClose={() => setCloseResult(null)} onError={text => setToast({ tone: 'signal', text })} />}
    </div>
  );
};

/* ---------------------------------------------------------------- sections */

const SectionCard: React.FC<{
  section: TeachingSection;
  viewOnly: boolean;
  starting: boolean;
  onStart: () => void;
  onReport: () => void;
}> = ({ section: s, viewOnly, starting, onStart, onReport }) => {
  const { t, language } = useLanguage();
  const o = s.offering;
  const isAssistant = s.role === 'ASSISTANT';
  const tone = s.deprivedCount > 0 ? 'signal' : s.atRiskCount > 0 ? 'caution' : 'sign';
  const lastAt = s.lastSessionAt
    ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(s.lastSessionAt))
    : null;

  return (
    <article className="panel stripe-start flex flex-col gap-4 p-5" style={{ ['--stripe' as any]: toneColor[isAssistant ? 'route' : 'plum'] }}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CodeBadge code={o.courseCode} variant="solid" />
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-[15.5px] font-bold leading-6 text-ink-950">{language === 'ar' ? s.courseNameAr : s.courseNameEn}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
              {o.sectionCode && <span>{bilingualPart(o.sectionCode, language, o.sectionCode)}</span>}
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {language === 'ar' ? o.lectureDayTimeAr : o.lectureDayTimeEn}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {o.hall}
              </span>
            </p>
            <p className="mt-0.5 text-[12px] text-ink-500">
              {isAssistant
                ? t(`المحاضرات: ${personName(o.instructorName, language)}`, `Lectures: ${personName(o.instructorName, language)}`)
                : o.assistantName
                ? t(`السكشن مع المعيد: ${personName(o.assistantName, language)}`, `Section with TA ${personName(o.assistantName, language)}`)
                : t('بدون سكشن', 'No section')}
            </p>
          </div>
        </div>
        <Chip tone={isAssistant ? 'route' : 'plum'} className="shrink-0">
          {isAssistant ? t('معيد السكشن', 'Section TA') : t('أستاذ المادة', 'Instructor')}
        </Chip>
      </header>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink-100 bg-ink-50 p-3 sm:grid-cols-4">
        <div className="kv">
          <dt>{t('الطلاب', 'Students')}</dt>
          <dd>
            <span className="t-num">{s.rosterCount}</span>
          </dd>
        </div>
        <div className="kv">
          <dt>{t('عُقدت', 'Held')}</dt>
          <dd>
            <span className="t-num">{s.heldSessions}</span>
            <span className="text-[12px] font-medium text-ink-500"> / {s.plannedSessions}</span>
          </dd>
        </div>
        <div className="kv">
          <dt>{t('متوسط الحضور', 'Average')}</dt>
          <dd className={s.averageAttendance < 75 ? '!text-signal-600' : ''}>
            <span className="t-num">{s.averageAttendance}%</span>
          </dd>
        </div>
        <div className="kv">
          <dt>{t('الغياب المسموح', 'Allowed absences')}</dt>
          <dd>
            <span className="t-num">{s.allowedAbsences}</span>
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        {s.openSessionId && (
          <Chip tone="lane" icon={Radio}>
            {t('يأخذ الحضور الآن', 'Taking attendance now')}
          </Chip>
        )}
        {s.atRiskCount > 0 && <Chip tone="caution">{t(`${s.atRiskCount} عند آخر فرصة`, `${s.atRiskCount} on last chance`)}</Chip>}
        {s.deprivedCount > 0 && <Chip tone="signal">{t(`${s.deprivedCount} تجاوز حد الغياب`, `${s.deprivedCount} over the limit`)}</Chip>}
        {tone === 'sign' && s.heldSessions > 0 && <Chip tone="sign">{t('لا أحد عند حد الغياب', 'No one at the limit')}</Chip>}
        {lastAt && <span className="text-ink-500">{t(`آخر تسجيل: ${lastAt}`, `Last: ${lastAt}`)}</span>}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-ink-100 pt-4">
        {!viewOnly && (
          <button type="button" onClick={onStart} disabled={starting || s.rosterCount === 0} className={cn('btn flex-1', s.openSessionId ? 'btn-accent' : 'btn-primary')}>
            {s.openSessionId ? <Radio aria-hidden="true" /> : <Play aria-hidden="true" className="rtl:-scale-x-100" />}
            {starting
              ? t('جارٍ البدء…', 'Starting…')
              : s.openSessionId
              ? t('متابعة التسجيل الجاري', 'Continue the open session')
              : isAssistant
              ? t('ابدأ السكشن وأظهر رمز QR', 'Start the section and show the QR')
              : t('ابدأ المحاضرة وأظهر رمز QR', 'Start the lecture and show the QR')}
          </button>
        )}
        <button type="button" onClick={onReport} className="btn btn-secondary flex-1">
          <BarChart3 aria-hidden="true" />
          {t('تقرير الغياب', 'Absence report')}
        </button>
      </div>
    </article>
  );
};

/* -------------------------------------------------------------------- live */

const LiveSession: React.FC<{
  sessionId: string;
  onBack: () => void;
  onClosed: (result: AttendanceCloseResult) => void;
  onError: (text: string) => void;
}> = ({ sessionId, onBack, onClosed, onError }) => {
  const { t, language } = useLanguage();
  const [live, setLive] = useState<AttendanceLiveSession | null>(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'WAITING' | 'IN' | 'OUT'>('ALL');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const Back = language === 'ar' ? ArrowRight : ArrowLeft;

  const refresh = useCallback(async () => {
    try {
      const data = await api.getLiveAttendance(sessionId);
      setLive(data);
      setFetchedAt(Date.now());
      setOffline(false);
    } catch (err: any) {
      setOffline(true);
      if (err?.response?.status === 404 || err?.response?.status === 403) {
        onError(errorText(err, language, 'تعذّر فتح المحاضرة.', 'The session could not be opened.'));
        onBack();
      }
    }
  }, [sessionId, language, onBack, onError]);

  // Refresh every few seconds, and right when the QR code changes.
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!live || live.status !== 'OPEN') return;
    const wait = Math.max(400, Math.min(LIVE_REFRESH_MS, live.rotatesInMs - (Date.now() - fetchedAt) + 150));
    const timer = setTimeout(refresh, wait);
    return () => clearTimeout(timer);
  }, [live, fetchedAt, refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const mark = async (entry: AttendanceRosterEntry, status: AttendanceStatus) => {
    try {
      setSavingId(entry.studentId);
      const data = await api.markAttendance(sessionId, entry.studentId, status);
      setLive(data);
      setFetchedAt(Date.now());
    } catch (err: any) {
      onError(errorText(err, language, 'لم يُحفظ التسجيل.', 'The mark was not saved.'));
    } finally {
      setSavingId(null);
    }
  };

  const close = async () => {
    try {
      setClosing(true);
      const result = await api.closeAttendanceSession(sessionId);
      onClosed(result);
    } catch (err: any) {
      onError(errorText(err, language, 'تعذّر إنهاء المحاضرة.', 'The session could not be ended.'));
      setClosing(false);
      setConfirmClose(false);
    }
  };

  const roster = live?.roster || [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster.filter(r => {
      if (filter === 'WAITING' && r.status) return false;
      if (filter === 'IN' && r.status !== 'PRESENT' && r.status !== 'LATE') return false;
      if (filter === 'OUT' && r.status !== 'ABSENT' && r.status !== 'EXCUSED') return false;
      if (q && !`${r.nameAr} ${r.nameEn} ${r.studentCode}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roster, filter, query]);

  if (!live) return <Loader label={t('جارٍ فتح المحاضرة…', 'Opening the session…')} />;

  const present = roster.filter(r => r.status === 'PRESENT').length;
  const late = roster.filter(r => r.status === 'LATE').length;
  const excused = roster.filter(r => r.status === 'EXCUSED').length;
  const absent = roster.filter(r => r.status === 'ABSENT').length;
  const waiting = roster.filter(r => !r.status).length;
  const leftMs = Math.max(0, live.rotatesInMs - (now - fetchedAt));
  const minutes = Math.max(0, Math.floor((now - new Date(live.startedAt).getTime()) / 60_000));
  const kindAr = live.kind === 'SECTION' ? 'السكشن' : 'المحاضرة';
  const kindEn = live.kind === 'SECTION' ? 'section' : 'lecture';
  const open = live.status === 'OPEN';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn btn-ghost">
          <Back aria-hidden="true" />
          {t('كل الشعب', 'All sections')}
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => api.downloadSessionAttendance(sessionId).catch(() => onError(t('تعذّر تنزيل الكشف.', 'The sheet could not be downloaded.')))} className="btn btn-secondary">
            <FileSpreadsheet aria-hidden="true" />
            {t('كشف Excel', 'Excel sheet')}
          </button>
          {open && (
            <button type="button" onClick={() => setConfirmClose(true)} className="btn btn-danger">
              <Square aria-hidden="true" />
              {t(`إنهاء ${kindAr} وحساب الغياب`, `End the ${kindEn} and count absences`)}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* QR code for the projector */}
        <Panel padded={false} className="overflow-hidden">
          <div ref={qrRef} className="flex flex-col items-center gap-4 bg-paper p-5 sm:p-7 [&:fullscreen]:justify-center [&:fullscreen]:bg-white">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CodeBadge code={live.courseCode} variant="solid" />
                <span className="text-[15px] font-bold text-ink-950">{language === 'ar' ? live.courseNameAr : live.courseNameEn}</span>
              </div>
              <Chip tone={open ? 'lane' : 'ink'} icon={open ? Radio : undefined}>
                {open
                  ? minutes < 1
                    ? t(`${kindAr} تأخذ الحضور — بدأت الآن`, `Taking ${kindEn} attendance — just started`)
                    : t(`${kindAr} تأخذ الحضور — منذ ${minutes} دقيقة`, `Taking ${kindEn} attendance — ${minutes} min`)
                  : t('انتهى التسجيل', 'Closed')}
              </Chip>
            </div>

            {open ? (
              <>
                <div
                  className="aspect-square w-full max-w-[420px] rounded-2xl border-[6px] border-ink-950 bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
                  role="img"
                  aria-label={t('رمز QR لتسجيل الحضور', 'Attendance QR code')}
                  dangerouslySetInnerHTML={{ __html: live.qrSvg }}
                />
                <div className="w-full max-w-[420px]">
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                    <div className="h-full rounded-full bg-route-400 transition-[width] duration-200" style={{ width: `${(leftMs / 30000) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-center text-[12px] text-ink-500">{t(`يتجدد الرمز خلال ${Math.ceil(leftMs / 1000)} ث`, `New code in ${Math.ceil(leftMs / 1000)} s`)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[12.5px] font-semibold text-ink-600">{t('أو اكتب الكود في صفحة «الحضور»', 'Or type the code on the Attendance page')}</p>
                  <p className="t-num text-[44px] font-extrabold leading-tight tracking-[0.25em] text-ink-950" dir="ltr">
                    {live.code.slice(0, 3)} {live.code.slice(3)}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => qrRef.current?.requestFullscreen?.().catch(() => undefined)} className="btn btn-secondary btn-sm">
                    <Maximize2 aria-hidden="true" />
                    {t('ملء الشاشة للعرض', 'Full screen for the projector')}
                  </button>
                </div>
                <p className="max-w-[46ch] text-center text-[11.5px] leading-5 text-ink-500">
                  {t(
                    'يمسح الطلاب الرمز بكاميرا الهاتف أو من صفحة «الحضور». بعد 15 دقيقة من البدء يُسجَّل الحضور «متأخر».',
                    'Students scan it with the phone camera or from their Attendance page. After 15 minutes check-ins count as late.'
                  )}
                </p>
                {offline && <p className="text-[12px] font-semibold text-caution-700">{t('انقطع الاتصال بالخادم؛ نحاول مجدداً…', 'Lost contact with the server; retrying…')}</p>}
              </>
            ) : (
              <EmptyState icon={CheckCircle2} tone="sign" title={t('انتهى تسجيل الحضور لهذه المحاضرة', 'Attendance for this session has ended')} />
            )}
          </div>
        </Panel>

        {/* Live roster */}
        <Panel padded={false}>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-[inherit] border-b border-ink-100 bg-ink-100 sm:grid-cols-4">
            <Count label={t('حضروا', 'In')} value={present + late} sub={late ? t(`${late} متأخر`, `${late} late`) : undefined} tone="sign" />
            <Count label={t('لم يسجّلوا بعد', 'Not yet')} value={waiting} tone="ink" />
            <Count label={t('غائب', 'Absent')} value={absent} tone="signal" />
            <Count label={t('بعذر', 'Excused')} value={excused} tone="lane" />
          </div>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              ariaLabel={t('تصفية الطلاب', 'Filter students')}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'ALL', label: t('الكل', 'All'), count: roster.length },
                { value: 'WAITING', label: t('لم يسجّل', 'Not yet'), count: waiting },
                { value: 'IN', label: t('حضر', 'In'), count: present + late },
                { value: 'OUT', label: t('غائب/بعذر', 'Out'), count: absent + excused },
              ]}
            />
            <label className="relative block sm:w-56">
              <span className="sr-only">{t('ابحث عن طالب', 'Find a student')}</span>
              <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 [inset-inline-start:0.75rem]" aria-hidden="true" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('ابحث بالاسم أو الرقم', 'Name or code')} className="field field-sm ps-9" />
            </label>
          </div>
          <ul className="max-h-[640px] divide-y divide-ink-100 overflow-y-auto border-t border-ink-100">
            {shown.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-ink-500">{t('لا يوجد طلاب في هذا التصنيف.', 'No students in this view.')}</li>
            ) : (
              shown.map(r => (
                <li key={r.studentId} className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between', !r.status && open && 'bg-ink-50/60')}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink-900">{language === 'ar' ? r.nameAr : r.nameEn}</span>
                      {r.standing !== 'OK' && <span className={cn(chipClass[standingTone[r.standing]], '!h-5 !text-[11px]')}>{pick(language, standingLabel[r.standing], r.standing)}</span>}
                    </p>
                    <p className="text-[11.5px] text-ink-500">
                      <span className="t-num">{r.studentCode}</span>
                      <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                      {t(`غاب ${r.absent} من ${r.allowedAbsences} مسموح`, `${r.absent} of ${r.allowedAbsences} absences used`)}
                      {r.status && r.method && (
                        <>
                          <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                          {pick(language, attendanceMethodLabel[r.method], r.method)}
                          {r.markedAt && ` ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(r.markedAt))}`}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1" role="group" aria-label={t(`تسجيل ${r.nameAr}`, `Mark ${r.nameEn}`)}>
                    {MARK_BUTTONS.map(b => {
                      const active = r.status === b.status;
                      const Icon = b.icon;
                      return (
                        <button
                          key={b.status}
                          type="button"
                          disabled={savingId === r.studentId}
                          onClick={() => !active && mark(r, b.status)}
                          aria-pressed={active}
                          className={cn(
                            'inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[12px] font-semibold transition',
                            active ? MARK_ACTIVE[b.status] : 'border-ink-200 bg-paper text-ink-600 hover:border-ink-400 hover:text-ink-900'
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">{language === 'ar' ? b.ar : b.en}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>

      {confirmClose && (
        <Modal
          onClose={() => !closing && setConfirmClose(false)}
          dismissible={!closing}
          size="sm"
          icon={Square}
          tone="signal"
          title={t(`إنهاء ${kindAr}؟`, `End the ${kindEn}?`)}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setConfirmClose(false)} disabled={closing} className="btn btn-ghost">
                {t('تراجع', 'Go back')}
              </button>
              <button type="button" onClick={close} disabled={closing} className="btn btn-danger">
                {closing ? t('جارٍ الإنهاء…', 'Ending…') : t('أنهِ وسجّل الغياب', 'End and record absences')}
              </button>
            </>
          }
        >
          <p className="text-[13.5px] leading-7 text-ink-700">
            {waiting > 0
              ? t(
                  `${waiting} طالب لم يسجّل حضوره بعد، وسيُسجَّلون غائبين. بعد الإنهاء يتوقف الرمز، ويصل التنبيه لمن اقترب من حد الغياب أو تجاوزه، ويُرسل لك التقرير.`,
                  `${waiting} student(s) have not checked in and will be marked absent. The code stops working, students near or over the limit are warned, and the report is sent to you.`
                )
              : t('كل الطلاب مسجّلون. بعد الإنهاء يتوقف الرمز ويُرسل لك التقرير.', 'Every student is marked. The code stops working and the report is sent to you.')}
          </p>
          <p className="mt-2 text-[12.5px] text-ink-500">{t('يمكنك تعديل أي تسجيل يدوياً بعد الإنهاء من تقرير الغياب.', 'You can still correct any mark afterwards from the absence report.')}</p>
        </Modal>
      )}
    </div>
  );
};

const Count: React.FC<{ label: string; value: number; sub?: string; tone: 'sign' | 'ink' | 'signal' | 'lane' }> = ({ label, value, sub, tone }) => (
  <div className="bg-paper px-4 py-3">
    <span className="text-[12px] font-medium text-ink-500">{label}</span>
    <div className={cn('text-[26px] font-extrabold leading-none', toneText[tone])}>
      <span className="t-num">{value}</span>
    </div>
    {sub && <span className="text-[11.5px] text-ink-500">{sub}</span>}
  </div>
);

/* ----------------------------------------------------------- close summary */

const CloseSummary: React.FC<{ result: AttendanceCloseResult; onClose: () => void; onError: (text: string) => void }> = ({ result, onClose, onError }) => {
  const { t, language } = useLanguage();
  const s = result.session;
  const countable = s.rosterCount - s.excusedCount;
  const pct = countable > 0 ? Math.round((s.presentCount / countable) * 100) : 100;
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    try {
      setDownloading(true);
      await api.downloadSessionAttendance(s.id);
    } catch {
      onError(t('تعذّر تنزيل الكشف.', 'The sheet could not be downloaded.'));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Modal
      onClose={onClose}
      size="lg"
      icon={CheckCircle2}
      tone="sign"
      title={t(`تقرير ${s.kind === 'SECTION' ? 'السكشن' : 'المحاضرة'}: ${s.courseCode}`, `${s.kind === 'SECTION' ? 'Section' : 'Lecture'} report: ${s.courseCode}`)}
      subtitle={new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'full', timeStyle: 'short' }).format(new Date(s.startedAt))}
      closeLabel={t('إغلاق', 'Close')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t('تم', 'Done')}
          </button>
          <button type="button" onClick={download} disabled={downloading} className="btn btn-primary">
            <Download aria-hidden="true" />
            {downloading ? t('جارٍ التنزيل…', 'Downloading…') : t('تنزيل كشف Excel', 'Download the Excel sheet')}
          </button>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-ink-200 bg-ink-50 p-4 text-center sm:grid-cols-4">
        <div className="kv items-center">
          <dt>{t('حضروا', 'Attended')}</dt>
          <dd className="t-num !text-[22px] text-sign-700">
            {s.presentCount}
            <span className="text-[12px] font-medium text-ink-500"> / {s.rosterCount}</span>
          </dd>
        </div>
        <div className="kv items-center">
          <dt>{t('منهم متأخر', 'Of whom late')}</dt>
          <dd className="t-num !text-[22px]">{s.lateCount}</dd>
        </div>
        <div className="kv items-center">
          <dt>{t('غائب', 'Absent')}</dt>
          <dd className="t-num !text-[22px] text-signal-600">{s.absentCount}</dd>
        </div>
        <div className="kv items-center">
          <dt>{t('نسبة الحضور', 'Attendance')}</dt>
          <dd className="t-num !text-[22px]">{pct}%</dd>
        </div>
      </dl>
      <Meter value={pct} tone={pct >= 75 ? 'sign' : 'caution'} className="mt-3" label={t('نسبة الحضور', 'Attendance rate')} />

      <div className="mt-5">
        <PanelHeader
          className="!mb-2"
          icon={AlertTriangle}
          tone={result.warningsSent.length ? 'caution' : 'sign'}
          title={result.warningsSent.length ? t('تنبيهات الغياب التي أُرسلت الآن', 'Absence warnings sent now') : t('لم يحتج أحد إلى تنبيه غياب جديد', 'No new absence warnings were needed')}
          description={t('يصل كل طالب تنبيه مرة واحدة عند كل مستوى، ويُبلَّغ المرشد بمن تجاوز الحد.', 'Each student is warned once per level; advisors hear about anyone over the limit.')}
        />
        {result.warningsSent.length > 0 && (
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
            {result.warningsSent.map(w => (
              <li key={w.studentId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                <span className="font-semibold text-ink-900">{language === 'ar' ? w.nameAr : w.nameEn}</span>
                <span className="flex items-center gap-2">
                  <span className="text-ink-600">
                    <span className="t-num">{w.absent}</span> {t('من', 'of')} <span className="t-num">{w.allowedAbsences}</span>
                  </span>
                  <span className={chipClass[standingTone[w.standing]]}>{pick(language, standingLabel[w.standing], w.standing)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-4 text-[12.5px] text-ink-500">{t('أُرسل ملخص الحضور إليك وإلى المعيد كإشعار.', 'An attendance summary was sent to you and the TA as a notification.')}</p>
    </Modal>
  );
};

/* ------------------------------------------------------------------ report */

const CourseReport: React.FC<{ offeringId: string; onBack: () => void; onError: (text: string) => void }> = ({ offeringId, onBack, onError }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [report, setReport] = useState<AttendanceCourseReport | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'RISK'>('ALL');
  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState<{ sessionId: string; studentId: string } | null>(null);
  const Back = language === 'ar' ? ArrowRight : ArrowLeft;
  const viewOnly = currentUser?.role === 'ADMIN' || currentUser?.role === 'DEPARTMENT_HEAD';

  const load = useCallback(async () => {
    try {
      setReport(await api.getAttendanceCourseReport(offeringId));
    } catch (err: any) {
      onError(errorText(err, language, 'تعذّر تحميل التقرير.', 'The report could not be loaded.'));
      onBack();
    }
  }, [offeringId, language, onBack, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'numeric' }),
    [language]
  );

  if (!report) return <Loader label={t('جارٍ إعداد تقرير الغياب…', 'Preparing the absence report…')} />;

  const { section, sessions, students } = report;
  const shown = filter === 'RISK' ? students.filter(s => s.standing !== 'OK') : students;
  const risky = students.filter(s => s.standing !== 'OK').length;

  const download = async () => {
    try {
      setDownloading(true);
      await api.downloadCourseAttendance(offeringId);
    } catch {
      onError(t('تعذّر تنزيل الكشف.', 'The sheet could not be downloaded.'));
    } finally {
      setDownloading(false);
    }
  };

  const correct = async (status: AttendanceStatus) => {
    if (!editing) return;
    try {
      await api.markAttendance(editing.sessionId, editing.studentId, status);
      setEditing(null);
      await load();
    } catch (err: any) {
      onError(errorText(err, language, 'لم يُحفظ التعديل.', 'The change was not saved.'));
    }
  };

  const editingStudent = editing && students.find(s => s.studentId === editing.studentId);
  const editingSession = editing && sessions.find(s => s.id === editing.sessionId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn btn-ghost">
          <Back aria-hidden="true" />
          {t('كل الشعب', 'All sections')}
        </button>
        <button type="button" onClick={download} disabled={downloading} className="btn btn-primary">
          <FileSpreadsheet aria-hidden="true" />
          {downloading ? t('جارٍ التنزيل…', 'Downloading…') : t('تنزيل كشف الفصل (Excel)', 'Download the term register (Excel)')}
        </button>
      </div>

      <PageHeader
        icon={BarChart3}
        tone="plum"
        title={t(`تقرير غياب ${section.offering.courseCode}`, `${section.offering.courseCode} absence report`)}
        description={t(
          `${language === 'ar' ? section.courseNameAr : section.courseNameEn}: عُقدت ${section.heldSessions} من ${section.plannedSessions} محاضرة وسكشن، ولكل طالب ${section.allowedAbsences} غيابات مسموحة طوال الفصل.`,
          `${section.courseNameEn}: ${section.heldSessions} of ${section.plannedSessions} lectures and sections held; each student may miss ${section.allowedAbsences} in the term.`
        )}
        meta={
          <>
            <Chip tone="ink">{t(`${section.rosterCount} طالب`, `${section.rosterCount} students`)}</Chip>
            <Chip tone={section.averageAttendance < 75 ? 'signal' : 'sign'}>{t(`متوسط الحضور ${section.averageAttendance}%`, `Average ${section.averageAttendance}%`)}</Chip>
            {section.atRiskCount > 0 && <Chip tone="caution">{t(`${section.atRiskCount} عند آخر فرصة`, `${section.atRiskCount} on last chance`)}</Chip>}
            {section.deprivedCount > 0 && <Chip tone="signal">{t(`${section.deprivedCount} تجاوز الحد`, `${section.deprivedCount} over the limit`)}</Chip>}
          </>
        }
        actions={
          <Segmented
            ariaLabel={t('تصفية الطلاب', 'Filter students')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: t('كل الطلاب', 'All students'), count: students.length },
              { value: 'RISK', label: t('عليهم تنبيه', 'With a warning'), count: risky },
            ]}
          />
        }
      />

      <Panel padded={false}>
        <div className="scroll-x">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>{t('الطالب', 'Student')}</th>
                <th className="num">{t('حضر', 'In')}</th>
                <th className="num">{t('غاب', 'Absent')}</th>
                <th className="num">{t('بعذر', 'Excused')}</th>
                <th className="num">{t('المتبقي', 'Left')}</th>
                <th className="num">{t('النسبة', 'Rate')}</th>
                <th>{t('الحالة', 'Standing')}</th>
                <th>{t('محاضرة بمحاضرة (اضغط للتعديل)', 'Session by session (click to correct)')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <tr key={s.studentId}>
                  <td>
                    <span className="block font-semibold text-ink-900">{language === 'ar' ? s.nameAr : s.nameEn}</span>
                    <span className="t-num text-[11.5px] text-ink-500">{s.studentCode}</span>
                  </td>
                  <td className="num t-num">{s.attended}</td>
                  <td className={cn('num t-num font-bold', s.absent > s.allowedAbsences ? 'text-signal-600' : s.absent > 0 ? 'text-caution-700' : '')}>{s.absent}</td>
                  <td className="num t-num">{s.excused}</td>
                  <td className="num t-num">{Math.max(0, s.remainingAbsences)}</td>
                  <td className="num t-num">{s.attendancePercent}%</td>
                  <td>
                    <span className={chipClass[standingTone[s.standing]]}>{pick(language, standingLabel[s.standing], s.standing)}</span>
                  </td>
                  <td>
                    <div className="flex max-w-[520px] flex-wrap gap-1">
                      {sessions.map(ses => {
                        const st = s.marks[ses.id];
                        const label = st ? pick(language, attendanceStatusLabel[st], st) : t('لم يُسجَّل', 'Not marked');
                        return (
                          <button
                            key={ses.id}
                            type="button"
                            disabled={viewOnly}
                            onClick={() => setEditing({ sessionId: ses.id, studentId: s.studentId })}
                            className={cn('h-3.5 w-3.5 rounded-full ring-1 ring-paper transition hover:scale-125 disabled:hover:scale-100', st ? DOT[st] : 'bg-ink-200', ses.kind === 'SECTION' && 'rounded-[3px]')}
                            title={`${ses.kind === 'SECTION' ? t('سكشن', 'Section') : t('محاضرة', 'Lecture')} ${fmt.format(new Date(ses.startedAt))}: ${label}`}
                            aria-label={`${fmt.format(new Date(ses.startedAt))}: ${label}`}
                          />
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <PanelHeader icon={CalendarClock} tone="plum" title={t('المحاضرات والسكاشن', 'Lectures and sections')} description={t('عدد الحاضرين في كل مرة، مع كشف Excel لكل واحدة.', 'How many attended each time, with an Excel sheet for each.')} />
        <ul className="divide-y divide-ink-100">
          {[...sessions].reverse().map(ses => (
            <li key={ses.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
              <span className="flex items-center gap-2">
                <Chip tone={ses.kind === 'SECTION' ? 'route' : 'plum'}>{ses.kind === 'SECTION' ? t('سكشن', 'Section') : t('محاضرة', 'Lecture')}</Chip>
                <span className="text-ink-800">
                  {new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(ses.startedAt))}
                </span>
                {ses.status === 'OPEN' && <Chip tone="lane">{t('مفتوحة الآن', 'Open now')}</Chip>}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-ink-700">
                  {t('حضر', 'Attended')} <span className="t-num">{ses.presentCount}</span> {t('من', 'of')} <span className="t-num">{ses.rosterCount}</span>
                </span>
                <button type="button" onClick={() => api.downloadSessionAttendance(ses.id).catch(() => onError(t('تعذّر تنزيل الكشف.', 'The sheet could not be downloaded.')))} className="btn btn-ghost btn-sm">
                  <FileSpreadsheet aria-hidden="true" />
                  Excel
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {editing && editingStudent && editingSession && (
        <Modal
          onClose={() => setEditing(null)}
          size="sm"
          icon={Users}
          tone="plum"
          title={t('تعديل التسجيل', 'Correct the mark')}
          subtitle={`${language === 'ar' ? editingStudent.nameAr : editingStudent.nameEn} — ${fmt.format(new Date(editingSession.startedAt))}`}
          closeLabel={t('إغلاق', 'Close')}
        >
          <div className="grid grid-cols-2 gap-2">
            {MARK_BUTTONS.map(b => {
              const Icon = b.icon;
              const active = editingStudent.marks[editingSession.id] === b.status;
              return (
                <button key={b.status} type="button" onClick={() => correct(b.status)} className={cn('btn', active ? 'btn-primary' : 'btn-secondary')} aria-pressed={active}>
                  <Icon aria-hidden="true" />
                  {language === 'ar' ? b.ar : b.en}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[12px] text-ink-500">{t('يُعاد حساب نسبة الطالب وتنبيهاته فوراً.', 'The student’s rate and warnings are recalculated straight away.')}</p>
        </Modal>
      )}
    </div>
  );
};

export default StaffAttendanceView;
