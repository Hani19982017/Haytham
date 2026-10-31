import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import {
  Course,
  CourseOffering,
  RegistrationValidationDetails,
  ScheduleWhatIfResult,
  SemesterScheduleRecommendation,
  Student,
  StudyPlan,
} from '../../types/index.js';
import { INSTITUTION } from '../../config/institution.js';
import {
  PageHeader,
  Panel,
  PanelHeader,
  Segmented,
  Modal,
  Toast,
  Loader,
  EmptyState,
  CodeBadge,
  Chip,
  Meter,
  KeyValue,
  BrandMark,
  cn,
  toneColor,
  toneText,
  chipClass,
  planStatusTone,
  planStatusLabel,
  trackLabel,
  pick,
  personName,
  type Tone,
} from '../ui/index.js';
import {
  CalendarCheck,
  CalendarDays,
  GraduationCap,
  GitFork,
  Signpost,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Check,
  Plus,
  Trash2,
  Wand2,
  Send,
  Printer,
  Search,
  Clock,
  Info,
  RotateCcw,
  FileText,
} from 'lucide-react';

/* ----------------------------------------------------------------------------
 * Timetable model
 * -------------------------------------------------------------------------- */
const DAYS: { ar: string; en: string; short: string }[] = [
  { ar: 'الأحد', en: 'Sunday', short: 'sun' },
  { ar: 'الإثنين', en: 'Monday', short: 'mon' },
  { ar: 'الثلاثاء', en: 'Tuesday', short: 'tue' },
  { ar: 'الأربعاء', en: 'Wednesday', short: 'wed' },
  { ar: 'الخميس', en: 'Thursday', short: 'thu' },
];

// Minutes since midnight for each teaching period of the day.
const SLOTS = [
  { num: 1, time: '08:30 - 10:00', start: 510, end: 600, isBreak: false },
  { num: 2, time: '10:00 - 11:30', start: 600, end: 690, isBreak: false },
  { num: 3, time: '11:30 - 12:00', start: 690, end: 720, isBreak: true },
  { num: 4, time: '12:00 - 01:30', start: 720, end: 810, isBreak: false },
  { num: 5, time: '01:30 - 03:00', start: 810, end: 900, isBreak: false },
  { num: 6, time: '03:00 - 04:30', start: 900, end: 990, isBreak: false },
];

// Solid colours for course blocks; signal red is reserved for clashes.
const COURSE_COLORS = [
  'bg-sign-600 text-white',
  'bg-lane-500 text-white',
  'bg-plum-500 text-white',
  'bg-ink-800 text-white',
  'bg-route-400 text-ink-950',
  'bg-sign-400 text-white',
  'bg-lane-700 text-white',
  'bg-plum-700 text-white',
];

const normalizeAr = (s: string) => s.replace(/[إأآ]/g, 'ا');

const toMinutes = (hhmm?: string): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m || 0);
};

/** Reads "10:00 - 11:30 ص" / "12:00 - 01:30 م" / "10:00 AM - 12:00 PM" into minutes (classes run 08:00–17:00). */
const parseRange = (text?: string): [number, number] | null => {
  if (!text) return null;
  const m = text.match(/(\d{1,2}):(\d{2})\s*(?:ص|م|AM|PM|am|pm)?\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const to24 = (h: number) => (h < 8 ? h + 12 : h);
  const start = to24(Number(m[1])) * 60 + Number(m[2]);
  const end = to24(Number(m[3])) * 60 + Number(m[4]);
  return end > start ? [start, end] : null;
};

const offeringRange = (o: CourseOffering): [number, number] | null => {
  const s = toMinutes(o.startTime);
  const e = toMinutes(o.endTime);
  if (s !== null && e !== null && e > s) return [s, e];
  return parseRange(o.lectureDayTimeAr) || parseRange(o.lectureDayTimeEn);
};

const meetsOnDay = (o: CourseOffering, day: { ar: string; short: string }): boolean => {
  const target = normalizeAr(day.ar);
  if (o.days && o.days.length > 0) {
    return o.days.some(d => normalizeAr(d) === target || d.toLowerCase().startsWith(day.short));
  }
  return normalizeAr(o.lectureDayTimeAr || '').includes(target);
};

const occupiesSlot = (o: CourseOffering, slot: (typeof SLOTS)[number]): boolean => {
  const range = offeringRange(o);
  if (range) return range[0] < slot.end && range[1] > slot.start;
  if (o.periods && o.periods.length > 0) return o.periods.includes(slot.num);
  // Last resort: match the start time written in the schedule text.
  const text = o.lectureDayTimeAr || '';
  if (slot.num === 1) return text.includes('08:30');
  if (slot.num === 2) return text.includes('10:00');
  if (slot.num === 4) return text.includes('12:00');
  if (slot.num === 5) return text.includes('01:00') || text.includes('01:30');
  return false;
};

/** "شعبة 1 (SEC-01)" → Arabic part or the code in brackets for English. */
const bilingualPart = (value: string | undefined, lang: string, fallback: string): string => {
  if (!value) return fallback;
  const match = value.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!match) return value;
  return lang === 'ar' ? match[1].trim() || value : match[2].trim();
};

/** Pulls the course code out of labels like "نظم تشغيل (Operating Systems) (CS 211)". */
const parseCourseLabel = (item: string): { code: string; label: string } | null => {
  const m = item.match(/^(.*?)\s*\(([A-Za-z]{2,5}\s?\d{2,4}[A-Za-z]?)\)\s*$/);
  return m ? { code: m[2].trim(), label: m[1].trim() } : null;
};

/** Server day strings are Arabic ("الإثنين والأربعاء"); turn them into English names. */
const dayNamesEn = (dayAr: string, fallback: string): string => {
  const text = normalizeAr(dayAr || '');
  const found = DAYS.filter(d => text.includes(normalizeAr(d.ar))).map(d => d.en);
  return found.length > 0 ? found.join(' & ') : fallback;
};

/** Keeps grade tokens such as "(B+)" readable inside right-to-left sentences. */
const isolateGrades = (text: string): React.ReactNode => {
  if (!text) return text;
  const parts = text.split(/(?<![A-Za-z])([A-F][+-]?)(?=[)\s.,،]|$)/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <bdi key={i} dir="ltr">
        {part}
      </bdi>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
};

