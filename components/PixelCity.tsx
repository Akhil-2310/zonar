// The city as pixel art on a colour LCD: 16 pixels per tile, drawn once and reused.
import type { CSSProperties, ReactElement } from 'react';
import { CITY_SIZE, DISTRICTS, VAULT_DISTRICT, districtOf } from '@/lib/city';

const T = 16;
const W = CITY_SIZE * T;
const C = {
  street: '#c6dca8',
  avenue: '#b3cd92',
  block: '#e9f2d8',
  buildings: ['#a9bf86', '#94ad72', '#b9cc98'],
  shadow: '#7f985f',
  window: '#e9f2d8',
  grass: '#a8dc8d',
  tree: '#5daa59',
  trunk: '#8a6a3e',
  water: '#8fd0ef',
  wave: '#d3f0fc',
  plaza: '#f6ebbf',
  plazaTile: '#ead79a',
  gold: '#f4b728',
  goldDark: '#a87b0c',
  ink: '#2f3b22',
  cam: '#ff5f6d',
  roofs: ['#f3c3cf', '#c4daf2', '#f6e3a6'],
  flowers: ['#ff8fb1', '#ffe066', '#ffffff', '#c7a6ff'],
  fountain: '#7cc6ea',
  foam: '#eaf8ff',
  boat: '#d98b5f',
  sail: '#fffdf3',
  flag: '#ff5f6d',
  cars: ['#ff5f6d', '#5b8cff', '#f4b728', '#fffdf3', '#3fae6a'],
  lamp: '#ffe9a3',
};

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

type R = { x: number; y: number; w: number; h: number; c: string; cls?: string };

// Split a block into building lots on the pixel grid.
function lots(x: number, y: number, w: number, h: number, rand: () => number, depth = 0): { x: number; y: number; w: number; h: number }[] {
  if (depth > 1 || w < 7 || h < 7 || (depth > 0 && rand() < 0.3)) return [{ x, y, w, h }];
  if (w >= h) {
    const cut = 3 + Math.floor(rand() * (w - 6));
    return [...lots(x, y, cut, h, rand, depth + 1), ...lots(x + cut + 1, y, w - cut - 1, h, rand, depth + 1)];
  }
  const cut = 3 + Math.floor(rand() * (h - 6));
  return [...lots(x, y, w, cut, rand, depth + 1), ...lots(x, y + cut + 1, w, h - cut - 1, rand, depth + 1)];
}

const TREE = ['.GGG.', 'GGGGG', 'GGGGG', '.GTG.', '..T..'];
const FOUNTAIN = ['.FFF.', 'FWFWF', 'FFWFF', 'FWFWF', '.FFF.'];
const BOAT = ['..S..', '.SS..', 'BBBBB', '.BBB.'];
const FLAG = ['KRR', 'KRR', 'K..', 'K..'];
const SPIRE = [
  '....GG....',
  '...GYYG...',
  '...GYYG...',
  '..GYYYYG..',
  '..GYKKYG..',
  '..GYYYYG..',
  '.GYYYYYYG.',
  '.GYYKKYYG.',
  '.GYYYYYYG.',
  'GYYYYYYYYG',
  'GGGGGGGGGG',
];

function sprite(rows: string[], ox: number, oy: number, colors: Record<string, string>): R[] {
  const out: R[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && colors[ch] && out.push({ x: ox + x, y: oy + y, w: 1, h: 1, c: colors[ch] })));
  return out;
}

