import { DIRS } from '@/lib/belief';
import { districtOf } from '@/lib/city';
import { ACTIONS, ARROWS, block, exposure, type Draft } from '@/lib/game';
import { mmss } from '@/lib/useClock';
import { Icon } from '@/components/Pixel';
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

const LEVEL = ['bg-mint', 'bg-butter', 'bg-alert-soft', 'bg-alert-soft'];

// The controller card: a pixel D-pad, the action list, what you'll expose, and the big seal button.
export default function Orders({ view: v, draft, aiming, onMove, onAction, onSeal, secondsLeft, sealing = '' }: Props) {
  const active = v.phase === 'active' && !v.you.locked && !sealing;
  const needsAim = ACTIONS.find((a) => a.id === draft.action)?.aim;
  const ex = exposure(v, draft);

  return (
    <div className="toy rounded-2xl bg-lilac p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-tiny text-[11px] uppercase tracking-[0.14em]">Orders · turn {Math.min(v.turn, v.maxTurns)}</h2>
        {v.you.locked && <span className="toy-sm bg-zec px-2 font-tiny text-[10px]">sealed</span>}
      </div>

      <div className="grid grid-cols-[132px_1fr] gap-3">
        {/* D-pad */}
        <div className="grid grid-cols-3 gap-1 self-start">
          {DIRS.map((d, i) => {
            const to = { x: v.you.pos.x + d.dx, y: v.you.pos.y + d.dy };
            const ok = to.x >= 0 && to.y >= 0 && to.x < v.size && to.y < v.size;
            const on = d.dx === draft.move.dx && d.dy === draft.move.dy;
            return (
              <button
                key={i}
                disabled={!active || !ok}
                onClick={() => onMove(d)}
                className={`toy-sm press h-10 rounded-lg text-base disabled:opacity-30 ${on ? 'bg-zec' : 'bg-card'}`}
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
                className={`flex items-center gap-2 rounded-lg border-2 border-ink px-2 py-1 text-left text-[14px] transition disabled:opacity-35 ${on ? 'bg-zec shadow-[2px_2px_0_var(--color-ink)]' : 'bg-card hover:bg-paper'}`}
              >
                <Icon name={a.id} size={18} />
                <span className="flex-1 leading-tight">
                  <kbd className="mr-1 font-tiny text-[9px] text-muted">{i + 1}</kbd>
                  {a.label}
                </span>
                <span className="font-tiny text-[10px]">{cost ? `${cost}♥` : 'free'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {active && needsAim && (
        <p className="mt-3 text-[13px] text-zec-deep">
          {aiming || !draft.target
            ? `Tap the map to aim the ${draft.action === 'chaff' ? 'chaff (any tile in the target district)' : 'viewing key (top-left of the 2×2)'}.`
            : `Aimed at ${draft.action === 'chaff' ? districtOf(draft.target) : block({ ...draft.target, w: 2, h: 2 })}. Pick the action again to re-aim.`}
        </p>
      )}

      {active && (
        <div className={`toy-sm mt-3 rounded-lg px-3 py-2 text-[13px] leading-snug ${LEVEL[ex.level]}`}>
          <span className="mr-1.5 font-tiny text-[10px] uppercase">{ex.level === 0 ? 'stealth' : 'exposed'}</span>
          {ex.text}
        </div>
      )}

      {v.phase === 'active' && secondsLeft !== null && (
        <p className={`mt-3 text-[13px] ${!v.you.locked && secondsLeft <= 10 ? 'text-alert' : 'text-muted'}`}>
          {v.you.locked
            ? `Turn resolves when your rival seals, or in ${mmss(secondsLeft)}.`
            : `Seal within ${mmss(secondsLeft)}, or you hold position and stay dark.`}
        </p>
      )}
      {v.phase === 'active' && v.clock.missed > 0 && !v.you.locked && (
        <p className="mt-1 text-[13px] text-alert">
          You let the clock run out {v.clock.missed}× in a row. {v.clock.maxMissed} in a row forfeits the match.
        </p>
      )}

      <button
        onClick={onSeal}
        disabled={!active || (needsAim && !draft.target)}
        className="toy press mt-3 w-full rounded-xl bg-ink py-3 font-display text-lg font-bold tracking-wide text-paper disabled:bg-card disabled:text-faint"
      >
        {sealing || (v.you.locked ? (v.onchain.enabled ? 'Move signed and on-chain' : 'Orders sealed') : v.onchain.enabled ? 'Sign & send move' : 'Seal orders')}
      </button>
      <p className="mt-2 text-center font-tiny text-[9px] text-muted">← ↑ → ↓ or QWE/ASD/ZXC move · 1–6 act · ⏎ seal</p>
    </div>
  );
}
