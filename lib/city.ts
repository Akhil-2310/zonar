// The city: 9 districts (one per 2×2 leak block). Pure data, shared by the
// server (names) and the browser (the map is drawn from cityLayout()).
import type { Pos } from './types.ts';

type Rect = { x: number; y: number; w: number; h: number };
export type CityLayout = {
  size: number;
  avenues: number[];
  blocks: Rect[];
  buildings: (Rect & { shade: number })[];
  roofs: Rect[];
  parks: Rect[];
  trees: { x: number; y: number; r: number }[];
  water: Rect[];
  landmarks: Pos[];
  cams: (Pos & { phase: number })[];
  labels: (Pos & { name: string })[];
};

export const DISTRICTS = [
  ['Sprout Docks', 'Overwinter Yards', 'Sapling Row'],
  ['Blossom Heights', 'Heartwood', 'Canopy Commons'],
  ['Nullifier Market', 'Halo Spire', 'Orchard Gardens'],
];
export const districtOf = (p: Pos): string => DISTRICTS[p.y >> 1][p.x >> 1];
export const tileName = (p: Pos): string => 'ABCDEF'[p.x] + (p.y + 1);

function rng(seed: number): () => number {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

// Split a rect into building lots, recursively, like a city block.
function lots(r: Rect, rand: () => number, depth = 0): Rect[] {
  if (depth > 2 || r.w < 22 || r.h < 22 || (depth > 0 && rand() < 0.25)) return [r];
  const gap = 3;
  if (r.w > r.h) {
    const cut = r.w * (0.35 + rand() * 0.3);
    return [...lots({ ...r, w: cut - gap / 2 }, rand, depth + 1), ...lots({ ...r, x: r.x + cut + gap / 2, w: r.w - cut - gap / 2 }, rand, depth + 1)];
  }
  const cut = r.h * (0.35 + rand() * 0.3);
  return [...lots({ ...r, h: cut - gap / 2 }, rand, depth + 1), ...lots({ ...r, y: r.y + cut + gap / 2, h: r.h - cut - gap / 2 }, rand, depth + 1)];
}

// Deterministic layout in a 100-units-per-tile coordinate space.
export function cityLayout(size = 6): CityLayout {
  const T = 100;
  const out: CityLayout = { size: size * T, avenues: [], blocks: [], buildings: [], roofs: [], parks: [], trees: [], water: [], landmarks: [], cams: [], labels: [] };
  for (let i = 2; i < size; i += 2) out.avenues.push(i * T);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const rand = rng((x + 1) * 7919 + (y + 1) * 104729);
      const inset = 9;
      const block = { x: x * T + inset, y: y * T + inset, w: T - 2 * inset, h: T - 2 * inset };
      const name = districtOf({ x, y });
      out.blocks.push(block);
      if (name === 'Orchard Gardens' || (name === 'Canopy Commons' && rand() < 0.5)) {
        out.parks.push({ x: block.x + 3, y: block.y + 3, w: block.w - 6, h: block.h - 6 });
        for (let i = 0; i < 9; i++) out.trees.push({ x: block.x + 10 + rand() * (block.w - 20), y: block.y + 10 + rand() * (block.h - 20), r: 3 + rand() * 4 });
        continue;
      }
      if (name === 'Sprout Docks' && x === 0) out.water.push({ x: 0, y: y * T, w: 14, h: T });
      for (const l of lots({ x: block.x + 3, y: block.y + 3, w: block.w - 6, h: block.h - 6 }, rand)) {
        out.buildings.push({ ...l, shade: Math.floor(rand() * 3) });
        if (l.w > 14 && l.h > 14 && rand() < 0.6) out.roofs.push({ x: l.x + l.w * 0.2, y: l.y + l.h * 0.2, w: l.w * 0.25, h: l.h * 0.25 });
      }
      if (name === 'Halo Spire' && x === 2 && y === 5) out.landmarks.push({ x: x * T + 50, y: y * T + 50 });
    }
  // Surveillance cameras at intersections: the city is always watching.
  const cam = rng(42);
  for (let y = 1; y < size; y++) for (let x = 1; x < size; x++) if (cam() < 0.35) out.cams.push({ x: x * T, y: y * T, phase: Math.floor(cam() * 3) });
  DISTRICTS.forEach((row, by) => row.forEach((name, bx) => out.labels.push({ name, x: bx * 2 * T + 100, y: by * 2 * T + 100 })));
  return out;
}
