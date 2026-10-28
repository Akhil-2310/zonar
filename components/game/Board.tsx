import Avatar from '@/components/Avatar';
import CityMap, { CityLabels } from '@/components/CityMap';
import { candidates, lastSeenRival, same } from '@/lib/belief';
import { districtOf, tileName as fmt } from '@/lib/city';
import { inArea, lastTurn, type Draft } from '@/lib/game';
import type { Area, GameView, IntelEvent, Pos } from '@/lib/types';

type ReadingCls = 'Locked' | 'Faint' | 'Static' | 'Leak';
type ViewKeyEvent = Extract<IntelEvent, { type: 'viewkey' }>;

export const Chest = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
    <rect x="6" y="14" width="28" height="19" rx="3" fill="#F4B728" stroke="#A87B0C" strokeWidth="1.5" />
    <path d="M6 18c0-6 3-9 14-9s14 3 14 9z" fill="#FFD36B" stroke="#A87B0C" strokeWidth="1.5" />
    <rect x="17" y="19" width="6" height="7" rx="1.5" fill="#1F1A14" />
  </svg>
);

const READING: Record<ReadingCls, string> = {
  Locked: 'bg-zec text-ink',
  Faint: 'bg-zec-soft text-zec-deep',
  Static: 'bg-paper-2 text-muted',
  Leak: 'bg-alert-soft text-alert',
};

export default function Board({ view: v, draft, onCell }: { view: GameView; draft: Draft; onCell: (p: Pos) => void }) {
  const lt = lastTurn(v);
  const cands = candidates(v);
  const seen = lastSeenRival(v);
  const active = v.phase === 'active' && !v.you.locked;
  const dest = { x: v.you.pos.x + draft.move.dx, y: v.you.pos.y + draft.move.dy };
  const recent = v.intel.filter((e) => lt - e.turn <= 3);
  const readings = new Map<string, { cls: ReadingCls; txt: string }>();
  for (const e of v.intel) {
    if (e.type === 'ping') readings.set(fmt(e.at), { cls: e.reading, txt: e.reading.toUpperCase() });
    if (e.type === 'leak') readings.set(fmt(e.at), { cls: 'Leak', txt: 'D' + e.distance });
  }
  const dug = new Set(v.intel.flatMap((e) => (e.type === 'dig' && !e.found ? [fmt(e.at)] : [])));
  const aimArea: Area | null = !draft.target ? null
    : draft.action === 'viewkey' ? { ...draft.target, w: 2, h: 2 }
    : { x: draft.target.x - (draft.target.x % 2), y: draft.target.y - (draft.target.y % 2), w: 2, h: 2 };
  const vkNow = v.intel.find((e): e is ViewKeyEvent => e.type === 'viewkey' && e.turn === lt);

  const cells = [];
  for (let y = 0; y < v.size; y++)
    for (let x = 0; x < v.size; x++) {
      const p = { x, y };
      const isYou = same(p, v.you.pos);
      const homeYou = same(p, v.you.home);
      const homeRival = same(p, v.rival?.home);
      const clear = isYou || homeYou || v.phase === 'over' || (vkNow && inArea(vkNow.area, p));
      const flashNow = recent.some((e) => e.type === 'flash' && e.turn === lt && inArea(e.region, p));
      const flashOld = recent.some((e) => e.type === 'flash' && e.turn !== lt && inArea(e.region, p));
      const isCand = cands?.some((c) => same(c, p));
      const reach = active && Math.max(Math.abs(x - v.you.pos.x), Math.abs(y - v.you.pos.y)) <= 1;

      let fog = '';
      if (!clear) fog = !cands ? 'fog-grain bg-paper/55' : isCand ? 'bg-paper/25' : 'hatch bg-paper/75';

      const rings = [
        homeYou && 'ring-2 ring-inset ring-zec/80',
        homeRival && 'ring-2 ring-inset ring-rival/60',
        isCand && !clear && 'ring-1 ring-inset ring-zec/25',
        reach && 'ring-1 ring-inset ring-ink/10',
        active && same(p, dest) && !isYou && 'ring-2 ring-inset ring-zec',
        active && aimArea && inArea(aimArea, p) && 'ring-2 ring-inset ring-zec bg-zec/25',
        vkNow && inArea(vkNow.area, p) && 'ring-2 ring-inset ring-zec-deep',
        flashOld && 'ring-1 ring-inset ring-alert/50',
      ].filter(Boolean);

      const r = readings.get(fmt(p));
      cells.push(
        <button
          key={fmt(p)}
          onClick={() => onCell(p)}
          title={`${fmt(p)} · ${districtOf(p)}`}
          className={`relative flex items-center justify-center transition-colors ${active ? 'cursor-pointer hover:bg-zec/10' : 'cursor-default'} ${rings.join(' ')}`}
        >
          <span className={`pointer-events-none absolute inset-0 transition-all duration-500 ${fog} ${flashNow ? 'animate-flash bg-alert/25' : ''}`} />
          <span className="absolute left-1.5 top-1 font-mono text-[10px] text-faint">{fmt(p)}</span>
          {r && cands && <span className={`absolute right-1 top-1 rounded px-1.5 py-px font-mono text-[9px] font-bold tracking-wide ${READING[r.cls]}`}>{r.txt}</span>}
          {dug.has(fmt(p)) && <span className="absolute bottom-1 right-1.5 font-mono text-sm font-bold text-faint">×</span>}
          {homeYou && <span className="absolute bottom-1 font-mono text-[9px] font-bold tracking-widest text-zec-deep">SAFEHOUSE</span>}
          {homeRival && <span className="absolute bottom-1 font-mono text-[9px] font-bold tracking-widest text-rival">RIVAL</span>}
          {active && same(p, dest) && !isYou && <span className="absolute h-2.5 w-2.5 rounded-full bg-zec" />}
          <Token v={v} p={p} seen={seen} lt={lt} cands={cands} vkNow={vkNow} />
        </button>,
      );
    }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-line bg-card shadow-[0_24px_60px_-28px_rgb(31_26_20/0.35)]">
      <div className="absolute inset-0">
        <CityMap labels={false} />
      </div>
      <div className="absolute inset-0 grid grid-cols-6 grid-rows-6">{cells}</div>
      <CityLabels />
    </div>
  );
}

