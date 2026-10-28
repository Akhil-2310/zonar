// Shared (browser + server) deduction helpers. Works only from one seat's own
// intel, so the client's "possible drop" overlay and the bot see the same thing.
import type { Dir, Pos, Reading, View } from './types.ts';
import { inVaultDistrict } from './city.ts';

export const dist = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const same = (a: Pos | null | undefined, b: Pos | null | undefined): boolean => !!a && !!b && a.x === b.x && a.y === b.y;
export const pingReading = (d: number): Reading => (d <= 1 ? 'Locked' : d <= 3 ? 'Faint' : 'Static');
export const DIRS: Dir[] = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ dx, dy })));

// Tiles where the (still buried) drop could be. Returns null once anyone has picked it up.
export function candidates(view: View): Pos[] | null {
  if (view.you.carrying || view.rival?.carrying) return null;
  // Everyone knows the drop is somewhere in the vault district; intel narrows it from there.
  let tiles: Pos[] = [];
  for (let y = 0; y < view.size; y++) for (let x = 0; x < view.size; x++) if (inVaultDistrict({ x, y })) tiles.push({ x, y });

  for (const ev of view.intel) {
    if (ev.type === 'ping') tiles = tiles.filter((t) => pingReading(dist(ev.at, t)) === ev.reading);
    else if (ev.type === 'leak') tiles = tiles.filter((t) => dist(ev.at, t) === ev.distance);
    else if (ev.type === 'dig' && !ev.found) tiles = tiles.filter((t) => !same(t, ev.at));
    else if (ev.type === 'viewkey') {
      const a = ev.area;
      tiles = ev.drop
        ? [ev.drop]
        : tiles.filter((t) => !(t.x >= a.x && t.x < a.x + a.w && t.y >= a.y && t.y < a.y + a.h));
    }
  }
  return tiles;
}

// Most recent turn on which this seat learned the rival's exact tile.
export function lastSeenRival(view: View): { at: Pos; turn: number } | null {
  for (let i = view.intel.length - 1; i >= 0; i--) {
    const ev = view.intel[i];
    if (ev.type === 'rivalSeen' || ev.type === 'collision') return { at: ev.at, turn: ev.turn };
    if (ev.type === 'viewkey' && ev.rival) return { at: ev.rival, turn: ev.turn };
  }
  return null;
}
