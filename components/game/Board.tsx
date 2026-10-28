import Avatar from '@/components/Avatar';
import PixelCity, { PixelCityOverlay } from '@/components/PixelCity';
import { Icon } from '@/components/Pixel';
import { candidates, lastSeenRival, same } from '@/lib/belief';
import { districtArea, districtOf, tileName as fmt } from '@/lib/city';
import { inArea, lastTurn, type Draft } from '@/lib/game';
import { rivalMood, yourMood } from '@/lib/mood';
import type { Area, GameView, IntelEvent, Pos } from '@/lib/types';

type ReadingCls = 'Locked' | 'Faint' | 'Static' | 'Leak';
type ViewKeyEvent = Extract<IntelEvent, { type: 'viewkey' }>;

// The treasure, as a pixel chest.
export const Chest = ({ className = '' }: { className?: string }) => <Icon name="chest" className={className} />;

const READING: Record<ReadingCls, string> = {
  Locked: 'bg-zec text-ink',
  Faint: 'bg-butter text-ink',
  Static: 'bg-lcd-2 text-lcd-ink',
  Leak: 'bg-alert text-white',
};

// The colour LCD: pixel city underneath, a dithered fog of war on top, pets walking around.
export default function Board({ view: v, draft, onCell }: { view: GameView; draft: Draft; onCell: (p: Pos) => void }) {
  const lt = lastTurn(v);
  const cands = candidates(v);
  const seen = lastSeenRival(v);
  const active = v.phase === 'active' && !v.you.locked;
  const dest = { x: v.you.pos.x + draft.move.dx, y: v.you.pos.y + draft.move.dy };
  const recent = v.intel.filter((e) => lt - e.turn <= 3);
  const readings = new Map<string, { cls: ReadingCls; txt: string }>();
  for (const e of v.intel) {
    if (e.type === 'ping') readings.set(fmt(e.at), { cls: e.reading, txt: e.reading.slice(0, 4).toUpperCase() });
    if (e.type === 'leak') readings.set(fmt(e.at), { cls: 'Leak', txt: `D${e.distance}` });
  }
  const dug = new Set(v.intel.flatMap((e) => (e.type === 'dig' && !e.found ? [fmt(e.at)] : [])));
  const aimArea: Area | null = !draft.target ? null : draft.action === 'viewkey' ? { ...draft.target, w: 2, h: 2 } : districtArea(draft.target);
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
      const isDest = active && same(p, dest) && !isYou;
      const aimed = active && aimArea && inArea(aimArea, p);

      const fog = clear ? '' : !cands ? 'dither' : isCand ? 'dither-light' : 'dither-heavy';
      const r = readings.get(fmt(p));
      cells.push(
        <button
          key={fmt(p)}
          onClick={() => onCell(p)}
          title={`${fmt(p)} · ${districtOf(p)}`}
          className={`group relative flex items-center justify-center ${active ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${fog} ${flashNow ? 'animate-flash' : ''}`} />
          {active && reach && !isDest && !isYou && <span className="pointer-events-none absolute inset-[18%] border-2 border-dashed border-lcd-ink/25 opacity-0 group-hover:opacity-100" />}
          {aimed && <span className="pointer-events-none absolute inset-0 bg-zec/35 outline outline-2 -outline-offset-2 outline-zec" />}
          {vkNow && inArea(vkNow.area, p) && <span className="pointer-events-none absolute inset-0 outline outline-2 -outline-offset-2 outline-zec-deep" />}
          {flashOld && <span className="pointer-events-none absolute inset-[6%] border-2 border-dotted border-alert/70" />}
          {isDest && <DestMarker />}
          {r && cands && <span className={`absolute right-[3%] top-[3%] z-20 rounded-[3px] border-2 border-lcd-ink px-1 font-tiny text-[12px] font-bold leading-[16px] shadow-[1px_1px_0_rgba(47,59,34,0.5)] ${READING[r.cls]}`}>{r.txt}</span>}
          {dug.has(fmt(p)) && <span className="absolute bottom-[3%] right-[5%] z-20 font-tiny text-lg font-bold leading-none text-lcd-ink">×</span>}
          {homeYou && !isYou && <Icon name="house" className="absolute h-[46%] w-[46%] opacity-90" />}
          {homeRival && (v.phase === 'over' ? !same(p, v.rival?.pos) : true) && <Icon name="house" className="absolute h-[46%] w-[46%] opacity-80 hue-rotate-[200deg]" />}
          {homeYou && <span className="absolute bottom-[3%] z-20 rounded-[3px] border-2 border-ink bg-butter px-1 font-tiny text-[11px] leading-[14px] text-ink">HOME</span>}
          {homeRival && <span className="absolute bottom-[3%] z-20 rounded-[3px] border-2 border-ink bg-sky px-1 font-tiny text-[11px] leading-[14px] text-ink">RIVAL</span>}
          <Token v={v} p={p} seen={seen} lt={lt} cands={cands} vkNow={vkNow} />
        </button>,
      );
    }

  const axis = Array.from({ length: v.size }, (_, i) => i);
  const ruler = (vertical: boolean) => (
    <div className={`grid font-tiny text-[13px] leading-none text-lcd ${vertical ? 'grid-rows-7' : 'grid-cols-7'}`}>
      {axis.map((i) => {
        const mine = vertical ? i === v.you.pos.y : i === v.you.pos.x;
        return (
          <span key={i} className={`flex items-center justify-center ${mine ? 'text-butter' : 'opacity-70'}`}>
            {vertical ? i + 1 : 'ABCDEFG'[i]}
          </span>
        );
      })}
    </div>
  );

  // Rulers along the top and left edge, so every tile can be called out by name (D4).
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)] grid-rows-[20px_auto] gap-1">
      <span />
      {ruler(false)}
      {ruler(true)}
      <div className="lcd relative aspect-square w-full overflow-hidden rounded-[10px]">
        <div className="absolute inset-0">
          <PixelCity />
        </div>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${v.size}, 1fr)`, gridTemplateRows: `repeat(${v.size}, 1fr)` }}>
          {cells}
        </div>
        <PixelCityOverlay />
      </div>
    </div>
  );
}

// Blinking pixel corner brackets on the tile you're about to step to.
function DestMarker() {
  const c = 'absolute h-[22%] w-[22%] border-zec';
  return (
    <span className="pointer-events-none absolute inset-[8%] z-10 animate-pulse-dot">
      <span className={`${c} left-0 top-0 border-l-4 border-t-4`} />
      <span className={`${c} right-0 top-0 border-r-4 border-t-4`} />
      <span className={`${c} bottom-0 left-0 border-b-4 border-l-4`} />
      <span className={`${c} bottom-0 right-0 border-b-4 border-r-4`} />
    </span>
  );
}

type TokenProps = { v: GameView; p: Pos; seen: { at: Pos; turn: number } | null; lt: number; cands: Pos[] | null; vkNow?: ViewKeyEvent };

function Token({ v, p, seen, lt, cands, vkNow }: TokenProps) {
  const wrap = 'pointer-events-none relative z-10 h-[78%] w-[78%]';
  const carry = <Chest className="absolute -right-[12%] -top-[14%] h-[46%] w-[46%] animate-bob" />;
  if (same(p, v.you.pos)) {
    return (
      <div className={wrap}>
        <Avatar id={v.you.avatar} mood={yourMood(v).mood} className="h-full w-full drop-shadow-[2px_2px_0_rgba(47,59,34,0.35)]" />
        <span className="absolute -top-[20%] left-1/2 -translate-x-1/2 animate-bob font-tiny text-[13px] leading-none text-zec-deep">▼</span>
        {v.you.carrying && carry}
      </div>
    );
  }
  const drop = <Chest className="pointer-events-none relative z-10 h-[56%] w-[56%] animate-bob" />;
  const rival = v.rival;
  if (!rival) return null;
  if (v.phase === 'over') {
    if (same(p, rival.pos)) return <div className={wrap}><Avatar id={rival.avatar} mood={rivalMood(v)} className="h-full w-full" />{rival.carrying && carry}</div>;
    if (v.result && same(p, v.result.drop) && !v.you.carrying && !rival.carrying) return drop;
    return null;
  }
  if (vkNow?.drop && same(vkNow.drop, p)) return drop;
  if (seen && same(seen.at, p)) {
    const age = lt - seen.turn;
    return (
      <div className={`${wrap} ${age ? 'opacity-45 grayscale' : ''}`}>
        <Avatar id={rival.avatar} mood={rivalMood(v)} animate={!age} className="h-full w-full" />
        {rival.carrying && carry}
        {age > 0 && <span className="absolute -bottom-[6%] left-1/2 -translate-x-1/2 rounded-[3px] bg-rival px-1 font-tiny text-[11px] leading-[14px] text-white">T-{age}</span>}
      </div>
    );
  }
  if (cands?.length === 1 && same(cands[0], p)) return drop;
  return null;
}
