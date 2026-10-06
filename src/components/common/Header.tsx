import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { NotificationItem } from '../../types/index.js';
import { TranscriptReportModal } from '../reports/TranscriptReportModal.js';
import {
  Bell,
  GraduationCap,
  Languages,
  ShieldAlert,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  Sparkles,
  FileText,
  Lock,
  LogOut,
  Sliders,
} from 'lucide-react';

export const Header: React.FC = () => {
  const { currentUser, usersList, switchUser, logout } = useAuth();
  const { language, dir, toggleLanguage, t } = useLanguage();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [isEnterpriseMode, setIsEnterpriseMode] = useState(false);

  useEffect(() => {
    async function loadNotifs() {
      try {
        const notifs = await api.getNotifications(currentUser?.studentId || currentUser?.id);
        setNotifications(notifs);
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    }
    loadNotifs();
  }, [currentUser]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    for (const n of notifications) {
      if (!n.read) await api.markNotificationRead(n.id);
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const roleBadgeColor: Record<string, string> = {
    ADMIN: 'bg-rose-100 text-rose-800 border-rose-200',
    ACADEMIC_ADVISOR: 'bg-amber-100 text-amber-800 border-amber-200',
    INSTRUCTOR: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    STUDENT: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    PROCESS_OFFICER: 'bg-slate-100 text-slate-800 border-slate-200',
    DEPARTMENT_HEAD: 'bg-purple-100 text-purple-800 border-purple-200',
  };

  const roleNameMap: Record<string, { ar: string; en: string }> = {
    ADMIN: { ar: 'الآدمن (مدير النظام)', en: 'Admin' },
    ACADEMIC_ADVISOR: { ar: 'مرشد أكاديمي', en: 'Academic Advisor' },
    INSTRUCTOR: { ar: 'أستاذ المقرر', en: 'Instructor' },
    STUDENT: { ar: 'طالب', en: 'Student' },
    PROCESS_OFFICER: { ar: 'شؤون الطلاب', en: 'Process Officer' },
    DEPARTMENT_HEAD: { ar: 'رئيس القسم', en: 'Department Head' },
  };

  // Distinct primary user for each role to avoid duplicate instructor buttons
  const primaryRoleUsers = React.useMemo(() => {
    const rolesOrder: Array<{ role: string; preferredId: string }> = [
      { role: 'STUDENT', preferredId: 'user_student' },
      { role: 'ACADEMIC_ADVISOR', preferredId: 'user_advisor' },
      { role: 'INSTRUCTOR', preferredId: 'user_instructor' },
      { role: 'ADMIN', preferredId: 'user_admin' },
      { role: 'DEPARTMENT_HEAD', preferredId: 'user_head' },
      { role: 'PROCESS_OFFICER', preferredId: 'user_process' },
    ];

    return rolesOrder
      .map(({ role, preferredId }) => {
        return (
          usersList.find(u => u.id === preferredId) ||
          usersList.find(u => u.role === role)
        );
      })
      .filter(Boolean) as typeof usersList;
  }, [usersList]);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      {/* Top Banner */}
      {!isEnterpriseMode ? (
        <div className="bg-slate-900 text-slate-100 px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{t('نظام الساعات المعتمدة - كلية الحاسبات والمعلومات', 'Credit-Hour System - Faculty of Computers & AI')}</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300">{t('فصل خريف 2026/2027 (15 أسبوع)', 'Fall Semester 2026/2027 (15 Weeks)')}</span>
          </div>

          {/* Demo Fast Switcher with unique roles */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <span className="text-slate-400 text-[11px] whitespace-nowrap flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              {t('تبديل الدور (وضع التقييم):', 'Demo Role:')}
            </span>
            {primaryRoleUsers.map(u => {
              const label = language === 'ar'
                ? roleNameMap[u.role]?.ar || u.role
                : roleNameMap[u.role]?.en || u.role;
              const isActive = currentUser?.role === u.role && currentUser?.id === u.id;

              return (
                <button
                  key={u.id}
                  onClick={() => switchUser(u)}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs ring-1 ring-white/30 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                  title={`${u.nameAr} (${u.role})`}
                >
                  {label}
                </button>
              );
            })}

            <button
              onClick={() => setIsEnterpriseMode(true)}
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 hover:bg-amber-400/30 transition cursor-pointer"
              title={t('قفل التبديل وتفعيل نمط الإنتاج الجامعي', 'Switch to strict Enterprise Production Mode')}
            >
              {t('قفل نمط الإنتاج', 'Lock Production')}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-950 text-slate-200 px-4 py-1.5 text-xs flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2 font-medium">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-bold">{t('نمط الإنتاج المؤسسي الجامعي الموثق (Enterprise Production Mode)', 'Institutional Enterprise Mode')}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">{t('التوثيق مشفر بـ JWT و Bcrypt', 'Encrypted JWT & Bcrypt Authentication')}</span>
          </div>

          <button
            onClick={() => setIsEnterpriseMode(false)}
            className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
          >
            {t('فتح وضع التقييم التجريبي', 'Open Demo Mode')}
          </button>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                {t('المستشار الأكاديمي الذكي', 'Smart Academic Advisor')}
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Enterprise v2.4
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {t('مبني على قواعد ولوائح نظام ابن الهيثم لإدارة البرامج الجامعية', 'Operating on Ibn Al-Haitham Academic Bylaws & Credit Engine')}
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Official Verified Transcript (QR) Shortcut */}
          {currentUser && (
            <button
              onClick={() => setShowTranscriptModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold transition cursor-pointer"
              title={t('عرض السجل الأكاديمي الرسمي الموثق برمز QR', 'View official verified transcript with QR code')}
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t('السجل الموثق (QR)', 'Official Transcript')}</span>
            </button>
          )}

          {/* Direct Admin Access Button */}
          <button
            onClick={() => {
              const adminUser = usersList.find(u => u.role === 'ADMIN');
              if (adminUser) switchUser(adminUser);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              currentUser?.role === 'ADMIN'
                ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
            }`}
            title={t('الانتقال المباشر إلى لوحة تحكم الآدمن', 'Switch to Admin Portal')}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{currentUser?.role === 'ADMIN' ? t('أنت في الآدمن ✓', 'Admin Mode ✓') : t('لوحة الآدمن (Admin)', 'Admin Portal')}</span>
          </button>

          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
            title={language === 'ar' ? 'Switch to English' : 'التحويل للغة العربية'}
          >
            <Languages className="w-4 h-4 text-slate-500" />
            <span>{language === 'ar' ? 'English' : 'عربي'}</span>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Popover */}
            {showNotifMenu && (
              <div
                className={`absolute ${
                  dir === 'rtl' ? 'left-0' : 'right-0'
                } mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2`}
              >
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-800">{t('الإشعارات والتنبيهات', 'Notifications')}</span>
                    {unreadCount > 0 && (
                      <span className="text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-semibold">
                        {unreadCount} {t('جديد', 'new')}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-indigo-600 hover:underline cursor-pointer"
                    >
                      {t('تحديد الكل كمقروء', 'Mark all read')}
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      {t('لا توجد إشعارات جديدة', 'No notifications')}
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        className={`p-3 text-xs hover:bg-slate-50 transition ${!n.read ? 'bg-indigo-50/40' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {n.type === 'WARNING' || n.type === 'RISK' ? (
                            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                          ) : n.type === 'APPROVAL' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className="font-bold text-slate-900 mb-0.5">{language === 'ar' ? n.titleAr : n.titleEn}</p>
                            <p className="text-slate-600 leading-relaxed">{language === 'ar' ? n.messageAr : n.messageEn}</p>
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              {new Date(n.createdAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Role Info */}
          {currentUser && (
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs uppercase">
                  {currentUser.role.substring(0, 2)}
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold text-slate-800 leading-tight">
                    {language === 'ar' ? currentUser.nameAr : currentUser.nameEn}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {language === 'ar'
                      ? roleNameMap[currentUser.role]?.ar || currentUser.role
                      : roleNameMap[currentUser.role]?.en || currentUser.role}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {/* Role Dropdown */}
              {showRoleMenu && (
                <div
                  className={`absolute ${
                    dir === 'rtl' ? 'left-0' : 'right-0'
                  } mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2`}
                >
                  <div className="px-4 py-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      {t('الحساب الحالي', 'Active User')}
                    </span>
                    <p className="text-xs font-bold text-slate-900">
                      {language === 'ar' ? currentUser.nameAr : currentUser.nameEn}
                    </p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                        roleBadgeColor[currentUser.role] || 'bg-slate-100'
                      }`}
                    >
                      {currentUser.role}
                    </span>
                  </div>

                  <div className="px-2 py-1 max-h-80 overflow-y-auto">
                    <p className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase">
                      {t('التبديل بين الحسابات والأدوار', 'Switch Demo Role Persona')}
                    </p>
                    {primaryRoleUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => {
                          switchUser(u);
                          setShowRoleMenu(false);
                        }}
                        className={`w-full text-right px-3 py-1.5 rounded-lg text-xs flex items-center justify-between transition cursor-pointer mb-0.5 ${
                          currentUser.id === u.id ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="truncate">
                          <div className="font-medium text-slate-800">{language === 'ar' ? u.nameAr : u.nameEn}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{u.email}</div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium shrink-0 mr-2 rtl:mr-2 rtl:ml-0 ltr:ml-2 ltr:mr-0">
                          {language === 'ar' ? roleNameMap[u.role]?.ar || u.role : roleNameMap[u.role]?.en || u.role}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 mt-2 pt-1 px-2">
                    <button
                      onClick={() => {
                        logout();
                        setShowRoleMenu(false);
                      }}
                      className="w-full text-right px-3 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{t('تسجيل الخروج', 'Sign Out')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Official Verified Transcript Modal */}
      {showTranscriptModal && (
        <TranscriptReportModal
          studentId={currentUser?.studentId || 'stu_omar'}
          onClose={() => setShowTranscriptModal(false)}
        />
      )}
    </header>
  );
};