type TokenProps = { v: GameView; p: Pos; seen: { at: Pos; turn: number } | null; lt: number; cands: Pos[] | null; vkNow?: ViewKeyEvent };

function Token({ v, p, seen, lt, cands, vkNow }: TokenProps) {
  const wrap = 'pointer-events-none relative z-10 h-[64%] w-[64%] drop-shadow-md';
  const carry = <Chest className="absolute -right-2 -top-2 h-[48%] w-[48%] animate-bob" />;
  if (same(p, v.you.pos)) {
    return (
      <div className={wrap}>
        <Avatar id={v.you.avatar} ring="you" className="h-full w-full" />
        {v.you.carrying && carry}
      </div>
    );
  }
  const drop = <Chest className="pointer-events-none relative z-10 h-[52%] w-[52%] animate-bob drop-shadow-md" />;
  const rival = v.rival;
  if (!rival) return null;
  if (v.phase === 'over') {
    if (same(p, rival.pos)) return <div className={wrap}><Avatar id={rival.avatar} ring="rival" className="h-full w-full" />{rival.carrying && carry}</div>;
    if (v.result && same(p, v.result.drop) && !v.you.carrying && !rival.carrying) return drop;
    return null;
  }
  if (vkNow?.drop && same(vkNow.drop, p)) return drop;
  if (seen && same(seen.at, p)) {
    const age = lt - seen.turn;
    return (
      <div className={`${wrap} ${age ? 'opacity-55' : ''}`}>
        <div className={`h-full w-full rounded-full ${age ? 'border-2 border-dashed border-rival p-[6%]' : ''}`}>
          <Avatar id={rival.avatar} ring={age ? undefined : 'rival'} className="h-full w-full" />
        </div>
        {rival.carrying && carry}
        {age > 0 && <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded bg-rival px-1 font-mono text-[9px] font-bold text-white">T-{age}</span>}
      </div>
    );
  }
  if (cands?.length === 1 && same(cands[0], p)) return drop;
  return null;
}