function draw(): R[] {
  const out: R[] = [{ x: 0, y: 0, w: W, h: W, c: C.street }];
  // Avenues along district boundaries.
  for (const b of [2, 5]) {
    out.push({ x: b * T - 1, y: 0, w: 2, h: W, c: C.avenue }, { x: 0, y: b * T - 1, w: W, h: 2, c: C.avenue });
  }
  for (let ty = 0; ty < CITY_SIZE; ty++)
    for (let tx = 0; tx < CITY_SIZE; tx++) {
      const rand = rng((tx + 1) * 7919 + (ty + 1) * 104729);
      const name = districtOf({ x: tx, y: ty });
      const bx = tx * T + 1;
      const by = ty * T + 1;
      const bw = T - 2;
      if (name === 'Halo Spire') {
        // The vault district: a warm plaza, tiled.
        out.push({ x: bx, y: by, w: bw, h: bw, c: C.plaza });
        for (let i = 1; i < bw; i += 4) out.push({ x: bx + i, y: by + 1, w: 1, h: bw - 2, c: C.plazaTile }, { x: bx + 1, y: by + i, w: bw - 2, h: 1, c: C.plazaTile });
        if (tx === 3 && ty === 3) {
          out.push(...sprite(SPIRE, bx + 2, by + 2, { G: C.goldDark, Y: C.gold, K: C.ink }));
          out.push(...sprite(FLAG, bx + 6, by - 2, { K: C.ink, R: C.flag }).map((r) => ({ ...r, cls: r.c === C.flag ? 'animate-cam' : undefined })));
        } else if ((tx === 2 || tx === 4) && (ty === 2 || ty === 4)) {
          // Fountains on the plaza's four corners.
          out.push(...sprite(FOUNTAIN, bx + 4, by + 4, { F: C.fountain, W: C.foam }));
        } else {
          for (let i = 0; i < 4; i++) out.push({ x: bx + 2 + Math.floor(rand() * 10), y: by + 2 + Math.floor(rand() * 10), w: 1, h: 1, c: C.flowers[i % 4] });
        }
        continue;
      }
      if (name === 'Orchard Gardens' || (name === 'Canopy Commons' && rand() < 0.5)) {
        out.push({ x: bx, y: by, w: bw, h: bw, c: C.grass });
        for (let i = 0; i < 3; i++) out.push(...sprite(TREE, bx + 1 + Math.floor(rand() * 8), by + 1 + Math.floor(rand() * 8), { G: C.tree, T: C.trunk }));
        // Flowerbeds between the trees.
        for (let i = 0; i < 7; i++) out.push({ x: bx + 1 + Math.floor(rand() * 12), y: by + 1 + Math.floor(rand() * 12), w: 1, h: 1, c: C.flowers[Math.floor(rand() * 4)] });
        continue;
      }
      out.push({ x: bx, y: by, w: bw, h: bw, c: C.block });
      let left = bx;
      let width = bw;
      if (name === 'Sprout Docks' && tx === 0) {
        out.push({ x: bx - 1, y: by - 1, w: 5, h: T, c: C.water }, { x: bx, y: by + 3 + Math.floor(rand() * 6), w: 2, h: 1, c: C.wave });
        if (ty % 2 === 1) out.push(...sprite(BOAT, bx - 1, by + 5, { B: C.boat, S: C.sail }));
        left += 4;
        width -= 4;
      }
      for (const l of lots(left + 1, by + 1, width - 2, bw - 2, rand)) {
        const c = C.buildings[Math.floor(rand() * 3)];
        out.push({ x: l.x, y: l.y, w: l.w, h: l.h, c }, { x: l.x, y: l.y + l.h - 1, w: l.w, h: 1, c: C.shadow }, { x: l.x + l.w - 1, y: l.y, w: 1, h: l.h, c: C.shadow });
        // Some rooftops in pastel paint.
        if (rand() < 0.3) out.push({ x: l.x, y: l.y, w: l.w - 1, h: 1, c: C.roofs[Math.floor(rand() * 3)] });
        for (let wy = l.y + 1; wy < l.y + l.h - 2; wy += 2) for (let wx = l.x + 1; wx < l.x + l.w - 2; wx += 2) if (rand() < 0.7) out.push({ x: wx, y: wy, w: 1, h: 1, c: C.window });
      }
    }
  // Street lamps along the avenues.
  for (const b of [2, 5])
    for (let i = 1; i < CITY_SIZE * 2; i += 2) out.push({ x: b * T - 2, y: i * (T / 2), w: 1, h: 1, c: C.lamp }, { x: i * (T / 2), y: b * T - 2, w: 1, h: 1, c: C.lamp });
  // Surveillance cameras at street corners: blinking red pixels.
  const cam = rng(42);
  for (let y = 1; y < CITY_SIZE; y++)
    for (let x = 1; x < CITY_SIZE; x++) if (cam() < 0.32) out.push({ x: x * T - 1, y: y * T - 1, w: 2, h: 2, c: C.cam, cls: `animate-cam` });
  return out;
}

