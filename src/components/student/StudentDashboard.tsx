import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Student, StudentCourseRecord } from '../../types/index.js';
import { TranscriptReportModal } from '../reports/TranscriptReportModal.js';
import {
  Panel,
  PanelHeader,
  Chip,
  CodeBadge,
  Meter,
  Loader,
  EmptyState,
  Segmented,
  JourneyRoute,
  GpaScale,
  cn,
  riskTone,
  riskLabel,
  trackLabel,
  trackTone,
  trainingLabel,
  recordTone,
  recordLabel,
  gradeTone,
  chipClass,
  creditCapForGpa,
  pick,
  personName,
  type Tone,
} from '../ui/index.js';
import {
  AlertTriangle,
  ShieldAlert,
  FileText,
  Printer,
  Signpost,
  TrendingUp,
  Route,
  CalendarCheck,
  Briefcase,
  GitFork,
  BookOpen,
  NotebookPen,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StudentDashboardProps {
  onNavigateTab: (tab: string) => void;
}

const DEGREE_CREDITS = 134;

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [recordFilter, setRecordFilter] = useState<'ALL' | 'IN_PROGRESS' | 'PASSED' | 'FAILED'>('ALL');
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);

  const loadData = async () => {
    const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
    try {
      setLoading(true);
      const data = await api.getStudentById(studentId);
      setStudent(data);
    } catch (err) {
      console.error('Failed to load student data by id, trying getStudents fallback:', err);
      try {
        const students = await api.getStudents();
        if (students && students.length > 0) {
          const match = students.find(s => s.id === studentId || s.email === currentUser?.email) || students[0];
          const fullData = await api.getStudentById(match.id);
          setStudent(fullData || match);
        }
      } catch (e) {
        console.error('Fallback load error:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  if (loading) {
    return <Loader label={t('جارٍ تحميل سجلك الأكاديمي…', 'Loading your academic record…')} />;
  }

  if (!student) {
    return (
      <Panel>
        <EmptyState
          icon={AlertTriangle}
          tone="caution"
          title={t('تعذّر تحميل بيانات الطالب', 'Your student record could not be loaded')}
          description={t(
            'الخادم لم يرد. تأكد أن الخادم وقاعدة البيانات يعملان ثم أعد المحاولة.',
            'The server did not respond. Check that the server and database are running, then try again.'
          )}
          action={
            <button type="button" onClick={loadData} className="btn btn-primary">
              <RotateCcw aria-hidden="true" />
              {t('إعادة المحاولة', 'Try again')}
            </button>
          }
        />
      </Panel>
    );
  }

  const isAtRisk = student.cumulativeGpa < 2.0;
  const name = personName(language === 'ar' ? student.nameAr : student.nameEn, language);
  const firstName = name.split(/\s+/)[0];
  const allRecords: StudentCourseRecord[] = student.records || [];
  const currentRecords = allRecords.filter(r => r.status === 'IN_PROGRESS' || r.status === 'ENROLLED');
  const passedRecords = allRecords.filter(r => r.status === 'PASSED');
  const failedRecords = allRecords.filter(r => r.status === 'FAILED');
  const enrolledCredits = currentRecords.reduce((sum, r) => sum + (r.credits || 0), 0);
  const gpaDelta = student.cumulativeGpa - student.previousGpa;
  const creditCap = creditCapForGpa(student.cumulativeGpa);
  const trainingHours = student.trainingHours || 0;

  const displayedRecords = allRecords.filter(r => {
    if (recordFilter === 'IN_PROGRESS') return r.status === 'IN_PROGRESS' || r.status === 'ENROLLED';
    if (recordFilter === 'PASSED') return r.status === 'PASSED';
    if (recordFilter === 'FAILED') return r.status === 'FAILED';
    return true;
  });

  const Chevron = language === 'ar' ? ChevronLeft : ChevronRight;

  // Personalised next steps, ordered by what matters most for this student.
  type Step = { tab: string; icon: LucideIcon; title: string; why: string; tone: Tone };
  const nextSteps: Step[] = [];
  if (isAtRisk) {
    nextSteps.push({
      tab: 'student-gpa-plan',
      icon: TrendingUp,
      tone: 'signal',
      title: t('اختر خطة لتحسين معدلك', 'Pick a GPA recovery plan'),
      why: t('معدلك تحت 2.00؛ الخطة تحدد المقررات التي تعيدها والتقدير المطلوب.', 'Your GPA is under 2.00; a plan sets which courses to retake and the grade you need.'),
    });
  }
  nextSteps.push(
    {
      tab: 'student-recommendations',
      icon: Signpost,
      tone: 'sign',
      title: t('راجع المقررات المقترحة لك', 'Review your suggested courses'),
      why: t('كل اقتراح معه سببه وعدد المقررات التي يفتحها.', 'Each suggestion comes with its reason and what it unlocks.'),
    },
    {
      tab: 'student-registration',
      icon: CalendarCheck,
      tone: 'lane',
      title: t('ابنِ جدول الفصل القادم', 'Build next term’s timetable'),
      why: t(`حدك الأقصى ${creditCap} ساعة حسب معدلك الحالي.`, `Your ceiling is ${creditCap} credit hours at your current GPA.`),
    },
    {
      tab: 'student-study-plan',
      icon: Route,
      tone: 'ink',
      title: t('شاهد خطتك حتى التخرج', 'See your plan to graduation'),
      why: t(`${student.remainingCredits} ساعة متبقية موزعة على الفصول القادمة.`, `${student.remainingCredits} credit hours left, spread over the coming terms.`),
    }
  );
  if (!isAtRisk) {
    nextSteps.push({
      tab: 'student-what-if',
      icon: GitFork,
      tone: 'plum',
      title: t('جرّب سيناريو «ماذا لو؟»', 'Try a what-if scenario'),
      why: t('شاهد أثر تقديرات افتراضية على معدلك قبل أن تقرر.', 'See how hypothetical grades would move your GPA.'),
    });
  }
  if (student.completedCredits >= 30 && trainingHours < 240) {
    nextSteps.push({
      tab: 'student-training',
      icon: Briefcase,
      tone: 'caution',
      title: t('سجّل ساعات التدريب الصيفي', 'Log your summer training'),
      why: t(`${trainingHours} من 240 ساعة مسجلة حتى الآن.`, `${trainingHours} of 240 hours logged so far.`),
    });
  }

  const consecutive = Math.min(4, student.consecutiveWarnings || 0);

  return (
    <div className="space-y-6">
      {/* ── Hero: where the student stands on the degree route ─────────────── */}
      <Panel padded={false} className="overflow-hidden">
        <div className="flex flex-col gap-5 px-5 pb-2 pt-6 sm:px-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="t-display display-tight text-[26px] sm:text-[30px]">
              {t(`أهلاً ${firstName}`, `Hello, ${firstName}`)}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Chip tone="ink">{t(`المستوى ${student.level}`, `Level ${student.level}`)}</Chip>
              <Chip tone={trackTone[student.track] || 'ink'}>{pick(language, trackLabel[student.track], student.track)}</Chip>
              <span className="chip chip-ink" dir="ltr">
                #{student.studentCode}
              </span>
              <Chip tone={isAtRisk ? 'signal' : 'sign'}>{isAtRisk ? t('تحت الإنذار الأكاديمي', 'On academic warning') : t('وضع أكاديمي سليم', 'Good standing')}</Chip>
            </div>
            <p className="mt-3 text-[13px] text-ink-500">
              {t('المرشد الأكاديمي:', 'Academic advisor:')} <span className="font-semibold text-ink-800">{personName(student.advisorName, language)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onNavigateTab('student-recommendations')} className="btn btn-primary">
              <Signpost aria-hidden="true" />
              {t('المقررات المقترحة', 'Suggested courses')}
            </button>
            <button type="button" onClick={() => setShowTranscriptModal(true)} className="btn btn-secondary">
              <FileText aria-hidden="true" />
              {t('السجل الموثق', 'Verified transcript')}
            </button>
          </div>
        </div>

        <div className="px-5 pb-4 pt-4 sm:px-7">
          <JourneyRoute
            completed={student.completedCredits}
            enrolled={enrolledCredits}
            total={DEGREE_CREDITS}
            milestones={[
              { at: 30, label: t('التدريب الميداني', 'Field training'), sub: t('30 ساعة', '30 cr') },
              { at: 94, label: t('مشروع التخرج', 'Graduation project'), sub: t('94 ساعة', '94 cr') },
              { at: DEGREE_CREDITS, label: t('التخرج', 'Graduation'), sub: t('134 ساعة', '134 cr') },
            ]}
          />
          <p className="mt-1 text-[12.5px] text-ink-500">
            {t(
              `أنجزت ${student.completedCredits} ساعة وتدرس ${enrolledCredits} ساعة هذا الفصل؛ يتبقى ${student.remainingCredits} ساعة حتى التخرج.`,
              `${student.completedCredits} credit hours done and ${enrolledCredits} in progress this term; ${student.remainingCredits} to go.`
            )}
          </p>
        </div>

        {/* Facts strip */}
        <div className="grid grid-cols-1 border-t border-ink-100 bg-ink-50/60 md:grid-cols-3">
          <div className="px-5 py-5 sm:px-7">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-medium text-ink-500">{t('المعدل التراكمي', 'Cumulative GPA')}</span>
              <span className={cn('t-num text-[12px] font-bold', gpaDelta >= 0 ? 'text-sign-700' : 'text-signal-600')}>
                {gpaDelta >= 0 ? '+' : '−'}
                {Math.abs(gpaDelta).toFixed(2)} {t('عن الفصل السابق', 'vs last term')}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={cn('t-num text-[34px] font-extrabold leading-none', isAtRisk ? 'text-signal-600' : 'text-ink-950')}>
                {student.cumulativeGpa.toFixed(2)}
              </span>
              <span className="text-[13px] text-ink-500">/ 4.00</span>
            </div>
            <GpaScale gpa={student.cumulativeGpa} className="mt-3" />
          </div>

          <div className="border-t border-ink-100 px-5 py-5 sm:px-7 md:border-s md:border-t-0">
            <span className="text-[12.5px] font-medium text-ink-500">{t('الإنذارات المتتالية', 'Consecutive warnings')}</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={cn('t-num text-[34px] font-extrabold leading-none', consecutive > 0 ? 'text-caution-600' : 'text-ink-950')}>
                {student.consecutiveWarnings}
              </span>
              <span className="text-[13px] text-ink-500">{t(`من 4 (إجمالي ${student.warningCount})`, `of 4 (total ${student.warningCount})`)}</span>
            </div>
            <div className="mt-4 flex gap-1.5" aria-hidden="true">
              {[0, 1, 2, 3].map(i => (
                <span
                  key={i}
                  className={cn(
                    'h-3 flex-1 rounded-sm',
                    i < consecutive ? (i >= 2 ? 'bg-signal-500' : 'bg-caution-400') : 'bg-ink-200'
                  )}
                />
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-5 text-ink-500">
              {t('أربعة إنذارات متتالية تعرّض الطالب للفصل حسب اللائحة.', 'Four consecutive warnings put a student at risk of dismissal.')}
            </p>
          </div>

          <div className="border-t border-ink-100 px-5 py-5 sm:px-7 md:border-s md:border-t-0">
            <span className="text-[12.5px] font-medium text-ink-500">{t('تقييم الخطر الأكاديمي', 'Academic risk')}</span>
            <div className="mt-2">
              <span className={cn(chipClass[riskTone[student.riskLevel] || 'ink'], '!h-8 !px-3 !text-[13.5px]')}>
                <ShieldAlert aria-hidden="true" className="!h-4 !w-4" />
                {pick(language, riskLabel[student.riskLevel], student.riskLevel)}
              </span>
            </div>
            <p className="mt-3 line-clamp-3 text-[12.5px] leading-6 text-ink-600">
              {student.riskReasons?.[0] || t('لا توجد مؤشرات خطر حالياً.', 'No risk signals right now.')}
            </p>
            <p className="mt-2 text-[12px] text-ink-500">
              {t('التدريب الصيفي:', 'Summer training:')}{' '}
              <span className="t-num font-semibold text-ink-800">{trainingHours}/240</span>{' '}
              ({pick(language, trainingLabel[student.trainingStatus], student.trainingStatus)})
            </p>
          </div>
        </div>
      </Panel>

      {/* ── Warning notice ─────────────────────────────────────────────────── */}
      {isAtRisk && (
        <div className="callout callout-signal flex-col sm:flex-row sm:items-center" role="alert">
          <ShieldAlert aria-hidden="true" />
          <div className="flex-1">
            <p className="font-bold text-signal-800">
              {t(
                `أنت تحت الإنذار الأكاديمي (${student.warningCount} إنذار).`,
                `You are on academic warning (${student.warningCount} warning${student.warningCount === 1 ? '' : 's'}).`
              )}
            </p>
            <p className="text-signal-700">
              {t(
                `معدلك ${student.cumulativeGpa.toFixed(2)} أقل من 2.00، لذلك حدك ${creditCap} ساعة هذا الفصل. خطة التحسين تحدد ما تعيده من مقررات دون تأخير تخرجك.`,
                `Your GPA of ${student.cumulativeGpa.toFixed(2)} is below 2.00, so you can take up to ${creditCap} credit hours. A recovery plan shows which courses to retake without delaying graduation.`
              )}
            </p>
          </div>
          <button type="button" onClick={() => onNavigateTab('student-gpa-plan')} className="btn btn-danger shrink-0">
            <TrendingUp aria-hidden="true" />
            {t('خطة تحسين المعدل', 'GPA recovery plan')}
          </button>
        </div>
      )}

      {/* ── This term + next steps ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            icon={BookOpen}
            title={t('مقررات هذا الفصل', 'This term’s courses')}
            description={t('الحضور وأعمال السنة أولاً بأول. تحت 75% حضور يعني خطر الحرمان.', 'Attendance and coursework as they come in. Under 75% attendance risks exclusion.')}
            actions={
              <button type="button" onClick={() => onNavigateTab('student-registration')} className="btn btn-secondary btn-sm">
                {t('تعديل التسجيل', 'Change registration')}
              </button>
            }
          />

          {currentRecords.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title={t('لا مقررات مسجلة هذا الفصل', 'No courses registered this term')}
              description={t('ابنِ جدولك من صفحة التسجيل وسيظهر هنا.', 'Build your timetable on the registration page and it will show here.')}
              action={
                <button type="button" onClick={() => onNavigateTab('student-registration')} className="btn btn-primary btn-sm">
                  {t('اذهب إلى التسجيل', 'Go to registration')}
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {currentRecords.map((rec, idx) => {
                const att = rec.attendancePercentage ?? 100;
                const attRisk = att < 75;
                return (
                  <li key={`${rec.courseCode}_${rec.semesterId || ''}_${idx}`} className="grid grid-cols-1 gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
                    <div className="flex min-w-0 items-start gap-3">
                      <CodeBadge code={rec.courseCode} variant={rec.attempt > 1 ? 'signal' : 'solid'} />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-ink-900">{language === 'ar' ? rec.courseNameAr : rec.courseNameEn}</p>
                        <p className="text-[12px] text-ink-500">
                          {t(`${rec.credits} ساعات`, `${rec.credits} credits`)}
                          <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                          {t('أعمال السنة:', 'Coursework:')}{' '}
                          <span className="t-num font-semibold text-ink-700">
                            {rec.courseworkMark !== undefined ? `${rec.courseworkMark}/50` : t('لم ترصد بعد', 'not yet entered')}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="text-ink-500">{t('الحضور', 'Attendance')}</span>
                        <span className={cn('t-num font-bold', attRisk ? 'text-signal-600' : 'text-ink-800')}>{att}%</span>
                      </div>
                      <div className="relative">
                        <Meter value={att} tone={attRisk ? 'signal' : 'sign'} label={t('نسبة الحضور', 'Attendance rate')} />
                        {/* 75% threshold tick */}
                        <span className="absolute -top-1 h-[14px] w-[2px] rounded bg-ink-700" style={{ insetInlineStart: '75%' }} aria-hidden="true" />
                      </div>
                      {attRisk && <p className="mt-1 text-[11.5px] font-semibold text-signal-600">{t('خطر حرمان: أقل من 75%', 'Exclusion risk: below 75%')}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader icon={Route} title={t('خطوتك التالية', 'Your next step')} description={t('مرتبة حسب وضعك الأكاديمي الآن.', 'Ordered by your academic situation right now.')} />
            <ul className="-mx-2 space-y-1">
              {nextSteps.map(step => {
                const Icon = step.icon;
                return (
                  <li key={step.tab}>
                    <button
                      type="button"
                      onClick={() => onNavigateTab(step.tab)}
                      className="group flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-start transition hover:bg-ink-50"
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                          step.tone === 'signal'
                            ? 'bg-signal-500 text-white'
                            : step.tone === 'sign'
                            ? 'bg-sign-600 text-white'
                            : 'bg-ink-100 text-ink-700'
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
          </Panel>

          <Panel>
            <PanelHeader icon={NotebookPen} tone="caution" title={t('ملاحظات المستشار على سجلك', 'Advisor engine notes')} />
            {student.riskReasons && student.riskReasons.length > 0 ? (
              <ul className="space-y-2.5">
                {student.riskReasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] leading-6 text-ink-700">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-caution-500" aria-hidden="true" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-500">{t('سجلك مستقر ولا توجد ملاحظات سلبية.', 'Your record is healthy; nothing to flag.')}</p>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Course ledger ─────────────────────────────────────────────────── */}
      <Panel padded={false}>
        <div className="flex flex-col gap-4 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-ink-950">{t('سجل المقررات', 'Course history')}</h2>
            <p className="text-[12.5px] text-ink-500">
              {t('كل مقرر درسته: التقدير، النقاط، الدرجات، والحضور.', 'Every course you have taken: grade, points, marks and attendance.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel={t('تصفية السجل', 'Filter records')}
              value={recordFilter}
              onChange={setRecordFilter}
              options={[
                { value: 'ALL', label: t('الكل', 'All'), count: allRecords.length },
                { value: 'PASSED', label: t('ناجح', 'Passed'), count: passedRecords.length },
                { value: 'FAILED', label: t('راسب', 'Failed'), count: failedRecords.length },
                { value: 'IN_PROGRESS', label: t('الفصل الحالي', 'This term'), count: currentRecords.length },
              ]}
            />
            <button type="button" onClick={() => setShowTranscriptModal(true)} className="btn btn-secondary">
              <Printer aria-hidden="true" />
              {t('طباعة كشف موثق', 'Print verified transcript')}
            </button>
          </div>
        </div>

        <div className="scroll-x border-t border-ink-100">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th>{t('المقرر', 'Course')}</th>
                <th className="num">{t('الساعات', 'Credits')}</th>
                <th>{t('الفصل', 'Term')}</th>
                <th className="num">{t('التقدير', 'Grade')}</th>
                <th className="num">{t('النقاط', 'Points')}</th>
                <th className="num">{t('أعمال السنة + النهائي', 'Coursework + final')}</th>
                <th className="num">{t('الحضور', 'Attendance')}</th>
                <th>{t('الحالة', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="!py-10 text-center text-ink-500">
                    {t('لا توجد مقررات في هذا التصنيف.', 'No courses in this view.')}
                  </td>
                </tr>
              ) : (
                displayedRecords.map((rec, idx) => {
                  const att = rec.attendancePercentage ?? 100;
                  const hasMarks = rec.courseworkMark !== undefined || rec.finalMark !== undefined;
                  const tone = recordTone[rec.status] || 'ink';
                  return (
                    <tr key={`${rec.courseCode}_${idx}`}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <CodeBadge code={rec.courseCode} />
                          <span className="font-semibold text-ink-900">{language === 'ar' ? rec.courseNameAr : rec.courseNameEn}</span>
                          {rec.attempt > 1 && <Chip tone="caution">{t(`محاولة ${rec.attempt}`, `Attempt ${rec.attempt}`)}</Chip>}
                        </div>
                      </td>
                      <td className="num font-semibold">{rec.credits}</td>
                      <td className="whitespace-nowrap text-ink-500">{rec.semesterName || t('خريف 2026', 'Fall 2026')}</td>
                      <td className="num">
                        {rec.grade ? (
                          <span className={cn(chipClass[gradeTone(rec.grade)], 't-num !px-2.5 font-extrabold')}>{rec.grade}</span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="num font-semibold">{rec.gradePoints !== undefined ? rec.gradePoints.toFixed(1) : <span className="text-ink-300">—</span>}</td>
                      <td className="num whitespace-nowrap">
                        {hasMarks ? (
                          <span className="t-num text-ink-600">
                            {rec.courseworkMark ?? 0} + {rec.finalMark ?? 0} ={' '}
                            <strong className="text-ink-900">{(rec.courseworkMark ?? 0) + (rec.finalMark ?? 0)}</strong>
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="num">
                        <span className={cn('t-num font-bold', att < 75 ? 'text-signal-600' : 'text-ink-700')}>{att}%</span>
                      </td>
                      <td>
                        <span className={chipClass[tone]}>{pick(language, recordLabel[rec.status], rec.status)}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {showTranscriptModal && (
        <TranscriptReportModal studentId={student.id} onClose={() => setShowTranscriptModal(false)} />
      )}
    </div>
  );
};
