import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { api } from '../../services/api.js';
import { NotificationItem, UserRole } from '../../types/index.js';
import { TranscriptReportModal } from '../reports/TranscriptReportModal.js';
import { CommandPalette } from './CommandPalette.js';
import { RouteNav } from './RouteNav.js';
import { getStationsForRole } from './navigation.js';
import { BrandMark } from '../ui/BrandMark.js';
import { cn, roleLabel, roleTone, chipClass, personName } from '../ui/tones.js';
import {
  Bell,
  Search,
  FileText,
  LogOut,
  UserCog,
  ShieldAlert,
  TriangleAlert,
  ClipboardCheck,
  Info,
  CalendarCheck,
  BookOpen,
  ChevronDown,
  CalendarRange,
} from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

/** Close a popover on outside click or Escape. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, onClose]);
}

const initialsOf = (name?: string): string => {
  if (!name) return '؟';
  const words = name
    .split(/\s+/)
    .filter(w => w && !w.endsWith('.') && !/^(د|أ|م)\.?$/.test(w));
  return (words[0]?.[0] || '') + (words[1]?.[0] || '');
};

const notifIcon = (type: NotificationItem['type']) => {
  switch (type) {
    case 'WARNING':
      return { Icon: ShieldAlert, cls: 'bg-signal-50 text-signal-600' };
    case 'RISK':
      return { Icon: TriangleAlert, cls: 'bg-caution-50 text-caution-600' };
    case 'APPROVAL':
      return { Icon: ClipboardCheck, cls: 'bg-sign-50 text-sign-600' };
    case 'REGISTRATION':
      return { Icon: CalendarCheck, cls: 'bg-lane-50 text-lane-600' };
    case 'GRADE':
      return { Icon: BookOpen, cls: 'bg-plum-50 text-plum-600' };
    default:
      return { Icon: Info, cls: 'bg-ink-100 text-ink-600' };
  }
};

/** The page a notification opens. Mirrors the type convention in server/data/seedNotifications.ts. */
const notificationTarget = (role: UserRole, type: NotificationItem['type']): string | null => {
  switch (role) {
    case 'STUDENT': {
      const byType: Record<NotificationItem['type'], string> = {
        WARNING: 'student-gpa-plan',
        RISK: 'student-attendance',
        APPROVAL: 'student-study-plan',
        REGISTRATION: 'student-registration',
        GRADE: 'student-dashboard',
        GENERAL: 'student-training',
      };
      return byType[type] ?? 'student-dashboard';
    }
    case 'ACADEMIC_ADVISOR':
      if (type === 'APPROVAL' || type === 'REGISTRATION') return 'advisor-plans';
      return type === 'GENERAL' ? 'advisor-students' : 'advisor-dashboard';
    case 'INSTRUCTOR':
      return type === 'GRADE' || type === 'REGISTRATION' ? 'instructor-grades' : 'instructor-attendance';
    case 'TEACHING_ASSISTANT':
      return 'ta-attendance';
    case 'DEPARTMENT_HEAD':
      if (type === 'REGISTRATION') return 'head-seats';
      return type === 'RISK' ? 'head-hotspots' : 'head-analytics';
    case 'ADMIN':
      if (type === 'WARNING') return 'admin-rules';
      if (type === 'REGISTRATION') return 'admin-offerings';
      return type === 'GENERAL' ? 'admin-users' : 'admin-dashboard';
    case 'PROCESS_OFFICER':
      return 'process-records';
    default:
      return null;
  }
};

/** How often the open app checks for new notifications. */
const NOTIFICATION_REFRESH_MS = 30_000;

