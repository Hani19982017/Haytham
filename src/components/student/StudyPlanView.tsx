import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { Course, CourseOffering, PlannedCourse, PlannedSemester, Student, StudyPlan } from '../../types/index.js';
import {
  CalendarDays,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  GraduationCap,
  Sparkles,
  SlidersHorizontal,
  Printer,
  RotateCcw,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Check,
  Info,
  CalendarCheck,
  Layers,
  Award,
  X,
  ExternalLink,
  Flame,
} from 'lucide-react';

interface StudyPlanViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const StudyPlanView: React.FC<StudyPlanViewProps> = ({ onNavigateTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [pace, setPace] = useState<'NORMAL' | 'LIGHT' | 'HEAVY' | 'INCLUDE_SUMMER'>('NORMAL');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [activeCourseModal, setActiveCourseModal] = useState<PlannedCourse | null>(null);
  const [filterTerm, setFilterTerm] = useState<'ALL' | 'YEAR_1' | 'YEAR_2' | 'SUMMER'>('ALL');

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

  const handlePaceChange = (newPace: 'NORMAL' | 'LIGHT' | 'HEAVY' | 'INCLUDE_SUMMER') => {
    setPace(newPace);
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

  const handleRegisterSemesterCourses = (sem: PlannedSemester) => {
    try {
      const courseCodes = sem.courses.map(c => c.courseCode);
      localStorage.setItem(`staged_recovery_courses_${studentId}`, JSON.stringify(courseCodes));
      localStorage.setItem('staged_recovery_courses', JSON.stringify(courseCodes));
    } catch {}

    if (onNavigateTab) {
      onNavigateTab('student-registration');
    } else {
      navigate('/student/registration');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const statusBadge: Record<string, string> = {
    'Draft': 'bg-slate-100 text-slate-700 border-slate-200',
    'Pending Review': 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse',
    'Approved': 'bg-emerald-50 text-emerald-800 border-emerald-200',
    'Rejected': 'bg-rose-50 text-rose-800 border-rose-200',
  };

  const statusLabel: Record<string, { ar: string; en: string }> = {
    'Draft': { ar: 'مسودة قيد الإعداد', en: 'Draft' },
    'Pending Review': { ar: 'بانتظار مراجعة المرشد الأكاديمي', en: 'Pending Advisor Review' },
    'Approved': { ar: 'معتمدة رسمياً من المرشد', en: 'Officially Approved' },
    'Rejected': { ar: 'مرفوضة / بحاجة لتعديل', en: 'Changes Requested' },
  };

  // Find detailed course from catalog
  const selectedCourseDetails = activeCourseModal
    ? allCourses.find(c => c.code === activeCourseModal.courseCode)
    : null;

  // Unlocked courses calculation for selected modal course
  const unlockedCourses = activeCourseModal
    ? allCourses.filter(c => c.prerequisites && c.prerequisites.includes(activeCourseModal.courseCode))
    : [];

  // Filtered semesters based on tab
  const filteredSemesters = (plan?.semesters || []).filter(sem => {
    if (filterTerm === 'ALL') return true;
    if (filterTerm === 'YEAR_1') return sem.semesterIndex <= 2;
    if (filterTerm === 'YEAR_2') return sem.semesterIndex >= 3 && sem.semesterIndex <= 4;
    if (filterTerm === 'SUMMER') return sem.type === 'SUMMER';
    return true;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        <p className="text-xs text-slate-500 font-medium">
          {t('جاري الحساب والتوليد الذكي لخطة التخرج بالكامل...', 'Generating full graduation timeline...')}
        </p>
      </div>
    );
  }

  if (!plan) return null;

  const totalDegreeCredits = 134;
  const completedCredits = student?.completedCredits ?? 56;
  const remainingHours = Math.max(0, totalDegreeCredits - completedCredits);

  return (
    <div className="space-y-6">
      {/* Printable Header (Visible only during print) */}
      <div className="hidden print:block p-4 border-b border-slate-300 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">كلية الحاسبات والمعلومات — جامعة القاهرة</h1>
            <h2 className="text-sm font-semibold text-slate-700">الخطة الدراسية التراكمية للتخرج (نظام الساعات المعتمدة)</h2>
          </div>
          <div className="text-right text-xs">
            <p><strong>اسم الطالب:</strong> {student?.nameAr || 'عمر فاروق عبد الرحمن'}</p>
            <p><strong>الرقم الجامعي:</strong> {student?.studentCode || '20230145'}</p>
            <p><strong>المعدل التراكمي:</strong> {student?.cumulativeGpa || '1.78'}</p>
            <p><strong>المرشد الأكاديمي:</strong> {student?.advisorName || 'د. محمود صقر'}</p>
          </div>
        </div>
      </div>

      {/* Header & Control Panel */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <CalendarDays className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">
                {t('خطة التخرج الزمنية المقترحة ذكياً', 'AI-Generated Graduation Study Plan')}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  statusBadge[plan.status] || 'bg-slate-100'
                }`}
              >
                {language === 'ar' ? statusLabel[plan.status]?.ar : statusLabel[plan.status]?.en}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t(
                `تاريخ التخرج المتوقع: ${language === 'ar' ? plan.expectedGraduationSemesterAr : plan.expectedGraduationSemesterEn} | إجمالي الساعات المخططة للتخرج: ${plan.totalPlannedCredits} ساعة معتمدة موزعة على ${plan.semesters.length} فصول.`,
                `Expected Graduation: ${plan.expectedGraduationSemesterEn} | Total Planned Credits: ${plan.totalPlannedCredits} hrs across ${plan.semesters.length} terms.`
              )}
            </p>
          </div>

          {/* Action Tools */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              title={t('طباعة الخطة الرسمية', 'Print official plan')}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('طباعة / تصدير', 'Print / Export')}</span>
            </button>

            <button
              onClick={handleRegeneratePlan}
              disabled={submitting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              title={t('إعادة توليد وتوزيع المقررات', 'Regenerate timeline')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('إعادة توليد', 'Regenerate')}</span>
            </button>

            {plan.status === 'Approved' || plan.status === 'Pending Review' ? (
              <button
                onClick={handleResetToDraft}
                disabled={submitting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('تعديل الخطة وإعادة الضبط', 'Modify & Redraft')}</span>
              </button>
            ) : (
              <button
                disabled={submitting}
                onClick={handleSubmitPlan}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('إرسال الخطة للمرشد للاعتماد', 'Submit to Advisor')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Pacing Filters Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs font-bold text-slate-600">{t('سرعة وعبء الفصول:', 'Pacing & Load:')}</span>
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => handlePaceChange('NORMAL')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  pace === 'NORMAL' ? 'bg-white text-indigo-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('المعدل الطبيعي (18)', 'Normal (18h)')}
              </button>
              <button
                onClick={() => handlePaceChange('LIGHT')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  pace === 'LIGHT' ? 'bg-white text-indigo-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('عبء خفيف (12-15)', 'Light Load (12-15h)')}
              </button>
              <button
                onClick={() => handlePaceChange('INCLUDE_SUMMER')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  pace === 'INCLUDE_SUMMER' ? 'bg-white text-indigo-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('تضمين فصول الصيف (تسريع التخرج)', 'Accelerate with Summer')}
              </button>
            </div>
          </div>

          {/* Quick Filter by Term */}
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <span>{t('عرض:', 'View:')}</span>
            <button
              onClick={() => setFilterTerm('ALL')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                filterTerm === 'ALL' ? 'bg-slate-200 text-slate-900 font-bold' : 'hover:bg-slate-100'
              }`}
            >
              {t('كل الفصول', 'All')}
            </button>
            <button
              onClick={() => setFilterTerm('YEAR_1')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                filterTerm === 'YEAR_1' ? 'bg-slate-200 text-slate-900 font-bold' : 'hover:bg-slate-100'
              }`}
            >
              {t('السنة الحالية', 'Year 1')}
            </button>
            <button
              onClick={() => setFilterTerm('YEAR_2')}
              className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                filterTerm === 'YEAR_2' ? 'bg-slate-200 text-slate-900 font-bold' : 'hover:bg-slate-100'
              }`}
            >
              {t('السنة القادمة', 'Year 2')}
            </button>
            {pace === 'INCLUDE_SUMMER' && (
              <button
                onClick={() => setFilterTerm('SUMMER')}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  filterTerm === 'SUMMER' ? 'bg-amber-100 text-amber-900 font-bold' : 'hover:bg-slate-100'
                }`}
              >
                {t('فصول الصيف', 'Summer Only')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">
            {t('الساعات المنجزة رسمياً', 'Completed Credits')}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-emerald-600 font-mono">{completedCredits}</span>
            <span className="text-xs text-slate-400">/ {totalDegreeCredits} {t('ساعة', 'hrs')}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.round((completedCredits / totalDegreeCredits) * 100)}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">
            {t('الساعات المخططة المتبقية', 'Planned Remaining')}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-indigo-600 font-mono">{plan.totalPlannedCredits}</span>
            <span className="text-xs text-slate-400">{t('ساعة معتمدة', 'credits')}</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">
            {t(`تغطي كافة متطلبات التخرج الـ ${remainingHours} المتبقية`, `Covers all ${remainingHours} required hours`)}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">
            {t('عدد الفصول حتى التخرج', 'Terms to Graduation')}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-slate-800 font-mono">{plan.semesters.length}</span>
            <span className="text-xs text-slate-400">{t('فصول دراسية', 'semesters')}</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-bold block mt-1">
            {language === 'ar' ? `الموعد: ${plan.expectedGraduationSemesterAr}` : `Target: ${plan.expectedGraduationSemesterEn}`}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 block mb-1">
            {t('المعدل المتوقع عند التخرج', 'Target Graduation GPA')}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-purple-600 font-mono">2.45+</span>
            <span className="text-xs text-slate-400">{t('نقطة', 'pts')}</span>
          </div>
          <span className="text-[10px] text-purple-700 font-bold block mt-1">
            {t('خروج آمن ومؤكد من الإنذار الأكاديمي', 'Safe exit from academic warning')}
          </span>
        </div>
      </div>

      {submittedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-emerald-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold">{t('تم إرسال الخطة الدراسية بنجاح إلى المرشد الأكاديمي!', 'Study Plan Successfully Submitted to Advisor!')}</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                {t('تم إشعار د. محمود صقر لمراجعة الخطة والاعتماد، وستصلك إفادة فور المصادقة.', 'Dr. Mahmoud Saqr was notified for official review and approval.')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSubmittedSuccess(false)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Interactive Helper Banner */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs text-indigo-900 print:hidden">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            {t(
              '💡 اضغط على أي مقرر للاطلاع على المتطلبات السابقة، والمقررات التي يفتحها، وتفاصيل الشعب. يمكنك تسجيل مقررات الفصل القادم بضغطة زر واحدة.',
              '💡 Click on any course card to inspect prerequisites, unlocked courses, and section info. Register Semester 1 with a single click.'
            )}
          </span>
        </div>
      </div>

      {/* Timeline Semesters Grid */}
      <div className="space-y-5">
        {filteredSemesters.map((sem) => {
          const isSummer = sem.type === 'SUMMER';
          const isFirstSemester = sem.semesterIndex === 1;

          return (
            <div
              key={sem.semesterIndex}
              className={`bg-white rounded-3xl p-6 border transition-all ${
                isFirstSemester
                  ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-md'
                  : isSummer
                  ? 'border-amber-200 bg-amber-50/15 shadow-xs'
                  : 'border-slate-200 shadow-xs hover:border-slate-300'
              }`}
            >
              {/* Semester Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3.5 mb-4 gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-sm shadow-xs ${
                      isFirstSemester
                        ? 'bg-indigo-600 text-white'
                        : isSummer
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    #{sem.semesterIndex}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        {language === 'ar' ? sem.semesterNameAr : sem.semesterNameEn}
                      </h3>
                      {isFirstSemester && (
                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                          {t('الفصل الدراسي القادم للتسجيل', 'Upcoming Term')}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {isSummer
                        ? t('فصل صيفي مكثف (8 أسابيع)', 'Intensive Summer Term (8 Weeks)')
                        : t('فصل نظامي كامل (15 أسبوع)', 'Regular Academic Semester (15 Weeks)')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs flex items-center gap-3">
                    <span className="text-slate-500">
                      {t('إجمالي الساعات: ', 'Credits: ')}
                      <strong className="text-slate-900 font-mono text-sm">{sem.totalCredits}</strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">
                      {t('المعدل المتوقع: ', 'Exp. GPA: ')}
                      <strong className="text-emerald-600 font-mono text-sm">{sem.expectedGpa?.toFixed(2) || '2.30'}</strong>
                    </span>
                  </div>

                  {/* Direct Registration Shortcut on Semester 1 */}
                  {isFirstSemester && (
                    <button
                      onClick={() => handleRegisterSemesterCourses(sem)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer print:hidden"
                    >
                      <CalendarCheck className="w-3.5 h-3.5" />
                      <span>{t('تسجيل مقررات هذا الفصل في التسجيل الفصلي', 'Enroll This Term Courses')}</span>
                      {language === 'ar' ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Courses in this semester */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
                {sem.courses.map((course, cIdx) => (
                  <div
                    key={`${course.courseCode}_${cIdx}`}
                    onClick={() => setActiveCourseModal(course)}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-xs font-extrabold text-indigo-700 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition">
                          {course.courseCode}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {course.credits} {t('ساعات', 'hrs')}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 leading-snug line-clamp-2 mt-1">
                        {language === 'ar' ? course.courseNameAr : course.courseNameEn}
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      {course.isRetake ? (
                        <span className="text-rose-700 font-bold bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Flame className="w-3 h-3 text-rose-500" />
                          {t('إعادة تحسين', 'Retake')}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-medium bg-slate-50 px-1.5 py-0.5 rounded">
                          {course.isMandatory ? t('إجباري', 'Required') : t('اختياري', 'Elective')}
                        </span>
                      )}

                      <span className="text-indigo-600 opacity-0 group-hover:opacity-100 transition font-bold flex items-center gap-0.5">
                        {t('تفاصيل', 'Details')}
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Course Detail Modal */}
      {activeCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100 font-mono font-black text-sm shrink-0">
                  {activeCourseModal.courseCode}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {language === 'ar' ? activeCourseModal.courseNameAr : activeCourseModal.courseNameEn}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-slate-500 font-mono">
                      {activeCourseModal.credits} {t('ساعات معتمدة', 'Credit Hours')}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-indigo-600 font-medium">
                      {selectedCourseDetails?.department || t('علوم الحاسب', 'Computer Science')}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveCourseModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Course Badges & Attributes */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{t('طبيعة المقرر:', 'Course Nature:')}</span>
                <span className="font-bold text-slate-800">
                  {activeCourseModal.isMandatory ? t('إجباري تخصص للدرجة العلمية', 'Mandatory Degree Requirement') : t('اختياري معتمد', 'Elective')}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{t('حالة الطالب في المقرر:', 'Student Status:')}</span>
                {activeCourseModal.isRetake ? (
                  <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1">
                    <Flame className="w-3 h-3 text-rose-500" />
                    {t('إعادة لتحسين المعدل وإلغاء الإنذار (تسقف عند B+)', 'Retake (Capped at B+)')}
                  </span>
                ) : (
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {t('تسجيل لأول مرة (استيفاء ساعات نظامية)', 'First-Time Enrollment')}
                  </span>
                )}
              </div>

              {/* Prerequisites */}
              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                  {t('المتطلبات السابقة للمقرر:', 'Course Prerequisites:')}
                </span>
                {selectedCourseDetails?.prerequisites && selectedCourseDetails.prerequisites.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCourseDetails.prerequisites.map(p => {
                      const isPassed = student?.records.some(r => r.courseCode === p && r.status === 'PASSED');
                      return (
                        <span
                          key={p}
                          className={`font-mono text-xs font-bold px-2 py-1 rounded-lg border flex items-center gap-1 ${
                            isPassed
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {isPassed ? '✓ ' : '⏳ '}
                          {p}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">
                    {t('لا توجد متطلبات سابقة (مقرر مستوى أولي)', 'No prerequisites required.')}
                  </span>
                )}
              </div>

              {/* Unlocked Courses */}
              {unlockedCourses.length > 0 && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                    {t(`يفتح هذا المقرر (${unlockedCourses.length}) مقررات لاحقة:`, `Unlocks (${unlockedCourses.length}) future courses:`)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {unlockedCourses.map(u => (
                      <span
                        key={u.code}
                        className="font-mono text-[11px] font-semibold bg-white text-indigo-700 border border-slate-200 px-2 py-0.5 rounded-md"
                        title={language === 'ar' ? u.nameAr : u.nameEn}
                      >
                        {u.code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions in Modal */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={() => {
                  try {
                    localStorage.setItem(`staged_recovery_courses_${studentId}`, JSON.stringify([activeCourseModal.courseCode]));
                    localStorage.setItem('staged_recovery_courses', JSON.stringify([activeCourseModal.courseCode]));
                  } catch {}
                  setActiveCourseModal(null);
                  if (onNavigateTab) {
                    onNavigateTab('student-registration');
                  } else {
                    navigate('/student/registration');
                  }
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <CalendarCheck className="w-4 h-4" />
                <span>{t('تسجيل هذا المقرر في التسجيل الفصلي', 'Enroll in Registration')}</span>
              </button>

              <button
                onClick={() => setActiveCourseModal(null)}
                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                {t('إغلاق', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
