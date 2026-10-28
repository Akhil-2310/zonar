// Client-side game helpers: action catalogue, exposure preview, intel wording.
import { districtOf, tileName as fmt } from './city.ts';
import type { ActionId, Area, IntelEvent, Pos, View } from './types.ts';

export type Draft = { move: { dx: number; dy: number }; action: ActionId; target: Pos | null };
export type Tone = 'warn' | 'good' | undefined;

export const ACTIONS: { id: ActionId; label: string; hint: string; aim?: boolean }[] = [
  { id: 'none', label: 'Hold', hint: 'Do nothing. Stay dark.' },
  { id: 'dig', label: 'Dig', hint: 'Search your block for the drop.' },
  { id: 'ping', label: 'Encrypted ping', hint: 'Locked ≤1 · Faint ≤3 · Static beyond.' },
  { id: 'leak', label: 'Metadata leak', hint: 'Exact distance; your district flashes.' },
  { id: 'viewkey', label: 'Viewing key', hint: 'Reveal a 2×2 area this turn.', aim: true },
  { id: 'chaff', label: 'Chaff', hint: 'Fake a flash over any district.', aim: true },
];
export const needsAim = (action: ActionId) => !!ACTIONS.find((a) => a.id === action)?.aim;
export const ARROWS = ['↖', '↑', '↗', '←', '•', '→', '↙', '↓', '↘'];
export const MOVE_KEYS = 'qweasdzxc';

export const block = (r: Area) => `${fmt(r)}–${fmt({ x: r.x + r.w - 1, y: r.y + r.h - 1 })}`;
export const inArea = (a: Area, p: Pos) => p.x >= a.x && p.x < a.x + a.w && p.y >= a.y && p.y < a.y + a.h;
export const lastTurn = (v: View) => (v.phase === 'over' ? v.turn : v.turn - 1);

// What the rival will learn about you if you seal these orders. level 0..3.
export function exposure(v: View, draft: Draft): { level: number; text: string } {
  const dest = { x: v.you.pos.x + draft.move.dx, y: v.you.pos.y + draft.move.dy };
  const items: string[] = [];
  let level = 0;
  if (draft.action === 'leak') {
    items.push(`${districtOf(dest)} will flash on their map`);
    level++;
  }
  if (draft.action === 'chaff' && draft.target) items.push(`a decoy flash over ${districtOf(draft.target)}`);
  if (v.you.carrying) {
    const lastExposed = [...v.intel].reverse().find((e) => e.type === 'exposed');
    if (!lastExposed || lastExposed.turn !== lastTurn(v)) {
      items.push(`your exact block (${fmt(dest)}), because you're carrying`);
      level += 2;
    } else items.push("nothing of your position: your carrier cloak holds this turn, you'll show next turn");
  }
  if (!items.length) return { level: 0, text: 'Fully shielded. The rival learns nothing about you this turn.' };
  return { level: Math.min(level, 3), text: 'The rival will see ' + items.join(' and ') + '.' };
}

// [text, tone] for one intel event.
export function describe(e: IntelEvent): [string, Tone] {
  switch (e.type) {
    case 'ping': return [`Ping from ${fmt(e.at)}: ${e.reading}`, undefined];
    case 'leak': return [`Leak from ${fmt(e.at)}: drop is exactly ${e.distance} ${e.distance === 1 ? 'block' : 'blocks'} away. ${districtOf(e.at)} flashed on their map.`, undefined];
    case 'flash': return [`Metadata flash over ${districtOf(e.region)}. Real leak or chaff?`, 'warn'];
    case 'chaffPlanted': return [`Chaff deployed over ${districtOf(e.region)}.`, undefined];
    case 'viewkey': return [`Viewing key on ${block(e.area)}: ${e.drop ? `drop at ${fmt(e.drop)}!` : 'no drop'}${e.rival ? `, rival at ${fmt(e.rival)}` : ''}.`, e.drop ? 'good' : undefined];
    case 'dig': return e.found ? ["You dug up the drop. You're partly transparent now. Get home.", 'good'] : [`Dug ${fmt(e.at)}: empty.`, undefined];
    case 'rivalPickup': return ['The rival dug up the drop. Their block leaks every other turn.', 'warn'];
    case 'rivalSeen': return [`Carrier sighted at ${fmt(e.at)} in ${districtOf(e.at)}.`, 'warn'];
    case 'exposed': return [`You were exposed at ${fmt(e.at)}.`, 'warn'];
    case 'collision':
      if (!e.stolen) return [`Deanonymized: both agents on ${fmt(e.at)}.`, 'warn'];
      return e.carrier ? ['Deanonymized: you stole the drop!', 'good'] : ['Deanonymized: the drop was stolen from you.', 'warn'];
  }
}