const RECTS = draw();

// Cars on the four avenues, driving at their own pace.
const CARS = [
  { axis: 'x', lane: 2 * T - 1, c: C.cars[0], dur: 13, delay: 0 },
  { axis: 'x', lane: 5 * T, c: C.cars[1], dur: 17, delay: -6 },
  { axis: 'x', lane: 2 * T, c: C.cars[3], dur: 21, delay: -14 },
  { axis: 'y', lane: 5 * T - 1, c: C.cars[2], dur: 15, delay: -3 },
  { axis: 'y', lane: 2 * T, c: C.cars[4], dur: 19, delay: -9 },
] as const;
let rendered: ReactElement[] | null = null;

export default function PixelCity({ className = '' }: { className?: string }) {
  rendered ??= RECTS.map((r, i) => (
    <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} className={r.cls} style={r.cls ? { animationDelay: `${(i % 3) * 0.7}s` } : undefined} />
  ));
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className={`block h-full w-full ${className}`} shapeRendering="crispEdges" aria-hidden="true">
      {rendered}
      {CARS.map((car, i) => (
        <rect
          key={`car${i}`}
          x={car.axis === 'x' ? 0 : car.lane}
          y={car.axis === 'x' ? car.lane : 0}
          width={car.axis === 'x' ? 3 : 1}
          height={car.axis === 'x' ? 1 : 3}
          fill={car.c}
          className={car.axis === 'x' ? 'drive-x' : 'drive-y'}
          style={{ '--dur': `${car.dur}s`, '--delay': `${car.delay}s` } as CSSProperties}
        />
      ))}
    </svg>
  );
}

// Above the fog: the vault district's blinking gold border and district names in tiny pixel type.
export function PixelCityOverlay({ labels = true }: { labels?: boolean }) {
  const v = { x: VAULT_DISTRICT.x * T, y: VAULT_DISTRICT.y * T, w: VAULT_DISTRICT.w * T, h: VAULT_DISTRICT.h * T };
  const dashes = [];
  for (let i = 0; i < v.w; i += 4) dashes.push(<rect key={`t${i}`} x={v.x + i} y={v.y} width={2} height={1} />, <rect key={`b${i}`} x={v.x + i} y={v.y + v.h - 1} width={2} height={1} />);
  for (let i = 0; i < v.h; i += 4) dashes.push(<rect key={`l${i}`} x={v.x} y={v.y + i} width={1} height={2} />, <rect key={`r${i}`} x={v.x + v.w - 1} y={v.y + i} width={1} height={2} />);
  const bands = [
    [0, 2],
    [2, 3],
    [5, 2],
  ];
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="pointer-events-none absolute inset-0 h-full w-full" shapeRendering="crispEdges" aria-hidden="true">
      <g fill={C.gold}>{dashes}</g>
      {labels &&
        DISTRICTS.flatMap((row, by) =>
          row.map((name, bx) => {
            const x = (bands[bx][0] + bands[bx][1] / 2) * T;
            const vault = bx === 1 && by === 1;
            const y = vault ? v.y + 4.4 : (bands[by][0] + bands[by][1] / 2) * T + 1;
            // Two words, two lines: big enough to read, and inside the district.
            const lines = vault ? [name.toUpperCase()] : name.toUpperCase().split(' ');
            return (
              <text key={name} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-silkscreen)" fontSize="3.7" fill={C.ink} stroke="#f2f8e6" strokeWidth="1.3" paintOrder="stroke">
                {lines.map((line, i) => (
                  <tspan key={line} x={x} dy={i === 0 ? -(lines.length - 1) * 2.1 : 4.2}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          }),
        )}
    </svg>
  );
}
