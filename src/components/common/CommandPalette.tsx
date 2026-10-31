import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { Search, CornerDownLeft, Languages, LogOut, FileText, ArrowUp, ArrowDown } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { getStationsForRole } from './navigation.js';
import { cn } from '../ui/tones.js';

interface PaletteItem {
  id: string;
  group: 'page' | 'action';
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenTranscript?: () => void;
}

/**
 * Ctrl/⌘ + K — jump to any page of your role or run a common action.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, currentTab, onSelectTab, onOpenTranscript }) => {
  const { t, language, toggleLanguage } = useLanguage();
  const { currentUser, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const items: PaletteItem[] = useMemo(() => {
    const stations = getStationsForRole(currentUser?.role);
    const pages: PaletteItem[] = stations.map(s => ({
      id: s.id,
      group: 'page',
      label: language === 'ar' ? s.labelAr : s.labelEn,
      hint: language === 'ar' ? s.hintAr : s.hintEn,
      icon: s.icon,
      keywords: `${s.labelAr} ${s.labelEn} ${s.hintAr} ${s.hintEn}`.toLowerCase(),
      run: () => onSelectTab(s.id),
    }));

    const actions: PaletteItem[] = [
      {
        id: 'action-language',
        group: 'action',
        label: language === 'ar' ? 'Switch to English' : 'التحويل إلى العربية',
        hint: t('تغيير لغة الواجهة واتجاهها', 'Change interface language and direction'),
        icon: Languages,
        keywords: 'language english arabic لغة انجليزي عربي',
        run: () => toggleLanguage(),
      },
    ];

    if (currentUser?.role === 'STUDENT' && onOpenTranscript) {
      actions.push({
        id: 'action-transcript',
        group: 'action',
        label: t('عرض السجل الأكاديمي الموثق', 'Open verified transcript'),
        hint: t('كشف درجات رسمي برمز تحقق QR', 'Official transcript with a QR verification code'),
        icon: FileText,
        keywords: 'transcript qr سجل كشف درجات',
        run: () => onOpenTranscript(),
      });
    }

    actions.push({
      id: 'action-logout',
      group: 'action',
      label: t('تسجيل الخروج', 'Sign out'),
      hint: t('إنهاء الجلسة على هذا الجهاز', 'End the session on this device'),
      icon: LogOut,
      keywords: 'logout sign out خروج',
      run: () => {
        logout();
      },
    });

    return [...pages, ...actions];
  }, [currentUser, language, onSelectTab, onOpenTranscript, toggleLanguage, logout, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.keywords.includes(q) || i.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const runItem = (item: PaletteItem) => {
    onClose();
    item.run();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) runItem(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup: string | null = null;

  return createPortal(
    <div
      className="no-print fixed inset-0 z-[80] flex items-start justify-center bg-ink-950/50 px-4 pt-[12vh] backdrop-blur-[2px] animate-fade-in"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('البحث السريع', 'Quick search')}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-ink-200 bg-paper shadow-[0_30px_70px_-20px_rgb(0_0_0/0.5)] animate-pop-in"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-ink-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('اكتب اسم صفحة أو إجراء…', 'Type a page or an action…')}
            className="h-14 w-full bg-transparent text-[15px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
            aria-label={t('ابحث', 'Search')}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined}
          />
          <kbd className="hidden shrink-0 rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] font-semibold text-ink-500 sm:inline">
            Esc
          </kbd>
        </div>

        <ul id="command-palette-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <li className="px-3 py-10 text-center text-[13px] text-ink-500">
              {t('لا توجد نتيجة بهذا الاسم. جرّب كلمة أخرى.', 'Nothing matches that. Try another word.')}
            </li>
          )}
          {filtered.map((item, index) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            const Icon = item.icon;
            const isCurrent = item.id === currentTab;
            return (
              <React.Fragment key={item.id}>
                {showGroup && (
                  <li className="px-3 pb-1 pt-2 text-[11.5px] font-semibold text-ink-400" role="presentation">
                    {item.group === 'page' ? t('الصفحات', 'Pages') : t('إجراءات', 'Actions')}
                  </li>
                )}
                <li
                  id={`cmd-${item.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-index={index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runItem(item)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5',
                    index === activeIndex ? 'bg-sign-50' : 'hover:bg-ink-50'
                  )}
                >
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                      index === activeIndex ? 'bg-sign-600 text-white' : 'bg-ink-100 text-ink-600'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">
                      {item.label}
                      {isCurrent && <span className="chip chip-route">{t('أنت هنا', 'You are here')}</span>}
                    </span>
                    <span className="block truncate text-[12px] text-ink-500">{item.hint}</span>
                  </span>
                  {index === activeIndex && <CornerDownLeft className="h-4 w-4 shrink-0 text-sign-600" aria-hidden="true" />}
                </li>
              </React.Fragment>
            );
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-ink-100 bg-ink-50 px-4 py-2.5 text-[11.5px] text-ink-500">
          <span className="inline-flex items-center gap-1">
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {t('للتنقل', 'to move')}
          </span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('للفتح', 'to open')}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};
