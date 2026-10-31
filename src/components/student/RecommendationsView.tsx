import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { CourseRecommendation } from '../../types/index.js';
import {
  PageHeader,
  Panel,
  Chip,
  CodeBadge,
  Meter,
  Loader,
  EmptyState,
  Segmented,
  cn,
  toneColor,
  toneText,
  type Tone,
  type Bilingual,
} from '../ui/index.js';
import { Signpost, CheckCircle2, AlertCircle, KeyRound, Users, Flame, Plus, Check, CalendarCheck } from 'lucide-react';

interface RecommendationsViewProps {
  onNavigateTab: (tab: string) => void;
}

type PriorityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM';

const priorityTone: Record<string, Tone> = {
  CRITICAL: 'signal',
  HIGH: 'caution',
  MEDIUM: 'lane',
  NORMAL: 'ink',
};

const priorityLabel: Record<string, Bilingual> = {
  CRITICAL: { ar: 'أولوية قصوى', en: 'Top priority' },
  HIGH: { ar: 'أولوية مرتفعة', en: 'High priority' },
  MEDIUM: { ar: 'أولوية متوسطة', en: 'Medium priority' },
  NORMAL: { ar: 'أولوية عادية', en: 'Normal priority' },
};

const priorityWhy: Record<string, Bilingual> = {
  CRITICAL: { ar: 'إعادة مقرر راسب لرفع المعدل', en: 'Retake of a failed course to lift your GPA' },
  HIGH: { ar: 'مقرر مفتاحي يفتح مقررات أخرى', en: 'A gateway course that unlocks others' },
  MEDIUM: { ar: 'متطلب أساسي للتخرج', en: 'A core graduation requirement' },
  NORMAL: { ar: 'مناسب لخطتك', en: 'Fits your plan' },
};