export const Header: React.FC<HeaderProps> = ({ currentTab, onSelectTab }) => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const { language, toggleLanguage, t } = useLanguage();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  useDismiss(notifRef, showNotifMenu, () => setShowNotifMenu(false));
  useDismiss(userRef, showUserMenu, () => setShowUserMenu(false));

  // Notifications belong to the signed-in account: the server returns only theirs.
  // Reload when the account changes, then keep the list fresh while the app is open.
  const userId = currentUser?.id;
  const notifRequest = useRef(0);
  const loadNotifications = useCallback(async () => {
    const request = ++notifRequest.current;
    try {
      const list = await api.getNotifications();
      if (request === notifRequest.current) setNotifications(list);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, []);

  useEffect(() => {
    notifRequest.current += 1; // drop any answer still on its way for the previous account
    setNotifications([]);
    if (!userId) return;
    loadNotifications();
    const timer = window.setInterval(() => {
      if (!document.hidden) loadNotifications();
    }, NOTIFICATION_REFRESH_MS);
    const onFocus = () => loadNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId, loadNotifications]);

  // Ctrl/⌘ + K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  const isStudent = currentUser?.role === 'STUDENT';
  const displayName = currentUser ? personName(language === 'ar' ? currentUser.nameAr : currentUser.nameEn, language) : '';

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await api.markAllNotificationsRead();
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
      loadNotifications();
    }
  };

  /** Mark the notification read and open the page it is about. */
  const openNotification = (n: NotificationItem) => {
    if (!n.read) {
      setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
      api.markNotificationRead(n.id).catch(err => console.error('Failed to mark notification read:', err));
    }
    const target = currentUser ? notificationTarget(currentUser.role, n.type) : null;
    if (target) {
      setShowNotifMenu(false);
      onSelectTab(target);
    }
  };

  const dateLocale = language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(dateLocale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  /** "5 minutes ago", "yesterday"… for the last week, then the date. */
  const formatWhen = (iso: string) => {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return iso;
    const minutes = Math.round((Date.now() - time) / 60000);
    if (minutes < 0 || minutes >= 7 * 24 * 60) return formatDate(iso);
    if (minutes < 1) return t('الآن', 'Just now');
    try {
      const rtf = new Intl.RelativeTimeFormat(dateLocale, { numeric: 'auto' });
      if (minutes < 60) return rtf.format(-minutes, 'minute');
      const hours = Math.round(minutes / 60);
      if (hours < 24) return rtf.format(-hours, 'hour');
      return rtf.format(-Math.round(hours / 24), 'day');
    } catch {
      return formatDate(iso);
    }
  };

  const iconBtn =
    'relative grid h-10 w-10 place-items-center rounded-xl text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline-route-400';

  return (
    <header className="sign-slab no-print sticky top-0 z-40 text-white shadow-[0_8px_24px_-16px_rgb(0_0_0/0.6)]">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
        {/* Row 1 — identity and utilities */}
        <div className="flex h-16 items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onSelectTab(getStationsForRole(currentUser?.role)[0]?.id || currentTab)}
            className="flex min-w-0 items-center gap-3 rounded-xl text-start focus-visible:outline-route-400"
            aria-label={t('المستشار الأكاديمي الذكي: الصفحة الرئيسية', 'Smart Academic Advisor: home')}
          >
            <BrandMark size={38} variant="onDark" />
            <span className="min-w-0">
              <span className="block truncate text-[15.5px] font-extrabold leading-6">
                {t('المستشار الأكاديمي الذكي', 'Smart Academic Advisor')}
              </span>
              <span className="hidden truncate text-[12px] text-white/65 sm:block">
                {t('برنامج علوم الحاسب بنظام الساعات المعتمدة', 'Computer Science, credit-hour programme')}
              </span>
            </span>
          </button>

          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Search / command palette */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-10 items-center gap-2.5 rounded-xl bg-white/10 ps-3 pe-2 text-[13px] text-white/80 ring-1 ring-white/15 transition hover:bg-white/15 hover:text-white md:flex"
              aria-label={t('بحث سريع', 'Quick search')}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="w-40 text-start lg:w-52">{t('ابحث عن صفحة أو إجراء', 'Find a page or action')}</span>
              <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold" dir="ltr">
                Ctrl K
              </kbd>
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} className={cn(iconBtn, 'md:hidden')} aria-label={t('بحث سريع', 'Quick search')}>
              <Search className="h-5 w-5" />
            </button>

            <span className="mx-1 hidden items-center gap-1.5 rounded-lg px-2 text-[12px] text-white/70 xl:inline-flex">
              <CalendarRange className="h-4 w-4" aria-hidden="true" />
              {t('فصل الخريف 2026/2027', 'Fall term 2026/2027')}
            </span>

            {isStudent && (
              <button
                type="button"
                onClick={() => setShowTranscriptModal(true)}
                className="hidden h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-white/90 transition hover:bg-white/10 hover:text-white lg:inline-flex"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t('السجل الموثق', 'Verified transcript')}
              </button>
            )}

            {currentUser?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => navigate('/admin/users')}
                className="hidden h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-white/90 transition hover:bg-white/10 hover:text-white lg:inline-flex"
              >
                <UserCog className="h-4 w-4" aria-hidden="true" />
                {t('المستخدمون', 'Users')}
              </button>
            )}

            <button
              type="button"
              onClick={toggleLanguage}
              className="h-10 rounded-xl px-2.5 text-[13px] font-bold text-white/90 transition hover:bg-white/10 hover:text-white"
              aria-label={language === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
              title={language === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
            >
              {language === 'ar' ? 'EN' : 'ع'}
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  if (!showNotifMenu) loadNotifications();
                  setShowNotifMenu(v => !v);
                  setShowUserMenu(false);
                }}
                className={iconBtn}
                aria-label={t(`الإشعارات (${unreadCount} غير مقروء)`, `Notifications (${unreadCount} unread)`)}
                aria-expanded={showNotifMenu}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute end-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-route-400 px-1 text-[10.5px] font-extrabold text-ink-950 ring-2 ring-sign-600">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <div className="absolute end-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-ink-200 bg-paper text-ink-900 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)] animate-pop-in">
                  <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                    <span className="text-[14px] font-bold">{t('الإشعارات', 'Notifications')}</span>
                    {unreadCount > 0 ? (
                      <button type="button" onClick={markAllRead} className="link-action text-[12.5px]">
                        {t('تحديد الكل كمقروء', 'Mark all as read')}
                      </button>
                    ) : (
                      <span className="text-[12px] text-ink-400">{t('لا جديد', 'All caught up')}</span>
                    )}
                  </div>
                  <ul className="max-h-[360px] divide-y divide-ink-100 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <li className="px-4 py-10 text-center text-[13px] text-ink-500">{t('لا توجد إشعارات بعد.', 'No notifications yet.')}</li>
                    ) : (
                      notifications.map(n => {
                        const { Icon, cls } = notifIcon(n.type);
                        return (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => openNotification(n)}
                              className={cn('flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-ink-50', !n.read && 'bg-route-50/70')}
                            >
                              <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', cls)}>
                                <Icon className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 text-[13px] font-bold text-ink-900">
                                  {language === 'ar' ? n.titleAr : n.titleEn}
                                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-route-500" aria-label={t('غير مقروء', 'Unread')} />}
                                </span>
                                <span className="mt-0.5 block text-[12.5px] leading-6 text-ink-600">
                                  {language === 'ar' ? n.messageAr : n.messageEn}
                                </span>
                                <time dateTime={n.createdAt} title={formatDate(n.createdAt)} className="mt-1 block text-[11.5px] text-ink-400">
                                  {formatWhen(n.createdAt)}
                                </time>
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* User menu */}
            {currentUser && (
              <div className="relative" ref={userRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(v => !v);
                    setShowNotifMenu(false);
                  }}
                  className="flex h-10 items-center gap-2 rounded-xl ps-1 pe-2 transition hover:bg-white/10"
                  aria-expanded={showUserMenu}
                  aria-label={t('قائمة الحساب', 'Account menu')}
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-route-400 text-[12.5px] font-extrabold text-ink-950">
                    {initialsOf(displayName)}
                  </span>
                  <span className="hidden max-w-[160px] text-start lg:block">
                    <span className="block truncate text-[13px] font-bold leading-5">{displayName}</span>
                    <span className="block truncate text-[11.5px] leading-4 text-white/65">
                      {language === 'ar' ? roleLabel[currentUser.role]?.ar : roleLabel[currentUser.role]?.en}
                    </span>
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-white/60 lg:block" aria-hidden="true" />
                </button>

                {showUserMenu && (
                  <div className="absolute end-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-ink-200 bg-paper text-ink-900 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)] animate-pop-in">
                    <div className="border-b border-ink-100 px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-sign-600 text-[14px] font-extrabold text-white">
                          {initialsOf(displayName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold">{displayName}</p>
                          <p className="truncate text-[12px] text-ink-500" dir="ltr">
                            {currentUser.email}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={chipClass[roleTone[currentUser.role] || 'ink']}>
                          {language === 'ar' ? roleLabel[currentUser.role]?.ar : roleLabel[currentUser.role]?.en}
                        </span>
                        {currentUser.studentId && (
                          <span className="chip chip-ink" dir="ltr">
                            {currentUser.studentId}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-2">
                      {isStudent && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowTranscriptModal(true);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] font-semibold text-ink-700 transition hover:bg-ink-50 lg:hidden"
                        >
                          <FileText className="h-4 w-4" aria-hidden="true" />
                          {t('السجل الموثق', 'Verified transcript')}
                        </button>
                      )}
                      {currentUser.role === 'ADMIN' && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowUserMenu(false);
                            navigate('/admin/users');
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] font-semibold text-ink-700 transition hover:bg-ink-50 lg:hidden"
                        >
                          <UserCog className="h-4 w-4" aria-hidden="true" />
                          {t('إدارة المستخدمين', 'User management')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          logout();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[13px] font-semibold text-signal-600 transition hover:bg-signal-50"
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        {t('تسجيل الخروج', 'Sign out')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Row 2 — the route line */}
        <RouteNav currentTab={currentTab} onSelectTab={onSelectTab} />
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        currentTab={currentTab}
        onSelectTab={onSelectTab}
        onOpenTranscript={isStudent ? () => setShowTranscriptModal(true) : undefined}
      />

      {showTranscriptModal && (
        <TranscriptReportModal
          studentId={currentUser?.studentId || currentUser?.id || 'stu_omar'}
          onClose={() => setShowTranscriptModal(false)}
        />
      )}
    </header>
  );
};
