'use client';
import { useEffect, useState } from 'react';
import { api, taz } from '@/lib/api';
import type { HouseInfo } from '@/lib/types';

export default function HouseStatus({ compact = false }: { compact?: boolean }) {
  const [h, setH] = useState<HouseInfo | null>(null);
  useEffect(() => {
    api<HouseInfo>('/api/house').then(setH).catch(() => {});
  }, []);
  if (!h) return <p className="font-mono text-xs text-faint">Checking the house vault…</p>;
  const live = h.network === 'testnet';
  const funded = h.spendableZat != null && h.spendableZat >= h.prizeZat;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs ${compact ? '' : 'rounded-xl border border-line bg-card px-4 py-3'}`}>
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${live && funded ? 'bg-ok' : 'bg-zec animate-pulse-dot'}`} />
        <span className="font-semibold text-ink">{live ? 'Zcash testnet' : 'Mock ledger'}</span>
      </span>
      <span className="text-muted">
        House vault {h.spendableZat == null ? 'syncing…' : taz(h.spendableZat)} · {taz(h.prizeZat)} per head-to-head win ·{' '}
        {h.prizeMatchesLeftToday} prize {h.prizeMatchesLeftToday === 1 ? 'match' : 'matches'} left today
      </span>
      {live && !funded && h.spendableZat != null && (
        <span className="w-full break-all text-muted">
          Fund it with testnet TAZ: <span className="text-ink">{h.address}</span>
        </span>
      )}
    </div>
  );
}
