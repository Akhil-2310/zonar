'use client';
import { useEffect, useState } from 'react';
import type { Clock } from './types';

// Seconds until this turn's orders are due, corrected for skew between the server's clock and this browser's.
export function useSecondsLeft(clock: Clock | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0);
  const sentAt = clock?.now;
  useEffect(() => {
    if (sentAt) setSkew(sentAt - Date.now());
  }, [sentAt]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  if (!clock?.deadline) return null;
  return Math.max(0, Math.ceil((clock.deadline - (now + skew)) / 1000));
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
