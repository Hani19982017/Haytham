import type { LucideIcon } from 'lucide-react';
import {
  Map as MapIcon,
  Signpost,
  Route,
  GitFork,
  TrendingUp,
  CalendarCheck,
  Briefcase,
  ShieldAlert,
  FileCheck2,
  Users,
  BookOpen,
  UserCheck,
  Gauge,
  UserCog,
  SlidersHorizontal,
  Scale,
  UploadCloud,
  History,
  BarChart3,
  Flame,
  PieChart,
  FileSpreadsheet,
} from 'lucide-react';
import type { UserRole } from '../../types/index.js';

export interface NavStation {
  id: string;
  labelAr: string;
  labelEn: string;
  /** One plain sentence: what the page is for (used in the command palette). */
  hintAr: string;
  hintEn: string;
  icon: LucideIcon;
}

export const NAV_BY_ROLE: Record<UserRole, NavStation[]> = {
  STUDENT: [
    {
      id: 'student-dashboard',
      labelAr: 'لوحتي',
      labelEn: 'Overview',
      hintAr: 'مسارك نحو التخرج، معدلك، ومقررات الفصل الحالي',
      hintEn: 'Your route to graduation, GPA and current courses',
      icon: MapIcon,
    },
    {
      id: 'student-recommendations',
      labelAr: 'التوصيات',
      labelEn: 'Recommendations',
      hintAr: 'مقررات مقترحة لك مع سبب كل اقتراح',
      hintEn: 'Suggested courses with the reason for each',
      icon: Signpost,
    },
    {
      id: 'student-study-plan',
      labelAr: 'خطة التخرج',
      labelEn: 'Study plan',
      hintAr: 'توزيع المقررات المتبقية على الفصول حتى التخرج',
      hintEn: 'Remaining courses spread across terms until graduation',
      icon: Route,
    },
    {
      id: 'student-what-if',
      labelAr: 'ماذا لو؟',
      labelEn: 'What-if',
      hintAr: 'جرّب تقديرات افتراضية وشاهد أثرها على معدلك',
      hintEn: 'Try hypothetical grades and see the effect on your GPA',
      icon: GitFork,
    },
    {
      id: 'student-gpa-plan',
      labelAr: 'تحسين المعدل',
      labelEn: 'GPA recovery',
      hintAr: 'ثلاث خطط لرفع معدلك فوق 2.00',
      hintEn: 'Three plans to lift your GPA above 2.00',
      icon: TrendingUp,
    },
    {
      id: 'student-registration',
      labelAr: 'التسجيل',
      labelEn: 'Registration',
      hintAr: 'ابنِ جدول الفصل وأرسله للمرشد',
      hintEn: 'Build your term schedule and send it to your advisor',
      icon: CalendarCheck,
    },
    {
      id: 'student-training',
      labelAr: 'التدريب الصيفي',
      labelEn: 'Training',
      hintAr: 'سجّل ساعات التدريب الميداني (240 ساعة)',
      hintEn: 'Log your field training hours (240 hours)',
      icon: Briefcase,
    },
  ],
  ACADEMIC_ADVISOR: [
    {
      id: 'advisor-dashboard',
      labelAr: 'فرز الطلاب',
      labelEn: 'Risk triage',
      hintAr: 'الطلاب مرتبون حسب درجة الخطر الأكاديمي',
      hintEn: 'Students ordered by academic risk',
      icon: ShieldAlert,
    },
    {
      id: 'advisor-plans',
      labelAr: 'اعتماد الخطط',
      labelEn: 'Plan approvals',
      hintAr: 'خطط دراسية تنتظر قرارك',
      hintEn: 'Study plans waiting for your decision',
      icon: FileCheck2,
    },
    {
      id: 'advisor-students',
      labelAr: 'طلابي',
      labelEn: 'My students',
      hintAr: 'كل الطلاب المسندين إليك وسجلاتهم',
      hintEn: 'All students assigned to you and their records',
      icon: Users,
    },
  ],
  INSTRUCTOR: [
    {
      id: 'instructor-grades',
      labelAr: 'رصد الدرجات',
      labelEn: 'Grades',
      hintAr: 'أعمال السنة والامتحان النهائي لكل طالب',
      hintEn: 'Coursework and final marks for each student',
      icon: BookOpen,
    },
    {
      id: 'instructor-attendance',
      labelAr: 'الحضور',
      labelEn: 'Attendance',
      hintAr: 'نسب الحضور وتنبيهات الحرمان تحت 75%',
      hintEn: 'Attendance rates and alerts below 75%',
      icon: UserCheck,
    },
  ],
  ADMIN: [
    {
      id: 'admin-dashboard',
      labelAr: 'نظرة عامة',
      labelEn: 'Overview',
      hintAr: 'حالة النظام وقاعدة البيانات والربط مع ابن الهيثم',
      hintEn: 'System, database and Ibn Al-Haitham sync status',
      icon: Gauge,
    },
    {
      id: 'admin-users',
      labelAr: 'المستخدمون',
      labelEn: 'Users',
      hintAr: 'إنشاء الحسابات وتعديل الصلاحيات',
      hintEn: 'Create accounts and manage roles',
      icon: UserCog,
    },
    {
      id: 'admin-courses',
      labelAr: 'المقررات',
      labelEn: 'Courses',
      hintAr: 'دليل المقررات والمتطلبات السابقة',
      hintEn: 'Course catalogue and prerequisites',
      icon: BookOpen,
    },
    {
      id: 'admin-offerings',
      labelAr: 'الشعب والمقاعد',
      labelEn: 'Sections',
      hintAr: 'الشعب الدراسية وسعة كل شعبة',
      hintEn: 'Course sections and their capacity',
      icon: SlidersHorizontal,
    },
    {
      id: 'admin-rules',
      labelAr: 'اللائحة',
      labelEn: 'Bylaw rules',
      hintAr: 'قيم قواعد اللائحة الأكاديمية',
      hintEn: 'Academic bylaw rule values',
      icon: Scale,
    },
    {
      id: 'admin-import',
      labelAr: 'استيراد',
      labelEn: 'Import',
      hintAr: 'استيراد الطلاب والمقررات من CSV أو Excel',
      hintEn: 'Import students and courses from CSV or Excel',
      icon: UploadCloud,
    },
    {
      id: 'admin-audit',
      labelAr: 'سجل العمليات',
      labelEn: 'Audit log',
      hintAr: 'كل تغيير في النظام ومن قام به',
      hintEn: 'Every change in the system and who made it',
      icon: History,
    },
  ],
  DEPARTMENT_HEAD: [
    {
      id: 'head-analytics',
      labelAr: 'المؤشرات',
      labelEn: 'Analytics',
      hintAr: 'مؤشرات القسم وتوزيع المخاطر',
      hintEn: 'Department indicators and risk distribution',
      icon: BarChart3,
    },
    {
      id: 'head-hotspots',
      labelAr: 'بؤر الرسوب',
      labelEn: 'Hotspots',
      hintAr: 'المقررات الأعلى رسوباً',
      hintEn: 'Courses with the highest failure rates',
      icon: Flame,
    },
    {
      id: 'head-seats',
      labelAr: 'ضغط المقاعد',
      labelEn: 'Seat demand',
      hintAr: 'الطلب المتوقع على المقاعد مقابل السعة',
      hintEn: 'Expected seat demand against capacity',
      icon: PieChart,
    },
  ],
  PROCESS_OFFICER: [
    {
      id: 'process-records',
      labelAr: 'سجلات الطلاب',
      labelEn: 'Student records',
      hintAr: 'بيانات الطلاب والتسجيل (قراءة فقط)',
      hintEn: 'Student and registration records (read-only)',
      icon: FileSpreadsheet,
    },
  ],
};

export const getStationsForRole = (role?: UserRole | null): NavStation[] => (role ? NAV_BY_ROLE[role] || [] : []);
