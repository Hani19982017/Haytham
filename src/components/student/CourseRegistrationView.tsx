import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import {
  Course,
  CourseOffering,
  RegistrationValidationDetails,
  ScheduleConflict,
  ScheduleWhatIfResult,
  SemesterScheduleRecommendation,
  Student,
  StudyPlan,
} from '../../types/index.js';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Layers,
  Wand2,
  Trash2,
  Plus,
  RefreshCw,
  Send,
  HelpCircle,
  GraduationCap,
  ShieldCheck,
  Building,
  Printer,
  ChevronRight,
  ArrowRight,
  X,
  Check,
  Eye,
  Info,
  Sliders,
} from 'lucide-react';

export const CourseRegistrationView: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();

  // Core Data States
  const [student, setStudent] = useState<Student | null>(null);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [recommendation, setRecommendation] = useState<SemesterScheduleRecommendation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Proposed Registration State (The DRAFT Schedule)
  const [selectedOfferingIds, setSelectedOfferingIds] = useState<string[]>([]);
  const [validation, setValidation] = useState<RegistrationValidationDetails | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Fix My Schedule (Automatic Conflict Solver)
  const [resolvingConflicts, setResolvingConflicts] = useState<boolean>(false);
  const [conflictResolutionResult, setConflictResolutionResult] = useState<any>(null);

  // Add Course Modal / Selector
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState<boolean>(false);
  const [addCourseSearch, setAddCourseSearch] = useState<string>('');
  const [activeLevelFilter, setActiveLevelFilter] = useState<number | 'ALL'>('ALL');

  // Confirmation & Submission
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<any>(null);
  const [showSlipModal, setShowSlipModal] = useState<boolean>(false);

  // What-If Sandbox State
  const [isWhatIfOpen, setIsWhatIfOpen] = useState<boolean>(false);
  const [whatIfTargetCourse, setWhatIfTargetCourse] = useState<string>('CS 201');
  const [whatIfAction, setWhatIfAction] = useState<'ADD' | 'REMOVE' | 'REPLACE'>('ADD');
  const [whatIfReplacement, setWhatIfReplacement] = useState<string>('CS 210');
  const [whatIfResult, setWhatIfResult] = useState<ScheduleWhatIfResult | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState<boolean>(false);

  // Full Degree Plan Modal (Level B Planning)
  const [isDegreePlanOpen, setIsDegreePlanOpen] = useState<boolean>(false);
  const [degreePlan, setDegreePlan] = useState<StudyPlan | null>(null);
  const [loadingDegreePlan, setLoadingDegreePlan] = useState<boolean>(false);

  // Load Initial Academic Data
  const loadAcademicData = async () => {
    const studentId = currentUser?.studentId || currentUser?.id || 'stu_omar';
    try {
      setLoading(true);
      const [studentData, offeringsData, coursesData, recData] = await Promise.all([
        api.getStudentById(studentId),
        api.getOfferings(),
        api.getCourses(),
        api.getRegistrationRecommendation(studentId),
      ]);

      setStudent(studentData);
      setOfferings(offeringsData);
      setCourses(coursesData);
      setRecommendation(recData);

      // Pre-populate draft with initial recommended offerings or adopted recovery plan
      let initialOfferingIds = recData && recData.recommendedCourses.length > 0
        ? recData.recommendedCourses.map(c => c.offeringId)
        : [];

      try {
        const stagedRaw = localStorage.getItem(`staged_recovery_courses_${studentId}`) || localStorage.getItem('staged_recovery_courses');
        if (stagedRaw) {
          const stagedCodes: string[] = JSON.parse(stagedRaw);
          if (stagedCodes.length > 0) {
            const stagedOfferings = stagedCodes
              .map(code => offeringsData.find(o => o.courseCode === code && o.enrolledCount < o.capacity))
              .filter((o): o is CourseOffering => !!o)
              .map(o => o.id);
            if (stagedOfferings.length > 0) {
              initialOfferingIds = Array.from(new Set([...stagedOfferings, ...initialOfferingIds]));
            }
          }
        }
      } catch {}

      if (initialOfferingIds.length > 0) {
        setSelectedOfferingIds(initialOfferingIds);
      }
    } catch (err) {
      console.error('Failed to load academic data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAcademicData();
  }, [currentUser]);

  // Lookup maps
  const courseMap = useMemo(() => new Map<string, Course>(courses.map(c => [c.code, c])), [courses]);
  const offeringMap = useMemo(() => new Map<string, CourseOffering>(offerings.map(o => [o.id, o])), [offerings]);

  // Selected Offerings Objects
  const selectedOfferings = useMemo(() => {
    return selectedOfferingIds
      .map(id => offeringMap.get(id))
      .filter((o): o is CourseOffering => !!o);
  }, [selectedOfferingIds, offeringMap]);

  // Selected Course Codes
  const selectedCourseCodes = useMemo(() => {
    return selectedOfferings.map(o => o.courseCode);
  }, [selectedOfferings]);

  // Total credits in draft
  const totalSelectedCredits = useMemo(() => {
    return selectedOfferings.reduce((sum, off) => {
      const c = courseMap.get(off.courseCode);
      return sum + (c ? c.credits : 3);
    }, 0);
  }, [selectedOfferings, courseMap]);

  // REAL-TIME VALIDATION whenever selected offerings change
  useEffect(() => {
    if (!student || selectedOfferings.length === 0) {
      setValidation(null);
      return;
    }

    let isMounted = true;
    const runValidation = async () => {
      setIsValidating(true);
      try {
        const res = await api.validateRegistrationSchedule(student.id, {
          offeringIds: selectedOfferingIds,
        });
        if (isMounted) {
          setValidation(res);
        }
      } catch (err) {
        console.error('Real-time validation error:', err);
      } finally {
        if (isMounted) setIsValidating(false);
      }
    };

    const timer = setTimeout(runValidation, 150);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [selectedOfferingIds, student]);

  // ACTION 1: Accept Entire Recommended Schedule
  const handleAcceptRecommendedSchedule = () => {
    if (!recommendation) return;
    const recOfferingIds = recommendation.recommendedCourses.map(c => c.offeringId);
    setSelectedOfferingIds(recOfferingIds);
    setSubmissionFeedback({
      type: 'INFO',
      messageAr: 'تم إدراج الجدول المقترح بالكامل في مسودة التسجيل الخاصة بك. يمكنك مراجعته أو تعديله قبل الإرسال.',
      messageEn: 'Recommended schedule added to your draft registration. You can review or modify before submission.',
    });
  };

  // ACTION 2: Add Single Course to Draft
  const handleAddCourseOffering = (offeringId: string) => {
    if (selectedOfferingIds.includes(offeringId)) return;
    setSelectedOfferingIds(prev => [...prev, offeringId]);
    setIsAddCourseModalOpen(false);
  };

  // ACTION 3: Remove Course from Draft
  const handleRemoveCourse = (courseCode: string) => {
    setSelectedOfferingIds(prev =>
      prev.filter(id => {
        const off = offeringMap.get(id);
        return off?.courseCode !== courseCode;
      })
    );
  };

  // ACTION 4: Switch Section for Course
  const handleSwitchSection = (courseCode: string, newOfferingId: string) => {
    setSelectedOfferingIds(prev => {
      const filtered = prev.filter(id => {
        const off = offeringMap.get(id);
        return off?.courseCode !== courseCode;
      });
      return [...filtered, newOfferingId];
    });
  };

  // ACTION 5: Fix My Schedule (Automatic Conflict Solver)
  const handleFixSchedule = async () => {
    if (!student || selectedCourseCodes.length === 0) return;
    setResolvingConflicts(true);
    setConflictResolutionResult(null);
    try {
      const res = await api.resolveScheduleConflicts(student.id, {
        courseCodes: selectedCourseCodes,
        currentOfferingIds: selectedOfferingIds,
      });

      setConflictResolutionResult(res);

      if (res.resolved && res.resolvedOfferings && res.resolvedOfferings.length > 0) {
        const newIds = res.resolvedOfferings.map((o: CourseOffering) => o.id);
        setSelectedOfferingIds(newIds);
      }
    } catch (err: any) {
      console.error('Conflict resolution failed:', err);
      setConflictResolutionResult({
        resolved: false,
        reasonAr: err?.response?.data?.error || 'حدث خطأ أثناء محاولة حل التعارضات.',
        reasonEn: 'An error occurred while resolving timetable conflicts.',
      });
    } finally {
      setResolvingConflicts(false);
    }
  };

  // ACTION 6: Run What-If Simulation
  const handleRunWhatIf = async () => {
    if (!student) return;
    setWhatIfLoading(true);
    try {
      const res = await api.simulateScheduleWhatIf(student.id, {
        currentCourseCodes: selectedCourseCodes,
        action: {
          type: whatIfAction,
          targetCourseCode: whatIfTargetCourse,
          replacementCourseCode: whatIfAction === 'REPLACE' ? whatIfReplacement : undefined,
        },
      });
      setWhatIfResult(res);
    } catch (err) {
      console.error('What-If simulation error:', err);
    } finally {
      setWhatIfLoading(false);
    }
  };

  // ACTION 7: Open Degree Graduation Plan
  const handleOpenDegreePlan = async () => {
    if (!student) return;
    setIsDegreePlanOpen(true);
    setLoadingDegreePlan(true);
    try {
      const plan = await api.getDegreeGraduationPlan(student.id);
      setDegreePlan(plan);
    } catch (err) {
      console.error('Failed to load degree plan:', err);
    } finally {
      setLoadingDegreePlan(false);
    }
  };

  // ACTION 8: Submit Proposed Schedule for Advisor Review
  const handleSubmitProposedSchedule = async () => {
    if (!student) return;
    if (validation && !validation.valid) {
      setSubmissionFeedback({
        type: 'ERROR',
        messageAr: 'لا يمكن إرسال الجدول لوجود أخطاء أو تعارضات غير محلولة. يرجى مراجعة تنبيهات الجدول أدناه.',
        messageEn: 'Cannot submit schedule with unresolved conflicts or bylaw errors. Please check the notices below.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.submitProposedSchedule(student.id, {
        offeringIds: selectedOfferingIds,
        courseCodes: selectedCourseCodes,
      });

      setSubmissionFeedback({
        type: 'SUCCESS',
        messageAr: res.messageAr || 'تم إرسال الجدول الدراسي المقترح إلى المرشد الأكاديمي للاعتماد بنجاح.',
        messageEn: res.messageEn || 'Proposed schedule submitted to advisor for review.',
      });

      // Reload updated student status
      const updated = await api.getStudentById(student.id);
      setStudent(updated);
    } catch (err: any) {
      console.error('Submission failed:', err);
      setSubmissionFeedback({
        type: 'ERROR',
        messageAr: err?.response?.data?.messageAr || 'فشل إرسال الجدول. يرجى المحاولة مرة أخرى.',
        messageEn: err?.response?.data?.messageEn || 'Schedule submission failed.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Days list for timetable
  const daysList = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const periodsList = [
    { num: 1, time: '08:30 - 10:00' },
    { num: 2, time: '10:00 - 11:30' },
    { num: 3, time: '11:30 - 12:00' }, // Break
    { num: 4, time: '12:00 - 01:30' },
    { num: 5, time: '01:30 - 03:00' },
    { num: 6, time: '03:00 - 04:30' },
  ];

  if (loading || !student) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-3">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs text-slate-600 font-medium">
          {t('جاري تحليل السجل الأكاديمي وتوليد مقترح الجدول الفصلي الذكي...', 'Analyzing academic record & generating smart schedule recommendation...')}
        </span>
      </div>
    );
  }

  const isScheduleValid = validation ? validation.valid : selectedOfferings.length > 0;
  const maxAllowedCredits = recommendation?.maxAllowedCredits || 15;

  return (
    <div className="space-y-6 w-full">
      {/* ========================================================
          1. STUDENT ACADEMIC BANNER & ADVISOR STATUS
      ======================================================== */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h1 className="text-lg font-bold text-slate-900">
                {t('بوابة الإرشاد الأكاديمي الذكي والتسجيل الفصلي', 'Smart Academic Advising & Semester Course Registration')}
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              {t(
                'يقوم النظام بتحليل سجلك الأكاديمي مسبقاً وتوجيهك خطوة بخطوة لبناء جدول دراسي مثالي خالٍ من التعارضات ومطابق للائحة.',
                'The system proactively analyzes your record to guide you through building an optimal, conflict-free schedule matching university bylaws.'
              )}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleOpenDegreePlan}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition cursor-pointer flex items-center gap-1.5"
            >
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              {t('الخطة الكاملة حتى التخرج', 'Full Degree Plan')}
            </button>
            <button
              onClick={() => setIsWhatIfOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer flex items-center gap-1.5"
            >
              <Wand2 className="w-4 h-4 text-amber-600" />
              {t('محاكي ماذا لو (Sandbox)', 'What-If Simulator')}
            </button>
          </div>
        </div>

        {/* Academic Profile Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <span className="text-[11px] text-slate-400 block mb-0.5">{t('اسم الطالب', 'Student Name')}</span>
            <strong className="text-slate-900 block truncate" title={student.nameAr}>{student.nameAr}</strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block mb-0.5">{t('الرقم الجامعي', 'Student Code')}</span>
            <strong className="font-mono text-slate-900 block">{student.studentCode}</strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block mb-0.5">{t('المستوى والمسار', 'Level & Track')}</span>
            <strong className="text-slate-900 block truncate">{t(`المستوى ${student.level}`, `Level ${student.level}`)} | {student.track}</strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block mb-0.5">{t('المعدل التراكمي', 'Cumulative GPA')}</span>
            <strong className={`text-sm block ${student.cumulativeGpa < 2.0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {student.cumulativeGpa.toFixed(2)} / 4.00
            </strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block mb-0.5">{t('الساعات المنجزة', 'Completed Hours')}</span>
            <strong className="text-slate-900 block">{student.completedCredits} / 134 {t('ساعة', 'hrs')}</strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block mb-0.5">{t('الحد الأقصى المسموح', 'Credit Ceiling')}</span>
            <strong className="text-indigo-700 font-bold block">{maxAllowedCredits} {t('ساعة معتمدة', 'credits')}</strong>
          </div>
          <div>
            <span className="text-[11px] text-slate-400 block mb-0.5">{t('حالة الاعتماد', 'Review Status')}</span>
            <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
              student.currentPlanStatus === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
              student.currentPlanStatus === 'Pending Review' ? 'bg-amber-100 text-amber-800' :
              'bg-slate-200 text-slate-800'
            }`}>
              {student.currentPlanStatus === 'Approved' ? t('معتمد رسمياً', 'Approved') :
               student.currentPlanStatus === 'Pending Review' ? t('بانتظار مراجعة المرشد', 'Pending Review') :
               t('مسودة غير معتمدة', 'Draft')}
            </span>
          </div>
        </div>

        {/* Warning Notification if on academic warning */}
        {student.cumulativeGpa < 2.0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-rose-900">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block text-sm">
                {t('🔴 أنت حالياً تحت إنذار أكاديمي رقم 2', '🔴 You are currently under Academic Warning #2')}
              </strong>
              <p className="mt-0.5 text-rose-800">
                {t(
                  'وفقاً للائحة الساعات المعتمدة، حد التسجيل الأقصى لمعدلك هو 15 ساعة فقط. نوصي بشدة بالتركيز على إعادة المقررات التي رسبت فيها لرفع المعدل التراكمي وتفادي خطر الفصل الأكاديمي.',
                  'According to bylaws, your registration is capped at 15 credits. We strongly recommend prioritizing failed courses to boost your GPA and clear academic warnings.'
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          2. SECTION A: "مقترح لك هذا الفصل" (RECOMMENDED SEMESTER PLAN)
      ======================================================== */}
      {recommendation && (
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-sm space-y-5 border border-indigo-800/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-500/20 rounded-lg text-indigo-300">
                  <Sparkles className="w-5 h-5" />
                </span>
                <h2 className="text-lg font-bold">
                  {t('مقترح لك هذا الفصل الدراسي (الجدول الذكي الموصى به)', 'Recommended for You This Semester (Smart Plan)')}
                </h2>
              </div>
              <p className="text-xs text-indigo-200 max-w-3xl">
                {language === 'ar' ? recommendation.academicStandingNoteAr : recommendation.academicStandingNoteEn}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleAcceptRecommendedSchedule}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t('اعتماد الجدول المقترح كمسودة', 'Accept Recommended Schedule as Draft')}
              </button>
            </div>
          </div>

          {/* Recommended Rationale Pills */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {recommendation.rationaleAr.map((rat, i) => (
              <div key={i} className="bg-indigo-800/30 border border-indigo-700/40 p-2.5 rounded-xl flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-indigo-100 text-[11px] leading-relaxed">
                  {language === 'ar' ? rat : recommendation.rationaleEn[i]}
                </span>
              </div>
            ))}
          </div>

          {/* Recommended Course Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
            {recommendation.recommendedCourses.map((rec, recIdx) => {
              const isAlreadyInDraft = selectedOfferings.some(o => o.courseCode === rec.courseCode);
              return (
                <div
                  key={`${rec.courseCode}_${rec.offeringId || recIdx}`}
                  className={`bg-white text-slate-900 rounded-xl p-4 border transition flex flex-col justify-between ${
                    rec.isRetake ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                            {rec.courseCode}
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            {rec.credits} {t('ساعات', 'credits')}
                          </span>
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 mt-1">
                          {language === 'ar' ? rec.courseNameAr : rec.courseNameEn}
                        </h3>
                      </div>

                      {/* Importance Badge */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          rec.importance === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-800'
                            : rec.importance === 'HIGH'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {rec.importance === 'CRITICAL' ? t('إعادة إلزامية', 'Critical Retake') :
                         rec.importance === 'HIGH' ? t('مفتاحي عالي الأهمية', 'Key Bottleneck') :
                         t('متطلب إجباري', 'Required Core')}
                      </span>
                    </div>

                    {/* Schedule Time & Room */}
                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="font-medium">{language === 'ar' ? rec.daysAr : rec.daysEn}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px]">{rec.timeRangeAr}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-500 text-[11px] truncate">{rec.hall}</span>
                      </div>
                    </div>

                    {/* Explicit Reason for Recommendation */}
                    <div className="text-xs space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 block">
                        {t('سبب التوصية:', 'Reason for Recommendation:')}
                      </span>
                      <p className={`text-xs font-medium leading-relaxed ${rec.isRetake ? 'text-rose-700' : 'text-indigo-900'}`}>
                        {language === 'ar' ? rec.primaryReasonAr : rec.primaryReasonEn}
                      </p>

                      {rec.unlocksFutureCourses.length > 0 && (
                        <p className="text-[11px] text-slate-500">
                          {t('يفتح مستقبلاً:', 'Unlocks:')} {rec.unlocksFutureCourses.slice(0, 2).join('، ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Add / Status Footer */}
                  <div className="pt-3 border-t border-slate-100 mt-3 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {rec.prerequisitesStatusAr}
                    </span>
                    {isAlreadyInDraft ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                        <Check className="w-3.5 h-3.5" />
                        {t('مضاف للمسودة', 'In Draft')}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAddCourseOffering(rec.offeringId)}
                        className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 text-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('إضافة للمسودة', 'Add to Draft')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================
          3. REAL-TIME NOTICES & CONFLICT RESOLUTION BOX
      ======================================================== */}
      {validation && (
        <div className="space-y-3">
          {/* Schedule Conflicts Alert */}
          {validation.scheduleConflicts.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">
                      {t('⚠️ تنبيه تعارض في المواعيد (Schedule Conflict)', '⚠️ Schedule Conflict Detected')}
                    </h3>
                    <p className="text-xs text-amber-800 mt-0.5">
                      {t(
                        'لا يمكن تسجيل المقررات المتعارضة في نفس الفترة الزمنية. يرجى اختيار شعبة بديلة أو الضغط على «إصلاح الجدول تلقائياً».',
                        'Conflicting courses cannot be registered at the same time slot. Select an alternative section or click "Fix My Schedule".'
                      )}
                    </p>
                  </div>
                </div>

                {/* Fix My Schedule CTA */}
                <button
                  onClick={handleFixSchedule}
                  disabled={resolvingConflicts}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Wand2 className="w-4 h-4" />
                  {resolvingConflicts ? t('جاري البحث عن شعب بديلة...', 'Searching alternatives...') : t('إصلاح الجدول تلقائياً (Fix My Schedule)', 'Fix My Schedule')}
                </button>
              </div>

              {/* Conflict Pair Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {validation.scheduleConflicts.map((conf, idx) => (
                  <div key={idx} className="bg-white rounded-xl p-3.5 border border-amber-200 shadow-xs space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                      <span>{t('تعارض يوم:', 'Conflict Day:')} {conf.dayAr}</span>
                      <span className="font-mono text-amber-700">{conf.timeRangeAr}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* Course 1 */}
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <strong className="block text-slate-900 truncate">{conf.courseName1Ar}</strong>
                        <span className="font-mono text-[11px] text-slate-500">{conf.courseCode1} ({conf.section1})</span>
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            onClick={() => handleRemoveCourse(conf.courseCode1)}
                            className="text-rose-600 hover:underline text-[11px] font-bold cursor-pointer"
                          >
                            {t('إزالة', 'Remove')}
                          </button>
                          {conf.alternativeSectionsFor1 && conf.alternativeSectionsFor1.length > 0 && (
                            <select
                              onChange={(e) => handleSwitchSection(conf.courseCode1, e.target.value)}
                              className="text-[10px] bg-white border border-slate-300 rounded px-1.5 py-0.5 cursor-pointer"
                              defaultValue=""
                            >
                              <option value="" disabled>{t('شعبة بديلة', 'Alt Section')}</option>
                              {conf.alternativeSectionsFor1.map(alt => (
                                <option key={alt.id} value={alt.id}>
                                  {alt.sectionCode}: {alt.lectureDayTimeAr}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>

                      {/* Course 2 */}
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <strong className="block text-slate-900 truncate">{conf.courseName2Ar}</strong>
                        <span className="font-mono text-[11px] text-slate-500">{conf.courseCode2} ({conf.section2})</span>
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            onClick={() => handleRemoveCourse(conf.courseCode2)}
                            className="text-rose-600 hover:underline text-[11px] font-bold cursor-pointer"
                          >
                            {t('إزالة', 'Remove')}
                          </button>
                          {conf.alternativeSectionsFor2 && conf.alternativeSectionsFor2.length > 0 && (
                            <select
                              onChange={(e) => handleSwitchSection(conf.courseCode2, e.target.value)}
                              className="text-[10px] bg-white border border-slate-300 rounded px-1.5 py-0.5 cursor-pointer"
                              defaultValue=""
                            >
                              <option value="" disabled>{t('شعبة بديلة', 'Alt Section')}</option>
                              {conf.alternativeSectionsFor2.map(alt => (
                                <option key={alt.id} value={alt.id}>
                                  {alt.sectionCode}: {alt.lectureDayTimeAr}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Conflict Solver Result Feedback */}
              {conflictResolutionResult && (
                <div className={`p-3 rounded-xl text-xs border ${
                  conflictResolutionResult.resolved
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  <strong className="font-bold block mb-1">
                    {conflictResolutionResult.resolved ? t('✓ تم إيجاد شعب بديلة بنجاح:', '✓ Alternative sections found:') : t('تعذر إيجاد حل تلقائي:', 'Could not resolve automatically:')}
                  </strong>
                  {conflictResolutionResult.resolved ? (
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {conflictResolutionResult.resolutionSummaryAr.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px]">{conflictResolutionResult.reasonAr}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Prerequisite Errors with SMART ALTERNATIVE SUGGESTION */}
          {validation.prerequisiteErrors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-900 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">
                    {t('❌ المتطلب السابق غير مستوفى (Prerequisite Not Satisfied)', '❌ Prerequisite Not Satisfied')}
                  </h4>
                  <p className="text-rose-800 text-xs mt-0.5">
                    {t('لا تتيح اللائحة تسجيل هذه المقررات قبل اجتياز متطلباتها السابقة. اقترحنا لك المتطلب السابق كبديل مباشر:', 'Bylaws prevent enrolling before passing prerequisites. We suggested the prerequisite course as an immediate alternative:')}
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {validation.prerequisiteErrors.map((err, i) => (
                  <div key={i} className="bg-white p-3 rounded-lg border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900">{err.courseNameAr} ({err.courseCode})</span>
                      <span className="text-rose-600 block text-[11px] mt-0.5">
                        {t('يتطلب اجتياز:', 'Requires passing:')} <strong>{err.missingPrereqNameAr} ({err.missingPrereqCode})</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRemoveCourse(err.courseCode)}
                        className="px-2.5 py-1 text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg text-xs cursor-pointer"
                      >
                        {t('إزالة المقرر', 'Remove Course')}
                      </button>
                      {/* Suggest prerequisite as alternative */}
                      {err.suggestedAlternativeCode && (
                        <button
                          onClick={() => {
                            handleRemoveCourse(err.courseCode);
                            const altOff = offerings.find(o => o.courseCode === err.suggestedAlternativeCode);
                            if (altOff) handleAddCourseOffering(altOff.id);
                          }}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          {t(`تسجيل المتطلب (${err.suggestedAlternativeCode}) بدلاً منه`, `Register (${err.suggestedAlternativeCode}) instead`)}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credit Limit Error */}
          {validation.creditLimitError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">
                  {t('⚠️ تجاوز الحد الأقصى للساعات المسموحة (Credit Limit Exceeded)', '⚠️ Credit Limit Exceeded')}
                </h4>
                <p className="mt-0.5 text-rose-800">
                  {t(
                    `مجموع الساعات المختارة (${validation.creditLimitError.totalCredits} ساعة) يتجاوز سقف معدلك التراكمي (${validation.creditLimitError.maxAllowed} ساعة) بمقدار ${validation.creditLimitError.excessCredits} ساعات. يرجى إزالة مقرر ليتسنى لك الاعتماد.`,
                    `Selected load (${validation.creditLimitError.totalCredits} credits) exceeds your GPA limit (${validation.creditLimitError.maxAllowed} credits) by ${validation.creditLimitError.excessCredits} credits. Please remove a course to proceed.`
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          4. SECTION B: "جدولي الحالي ومسودة التسجيل" (DRAFT SCHEDULE BUILDER)
      ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Header Strip */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                {t('جدولي الدراسي الفصلي ومسودة التسجيل', 'Semester Draft Schedule Builder')}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isScheduleValid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {isScheduleValid ? t('✓ الجدول سليم (Valid)', '✓ Valid Schedule') : t('⚠️ يتطلب تعديلات (Changes Required)', '⚠️ Changes Required')}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('يمكنك تخصيص جدولك، تغيير الشعب، إضافة أو حذف مقررات، مع فحص لحظي فوري للائحة.', 'Customize your schedule, change sections, add or remove courses with instant real-time bylaw checks.')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-right sm:text-left">
              <span className="text-slate-400 block text-[11px]">{t('إجمالي الساعات المسجلة', 'Total Selected Hours')}</span>
              <strong className={`text-sm font-extrabold ${totalSelectedCredits > maxAllowedCredits ? 'text-rose-600' : 'text-indigo-600'}`}>
                {totalSelectedCredits} / {maxAllowedCredits} {t('ساعة', 'hrs')}
              </strong>
            </div>

            <button
              onClick={() => setIsAddCourseModalOpen(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              {t('إضافة مقرر آخر', 'Add Another Course')}
            </button>
          </div>
        </div>

        {/* Selected Courses Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-sky-50/60 text-slate-700 font-bold border-b border-sky-100">
              <tr>
                <th className="px-3 py-3 text-center w-10">#</th>
                <th className="px-4 py-3 min-w-[200px]">{t('اسم المقرر', 'Course Title')}</th>
                <th className="px-3 py-3 text-center min-w-[90px]">{t('كود المقرر', 'Code')}</th>
                <th className="px-3 py-3 text-center min-w-[70px]">{t('الساعات', 'Credits')}</th>
                <th className="px-3 py-3 min-w-[140px]">{t('الشعبة والمحاضر', 'Section & Instructor')}</th>
                <th className="px-3 py-3 min-w-[130px]">{t('اليوم والموعد', 'Day & Time')}</th>
                <th className="px-3 py-3 min-w-[120px]">{t('القاعة / المعمل', 'Hall / Lab')}</th>
                <th className="px-3 py-3 text-center min-w-[90px]">{t('السعة المتاحة', 'Capacity')}</th>
                <th className="px-3 py-3 text-center min-w-[100px]">{t('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {selectedOfferings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    {t('لم تقم باختيار أي مقررات بعد. انقر على «اعتماد الجدول المقترح» بالأعلى أو أضف مقررات يدوياً.', 'No courses selected yet. Click "Accept Recommended Schedule" above or add courses manually.')}
                  </td>
                </tr>
              ) : (
                selectedOfferings.map((off, idx) => {
                  const course = courseMap.get(off.courseCode);
                  const isRetake = student.records.some(r => r.courseCode === off.courseCode && r.status === 'FAILED');
                  const otherSections = offerings.filter(o => o.courseCode === off.courseCode && o.id !== off.id);
                  const availableSeats = off.capacity - off.enrolledCount;

                  return (
                    <tr key={off.id} className={`hover:bg-slate-50 transition ${isRetake ? 'bg-rose-50/20' : ''}`}>
                      <td className="px-3 py-3 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <strong className={`block text-xs ${isRetake ? 'text-rose-700' : 'text-slate-900'}`}>
                          {language === 'ar' ? course?.nameAr : course?.nameEn}
                        </strong>
                        {isRetake && (
                          <span className="inline-block mt-0.5 px-2 py-0.2 bg-rose-100 text-rose-800 rounded text-[10px] font-bold">
                            {t('إعادة لرفع المعدل', 'Retake for GPA recovery')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-mono font-bold text-slate-800">
                        {off.courseCode}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-slate-800">
                        {course?.credits || 3}
                      </td>
                      <td className="px-3 py-3">
                        {otherSections.length > 0 ? (
                          <select
                            value={off.id}
                            onChange={(e) => handleSwitchSection(off.courseCode, e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium cursor-pointer"
                          >
                            <option value={off.id}>{off.sectionCode || 'شعبة 1'}</option>
                            {otherSections.map(alt => (
                              <option key={alt.id} value={alt.id}>
                                {alt.sectionCode || 'شعبة بديلة'} ({alt.lectureDayTimeAr})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-800 text-xs">{off.sectionCode || 'شعبة 1'}</span>
                        )}
                        <span className="block text-[11px] text-slate-500 truncate">{off.instructorName.split('(')[0]}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block font-medium text-slate-800">{off.lectureDayTimeAr}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-600 truncate">
                        {off.hall}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono text-xs font-bold ${availableSeats <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {availableSeats} / {off.capacity}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => handleRemoveCourse(off.courseCode)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title={t('إزالة من المسودة', 'Remove from draft')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          5. SECTION C: "الجدول الدراسي الأسبوعي التفاعلي" (TIMETABLE)
      ======================================================== */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">
              {t('الجدول الدراسي الأسبوعي (معاينة التوزيع الزمني للشعب)', 'Weekly Timetable Preview')}
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {t('يتم تحديث الفترات فورياً بناءً على الشعب المختارة أعلاه', 'Slots update dynamically based on selected sections')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold text-xs">
                <th className="p-2.5 border border-slate-200 w-24">{t('اليوم', 'Day')}</th>
                {periodsList.map(p => (
                  <th key={p.num} className="p-2.5 border border-slate-200">
                    <span className="block">{t(`الفترة ${p.num}`, `Period ${p.num}`)}</span>
                    <span className="font-mono text-[10px] text-slate-400 font-normal">{p.time}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daysList.map(day => (
                <tr key={day} className="text-xs">
                  <td className="p-2.5 bg-slate-50 font-bold text-slate-800 border border-slate-200">
                    {day}
                  </td>
                  {periodsList.map(period => {
                    // Find offerings that occur on this day and during this period
                    const matchingOfferings = selectedOfferings.filter(o => {
                      const dayMatch = o.days ? o.days.includes(day) : o.lectureDayTimeAr.includes(day);
                      if (!dayMatch) return false;
                      if (o.periods && o.periods.length > 0) {
                        return o.periods.includes(period.num);
                      }
                      // Fallback time matching
                      if (period.num === 1 && o.lectureDayTimeAr.includes('08:30')) return true;
                      if (period.num === 2 && o.lectureDayTimeAr.includes('10:00')) return true;
                      if (period.num === 4 && o.lectureDayTimeAr.includes('12:00')) return true;
                      if (period.num === 5 && o.lectureDayTimeAr.includes('01:00') || o.lectureDayTimeAr.includes('01:30')) return true;
                      return false;
                    });

                    const isConflict = matchingOfferings.length > 1;

                    return (
                      <td
                        key={period.num}
                        className={`p-2 border border-slate-200 h-16 align-middle ${
                          isConflict ? 'bg-amber-100/80 border-amber-300' : matchingOfferings.length > 0 ? 'bg-indigo-50/70' : ''
                        }`}
                      >
                        {matchingOfferings.map(o => (
                          <div
                            key={o.id}
                            className={`p-1.5 rounded-lg text-[11px] font-bold shadow-2xs mb-1 ${
                              isConflict
                                ? 'bg-amber-600 text-white animate-pulse'
                                : 'bg-indigo-600 text-white'
                            }`}
                          >
                            <span className="block truncate">{o.courseCode}</span>
                            <span className="block text-[10px] opacity-80 truncate">{o.hall}</span>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          6. SECTION D: FINAL CONFIRMATION & ADVISOR SUBMISSION
      ======================================================== */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {t('مراجعة واعتماد الجدول الدراسي الفصلي', 'Review & Submit Proposed Schedule')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(
                'عند إرسال الجدول، يتم حفظه كمسودة رسمية وإحالته للمرشد الأكاديمي للاعتماد النهائي وتوثيقه في سجل التدقيق.',
                'Submitting saves this schedule and routes it to your academic advisor for final approval, logging to the immutable audit trail.'
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSlipModal(true)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              {t('معاينة الاستمارة الرسمية', 'Preview Registration Slip')}
            </button>

            <button
              onClick={handleSubmitProposedSchedule}
              disabled={isSubmitting || !isScheduleValid || selectedOfferings.length === 0}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer ${
                isScheduleValid && selectedOfferings.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
              {isSubmitting ? t('جاري الإرسال...', 'Submitting...') : t('إرسال الجدول للمرشد الأكاديمي للاعتماد', 'Submit to Advisor for Approval')}
            </button>
          </div>
        </div>

        {/* Submission Feedback Alert */}
        {submissionFeedback && (
          <div
            className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
              submissionFeedback.type === 'SUCCESS'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : submissionFeedback.type === 'ERROR'
                ? 'bg-rose-50 border border-rose-200 text-rose-900'
                : 'bg-indigo-50 border border-indigo-200 text-indigo-900'
            }`}
          >
            {submissionFeedback.type === 'SUCCESS' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : submissionFeedback.type === 'ERROR' ? (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            )}
            <div>
              <strong className="font-bold block text-sm mb-0.5">
                {language === 'ar' ? submissionFeedback.messageAr : submissionFeedback.messageEn}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          7. MODAL: ADD COURSE SELECTOR
      ======================================================== */}
      {isAddCourseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">
                {t('إضافة مقرر دراسي للمسودة', 'Add Course to Registration Draft')}
              </h3>
              <button
                onClick={() => setIsAddCourseModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Level Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveLevelFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  activeLevelFilter === 'ALL'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {t('الكل', 'All')}
              </button>
              {[1, 2, 3, 4].map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setActiveLevelFilter(lvl)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                    activeLevelFilter === lvl
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {t(`المستوى ${lvl}`, `Level ${lvl}`)}
                </button>
              ))}
            </div>

            {/* Offerings List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {offerings
                .filter(off => {
                  const course = courseMap.get(off.courseCode);
                  if (activeLevelFilter !== 'ALL' && course?.level !== activeLevelFilter) return false;
                  if (selectedOfferingIds.includes(off.id)) return false;
                  return true;
                })
                .map(off => {
                  const course = courseMap.get(off.courseCode);
                  const isFull = off.enrolledCount >= off.capacity;
                  return (
                    <div
                      key={off.id}
                      className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 bg-slate-50/50 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-700">{off.courseCode}</span>
                          <span className="font-bold text-slate-900">{language === 'ar' ? course?.nameAr : course?.nameEn}</span>
                          <span className="text-slate-400 text-[11px]">({course?.credits || 3} ساعات)</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                          <span>{off.sectionCode || 'شعبة 1'}</span>
                          <span>•</span>
                          <span>{off.lectureDayTimeAr}</span>
                          <span>•</span>
                          <span>{off.hall}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAddCourseOffering(off.id)}
                        disabled={isFull}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          isFull
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                        }`}
                      >
                        {isFull ? t('شعبة ممتلئة', 'Full') : t('إدراج', 'Add')}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          8. MODAL: WHAT-IF SCHEDULE SIMULATOR (SANDBOX)
      ======================================================== */}
      {isWhatIfOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-base text-slate-900">
                  {t('محاكي ماذا لو الفصلي (What-If Sandbox)', 'What-If Schedule Simulator')}
                </h3>
              </div>
              <button onClick={() => setIsWhatIfOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {t(
                'اختبر تأثير إضافة أو حذف مقرر أو إعادة دراسته على معدلك التراكمي وموعد تخرجك وساعاتك المعتمدة. هذه البيئة تجريبية آمنة ولا تعدل أي بيانات في سجلك الحقيقي.',
                'Test the impact of adding, removing, or retaking a course on your GPA, graduation timeline, and credits. This is a safe sandbox and never mutates your real record.'
              )}
            </p>

            {/* Simulation Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">{t('نوع الإجراء', 'Action Type')}</label>
                <select
                  value={whatIfAction}
                  onChange={(e: any) => setWhatIfAction(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                >
                  <option value="ADD">{t('ماذا لو أضفت مقرر؟', 'Add Course')}</option>
                  <option value="REMOVE">{t('ماذا لو حذفت مقرر؟', 'Remove Course')}</option>
                  <option value="REPLACE">{t('ماذا لو استبدلت مقرر؟', 'Replace Course')}</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">{t('المقرر المستهدف', 'Target Course')}</label>
                <select
                  value={whatIfTargetCourse}
                  onChange={(e) => setWhatIfTargetCourse(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                >
                  {courses.slice(0, 15).map(c => (
                    <option key={c.code} value={c.code}>{c.code} - {c.nameAr}</option>
                  ))}
                </select>
              </div>

              {whatIfAction === 'REPLACE' && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">{t('المقرر البديل', 'Replacement Course')}</label>
                  <select
                    value={whatIfReplacement}
                    onChange={(e) => setWhatIfReplacement(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                  >
                    {courses.slice(10, 25).map(c => (
                      <option key={c.code} value={c.code}>{c.code} - {c.nameAr}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={handleRunWhatIf}
              disabled={whatIfLoading}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Wand2 className="w-4 h-4" />
              {whatIfLoading ? t('جاري المحاكاة والحساب...', 'Simulating...') : t('تشغيل محاكاة السيناريو', 'Run Simulation')}
            </button>

            {/* Simulation Results Display */}
            {whatIfResult && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3 text-xs">
                <h4 className="font-bold text-amber-950 text-sm">{t('نتائج المحاكاة التقديرية:', 'Simulation Projections:')}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-400 block">{t('المعدل التراكمي المتوقع', 'Projected GPA')}</span>
                    <strong className="text-sm text-emerald-700">{whatIfResult.projectedGpa.toFixed(2)}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-400 block">{t('الساعات المخططة', 'Projected Hours')}</span>
                    <strong className="text-sm text-indigo-700">{whatIfResult.projectedCredits} ساعة</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-400 block">{t('المقررات المفتوحة', 'Unlocked Courses')}</span>
                    <strong className="text-sm text-slate-800">{whatIfResult.unlockedCoursesCount}</strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-400 block">{t('فصل التخرج المتوقع', 'Expected Graduation')}</span>
                    <strong className="text-xs text-slate-800 block truncate">{whatIfResult.expectedGraduationSemesterAr}</strong>
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  {whatIfResult.notesAr.map((note, idx) => (
                    <p key={idx} className="text-amber-900 font-medium text-[11px] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      {note}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          9. MODAL: FULL DEGREE GRADUATION PLAN (LEVEL B PLANNING)
      ======================================================== */}
      {isDegreePlanOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">
                  {t('الخطة الكاملة المتبقية حتى التخرج (Level B Planning)', 'Full Remaining Degree Plan to Graduation')}
                </h3>
              </div>
              <button onClick={() => setIsDegreePlanOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {t(
                'توزيع ذكي وممنهج لكافة المقررات والمتطلبات المتبقية على الفصول الدراسية القادمة لضمان التخرج في أسرع وقت ممكن وبدون أي تعارضات.',
                'Systematic semester-by-semester distribution of all remaining degree requirements ensuring on-time graduation.'
              )}
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingDegreePlan ? (
                <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
                  {t('جاري توليد الخطة الاستراتيجية للتخرج...', 'Generating degree graduation roadmap...')}
                </div>
              ) : degreePlan ? (
                degreePlan.semesters.map((sem) => (
                  <div key={sem.semesterIndex} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <strong className="text-xs font-bold text-indigo-900">{sem.semesterNameAr}</strong>
                      <span className="text-[11px] font-mono font-bold text-slate-600">
                        {sem.totalCredits} {t('ساعة معتمدة', 'credits')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {sem.courses.map((c, cIdx) => (
                        <div key={`${c.courseCode}_${cIdx}`} className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                          <span className="font-medium text-slate-800">{c.courseNameAr}</span>
                          <span className="font-mono text-[11px] text-slate-500">{c.courseCode}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  {t('تعذر تحميل الخطة.', 'Failed to load plan.')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          10. MODAL: OFFICIAL REGISTRATION SLIP (PRINT PREVIEW)
      ======================================================== */}
      {showSlipModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">
                {t('استمارة تسجيل المقررات الرسمية (Registration Slip)', 'Official Course Registration Slip')}
              </h3>
              <button onClick={() => setShowSlipModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-slate-50/50 text-xs text-slate-800">
              <div className="text-center pb-2 border-b border-slate-200">
                <h4 className="font-bold text-sm">جامعة مصر للعلوم والتكنولوجيا</h4>
                <p className="text-[11px] text-slate-500">كلية تكنولوجيا المعلومات | برنامج علوم الحاسب بنظام الساعات المعتمدة</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>الطالب: <strong>{student.nameAr}</strong></div>
                <div>الرقم الجامعي: <strong className="font-mono">{student.studentCode}</strong></div>
                <div>المعدل التراكمي: <strong>{student.cumulativeGpa.toFixed(2)}</strong></div>
                <div>إجمالي الساعات المسجلة: <strong>{totalSelectedCredits} ساعة</strong></div>
              </div>

              <div className="pt-2">
                <strong className="block text-xs mb-1 font-bold">المقررات المسجلة رسمياً:</strong>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  {selectedOfferings.map(o => (
                    <li key={o.id}>
                      {o.courseCode} - {courseMap.get(o.courseCode)?.nameAr} ({o.lectureDayTimeAr})
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSlipModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                {t('إغلاق', 'Close')}
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                {t('طباعة الاستمارة', 'Print Slip')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
