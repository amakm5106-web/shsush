'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface BuffaloDialogProps {
  titleId: string;
  descriptionId?: string;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  backdropDismiss?: boolean;
  escapeDismiss?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BuffaloDialog({
  titleId,
  descriptionId,
  onClose,
  children,
  panelClassName = '',
  backdropDismiss = true,
  escapeDismiss = true,
}: BuffaloDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const escapeDismissRef = useRef(escapeDismiss);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    escapeDismissRef.current = escapeDismiss;
  }, [escapeDismiss]);

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getAttribute('aria-hidden') !== 'true'
      );

    const focusable = getFocusable();
    (focusable[0] ?? panel).focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (escapeDismissRef.current) onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-xl sm:p-5"
      onClick={(event) => {
        if (backdropDismiss && event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`relative my-auto max-h-[92dvh] w-full overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.8)] outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
