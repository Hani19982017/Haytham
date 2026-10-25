import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import {
  LayoutDashboard,
  Sparkles,
  CalendarDays,
  Calculator,
  TrendingUp,
  FileCheck2,
  Briefcase,
  Users,
  ShieldCheck,
  BookOpen,
  Sliders,
  UploadCloud,
  History,
  BarChart3,
  Flame,
  PieChart,
  FileSpreadsheet,
  GraduationCap,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();

  if (!currentUser) return null;

  const role = currentUser.role;

  interface NavItem {
    id: string;
    labelAr: string;
    labelEn: string;
    icon: React.ReactNode;
    badge?: string;
  }

  let navItems: NavItem[] = [];

  if (role === 'STUDENT') {
    navItems = [
      {
        id: 'student-dashboard',
        labelAr: 'لوحة التحكم الأكاديمية',
        labelEn: 'Academic Dashboard',
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
      {
        id: 'student-recommendations',
        labelAr: 'المقررات الموصى بها ذكياً',
        labelEn: 'AI Recommendations',
        icon: <Sparkles className="w-4 h-4 text-amber-500" />,
        badge: 'AI',
      },
      {
        id: 'student-study-plan',
        labelAr: 'خطة التخرج الزمنية',
        labelEn: 'Graduation Study Plan',
        icon: <CalendarDays className="w-4 h-4" />,
      },
      {
        id: 'student-what-if',
        labelAr: 'محاكي السيناريوهات (What-If)',
        labelEn: 'What-If Simulator',
        icon: <Calculator className="w-4 h-4" />,
      },
      {
        id: 'student-gpa-plan',
        labelAr: 'خطة تحسين المعدل التراكمي',
        labelEn: 'GPA Recovery Plan',
        icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
      },
      {
        id: 'student-registration',
        labelAr: 'التسجيل الفصلي المباشر',
        labelEn: 'Live Registration',
        icon: <FileCheck2 className="w-4 h-4 text-indigo-500" />,
      },
      {
        id: 'student-training',
        labelAr: 'التدريب الصيفي الميداني',
        labelEn: 'Summer Field Training',
        icon: <Briefcase className="w-4 h-4" />,
      },
    ];
  } else if (role === 'ACADEMIC_ADVISOR') {
    navItems = [
      {
        id: 'advisor-dashboard',
        labelAr: 'تصنيف الطلاب حسب الخطر',
        labelEn: 'Risk Triage & Overview',
        icon: <ShieldCheck className="w-4 h-4 text-rose-500" />,
      },
      {
        id: 'advisor-plans',
        labelAr: 'اعتماد ومراجعة الخطط الدراسية',
        labelEn: 'Study Plans Approval',
        icon: <FileCheck2 className="w-4 h-4 text-emerald-500" />,
        badge: '3',
      },
      {
        id: 'advisor-students',
        labelAr: 'سجل الطلاب والمتابعة الأكاديمية',
        labelEn: 'Assigned Students',
        icon: <Users className="w-4 h-4" />,
      },
    ];
  } else if (role === 'INSTRUCTOR') {
    navItems = [
      {
        id: 'instructor-grades',
        labelAr: 'مقرراتي ورصد الدرجات',
        labelEn: 'Courses & Grade Entry',
        icon: <BookOpen className="w-4 h-4" />,
      },
      {
        id: 'instructor-attendance',
        labelAr: 'متابعة الغياب ونسبة الحضور',
        labelEn: 'Attendance & 75% Alerts',
        icon: <Users className="w-4 h-4 text-amber-500" />,
      },
    ];
  } else if (role === 'ADMIN') {
    navItems = [
      {
        id: 'admin-dashboard',
        labelAr: 'نظرة عامة على النظام',
        labelEn: 'System Overview',
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
      {
        id: 'admin-users',
        labelAr: 'إدارة المستخدمين',
        labelEn: 'User Management',
        icon: <Users className="w-4 h-4 text-indigo-600" />,
      },
      {
        id: 'admin-courses',
        labelAr: 'دليل المقررات والمتطلبات',
        labelEn: 'Courses & Prerequisites',
        icon: <BookOpen className="w-4 h-4" />,
      },
      {
        id: 'admin-offerings',
        labelAr: 'الشعب الدراسية وحدود المقاعد',
        labelEn: 'Offerings & Seat Limits',
        icon: <Sliders className="w-4 h-4" />,
      },
      {
        id: 'admin-rules',
        labelAr: 'إعدادات اللائحة وتدقيق البيانات',
        labelEn: 'Academic Rules & Config',
        icon: <GraduationCap className="w-4 h-4 text-indigo-500" />,
        badge: t('بحاجة تدقيق', 'Audit'),
      },
      {
        id: 'admin-import',
        labelAr: 'استيراد البيانات (CSV/Excel)',
        labelEn: 'Data Import (CSV)',
        icon: <UploadCloud className="w-4 h-4" />,
      },
      {
        id: 'admin-audit',
        labelAr: 'سجل العمليات والتدقيق (Audit Log)',
        labelEn: 'Audit Trails',
        icon: <History className="w-4 h-4" />,
      },
    ];
  } else if (role === 'DEPARTMENT_HEAD') {
    navItems = [
      {
        id: 'head-analytics',
        labelAr: 'التحليلات والمؤشرات الاستراتيجية',
        labelEn: 'Executive Analytics',
        icon: <BarChart3 className="w-4 h-4 text-indigo-500" />,
      },
      {
        id: 'head-hotspots',
        labelAr: 'بؤر الرسوب والمقررات الحرجة',
        labelEn: 'Failure Hotspots',
        icon: <Flame className="w-4 h-4 text-rose-500" />,
      },
      {
        id: 'head-seats',
        labelAr: 'ضغط المقاعد والتنبؤ بالطلب',
        labelEn: 'Seat Demand Forecast',
        icon: <PieChart className="w-4 h-4 text-amber-500" />,
      },
    ];
  } else if (role === 'PROCESS_OFFICER') {
    navItems = [
      {
        id: 'process-records',
        labelAr: 'سجلات الطلاب والتسجيل (قراءة فقط)',
        labelEn: 'Student Records (Read-Only)',
        icon: <FileSpreadsheet className="w-4 h-4" />,
      },
    ];
  }

  return (
    <aside className="w-full md:w-64 shrink-0 bg-white border-b md:border-b-0 md:border-l md:border-slate-200 p-3">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2">
        {t('القائمة الرئيسية', 'Navigation Menu')}
      </div>
      <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
        {navItems.map(item => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap text-right ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={isActive ? 'text-white' : ''}>{item.icon}</span>
                <span>{language === 'ar' ? item.labelAr : item.labelEn}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Summary Pill in Sidebar */}
      <div className="mt-4 pt-4 border-t border-slate-100 hidden md:block space-y-3">
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
            <span>{t('قواعد اللائحة النشطة', 'Active Bylaws Engine')}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {t(
              'التسجيل يخضع تلقائياً لقواعد المعدل التراكمي، المتطلبات السابقة، وسقف الإعادة.',
              'All actions validated against cumulative GPA limits, prerequisite chains, and retake caps.'
            )}
          </p>
        </div>
      </div>
    </aside>
  );
};
