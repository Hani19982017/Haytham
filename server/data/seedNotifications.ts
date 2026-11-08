import type { AcademicRuleConfig, Course, CourseOffering, NotificationItem, Student } from '../../src/types/index.js';
import { AcademicRiskEngine } from '../engines/riskEngine.js';
import { AcademicRulesEngine } from '../engines/rulesEngine.js';
import { AttendancePolicy } from '../engines/attendanceEngine.js';

/**
 * Starting notifications for every account, worked out from the academic data
 * instead of being written by hand, so each user sees alerts about their own
 * situation and the numbers always match the rest of the system:
 *
 * - students: attendance, posted marks, academic warning, study-plan status,
 *   registration load and summer training;
 * - each advisor: their advisees at critical risk, plans awaiting approval and
 *   advisees with low attendance;
 * - each instructor: their sections and grading;
 * - department head, admin and student-affairs officer: what their pages manage.
 *
 * `recipientId` is the most specific id at hand: a student id (stu_*), advisor
 * id (adv_*), instructor id (inst_*) or user id (user_*). NotificationRepository
 * matches every id that belongs to the signed-in user, and the database seed
 * resolves each one to its User row.
 *
 * The type also decides where a click on the notification leads
 * (notificationTarget in src/components/common/Header.tsx):
 * - student: WARNING → GPA recovery, RISK → dashboard, APPROVAL → study plan,
 *   REGISTRATION → registration, GRADE → dashboard, GENERAL → training;
 * - advisor: APPROVAL/REGISTRATION → plan approvals, RISK/WARNING → risk triage,
 *   GENERAL → my students;
 * - instructor: RISK → attendance, others → grades;
 * - department head: REGISTRATION → seat demand, RISK → hotspots, others → analytics;
 * - admin: WARNING → bylaw rules, REGISTRATION → sections, GENERAL → users;
 * - student affairs: student records.
 */

/** Staff demo accounts (see USERS in server/routes/api.ts and prisma/seed.ts). */
export const STAFF_ACCOUNT_IDS = {
  admin: 'user_admin',
  departmentHead: 'user_head',
  processOfficer: 'user_process',
} as const;

/** Minimum attendance to sit the final exam (from the bylaw's maximum absence). */
const ATTENDANCE_MIN = () => AttendancePolicy.minAttendancePercent;

interface SeedInput {
  students: Student[];
  offerings: CourseOffering[];
  courses: Course[];
  rules: AcademicRuleConfig[];
  now?: Date;
}

type CountForms = { one: string; two: string; few: string; many: string; hundred: string };

const STUDENTS: CountForms = { one: 'طالب واحد', two: 'طالبان', few: 'طلاب', many: 'طالباً', hundred: 'طالب' };
const PLANS: CountForms = { one: 'خطة دراسية واحدة', two: 'خطتان دراسيتان', few: 'خطط دراسية', many: 'خطة دراسية', hundred: 'خطة دراسية' };
const SECTIONS: CountForms = { one: 'شعبة واحدة', two: 'شعبتان', few: 'شعب', many: 'شعبة', hundred: 'شعبة' };
const RULES: CountForms = { one: 'قاعدة واحدة', two: 'قاعدتان', few: 'قواعد', many: 'قاعدة', hundred: 'قاعدة' };
const COURSES: CountForms = { one: 'مقرر واحد', two: 'مقرران', few: 'مقررات', many: 'مقرراً', hundred: 'مقرر' };
const WARNINGS: CountForms = { one: 'إنذار واحد', two: 'إنذاران', few: 'إنذارات', many: 'إنذاراً', hundred: 'إنذار' };
const CASES: CountForms = { one: 'حالة واحدة', two: 'حالتان', few: 'حالات', many: 'حالة', hundred: 'حالة' };

/** Arabic counted noun: 1 and 2 have their own forms, 3–10 take the plural, 11–99 the accusative singular. */
function countAr(n: number, forms: CountForms): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const rest = n % 100;
  if (rest >= 3 && rest <= 10) return `${n} ${forms.few}`;
  if (rest >= 11) return `${n} ${forms.many}`;
  return `${n} ${forms.hundred}`;
}

