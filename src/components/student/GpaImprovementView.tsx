import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { GpaImprovementPlan, Student } from '../../types/index.js';
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
  GpaScale,
  cn,
  chipClass,
  toneColor,
  toneText,
  gradeTone,
  type Tone,
} from '../ui/index.js';
import {
  TrendingUp,
  Scale,
  CheckCircle2,
  CalendarCheck,
  Route,
  GitFork,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  Flag,
} from 'lucide-react';

interface GpaImprovementViewProps {
  onNavigateTab?: (tab: string) => void;
}

// Each strategy is drawn as its own route with a fixed colour.
const STRATEGY_META: Record<string, { ar: string; en: string; tone: Tone }> = {
  Conservative: { ar: 'المسار الهادئ', en: 'Steady route', tone: 'lane' },
  Balanced: { ar: 'المسار المتوازن', en: 'Balanced route', tone: 'route' },
  Aggressive: { ar: 'المسار المكثف', en: 'Intensive route', tone: 'caution' },
};

// How demanding the plan is for the student (the planner's riskLevel).
const EFFORT_META: Record<string, { ar: string; en: string; tone: Tone }> = {
  LOW: { ar: 'جهد منخفض', en: 'Low effort', tone: 'sign' },
  MEDIUM: { ar: 'جهد متوسط', en: 'Medium effort', tone: 'route' },
  HIGH: { ar: 'جهد مرتفع', en: 'High effort', tone: 'caution' },
};

