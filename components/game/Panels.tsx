'use client';
import { useState, type ReactNode } from 'react';
import Avatar from '@/components/Avatar';
import { Icon } from '@/components/Pixel';
import { Chest } from './Board';
import { describe, exposure, lastTurn, type Draft } from '@/lib/game';
import { rivalMood, yourMood } from '@/lib/mood';
import { short, taz } from '@/lib/api';
import type { ChainState, GameView } from '@/lib/types';

// A toy-plastic card with a pixel title.
export function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`toy rounded-2xl bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-tiny text-[11px] uppercase tracking-[0.14em] text-ink">{title}</h2>
        {note && <span className="font-tiny text-[9px] text-faint">{note}</span>}
      </div>
      {children}
    </div>
  );
}

// Your pet's status screen: mood and speech bubble, hearts for credits, stealth meter.
export function PetStatus({ view: v, draft }: { view: GameView; draft: Draft }) {
  const [peek, setPeek] = useState(false);
  const { mood, line } = yourMood(v);
  const ex = exposure(v, draft);
  const stealth = 3 - ex.level;
  return (
    <div className="toy rounded-[28px] bg-butter p-4">
      <div className="flex items-start gap-3">
        <div className="toy-sm relative rounded-2xl bg-lcd p-1.5">
          <Avatar id={v.you.avatar} mood={mood} size={88} />
          {v.you.carrying && <Chest className="absolute -right-3 -top-3 h-8 w-8 animate-bob" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl font-bold leading-tight">{v.you.name}</div>
          <div className="font-tiny text-[10px] uppercase tracking-wider text-zec-deep">your agent</div>
          <div className="toy-sm relative mt-2 rounded-xl bg-card px-2.5 py-1.5 text-[13px] leading-snug">
            <span className="absolute -left-[9px] top-3 h-3 w-3 rotate-45 border-b-2 border-l-2 border-ink bg-card" />
            {line}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        <button onClick={() => setPeek(!peek)} title="Hidden from shoulder-surfers. Click to show or hide." className="flex w-full items-center gap-2 text-left">
          <span className="w-16 font-tiny text-[10px] uppercase tracking-wider">credits</span>
          <span className={`flex flex-wrap gap-0.5 transition ${peek ? '' : 'blur-[5px]'}`}>
            {Array.from({ length: 12 }, (_, i) => (
              <Icon key={i} name="heart" size={14} className={i < v.you.credits ? '' : 'opacity-20 grayscale'} />
            ))}
          </span>
          <span className="ml-auto font-tiny text-[9px] text-muted">{peek ? 'hide' : 'peek'}</span>
        </button>
        <div className="flex items-center gap-2" title={ex.text}>
          <span className="w-16 font-tiny text-[10px] uppercase tracking-wider">stealth</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <i key={i} className={`h-3.5 w-6 border-2 border-ink ${i < stealth ? (stealth === 3 ? 'bg-ok' : 'bg-zec') : 'bg-alert-soft'}`} />
            ))}
          </span>
          <span className="ml-auto font-tiny text-[9px] text-muted">{stealth === 3 ? 'hidden' : stealth === 0 ? 'exposed' : 'leaking'}</span>
        </div>
      </div>
    </div>
  );
}

export function RivalCard({ view: v }: { view: GameView }) {
  if (!v.rival) {
    return (
      <div className="toy flex items-center gap-3 rounded-[28px] bg-sky p-4">
        <div className="toy-sm flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-lcd font-tiny text-2xl text-lcd-ink">?</div>
        <div className="font-display text-lg">Waiting for a rival…</div>
      </div>
    );
  }
  const status = v.phase !== 'active' ? 'match over' : v.rival.locked ? 'orders sealed' : 'deciding…';
  return (
    <div className="toy flex items-center gap-3 rounded-[28px] bg-sky p-4">
      <div className="toy-sm relative rounded-2xl bg-lcd p-1">
        <Avatar id={v.rival.avatar} mood={rivalMood(v)} size={64} />
        {v.rival.carrying && <Chest className="absolute -right-3 -top-3 h-7 w-7 animate-bob" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-lg font-bold leading-tight">{v.rival.name}</div>
        <div className="font-tiny text-[10px] uppercase tracking-wider text-rival">rival{v.rival.isBot ? ' · bot' : ''}</div>
        <div className="mt-1.5 flex items-center gap-1.5 text-sm">
          <span className={`h-2.5 w-2.5 border-2 border-ink ${v.rival.locked ? 'bg-rival' : 'animate-pulse-dot bg-card'}`} />
          {status}
        </div>
      </div>
    </div>
  );
}

// The intel log: a strip of LCD with the newest message on top.
export function Intel({ view: v }: { view: GameView }) {
  const lt = lastTurn(v);
  const items = [...v.intel].reverse();
  return (
    <Panel title="Decrypted memos" note="only you can read these">
      <ol className="lcd max-h-60 space-y-1 overflow-auto rounded-lg p-2">
        {items.length === 0 && <li className="text-sm text-lcd-ink/70">No intel yet. Your rival is somewhere in the fog.</li>}
        {items.map((e, i) => {
          const [text, tone] = describe(e);
          const fresh = e.turn === lt;
          const mark = tone === 'warn' ? 'bg-alert text-white' : tone === 'good' ? 'bg-ok text-white' : fresh ? 'bg-zec text-ink' : 'bg-lcd-2 text-lcd-ink';
          return (
            <li key={i} className={`flex gap-2 text-[13px] leading-snug ${fresh ? 'text-lcd-ink' : 'text-lcd-ink/65'}`}>
              <span className={`h-fit shrink-0 px-1 font-tiny text-[9px] leading-[14px] ${mark}`}>T{e.turn}</span>
              <span>{text}</span>
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
    <a href={chain.explorer + txid} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-zec-deep underline decoration-dotted hover:text-ink">
      {short(txid)}
    </a>
  ) : (
    <code className="font-mono text-[11px] text-faint">{short(txid)}</code>
  );
}

type Row = { label: string; txid?: string; pending?: boolean };

// The on-chain trail, printed like a receipt.
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
      <div className="relative bg-paper px-3 pb-4 pt-2">
        <ol className="max-h-64 space-y-1.5 overflow-auto pr-1">
          {rows.reverse().map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-dashed border-ink/20 pb-1.5 text-[13px]">
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 border border-ink ${r.pending ? 'animate-pulse-dot bg-zec' : 'bg-ok'}`} />
                {r.label}
              </span>
              <TxLink chain={c} txid={r.txid} />
            </li>
          ))}
        </ol>
        {/* torn receipt edge */}
        <div className="absolute inset-x-0 bottom-0 h-2 bg-[linear-gradient(135deg,var(--color-card)_50%,transparent_50%),linear-gradient(225deg,var(--color-card)_50%,transparent_50%)] bg-[length:10px_10px]" />
      </div>
      {v.phase === 'active' && (
        <button onClick={onResign} className="mt-3 font-tiny text-[10px] uppercase tracking-wider text-faint hover:text-alert">
          Resign match
        </button>
      )}
    </Panel>
  );
}
