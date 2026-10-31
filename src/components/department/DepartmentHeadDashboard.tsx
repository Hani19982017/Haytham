import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import {
  PageHeader,
  Panel,
  PanelHeader,
  Chip,
  CodeBadge,
  Loader,
  EmptyState,
  Segmented,
  cn,
  toneColor,
  riskTone,
  riskLabel,
  trackTone,
  trackLabel,
  pick,
  type Tone,
} from '../ui/index.js';
import {
  BarChart3,
  Flame,
  PieChart,
  Users,
  ShieldAlert,
  AlertTriangle,
  TrendingDown,
  CheckCircle,
  RotateCcw,
  Lightbulb,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface DepartmentHeadDashboardProps {
  currentTab?: string;
  onNavigateTab?: (tab: string) => void;
}

type HeadTab = 'ANALYTICS' | 'HOTSPOTS' | 'SEATS';

const mapHeadTab = (tab?: string): HeadTab => {
  if (tab === 'head-hotspots') return 'HOTSPOTS';
  if (tab === 'head-seats') return 'SEATS';
  return 'ANALYTICS';
};

interface Hotspot {
  code: string;
  nameAr: string;
  nameEn: string;
  count: number;
}

interface SeatStat {
  courseCode: string;
  courseNameAr: string;
  courseNameEn: string;
  capacity: number;
  enrolledCount: number;
  pressurePct: number;
  isFull?: boolean;
}

/** Seat pressure bands used by the original colour logic (≥90 critical, ≥75 near full). */
const pressureTone = (pct: number): Tone => (pct >= 90 ? 'signal' : pct >= 75 ? 'caution' : 'sign');

const RISK_ORDER: Array<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const DepartmentHeadDashboard: React.FC<DepartmentHeadDashboardProps> = ({ currentTab, onNavigateTab }) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<HeadTab>(() => mapHeadTab(currentTab));
  const [seatFilter, setSeatFilter] = useState<'ALL' | 'NEAR' | 'FULL'>('ALL');

  useEffect(() => {
    if (currentTab) {
      setActiveTab(mapHeadTab(currentTab));
    }
  }, [currentTab]);

  const handleSelectTab = (tab: HeadTab) => {
    setActiveTab(tab);
    if (onNavigateTab) {
      switch (tab) {
        case 'HOTSPOTS':
          onNavigateTab('head-hotspots');
          break;
        case 'SEATS':
          onNavigateTab('head-seats');
          break;
        case 'ANALYTICS':
        default:
          onNavigateTab('head-analytics');
          break;
      }
    }
  };

  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await api.getDepartmentAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load department analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return <Loader label={t('جارٍ حساب مؤشرات القسم…', 'Calculating department indicators…')} />;
  }

  if (!analytics) {
    return (
      <Panel>
        <EmptyState
          icon={AlertTriangle}
          tone="caution"
          title={t('تعذّر تحميل مؤشرات القسم', 'Department indicators could not be loaded')}
          description={t(
            'الخادم لم يرد. تأكد أن الخادم وقاعدة البيانات يعملان ثم أعد المحاولة.',
            'The server did not respond. Check that the server and database are running, then try again.'
          )}
          action={
            <button type="button" onClick={loadAnalytics} className="btn btn-primary">
              <RotateCcw aria-hidden="true" />
              {t('إعادة المحاولة', 'Try again')}
            </button>
          }
        />
      </Panel>
    );
  }

  const totalStudents: number = analytics.totalStudents ?? 0;
  const riskSummary = {
    critical: analytics.riskSummary?.critical ?? 0,
    high: analytics.riskSummary?.high ?? 0,
    medium: analytics.riskSummary?.medium ?? 0,
    low: analytics.riskSummary?.low ?? 0,
    below2Gpa: analytics.riskSummary?.below2Gpa ?? 0,
  };
  const hotspots: Hotspot[] = analytics.hotspots || [];
  const seatStats: SeatStat[] = analytics.seatStats || [];
  const trackDistribution: Record<string, number> = analytics.trackDistribution || {};
  const expectedGraduationDelays: number = analytics.expectedGraduationDelays ?? 0;

  const pctOfStudents = (n: number) => (totalStudents > 0 ? Math.round((n / totalStudents) * 100) : 0);
  const riskCounts: Record<string, number> = {
    LOW: riskSummary.low,
    MEDIUM: riskSummary.medium,
    HIGH: riskSummary.high,
    CRITICAL: riskSummary.critical,
  };
  const classifiedTotal = RISK_ORDER.reduce((sum, k) => sum + riskCounts[k], 0);

  const maxFailures = hotspots.reduce((m, h) => Math.max(m, h.count), 0);
  const totalFailures = hotspots.reduce((sum, h) => sum + h.count, 0);

  // Label repeated offerings of the same course (the API sends one row per section).
  const seenCodes: Record<string, number> = {};
  const seatRows = seatStats.map((s, idx) => {
    seenCodes[s.courseCode] = (seenCodes[s.courseCode] || 0) + 1;
    return { ...s, key: `${s.courseCode}_${idx}`, repeat: seenCodes[s.courseCode] > 1 };
  });
  const seatsByPressure = [...seatRows].sort((a, b) => b.pressurePct - a.pressurePct);
  const nearFullCount = seatRows.filter(s => s.pressurePct >= 75).length;
  const criticalSeatCount = seatRows.filter(s => s.pressurePct >= 90).length;
  const fullCount = seatRows.filter(s => s.isFull || s.enrolledCount >= s.capacity).length;
  const filteredSeats = seatsByPressure.filter(s => {
    if (seatFilter === 'NEAR') return s.pressurePct >= 75;
    if (seatFilter === 'FULL') return s.isFull || s.enrolledCount >= s.capacity;
    return true;
  });

  const Chevron = language === 'ar' ? ChevronLeft : ChevronRight;

  /* ---------------------------------------------------------------- */
  /* Shared row renderers                                              */
  /* ---------------------------------------------------------------- */
  const renderHotspotRow = (h: Hotspot, idx: number, compact = false) => {
    const width = maxFailures > 0 ? Math.max(4, Math.round((h.count / maxFailures) * 100)) : 0;
    const strong = idx < 3;
    return (
      <li key={h.code} className={cn('grid items-center gap-x-4 gap-y-2', compact ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)_auto]', 'py-3')}>
        <span
          className={cn(
            't-num grid h-8 w-8 place-items-center rounded-lg text-[13px] font-extrabold',
            strong ? 'bg-signal-500 text-white' : 'bg-signal-50 text-signal-700'
          )}
          aria-label={t(`المرتبة ${idx + 1}`, `Rank ${idx + 1}`)}
        >
          {idx + 1}
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <CodeBadge code={h.code} />
            <span className="truncate text-[13.5px] font-semibold text-ink-900">{language === 'ar' ? h.nameAr : h.nameEn}</span>
          </div>
          {compact && (
            <div className="mt-2 flex items-center gap-3">
              <div className="meter flex-1">
                <span style={{ width: `${width}%`, background: strong ? 'var(--color-signal-500)' : 'var(--color-signal-300)' }} />
              </div>
              <span className="t-num shrink-0 text-[12.5px] font-bold text-signal-600">{h.count}</span>
            </div>
          )}
        </div>
        {!compact && (
          <>
            <div className="col-span-2 md:col-span-1">
              <div className="h-3 overflow-hidden rounded-full bg-signal-50">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${width}%`, background: strong ? 'var(--color-signal-500)' : 'var(--color-signal-300)' }}
                />
              </div>
            </div>
            <span className="col-span-2 text-[13px] font-bold text-signal-600 md:col-span-1 md:text-end">
              <span className="t-num">{h.count}</span> {t('حالة رسوب', h.count === 1 ? 'failure' : 'failures')}
            </span>
          </>
        )}
      </li>
    );
  };

  const renderSeatRow = (s: (typeof seatRows)[number], compact = false) => {
    const tone = pressureTone(s.pressurePct);
    const fill = Math.min(100, Math.max(0, s.pressurePct));
    const over = s.enrolledCount - s.capacity;
    return (
      <li key={s.key} className="py-3">
        <div className={cn(compact ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5')}>
          <div className="flex min-w-0 items-center gap-2">
            <CodeBadge code={s.courseCode} variant={tone === 'signal' ? 'signal' : 'soft'} />
            <span className="truncate text-[13.5px] font-semibold text-ink-900">
              {language === 'ar' ? s.courseNameAr : s.courseNameEn}
            </span>
            {s.repeat && <Chip tone="ink">{t('شعبة أخرى', 'Another section')}</Chip>}
          </div>
          <div className="flex items-center gap-2">
            {over > 0 && (
              <Chip tone="signal">{t(`تجاوز السعة بـ ${over}`, `${over} over capacity`)}</Chip>
            )}
            {over === 0 && <Chip tone="signal">{t('ممتلئة', 'Full')}</Chip>}
            <span className="t-num text-[13px] text-ink-600">
              {s.enrolledCount} / {s.capacity}
            </span>
            <span className={cn('t-num min-w-[3.25rem] text-end text-[13.5px] font-extrabold', tone === 'signal' ? 'text-signal-600' : tone === 'caution' ? 'text-caution-700' : 'text-sign-700')}>
              {s.pressurePct}%
            </span>
          </div>
        </div>
        <div className={cn('relative mt-2 overflow-hidden rounded-full bg-ink-100', compact ? 'h-2' : 'h-3')}>
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${fill}%`, background: toneColor[tone] }} />
        </div>
      </li>
    );
  };

  /* ---------------------------------------------------------------- */
  /* HOTSPOTS                                                          */
  /* ---------------------------------------------------------------- */
  if (activeTab === 'HOTSPOTS') {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Flame}
          tone="signal"
          title={t('بؤر الرسوب', 'Failure hotspots')}
          description={t(
            'المقررات التي سُجّل فيها أكبر عدد من حالات الرسوب، مرتبة من الأعلى. تأخر اجتياز أي منها يؤخر المقررات التي تعتمد عليه.',
            'Courses with the most recorded failures, highest first. A delay in any of them holds back the courses that depend on it.'
          )}
          meta={
            <>
              <Chip tone="signal">{t(`${hotspots.length} مقرر`, `${hotspots.length} course${hotspots.length === 1 ? '' : 's'}`)}</Chip>
              <Chip tone="ink">{t(`${totalFailures} حالة رسوب مسجلة`, `${totalFailures} recorded failure${totalFailures === 1 ? '' : 's'}`)}</Chip>
            </>
          }
          actions={
            <button type="button" onClick={() => handleSelectTab('ANALYTICS')} className="btn btn-secondary">
              <BarChart3 aria-hidden="true" />
              {t('مؤشرات القسم', 'Department indicators')}
            </button>
          }
        />

        {hotspots.length > 0 && (
          <div className="callout callout-caution">
            <Lightbulb aria-hidden="true" />
            <p>
              {t(
                'المقررات في أعلى القائمة تحتاج دعماً إضافياً: ساعات مراجعة أو مساعد تدريس، قبل بداية الفصل القادم.',
                'Courses at the top of this list need extra support, such as review sessions or a teaching assistant, before next term starts.'
              )}
            </p>
          </div>
        )}

        <Panel>
          <PanelHeader
            icon={Flame}
            tone="signal"
            title={t('ترتيب المقررات حسب حالات الرسوب', 'Courses ranked by failures')}
            description={t('طول الشريط نسبةً إلى المقرر الأعلى رسوباً.', 'Bar length is relative to the course with the most failures.')}
          />
          {hotspots.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              tone="sign"
              title={t('لا توجد حالات رسوب مسجلة', 'No failures recorded')}
              description={t('لم يرسب أي طالب في أي مقرر حتى الآن.', 'No student has failed a course so far.')}
            />
          ) : (
            <ol className="divide-y divide-ink-100">{hotspots.map((h, idx) => renderHotspotRow(h, idx))}</ol>
          )}
        </Panel>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* SEATS                                                             */
  /* ---------------------------------------------------------------- */
  if (activeTab === 'SEATS') {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={PieChart}
          tone="caution"
          title={t('ضغط المقاعد', 'Seat demand')}
          description={t(
            'نسبة امتلاء كل شعبة مفتوحة. الشعب فوق 90% تحتاج سعة إضافية أو شعبة جديدة قبل فتح التسجيل.',
            'How full each open section is. Sections above 90% need more seats or a new section before registration opens.'
          )}
          meta={
            <>
              <Chip tone="ink">{t(`${seatRows.length} شعبة`, `${seatRows.length} sections`)}</Chip>
              <Chip tone="signal">{t(`${criticalSeatCount} فوق 90%`, `${criticalSeatCount} above 90%`)}</Chip>
              <Chip tone="caution">{t(`${fullCount} ممتلئة`, `${fullCount} full`)}</Chip>
            </>
          }
          actions={
            <button type="button" onClick={() => handleSelectTab('ANALYTICS')} className="btn btn-secondary">
              <BarChart3 aria-hidden="true" />
              {t('مؤشرات القسم', 'Department indicators')}
            </button>
          }
        />

        <Panel>
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[16px] font-bold leading-7 text-ink-950">{t('الشعب مرتبة حسب الامتلاء', 'Sections by fill rate')}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-500">
                {(
                  [
                    ['sign', t('أقل من 75%', 'Under 75%')],
                    ['caution', t('75% إلى 89%', '75% to 89%')],
                    ['signal', t('90% فأكثر', '90% and above')],
                  ] as Array<[Tone, string]>
                ).map(([tone, label]) => (
                  <span key={tone} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: toneColor[tone] }} aria-hidden="true" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <Segmented
              ariaLabel={t('تصفية الشعب', 'Filter sections')}
              value={seatFilter}
              onChange={setSeatFilter}
              options={[
                { value: 'ALL', label: t('كل الشعب', 'All sections'), count: seatRows.length },
                { value: 'NEAR', label: t('75% فأكثر', '75% and above'), count: nearFullCount },
                { value: 'FULL', label: t('ممتلئة', 'Full'), count: fullCount },
              ]}
            />
          </div>

          {filteredSeats.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              tone="sign"
              title={
                seatRows.length === 0
                  ? t('لا توجد شعب مفتوحة', 'No open sections')
                  : t('لا توجد شعب في هذا التصنيف', 'No sections in this view')
              }
              description={
                seatRows.length === 0
                  ? t('ستظهر الشعب هنا بعد إضافتها من صفحة الشعب والمقاعد.', 'Sections appear here once they are added on the sections page.')
                  : t('اختر «كل الشعب» لعرض القائمة كاملة.', 'Choose “All sections” to see the full list.')
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">{filteredSeats.map(s => renderSeatRow(s))}</ul>
          )}
        </Panel>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* ANALYTICS                                                         */
  /* ---------------------------------------------------------------- */
  const trackEntries = Object.entries(trackDistribution);
  const trackTotal = trackEntries.reduce((sum, [, n]) => sum + (n || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title={t('مؤشرات القسم', 'Department indicators')}
        description={t(
          'صورة واحدة لطلاب برنامج علوم الحاسب: مستويات الخطر، التوزيع على المسارات، أكثر المقررات رسوباً، والشعب الأقرب للامتلاء.',
          'One view of the Computer Science students: risk levels, track split, the courses most failed and the sections closest to full.'
        )}
        meta={
          <Chip tone="ink" icon={Users}>
            {t(`${totalStudents} طالباً مقيداً`, `${totalStudents} enrolled students`)}
          </Chip>
        }
        actions={
          <>
            <button type="button" onClick={() => handleSelectTab('HOTSPOTS')} className="btn btn-secondary">
              <Flame aria-hidden="true" />
              {t('بؤر الرسوب', 'Failure hotspots')}
              {hotspots.length > 0 && <span className="seg-count">{hotspots.length}</span>}
            </button>
            <button type="button" onClick={() => handleSelectTab('SEATS')} className="btn btn-secondary">
              <PieChart aria-hidden="true" />
              {t('ضغط المقاعد', 'Seat demand')}
            </button>
          </>
        }
      />

      {/* Risk distribution + key figures */}
      <Panel padded={false} className="overflow-hidden">
        <div className="p-5 sm:p-6">
          <PanelHeader
            icon={ShieldAlert}
            tone="signal"
            title={t('توزيع الطلاب حسب الخطر الأكاديمي', 'Students by academic risk')}
            description={t('الشريط يمثل كل طلاب البرنامج؛ كل طالب له مستوى خطر واحد.', 'The bar is the whole programme; each student has one risk level.')}
          />
          <div
            className="flex h-5 overflow-hidden rounded-full bg-ink-100"
            role="img"
            aria-label={RISK_ORDER.map(k => `${pick(language, riskLabel[k], k)}: ${riskCounts[k]}`).join(', ')}
          >
            {classifiedTotal > 0 &&
              RISK_ORDER.filter(k => riskCounts[k] > 0).map((k, i) => (
                <div
                  key={k}
                  className={cn('h-full', i > 0 && 'border-s-2 border-white')}
                  style={{ width: `${(riskCounts[k] / classifiedTotal) * 100}%`, background: toneColor[riskTone[k]] }}
                  title={`${pick(language, riskLabel[k], k)}: ${riskCounts[k]}`}
                />
              ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {RISK_ORDER.map(k => (
              <div key={k} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: toneColor[riskTone[k]] }} aria-hidden="true" />
                <div>
                  <dt className="text-[12.5px] text-ink-500">{pick(language, riskLabel[k], k)}</dt>
                  <dd className="flex items-baseline gap-1.5">
                    <span className="t-num text-[18px] font-extrabold text-ink-950">{riskCounts[k]}</span>
                    <span className="t-num text-[12px] text-ink-500">{pctOfStudents(riskCounts[k])}%</span>
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid grid-cols-1 border-t border-ink-100 bg-ink-50/60 sm:grid-cols-2 xl:grid-cols-4">
          <div className="px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink-500">{t('خطر حرج (احتمال فصل)', 'Critical (dismissal risk)')}</span>
              <ShieldAlert className="h-4 w-4 text-signal-500" aria-hidden="true" />
            </div>
            <p className="t-num mt-1 text-[32px] font-extrabold leading-none text-signal-600">{riskSummary.critical}</p>
            <p className="mt-2 text-[12px] text-ink-500">{t(`${pctOfStudents(riskSummary.critical)}% من طلاب البرنامج`, `${pctOfStudents(riskSummary.critical)}% of the programme`)}</p>
          </div>
          <div className="border-t border-ink-100 px-5 py-5 sm:border-s sm:border-t-0 sm:px-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink-500">{t('معدل تحت 2.00', 'GPA under 2.00')}</span>
              <AlertTriangle className="h-4 w-4 text-caution-500" aria-hidden="true" />
            </div>
            <p className="t-num mt-1 text-[32px] font-extrabold leading-none text-caution-600">{riskSummary.below2Gpa}</p>
            <p className="mt-2 text-[12px] text-ink-500">{t('يحتاجون خطة تحسين معدل معتمدة', 'Need an approved GPA recovery plan')}</p>
          </div>
          <div className="border-t border-ink-100 px-5 py-5 sm:px-6 xl:border-s xl:border-t-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink-500">{t('تأخر تخرج متوقع', 'Expected graduation delays')}</span>
              <TrendingDown className="h-4 w-4 text-ink-500" aria-hidden="true" />
            </div>
            <p className="t-num mt-1 text-[32px] font-extrabold leading-none text-ink-950">{expectedGraduationDelays}</p>
            <p className="mt-2 text-[12px] text-ink-500">{t('تقدير بنحو 14% من الطلاب بسبب تراكم المتطلبات السابقة', 'Estimated at about 14% of students, from prerequisite backlogs')}</p>
          </div>
          <div className="border-t border-ink-100 px-5 py-5 sm:border-s sm:px-6 xl:border-t-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink-500">{t('على المسار الطبيعي', 'On track')}</span>
              <CheckCircle className="h-4 w-4 text-sign-600" aria-hidden="true" />
            </div>
            <p className="t-num mt-1 text-[32px] font-extrabold leading-none text-sign-700">{riskSummary.low}</p>
            <p className="mt-2 text-[12px] text-ink-500">{t(`${pctOfStudents(riskSummary.low)}% بخطر منخفض`, `${pctOfStudents(riskSummary.low)}% at low risk`)}</p>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Tracks */}
        <Panel>
          <PanelHeader
            icon={Layers}
            tone="plum"
            title={t('التوزيع على المسارات', 'Students by track')}
            description={t('عدد الطلاب في كل مسار تخصص.', 'How many students follow each track.')}
          />
          {trackEntries.length === 0 ? (
            <p className="text-[13px] text-ink-500">{t('لا توجد بيانات مسارات.', 'No track data.')}</p>
          ) : (
            <ul className="space-y-4">
              {trackEntries.map(([track, count]) => {
                const pct = trackTotal > 0 ? Math.round(((count || 0) / trackTotal) * 100) : 0;
                const tone = trackTone[track] || 'ink';
                return (
                  <li key={track}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-[13.5px] font-semibold text-ink-900">{pick(language, trackLabel[track], track)}</span>
                      <span className="text-[12.5px] text-ink-500">
                        <span className="t-num font-bold text-ink-900">{count}</span> <span className="t-num">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: tone === 'ink' ? 'var(--color-ink-700)' : toneColor[tone] }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Hotspots preview */}
        <Panel>
          <PanelHeader
            icon={Flame}
            tone="signal"
            title={t('أكثر المقررات رسوباً', 'Most failed courses')}
            description={t('أعلى خمسة مقررات في حالات الرسوب.', 'The five courses with the most failures.')}
          />
          {hotspots.length === 0 ? (
            <p className="py-4 text-[13px] text-ink-500">{t('لا توجد حالات رسوب مسجلة.', 'No failures recorded.')}</p>
          ) : (
            <ol className="-mt-2 divide-y divide-ink-100">{hotspots.slice(0, 5).map((h, idx) => renderHotspotRow(h, idx, true))}</ol>
          )}
          {hotspots.length > 0 && (
            <button type="button" onClick={() => handleSelectTab('HOTSPOTS')} className="link-action mt-3 text-[13px]">
              {t(`عرض كل البؤر (${hotspots.length})`, `See all hotspots (${hotspots.length})`)}
              <Chevron className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </Panel>

        {/* Seats preview */}
        <Panel>
          <PanelHeader
            icon={PieChart}
            tone="caution"
            title={t('الشعب الأقرب للامتلاء', 'Sections closest to full')}
            description={t(`${nearFullCount} شعبة عند 75% أو أكثر.`, `${nearFullCount} section${nearFullCount === 1 ? '' : 's'} at 75% or more.`)}
          />
          {seatRows.length === 0 ? (
            <p className="py-4 text-[13px] text-ink-500">{t('لا توجد شعب مفتوحة.', 'No open sections.')}</p>
          ) : (
            <ul className="-mt-2 divide-y divide-ink-100">{seatsByPressure.slice(0, 5).map(s => renderSeatRow(s, true))}</ul>
          )}
          {seatRows.length > 0 && (
            <button type="button" onClick={() => handleSelectTab('SEATS')} className="link-action mt-3 text-[13px]">
              {t(`عرض كل الشعب (${seatRows.length})`, `See all sections (${seatRows.length})`)}
              <Chevron className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </Panel>
      </div>
    </div>
  );
};
