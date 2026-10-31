import React from 'react';
import { MapPin } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.js';
import { cn } from './tones.js';

type Align = 'start' | 'center' | 'end';

const alignFor = (pct: number): Align => (pct < 7 ? 'start' : pct > 93 ? 'end' : 'center');

// Horizontal anchoring that respects reading direction.
const anchorClass: Record<Align, string> = {
  start: '',
  center: 'ltr:-translate-x-1/2 rtl:translate-x-1/2',
  end: 'ltr:-translate-x-full rtl:translate-x-full',
};

const textAlign: Record<Align, string> = {
  start: 'text-start items-start',
  center: 'text-center items-center',
  end: 'text-end items-end',
};

export interface JourneyMilestone {
  at: number;
  label: string;
  sub?: string;
}

/**
 * The degree as a route: start → bylaw milestones → graduation,
 * with completed hours drawn in green, current enrolment striped,
 * and a "you are here" pin. Flows in reading direction.
 */
export const JourneyRoute: React.FC<{
  completed: number;
  enrolled?: number;
  total: number;
  milestones: JourneyMilestone[];
  className?: string;
}> = ({ completed, enrolled = 0, total, milestones, className }) => {
  const { t } = useLanguage();
  const pct = Math.max(0, Math.min(100, (completed / total) * 100));
  const enrolledPct = Math.max(0, Math.min(100 - pct, (enrolled / total) * 100));
  const pinAlign = alignFor(pct);

  return (
    <div className={cn('relative h-[132px] select-none', className)} aria-label={t(`أنجزت ${completed} من ${total} ساعة`, `${completed} of ${total} credit hours completed`)} role="img">
      {/* you-are-here pin */}
      <div
        className={cn('journey-pin absolute top-0 flex flex-col', textAlign[pinAlign], anchorClass[pinAlign])}
        style={{ insetInlineStart: `${pct}%` }}
      >
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-route-400 px-2.5 py-1 text-[12.5px] font-bold text-ink-950 shadow-[0_6px_14px_-6px_rgb(0_0_0/0.35)]">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {t('أنت هنا', 'You are here')}
          <span className="t-num font-extrabold">{completed}</span>
          <span className="font-medium">{t('ساعة', 'cr')}</span>
        </span>
        <span
          className={cn(
            'mt-0.5 h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-route-400',
            pinAlign === 'start' ? 'ms-3' : pinAlign === 'end' ? 'me-3 self-end' : 'self-center'
          )}
        />
      </div>

      {/* track */}
      <div className="absolute inset-x-0 top-[52px] h-2 rounded-full bg-ink-200" />
      {/* completed */}
      <div className="journey-fill absolute start-0 top-[52px] h-2 rounded-full bg-sign-600" style={{ width: `${pct}%` }} />
      {/* currently enrolled */}
      {enrolledPct > 0 && (
        <div
          className="absolute top-[52px] h-2 rounded-full"
          style={{
            insetInlineStart: `${pct}%`,
            width: `${enrolledPct}%`,
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--color-route-400) 0 6px, var(--color-route-200) 6px 12px)',
          }}
          title={t('ساعات مسجلة هذا الفصل', 'Hours enrolled this term')}
        />
      )}

      {/* start station */}
      <div className="absolute top-[47px] flex flex-col items-start" style={{ insetInlineStart: 0 }}>
        <span className="h-[18px] w-[18px] rounded-full border-[4px] border-sign-600 bg-white" />
        <span className="mt-2 hidden text-[11.5px] font-semibold text-ink-500 sm:block">{t('البداية', 'Start')}</span>
      </div>

      {/* milestones */}
      {milestones.map(m => {
        const mPct = Math.max(0, Math.min(100, (m.at / total) * 100));
        const reached = completed >= m.at;
        const align = alignFor(mPct);
        return (
          <div
            key={m.at}
            className={cn('absolute top-[47px] flex flex-col', textAlign[align], anchorClass[align])}
            style={{ insetInlineStart: `${mPct}%` }}
          >
            <span
              className={cn(
                'h-[18px] w-[18px] rounded-full border-[4px]',
                reached ? 'border-sign-600 bg-sign-600 ring-2 ring-white' : 'border-ink-300 bg-white',
                align === 'center' && 'self-center',
                align === 'end' && 'self-end'
              )}
            />
            <span className={cn('mt-2 whitespace-nowrap text-[12px] font-bold', reached ? 'text-sign-700' : 'text-ink-700')}>{m.label}</span>
            {m.sub && <span className="whitespace-nowrap text-[11px] text-ink-500">{m.sub}</span>}
          </div>
        );
      })}
    </div>
  );
};

/**
 * GPA on the bylaw scale: four zones, each with its registration ceiling.
 */
export const GpaScale: React.FC<{ gpa: number; className?: string }> = ({ gpa, className }) => {
  const { t } = useLanguage();
  const pct = Math.max(0, Math.min(100, (gpa / 4) * 100));
  const zones = [
    { from: 0, cap: 12, bg: 'bg-signal-200', text: 'text-signal-700' },
    { from: 1, cap: 15, bg: 'bg-caution-200', text: 'text-caution-700' },
    { from: 2, cap: 18, bg: 'bg-sign-100', text: 'text-sign-700' },
    { from: 3, cap: 21, bg: 'bg-sign-300', text: 'text-sign-800' },
  ];
  const align = alignFor(pct);

  return (
    <div className={cn('relative pt-9', className)}>
      <div
        className={cn('absolute top-0 flex flex-col', textAlign[align], anchorClass[align])}
        style={{ insetInlineStart: `${pct}%` }}
      >
        <span className="t-num rounded-md bg-ink-950 px-2 py-0.5 text-[12px] font-bold text-white">{gpa.toFixed(2)}</span>
        <span
          className={cn(
            'h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink-950',
            align === 'start' ? 'ms-2' : align === 'end' ? 'me-2 self-end' : 'self-center'
          )}
        />
      </div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {zones.map(z => (
          <div key={z.from} className={cn('flex-1', z.bg, z.from > 0 && 'border-s-2 border-white')} />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1">
        {zones.map(z => (
          <div key={z.from} className="text-[11px] leading-4">
            <span className="t-num font-semibold text-ink-600">{z.from.toFixed(1)}+</span>
            <span className={cn('block font-medium', z.text)}>{t(`حد ${z.cap} ساعة`, `max ${z.cap} cr`)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
