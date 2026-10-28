'use client';
import { useEffect, useState } from 'react';
import { api, taz } from '@/lib/api';
import type { HouseInfo } from '@/lib/types';

export default function HouseStatus({ compact = false }: { compact?: boolean }) {
  const [h, setH] = useState<HouseInfo | null>(null);
  useEffect(() => {
    api<HouseInfo>('/api/house').then(setH).catch(() => {});
  }, []);
  if (!h) return <p className="font-tiny text-[11px] text-faint">Checking the house vault…</p>;
  const live = h.network === 'testnet';
  const funded = h.spendableZat != null && h.spendableZat >= h.prizeZat;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] ${compact ? '' : 'toy-sm rounded-2xl bg-mint px-4 py-3'}`}>
      <span className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 border-2 border-ink ${live && funded ? 'bg-ok' : 'animate-pulse-dot bg-zec'}`} />
        <span className="font-tiny text-[11px] uppercase">{live ? 'Zcash testnet' : 'Mock ledger'}</span>
      </span>
      <span className="text-ink/75">
        House vault {h.spendableZat == null ? 'syncing…' : taz(h.spendableZat)} · {taz(h.prizeZat)} per head-to-head win ·{' '}
        {h.prizeMatchesLeftToday} prize {h.prizeMatchesLeftToday === 1 ? 'match' : 'matches'} left today
      </span>
      {live && !funded && h.spendableZat != null && (
        <span className="w-full break-all font-mono text-[11px] text-muted">
          Fund it with testnet TAZ: <span className="text-ink">{h.address}</span>
        </span>
      )}
    </div>
  );
}
