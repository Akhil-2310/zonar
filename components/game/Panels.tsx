'use client';
import { useState, type ReactNode } from 'react';
import Avatar from '@/components/Avatar';
import { Chest } from './Board';
import { describe, lastTurn } from '@/lib/game';
import { short, taz } from '@/lib/api';
import type { ChainState, GameView } from '@/lib/types';

export function Agents({ view: v }: { view: GameView }) {
  const [peek, setPeek] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-zec/60 bg-card p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar id={v.you.avatar} size={46} ring="you" />
            {v.you.carrying && <Chest className="absolute -right-2 -top-2 h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display font-semibold">{v.you.name}</div>
            <div className="font-mono text-[11px] text-zec-deep">you</div>
          </div>
        </div>
        <button
          onClick={() => setPeek(!peek)}
          title="Hidden from shoulder-surfers. Click to show or hide."
          className="mt-3 flex w-full items-baseline justify-between rounded-xl bg-zec-soft px-3 py-1.5"
        >
          <span className="text-xs text-zec-deep">shielded credits</span>
          <span className={`font-mono text-xl font-bold text-ink transition ${peek ? '' : 'blur-[6px]'}`}>{v.you.credits}</span>
        </button>
      </div>
      <div className="rounded-2xl border border-line bg-card p-3.5 shadow-sm">
        {v.rival ? (
          <>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar id={v.rival.avatar} size={46} ring="rival" />
                {v.rival.carrying && <Chest className="absolute -right-2 -top-2 h-6 w-6" />}
              </div>
              <div className="min-w-0">
                <div className="truncate font-display font-semibold">{v.rival.name}</div>
                <div className="font-mono text-[11px] text-rival">rival{v.rival.isBot ? ' · bot' : ''}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-paper-2 px-3 py-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${v.rival.locked ? 'bg-rival' : 'animate-pulse-dot bg-faint'}`} />
              <span className="text-muted">{v.phase !== 'active' ? 'match over' : v.rival.locked ? 'orders sealed' : 'deciding…'}</span>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">Waiting for a rival…</div>
        )}
      </div>
    </div>
  );
}

export function Intel({ view: v }: { view: GameView }) {
  const lt = lastTurn(v);
  const items = [...v.intel].reverse();
  return (
    <Panel title="Decrypted memos" note="only you can read these">
      <ol className="max-h-56 space-y-1 overflow-auto pr-1">
        {items.length === 0 && <li className="text-sm text-muted">No intel yet. Your rival is somewhere in the fog.</li>}
        {items.map((e, i) => {
          const [text, tone] = describe(e);
          const fresh = e.turn === lt;
          const border = tone === 'warn' ? 'border-alert' : tone === 'good' ? 'border-ok' : fresh ? 'border-zec' : 'border-line';
          return (
            <li key={i} className={`border-l-2 py-1 pl-3 text-[13px] ${border} ${fresh ? 'bg-zec-soft/50 text-ink' : 'text-muted'}`}>
              <span className="mr-2 font-mono text-[10px] text-faint">T{e.turn}</span>
              {text}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export function TxLink({ chain, txid }: { chain: ChainState; txid?: string }) {
  if (!txid) return null;
  return chain.explorer ? (
    <a href={chain.explorer + txid} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-zec-deep hover:underline">
      {short(txid)} ↗
    </a>
  ) : (
    <code className="font-mono text-[11px] text-faint">{short(txid)}</code>
  );
}

type Row = { label: string; txid?: string; pending?: boolean };

export function Trail({ view: v, onResign }: { view: GameView; onResign: () => void }) {
  const c = v.chain;
  const mode = c.mode ?? 'prize';
  const vault: Record<typeof c.vault.status, string> = {
    none: '',
    creating: 'Creating vault wallet…',
    funding: 'House funding vault…',
    funded: `Vault funded · ${taz(c.prizeZat)}`,
    ready: 'Match vault open: collecting signed moves',
    failed: `Vault: ${c.vault.error || 'failed'}`,
  };
  const rows: Row[] =
    mode === 'pending' ? [{ label: 'The vault opens once your rival joins.', pending: true }]
    : mode === 'practice' && c.vault.status === 'none' ? [{ label: 'Practice match: nothing goes on-chain.' }]
    : mode === 'practice' ? [{ label: c.vault.status === 'creating' ? 'Opening the match vault…' : vault[c.vault.status], pending: c.vault.status === 'creating' }]
    : [{ label: vault[c.vault.status], txid: c.vault.fundTxid, pending: c.vault.status !== 'funded' }];
  for (const a of c.anchors) rows.push({ label: `Turns 1–${a.turn} anchored`, txid: a.txid });
  if (c.refund) rows.push({ label: `Refund to house: ${c.refund.status}`, txid: c.refund.txid, pending: c.refund.status === 'confirming' });
  // Each on-chain move is its player's own shielded transaction: txids are public, contents sealed.
  for (const m of v.onchain.moves) rows.push({ label: `${m.seat === v.seat ? 'Your' : 'Rival'} move · turn ${m.turn}`, txid: m.txid });
  if (c.sweep) rows.push({ label: c.sweep.status === 'confirming' ? 'Sweep waiting on confirmations…' : `Vault sweep: ${c.sweep.status}`, txid: c.sweep.txid, pending: c.sweep.status === 'confirming' });
  return (
    <Panel title="On-chain trail" note={c.network === 'testnet' ? 'Zcash testnet' : 'mock ledger'}>
      <ol className="max-h-64 space-y-2 overflow-auto pr-1">
        {rows.reverse().map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex items-center gap-2 text-muted">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.pending ? 'animate-pulse-dot bg-zec' : 'bg-ok'}`} />
              {r.label}
            </span>
            <TxLink chain={c} txid={r.txid} />
          </li>
        ))}
      </ol>
      {mode === 'practice' && c.note && <p className="mt-3 rounded-lg bg-paper-2 px-3 py-2 text-xs text-muted">{c.note}</p>}
      {v.phase === 'active' && (
        <button onClick={onResign} className="mt-3 text-xs text-faint hover:text-alert">
          Resign match
        </button>
      )}
    </Panel>
  );
}

export function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
        {note && <span className="text-[11px] text-faint">{note}</span>}
      </div>
      {children}
    </div>
  );
}
