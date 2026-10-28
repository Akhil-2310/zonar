'use client';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Avatar from './Avatar';
import { Icon } from './Pixel';

const COLORS = ['#f4b728', '#ff5f6d', '#5b8cff', '#3fae6a', '#e2d8ff', '#ffc7da', '#c9f2df'];

// A win: pixel confetti and gold coins rain down, and your pet throws a party over the board.
export default function Celebration({ avatar, title, sub, ms = 5200 }: { avatar?: string; title: string; sub?: string; ms?: number }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [ms]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => {
        const coin = i % 7 === 0;
        const size = coin ? 22 + Math.random() * 10 : 7 + Math.random() * 9;
        return {
          coin,
          style: {
            left: `${Math.random() * 100}%`,
            width: size,
            height: coin ? size : size * (Math.random() < 0.5 ? 1 : 0.5),
            background: coin ? undefined : COLORS[i % COLORS.length],
            '--drift': `${(Math.random() - 0.5) * 260}px`,
            '--spin': `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`,
            '--dur': `${2.6 + Math.random() * 2.2}s`,
            '--delay': `${Math.random() * 1.6}s`,
          } as CSSProperties,
        };
      }),
    [],
  );

  if (!on) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) =>
        p.coin ? (
          <span key={i} className="confetti" style={p.style}>
            <Icon name="coin" className="h-full w-full" />
          </span>
        ) : (
          <span key={i} className="confetti border border-ink/40" style={p.style} />
        ),
      )}
      <div className="burst absolute inset-x-0 top-[14%] flex flex-col items-center">
        <div className="toy flex items-center gap-4 rounded-[28px] bg-butter px-7 py-5">
          <div className="toy-sm lcd rounded-2xl p-1.5">
            <Avatar id={avatar} mood="party" size={76} className="animate-hop" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-tiny text-[11px] uppercase tracking-[0.2em] text-zec-deep">
              <Icon name="star" size={16} /> you win <Icon name="star" size={16} />
            </div>
            <div className="font-display text-4xl font-bold leading-tight">{title}</div>
            {sub && <div className="text-[15px] text-muted">{sub}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
