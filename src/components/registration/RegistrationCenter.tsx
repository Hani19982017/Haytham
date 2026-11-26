import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import type { RegistrationOverview, RegistrationOverviewRow, RegistrationStage, SectionSummary } from '../../types/index.js';
import {
  PageHeader,
  Panel,
  Stat,
  Segmented,
  Chip,
  CodeBadge,
  Meter,
  Loader,
  EmptyState,
  Toast,
  cn,
  chipClass,
  personName,
  pick,
  stageLabel,
  stageTone,
  registeredByLabel,
  trackLabel,
} from '../ui/index.js';
import {
  ClipboardList,
  Users,
  Download,
  Search,
  UserX,
  FilePen,
  Hourglass,
  Undo2,
  CheckCircle2,
  CalendarPlus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  BookOpen,
  FileSpreadsheet,
  FileCheck2,
} from 'lucide-react';
import { SectionRosterModal } from './SectionRosterModal.js';
import { RegisterForStudentModal } from './RegisterForStudentModal.js';

type SortKey = 'name' | 'code' | 'level' | 'gpa' | 'stage' | 'credits' | 'updated' | 'advisor';
type Mode = 'advisor' | 'admin' | 'readonly';

const STAGES: RegistrationStage[] = ['NOT_STARTED', 'DRAFT', 'PENDING', 'CHANGES_REQUESTED', 'REGISTERED'];
const STAGE_ICON = { NOT_STARTED: UserX, DRAFT: FilePen, PENDING: Hourglass, CHANGES_REQUESTED: Undo2, REGISTERED: CheckCircle2 };
const STAGE_RANK: Record<RegistrationStage, number> = { NOT_STARTED: 0, CHANGES_REQUESTED: 1, PENDING: 2, DRAFT: 3, REGISTERED: 4 };

const errorText = (err: any, language: string, ar: string, en: string) => {
  const data = err?.response?.data;
  return (language === 'ar' ? data?.messageAr : data?.messageEn) || (language === 'ar' ? ar : en);
};