type FeedbackType = 'SUCCESS' | 'ERROR' | 'INFO';

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

  // Weekly grid: for each day × period, the offerings that meet then.
  const weekGrid = useMemo(
    () => DAYS.map(day => SLOTS.map(slot => selectedOfferings.filter(o => meetsOnDay(o, day) && occupiesSlot(o, slot)))),
    [selectedOfferings]
  );
  const clashCells = useMemo(() => weekGrid.reduce((sum, row) => sum + row.filter(cell => cell.length > 1).length, 0), [weekGrid]);

  // A stable colour per course in the draft.
  const courseColor = useMemo(() => {
    const colors = new Map<string, string>();
    selectedOfferings.forEach(o => {
      if (!colors.has(o.courseCode)) colors.set(o.courseCode, COURSE_COLORS[colors.size % COURSE_COLORS.length]);
    });
    return colors;
  }, [selectedOfferings]);

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

  // Informational confirmations show as a toast near the eye-line, then clear.
  useEffect(() => {
    if (submissionFeedback?.type !== 'INFO') return;
    const timer = setTimeout(() => {
      setSubmissionFeedback((prev: any) => (prev?.type === 'INFO' ? null : prev));
    }, 5000);
    return () => clearTimeout(timer);
  }, [submissionFeedback]);

  // Keep the what-if replacement different from the course being replaced.
  useEffect(() => {
    if (whatIfAction === 'REPLACE' && whatIfReplacement === whatIfTargetCourse) {
      const alt = courses.find(c => c.code !== whatIfTargetCourse);
      if (alt) setWhatIfReplacement(alt.code);
    }
  }, [whatIfAction, whatIfTargetCourse, whatIfReplacement, courses]);

  // Put the cursor in the search box when the add-course window opens.
  const addSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isAddCourseModalOpen) addSearchRef.current?.focus();
  }, [isAddCourseModalOpen]);

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

  /* ------------------------------------------------------------------------
   * Display helpers
   * ---------------------------------------------------------------------- */
  const courseName = (code: string, fallbackAr?: string, fallbackEn?: string): string => {
    const c = courseMap.get(code);
    if (language === 'ar') return c?.nameAr || fallbackAr || fallbackEn || code;
    return c?.nameEn || fallbackEn || fallbackAr || code;
  };
  const scheduleText = (o: CourseOffering) => (language === 'ar' ? o.lectureDayTimeAr : o.lectureDayTimeEn || o.lectureDayTimeAr);
  // When the API sends no section code, number a course's sections in a stable order.
  const sectionText = (o: CourseOffering) => {
    if (o.sectionCode) return bilingualPart(o.sectionCode, language, o.sectionCode);
    const siblings = offerings.filter(x => x.courseCode === o.courseCode).map(x => x.id).sort();
    const n = Math.max(1, siblings.indexOf(o.id) + 1);
    return t(`شعبة ${n}`, `Section ${n}`);
  };
  const instructorText = (o: CourseOffering) => personName(o.instructorName, language) || o.instructorName;

  const scrollToStage = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return <Loader label={t('نحلل سجلك ونجهز الجدول المقترح…', 'Reading your record and preparing a suggested timetable…')} />;
  }

  if (!student) {
    return (
      <Panel>
        <EmptyState
          icon={AlertTriangle}
          tone="caution"
          title={t('تعذّر تحميل بيانات التسجيل', 'Registration data could not be loaded')}
          description={t('الخادم لم يرد. تأكد أن الخادم يعمل ثم أعد المحاولة.', 'The server did not respond. Check that it is running, then try again.')}
          action={
            <button type="button" onClick={loadAcademicData} className="btn btn-primary">
              <RotateCcw aria-hidden="true" />
              {t('إعادة المحاولة', 'Try again')}
            </button>
          }
        />
      </Panel>
    );
  }

  const isScheduleValid = validation ? validation.valid : selectedOfferings.length > 0;
  const maxAllowedCredits = recommendation?.maxAllowedCredits || 15;
  const minCredits = validation?.minCredits ?? recommendation?.minCredits ?? 12;
  const overCeiling = totalSelectedCredits > maxAllowedCredits;
  const issueCount = validation ? validation.errorsAr.length : 0;
  const recommendedInDraft = recommendation
    ? recommendation.recommendedCourses.filter(r => selectedCourseCodes.includes(r.courseCode)).length
    : 0;

  /* Stage line ---------------------------------------------------------- */
  type Stage = { id: string; label: string; status: string; tone: Tone };
  const stages: Stage[] = [
    {
      id: 'reg-suggested',
      label: t('المقترح', 'Suggestion'),
      status: recommendation
        ? t(`${recommendation.recommendedCourses.length} مقررات مقترحة`, `${recommendation.recommendedCourses.length} suggested`)
        : t('غير متاح', 'Not available'),
      tone: !recommendation
        ? 'ink'
        : recommendedInDraft === recommendation.recommendedCourses.length && recommendedInDraft > 0
        ? 'sign'
        : 'route',
    },
    {
      id: 'reg-checks',
      label: t('فحص اللائحة', 'Bylaw checks'),
      status:
        selectedOfferings.length === 0
          ? t('بانتظار المقررات', 'Waiting for courses')
          : !validation || isValidating
          ? t('جارٍ الفحص', 'Checking')
          : validation.valid
          ? t('لا مشكلات', 'All clear')
          : t(`${issueCount} مشكلة`, `${issueCount} issue${issueCount === 1 ? '' : 's'}`),
      tone: selectedOfferings.length === 0 ? 'ink' : !validation || isValidating ? 'route' : validation.valid ? 'sign' : 'signal',
    },
    {
      id: 'reg-draft',
      label: t('المسودة', 'Draft'),
      status:
        selectedOfferings.length === 0
          ? t('فارغة', 'Empty')
          : t(`${totalSelectedCredits} من ${maxAllowedCredits} ساعة`, `${totalSelectedCredits} of ${maxAllowedCredits} cr`),
      tone: selectedOfferings.length === 0 ? 'ink' : overCeiling ? 'signal' : 'sign',
    },
    {
      id: 'reg-week',
      label: t('الأسبوع', 'Week'),
      status:
        selectedOfferings.length === 0
          ? t('فارغ', 'Empty')
          : clashCells > 0
          ? t(`${clashCells} تعارض`, `${clashCells} clash${clashCells === 1 ? '' : 'es'}`)
          : t('بلا تعارض', 'No clashes'),
      tone: selectedOfferings.length === 0 ? 'ink' : clashCells > 0 ? 'signal' : 'sign',
    },
    {
      id: 'reg-submit',
      label: t('الإرسال للمرشد', 'Send to advisor'),
      status: pick(language, planStatusLabel[student.currentPlanStatus], student.currentPlanStatus),
      tone: planStatusTone[student.currentPlanStatus] || 'ink',
    },
  ];

  const stageDot: Record<Tone, string> = {
    ink: 'bg-paper text-ink-500 ring-ink-300',
    sign: 'bg-sign-600 text-white ring-sign-200',
    route: 'bg-route-400 text-ink-950 ring-route-200',
    signal: 'bg-signal-500 text-white ring-signal-200',
    caution: 'bg-caution-500 text-white ring-caution-200',
    lane: 'bg-lane-500 text-white ring-lane-200',
    plum: 'bg-plum-500 text-white ring-plum-200',
  };

  const importance = (imp: string, isMandatory: boolean): { label: string; tone: Tone } => {
    if (imp === 'CRITICAL') return { label: t('إعادة ضرورية', 'Retake needed'), tone: 'signal' };
    if (imp === 'HIGH') return { label: t('مقرر مفتاحي', 'Key course'), tone: 'caution' };
    if (imp === 'MEDIUM') return { label: t('متطلب أساسي', 'Core requirement'), tone: 'lane' };
    return isMandatory ? { label: t('إجباري', 'Required'), tone: 'ink' } : { label: t('اختياري', 'Elective'), tone: 'ink' };
  };

  const feedbackType: FeedbackType | null = submissionFeedback?.type || null;
  const feedbackText = submissionFeedback ? (language === 'ar' ? submissionFeedback.messageAr : submissionFeedback.messageEn) : '';

  // Courses for the what-if selects: the draft first, then everything else (no arbitrary cut-offs).
  const sortedCourses = [...courses].sort((a, b) => a.code.localeCompare(b.code));
  const draftCourses = sortedCourses.filter(c => selectedCourseCodes.includes(c.code));
  const otherCourses = sortedCourses.filter(c => !selectedCourseCodes.includes(c.code));
  const courseOption = (c: Course) => (
    <option key={c.code} value={c.code}>
      {c.code} {language === 'ar' ? c.nameAr : c.nameEn}
    </option>
  );

  // Add-course modal list
  const query = addCourseSearch.trim().toLowerCase();
  const addableOfferings = offerings.filter(off => {
    const course = courseMap.get(off.courseCode);
    if (activeLevelFilter !== 'ALL' && course?.level !== activeLevelFilter) return false;
    if (selectedOfferingIds.includes(off.id)) return false;
    if (query) {
      const haystack = `${off.courseCode} ${course?.nameAr || ''} ${course?.nameEn || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const totalPlanned = degreePlan?.semesters.reduce((sum, s) => sum + (s.totalCredits || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        icon={CalendarCheck}
        title={t('التسجيل الفصلي', 'Term registration')}
        description={t(
          'ابدأ من الجدول المقترح، صحّح ما تظهره فحوص اللائحة، ثم أرسل الجدول لمرشدك ليعتمده.',
          'Start from the suggested timetable, fix whatever the bylaw checks flag, then send it to your advisor for approval.'
        )}
        actions={
          <>
            <button type="button" onClick={handleOpenDegreePlan} className="btn btn-secondary">
              <GraduationCap aria-hidden="true" />
              {t('الخطة حتى التخرج', 'Plan to graduation')}
            </button>
            <button type="button" onClick={() => setIsWhatIfOpen(true)} className="btn btn-secondary">
              <GitFork aria-hidden="true" />
              {t('ماذا لو؟', 'What-if')}
            </button>
          </>
        }
      />

      {/* ── Student strip ─────────────────────────────────────────────── */}
      <Panel padded={false}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-4 sm:p-6 xl:grid-cols-7">
          <KeyValue label={t('الطالب', 'Student')} value={personName(language === 'ar' ? student.nameAr : student.nameEn, language)} />
          <KeyValue label={t('الرقم الجامعي', 'Student code')} value={<span className="t-num">{student.studentCode}</span>} />
          <KeyValue
            label={t('المستوى والمسار', 'Level and track')}
            value={
              <span>
                {t(`المستوى ${student.level}`, `Level ${student.level}`)}، {pick(language, trackLabel[student.track], student.track)}
              </span>
            }
          />
          <KeyValue
            label={t('المعدل التراكمي', 'Cumulative GPA')}
            value={<span className={cn('t-num', student.cumulativeGpa < 2 ? 'text-signal-600' : 'text-sign-700')}>{student.cumulativeGpa.toFixed(2)}</span>}
          />
          <KeyValue label={t('الساعات المنجزة', 'Credits completed')} value={<span className="t-num">{student.completedCredits} / 134</span>} />
          <KeyValue label={t('حدك هذا الفصل', 'Your ceiling this term')} value={<span><span className="t-num">{maxAllowedCredits}</span> {t('ساعة', 'cr')}</span>} />
          <KeyValue
            label={t('حالة الاعتماد', 'Approval status')}
            value={
              <span className={chipClass[planStatusTone[student.currentPlanStatus] || 'ink']}>
                {pick(language, planStatusLabel[student.currentPlanStatus], student.currentPlanStatus)}
              </span>
            }
          />
        </div>

        {student.cumulativeGpa < 2.0 && (
          <div className="border-t border-ink-100 p-4 sm:px-6">
            <div className="callout callout-signal" role="note">
              <ShieldAlert aria-hidden="true" />
              <div>
                <p className="font-bold">
                  {t(
                    `أنت تحت الإنذار الأكاديمي (${student.warningCount} إنذار)، لذلك حدك ${maxAllowedCredits} ساعة هذا الفصل.`,
                    `You are on academic warning (${student.warningCount} warning${student.warningCount === 1 ? '' : 's'}), so your ceiling is ${maxAllowedCredits} credit hours this term.`
                  )}
                </p>
                <p>
                  {t(
                    'ابدأ بإعادة المقررات التي رسبت فيها؛ هي أسرع طريق لرفع معدلك والخروج من الإنذار.',
                    'Start with the courses you failed: retaking them is the fastest way to lift your GPA and clear the warning.'
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Stage line ────────────────────────────────────────────────── */}
      <nav aria-label={t('مراحل التسجيل', 'Registration stages')} className="panel scroll-x px-3 py-4 sm:px-5">
        <ol className="relative grid min-w-[620px] grid-cols-5">
          <span
            aria-hidden="true"
            className="absolute top-[15px] h-[3px] rounded-full bg-ink-200"
            style={{ insetInlineStart: '10%', insetInlineEnd: '10%' }}
          />
          {stages.map((stage, i) => (
            <li key={stage.id} className="relative flex justify-center">
              <button
                type="button"
                onClick={() => scrollToStage(stage.id)}
                className="group flex flex-col items-center gap-1 rounded-lg px-2 pb-1 text-center"
              >
                <span
                  className={cn(
                    'relative z-[1] grid h-8 w-8 place-items-center rounded-full border-[3px] border-paper text-[12.5px] font-extrabold ring-2 transition group-hover:scale-110',
                    stageDot[stage.tone]
                  )}
                >
                  {stage.tone === 'sign' ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
                </span>
                <span className="mt-1 text-[13px] font-bold text-ink-900">{stage.label}</span>
                <span className={cn('text-[12px] font-medium', stage.tone === 'ink' ? 'text-ink-500' : toneText[stage.tone])}>{stage.status}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── 1. Suggested timetable ────────────────────────────────────── */}
      {recommendation && (
        <Panel id="reg-suggested" className="scroll-mt-40">
          <PanelHeader
            icon={Signpost}
            title={t('الجدول المقترح لك', 'Your suggested timetable')}
            description={
              <>
                {language === 'ar' ? recommendation.targetSemesterNameAr : recommendation.targetSemesterNameEn}
                <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                {t(
                  `${recommendation.recommendedCredits} ساعة من حد ${recommendation.maxAllowedCredits}`,
                  `${recommendation.recommendedCredits} of ${recommendation.maxAllowedCredits} credit hours`
                )}
              </>
            }
            actions={
              <button type="button" onClick={handleAcceptRecommendedSchedule} className="btn btn-accent">
                <CheckCircle2 aria-hidden="true" />
                {t('اعتمد المقترح كمسودة', 'Use this as my draft')}
              </button>
            }
          />

          <p className="mb-4 text-[13.5px] leading-7 text-ink-700">
            {language === 'ar' ? recommendation.academicStandingNoteAr : recommendation.academicStandingNoteEn}
          </p>

          {(recommendation.rationaleAr || []).length > 0 && (
            <ul className="panel-sunken mb-5 grid gap-x-6 gap-y-2 p-4 md:grid-cols-2">
              {(recommendation.rationaleAr || []).map((rat, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-6 text-ink-700">
                  <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-sign-600" aria-hidden="true" />
                  <span>{language === 'ar' ? rat : recommendation.rationaleEn?.[i] || rat}</span>
                </li>
              ))}
            </ul>
          )}

          {recommendation.recommendedCourses.length === 0 ? (
            <EmptyState
              icon={Signpost}
              title={t('لا مقررات مقترحة لهذا الفصل', 'No suggested courses this term')}
              description={t('أضف مقرراتك يدوياً من المسودة بالأسفل.', 'Add your courses by hand in the draft below.')}
            />
          ) : (
            <ul className="space-y-2.5">
              {recommendation.recommendedCourses.map((rec, recIdx) => {
                const inDraft = selectedOfferings.some(o => o.courseCode === rec.courseCode);
                const imp = importance(rec.importance, rec.isMandatory);
                return (
                  <li
                    key={`${rec.courseCode}_${rec.offeringId || recIdx}`}
                    className="panel stripe-start grid grid-cols-1 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    style={{ ['--stripe' as any]: toneColor[imp.tone] }}
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <CodeBadge code={rec.courseCode} variant={rec.isRetake ? 'signal' : 'solid'} />
                        <span className="text-[14.5px] font-bold text-ink-950">{language === 'ar' ? rec.courseNameAr : rec.courseNameEn}</span>
                        <span className="text-[12.5px] text-ink-500">{t(`${rec.credits} ساعات`, `${rec.credits} cr`)}</span>
                        <Chip tone={imp.tone}>{imp.label}</Chip>
                      </div>
                      <p className={cn('text-[13px] leading-6', rec.isRetake ? 'text-signal-700' : 'text-ink-700')}>
                        {language === 'ar' ? rec.primaryReasonAr : rec.primaryReasonEn}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-500">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                          {language === 'ar' ? rec.daysAr : rec.daysEn}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="t-num">{language === 'ar' ? rec.timeRangeAr : rec.timeRangeEn}</span>
                        </span>
                        <span>{rec.hall}</span>
                        <span>{t(`${rec.availableSeats} مقعد متاح`, `${rec.availableSeats} seats left`)}</span>
                        <span>{language === 'ar' ? rec.prerequisitesStatusAr : rec.prerequisitesStatusEn}</span>
                      </div>
                      {(rec.unlocksFutureCourses || []).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-500">
                          <span>{t('يفتح لاحقاً:', 'Unlocks later:')}</span>
                          {rec.unlocksFutureCourses.slice(0, 3).map(item => {
                            const parsed = parseCourseLabel(item);
                            return parsed ? (
                              <span key={item} className="inline-flex items-center gap-1.5 rounded-md bg-ink-50 py-0.5 pe-2 ps-0.5 ring-1 ring-ink-200">
                                <CodeBadge code={parsed.code} />
                                <span className="text-[12px] text-ink-700">{courseName(parsed.code, parsed.label, parsed.label)}</span>
                              </span>
                            ) : (
                              <Chip key={item} tone="ink">
                                {item}
                              </Chip>
                            );
                          })}
                          {rec.unlocksFutureCourses.length > 3 && <span className="t-num">+{rec.unlocksFutureCourses.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex md:justify-end">
                      {inDraft ? (
                        <Chip tone="sign" icon={Check}>
                          {t('في المسودة', 'In your draft')}
                        </Chip>
                      ) : (
                        <button type="button" onClick={() => handleAddCourseOffering(rec.offeringId)} className="btn btn-soft btn-sm">
                          <Plus aria-hidden="true" />
                          {t('أضف للمسودة', 'Add to draft')}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {/* ── 2. Bylaw checks ───────────────────────────────────────────── */}
      <Panel id="reg-checks" className="scroll-mt-40">
        <PanelHeader
          icon={ShieldCheck}
          tone={validation && !validation.valid ? 'signal' : 'sign'}
          title={t('فحص اللائحة', 'Bylaw checks')}
          description={t('يُعاد الفحص تلقائياً مع كل تغيير في المسودة.', 'Runs again automatically whenever your draft changes.')}
          actions={
            isValidating ? (
              <Chip tone="route">{t('جارٍ الفحص…', 'Checking…')}</Chip>
            ) : validation ? (
              <Chip tone={validation.valid ? 'sign' : 'signal'} icon={validation.valid ? CheckCircle2 : AlertCircle}>
                {validation.valid ? t('الجدول سليم', 'Timetable is valid') : t(`${issueCount} مشكلة تمنع الإرسال`, `${issueCount} issue${issueCount === 1 ? '' : 's'} block sending`)}
              </Chip>
            ) : null
          }
        />

        {selectedOfferings.length === 0 ? (
          <p className="text-[13px] text-ink-500">{t('أضف مقررات إلى المسودة ليبدأ الفحص.', 'Add courses to your draft to start the checks.')}</p>
        ) : !validation ? (
          <Loader compact label={t('جارٍ فحص المسودة…', 'Checking your draft…')} />
        ) : (
          <div className="space-y-4">
            {validation.valid && validation.retakeNotices.length === 0 && !validation.minimumLoadWarning && (
              <div className="callout callout-sign">
                <CheckCircle2 aria-hidden="true" />
                <span>
                  {t(
                    'لا تعارضات في المواعيد، والمتطلبات السابقة مستوفاة، والساعات ضمن حدك. يمكنك إرسال الجدول.',
                    'No clashes, prerequisites are met and the load is within your ceiling. You can send the timetable.'
                  )}
                </span>
              </div>
            )}

            {/* Clashes */}
            {validation.scheduleConflicts.length > 0 && (
              <section className="rounded-xl border border-signal-200 bg-signal-50/60 p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-signal-500" aria-hidden="true" />
                    <div>
                      <h3 className="text-[14px] font-bold text-signal-800">{t('تعارض في المواعيد', 'Timetable clash')}</h3>
                      <p className="text-[12.5px] leading-6 text-signal-700">
                        {t(
                          'مقرران في نفس الوقت لا يمكن تسجيلهما معاً. اختر شعبة أخرى، أو احذف أحدهما، أو دع النظام يبحث عن شعب بديلة.',
                          'Two courses at the same time cannot both be registered. Pick another section, remove one, or let the system look for alternatives.'
                        )}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={handleFixSchedule} disabled={resolvingConflicts} className="btn btn-accent shrink-0">
                    <Wand2 aria-hidden="true" />
                    {resolvingConflicts ? t('نبحث عن شعب بديلة…', 'Looking for alternatives…') : t('أصلح الجدول تلقائياً', 'Fix my timetable')}
                  </button>
                </div>

                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {validation.scheduleConflicts.map((conf, idx) => {
                    const sides = [
                      { code: conf.courseCode1, nameAr: conf.courseName1Ar, nameEn: conf.courseName1En, section: conf.section1, alts: conf.alternativeSectionsFor1 },
                      { code: conf.courseCode2, nameAr: conf.courseName2Ar, nameEn: conf.courseName2En, section: conf.section2, alts: conf.alternativeSectionsFor2 },
                    ];
                    return (
                      <li key={`${conf.offeringId1}_${conf.offeringId2}_${conf.day}_${idx}`} className="rounded-xl border border-signal-200 bg-paper p-3.5">
                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                          <span className="font-bold text-signal-700">{language === 'ar' ? `يوم ${conf.dayAr}` : dayNamesEn(conf.dayAr, conf.dayEn)}</span>
                          <span className="t-num text-ink-600">{language === 'ar' ? conf.timeRangeAr : conf.timeRangeEn}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {sides.map(side => (
                            <div key={side.code} className="rounded-lg bg-ink-50 p-2.5">
                              <div className="flex items-center gap-2">
                                <CodeBadge code={side.code} />
                                <span className="truncate text-[12.5px] text-ink-500">{bilingualPart(side.section, language, side.section)}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5 text-ink-900">{courseName(side.code, side.nameAr, side.nameEn)}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCourse(side.code)}
                                  className="btn btn-ghost btn-sm !px-2 text-signal-600 hover:!bg-signal-50 hover:!text-signal-700"
                                >
                                  <Trash2 aria-hidden="true" />
                                  {t('احذف', 'Remove')}
                                </button>
                                {side.alts && side.alts.length > 0 && (
                                  <select
                                    key={`${side.code}_${conf.offeringId1}_${conf.offeringId2}`}
                                    onChange={e => handleSwitchSection(side.code, e.target.value)}
                                    className="field field-sm w-auto min-w-[150px] flex-1"
                                    defaultValue=""
                                    aria-label={t(`شعبة بديلة لمقرر ${side.code}`, `Another section for ${side.code}`)}
                                  >
                                    <option value="" disabled>
                                      {t('اختر شعبة أخرى', 'Pick another section')}
                                    </option>
                                    {side.alts.map(alt => (
                                      <option key={alt.id} value={alt.id}>
                                        {sectionText(alt)}: {scheduleText(alt)}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {conflictResolutionResult && (
                  <div className={cn('callout mt-3', conflictResolutionResult.resolved ? 'callout-sign' : 'callout-signal')} role="status">
                    {conflictResolutionResult.resolved ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
                    <div>
                      <p className="font-bold">
                        {conflictResolutionResult.resolved ? t('وجدنا شعباً بديلة بلا تعارض:', 'Found clash-free sections:') : t('تعذر الحل تلقائياً:', 'Could not fix it automatically:')}
                      </p>
                      {conflictResolutionResult.resolved ? (
                        <ul className="list-inside list-disc text-[12.5px]">
                          {(language === 'ar'
                            ? conflictResolutionResult.resolutionSummaryAr || []
                            : conflictResolutionResult.resolutionSummaryEn || conflictResolutionResult.resolutionSummaryAr || []
                          ).map((s: string, i: number) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12.5px]">
                          {language === 'ar' ? conflictResolutionResult.reasonAr : conflictResolutionResult.reasonEn || conflictResolutionResult.reasonAr}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Prerequisites */}
            {validation.prerequisiteErrors.length > 0 && (
              <section className="rounded-xl border border-signal-200 bg-signal-50/60 p-4">
                <div className="mb-3 flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-signal-500" aria-hidden="true" />
                  <div>
                    <h3 className="text-[14px] font-bold text-signal-800">{t('متطلب سابق غير مستوفى', 'Prerequisite not met')}</h3>
                    <p className="text-[12.5px] leading-6 text-signal-700">
                      {t('اللائحة لا تسمح بتسجيل مقرر قبل اجتياز متطلبه. يمكنك تسجيل المتطلب نفسه بدلاً منه.', 'Bylaws do not allow a course before its prerequisite is passed. You can register the prerequisite instead.')}
                    </p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {validation.prerequisiteErrors.map((err, i) => (
                    <li key={`${err.courseCode}_${err.missingPrereqCode}_${i}`} className="flex flex-col gap-3 rounded-lg border border-signal-100 bg-paper p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CodeBadge code={err.courseCode} />
                          <span className="truncate text-[13.5px] font-semibold text-ink-900">{language === 'ar' ? err.courseNameAr : err.courseNameEn}</span>
                        </div>
                        <p className="mt-1 text-[12.5px] text-signal-700">
                          {t('يتطلب اجتياز', 'Requires')}{' '}
                          <strong>{language === 'ar' ? err.missingPrereqNameAr : err.missingPrereqNameEn}</strong> ({err.missingPrereqCode})
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => handleRemoveCourse(err.courseCode)} className="btn btn-secondary btn-sm">
                          {t('احذف المقرر', 'Remove course')}
                        </button>
                        {err.suggestedAlternativeCode && (
                          <button
                            type="button"
                            onClick={() => {
                              handleRemoveCourse(err.courseCode);
                              const altOff = offerings.find(o => o.courseCode === err.suggestedAlternativeCode);
                              if (altOff) handleAddCourseOffering(altOff.id);
                            }}
                            className="btn btn-primary btn-sm"
                          >
                            {t(`سجّل ${err.suggestedAlternativeCode} بدلاً منه`, `Register ${err.suggestedAlternativeCode} instead`)}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Credit ceiling */}
            {validation.creditLimitError && (
              <div className="callout callout-signal" role="alert">
                <AlertCircle aria-hidden="true" />
                <div>
                  <p className="font-bold">{t('تجاوزت حد الساعات المسموح', 'Over your credit ceiling')}</p>
                  <p>
                    {t(
                      `اخترت ${validation.creditLimitError.totalCredits} ساعة وحدك ${validation.creditLimitError.maxAllowed} ساعة؛ احذف ${validation.creditLimitError.excessCredits} ساعات على الأقل.`,
                      `You picked ${validation.creditLimitError.totalCredits} credit hours and your ceiling is ${validation.creditLimitError.maxAllowed}; remove at least ${validation.creditLimitError.excessCredits}.`
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Full sections */}
            {validation.capacityErrors.length > 0 && (
              <section className="rounded-xl border border-signal-200 bg-signal-50/60 p-4">
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold text-signal-800">
                  <AlertCircle className="h-5 w-5 text-signal-500" aria-hidden="true" />
                  {t('شعبة ممتلئة', 'Section full')}
                </h3>
                <ul className="space-y-2">
                  {validation.capacityErrors.map(err => (
                    <li key={err.offeringId} className="flex flex-col gap-2 rounded-lg border border-signal-100 bg-paper p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[13px] text-ink-800">
                        <CodeBadge code={err.courseCode} className="me-2" />
                        {courseName(err.courseCode, err.courseNameAr)}: {t('الشعبة المختارة ممتلئة', 'the chosen section is full')}{' '}
                        <span className="t-num">({err.enrolledCount}/{err.capacity})</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {err.alternativeSections && err.alternativeSections.length > 0 && (
                          <select
                            onChange={e => handleSwitchSection(err.courseCode, e.target.value)}
                            className="field field-sm w-auto min-w-[160px]"
                            defaultValue=""
                            aria-label={t(`شعبة متاحة لمقرر ${err.courseCode}`, `Available section for ${err.courseCode}`)}
                          >
                            <option value="" disabled>
                              {t('اختر شعبة متاحة', 'Pick an open section')}
                            </option>
                            {err.alternativeSections.map(alt => (
                              <option key={alt.id} value={alt.id}>
                                {sectionText(alt)}: {scheduleText(alt)}
                              </option>
                            ))}
                          </select>
                        )}
                        <button type="button" onClick={() => handleRemoveCourse(err.courseCode)} className="btn btn-secondary btn-sm">
                          {t('احذف', 'Remove')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Already passed */}
            {validation.duplicateErrors.length > 0 && (
              <section className="rounded-xl border border-signal-200 bg-signal-50/60 p-4">
                <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold text-signal-800">
                  <AlertCircle className="h-5 w-5 text-signal-500" aria-hidden="true" />
                  {t('مقرر اجتزته من قبل', 'Course already passed')}
                </h3>
                <ul className="space-y-2">
                  {validation.duplicateErrors.map(err => (
                    <li key={err.courseCode} className="flex flex-col gap-2 rounded-lg border border-signal-100 bg-paper p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[13px] text-ink-800">
                        <CodeBadge code={err.courseCode} className="me-2" />
                        {t(
                          `اجتزت ${err.courseNameAr} بتقدير ${err.previousGrade}، واللائحة لا تسمح بإعادته.`,
                          `You passed ${err.courseNameEn} with ${err.previousGrade}; bylaws do not allow retaking it.`
                        )}
                      </p>
                      <button type="button" onClick={() => handleRemoveCourse(err.courseCode)} className="btn btn-secondary btn-sm shrink-0">
                        {t('احذف', 'Remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Retake caps (information) */}
            {validation.retakeNotices.length > 0 && (
              <div className="callout callout-lane">
                <Info aria-hidden="true" />
                <div>
                  <p className="font-bold">{t('سقف تقدير الإعادة', 'Retake grade cap')}</p>
                  <ul className="mt-1 space-y-1 text-[12.5px]">
                    {validation.retakeNotices.map(n => (
                      <li key={`${n.courseCode}_${n.attempt}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <CodeBadge code={n.courseCode} />
                        <span className="font-semibold">{courseName(n.courseCode, n.courseNameAr)}:</span>
                        <span>{isolateGrades(language === 'ar' ? n.gpaImpactNoteAr : n.gpaImpactNoteEn)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Minimum load */}
            {validation.minimumLoadWarning && (
              <div className="callout callout-caution">
                <AlertTriangle aria-hidden="true" />
                <div>
                  <p className="font-bold">
                    {t(
                      `العبء أقل من الحد الأدنى (${validation.minimumLoadWarning.minRequired} ساعة)`,
                      `Load below the minimum (${validation.minimumLoadWarning.minRequired} credit hours)`
                    )}
                  </p>
                  <p>{language === 'ar' ? validation.minimumLoadWarning.noteAr : validation.minimumLoadWarning.noteEn}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ── 3. Draft ──────────────────────────────────────────────────── */}
      <Panel id="reg-draft" padded={false} className="scroll-mt-40">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[16px] font-bold text-ink-950">{t('مسودة التسجيل', 'Registration draft')}</h2>
              {selectedOfferings.length > 0 && (
                <Chip tone={isScheduleValid ? 'sign' : 'signal'} icon={isScheduleValid ? CheckCircle2 : AlertCircle}>
                  {isScheduleValid ? t('صالحة للإرسال', 'Ready to send') : t('تحتاج تعديلاً', 'Needs changes')}
                </Chip>
              )}
            </div>
            <p className="text-[12.5px] text-ink-500">
              {t('غيّر الشعبة من القائمة، أو احذف مقرراً، أو أضف مقرراً جديداً. الفحص يعمل مع كل تغيير.', 'Switch sections, remove a course or add a new one. Checks run with every change.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-56">
              <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                <span className="text-ink-500">{t('الساعات المختارة', 'Credits selected')}</span>
                <span className={cn('t-num font-extrabold', overCeiling ? 'text-signal-600' : 'text-ink-900')}>
                  {totalSelectedCredits} / {maxAllowedCredits}
                </span>
              </div>
              <Meter
                value={maxAllowedCredits > 0 ? (totalSelectedCredits / maxAllowedCredits) * 100 : 0}
                tone={overCeiling ? 'signal' : totalSelectedCredits >= minCredits ? 'sign' : 'route'}
                label={t('الساعات المختارة من الحد المسموح', 'Credits selected out of your ceiling')}
              />
              <p className="mt-1 text-[11.5px] text-ink-500">{t(`الحد الأدنى المعتاد ${minCredits} ساعة`, `Usual minimum ${minCredits} cr`)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAddCourseSearch('');
                setIsAddCourseModalOpen(true);
              }}
              className="btn btn-primary"
            >
              <Plus aria-hidden="true" />
              {t('أضف مقرراً', 'Add a course')}
            </button>
          </div>
        </div>

        <div className="scroll-x border-t border-ink-100">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th className="num w-10">#</th>
                <th>{t('المقرر', 'Course')}</th>
                <th className="num">{t('الساعات', 'Credits')}</th>
                <th>{t('الشعبة والمحاضر', 'Section and instructor')}</th>
                <th>{t('الموعد', 'Schedule')}</th>
                <th>{t('القاعة', 'Room')}</th>
                <th className="num">{t('المقاعد المتاحة', 'Seats left')}</th>
                <th className="num">
                  <span className="sr-only">{t('إجراءات', 'Actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedOfferings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="!py-10 text-center text-ink-500">
                    {t('المسودة فارغة. اعتمد الجدول المقترح بالأعلى أو أضف مقررات بنفسك.', 'Your draft is empty. Use the suggested timetable above or add courses yourself.')}
                  </td>
                </tr>
              ) : (
                selectedOfferings.map((off, idx) => {
                  const course = courseMap.get(off.courseCode);
                  const isRetake = student.records.some(r => r.courseCode === off.courseCode && r.status === 'FAILED');
                  const otherSections = offerings.filter(o => o.courseCode === off.courseCode && o.id !== off.id);
                  const availableSeats = off.capacity - off.enrolledCount;

                  return (
                    <tr key={off.id}>
                      <td className="num text-ink-400">{idx + 1}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <CodeBadge code={off.courseCode} variant={isRetake ? 'signal' : 'soft'} />
                          <div className="min-w-0">
                            <span className="block font-semibold text-ink-900">{courseName(off.courseCode)}</span>
                            {isRetake && <span className="text-[11.5px] font-semibold text-signal-600">{t('إعادة لرفع المعدل', 'Retake to lift your GPA')}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="num font-semibold">{course?.credits || 3}</td>
                      <td>
                        {otherSections.length > 0 ? (
                          <select
                            value={off.id}
                            onChange={e => handleSwitchSection(off.courseCode, e.target.value)}
                            className="field field-sm w-auto min-w-[150px]"
                            aria-label={t(`شعبة مقرر ${off.courseCode}`, `Section for ${off.courseCode}`)}
                          >
                            <option value={off.id}>{sectionText(off)}</option>
                            {otherSections.map(alt => (
                              <option key={alt.id} value={alt.id}>
                                {sectionText(alt)} ({scheduleText(alt)})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-medium text-ink-800">{sectionText(off)}</span>
                        )}
                        <span className="mt-0.5 block truncate text-[12px] text-ink-500">{instructorText(off)}</span>
                      </td>
                      <td className="whitespace-nowrap text-ink-700">{scheduleText(off)}</td>
                      <td className="text-ink-600">{off.hall}</td>
                      <td className="num">
                        <span className={cn('t-num font-bold', availableSeats <= 0 ? 'text-signal-600' : availableSeats <= 5 ? 'text-caution-700' : 'text-sign-700')}>
                          {availableSeats} / {off.capacity}
                        </span>
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          onClick={() => handleRemoveCourse(off.courseCode)}
                          className="btn btn-ghost btn-icon btn-sm text-ink-500 hover:!bg-signal-50 hover:!text-signal-600"
                          aria-label={t(`احذف ${off.courseCode} من المسودة`, `Remove ${off.courseCode} from the draft`)}
                          title={t('احذف من المسودة', 'Remove from draft')}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── 4. Week view ──────────────────────────────────────────────── */}
      <Panel id="reg-week" className="scroll-mt-40">
        <PanelHeader
          icon={CalendarDays}
          title={t('أسبوعك الدراسي', 'Your teaching week')}
          description={t('يتحدث فوراً مع كل شعبة تختارها. الخانات الحمراء تعني تعارضاً.', 'Updates as soon as you pick a section. Red slots mean a clash.')}
          actions={
            clashCells > 0 ? (
              <Chip tone="signal" icon={AlertTriangle}>
                {t(`${clashCells} خانة متعارضة`, `${clashCells} clashing slot${clashCells === 1 ? '' : 's'}`)}
              </Chip>
            ) : selectedOfferings.length > 0 ? (
              <Chip tone="sign" icon={CheckCircle2}>
                {t('بلا تعارض', 'No clashes')}
              </Chip>
            ) : null
          }
        />

        <div className="scroll-x -mx-1 px-1">
          <table className="w-full min-w-[820px] border-separate border-spacing-1.5 text-[12.5px]">
            <thead>
              <tr>
                <th className="w-24" aria-label={t('اليوم', 'Day')} />
                {SLOTS.map(slot => (
                  <th key={slot.num} className={cn('px-1 pb-1 text-center font-semibold', slot.isBreak ? 'w-20 text-ink-400' : 'text-ink-600')}>
                    <span className="block text-[12.5px]">{slot.isBreak ? t('استراحة', 'Break') : t(`الفترة ${slot.num > 3 ? slot.num - 1 : slot.num}`, `Period ${slot.num > 3 ? slot.num - 1 : slot.num}`)}</span>
                    <span className="t-num block text-[11px] font-medium text-ink-400">{slot.time}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, di) => (
                <tr key={day.ar}>
                  <th scope="row" className="rounded-lg bg-ink-100 px-2 text-center text-[13px] font-bold text-ink-800">
                    {language === 'ar' ? day.ar : day.en}
                  </th>
                  {SLOTS.map((slot, si) => {
                    const items = weekGrid[di][si];
                    const clash = items.length > 1;
                    return (
                      <td
                        key={slot.num}
                        className={cn(
                          'h-[76px] rounded-lg p-1 align-top',
                          clash ? 'bg-signal-100 ring-2 ring-signal-400' : items.length === 0 && !slot.isBreak && 'border border-dashed border-ink-200 bg-paper'
                        )}
                        style={
                          slot.isBreak && !clash
                            ? { backgroundImage: 'repeating-linear-gradient(135deg, var(--color-ink-100) 0 6px, transparent 6px 12px)' }
                            : undefined
                        }
                      >
                        <div className="flex h-full flex-col gap-1">
                          {items.map(o => (
                            <div
                              key={o.id}
                              className={cn(
                                'flex-1 rounded-md px-2 py-1.5 leading-4',
                                clash ? 'bg-signal-500 text-white' : courseColor.get(o.courseCode) || COURSE_COLORS[0]
                              )}
                              title={`${o.courseCode} ${courseName(o.courseCode)}: ${scheduleText(o)}`}
                            >
                              <span className="block text-[12px] font-extrabold" dir="ltr">
                                {o.courseCode}
                              </span>
                              <span className="block truncate text-[11px] font-medium opacity-90">{o.hall}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedOfferings.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-ink-100 pt-4">
            {Array.from(new Set(selectedCourseCodes)).map(code => (
              <li key={code} className="flex items-center gap-2 text-[12.5px] text-ink-700">
                <span className={cn('h-3 w-3 rounded-sm', courseColor.get(code) || COURSE_COLORS[0])} aria-hidden="true" />
                <span className="font-bold" dir="ltr">
                  {code}
                </span>
                <span>{courseName(code)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ── 5. Review & send ──────────────────────────────────────────── */}
      <Panel id="reg-submit" className="scroll-mt-40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sign-50 text-sign-700" aria-hidden="true">
              <Send className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold leading-7 text-ink-950">{t('راجع وأرسل لمرشدك', 'Review and send to your advisor')}</h2>
              <p className="max-w-[70ch] text-[12.5px] leading-6 text-ink-500">
                {t(
                  'الإرسال يحفظ الجدول ويحوله لمرشدك الأكاديمي ليعتمده، ويُسجَّل في سجل العمليات.',
                  'Sending saves the timetable and passes it to your academic advisor for approval; it is recorded in the audit log.'
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowSlipModal(true)} className="btn btn-secondary">
              <Printer aria-hidden="true" />
              {t('معاينة الاستمارة', 'Preview the slip')}
            </button>
            <button
              type="button"
              onClick={handleSubmitProposedSchedule}
              disabled={isSubmitting || !isScheduleValid || selectedOfferings.length === 0}
              className="btn btn-primary btn-lg"
            >
              <Send aria-hidden="true" className="rtl:-scale-x-100" />
              {isSubmitting ? t('جارٍ الإرسال…', 'Sending…') : t('أرسل الجدول للمرشد', 'Send timetable to advisor')}
            </button>
          </div>
        </div>

        {!isScheduleValid && selectedOfferings.length > 0 && (
          <p className="mt-3 text-[12.5px] font-medium text-signal-600">
            {t('زر الإرسال يعمل بعد حل مشكلات فحص اللائحة.', 'Sending is available once the bylaw check issues are fixed.')}
          </p>
        )}

        {submissionFeedback && feedbackType !== 'INFO' && (
          <div className={cn('callout mt-4', feedbackType === 'SUCCESS' ? 'callout-sign' : 'callout-signal')} role="status">
            {feedbackType === 'SUCCESS' ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
            <span className="font-semibold">{feedbackText}</span>
          </div>
        )}
      </Panel>

      {submissionFeedback && feedbackType === 'INFO' && (
        <Toast tone="lane" onClose={() => setSubmissionFeedback(null)} closeLabel={t('إغلاق', 'Close')}>
          {feedbackText}
        </Toast>
      )}

      {/* ── Modal: add a course ───────────────────────────────────────── */}
      {isAddCourseModalOpen && (
        <Modal
          onClose={() => setIsAddCourseModalOpen(false)}
          size="lg"
          icon={Plus}
          title={t('أضف مقرراً إلى المسودة', 'Add a course to your draft')}
          subtitle={t('ابحث بالكود أو الاسم، أو صفِّ حسب المستوى.', 'Search by code or name, or filter by level.')}
          closeLabel={t('إغلاق', 'Close')}
        >
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input
                type="search"
                value={addCourseSearch}
                onChange={e => setAddCourseSearch(e.target.value)}
                placeholder={t('مثال: CS 201 أو هياكل البيانات', 'e.g. CS 201 or Data Structures')}
                ref={addSearchRef}
                className="field ps-9"
                aria-label={t('ابحث عن مقرر', 'Search courses')}
              />
            </div>
            <Segmented<number | 'ALL'>
              ariaLabel={t('المستوى', 'Level')}
              value={activeLevelFilter}
              onChange={setActiveLevelFilter}
              options={[
                { value: 'ALL', label: t('كل المستويات', 'All levels') },
                ...[1, 2, 3, 4].map(lvl => ({ value: lvl, label: t(`المستوى ${lvl}`, `Level ${lvl}`) })),
              ]}
            />

            {addableOfferings.length === 0 ? (
              <EmptyState
                icon={Search}
                title={t('لا توجد شعب مطابقة', 'No matching sections')}
                description={t('جرّب كلمة بحث أخرى أو مستوى مختلفاً.', 'Try another search word or a different level.')}
              />
            ) : (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {addableOfferings.map(off => {
                  const course = courseMap.get(off.courseCode);
                  const isFull = off.enrolledCount >= off.capacity;
                  const courseInDraft = selectedCourseCodes.includes(off.courseCode);
                  return (
                    <li key={off.id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CodeBadge code={off.courseCode} />
                          <span className="text-[13.5px] font-semibold text-ink-900">{courseName(off.courseCode)}</span>
                          <span className="text-[12px] text-ink-500">{t(`${course?.credits || 3} ساعات`, `${course?.credits || 3} cr`)}</span>
                        </div>
                        <p className="mt-1 text-[12px] text-ink-500">
                          {sectionText(off)}
                          <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                          {scheduleText(off)}
                          <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                          {off.hall}
                          <span className="mx-1.5 text-ink-300" aria-hidden="true">|</span>
                          <span className={isFull ? 'text-signal-600' : ''}>
                            <span className="t-num">{Math.max(0, off.capacity - off.enrolledCount)}</span> {t('مقعد متاح', 'seats left')}
                          </span>
                        </p>
                      </div>
                      {courseInDraft ? (
                        <span className="chip chip-ink shrink-0">{t('المقرر في مسودتك', 'Already in your draft')}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddCourseOffering(off.id)}
                          disabled={isFull}
                          className={cn('btn btn-sm shrink-0', isFull ? 'btn-secondary' : 'btn-primary')}
                        >
                          {isFull ? (
                            t('الشعبة ممتلئة', 'Section full')
                          ) : (
                            <>
                              <Plus aria-hidden="true" />
                              {t('أضف', 'Add')}
                            </>
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Modal>
      )}

      {/* ── Modal: what-if ────────────────────────────────────────────── */}
      {isWhatIfOpen && (
        <Modal
          onClose={() => setIsWhatIfOpen(false)}
          size="lg"
          icon={GitFork}
          tone="plum"
          title={t('ماذا لو غيّرت جدولك؟', 'What if you change your timetable?')}
          subtitle={t('تجربة آمنة: لا تغيّر أي شيء في سجلك.', 'A safe trial: nothing in your record changes.')}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <button type="button" onClick={() => setIsWhatIfOpen(false)} className="btn btn-ghost">
              {t('إغلاق', 'Close')}
            </button>
          }
        >
          <div className="space-y-5">
            <p className="text-[13px] leading-7 text-ink-600">
              {t(
                'اختر ما تريد تجربته على مسودتك الحالية لترى أثره على معدلك وساعاتك وموعد تخرجك.',
                'Choose a change to try on your current draft to see its effect on your GPA, credits and graduation date.'
              )}
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="whatif-action" className="field-label">
                  {t('التغيير', 'Change')}
                </label>
                <select
                  id="whatif-action"
                  value={whatIfAction}
                  onChange={e => setWhatIfAction(e.target.value as 'ADD' | 'REMOVE' | 'REPLACE')}
                  className="field"
                >
                  <option value="ADD">{t('إضافة مقرر', 'Add a course')}</option>
                  <option value="REMOVE">{t('حذف مقرر', 'Drop a course')}</option>
                  <option value="REPLACE">{t('استبدال مقرر', 'Swap a course')}</option>
                </select>
              </div>

              <div className={whatIfAction === 'REPLACE' ? '' : 'sm:col-span-2'}>
                <label htmlFor="whatif-target" className="field-label">
                  {t('المقرر', 'Course')}
                </label>
                <select id="whatif-target" value={whatIfTargetCourse} onChange={e => setWhatIfTargetCourse(e.target.value)} className="field">
                  {draftCourses.length > 0 && <optgroup label={t('في مسودتك', 'In your draft')}>{draftCourses.map(courseOption)}</optgroup>}
                  <optgroup label={t('مقررات أخرى', 'Other courses')}>{otherCourses.map(courseOption)}</optgroup>
                </select>
              </div>

              {whatIfAction === 'REPLACE' && (
                <div>
                  <label htmlFor="whatif-replacement" className="field-label">
                    {t('بمقرر', 'With')}
                  </label>
                  <select id="whatif-replacement" value={whatIfReplacement} onChange={e => setWhatIfReplacement(e.target.value)} className="field">
                    <optgroup label={t('مقررات خارج مسودتك', 'Courses outside your draft')}>
                      {otherCourses.filter(c => c.code !== whatIfTargetCourse).map(courseOption)}
                    </optgroup>
                    {draftCourses.filter(c => c.code !== whatIfTargetCourse).length > 0 && (
                      <optgroup label={t('في مسودتك', 'In your draft')}>
                        {draftCourses.filter(c => c.code !== whatIfTargetCourse).map(courseOption)}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}
            </div>

            <button type="button" onClick={handleRunWhatIf} disabled={whatIfLoading} className="btn btn-primary btn-block">
              <Wand2 aria-hidden="true" />
              {whatIfLoading ? t('جارٍ الحساب…', 'Calculating…') : t('احسب الأثر', 'Calculate the effect')}
            </button>

            {whatIfResult && (
              <section className="rounded-xl border border-plum-200 bg-plum-50/50 p-4" aria-live="polite">
                <h3 className="mb-3 text-[14px] font-bold text-ink-950">{t('النتيجة المتوقعة', 'Expected result')}</h3>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="kv rounded-lg bg-paper p-3">
                    <dt>{t('المعدل المتوقع', 'Projected GPA')}</dt>
                    <dd className="t-num">
                      {whatIfResult.projectedGpa.toFixed(2)}{' '}
                      {typeof whatIfResult.gpaChange === 'number' && whatIfResult.gpaChange !== 0 && (
                        <span className={cn('text-[12px] font-bold', whatIfResult.gpaChange > 0 ? 'text-sign-700' : 'text-signal-600')}>
                          ({whatIfResult.gpaChange > 0 ? '+' : '−'}
                          {Math.abs(whatIfResult.gpaChange).toFixed(2)})
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="kv rounded-lg bg-paper p-3">
                    <dt>{t('الساعات بعد التغيير', 'Credits after change')}</dt>
                    <dd>
                      <span className="t-num">{whatIfResult.projectedCredits}</span> {t('ساعة', 'cr')}
                    </dd>
                  </div>
                  <div className="kv rounded-lg bg-paper p-3">
                    <dt>{t('مقررات تُفتح', 'Courses unlocked')}</dt>
                    <dd className="t-num">{whatIfResult.unlockedCoursesCount}</dd>
                  </div>
                  <div className="kv rounded-lg bg-paper p-3">
                    <dt>{t('التخرج المتوقع', 'Expected graduation')}</dt>
                    <dd className={whatIfResult.graduationDelayed ? 'text-signal-600' : ''}>
                      {language === 'ar' ? whatIfResult.expectedGraduationSemesterAr : whatIfResult.expectedGraduationSemesterEn}
                    </dd>
                  </div>
                </dl>
                {((language === 'ar' ? whatIfResult.notesAr : whatIfResult.notesEn) || []).length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {((language === 'ar' ? whatIfResult.notesAr : whatIfResult.notesEn) || []).map((note, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-[12.5px] leading-6 text-ink-700">
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-plum-500" aria-hidden="true" />
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </Modal>
      )}

      {/* ── Modal: degree plan ────────────────────────────────────────── */}
      {isDegreePlanOpen && (
        <Modal
          onClose={() => setIsDegreePlanOpen(false)}
          size="xl"
          icon={GraduationCap}
          title={t('خطتك المتبقية حتى التخرج', 'Your remaining plan to graduation')}
          subtitle={t('كل المقررات المتبقية موزعة على الفصول القادمة دون تعارض.', 'Every remaining course spread across the coming terms without clashes.')}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <button type="button" onClick={() => setIsDegreePlanOpen(false)} className="btn btn-ghost">
              {t('إغلاق', 'Close')}
            </button>
          }
        >
          {loadingDegreePlan ? (
            <Loader compact label={t('نجهز خطتك حتى التخرج…', 'Preparing your plan to graduation…')} />
          ) : degreePlan && degreePlan.semesters.length > 0 ? (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <KeyValue label={t('التخرج المتوقع', 'Expected graduation')} value={language === 'ar' ? degreePlan.expectedGraduationSemesterAr : degreePlan.expectedGraduationSemesterEn} />
                <KeyValue label={t('الفصول المتبقية', 'Terms left')} value={<span className="t-num">{degreePlan.semesters.length}</span>} />
                <KeyValue
                  label={t('الساعات المخططة', 'Credits planned')}
                  value={<span className="t-num">{degreePlan.totalPlannedCredits || totalPlanned}</span>}
                />
              </div>

              <ol className="relative space-y-5 ps-7">
                <span aria-hidden="true" className="absolute bottom-3 top-3 start-[9px] w-[3px] rounded-full bg-sign-200" />
                {degreePlan.semesters.map((sem, si) => (
                  <li key={sem.semesterIndex} className="relative">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -start-7 top-1 h-[21px] w-[21px] rounded-full border-[4px]',
                        si === degreePlan.semesters.length - 1 ? 'border-paper bg-route-400 ring-2 ring-sign-600' : 'border-sign-600 bg-paper'
                      )}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-[14px] font-bold text-ink-950">{language === 'ar' ? sem.semesterNameAr : sem.semesterNameEn}</h3>
                      <span className="text-[12.5px] font-semibold text-ink-500">
                        <span className="t-num">{sem.totalCredits}</span> {t('ساعة', 'cr')}
                      </span>
                    </div>
                    <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {sem.courses.map((c, cIdx) => (
                        <li key={`${c.courseCode}_${cIdx}`} className="flex items-center gap-2 rounded-lg border border-ink-200 bg-paper px-2.5 py-2 text-[13px]">
                          <CodeBadge code={c.courseCode} variant={c.isRetake ? 'signal' : 'soft'} />
                          <span className="truncate text-ink-800">{language === 'ar' ? c.courseNameAr : c.courseNameEn}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <EmptyState
              icon={AlertCircle}
              tone="caution"
              title={t('تعذر تحميل الخطة', 'The plan could not be loaded')}
              description={t('أغلق النافذة وجرّب مرة أخرى.', 'Close this window and try again.')}
            />
          )}
        </Modal>
      )}

      {/* ── Modal: registration slip ──────────────────────────────────── */}
      {showSlipModal && (
        <Modal
          onClose={() => setShowSlipModal(false)}
          size="lg"
          icon={FileText}
          title={t('استمارة تسجيل المقررات', 'Course registration slip')}
          subtitle={t('معاينة قبل الطباعة', 'Preview before printing')}
          closeLabel={t('إغلاق', 'Close')}
          footer={
            <>
              <button type="button" onClick={() => setShowSlipModal(false)} className="btn btn-ghost">
                {t('إغلاق', 'Close')}
              </button>
              <button type="button" onClick={() => window.print()} className="btn btn-primary">
                <Printer aria-hidden="true" />
                {t('اطبع الاستمارة', 'Print the slip')}
              </button>
            </>
          }
        >
          <article className="text-ink-900">
            <div className="flex items-start justify-between gap-4 border-b-[3px] border-sign-600 pb-4">
              <div>
                <p className="text-[15px] font-extrabold">{language === 'ar' ? INSTITUTION.universityAr : INSTITUTION.universityEn}</p>
                <p className="text-[13px] font-semibold text-ink-700">{language === 'ar' ? INSTITUTION.facultyAr : INSTITUTION.facultyEn}</p>
                <p className="text-[12px] text-ink-500">{language === 'ar' ? INSTITUTION.programAr : INSTITUTION.programEn}</p>
              </div>
              <BrandMark size={44} />
            </div>

            <div className="mt-4 text-center">
              <h3 className="text-[16px] font-extrabold">{t('استمارة تسجيل مقررات', 'Course registration slip')}</h3>
              {recommendation && (
                <p className="text-[12.5px] text-ink-500">{language === 'ar' ? recommendation.targetSemesterNameAr : recommendation.targetSemesterNameEn}</p>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-ink-200 bg-ink-50 p-4 sm:grid-cols-4">
              <div className="kv col-span-2">
                <dt>{t('الطالب', 'Student')}</dt>
                <dd>{personName(language === 'ar' ? student.nameAr : student.nameEn, language)}</dd>
              </div>
              <div className="kv">
                <dt>{t('الرقم الجامعي', 'Student code')}</dt>
                <dd className="t-num">{student.studentCode}</dd>
              </div>
              <div className="kv">
                <dt>{t('المعدل التراكمي', 'Cumulative GPA')}</dt>
                <dd className="t-num">{student.cumulativeGpa.toFixed(2)}</dd>
              </div>
              <div className="kv col-span-2">
                <dt>{t('المرشد الأكاديمي', 'Academic advisor')}</dt>
                <dd>{personName(student.advisorName, language)}</dd>
              </div>
              <div className="kv">
                <dt>{t('إجمالي الساعات', 'Total credits')}</dt>
                <dd>
                  <span className="t-num">{totalSelectedCredits}</span> {t('ساعة', 'cr')}
                </dd>
              </div>
              <div className="kv">
                <dt>{t('حالة الاعتماد', 'Approval')}</dt>
                <dd>{pick(language, planStatusLabel[student.currentPlanStatus], student.currentPlanStatus)}</dd>
              </div>
            </dl>

            <div className="mt-4 overflow-hidden rounded-xl border border-ink-200">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('المقرر', 'Course')}</th>
                    <th className="num">{t('الساعات', 'Credits')}</th>
                    <th>{t('الشعبة', 'Section')}</th>
                    <th>{t('الموعد', 'Schedule')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOfferings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="!py-8 text-center text-ink-500">
                        {t('لا مقررات في المسودة بعد.', 'No courses in the draft yet.')}
                      </td>
                    </tr>
                  ) : (
                    selectedOfferings.map(o => (
                      <tr key={o.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <CodeBadge code={o.courseCode} />
                            <span>{courseName(o.courseCode)}</span>
                          </div>
                        </td>
                        <td className="num">{courseMap.get(o.courseCode)?.credits || 3}</td>
                        <td className="whitespace-nowrap">{sectionText(o)}</td>
                        <td className="whitespace-nowrap">{scheduleText(o)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-10 text-[12.5px] text-ink-600">
              <div>
                <div className="h-10 border-b border-ink-400" />
                <p className="mt-1.5">{t('توقيع الطالب', 'Student signature')}</p>
              </div>
              <div>
                <div className="h-10 border-b border-ink-400" />
                <p className="mt-1.5">{t('توقيع المرشد الأكاديمي', 'Academic advisor signature')}</p>
              </div>
            </div>
          </article>
        </Modal>
      )}
    </div>
  );
};
