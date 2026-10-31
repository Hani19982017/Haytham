import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { cn, toneSoftBg, type Tone } from './tones.js';

const sizeClass = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

interface ModalProps {
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  size?: keyof typeof sizeClass;
  footer?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  closeLabel?: string;
  /** Id placed on the scrollable body (useful for print targets). */
  bodyId?: string;
  /** Prevent closing on backdrop click (e.g. while saving). */
  dismissible?: boolean;
}

// Track how many modals are open so nested modals don't unlock scrolling early,
// and which one is on top so Escape closes only that one.
let openModalCount = 0;
const modalStack: string[] = [];

/**
 * Accessible dialog rendered into <body>. Closes on Escape and backdrop click,
 * locks page scroll, and returns focus to the trigger when it closes.
 * When a modal is open, print CSS prints only the modal.
 */
export const Modal: React.FC<ModalProps> = ({
  onClose,
  title,
  subtitle,
  icon: Icon,
  tone = 'sign',
  size = 'md',
  footer,
  children,
  bodyClassName,
  closeLabel = 'Close',
  bodyId,
  dismissible = true,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  // Mount/unmount only: lock page scroll, move focus in, restore focus on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    modalStack.push(titleId);
    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissibleRef.current && modalStack[modalStack.length - 1] === titleId) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
      const at = modalStack.lastIndexOf(titleId);
      if (at >= 0) modalStack.splice(at, 1);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="modal-root fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-ink-950/55 p-0 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-6"
      onMouseDown={e => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'modal-panel flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-ink-200 bg-paper shadow-[0_30px_70px_-20px_rgb(0_0_0/0.45)] outline-none animate-pop-in sm:rounded-2xl',
          sizeClass[size]
        )}
      >
        {(title || Icon) && (
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              {Icon && (
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', toneSoftBg[tone])} aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-[16.5px] font-bold leading-7 text-ink-950">
                    {title}
                  </h2>
                )}
                {subtitle && <div className="text-[12.5px] leading-6 text-ink-500">{subtitle}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="no-print -m-1.5 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-800"
              aria-label={closeLabel}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div id={bodyId} className={cn('modal-body flex-1 overflow-y-auto px-5 py-5 sm:px-6', bodyClassName)}>
          {children}
        </div>
        {footer && (
          <div className="no-print flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50 px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