const when = (iso: string | undefined, language: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Registration follow-up: who has registered this term, who has not, who is
 * waiting for the advisor and who was sent back — sortable, filterable and
 * downloadable as Excel; plus every section's list of students by name.
 * The advisor (their students) and the administrator (anyone) can register
 * for a student from here; student affairs and the department head view only.
 */
export const RegistrationCenter: React.FC<{ mode: Mode; onOpenApprovals?: () => void }> = ({ mode, onOpenApprovals }) => {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState<'STUDENTS' | 'SECTIONS'>('STUDENTS');
  const [overview, setOverview] = useState<RegistrationOverview | null>(null);
  const [sections, setSections] = useState<SectionSummary[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [stage, setStage] = useState<RegistrationStage | 'ALL'>('ALL');
  const [level, setLevel] = useState('ALL');
  const [advisor, setAdvisor] = useState('ALL');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'stage', dir: 'asc' });
  const [sectionQ, setSectionQ] = useState('');
  const [rosterFor, setRosterFor] = useState<string | null>(null);
  const [registerFor, setRegisterFor] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'sign' | 'signal'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(null);
      const [o, s] = await Promise.all([api.getRegistrationOverview(), api.getRegistrationSections()]);
      setOverview(o);
      setSections(s);
    } catch (err) {
      setFailed(errorText(err, language, 'تعذّر تحميل بيانات التسجيل.', 'Registration data could not be loaded.'));
    }
  }, [language]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const advisors = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of overview?.rows || []) if (r.advisorId) map.set(r.advisorId, r.advisorName);
    return [...map.entries()];
  }, [overview]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (overview?.rows || []).filter(
      r =>
        (stage === 'ALL' || r.stage === stage) &&
        (level === 'ALL' || String(r.level) === level) &&
        (advisor === 'ALL' || r.advisorId === advisor) &&
        (!term || r.nameAr.toLowerCase().includes(term) || r.nameEn.toLowerCase().includes(term) || r.studentCode.toLowerCase().includes(term))
    );
    const name = (r: RegistrationOverviewRow) => (language === 'ar' ? r.nameAr : r.nameEn);
    const cmp: Record<SortKey, (a: RegistrationOverviewRow, b: RegistrationOverviewRow) => number> = {
      name: (a, b) => name(a).localeCompare(name(b), language === 'ar' ? 'ar' : 'en'),
      code: (a, b) => a.studentCode.localeCompare(b.studentCode),
      level: (a, b) => a.level - b.level,
      gpa: (a, b) => (a.isNewStudent ? -1 : a.cumulativeGpa) - (b.isNewStudent ? -1 : b.cumulativeGpa),
      stage: (a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage],
      credits: (a, b) => (a.registeredCredits || a.requestedCredits) - (b.registeredCredits || b.requestedCredits),
      updated: (a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''),
      advisor: (a, b) => a.advisorName.localeCompare(b.advisorName, 'ar'),
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => dir * (cmp[sort.key](a, b) || name(a).localeCompare(name(b), 'ar')));
  }, [overview, stage, level, advisor, q, sort, language]);

  const sortBy = (key: SortKey) => setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const SortHead: React.FC<{ k: SortKey; children: React.ReactNode; className?: string }> = ({ k, children, className }) => {
    const Icon = sort.key !== k ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={className} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 font-[inherit] hover:text-ink-900">
          {children}
          <Icon className={cn('h-3.5 w-3.5', sort.key === k ? 'text-ink-900' : 'text-ink-400')} aria-hidden="true" />
        </button>
      </th>
    );
  };

  const downloadOverview = async () => {
    try {
      setBusy('xlsx');
      await api.downloadRegistrationOverview({
        stage: stage === 'ALL' ? undefined : stage,
        level: level === 'ALL' ? undefined : level,
        q: q.trim() || undefined,
        advisorId: advisor === 'ALL' ? undefined : advisor,
      });
    } catch (err) {
      setToast({ tone: 'signal', text: errorText(err, language, 'تعذّر تنزيل الملف.', 'The file could not be downloaded.') });
    } finally {
      setBusy(null);
    }
  };

  const runFreshmen = async () => {
    try {
      setBusy('freshmen');
      const res = await api.autoRegisterFreshmen();
      setToast({
        tone: 'sign',
        text:
          res.registered || res.failed
            ? t(`سُجّل ${res.registered} طالباً مستجداً تلقائياً${res.failed ? `، و${res.failed} يحتاجون مرشدهم لعدم وجود شعب متاحة` : ''}.`, `${res.registered} first-term students registered automatically${res.failed ? `; ${res.failed} need their advisor (no open section)` : ''}.`)
            : t('كل الطلاب المستجدين مسجلون بالفعل.', 'Every first-term student is already registered.'),
      });
      await load();
    } catch (err) {
      setToast({ tone: 'signal', text: errorText(err, language, 'تعذّر التسجيل التلقائي.', 'Automatic registration failed.') });
    } finally {
      setBusy(null);
    }
  };

  const downloadSection = async (s: SectionSummary, whole: boolean) => {
    try {
      setBusy(`${whole ? 'c' : 's'}:${s.offering.id}`);
      if (whole) await api.downloadCourseRoster(s.offering.courseCode);
      else await api.downloadSectionRoster(s.offering.id);
    } catch (err) {
      setToast({ tone: 'signal', text: errorText(err, language, 'تعذّر تنزيل الملف.', 'The file could not be downloaded.') });
    } finally {
      setBusy(null);
    }
  };

  if (failed) {
    return (
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
    );
  }
  if (!overview || !sections) return <Loader label={t('جارٍ تحميل حالة التسجيل…', 'Loading registration status…')} />;

  const canRegister = mode === 'advisor' || mode === 'admin';
  const counts = overview.counts;
  const filteredSections = sections.filter(s => {
    const term = sectionQ.trim().toLowerCase();
    return !term || `${s.offering.courseCode} ${s.courseNameAr} ${s.courseNameEn} ${s.offering.instructorName}`.toLowerCase().includes(term);
  });
  const stageText: Record<RegistrationStage, { ar: string; en: string }> = {
    NOT_STARTED: { ar: 'لا مقررات ولا طلب هذا الفصل', en: 'No courses and no request this term' },
    DRAFT: { ar: 'بدأ اختيار مقرراته ولم يرسلها', en: 'Started choosing, not sent yet' },
    PENDING: { ar: 'أرسل جدوله وينتظر الاعتماد', en: 'Sent a timetable, waiting for approval' },
    CHANGES_REQUESTED: { ar: 'أعاده المرشد للتعديل', en: 'The advisor sent it back' },
    REGISTERED: { ar: 'مقرراته مسجلة رسمياً', en: 'Courses officially registered' },
  };

  return (
    <div className="space-y-6">
      {toast && (
        <Toast tone={toast.tone} onClose={() => setToast(null)} closeLabel={t('إغلاق', 'Close')}>
          {toast.text}
        </Toast>
      )}

      <PageHeader
        icon={ClipboardList}
        tone="lane"
        title={t('متابعة التسجيل', 'Registration follow-up')}
        description={
          mode === 'advisor'
            ? t(
                'كل طلابك وحالة تسجيلهم هذا الفصل: من لم يسجّل بعد، ومن ينتظر اعتمادك، ومن أعدته للتعديل. رتّب بالضغط على عنوان أي عمود، ونزّل أي قائمة Excel، وسجّل لطالب في الحالات الاستثنائية.'
                , 'All your students and where they are with this term’s registration: not registered yet, waiting for you, sent back. Sort by any column, download any list as Excel, and register for a student when needed.'
              )
            : t(
                'حالة تسجيل كل طلاب البرنامج هذا الفصل، وكشوف أسماء الطلاب في كل شعبة. رتّب ونزّل أي قائمة Excel' + (mode === 'admin' ? '، وسجّل لأي طالب (وكاستثناء من اللائحة عند الضرورة مع ذكر السبب).' : '.'),
                'Every student’s registration this term, and the names in each section. Sort and download any list as Excel' + (mode === 'admin' ? '; register for any student (and as a bylaw exception, with a reason, when needed).' : '.')
              )
        }
        meta={
          <>
            <Chip tone="lane">{language === 'ar' ? overview.semesterNameAr : overview.semesterNameEn}</Chip>
            <Chip tone="ink" icon={Users}>
              {t(`${overview.rows.length} طالباً`, `${overview.rows.length} students`)}
            </Chip>
            {mode === 'readonly' && <Chip tone="caution">{t('اطلاع فقط', 'View only')}</Chip>}
          </>
        }
        actions={
          <Segmented
            ariaLabel={t('العرض', 'View')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'STUDENTS', label: t('حالة تسجيل الطلاب', 'Students'), icon: Users },
              { value: 'SECTIONS', label: t('كشوف المقررات', 'Section lists'), icon: BookOpen },
            ]}
          />
        }
      />

      {tab === 'STUDENTS' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {STAGES.map(s => (
              <Stat
                key={s}
                label={pick(language, stageLabel[s])}
                value={counts[s] ?? 0}
                tone={stageTone[s]}
                icon={STAGE_ICON[s]}
                hint={stage === s ? t('التصفية مفعّلة. اضغط لإلغائها.', 'Filter on. Click to clear.') : pick(language, stageText[s])}
                onClick={() => setStage(prev => (prev === s ? 'ALL' : s))}
                active={stage === s}
              />
            ))}
          </div>

          <Panel padded={false}>
            <div className="flex flex-col gap-3 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder={t('ابحث بالاسم أو الرقم الجامعي', 'Search by name or student code')}
                    aria-label={t('بحث عن طالب', 'Search students')}
                    className="field ps-9"
                  />
                </div>
                <select value={stage} onChange={e => setStage(e.target.value as any)} className="field sm:w-52" aria-label={t('حالة التسجيل', 'Registration status')}>
                  <option value="ALL">{t('كل الحالات', 'All statuses')}</option>
                  {STAGES.map(s => (
                    <option key={s} value={s}>
                      {pick(language, stageLabel[s])} ({counts[s] ?? 0})
                    </option>
                  ))}
                </select>
                <select value={level} onChange={e => setLevel(e.target.value)} className="field sm:w-40" aria-label={t('المستوى', 'Level')}>
                  <option value="ALL">{t('كل المستويات', 'All levels')}</option>
                  {[1, 2, 3, 4].map(l => (
                    <option key={l} value={String(l)}>
                      {t(`المستوى ${l}`, `Level ${l}`)}
                    </option>
                  ))}
                </select>
                {mode !== 'advisor' && advisors.length > 1 && (
                  <select value={advisor} onChange={e => setAdvisor(e.target.value)} className="field sm:w-56" aria-label={t('المرشد', 'Advisor')}>
                    <option value="ALL">{t('كل المرشدين', 'All advisors')}</option>
                    {advisors.map(([id, nm]) => (
                      <option key={id} value={id}>
                        {personName(nm, language)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mode === 'admin' && (
                  <button type="button" onClick={runFreshmen} disabled={!!busy} className="btn btn-secondary">
                    <Sparkles aria-hidden="true" />
                    {busy === 'freshmen' ? t('جارٍ التسجيل…', 'Registering…') : t('تسجيل المستجدين تلقائياً', 'Register first-term students')}
                  </button>
                )}
                <button type="button" onClick={downloadOverview} disabled={!!busy} className="btn btn-primary">
                  <Download aria-hidden="true" />
                  {busy === 'xlsx' ? t('جارٍ التنزيل…', 'Downloading…') : t(`تنزيل القائمة Excel (${rows.length})`, `Download Excel (${rows.length})`)}
                </button>
              </div>
            </div>

            <div className="scroll-x border-t border-ink-100">
              <table className="data-table min-w-[1060px]">
                <thead>
                  <tr>
                    <SortHead k="name">{t('الطالب', 'Student')}</SortHead>
                    <SortHead k="level">{t('المستوى', 'Level')}</SortHead>
                    <SortHead k="gpa" className="num">
                      {t('المعدل', 'GPA')}
                    </SortHead>
                    <SortHead k="stage">{t('حالة التسجيل', 'Status')}</SortHead>
                    <th>{t('المقررات', 'Courses')}</th>
                    <SortHead k="credits" className="num">
                      {t('الساعات', 'Credits')}
                    </SortHead>
                    {mode !== 'advisor' && <SortHead k="advisor">{t('المرشد', 'Advisor')}</SortHead>}
                    <SortHead k="updated">{t('آخر تحديث', 'Updated')}</SortHead>
                    <th className="num">
                      <span className="sr-only">{t('إجراءات', 'Actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState icon={Users} title={t('لا يوجد طالب يطابق التصفية', 'No student matches these filters')} />
                      </td>
                    </tr>
                  ) : (
                    rows.map(r => {
                      const courses = r.registeredCourses.length ? r.registeredCourses : r.requestedCourses;
                      const credits = r.registeredCourses.length ? r.registeredCredits : r.requestedCredits;
                      return (
                        <tr key={r.studentId}>
                          <td>
                            <p className="whitespace-nowrap font-semibold text-ink-900">
                              {language === 'ar' ? r.nameAr : r.nameEn}
                              {r.admissionType === 'TRANSFER' && <span className={cn(chipClass.caution, 'ms-2 !h-5 !text-[11px]')}>{t('محوَّل', 'Transfer')}</span>}
                            </p>
                            <p className="text-[12px] text-ink-500">
                              <span className="t-num">{r.studentCode}</span>
                              {r.isNewStudent && <span className="ms-2 text-lane-700">{t('مستجد', 'New student')}</span>}
                            </p>
                          </td>
                          <td className="whitespace-nowrap">
                            <p className="text-ink-800">{t(`المستوى ${r.level}`, `Level ${r.level}`)}</p>
                            <p className="text-[12px] text-ink-500">{pick(language, trackLabel[r.track], r.track)}</p>
                          </td>
                          <td className="num">
                            <span className={cn('t-num font-bold', !r.isNewStudent && r.cumulativeGpa < 2 ? 'text-signal-600' : 'text-ink-900')}>
                              {r.isNewStudent ? '—' : r.cumulativeGpa.toFixed(2)}
                            </span>
                          </td>
                          <td>
                            <span className={chipClass[stageTone[r.stage]]}>{pick(language, stageLabel[r.stage])}</span>
                            {r.dismissal && <p className="mt-1 text-[11.5px] font-bold text-signal-600">{t('بلغ حد الفصل', 'Dismissal limit')}</p>}
                            {r.stage === 'REGISTERED' && r.registeredBy && <p className="mt-1 text-[11.5px] text-ink-500">{registeredByLabel(r.registeredBy, language)}</p>}
                            {r.stage === 'CHANGES_REQUESTED' && r.advisorNotes && (
                              <p className="mt-1 max-w-[220px] truncate text-[11.5px] text-caution-700" title={r.advisorNotes}>
                                {r.advisorNotes}
                              </p>
                            )}
                          </td>
                          <td className="max-w-[260px]">
                            {courses.length ? (
                              <div className="flex flex-wrap gap-1">
                                {courses.map(c => (
                                  <CodeBadge key={c} code={c} variant={r.registeredCourses.length ? 'sign' : 'soft'} />
                                ))}
                              </div>
                            ) : (
                              <span className="text-[12px] text-ink-400">—</span>
                            )}
                          </td>
                          <td className="num">
                            <span className="t-num font-semibold">{credits || 0}</span>
                            <span className="text-[11.5px] text-ink-400"> / {r.maxAllowedCredits}</span>
                          </td>
                          {mode !== 'advisor' && <td className="whitespace-nowrap text-[12.5px] text-ink-700">{personName(r.advisorName, language) || '—'}</td>}
                          <td className="whitespace-nowrap text-[12.5px] text-ink-600">{when(r.updatedAt, language)}</td>
                          <td className="num">
                            <div className="inline-flex items-center gap-1.5">
                              {r.stage === 'PENDING' && mode === 'advisor' && onOpenApprovals && (
                                <button type="button" onClick={onOpenApprovals} className="btn btn-secondary btn-sm">
                                  <FileCheck2 aria-hidden="true" />
                                  {t('مراجعة', 'Review')}
                                </button>
                              )}
                              {canRegister && (
                                <button type="button" onClick={() => setRegisterFor(r.studentId)} className="btn btn-primary btn-sm">
                                  <CalendarPlus aria-hidden="true" />
                                  {t('تسجيل للطالب', 'Register')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {tab === 'SECTIONS' && (
        <Panel padded={false}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input
                type="search"
                value={sectionQ}
                onChange={e => setSectionQ(e.target.value)}
                placeholder={t('ابحث بكود المقرر أو اسمه أو الأستاذ', 'Search by course or instructor')}
                aria-label={t('بحث في الشعب', 'Search sections')}
                className="field ps-9"
              />
            </div>
            <span className="text-[12.5px] text-ink-500">
              {t(`${filteredSections.length} شعبة · ${filteredSections.reduce((s, x) => s + x.registeredCount, 0)} تسجيلاً`, `${filteredSections.length} sections · ${filteredSections.reduce((s, x) => s + x.registeredCount, 0)} registrations`)}
            </span>
          </div>
          <div className="scroll-x border-t border-ink-100">
            <table className="data-table min-w-[980px]">
              <thead>
                <tr>
                  <th>{t('المقرر والشعبة', 'Course and section')}</th>
                  <th>{t('الأستاذ', 'Instructor')}</th>
                  <th>{t('الموعد', 'Time')}</th>
                  <th>{t('المسجلون', 'Registered')}</th>
                  <th className="num">
                    <span className="sr-only">{t('إجراءات', 'Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSections.map(s => {
                  const fill = Math.round((s.registeredCount / Math.max(1, s.offering.capacity)) * 100);
                  return (
                    <tr key={s.offering.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <CodeBadge code={s.offering.courseCode} variant="solid" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-900">{language === 'ar' ? s.courseNameAr : s.courseNameEn}</p>
                            <p className="text-[12px] text-ink-500">{personName(s.offering.sectionCode, language) || s.offering.sectionCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-ink-700">{personName(s.offering.instructorName, language)}</td>
                      <td className="text-[12.5px] text-ink-600">{language === 'ar' ? s.offering.lectureDayTimeAr : s.offering.lectureDayTimeEn}</td>
                      <td className="min-w-[170px]">
                        <div className="mb-1 flex items-center justify-between text-[12px]">
                          <span className="t-num font-semibold text-ink-800">
                            {s.registeredCount} / {s.offering.capacity}
                          </span>
                          <span className="t-num text-ink-500">{fill}%</span>
                        </div>
                        <Meter value={fill} tone={fill >= 90 ? 'signal' : fill >= 75 ? 'caution' : 'sign'} label={t('امتلاء الشعبة', 'Section fill')} />
                      </td>
                      <td className="num">
                        <div className="inline-flex items-center gap-1.5">
                          <button type="button" onClick={() => setRosterFor(s.offering.id)} className="btn btn-primary btn-sm">
                            <Users aria-hidden="true" />
                            {t('الأسماء', 'Names')}
                          </button>
                          <button type="button" onClick={() => downloadSection(s, false)} disabled={!!busy} className="btn btn-secondary btn-sm" title={t('كشف الشعبة Excel', 'Section list as Excel')}>
                            <Download aria-hidden="true" />
                            {busy === `s:${s.offering.id}` ? '…' : 'Excel'}
                          </button>
                          <button type="button" onClick={() => downloadSection(s, true)} disabled={!!busy} className="btn btn-ghost btn-sm" title={t('كل شعب المقرر في ملف واحد', 'Every section of the course in one file')}>
                            <FileSpreadsheet aria-hidden="true" />
                            {busy === `c:${s.offering.id}` ? '…' : t('المقرر كله', 'Whole course')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {rosterFor && <SectionRosterModal offeringId={rosterFor} onClose={() => setRosterFor(null)} />}
      {registerFor && canRegister && (
        <RegisterForStudentModal
          studentId={registerFor}
          mode={mode === 'admin' ? 'admin' : 'advisor'}
          onClose={() => {
            setRegisterFor(null);
            load();
          }}
          onDone={text => {
            setToast({ tone: 'sign', text });
            load();
          }}
        />
      )}
    </div>
  );
};
