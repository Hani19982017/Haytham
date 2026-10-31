import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Course, CourseOffering, PlannedCourse, PlannedSemester, Student, StudyPlan } from '../../types/index.js';
import { INSTITUTION } from '../../config/institution.js';
import {
  PageHeader,
  Panel,
  Chip,
  CodeBadge,
  Meter,
  Loader,
  EmptyState,
  Segmented,
  Modal,
  cn,
  chipClass,
  planStatusTone,
  planStatusLabel,
  personName,
  pick,
} from '../ui/index.js';
import {
  Route,
  Printer,
  RotateCcw,
  Send,
  PencilLine,
  CheckCircle2,
  X,
  CalendarCheck,
  Flame,
  BookOpen,
  AlertTriangle,
  Info,
  KeyRound,
  Check,
  Clock,
  MessageSquareText,
} from 'lucide-react';

interface StudyPlanViewProps {
  onNavigateTab?: (tab: string) => void;
}

type Pace = 'NORMAL' | 'LIGHT' | 'HEAVY' | 'INCLUDE_SUMMER';
type TermFilter = 'ALL' | 'YEAR_1' | 'YEAR_2' | 'SUMMER';

export const StudyPlanView: React.FC<StudyPlanViewProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [pace, setPace] = useState<Pace>('NORMAL');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [activeCourseModal, setActiveCourseModal] = useState<PlannedCourse | null>(null);
  const [filterTerm, setFilterTerm] = useState<TermFilter>('ALL');

  const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';

  const loadPlan = async (requestedPace = pace, forceRegen = false) => {
    try {
      setLoading(true);
      const [planData, studentData, coursesData, offeringsData] = await Promise.all([
        api.getStudyPlan(studentId, requestedPace, forceRegen),
        api.getStudentById(studentId),
        api.getCourses(),
        api.getOfferings(),
      ]);
      setPlan(planData);
      setStudent(studentData);
      setAllCourses(coursesData);
      setOfferings(offeringsData);
    } catch (err) {
      console.error('Failed to load study plan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan(pace, false);
  }, [currentUser]);

  const handlePaceChange = (newPace: Pace) => {
    setPace(newPace);
    // The summer filter only exists for the summer pace.
    if (newPace !== 'INCLUDE_SUMMER' && filterTerm === 'SUMMER') setFilterTerm('ALL');
    loadPlan(newPace, true);
  };

  const handleRegeneratePlan = () => {
    loadPlan(pace, true);
  };

  const handleSubmitPlan = async () => {
    try {
      setSubmitting(true);
      const res = await api.submitStudyPlan(studentId, pace, plan || undefined);
      if (res.success) {
        setSubmittedSuccess(true);
        if (plan) {
          setPlan({ ...plan, status: 'Pending Review' });
        }
        setTimeout(() => setSubmittedSuccess(false), 5000);
      }
    } catch (err) {
      console.error('Error submitting plan:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetToDraft = async () => {
    try {
      setSubmitting(true);
      const res = await api.resetStudyPlan(studentId, pace);
      if (res.success && res.plan) {
        setPlan(res.plan);
      } else {
        await loadPlan(pace, true);
      }
    } catch (err) {
      console.error('Error resetting plan to draft:', err);
      await loadPlan(pace, true);
    } finally {
      setSubmitting(false);
    }
  };

  const goToRegistration = () => {
    if (onNavigateTab) {
      onNavigateTab('student-registration');
    } else {
      navigate('/student/registration');
    }
  };

  const handleRegisterSemesterCourses = (sem: PlannedSemester) => {
    try {
      const courseCodes = sem.courses.map(c => c.courseCode);
      localStorage.setItem(`staged_recovery_courses_${studentId}`, JSON.stringify(courseCodes));
      localStorage.setItem('staged_recovery_courses', JSON.stringify(courseCodes));
    } catch {}
    goToRegistration();
  };

  const handleEnrolSingleCourse = (course: PlannedCourse) => {
    try {
      localStorage.setItem(`staged_recovery_courses_${studentId}`, JSON.stringify([course.courseCode]));
      localStorage.setItem('staged_recovery_courses', JSON.stringify([course.courseCode]));
    } catch {}
    setActiveCourseModal(null);
    goToRegistration();
  };

  const handlePrint = () => {
    window.print();
  };

  // Catalogue details for the course open in the dialog
  const selectedCourseDetails = activeCourseModal ? allCourses.find(c => c.code === activeCourseModal.courseCode) : null;
  const unlockedCourses = activeCourseModal
    ? allCourses.filter(c => c.prerequisites && c.prerequisites.includes(activeCourseModal.courseCode))
    : [];

  const filteredSemesters = (plan?.semesters || []).filter(sem => {
    if (filterTerm === 'ALL') return true;
    if (filterTerm === 'YEAR_1') return sem.semesterIndex <= 2;
    if (filterTerm === 'YEAR_2') return sem.semesterIndex >= 3 && sem.semesterIndex <= 4;
    if (filterTerm === 'SUMMER') return sem.type === 'SUMMER';
    return true;
  });

  // First load: nothing to show yet.
  if (loading && !plan) {
    return <Loader label={t('جارٍ توزيع المقررات المتبقية على الفصول حتى التخرج…', 'Spreading your remaining courses across terms until graduation…')} />;
  }

  if (!plan) {
    return (
      <Panel>
        <EmptyState
          icon={AlertTriangle}
          tone="caution"
          title={t('تعذر تحميل خطة التخرج', 'Your study plan could not be loaded')}
          description={t('الخادم لم يرد. تأكد من الاتصال ثم أعد المحاولة.', 'The server did not respond. Check the connection and try again.')}
          action={
            <button type="button" onClick={() => loadPlan(pace, false)} className="btn btn-primary">
              <RotateCcw aria-hidden="true" />
              {t('إعادة المحاولة', 'Try again')}
            </button>
          }
        />
      </Panel>
    );
  }

  const totalDegreeCredits = INSTITUTION.totalCredits;
  const completedCredits = student?.completedCredits ?? 0;
  const remainingHours = Math.max(0, totalDegreeCredits - completedCredits);
  const completedPct = Math.round((completedCredits / totalDegreeCredits) * 100);
  const lastSemester = plan.semesters[plan.semesters.length - 1];
  const graduationGpa = typeof lastSemester?.expectedGpa === 'number' ? lastSemester.expectedGpa : null;
  const expectedGraduation = language === 'ar' ? plan.expectedGraduationSemesterAr : plan.expectedGraduationSemesterEn;
  const isLocked = plan.status === 'Approved' || plan.status === 'Pending Review';
  const advisorName = personName(student?.advisorName, language) || t('مرشدك الأكاديمي', 'your academic advisor');
  const statusTone = planStatusTone[plan.status] || 'ink';

  // Borders between the figure cells, for 1 / 2 / 3–4 columns.
  const cellBorder = ['', 'border-t sm:border-t-0 sm:border-s', 'border-t lg:border-t-0 lg:border-s', 'border-t sm:border-s lg:border-t-0'];

  const figures: Array<{ label: string; value: React.ReactNode; hint: React.ReactNode }> = [
    {
      label: t('الساعات المنجزة', 'Credits completed'),
      value: (
        <>
          {completedCredits}
          <span className="text-[13px] font-medium text-ink-500"> / {totalDegreeCredits}</span>
        </>
      ),
      hint: <Meter value={completedPct} tone="sign" label={t('نسبة الإنجاز', 'Progress')} className="mt-1" />,
    },
    {
      label: t('الساعات المتبقية في الخطة', 'Credits left in the plan'),
      value: plan.totalPlannedCredits,
      hint: t(`تغطي ${remainingHours} ساعة متبقية للتخرج`, `Covers the ${remainingHours} credit hours you still need`),
    },
    {
      label: t('فصول حتى التخرج', 'Terms to graduation'),
      value: plan.semesters.length,
      hint: (
        <>
          {t('التخرج المتوقع:', 'Expected graduation:')} <span className="font-bold text-sign-700">{expectedGraduation}</span>
        </>
      ),
    },
  ];
  if (graduationGpa !== null) {
    figures.push({
      label: t('المعدل المتوقع عند التخرج', 'Expected GPA at graduation'),
      value: graduationGpa.toFixed(2),
      hint: t('حسب التقديرات المتوقعة لفصول الخطة', 'Based on the grades expected in the planned terms'),
    });
  }

  const paceOptions = [
    { value: 'NORMAL' as Pace, label: t('عادي (18 ساعة)', 'Normal (18 cr)') },
    { value: 'LIGHT' as Pace, label: t('خفيف (12–15 ساعة)', 'Light (12–15 cr)') },
    { value: 'INCLUDE_SUMMER' as Pace, label: t('مع الفصول الصيفية', 'With summer terms') },
  ];

  const termOptions = [
    { value: 'ALL' as TermFilter, label: t('كل الفصول', 'All terms') },
    { value: 'YEAR_1' as TermFilter, label: t('السنة الحالية', 'This year') },
    { value: 'YEAR_2' as TermFilter, label: t('السنة القادمة', 'Next year') },
    ...(pace === 'INCLUDE_SUMMER' ? [{ value: 'SUMMER' as TermFilter, label: t('الصيف فقط', 'Summers only') }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Printed letterhead (print only) */}
      <div className="hidden border-b-2 border-ink-900 pb-4 print:block">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[15px] font-extrabold">{language === 'ar' ? INSTITUTION.universityAr : INSTITUTION.universityEn}</p>
            <p className="text-[13px] font-semibold">{language === 'ar' ? INSTITUTION.facultyAr : INSTITUTION.facultyEn}</p>
            <p className="mt-1 text-[13px]">
              {t('الخطة الدراسية حتى التخرج', 'Study plan to graduation')} ({language === 'ar' ? INSTITUTION.programAr : INSTITUTION.programEn})
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
            <dt className="text-ink-500">{t('الطالب', 'Student')}</dt>
            <dd className="font-bold">{student ? personName(language === 'ar' ? student.nameAr : student.nameEn, language) : '—'}</dd>
            <dt className="text-ink-500">{t('الرقم الجامعي', 'Student code')}</dt>
            <dd className="font-bold">{student?.studentCode || '—'}</dd>
            <dt className="text-ink-500">{t('المعدل التراكمي', 'Cumulative GPA')}</dt>
            <dd className="font-bold">{student ? student.cumulativeGpa.toFixed(2) : '—'}</dd>
            <dt className="text-ink-500">{t('المرشد الأكاديمي', 'Academic advisor')}</dt>
            <dd className="font-bold">{student ? personName(student.advisorName, language) : '—'}</dd>
            <dt className="text-ink-500">{t('حالة الخطة', 'Plan status')}</dt>
            <dd className="font-bold">{pick(language, planStatusLabel[plan.status], plan.status)}</dd>
          </dl>
        </div>
      </div>

      <PageHeader
        icon={Route}
        title={t('خطة التخرج', 'Study plan to graduation')}
        description={t(
          'المقررات المتبقية موزعة على الفصول القادمة بترتيب يحترم المتطلبات السابقة وحد الساعات لكل فصل.',
          'Your remaining courses, spread over the coming terms in an order that respects prerequisites and each term’s credit limit.'
        )}
        meta={
          <>
            <span className={chipClass[statusTone]}>{pick(language, planStatusLabel[plan.status], plan.status)}</span>
            <Chip tone="ink" icon={CalendarCheck}>
              {t(`التخرج المتوقع: ${expectedGraduation}`, `Expected graduation: ${expectedGraduation}`)}
            </Chip>
          </>
        }
        actions={
          <>
            <button type="button" onClick={handlePrint} className="btn btn-secondary">
              <Printer aria-hidden="true" />
              {t('طباعة الخطة', 'Print plan')}
            </button>
            <button type="button" onClick={handleRegeneratePlan} disabled={submitting || loading} className="btn btn-secondary">
              <RotateCcw aria-hidden="true" />
              {t('أعد التوزيع', 'Rebuild plan')}
            </button>
            {isLocked ? (
              <button type="button" onClick={handleResetToDraft} disabled={submitting} className="btn btn-soft">
                <PencilLine aria-hidden="true" />
                {t('أعدها مسودة للتعديل', 'Reopen as a draft')}
              </button>
            ) : (
              <button type="button" onClick={handleSubmitPlan} disabled={submitting} className="btn btn-primary">
                <Send aria-hidden="true" className="rtl:-scale-x-100" />
                {submitting ? t('جارٍ الإرسال…', 'Sending…') : t('أرسل الخطة للمرشد', 'Send to advisor')}
              </button>
            )}
          </>
        }
      />

      {submittedSuccess && (
        <div className="callout callout-sign print:hidden" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div className="flex-1">
            <p className="font-bold">{t('أُرسلت خطتك إلى المرشد الأكاديمي.', 'Your plan was sent to your academic advisor.')}</p>
            <p>
              {t(
                `أُبلغ ${advisorName} بمراجعة الخطة واعتمادها، وسيصلك إشعار عند صدور القرار.`,
                `${advisorName} has been asked to review and approve it; you will get a notification when they decide.`
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSubmittedSuccess(false)}
            className="-m-1 h-8 w-8 shrink-0 rounded-lg p-1.5 text-sign-700 transition hover:bg-sign-100"
            aria-label={t('إغلاق الرسالة', 'Dismiss message')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {plan.advisorNotes && (
        <div className={cn('callout print:hidden', plan.status === 'Rejected' ? 'callout-signal' : 'callout-lane')}>
          <MessageSquareText aria-hidden="true" />
          <div>
            <p className="font-bold">
              {plan.status === 'Rejected'
                ? t('طلب مرشدك تعديلات على الخطة', 'Your advisor asked for changes')
                : t('ملاحظات مرشدك على الخطة', 'Your advisor’s notes on the plan')}
            </p>
            <p>{plan.advisorNotes}</p>
          </div>
        </div>
      )}

      {/* Pace + term filter */}
      <Panel className="print:hidden">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="field-label">{t('سرعة الخطة', 'Plan pace')}</p>
            <Segmented<Pace> ariaLabel={t('سرعة الخطة', 'Plan pace')} value={pace} onChange={handlePaceChange} options={paceOptions} />
          </div>
          <div>
            <p className="field-label">{t('عرض', 'Show')}</p>
            <Segmented<TermFilter> ariaLabel={t('الفصول المعروضة', 'Terms shown')} value={filterTerm} onChange={setFilterTerm} options={termOptions} />
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-6 text-ink-500">
          <Info className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t(
            'اضغط على أي مقرر لترى متطلباته السابقة والمقررات التي يفتحها، ويمكنك نقل مقررات الفصل القادم إلى التسجيل مباشرة.',
            'Select any course to see its prerequisites and what it unlocks. You can carry next term’s courses straight to registration.'
          )}
        </p>
      </Panel>

      {/* Figures */}
      <Panel padded={false} className={cn('grid grid-cols-1 overflow-hidden sm:grid-cols-2 print:hidden', figures.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        {figures.map((f, i) => (
          <div key={f.label} className={cn('border-ink-100 px-5 py-4', cellBorder[i])}>
            <span className="text-[12.5px] font-medium text-ink-500">{f.label}</span>
            <div className="t-num mt-1 text-[28px] font-extrabold leading-tight text-ink-950">{f.value}</div>
            <div className="mt-1.5 text-[12px] leading-5 text-ink-500">{f.hint}</div>
          </div>
        ))}
      </Panel>

      {/* The route, term by term */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-[2] grid place-items-start justify-center rounded-2xl bg-platform/70 pt-16 backdrop-blur-[1px]">
            <Loader compact label={t('جارٍ تحديث الخطة…', 'Updating the plan…')} />
          </div>
        )}

        {filteredSemesters.length === 0 ? (
          <Panel>
            <EmptyState
              icon={CalendarCheck}
              title={t('لا توجد فصول في هذا العرض', 'No terms in this view')}
              description={t('اختر «كل الفصول» لعرض الخطة كاملة.', 'Choose “All terms” to see the whole plan.')}
              action={
                <button type="button" onClick={() => setFilterTerm('ALL')} className="btn btn-secondary btn-sm">
                  {t('كل الفصول', 'All terms')}
                </button>
              }
            />
          </Panel>
        ) : (
          <ol aria-label={t('فصول الخطة بالترتيب', 'Plan terms in order')}>
            {filteredSemesters.map((sem, i) => {
              const isSummer = sem.type === 'SUMMER';
              const isNext = sem.semesterIndex === 1;
              const isFinal = sem.semesterIndex === plan.semesters.length;
              const isLast = i === filteredSemesters.length - 1;
              const semName = language === 'ar' ? sem.semesterNameAr : sem.semesterNameEn;
              const riskNote = language === 'ar' ? sem.riskNoteAr : sem.riskNoteEn;
              return (
                <li key={sem.semesterIndex} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-4">
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-[29px] start-[14.5px] top-[29px] w-[3px] rounded-full bg-sign-600 sm:start-[18.5px]"
                    />
                  )}
                  <div className={cn('relative z-[1] flex justify-center', isNext ? 'pt-[18px]' : 'pt-5')} aria-hidden="true">
                    {isNext ? (
                      <span className="h-[22px] w-[22px] rounded-full border-[4px] border-sign-600 bg-route-400 shadow-[0_0_0_5px_rgb(255_199_44/0.3)]" />
                    ) : (
                      <span
                        className={cn(
                          'h-[18px] w-[18px] rounded-full border-[4px] bg-paper',
                          isSummer ? 'border-caution-500' : isFinal ? 'border-sign-600 bg-sign-600' : 'border-sign-600'
                        )}
                      />
                    )}
                  </div>

                  <Panel padded={false} as="article" className={cn('overflow-hidden', isNext && 'border-ink-900 ring-2 ring-route-400/60')}>
                    <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-[16px] font-bold text-ink-950">{semName}</h2>
                          {isNext && <Chip tone="route">{t('الفصل القادم', 'Next term')}</Chip>}
                          {isSummer && <Chip tone="caution">{t('فصل صيفي', 'Summer term')}</Chip>}
                          {isFinal && <Chip tone="sign">{t('فصل التخرج', 'Graduation term')}</Chip>}
                        </div>
                        <p className="text-[12.5px] text-ink-500">
                          {isSummer ? t('فصل مكثف مدته 8 أسابيع', 'An intensive 8-week term') : t('فصل نظامي مدته 15 أسبوعاً', 'A regular 15-week term')}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <dl className="flex items-center gap-5 text-[12.5px]">
                          <div>
                            <dt className="text-ink-500">{t('الساعات', 'Credits')}</dt>
                            <dd className="t-num text-[15px] font-extrabold text-ink-900">{sem.totalCredits}</dd>
                          </div>
                          {typeof sem.expectedGpa === 'number' && (
                            <div>
                              <dt className="text-ink-500">{t('المعدل المتوقع', 'Expected GPA')}</dt>
                              <dd className="t-num text-[15px] font-extrabold text-sign-700">{sem.expectedGpa.toFixed(2)}</dd>
                            </div>
                          )}
                        </dl>
                        {isNext && (
                          <button type="button" onClick={() => handleRegisterSemesterCourses(sem)} className="btn btn-primary btn-sm">
                            <CalendarCheck aria-hidden="true" />
                            {t('انقل مقررات هذا الفصل إلى التسجيل', 'Carry these courses to registration')}
                          </button>
                        )}
                      </div>
                    </div>

                    {riskNote && (
                      <p className="flex items-start gap-2 border-b border-ink-100 bg-caution-50 px-4 py-2.5 text-[12.5px] leading-6 text-caution-800 sm:px-5">
                        <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {riskNote}
                      </p>
                    )}

                    <ul className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3 2xl:grid-cols-5">
                      {sem.courses.map((course, cIdx) => {
                        const name = language === 'ar' ? course.courseNameAr : course.courseNameEn;
                        return (
                          <li key={`${course.courseCode}_${cIdx}`}>
                            <button
                              type="button"
                              onClick={() => setActiveCourseModal(course)}
                              className="group flex h-full w-full flex-col gap-2 rounded-xl border border-ink-200 bg-paper p-3 text-start transition hover:border-ink-400 hover:bg-ink-50"
                              aria-label={t(`تفاصيل ${course.courseCode} ${name}`, `Details for ${course.courseCode} ${name}`)}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <CodeBadge code={course.courseCode} variant={course.isRetake ? 'signal' : 'soft'} />
                                <span className="t-num text-[12px] text-ink-500">{t(`${course.credits} س`, `${course.credits} cr`)}</span>
                              </span>
                              <span className="line-clamp-2 text-[13px] font-semibold leading-6 text-ink-900">{name}</span>
                              <span className="mt-auto flex items-center justify-between gap-2">
                                {course.isRetake ? (
                                  <Chip tone="signal" icon={Flame}>
                                    {t('إعادة', 'Retake')}
                                  </Chip>
                                ) : (
                                  <Chip tone={course.isMandatory ? 'ink' : 'lane'}>
                                    {course.isMandatory ? t('إجباري', 'Required') : t('اختياري', 'Elective')}
                                  </Chip>
                                )}
                                <span className="text-[11.5px] font-semibold text-ink-400 transition group-hover:text-ink-700">
                                  {t('التفاصيل', 'Details')}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Course details */}
      {activeCourseModal && (
        <Modal
          onClose={() => setActiveCourseModal(null)}
          size="md"
          icon={BookOpen}
          title={language === 'ar' ? activeCourseModal.courseNameAr : activeCourseModal.courseNameEn}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-2">
              <CodeBadge code={activeCourseModal.courseCode} />
              <span>{t(`${activeCourseModal.credits} ساعات معتمدة`, `${activeCourseModal.credits} credit hours`)}</span>
              <span className="text-ink-300" aria-hidden="true">|</span>
              <span>{selectedCourseDetails?.department || t('علوم الحاسب', 'Computer Science')}</span>
            </span>
          }
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setActiveCourseModal(null)} className="btn btn-ghost">
                {t('إغلاق', 'Close')}
              </button>
              <button type="button" onClick={() => handleEnrolSingleCourse(activeCourseModal)} className="btn btn-primary">
                <CalendarCheck aria-hidden="true" />
                {t('سجّل هذا المقرر', 'Register this course')}
              </button>
            </>
          }
        >
          <div className="space-y-5 text-[13px]">
            {(selectedCourseDetails?.descriptionAr || selectedCourseDetails?.descriptionEn) && (
              <p className="leading-7 text-ink-700">
                {language === 'ar' ? selectedCourseDetails?.descriptionAr : selectedCourseDetails?.descriptionEn}
              </p>
            )}

            <dl className="grid grid-cols-1 gap-3 rounded-xl border border-ink-200 bg-ink-50 p-4 sm:grid-cols-2">
              <div className="kv">
                <dt>{t('نوع المقرر', 'Course type')}</dt>
                <dd>
                  {activeCourseModal.isMandatory
                    ? t('إجباري لمتطلبات الدرجة', 'Required for the degree')
                    : t('اختياري معتمد', 'Approved elective')}
                </dd>
              </div>
              <div className="kv">
                <dt>{t('وضعك في المقرر', 'Your status')}</dt>
                <dd className={activeCourseModal.isRetake ? 'text-signal-600' : 'text-sign-700'}>
                  {activeCourseModal.isRetake ? (
                    <>
                      {t('إعادة لرفع المعدل؛ أعلى تقدير ممكن', 'Retake to lift your GPA; the grade is capped at')}{' '}
                      <bdi dir="ltr" className="whitespace-nowrap">
                        B+
                      </bdi>
                    </>
                  ) : (
                    t('تسجيل لأول مرة', 'First attempt')
                  )}
                </dd>
              </div>
            </dl>

            <section>
              <h3 className="mb-2 text-[13.5px] font-bold text-ink-900">{t('المتطلبات السابقة', 'Prerequisites')}</h3>
              {selectedCourseDetails?.prerequisites && selectedCourseDetails.prerequisites.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {selectedCourseDetails.prerequisites.map(p => {
                    const isPassed = !!student?.records.some(r => r.courseCode === p && r.status === 'PASSED');
                    return (
                      <li key={p} className={cn(chipClass[isPassed ? 'sign' : 'caution'], '!h-7 !px-2.5')}>
                        {isPassed ? <Check aria-hidden="true" /> : <Clock aria-hidden="true" />}
                        <span dir="ltr">{p}</span>
                        <span className="sr-only">{isPassed ? t('مجتاز', 'passed') : t('لم يُجتز بعد', 'not passed yet')}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-ink-500">{t('لا يحتاج متطلبات سابقة.', 'No prerequisites.')}</p>
              )}
              {selectedCourseDetails?.prerequisites && selectedCourseDetails.prerequisites.length > 0 && (
                <p className="mt-2 text-[12px] text-ink-500">
                  {t('الأخضر مجتاز، والبرتقالي لم يُجتز بعد.', 'Green is passed; orange is not passed yet.')}
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-ink-900">
                <KeyRound className="h-4 w-4 text-ink-500" aria-hidden="true" />
                {unlockedCourses.length > 0
                  ? t(`يفتح ${unlockedCourses.length} مقررات لاحقة`, `Unlocks ${unlockedCourses.length} later course${unlockedCourses.length === 1 ? '' : 's'}`)
                  : t('لا يفتح مقررات أخرى', 'Does not unlock other courses')}
              </h3>
              {unlockedCourses.length > 0 && (
                <ul className="space-y-1.5">
                  {unlockedCourses.map(u => (
                    <li key={u.code} className="flex items-center gap-2.5">
                      <CodeBadge code={u.code} />
                      <span className="text-ink-700">{language === 'ar' ? u.nameAr : u.nameEn}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Modal>
      )}
    </div>
  );
};
