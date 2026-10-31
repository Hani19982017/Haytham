import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { cn, chipClass, toneSolidBg, toneSoftBg, toneColor, toneText, type Tone } from './tones.js';

/* ----------------------------------------------------------------------------
 * PageHeader — the "station sign" that opens every page.
 * A pictogram plate, the page name set large, one line of purpose, actions.
 * -------------------------------------------------------------------------- */
interface PageHeaderProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: Tone;
  meta?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  description,
  actions,
  tone = 'sign',
  meta,
  className,
  children,
}) => (
  <header className={cn('flex flex-col gap-4', className)}>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex items-start gap-4 min-w-0">
        {Icon && (
          <div
            className={cn(
              'grid h-12 w-12 shrink-0 place-items-center rounded-xl shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)]',
              toneSolidBg[tone]
            )}
            aria-hidden="true"
          >
            <Icon className="h-6 w-6" strokeWidth={2.2} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="t-display display-tight text-[24px] sm:text-[28px]">{title}</h1>
          {description && (
            <p className="mt-1 max-w-[72ch] text-[13.5px] leading-7 text-ink-600">{description}</p>
          )}
          {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
    </div>
    {children}
  </header>
);

/* ----------------------------------------------------------------------------
 * Panel + PanelHeader
 * -------------------------------------------------------------------------- */
interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  padded?: boolean;
  as?: 'section' | 'div' | 'article' | 'aside';
}

export const Panel: React.FC<PanelProps> = ({ padded = true, as = 'section', className, children, ...rest }) => {
  const Comp = as as any;
  return (
    <Comp className={cn('panel', padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </Comp>
  );
};

interface PanelHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  actions?: React.ReactNode;
  className?: string;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ title, description, icon: Icon, tone = 'sign', actions, className }) => (
  <div className={cn('mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
    <div className="flex min-w-0 items-start gap-3">
      {Icon && (
        <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', toneSoftBg[tone])} aria-hidden="true">
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold leading-7 text-ink-950">{title}</h2>
        {description && <p className="text-[12.5px] leading-6 text-ink-500">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/* ----------------------------------------------------------------------------
 * Stat — one figure with its label. Used sparingly, in rows.
 * -------------------------------------------------------------------------- */
interface StatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

export const Stat: React.FC<StatProps> = ({ label, value, unit, hint, tone = 'ink', icon: Icon, className, onClick, active }) => {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-500">{label}</span>
        {Icon && <Icon className={cn('h-4 w-4', toneText[tone])} aria-hidden="true" />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cn('t-num text-[30px] font-extrabold leading-none', toneText[tone])}>{value}</span>
        {unit && <span className="text-[12.5px] font-medium text-ink-500">{unit}</span>}
      </div>
      {hint && <div className="mt-2 text-[12px] leading-5 text-ink-500">{hint}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'panel stripe-start p-4 text-start transition hover:border-ink-300',
          active && 'border-ink-900 ring-2 ring-ink-900/10',
          className
        )}
        style={{ ['--stripe' as any]: toneColor[tone] }}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cn('panel stripe-start p-4', className)} style={{ ['--stripe' as any]: toneColor[tone] }}>
      {body}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Chip & CodeBadge
 * -------------------------------------------------------------------------- */
export const Chip: React.FC<{ tone?: Tone; icon?: LucideIcon; className?: string; children: React.ReactNode; title?: string }> = ({
  tone = 'ink',
  icon: Icon,
  className,
  children,
  title,
}) => (
  <span className={cn(chipClass[tone], className)} title={title}>
    {Icon && <Icon aria-hidden="true" />}
    {children}
  </span>
);

export const CodeBadge: React.FC<{ code: string; variant?: 'solid' | 'soft' | 'sign' | 'signal'; className?: string; title?: string }> = ({
  code,
  variant = 'soft',
  className,
  title,
}) => (
  <span
    className={cn(
      'code-badge',
      variant === 'soft' && 'code-badge-soft',
      variant === 'sign' && 'code-badge-sign',
      variant === 'signal' && 'code-badge-signal',
      className
    )}
    title={title}
  >
    {code}
  </span>
);

/* ----------------------------------------------------------------------------
 * Meter
 * -------------------------------------------------------------------------- */
export const Meter: React.FC<{ value: number; tone?: Tone; className?: string; label?: string }> = ({ value, tone = 'sign', className, label }) => {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('meter', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span style={{ width: `${pct}%`, background: toneColor[tone] }} />
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Loader — a train running between two stations
 * -------------------------------------------------------------------------- */
export const Loader: React.FC<{ label?: React.ReactNode; className?: string; compact?: boolean }> = ({ label, className, compact }) => (
  <div className={cn('flex flex-col items-center justify-center gap-3', compact ? 'py-6' : 'py-20', className)} role="status" aria-live="polite">
    <div className="loader-track" aria-hidden="true">
      <span className="loader-stop" style={{ insetInlineStart: 0 }} />
      <span className="loader-stop" style={{ insetInlineEnd: 0 }} />
      <span className="loader-train" />
    </div>
    {label && <p className="text-[13px] text-ink-500">{label}</p>}
  </div>
);

/* ----------------------------------------------------------------------------
 * EmptyState
 * -------------------------------------------------------------------------- */
export const EmptyState: React.FC<{
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: Tone;
  className?: string;
}> = ({ icon: Icon, title, description, action, tone = 'ink', className }) => (
  <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
    {Icon && (
      <span className={cn('grid h-12 w-12 place-items-center rounded-full', toneSoftBg[tone])} aria-hidden="true">
        <Icon className="h-6 w-6" />
      </span>
    )}
    <div className="max-w-md">
      <p className="text-[15px] font-bold text-ink-900">{title}</p>
      {description && <p className="mt-1 text-[13px] leading-6 text-ink-500">{description}</p>}
    </div>
    {action}
  </div>
);

/* ----------------------------------------------------------------------------
 * Segmented — tabs / filters
 * -------------------------------------------------------------------------- */
export interface SegmentedOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  count?: number;
  icon?: LucideIcon;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn('seg', className)} role="tablist" aria-label={ariaLabel}>
      {options.map(opt => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            className="seg-item"
            onClick={() => onChange(opt.value)}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && <span className="seg-count">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Toast — fixed message after an action. Parent owns the timer.
 * -------------------------------------------------------------------------- */
export const Toast: React.FC<{
  tone?: 'sign' | 'signal' | 'lane' | 'caution';
  children: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}> = ({ tone = 'sign', children, onClose, closeLabel = 'Close' }) => {
  const Icon = tone === 'signal' ? AlertCircle : tone === 'caution' ? AlertTriangle : tone === 'lane' ? Info : CheckCircle2;
  const iconColor =
    tone === 'signal' ? 'text-signal-300' : tone === 'caution' ? 'text-caution-300' : tone === 'lane' ? 'text-lane-200' : 'text-route-400';
  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-5 start-5 end-5 z-[70] mx-auto flex max-w-lg animate-rise-in items-start gap-3 rounded-xl bg-ink-950 px-4 py-3 text-[13px] font-medium leading-6 text-white shadow-[0_12px_30px_-10px_rgb(0_0_0/0.5)] sm:end-auto"
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} aria-hidden="true" />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="-m-1 rounded-md p-1 text-ink-300 hover:bg-white/10 hover:text-white" aria-label={closeLabel}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Field — label + control + hint
 * -------------------------------------------------------------------------- */
export const Field: React.FC<{
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, error, className, children }) => (
  <div className={className}>
    <label className="field-label" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
    {error ? <p className="field-hint !text-signal-600">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
  </div>
);

/* ----------------------------------------------------------------------------
 * KeyValue grid helper
 * -------------------------------------------------------------------------- */
export const KeyValue: React.FC<{ label: React.ReactNode; value: React.ReactNode; className?: string }> = ({ label, value, className }) => (
  <dl className={cn('kv', className)}>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </dl>
);
