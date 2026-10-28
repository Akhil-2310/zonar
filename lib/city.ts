// The city: a 7×7 grid in 9 districts, sized 2-3-2 across each row and column so
// there is a true centre. The central district, Halo Spire (C3–E5), is the vault
// district: the drop is always buried there, exactly as far from both safehouses on
// average. Pure data, shared by the server and the browser (components/PixelCity draws it).
import type { Area, Pos } from './types.ts';

export const CITY_SIZE = 7;
// District bands along each axis: columns A–B, C–E, F–G (and rows 1–2, 3–5, 6–7).
const BAND_START = [0, 2, 5];
const BAND_WIDTH = [2, 3, 2];
const bandOf = (n: number) => (n < 2 ? 0 : n < 5 ? 1 : 2);

export const DISTRICTS = [
  ['Sprout Docks', 'Overwinter Yards', 'Sapling Row'],
  ['Blossom Heights', 'Halo Spire', 'Canopy Commons'],
  ['Nullifier Market', 'Heartwood', 'Orchard Gardens'],
];
export const districtOf = (p: Pos): string => DISTRICTS[bandOf(p.y)][bandOf(p.x)];
export const tileName = (p: Pos): string => 'ABCDEFG'[p.x] + (p.y + 1);

// The district containing a tile: what a leak (real or chaff) flashes on the rival's map.
export function districtArea(p: Pos): Area {
  const bx = bandOf(p.x);
  const by = bandOf(p.y);
  return { x: BAND_START[bx], y: BAND_START[by], w: BAND_WIDTH[bx], h: BAND_WIDTH[by] };
}

// Where the drop can be buried: the whole central district.
export const VAULT_DISTRICT: Area = { x: 2, y: 2, w: 3, h: 3 };
export const inVaultDistrict = (p: Pos) =>
  p.x >= VAULT_DISTRICT.x && p.x < VAULT_DISTRICT.x + VAULT_DISTRICT.w && p.y >= VAULT_DISTRICT.y && p.y < VAULT_DISTRICT.y + VAULT_DISTRICT.h;
