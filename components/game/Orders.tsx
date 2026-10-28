import { DIRS } from '@/lib/belief';
import { districtOf } from '@/lib/city';
import { ACTIONS, ARROWS, block, exposure, type Draft } from '@/lib/game';
import { mmss } from '@/lib/useClock';
import type { ActionId, Dir, GameView } from '@/lib/types';

type Props = {
  view: GameView;
  draft: Draft;
  aiming: boolean;
  onMove: (d: Dir) => void;
  onAction: (a: ActionId) => void;
  onSeal: () => void;
  secondsLeft: number | null;
  sealing?: string;
};

const LEVEL = [
  { bar: 'bg-ok', box: 'border-ok/30 bg-ok/5' },
  { bar: 'bg-alert', box: 'border-alert/30 bg-alert-soft/60' },
  { bar: 'bg-alert', box: 'border-alert/40 bg-alert-soft' },
  { bar: 'bg-alert', box: 'border-alert/50 bg-alert-soft' },
];

export default function Orders({ view: v, draft, aiming, onMove, onAction, onSeal, secondsLeft, sealing = '' }: Props) {
  const active = v.phase === 'active' && !v.you.locked && !sealing;
  const needsAim = ACTIONS.find((a) => a.id === draft.action)?.aim;
  const ex = exposure(v, draft);
  const lv = LEVEL[ex.level];

  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">Orders · turn {Math.min(v.turn, v.maxTurns)}</h2>
        {v.you.locked && <span className="rounded-full bg-zec-soft px-2.5 py-0.5 font-mono text-xs font-semibold text-zec-deep">sealed</span>}
      </div>

      <div className="grid grid-cols-[132px_1fr] gap-3">
        <div className="grid grid-cols-3 gap-1.5 self-start">
          {DIRS.map((d, i) => {
            const to = { x: v.you.pos.x + d.dx, y: v.you.pos.y + d.dy };
            const ok = to.x >= 0 && to.y >= 0 && to.x < v.size && to.y < v.size;
            const on = d.dx === draft.move.dx && d.dy === draft.move.dy;
            return (
              <button
                key={i}
                disabled={!active || !ok}
                onClick={() => onMove(d)}
                className={`h-10 rounded-xl border text-base transition disabled:opacity-30 ${
                  on ? 'border-zec bg-zec-soft font-bold text-ink' : 'border-line bg-paper hover:border-faint'
                }`}
              >
                {ARROWS[i]}
              </button>
            );
          })}
        </div>
        <div className="grid gap-1.5">
          {ACTIONS.map((a, i) => {
            const cost = v.costs[a.id];
            const on = draft.action === a.id;
            return (
              <button
                key={a.id}
                disabled={!active || cost > v.you.credits}
                onClick={() => onAction(a.id)}
                title={a.hint}
                className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-left text-sm transition disabled:opacity-35 ${
                  on ? 'border-zec bg-zec-soft font-semibold' : 'border-line bg-paper hover:border-faint'
                }`}
              >
                <span>
                  <kbd className="mr-1.5 font-mono text-[10px] text-faint">{i + 1}</kbd>
                  {a.label}
                </span>
                <span className="font-mono text-[11px] font-semibold text-zec-deep">{cost ? `${cost} cr` : 'free'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {active && needsAim && (
        <p className="mt-3 text-xs font-medium text-zec-deep">
          {aiming || !draft.target
            ? `Click the map to aim the ${draft.action === 'chaff' ? 'chaff (any block in the target district)' : 'viewing key (top-left of the 2×2)'}.`
            : `Aimed at ${draft.action === 'chaff' ? districtOf(draft.target) : block({ ...draft.target, w: 2, h: 2 })}. Pick the action again to re-aim.`}
        </p>
      )}

      {active && (
        <div className={`mt-3 flex gap-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${lv.box}`}>
          <span className="mt-1 flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <i key={i} className={`h-2.5 w-1.5 rounded-sm ${i < Math.max(ex.level, 1) ? lv.bar : 'bg-line'}`} />
            ))}
          </span>
          <span className="text-ink">{ex.text}</span>
        </div>
      )}

      {v.phase === 'active' && secondsLeft !== null && (
        <p className={`mt-3 text-xs ${!v.you.locked && secondsLeft <= 10 ? 'font-semibold text-alert' : 'text-muted'}`}>
          {v.you.locked
            ? `Turn resolves when your rival seals, or in ${mmss(secondsLeft)}.`
            : `Seal within ${mmss(secondsLeft)}, or you hold position and stay dark.`}
        </p>
      )}
      {v.phase === 'active' && v.clock.missed > 0 && !v.you.locked && (
        <p className="mt-1 text-xs font-medium text-alert">
          You let the clock run out {v.clock.missed}× in a row. {v.clock.maxMissed} in a row forfeits the match.
        </p>
      )}

      <button
        onClick={onSeal}
        disabled={!active || (needsAim && !draft.target)}
        className="mt-3 w-full rounded-xl bg-ink py-3 font-display text-[15px] font-semibold tracking-wide text-paper transition hover:bg-black disabled:bg-paper-2 disabled:text-faint"
      >
        {sealing || (v.you.locked ? (v.onchain.enabled ? 'Move signed and on-chain' : 'Orders sealed') : v.onchain.enabled ? 'Sign & send move' : 'Seal orders')}
      </button>
      <p className="mt-2 text-center font-mono text-[10px] text-faint">Q W E / A S D / Z X C move · 1–6 act · ⏎ seal</p>
    </div>
  );
}
