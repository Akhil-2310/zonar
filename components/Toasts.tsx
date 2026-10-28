'use client';
import { useCallback, useRef, useState } from 'react';
import { Icon } from './Pixel';
import type { Tone } from '@/lib/game';

export type Toast = { id: number; text: string; tone?: Tone | 'info'; icon?: string; title?: string };

// A small queue of pop-up notes that dismiss themselves.
export function useToasts(ms = 4500) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>, delay = 0) => {
      const id = next.current++;
      setTimeout(() => {
        setToasts((all) => [...all.slice(-4), { ...t, id }]);
        setTimeout(() => dismiss(id), ms);
      }, delay);
    },
    [dismiss, ms],
  );
  return { toasts, push, dismiss };
}

const TONE = {
  good: 'bg-mint',
  warn: 'bg-alert-soft',
  info: 'bg-card',
} as const;

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-4 top-16 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:items-end" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`toy pointer-events-auto flex w-full max-w-[360px] animate-toast-in items-start gap-3 rounded-2xl px-4 py-3 text-left ${TONE[t.tone ?? 'info']}`}
        >
          <span className="toy-sm flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lcd">
            <Icon name={t.icon ?? 'ping'} size={22} />
          </span>
          <span className="min-w-0">
            {t.title && <span className="block font-tiny text-[10px] uppercase tracking-[0.16em] text-muted">{t.title}</span>}
            <span className="block text-[15px] leading-snug">{t.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