export const RecommendationsView: React.FC<RecommendationsViewProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [recommendations, setRecommendations] = useState<CourseRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [addedCourses, setAddedCourses] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadRecs() {
      const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
      try {
        setLoading(true);
        const data = await api.getRecommendations(studentId);
        setRecommendations(data);
      } catch (err) {
        console.error('Failed to load recommendations:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRecs();
  }, [currentUser]);

  const handleAddToPlan = (code: string) => {
    setAddedCourses(prev => {
      const next = new Set(prev).add(code);
      try {
        const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
        const existing = JSON.parse(localStorage.getItem(`staged_recovery_courses_${studentId}`) || '[]');
        const updated = Array.from(new Set([...existing, ...Array.from(next)]));
        localStorage.setItem(`staged_recovery_courses_${studentId}`, JSON.stringify(updated));
        localStorage.setItem('staged_recovery_courses', JSON.stringify(updated));
      } catch {}
      return next;
    });
  };

  const filtered = filterPriority === 'ALL' ? recommendations : recommendations.filter(r => r.priority === filterPriority);

  if (loading) {
    return <Loader label={t('جارٍ ترتيب المقررات المناسبة لك…', 'Ranking the courses that suit you…')} />;
  }

  const countOf = (p: string) => recommendations.filter(r => r.priority === p).length;
  const totalCredits = recommendations.reduce((sum, r) => sum + (r.credits || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Signpost}
        title={t('المقررات المقترحة لك', 'Suggested courses')}
        description={t(
          'مرتبة حسب أهميتها لوضعك: المقررات التي رسبت فيها أولاً، ثم المقررات التي تفتح غيرها. كل اقتراح اجتاز فحص اللائحة والمتطلبات السابقة قبل أن يظهر هنا.',
          'Ranked by how much each course matters for you: courses you failed come first, then courses that unlock others. Every suggestion has passed the bylaw and prerequisite checks.'
        )}
        meta={
          recommendations.length > 0 ? (
            <>
              <Chip tone="ink">{t(`${recommendations.length} مقررات`, `${recommendations.length} courses`)}</Chip>
              <Chip tone="ink">{t(`${totalCredits} ساعة معتمدة`, `${totalCredits} credit hours`)}</Chip>
              {countOf('CRITICAL') > 0 && (
                <Chip tone="signal" icon={Flame}>
                  {t(`${countOf('CRITICAL')} إعادة مطلوبة`, `${countOf('CRITICAL')} retake${countOf('CRITICAL') === 1 ? '' : 's'} needed`)}
                </Chip>
              )}
            </>
          ) : undefined
        }
      />

      {recommendations.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Signpost}
            title={t('لا توجد مقررات مقترحة الآن', 'No suggestions right now')}
            description={t(
              'لم نجد مقررات مطروحة تستوفي متطلباتها حالياً. راجع خطة التخرج أو تواصل مع مرشدك الأكاديمي.',
              'No offered course currently meets its prerequisites for you. Check your study plan or contact your academic advisor.'
            )}
            action={
              <button type="button" onClick={() => onNavigateTab('student-study-plan')} className="btn btn-secondary">
                {t('افتح خطة التخرج', 'Open study plan')}
              </button>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented<PriorityFilter>
              ariaLabel={t('تصفية حسب الأولوية', 'Filter by priority')}
              value={filterPriority as PriorityFilter}
              onChange={v => setFilterPriority(v)}
              options={[
                { value: 'ALL', label: t('الكل', 'All'), count: recommendations.length },
                { value: 'CRITICAL', label: t('قصوى', 'Top'), count: countOf('CRITICAL') },
                { value: 'HIGH', label: t('مرتفعة', 'High'), count: countOf('HIGH') },
                { value: 'MEDIUM', label: t('متوسطة', 'Medium'), count: countOf('MEDIUM') },
              ]}
            />
            <p className="text-[12.5px] text-ink-500">
              {t('الشريط الملون بجانب كل مقرر يدل على أولويته.', 'The coloured bar beside each course shows its priority.')}
            </p>
          </div>

          {filtered.length === 0 ? (
            <Panel>
              <EmptyState
                icon={Signpost}
                title={t('لا توجد مقررات بهذه الأولوية', 'No courses with this priority')}
                description={t('اختر أولوية أخرى أو اعرض كل المقررات المقترحة.', 'Pick another priority or show every suggested course.')}
                action={
                  <button type="button" onClick={() => setFilterPriority('ALL')} className="btn btn-secondary btn-sm">
                    {t('اعرض الكل', 'Show all')}
                  </button>
                }
              />
            </Panel>
          ) : (
            <ol className="space-y-3" aria-label={t('المقررات المقترحة مرتبة', 'Suggested courses, ranked')}>
              {filtered.map((rec, idx) => {
                const rank = recommendations.indexOf(rec) + 1;
                const tone = priorityTone[rec.priority] || 'ink';
                const isAdded = addedCourses.has(rec.courseCode);
                const reasons = language === 'ar' ? rec.reasonsAr : rec.reasonsEn;
                const offered = rec.capacity > 0;
                const fewSeats = offered && rec.availableSeats <= 3;
                const name = language === 'ar' ? rec.courseNameAr : rec.courseNameEn;
                return (
                  <li
                    key={`${rec.courseCode}_${idx}`}
                    className="panel stripe-start grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-4 p-4 sm:grid-cols-[3rem_minmax(0,1fr)] sm:p-5 lg:grid-cols-[3rem_minmax(0,1fr)_15rem]"
                    style={{ ['--stripe' as any]: toneColor[tone] }}
                  >
                    {/* Rank */}
                    <div className="pt-0.5 text-center">
                      <span className={cn('t-num block text-[26px] font-extrabold leading-none', toneText[tone])}>{rank}</span>
                      <span className="mt-1 block text-[11px] text-ink-400">{t('الترتيب', 'rank')}</span>
                    </div>

                    {/* Course + reasons */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CodeBadge code={rec.courseCode} variant={rec.isRetake ? 'signal' : 'solid'} />
                        <h2 className="text-[15.5px] font-bold leading-7 text-ink-950">{name}</h2>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Chip tone={tone}>{language === 'ar' ? priorityLabel[rec.priority]?.ar : priorityLabel[rec.priority]?.en}</Chip>
                        {rec.isRetake && (
                          <Chip tone="signal" icon={Flame}>
                            {t('إعادة مقرر', 'Retake')}
                          </Chip>
                        )}
                        <Chip tone="ink">{rec.isMandatory ? t('إجباري', 'Required') : t('اختياري', 'Elective')}</Chip>
                        <span className="text-[12.5px] text-ink-500">
                          {t(`${rec.credits} ساعات معتمدة`, `${rec.credits} credit hours`)}
                          <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                          {language === 'ar' ? priorityWhy[rec.priority]?.ar : priorityWhy[rec.priority]?.en}
                        </span>
                      </div>

                      {reasons.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[12.5px] font-semibold text-ink-700">{t('لماذا هذا المقرر؟', 'Why this course?')}</p>
                          <ul className="mt-1.5 space-y-1">
                            {reasons.map((reason, i) => (
                              <li key={i} className="flex items-start gap-2 text-[13px] leading-6 text-ink-700">
                                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: toneColor[tone] }} aria-hidden="true" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(rec.impactAr || rec.impactEn) && (
                        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[12.5px] leading-6 text-ink-700">
                          <span className="font-semibold text-ink-900">{t('أثره على تخرجك: ', 'Effect on graduation: ')}</span>
                          {language === 'ar' ? rec.impactAr : rec.impactEn}
                        </p>
                      )}
                    </div>

                    {/* Facts + action */}
                    <div className="col-span-2 flex flex-col gap-3 border-t border-ink-100 pt-4 lg:col-span-1 lg:border-s lg:border-t-0 lg:ps-5 lg:pt-0">
                      <div>
                        <div className="flex items-baseline justify-between text-[12.5px]">
                          <span className="text-ink-500">{t('درجة الملاءمة', 'Fit score')}</span>
                          <span className="t-num font-bold text-ink-900">
                            {rec.score}
                            <span className="font-medium text-ink-400"> / 100</span>
                          </span>
                        </div>
                        <Meter value={rec.score} tone={tone} className="mt-1.5" label={t('درجة الملاءمة', 'Fit score')} />
                      </div>

                      <dl className="space-y-1.5 text-[12.5px]">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="inline-flex items-center gap-1.5 text-ink-500">
                            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('يفتح', 'Unlocks')}
                          </dt>
                          <dd className="font-semibold text-ink-800">
                            {rec.unlocksCount > 0 ? t(`${rec.unlocksCount} مقررات`, `${rec.unlocksCount} course${rec.unlocksCount === 1 ? '' : 's'}`) : t('لا شيء', 'None')}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="inline-flex items-center gap-1.5 text-ink-500">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('المقاعد', 'Seats')}
                          </dt>
                          <dd className={cn('font-semibold', !offered || fewSeats ? 'text-signal-600' : 'text-ink-800')}>
                            {offered ? (
                              <span className="t-num">
                                {rec.availableSeats} / {rec.capacity}
                              </span>
                            ) : (
                              t('لا شعبة مطروحة', 'No section offered')
                            )}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-ink-500">{t('المتطلبات السابقة', 'Prerequisites')}</dt>
                          <dd>
                            {rec.prerequisitesMet ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-sign-700">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('مستوفاة', 'Met')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-semibold text-caution-700">
                                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('غير مستوفاة', 'Not met')}
                              </span>
                            )}
                          </dd>
                        </div>
                      </dl>

                      <button
                        type="button"
                        disabled={!rec.prerequisitesMet || isAdded}
                        onClick={() => handleAddToPlan(rec.courseCode)}
                        className={cn('btn btn-block mt-auto', isAdded ? 'btn-soft disabled:opacity-100' : 'btn-primary')}
                        aria-label={
                          isAdded
                            ? t(`${rec.courseCode} أضيف إلى خطتك`, `${rec.courseCode} added to your plan`)
                            : t(`أضف ${rec.courseCode} إلى خطتك`, `Add ${rec.courseCode} to your plan`)
                        }
                      >
                        {isAdded ? (
                          <>
                            <Check aria-hidden="true" />
                            {t('أضيف إلى خطتك', 'Added to your plan')}
                          </>
                        ) : rec.prerequisitesMet ? (
                          <>
                            <Plus aria-hidden="true" />
                            {t('أضف إلى خطتي', 'Add to my plan')}
                          </>
                        ) : (
                          t('يحتاج متطلباً سابقاً', 'Needs a prerequisite first')
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      {/* Staged courses: carry them to registration */}
      {addedCourses.size > 0 && (
        <div
          role="status"
          className="no-print sticky bottom-4 z-30 flex flex-col gap-3 rounded-2xl bg-ink-950 px-4 py-3.5 text-white shadow-[0_18px_40px_-16px_rgb(0_0_0/0.55)] animate-rise-in sm:flex-row sm:items-center sm:justify-between sm:px-5"
        >
          <div className="flex items-center gap-3">
            <span className="t-num grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-route-400 text-[15px] font-extrabold text-ink-950">
              {addedCourses.size}
            </span>
            <div>
              <p className="text-[13.5px] font-bold">
                {t(
                  `أضفت ${addedCourses.size} ${addedCourses.size === 1 ? 'مقرراً' : 'مقررات'} إلى مسودة تسجيلك`,
                  `${addedCourses.size} course${addedCourses.size === 1 ? '' : 's'} added to your registration draft`
                )}
              </p>
              <p className="text-[12.5px] text-white/65">
                {t('ستجدها جاهزة في صفحة التسجيل لتختار الشعب وتتأكد من خلو الجدول من التعارض.', 'They will be waiting on the registration page, where you pick sections and check for clashes.')}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => onNavigateTab('student-registration')} className="btn btn-accent shrink-0">
            <CalendarCheck aria-hidden="true" />
            {t('اذهب إلى التسجيل', 'Go to registration')}
          </button>
        </div>
      )}
    </div>
  );
};