export const GpaImprovementView: React.FC<GpaImprovementViewProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [plans, setPlans] = useState<GpaImprovementPlan[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [adoptedStrategy, setAdoptedStrategy] = useState<string | null>(null);
  const [activeModalPlan, setActiveModalPlan] = useState<GpaImprovementPlan | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setLoadFailed(false);
        const [plansData, studentData] = await Promise.all([
          api.getGpaPlans(studentId),
          api.getStudentById(studentId),
        ]);
        setPlans(plansData);
        setStudent(studentData);

        // Check for previously adopted plan
        try {
          const saved = localStorage.getItem(`gpa_adopted_strategy_${studentId}`);
          if (saved) {
            setAdoptedStrategy(saved);
          }
        } catch {}
      } catch (err) {
        console.error('Failed to load GPA plans:', err);
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [studentId, reloadKey]);

  // The confirmation toast clears itself after 4 seconds.
  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => setSuccessToast(null), 4000);
    return () => clearTimeout(timer);
  }, [successToast]);

  const handleApplyPlan = (plan: GpaImprovementPlan) => {
    setAdoptedStrategy(plan.strategy);
    try {
      localStorage.setItem(`gpa_adopted_strategy_${studentId}`, plan.strategy);
      // Stage course codes for automatic preselection in registration
      const stagedCodes = plan.courses.map(c => c.courseCode);
      localStorage.setItem(`staged_recovery_courses_${studentId}`, JSON.stringify(stagedCodes));
      localStorage.setItem('staged_recovery_courses', JSON.stringify(stagedCodes));
    } catch {}

    setActiveModalPlan(plan);
    setSuccessToast(
      language === 'ar'
        ? `اعتمدت «${plan.titleAr}». أُضيفت مقرراتها إلى مسودة تسجيلك.`
        : `You adopted “${plan.titleEn}”. Its courses were added to your registration draft.`
    );
  };

  const handleNavigate = (tab: string, path: string) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    } else {
      navigate(path);
    }
  };

  if (loading) {
    return <Loader label={t('جارٍ حساب خطط تحسين معدلك…', 'Working out your GPA recovery plans…')} />;
  }

  if (loadFailed && plans.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={AlertTriangle}
          tone="caution"
          title={t('تعذّر تحميل خطط تحسين المعدل', 'Your GPA plans could not be loaded')}
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

  const deficitPoints = student
    ? Math.max(0, Math.round((2.0 * student.completedCredits - student.cumulativeGpa * student.completedCredits) * 100) / 100)
    : 0;
  const currentGpa = student?.cumulativeGpa ?? 0;
  const atRisk = currentGpa < 2.0;
  const Chevron = language === 'ar' ? ChevronLeft : ChevronRight;

  const strategyName = (s: string) => {
    const meta = STRATEGY_META[s];
    return meta ? (language === 'ar' ? meta.ar : meta.en) : t('خطة', 'Plan');
  };

  const nextSteps: Array<{ tab: string; path: string; icon: typeof Route; title: string; why: string; primary?: boolean }> = [
    {
      tab: 'student-registration',
      path: '/student/registration',
      icon: CalendarCheck,
      primary: true,
      title: t('اذهب إلى التسجيل', 'Go to registration'),
      why: t('مقررات الخطة جاهزة في مسودة جدولك؛ راجعها وأرسلها لمرشدك.', 'The plan’s courses are waiting in your timetable draft; review and send it to your advisor.'),
    },
    {
      tab: 'student-study-plan',
      path: '/student/study-plan',
      icon: Route,
      title: t('راجع خطتك حتى التخرج', 'Review your plan to graduation'),
      why: t('شاهد أين تقع مقررات الإعادة بين فصولك القادمة.', 'See where the retakes fall among your coming terms.'),
    },
    {
      tab: 'student-what-if',
      path: '/student/what-if',
      icon: GitFork,
      title: t('جرّب تقديرات أخرى في «ماذا لو؟»', 'Try other grades in What-if'),
      why: t('غيّر التقديرات المتوقعة وشاهد أثرها على معدلك.', 'Change the expected grades and see how your GPA moves.'),
    },
  ];

  return (
    <div className="space-y-6">
      {successToast && (
        <Toast tone="sign" onClose={() => setSuccessToast(null)} closeLabel={t('إغلاق', 'Close')}>
          {successToast}
        </Toast>
      )}

      <PageHeader
        icon={TrendingUp}
        tone={atRisk ? 'signal' : 'sign'}
        title={t('تحسين المعدل التراكمي', 'GPA recovery')}
        description={t(
          'ثلاثة مسارات لرفع معدلك فوق 2.00، كلها تحترم سقف تقدير الإعادة. اعتمد مساراً لتُضاف مقرراته إلى مسودة تسجيلك.',
          'Three routes to lift your GPA above 2.00, all within the retake grade caps. Adopt one and its courses go into your registration draft.'
        )}
        meta={
          adoptedStrategy ? (
            <Chip tone="sign" icon={CheckCircle2}>
              {t(`الخطة الحالية: ${strategyName(adoptedStrategy)}`, `Current plan: ${strategyName(adoptedStrategy)}`)}
            </Chip>
          ) : (
            <Chip tone="ink">{t('لم تعتمد خطة بعد', 'No plan adopted yet')}</Chip>
          )
        }
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => handleNavigate('student-what-if', '/student/what-if')}>
            <GitFork aria-hidden="true" />
            {t('جرّب في «ماذا لو؟»', 'Try it in What-if')}
          </button>
        }
      />

      {/* ── Where you stand ─────────────────────────────────────────────── */}
      <Panel padded={false} className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="px-5 py-6 sm:px-7">
            <span className="text-[12.5px] font-medium text-ink-500">{t('العجز للوصول إلى معدل 2.00', 'Shortfall to a 2.00 GPA')}</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={cn('t-num text-[40px] font-extrabold leading-none', deficitPoints > 0 ? 'text-signal-600' : 'text-sign-700')}>
                {deficitPoints > 0 ? `+${deficitPoints}` : '0'}
              </span>
              <span className="text-[13px] font-medium text-ink-500">{t('نقطة جودة', 'quality points')}</span>
            </div>
            <p className="mt-3 max-w-[52ch] text-[13px] leading-7 text-ink-600">
              {deficitPoints > 0
                ? t(
                    `نقاط الجودة = الساعات × نقاط التقدير. يلزمك ${deficitPoints} نقطة فوق رصيدك الحالي ليصل معدلك إلى 2.00 ويُرفع الإنذار.`,
                    `Quality points = credit hours × grade points. You need ${deficitPoints} more points on top of what you have to reach 2.00 and clear the warning.`
                  )
                : t(
                    'معدلك عند 2.00 أو أعلى، فلا عجز عليك. المسارات أدناه اختيارية لرفع معدلك أكثر.',
                    'Your GPA is at or above 2.00, so there is no shortfall. The routes below are optional ways to raise it further.'
                  )}
            </p>
          </div>
          <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-6 sm:px-7 lg:border-s lg:border-t-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-medium text-ink-500">{t('معدلك الآن على سلم اللائحة', 'Your GPA on the bylaw scale')}</span>
              <span className={cn('t-num text-[22px] font-extrabold', atRisk ? 'text-signal-600' : 'text-ink-950')}>
                {currentGpa.toFixed(2)}
              </span>
            </div>
            <GpaScale gpa={currentGpa} className="mt-3" />
            {student && (
              <p className="mt-3 text-[12px] text-ink-500">
                {t(
                  `محسوب على ${student.completedCredits} ساعة معتمدة منجزة.`,
                  `Based on ${student.completedCredits} completed credit hours.`
                )}
              </p>
            )}
          </div>
        </div>
      </Panel>

      {/* ── Retake caps ─────────────────────────────────────────────────── */}
      <div className="callout callout-caution flex-col sm:flex-row sm:items-center">
        <Scale aria-hidden="true" />
        <p className="flex-1 font-semibold text-caution-800">
          {t('سقف تقدير الإعادة حسب اللائحة؛ كل المسارات أدناه تلتزم به:', 'Retake grade caps from the bylaws; every route below respects them:')}
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="chip chip-caution">
            {t('الإعادة الأولى', '1st retake')} <span className="t-num font-extrabold">B+ (3.2)</span>
          </span>
          <span className="chip chip-caution">
            {t('الإعادة الثانية', '2nd retake')} <span className="t-num font-extrabold">C+ (2.6)</span>
          </span>
          <span className="chip chip-caution">
            {t('بعد ذلك', 'Later retakes')} <span className="t-num font-extrabold">D+ (2.0)</span>
          </span>
        </div>
      </div>

      {/* ── The three routes ────────────────────────────────────────────── */}
      {plans.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Flag}
            tone="sign"
            title={t('لا توجد مسارات مقترحة', 'No routes to suggest')}
            description={t('لا يحتوي سجلك على مقررات تحتاج إعادة لرفع المعدل.', 'Your record has no courses that need retaking to raise your GPA.')}
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          {plans.map(plan => {
            const meta = STRATEGY_META[plan.strategy] || { ar: plan.titleAr, en: plan.titleEn, tone: 'ink' as Tone };
            const effort = EFFORT_META[plan.riskLevel];
            const isRecommended = plan.strategy === 'Balanced';
            const isAdopted = adoptedStrategy === plan.strategy;
            const gain = plan.projectedGpa - currentGpa;
            const semesters = Math.max(1, plan.semestersNeeded || 1);

            return (
              <article
                key={plan.strategy}
                className={cn(
                  'panel stripe-start flex flex-col overflow-hidden',
                  isAdopted ? 'border-sign-600 ring-2 ring-sign-600/15' : isRecommended ? 'border-route-400 ring-2 ring-route-400/25' : ''
                )}
                style={{ ['--stripe' as any]: toneColor[meta.tone] }}
                aria-label={language === 'ar' ? plan.titleAr : plan.titleEn}
              >
                {(isAdopted || isRecommended) && (
                  <div
                    className={cn(
                      'flex items-center gap-1.5 px-5 py-2 text-[12.5px] font-bold',
                      isAdopted ? 'bg-sign-600 text-white' : 'bg-route-400 text-ink-950'
                    )}
                  >
                    {isAdopted ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Flag className="h-4 w-4" aria-hidden="true" />}
                    {isAdopted ? t('خطتك الحالية', 'Your active plan') : t('الموصى به لوضعك', 'Recommended for you')}
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-[12.5px] font-bold', toneText[meta.tone])}>
                        {language === 'ar' ? meta.ar : meta.en}
                      </span>
                      {effort && <span className={chipClass[effort.tone]}>{language === 'ar' ? effort.ar : effort.en}</span>}
                    </div>
                    <h2 className="mt-1 text-[17px] font-bold leading-7 text-ink-950">{language === 'ar' ? plan.titleAr : plan.titleEn}</h2>
                    <p className="mt-1 text-[13px] leading-6 text-ink-600">{language === 'ar' ? plan.descriptionAr : plan.descriptionEn}</p>
                  </div>

                  {/* The route itself: now → each term → projected GPA */}
                  <div className="rounded-xl border border-ink-100 bg-ink-50 px-4 pb-3 pt-4">
                    <div className="relative flex items-center justify-between" aria-hidden="true">
                      <span className="absolute inset-x-1 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: toneColor[meta.tone] }} />
                      <span className="relative z-[1] h-3.5 w-3.5 rounded-full border-[3px] bg-white" style={{ borderColor: toneColor[meta.tone] }} />
                      {Array.from({ length: semesters - 1 }).map((_, i) => (
                        <span key={i} className="relative z-[1] h-3 w-3 rounded-full border-2 border-white" style={{ background: toneColor[meta.tone] }} />
                      ))}
                      <span className="relative z-[1] h-5 w-5 rounded-full border-[3px] border-white shadow-[0_0_0_2px_var(--color-ink-900)] bg-route-400" />
                    </div>
                    <div className="mt-2 flex items-start justify-between text-[11.5px]">
                      <span className="text-ink-500">
                        {t('الآن', 'Now')} <span className="t-num font-bold text-ink-800">{currentGpa.toFixed(2)}</span>
                      </span>
                      <span className="text-center text-ink-500">
                        {t(`${plan.semestersNeeded} ${plan.semestersNeeded === 1 ? 'فصل' : 'فصول'}`, `${plan.semestersNeeded} term${plan.semestersNeeded === 1 ? '' : 's'}`)}
                      </span>
                      <span className="text-end text-ink-500">
                        {t('المتوقع', 'Projected')} <span className="t-num font-bold text-ink-950">{plan.projectedGpa.toFixed(2)}</span>
                      </span>
                    </div>
                  </div>

                  <dl className="grid grid-cols-3 gap-3 text-center">
                    <div className="kv items-center">
                      <dt>{t('المعدل المتوقع', 'Projected GPA')}</dt>
                      <dd className={cn('t-num !text-[18px]', plan.projectedGpa >= 2 ? 'text-sign-700' : 'text-signal-600')}>{plan.projectedGpa.toFixed(2)}</dd>
                    </div>
                    <div className="kv items-center">
                      <dt>{t('الفرق', 'Change')}</dt>
                      <dd className={cn('t-num !text-[18px]', gain > 0 ? 'text-sign-700' : gain < 0 ? 'text-signal-600' : 'text-ink-700')}>
                        {gain > 0 ? '+' : gain < 0 ? '−' : '±'}
                        {Math.abs(gain).toFixed(2)}
                      </dd>
                    </div>
                    <div className="kv items-center">
                      <dt>{t('الساعات', 'Credits')}</dt>
                      <dd className="t-num !text-[18px]">{plan.creditHoursTotal}</dd>
                    </div>
                  </dl>

                  <div>
                    <p className="mb-2 text-[12.5px] font-semibold text-ink-700">{t('المقررات والتقدير المستهدف', 'Courses and target grades')}</p>
                    {plan.courses.length === 0 ? (
                      <p className="rounded-lg bg-ink-50 px-3 py-2.5 text-[12.5px] text-ink-500">
                        {t('لا مقررات تحتاج إعادة في هذا المسار.', 'No courses to retake on this route.')}
                      </p>
                    ) : (
                      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                        {plan.courses.map((c, cIdx) => (
                          <li key={`${c.courseCode}_${cIdx}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <CodeBadge code={c.courseCode} variant={c.isRetake ? 'signal' : 'soft'} />
                              <span className="truncate text-[13px] font-medium text-ink-800" title={language === 'ar' ? c.courseNameAr : c.courseNameEn}>
                                {language === 'ar' ? c.courseNameAr : c.courseNameEn}
                              </span>
                            </div>
                            <div className="flex shrink-0 flex-col items-end">
                              <span className="flex items-center gap-1.5" dir="ltr">
                                {c.currentGrade && <span className="t-num text-[12px] font-semibold text-signal-500 line-through">{c.currentGrade}</span>}
                                <span className="text-ink-300" aria-hidden="true">
                                  ›
                                </span>
                                <span className={cn(chipClass[gradeTone(c.targetGrade)], 't-num font-extrabold')}>{c.targetGrade}</span>
                              </span>
                              <span className="text-[11px] text-ink-500">
                                {t('السقف', 'Cap')} <span className="t-num font-semibold">{c.maxPossibleGrade}</span>
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-auto pt-1">
                    <button
                      type="button"
                      onClick={() => handleApplyPlan(plan)}
                      className={cn('btn btn-block', isAdopted ? 'btn-soft' : isRecommended ? 'btn-primary' : 'btn-secondary')}
                    >
                      {isAdopted ? <CheckCircle2 aria-hidden="true" /> : <Flag aria-hidden="true" />}
                      {isAdopted ? t('عرض خطوات هذه الخطة', 'Show this plan’s next steps') : t('اعتمد هذا المسار', 'Adopt this route')}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Adoption dialog ─────────────────────────────────────────────── */}
      {activeModalPlan && (
        <Modal
          onClose={() => setActiveModalPlan(null)}
          size="lg"
          icon={CheckCircle2}
          tone="sign"
          title={t('اعتمدت خطة تحسين المعدل', 'GPA recovery plan adopted')}
          subtitle={language === 'ar' ? activeModalPlan.titleAr : activeModalPlan.titleEn}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <button type="button" onClick={() => setActiveModalPlan(null)} className="btn btn-ghost">
              {t('ابقَ في هذه الصفحة', 'Stay on this page')}
            </button>
          }
        >
          <dl className="grid grid-cols-3 gap-3 rounded-xl border border-ink-200 bg-ink-50 p-4 text-center">
            <div className="kv items-center">
              <dt>{t('المعدل المتوقع', 'Projected GPA')}</dt>
              <dd className="t-num !text-[18px] text-sign-700">{activeModalPlan.projectedGpa.toFixed(2)}</dd>
            </div>
            <div className="kv items-center">
              <dt>{t('إجمالي الساعات', 'Total credits')}</dt>
              <dd className="t-num !text-[18px]">{activeModalPlan.creditHoursTotal}</dd>
            </div>
            <div className="kv items-center">
              <dt>{t('المدة', 'Duration')}</dt>
              <dd className="!text-[18px]">
                <span className="t-num">{activeModalPlan.semestersNeeded}</span>{' '}
                {t(activeModalPlan.semestersNeeded === 1 ? 'فصل' : 'فصول', activeModalPlan.semestersNeeded === 1 ? 'term' : 'terms')}
              </dd>
            </div>
          </dl>

          {activeModalPlan.courses.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] font-bold text-ink-900">{t('المقررات التي أُضيفت إلى مسودة تسجيلك', 'Courses added to your registration draft')}</p>
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {activeModalPlan.courses.map((c, idx) => (
                  <li key={`${c.courseCode}_${idx}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <CodeBadge code={c.courseCode} />
                      <span className="truncate text-[13px] font-medium text-ink-800">{language === 'ar' ? c.courseNameAr : c.courseNameEn}</span>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5" dir="ltr">
                      {c.currentGrade && <span className="t-num text-[12px] font-semibold text-signal-500 line-through">{c.currentGrade}</span>}
                      <span className="text-ink-300" aria-hidden="true">
                        ›
                      </span>
                      <span className={cn(chipClass[gradeTone(c.targetGrade)], 't-num font-extrabold')}>{c.targetGrade}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <PanelHeader title={t('خطوتك التالية', 'Your next step')} className="!mb-2" />
            <ul className="-mx-2 space-y-1">
              {nextSteps.map(step => {
                const Icon = step.icon;
                return (
                  <li key={step.tab}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModalPlan(null);
                        handleNavigate(step.tab, step.path);
                      }}
                      className={cn(
                        'group flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-start transition',
                        step.primary ? 'bg-sign-50 hover:bg-sign-100' : 'hover:bg-ink-50'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                          step.primary ? 'bg-sign-600 text-white' : 'bg-ink-100 text-ink-700'
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-bold text-ink-900">{step.title}</span>
                        <span className="block text-[12.5px] leading-5 text-ink-500">{step.why}</span>
                      </span>
                      <Chevron className="mt-2 h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-ink-700" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
};