const countEn = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "أ، ب وج" */
function listAr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('، ')} و${items[items.length - 1]}`;
}

/** "a, b and c" */
function listEn(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Split "د. محمود صقر (Dr. Mahmoud Saqr)" into its Arabic and English parts. */
function splitName(raw?: string): { ar: string; en: string } {
  const s = (raw || '').trim();
  const m = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m ? { ar: m[1].trim(), en: m[2].trim() } : { ar: s, en: s };
}

const shortName = (name: string) => name.trim().split(/\s+/).slice(0, 2).join(' ');
const gpaText = (gpa: number) => (Number(gpa) || 0).toFixed(2);

export function buildSeedNotifications({ students, offerings, courses, rules, now = new Date() }: SeedInput): NotificationItem[] {
  const out: NotificationItem[] = [];
  const MIN = 60 * 1000;
  const H = 60;
  const D = 24 * H;

  const add = (
    recipientId: string,
    slug: string,
    type: NotificationItem['type'],
    minutesAgo: number,
    read: boolean,
    text: Pick<NotificationItem, 'titleAr' | 'titleEn' | 'messageAr' | 'messageEn'>
  ) => {
    out.push({
      id: `seed_${recipientId}_${slug}`.replace(/[^A-Za-z0-9_-]/g, '_'),
      recipientId,
      type,
      ...text,
      createdAt: new Date(now.getTime() - minutesAgo * MIN).toISOString(),
      read,
    });
  };

  const ruleValue = (key: string, fallback: number) => {
    const value = Number(rules.find(r => r.key === key)?.value);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const totalCredits = ruleValue('TOTAL_DEGREE_CREDITS', AcademicRulesEngine.TOTAL_DEGREE_CREDITS);
  const trainingRequired = ruleValue('TRAINING_REQUIRED_HOURS', 240);
  const minGpa = ruleValue('MIN_GRADUATION_GPA', AcademicRulesEngine.MIN_CUMULATIVE_GPA);
  const minGpaText = gpaText(minGpa);
  const gradProjectMin = Math.ceil(totalCredits * AcademicRulesEngine.MIN_GRAD_PROJECT_PERCENTAGE);
  const gradProjectCodes = courses.filter(c => /graduation project/i.test(c.nameEn)).map(c => c.code).sort();
  const firstProject = courses.find(c => c.code === gradProjectCodes[0]);
  const lastWarningBeforeDismissal = AcademicRulesEngine.DISMISSAL_CONSECUTIVE_WARNINGS - 1;

  // ---------------------------------------------------------------- students
  for (const s of students) {
    const advisor = splitName(s.advisorName);
    const gpa = gpaText(s.cumulativeGpa);
    const current = s.records.filter(r => r.status === 'IN_PROGRESS');

    // Courses taken in a section get their absence warnings from the attendance monitor instead.
    current
      .filter(r => !r.offeringId && typeof r.attendancePercentage === 'number' && r.attendancePercentage < ATTENDANCE_MIN())
      .forEach((r, i) =>
        add(s.id, `attendance_${r.courseCode}`, 'RISK', 95 + i * 35, false, {
          titleAr: `تنبيه حضور في ${r.courseCode}`,
          titleEn: `Attendance alert in ${r.courseCode}`,
          messageAr: `نسبة حضورك في ${r.courseCode} (${r.courseNameAr}) ${r.attendancePercentage}% وهي أقل من الحد الأدنى ${ATTENDANCE_MIN()}%. استمرار الغياب قد يحرمك من دخول الامتحان النهائي.`,
          messageEn: `Your attendance in ${r.courseCode} (${r.courseNameEn}) is ${r.attendancePercentage}%, below the ${ATTENDANCE_MIN()}% minimum. More absences can bar you from the final exam.`,
        })
      );

    current
      .filter(r => typeof r.courseworkMark === 'number')
      .forEach((r, i) =>
        add(s.id, `coursework_${r.courseCode}`, 'GRADE', D + 2 * H + i * 30, false, {
          titleAr: `رُصدت أعمال السنة في ${r.courseCode}`,
          titleEn: `Coursework mark posted for ${r.courseCode}`,
          messageAr: `درجتك في أعمال السنة لمقرر ${r.courseNameAr}: ${r.courseworkMark} من 50.`,
          messageEn: `Your coursework mark in ${r.courseNameEn}: ${r.courseworkMark} out of 50.`,
        })
      );

    if (AcademicRulesEngine.isNewStudent(s) && current.length === 0) {
      add(s.id, 'welcome', 'REGISTRATION', 40, false, {
        titleAr: 'أهلاً بك في الكلية! سجّل مقررات فصلك الأول',
        titleEn: 'Welcome! Register your first-term courses',
        messageAr: `جهّزنا لك مقررات الفصل الأول في صفحة «التسجيل». راجعها وأرسلها إلى مرشدك ${advisor.ar} للاعتماد.`,
        messageEn: `Your first-term courses are ready on the Registration page. Review them and send them to your advisor, ${advisor.en}, for approval.`,
      });
    }

    if (s.warningCount > 0 && s.cumulativeGpa < minGpa) {
      const n = s.warningCount;
      const nearDismissal = s.consecutiveWarnings >= lastWarningBeforeDismissal;
      add(s.id, `warning_${n}`, 'WARNING', D + 5 * H, false, {
        titleAr: `إنذار أكاديمي رقم ${n}`,
        titleEn: `Academic warning no. ${n}`,
        messageAr: `معدلك التراكمي ${gpa} أقل من الحد الأدنى ${minGpaText}. خطة رفع المعدل جاهزة في صفحة «تحسين المعدل»، وراجع مرشدك ${advisor.ar}.${nearDismissal ? ' انتبه: الإنذار التالي يعرّضك للفصل.' : ''}`,
        messageEn: `Your cumulative GPA is ${gpa}, below the ${minGpaText} minimum. Your recovery plan is on the GPA recovery page; please meet your advisor, ${advisor.en}.${nearDismissal ? ' Note: one more warning puts you at risk of dismissal.' : ''}`,
      });
    }

    switch (s.currentPlanStatus) {
      case 'Approved':
        add(s.id, 'plan_status', 'APPROVAL', 4 * D, true, {
          titleAr: 'تم اعتماد خطتك الدراسية',
          titleEn: 'Your study plan was approved',
          messageAr: `اعتمد ${advisor.ar} خطة تخرجك. تابع مقررات كل فصل من صفحة «خطة التخرج».`,
          messageEn: `${advisor.en} approved your study plan. Follow it term by term on the Study plan page.`,
        });
        break;
      case 'Pending Review':
        add(s.id, 'plan_status', 'APPROVAL', 2 * D + 3 * H, false, {
          titleAr: 'خطتك الدراسية قيد المراجعة',
          titleEn: 'Your study plan is under review',
          messageAr: `أُرسلت خطتك إلى ${advisor.ar} وهي بانتظار الاعتماد. سيصلك إشعار فور اتخاذ القرار.`,
          messageEn: `Your plan is with ${advisor.en} for approval. You will be notified as soon as a decision is made.`,
        });
        break;
      case 'Rejected':
        add(s.id, 'plan_status', 'APPROVAL', 2 * D, false, {
          titleAr: 'مطلوب تعديل خطتك الدراسية',
          titleEn: 'Changes requested on your study plan',
          messageAr: `طلب ${advisor.ar} تعديل خطتك الدراسية. عدّلها من صفحة «خطة التخرج» ثم أعد إرسالها.`,
          messageEn: `${advisor.en} asked for changes to your study plan. Update it on the Study plan page and send it again.`,
        });
        break;
      case 'Draft':
        add(s.id, 'plan_status', 'APPROVAL', 3 * D, false, {
          titleAr: 'لم تُرسل خطتك الدراسية بعد',
          titleEn: 'Your study plan has not been sent yet',
          messageAr: `أنشئ خطة تخرجك من صفحة «خطة التخرج» وأرسلها إلى ${advisor.ar} للاعتماد.`,
          messageEn: `Build your study plan on the Study plan page and send it to ${advisor.en} for approval.`,
        });
        break;
    }

    if (s.records.length > 0) {
      const cap = AcademicRulesEngine.getMaxCredits(s);
      const hasRetakes = s.records.some(r => r.status === 'FAILED');
      if (cap > 18) {
        add(s.id, 'credit_cap', 'REGISTRATION', 20 * H, false, {
          titleAr: `يحق لك تسجيل حتى ${cap} ساعة`,
          titleEn: `You can register up to ${cap} credits`,
          messageAr: `معدلك التراكمي ${gpa} يتيح لك عبئاً دراسياً حتى ${cap} ساعة معتمدة هذا الفصل بدلاً من 18.`,
          messageEn: `Your cumulative GPA of ${gpa} allows a load of up to ${cap} credits this term instead of 18.`,
        });
      } else if (cap < 18) {
        add(s.id, 'credit_cap', 'REGISTRATION', 3 * D + 2 * H, true, {
          titleAr: `حد التسجيل هذا الفصل ${cap} ساعة`,
          titleEn: `Your registration limit is ${cap} credits`,
          messageAr: `بسبب معدلك التراكمي (${gpa}) الحد الأقصى لعبئك الدراسي هذا الفصل ${cap} ساعة.${hasRetakes ? ' ابدأ بمقررات الإعادة في صفحة «التسجيل».' : ''}`,
          messageEn: `With a cumulative GPA of ${gpa}, your maximum load this term is ${cap} credits.${hasRetakes ? ' Start with your retake courses on the Registration page.' : ''}`,
        });
      }
    }

    const hasProject = s.records.some(r => gradProjectCodes.includes(r.courseCode) && r.status !== 'FAILED');
    if (firstProject && !hasProject && s.completedCredits >= gradProjectMin) {
      add(s.id, 'grad_project', 'REGISTRATION', 9 * H, false, {
        titleAr: 'أصبحت مؤهلاً لتسجيل مشروع التخرج',
        titleEn: 'You can now register the graduation project',
        messageAr: `أنجزت ${s.completedCredits} ساعة معتمدة (المطلوب ${gradProjectMin})، فيمكنك تسجيل ${firstProject.code} ${splitName(firstProject.nameAr).ar} من صفحة «التسجيل».`,
        messageEn: `You have completed ${s.completedCredits} credits (${gradProjectMin} required), so you can register ${firstProject.code} ${firstProject.nameEn} on the Registration page.`,
      });
    }

    const hours = s.trainingHours || 0;
    if (s.trainingStatus === 'Passed' || (hours >= trainingRequired && s.trainingStatus !== 'Failed')) {
      add(s.id, 'training', 'GENERAL', 8 * D, true, {
        titleAr: 'اكتمل متطلب التدريب الصيفي',
        titleEn: 'Summer training requirement complete',
        messageAr: `اعتُمد تدريبك الصيفي: ${hours} ساعة من ${trainingRequired} ساعة مطلوبة للتخرج.`,
        messageEn: `Your summer training is approved: ${hours} of the ${trainingRequired} hours required to graduate.`,
      });
    } else if (s.trainingStatus === 'Accepted' && hours > 0) {
      add(s.id, 'training', 'GENERAL', 6 * D, true, {
        titleAr: 'تم قبول إفادة التدريب الصيفي',
        titleEn: 'Summer training certificate accepted',
        messageAr: `اعتُمدت ${hours} ساعة تدريب، والمتبقي للتخرج ${Math.max(0, trainingRequired - hours)} ساعة.`,
        messageEn: `${hours} training hours were approved; ${Math.max(0, trainingRequired - hours)} hours remain before graduation.`,
      });
    } else if (hours === 0 && s.trainingStatus !== 'Failed' && s.completedCredits >= AcademicRulesEngine.MIN_TRAINING_CREDITS) {
      add(s.id, 'training', 'GENERAL', 4 * D, false, {
        titleAr: 'يمكنك التقديم على التدريب الصيفي',
        titleEn: 'You can apply for summer training',
        messageAr: `أنجزت ${s.completedCredits} ساعة معتمدة، فيحق لك تسجيل التدريب الصيفي من صفحة «التدريب الصيفي».`,
        messageEn: `With ${s.completedCredits} credits completed you can register your summer training on the Training page.`,
      });
    }
  }

  // ---------------------------------------------------------------- advisors
  const advisees = new Map<string, Student[]>();
  for (const s of students) {
    if (!s.advisorId) continue;
    if (!advisees.has(s.advisorId)) advisees.set(s.advisorId, []);
    advisees.get(s.advisorId)!.push(s);
  }

  for (const [advisorId, list] of advisees) {
    const critical = list
      .map(s => ({ s, risk: AcademicRiskEngine.evaluateRisk(s) }))
      .filter(x => x.risk.level === 'CRITICAL')
      .sort((a, b) => b.risk.score - a.risk.score || a.s.cumulativeGpa - b.s.cumulativeGpa);
    if (critical.length) {
      const top = critical[0].s;
      add(advisorId, 'critical_students', 'RISK', 45, false, {
        titleAr: `${countAr(critical.length, STUDENTS)} في خطر أكاديمي حرج`,
        titleEn: `${countEn(critical.length, 'student')} at critical academic risk`,
        messageAr: `أعلاهم خطورة ${top.nameAr} (معدل ${gpaText(top.cumulativeGpa)}، ${countAr(top.warningCount, WARNINGS)}). راجع قائمة «فرز الطلاب» وحدّد جلسات إرشاد عاجلة.`,
        messageEn: `Most at risk: ${top.nameEn} (GPA ${gpaText(top.cumulativeGpa)}, ${countEn(top.warningCount, 'warning')}). Review the Risk triage list and book urgent advising sessions.`,
      });
    }

    const lowAttendance = list.flatMap(s =>
      s.records
        .filter(r => r.status === 'IN_PROGRESS' && typeof r.attendancePercentage === 'number' && r.attendancePercentage < ATTENDANCE_MIN())
        .map(r => ({ s, r }))
    );
    if (lowAttendance.length) {
      const shown = lowAttendance.slice(0, 3);
      add(advisorId, 'attendance_watch', 'RISK', 2 * H, false, {
        titleAr:
          lowAttendance.length === 1
            ? `حضور منخفض: ${shortName(lowAttendance[0].s.nameAr)}`
            : `${countAr(lowAttendance.length, STUDENTS)} بحضور أقل من ${ATTENDANCE_MIN()}%`,
        titleEn:
          lowAttendance.length === 1
            ? `Low attendance: ${shortName(lowAttendance[0].s.nameEn)}`
            : `${countEn(lowAttendance.length, 'student')} below ${ATTENDANCE_MIN()}% attendance`,
        messageAr: `${shown.map(({ s, r }) => `${shortName(s.nameAr)}: ${r.attendancePercentage}% في ${r.courseCode}`).join('، ')}. الحد الأدنى لدخول الامتحان النهائي ${ATTENDANCE_MIN()}%.`,
        messageEn: `${shown.map(({ s, r }) => `${shortName(s.nameEn)}: ${r.attendancePercentage}% in ${r.courseCode}`).join(', ')}. The minimum to sit the final exam is ${ATTENDANCE_MIN()}%.`,
      });
    }

    const pending = list.filter(s => s.currentPlanStatus === 'Pending Review');
    if (pending.length) {
      const names = pending.slice(0, 3);
      const more = pending.length > names.length;
      add(advisorId, 'pending_plans', 'APPROVAL', 3 * H, false, {
        titleAr: `${countAr(pending.length, PLANS)} بانتظار اعتمادك`,
        titleEn: `${countEn(pending.length, 'study plan')} awaiting your approval`,
        messageAr: `من بينها خطط ${more ? `${names.map(s => shortName(s.nameAr)).join('، ')} وغيرهم` : listAr(names.map(s => shortName(s.nameAr)))}. اعتمدها أو اطلب تعديلها من «اعتماد الخطط».`,
        messageEn: `Including the plans of ${more ? `${names.map(s => shortName(s.nameEn)).join(', ')} and others` : listEn(names.map(s => shortName(s.nameEn)))}. Approve them or ask for changes on Plan approvals.`,
      });
    }
  }

  // ------------------------------------------------------------- instructors
  const sectionsByInstructor = new Map<string, CourseOffering[]>();
  for (const o of offerings) {
    if (!o.instructorId) continue;
    if (!sectionsByInstructor.has(o.instructorId)) sectionsByInstructor.set(o.instructorId, []);
    sectionsByInstructor.get(o.instructorId)!.push(o);
  }

  for (const [instructorId, sections] of sectionsByInstructor) {
    const codes = [...new Set(sections.map(o => o.courseCode))];
    const enrolled = sections.reduce((sum, o) => sum + (o.enrolledCount || 0), 0);
    add(instructorId, 'grading_open', 'GRADE', 5 * H, false, {
      titleAr: 'رصد الدرجات والحضور متاح لشعبك',
      titleEn: 'Grade and attendance entry is open for your sections',
      messageAr: `لديك ${countAr(sections.length, SECTIONS)} هذا الفصل (${codes.join('، ')}) ويبلغ عدد المسجلين فيها ${enrolled}. ارصد أعمال السنة من «رصد الدرجات»، وخذ الحضور بالـ QR من «الحضور».`,
      messageEn: `You teach ${countEn(sections.length, 'section')} this term (${codes.join(', ')}) with ${enrolled} students enrolled. Enter coursework on the Grades page and take attendance by QR on the Attendance page.`,
    });

    // Absence reports for instructors come from the attendance monitor (attendanceService.ts).

    const busy = sections
      .filter(o => o.capacity > 0 && o.enrolledCount / o.capacity >= 0.85)
      .sort((a, b) => b.enrolledCount / b.capacity - a.enrolledCount / a.capacity);
    if (busy.length) {
      add(instructorId, 'busy_sections', 'REGISTRATION', 2 * D, true, {
        titleAr: busy.length === 1 ? `شعبة ${busy[0].courseCode} شبه ممتلئة` : `${countAr(busy.length, SECTIONS)} من شعبك شبه ممتلئة`,
        titleEn: busy.length === 1 ? `Section ${busy[0].courseCode} is nearly full` : `${busy.length} of your sections are nearly full`,
        messageAr: `${busy.map(o => `${o.courseCode} ${splitName(o.sectionCode).ar}: ${o.enrolledCount} من ${o.capacity}`).join('، ')}.`,
        messageEn: `${busy.map(o => `${o.courseCode} ${splitName(o.sectionCode).en}: ${o.enrolledCount} of ${o.capacity}`).join(', ')}.`,
      });
    }
  }

  // ------------------------------------------------------ teaching assistants
  const sectionsByAssistant = new Map<string, CourseOffering[]>();
  for (const o of offerings) {
    if (!o.assistantId) continue;
    if (!sectionsByAssistant.has(o.assistantId)) sectionsByAssistant.set(o.assistantId, []);
    sectionsByAssistant.get(o.assistantId)!.push(o);
  }
  for (const [assistantId, sections] of sectionsByAssistant) {
    const codes = [...new Set(sections.map(o => o.courseCode))];
    add(assistantId, 'sections_assigned', 'GENERAL', 6 * H, false, {
      titleAr: `أنت معيد في ${countAr(sections.length, SECTIONS)} هذا الفصل`,
      titleEn: `You assist in ${countEn(sections.length, 'section')} this term`,
      messageAr: `${codes.join('، ')}. ابدأ السكشن من صفحة «الحضور والغياب» واعرض رمز QR للطلاب، أو سجّل الحضور يدوياً.`,
      messageEn: `${codes.join(', ')}. Start a section on the Attendance page and show the QR code to students, or mark attendance by hand.`,
    });
  }

  // ------------------------------------------------------- department head
  const head = STAFF_ACCOUNT_IDS.departmentHead;
  const pressure = offerings
    .filter(o => o.capacity > 0 && o.enrolledCount / o.capacity >= 0.9)
    .sort((a, b) => b.enrolledCount / b.capacity - a.enrolledCount / a.capacity);
  if (pressure.length) {
    const full = pressure.filter(o => o.enrolledCount >= o.capacity).length;
    const shown = pressure.slice(0, 4);
    add(head, 'seat_pressure', 'REGISTRATION', 2 * H, false, {
      titleAr: `ضغط على المقاعد في ${countAr(pressure.length, SECTIONS)}`,
      titleEn: `Seat pressure in ${countEn(pressure.length, 'section')}`,
      messageAr: `${shown.map(o => `${o.courseCode} (${o.enrolledCount}/${o.capacity})`).join('، ')}${pressure.length > shown.length ? '…' : ''}.${full ? ` المكتمل منها: ${countAr(full, SECTIONS)}.` : ''} التفاصيل في «ضغط المقاعد».`,
      messageEn: `${shown.map(o => `${o.courseCode} (${o.enrolledCount}/${o.capacity})`).join(', ')}${pressure.length > shown.length ? '…' : ''}.${full ? ` ${countEn(full, 'section')} already full.` : ''} Details on Seat demand.`,
    });
  }

  const failures = new Map<string, { code: string; nameAr: string; nameEn: string; count: number }>();
  for (const s of students) {
    for (const r of s.records) {
      if (r.status !== 'FAILED') continue;
      const entry = failures.get(r.courseCode) || { code: r.courseCode, nameAr: r.courseNameAr, nameEn: r.courseNameEn, count: 0 };
      entry.count += 1;
      failures.set(r.courseCode, entry);
    }
  }
  const hotspots = [...failures.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  if (hotspots.length) {
    const shown = hotspots.slice(0, 3);
    add(head, 'failure_hotspots', 'RISK', D + 4 * H, false, {
      titleAr: `حالات رسوب في ${countAr(hotspots.length, COURSES)}`,
      titleEn: `Failures recorded in ${countEn(hotspots.length, 'course')}`,
      messageAr: `${shown.map(h => `${h.code} ${h.nameAr} (${countAr(h.count, CASES)})`).join('، ')}. راجع الأسباب في «بؤر الرسوب».`,
      messageEn: `${shown.map(h => `${h.code} ${h.nameEn} (${countEn(h.count, 'failure')})`).join(', ')}. Review them on Hotspots.`,
    });
  }

  const criticalCount = students.filter(s => s.riskLevel === 'CRITICAL').length;
  const highCount = students.filter(s => s.riskLevel === 'HIGH').length;
  if (criticalCount + highCount > 0 && students.length) {
    const pct = Math.round(((criticalCount + highCount) / students.length) * 100);
    add(head, 'risk_summary', 'WARNING', 3 * D, true, {
      titleAr: `${countAr(criticalCount + highCount, STUDENTS)} في خطر مرتفع أو حرج`,
      titleEn: `${countEn(criticalCount + highCount, 'student')} at high or critical risk`,
      messageAr: `${criticalCount} في خطر حرج و${highCount} في خطر مرتفع من أصل ${students.length} (${pct}%). التوزيع الكامل في «المؤشرات».`,
      messageEn: `${criticalCount} critical and ${highCount} high out of ${students.length} students (${pct}%). Full breakdown on Analytics.`,
    });
  }

  // ------------------------------------------------------------------ admin
  const admin = STAFF_ACCOUNT_IDS.admin;
  const unverified = rules.filter(r => r.needsVerification);
  if (unverified.length) {
    add(admin, 'rules_to_verify', 'WARNING', 4 * H, false, {
      titleAr: `${countAr(unverified.length, RULES)} في اللائحة بحاجة إلى تدقيق`,
      titleEn: `${countEn(unverified.length, 'bylaw rule')} need verification`,
      messageAr: `${listAr(unverified.map(r => `«${r.titleAr}»`))}. راجعها من صفحة «اللائحة».`,
      messageEn: `${listEn(unverified.map(r => `“${r.titleEn}”`))}. Review them on Bylaw rules.`,
    });
  }

  const fullSections = offerings.filter(o => o.capacity > 0 && o.enrolledCount >= o.capacity);
  if (fullSections.length) {
    add(admin, 'full_sections', 'REGISTRATION', D + 2 * H, false, {
      titleAr: fullSections.length === 1 ? `شعبة مكتملة العدد: ${fullSections[0].courseCode}` : `${countAr(fullSections.length, SECTIONS)} مكتملة العدد`,
      titleEn: fullSections.length === 1 ? `Section full: ${fullSections[0].courseCode}` : `${fullSections.length} sections are full`,
      messageAr: `${fullSections.map(o => `${o.courseCode} ${splitName(o.sectionCode).ar} (${o.enrolledCount}/${o.capacity})`).join('، ')}. يمكنك رفع السعة من «الشعب والمقاعد».`,
      messageEn: `${fullSections.map(o => `${o.courseCode} ${splitName(o.sectionCode).en} (${o.enrolledCount}/${o.capacity})`).join(', ')}. You can raise the capacity on Sections.`,
    });
  }

  const busiestAdvisor = [...advisees.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (busiestAdvisor && busiestAdvisor[1].length > 40) {
    const [, list] = busiestAdvisor;
    const name = splitName(list[0].advisorName);
    const alone = advisees.size === 1;
    add(admin, 'advising_load', 'GENERAL', 5 * D, true, {
      titleAr: `عبء إرشاد مرتفع على ${name.ar}`,
      titleEn: `Heavy advising load for ${name.en}`,
      messageAr: `${countAr(list.length, STUDENTS)} مسندون إليه${alone ? ' وحده' : ''}. يمكنك توزيع الطلاب على مرشدين آخرين من «المستخدمون».`,
      messageEn: `${countEn(list.length, 'student')} are assigned to ${alone ? 'this advisor alone' : 'this advisor'}. You can spread them across other advisors on Users.`,
    });
  }

  // -------------------------------------------------- student affairs officer
  const officer = STAFF_ACCOUNT_IDS.processOfficer;
  const warned = students.filter(s => s.warningCount > 0);
  if (warned.length) {
    const nearDismissal = warned.filter(s => s.consecutiveWarnings >= lastWarningBeforeDismissal).length;
    add(officer, 'warned_students', 'WARNING', 6 * H, false, {
      titleAr: `${countAr(warned.length, STUDENTS)} تحت الإنذار الأكاديمي`,
      titleEn: `${countEn(warned.length, 'student')} on academic warning`,
      messageAr: `${nearDismissal ? `منهم ${countAr(nearDismissal, STUDENTS)} على بُعد إنذار واحد من الفصل. ` : ''}السجلات متاحة للاطلاع والطباعة من «سجلات الطلاب».`,
      messageEn: `${nearDismissal ? `${countEn(nearDismissal, 'student')} ${nearDismissal === 1 ? 'is' : 'are'} one warning away from dismissal. ` : ''}Records are available to view and print on Student records.`,
    });
  }

  const noTraining = students.filter(
    s => (s.trainingHours || 0) === 0 && s.trainingStatus !== 'Passed' && s.completedCredits >= AcademicRulesEngine.MIN_TRAINING_CREDITS
  );
  if (noTraining.length) {
    add(officer, 'training_missing', 'GENERAL', 2 * D, true, {
      titleAr: `${countAr(noTraining.length, STUDENTS)} لم يسجّلوا التدريب الصيفي`,
      titleEn: `${countEn(noTraining.length, 'student')} without summer training`,
      messageAr: `أنجزوا ${AcademicRulesEngine.MIN_TRAINING_CREDITS} ساعة معتمدة أو أكثر ولم تُسجَّل لهم أي ساعات تدريب حتى الآن.`,
      messageEn: `They have ${AcademicRulesEngine.MIN_TRAINING_CREDITS}+ credits but no training hours recorded yet.`,
    });
  }

  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
