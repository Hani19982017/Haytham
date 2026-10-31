import React, { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { getStationsForRole } from './navigation.js';

interface RouteNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

/**
 * Main navigation drawn as a transit line: each page is a station,
 * the current page is the yellow "you are here" stop.
 */
export const RouteNav: React.FC<RouteNavProps> = ({ currentTab, onSelectTab }) => {
  const { currentUser } = useAuth();
  const { t, language } = useLanguage();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stations = getStationsForRole(currentUser?.role);

  // Keep the active station visible on narrow screens.
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [currentTab]);

  if (stations.length === 0) return null;

  const edge = `${50 / stations.length}%`;

  return (
    <nav aria-label={t('التنقل الرئيسي', 'Main navigation')} className="route-nav no-print">
      <div ref={scrollerRef} className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="relative min-w-max sm:min-w-0">
          {stations.length > 1 && (
            <span aria-hidden="true" className="route-track" style={{ insetInlineStart: edge, insetInlineEnd: edge }} />
          )}
          <ol className="relative flex">
          {stations.map(station => {
            const active = station.id === currentTab;
            return (
              <li key={station.id} className="flex min-w-[104px] flex-1 justify-center">
                <button
                  type="button"
                  onClick={() => onSelectTab(station.id)}
                  data-active={active}
                  aria-current={active ? 'page' : undefined}
                  className="route-station group relative flex flex-col items-center gap-2 rounded-lg px-3 pb-3 pt-2 focus-visible:outline-route-400"
                >
                  <span className="route-station-dot relative z-[1]" aria-hidden="true" />
                  <span
                    className={
                      active
                        ? 'whitespace-nowrap text-[13px] font-bold text-route-300'
                        : 'whitespace-nowrap text-[13px] font-medium text-white/80 transition group-hover:text-white'
                    }
                  >
                    {language === 'ar' ? station.labelAr : station.labelEn}
                  </span>
                </button>
              </li>
            );
          })}
          </ol>
        </div>
      </div>
    </nav>
  );
};
