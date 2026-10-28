// Pixel art for Dead Drop's toy look: pets (the agents), their moods, and icons.
// A sprite is rows of characters; each character is a palette key and '.' is empty.
// Pets are built in layers: body, then gear, then the mood's eyes and mouth.

export type Sprite = string[];
export type Palette = Record<string, string>;
export type Mood = 'curious' | 'happy' | 'proud' | 'nervous' | 'angry' | 'sleepy' | 'hungry' | 'sad' | 'party';
export type Gear = 'shades' | 'hood' | 'beanie' | 'headset' | 'fedora' | 'mask';

const INK = '#2b2238';

// Stamp `layer` over `base`: every non-'.' character replaces what's beneath.
export function stamp(base: Sprite, layer: Sprite): Sprite {
  return base.map((row, y) => {
    const over = layer[y];
    if (!over) return row;
    let out = '';
    for (let x = 0; x < row.length; x++) out += over[x] && over[x] !== '.' ? over[x] : row[x];
    return out;
  });
}

// A placement helper for small overlays: `rows` drawn at (x, y) on a w×h canvas.
function at(x: number, y: number, rows: string[], w = 16, h = 16): Sprite {
  const out = Array.from({ length: h }, () => '.'.repeat(w));
  rows.forEach((r, i) => {
    const line = out[y + i].split('');
    for (let j = 0; j < r.length; j++) if (r[j] !== '.') line[x + j] = r[j];
    out[y + i] = line.join('');
  });
  return out;
}

const mirror = (rows: string[]) => rows.map((r) => r.split('').reverse().join(''));

// ---------- the pet body (16×16), two frames for a little hop ----------
const BODY: Sprite = [
  '................',
  '.....KKKKKK.....',
  '...KKLLLBBBKK...',
  '..KLLLBBBBBBBK..',
  '..KLLBBBBBBBBK..',
  '.KBBBBBBBBBBBBK.',
  '.KBBBBBBBBBBBBK.',
  '.KBBBBBBBBBBBBK.',
  '.KBBBBBBBBBBBBK.',
  '.KBBBBBBBBBBBBK.',
  '.KBBBBBBBBBBBBK.',
  '..KBBBBBBBBBBK..',
  '..KDBBBBBBBBDK..',
  '...KKDDDDDDKK...',
  '....KK....KK....',
  '................',
];
const FEET_2 = at(0, 14, ['...KK......KK...']);

// ---------- moods: eyes at rows 6–7, mouth at rows 9–10 ----------
const EYE_L = { x: 3, y: 6 };
const EYE_R = { x: 10, y: 6 };
const eyes = (left: string[]): Sprite => stamp(at(EYE_L.x, EYE_L.y, left), at(EYE_R.x, EYE_R.y, mirror(left)));

const EYES: Record<Mood | 'blink', Sprite> = {
  curious: eyes(['.EW', '.EE']),
  happy: eyes(['.E.', 'E.E']),
  proud: eyes(['.E.', 'E.E']),
  party: eyes(['.E.', 'E.E']),
  nervous: eyes(['.EE', '.EW']),
  angry: eyes(['E..', '.EE']),
  sad: eyes(['..E', 'EE.']),
  sleepy: eyes(['...', 'EEE']),
  hungry: eyes(['.EW', '.EE']),
  blink: eyes(['...', 'EEE']),
};
const BLUSH = stamp(at(2, 9, ['P']), at(13, 9, ['P']));
const MOUTH: Record<Mood, Sprite> = {
  curious: at(6, 9, ['K..K', '.KK.']),
  happy: at(6, 9, ['KRRK', '.KK.']),
  proud: at(6, 9, ['KRRK', '.KK.']),
  party: at(5, 9, ['KRRRRK', '.KRRK.']),
  nervous: at(6, 10, ['KKKK']),
  angry: at(6, 10, ['KKKK']),
  sad: at(6, 9, ['.KK.', 'K..K']),
  sleepy: at(7, 10, ['KK']),
  hungry: at(6, 9, ['.KK.', 'KRRK']),
};
// Little extras that make a mood read at a glance.
const MOOD_EXTRA: Partial<Record<Mood, Sprite>> = {
  nervous: at(13, 2, ['W', 'W']),
  angry: stamp(at(3, 5, ['KK.']), at(10, 5, ['.KK'])),
  sleepy: at(12, 0, ['ZZZ', '..Z', '.Z.', 'ZZZ']),
  hungry: at(13, 3, ['W']),
  party: stamp(at(0, 1, ['G']), at(15, 3, ['R'])),
};

// ---------- gear ----------
const GEAR: Record<Gear, Sprite> = {
  shades: at(2, 6, ['KSSSSKKSSSSK', '.SWSS..SWSS.']),
  hood: [
    '................',
    '....KAAAAAAK....',
    '...KAAAAAAAAK...',
    '..KAAAAAAAAAAK..',
    '..KAAB....BAAK..',
    '.KAA........AAK.',
    '.KA..........AK.',
    '.KA..........AK.',
    '.KA..........AK.',
    '.KA..........AK.',
    '.KAA........AAK.',
    '..KAAAAAAAAAAK..',
    '..KAAAAAAAAAAK..',
    '...KKAAAAAAKK...',
  ],
  beanie: at(2, 0, ['.....GG.....', '...KKGGKK...', '.KAAAAAAAAK.', 'KAAAAAAAAAAK', 'KWWWWWWWWWWK']),
  headset: [
    '................',
    '....SSSSSSSS....',
    '...S........S...',
    '..S..........S..',
    '.S............S.',
    '.S............S.',
    'SS............SS',
    'SS............SS',
    'SS............SS',
    '.S..............',
    '..SSSS..........',
  ],
  fedora: at(0, 0, ['....KAAAAAAK....', '...KAAAAAAAAK...', '...KGGGGGGGGK...', 'KAAAAAAAAAAAAAAK', '.KKKKKKKKKKKKKK.']),
  mask: at(1, 9, ['KAAAAAAAAAAAAK', 'KAWAAWAAWAAWAK', '.KAAAAAAAAAAK.']),
};

// ---------- the pets ----------
export type PetSpec = { id: string; name: string; gear: Gear; palette: Palette };
const base = (p: Palette): Palette => ({ K: INK, W: '#ffffff', P: '#ff9ebb', R: '#ff5f6d', E: INK, G: '#ffc93c', Z: INK, ...p });

export const PETS: PetSpec[] = [
  { id: 'nightjar', name: 'Nightjar', gear: 'shades', palette: base({ B: '#ffd66b', L: '#fff0b3', D: '#e8a93c', S: INK }) },
  { id: 'cipher', name: 'Cipher', gear: 'hood', palette: base({ B: '#9cc7ff', L: '#d3e6ff', D: '#6e9be0', A: '#3d3a66' }) },
  { id: 'sapling', name: 'Sapling', gear: 'beanie', palette: base({ B: '#a8e6a1', L: '#d9f7d2', D: '#6fc27a', A: '#ff6f7d' }) },
  { id: 'relay', name: 'Relay', gear: 'headset', palette: base({ B: '#ffb3d1', L: '#ffe0ec', D: '#f07fae', S: INK }) },
  { id: 'courier', name: 'Courier', gear: 'fedora', palette: base({ B: '#ffc59e', L: '#ffe3cf', D: '#ee9466', A: '#7a5c48' }) },
  { id: 'mixer', name: 'Mixer', gear: 'mask', palette: base({ B: '#cdb8ff', L: '#eae0ff', D: '#a58beb', A: '#7b4de0' }) },
];
// The bot: a shadow under a hood with glowing eyes.
export const GHOST_PET: PetSpec = { id: 'ghost', name: 'Ghost', gear: 'hood', palette: base({ B: '#4a4458', L: '#6b6480', D: '#2e2a38', A: '#2a2633', E: '#ffc93c', P: '#4a4458' }) };

export const petById = (id: string | undefined): PetSpec => PETS.find((p) => p.id === id) ?? (id === GHOST_PET.id ? GHOST_PET : PETS[0]);

export function petSprite(pet: PetSpec, mood: Mood = 'curious', frame = 0, blinking = false): Sprite {
  // The second frame swaps the whole feet row, so the pet hops instead of smearing.
  let s = frame ? BODY.map((r, i) => (i === 14 ? FEET_2[14] : r)) : BODY;
  if (pet.gear !== 'mask') s = stamp(s, BLUSH);
  s = stamp(s, blinking ? EYES.blink : EYES[mood]);
  if (pet.gear !== 'mask') s = stamp(s, MOUTH[mood]);
  s = stamp(s, GEAR[pet.gear]);
  const extra = MOOD_EXTRA[mood];
  if (extra) s = stamp(s, extra);
  return s;
}

// ---------- icons (12×12) ----------
export const ICON_PALETTE: Palette = {
  K: INK, W: '#ffffff', G: '#f4b728', Y: '#ffe08a', R: '#ff5f6d', B: '#5b8cff', T: '#9cc7ff', N: '#a8e6a1', M: '#6fc27a', O: '#c48a3a', P: '#ff9ebb', V: '#b8a6f0',
};

export const ICONS: Record<string, Sprite> = {
  none: [
    '............',
    '.....KKKKK..',
    '........K...',
    '.......K....',
    '......KKKKK.',
    '..KKKK......',
    '....K.......',
    '...K........',
    '..KKKK......',
    '............',
    '............',
    '............',
  ],
  dig: [
    '..........K.',
    '.........KK.',
    '........KK..',
    '.......KK...',
    '......KK....',
    '..KK.KK.....',
    '.KOOKK......',
    'KOOOOK......',
    'KOOOOK......',
    '.KOOK.......',
    '..KK........',
    '............',
  ],
  ping: [
    '............',
    '..KKKKKKK...',
    '.K.......K..',
    'K..KKKKK..K.',
    'K.K.....K.K.',
    'K.K..G..K.K.',
    'K.K.GGG.K.K.',
    'K.K..G..K.K.',
    'K..KKKKK..K.',
    '.K.......K..',
    '..KKKKKKK...',
    '............',
  ],
  leak: [
    '............',
    '........K...',
    '.......KK..R',
    '...KKKKRK.R.',
    '..KWWWKRK...',
    '..KWWWKRK.RR',
    '..KWWWKRK...',
    '...KKKKRK.R.',
    '....K..KK..R',
    '....K...K...',
    '....KK......',
    '............',
  ],
  viewkey: [
    '............',
    '..KKKK......',
    '.KGGGGK.....',
    'KGGKKGGK....',
    'KGK..KGKKKKK',
    'KGGKKGGGGGGK',
    '.KGGGGKKGKGK',
    '..KKKK..K.K.',
    '............',
    '............',
    '............',
    '............',
  ],
  chaff: [
    '.....K......',
    '....KYK.....',
    '.K..KYK..K..',
    'KYK.KYK.KYK.',
    '.K.KYYYK.K..',
    '..KYYYYYK...',
    '.K.KYYYK.K..',
    'KYK.KYK.KYK.',
    '.K..KYK..K..',
    '....KYK.....',
    '.....K......',
    '............',
  ],
  heart: [
    '............',
    '..KK...KK...',
    '.KRRK.KRRK..',
    'KRWRRKRRRRK.',
    'KRRRRRRRRRK.',
    'KRRRRRRRRRK.',
    '.KRRRRRRRK..',
    '..KRRRRRK...',
    '...KRRRK....',
    '....KRK.....',
    '.....K......',
    '............',
  ],
  clock: [
    '............',
    '...KKKKK....',
    '..KWWWWWK...',
    '.KWWWKWWWK..',
    'KWWWWKWWWWK.',
    'KWWWWKWWWWK.',
    'KWWWWKKKWWK.',
    'KWWWWWWWWWK.',
    '.KWWWWWWWK..',
    '..KWWWWWK...',
    '...KKKKK....',
    '............',
  ],
  chest: [
    '............',
    '..KKKKKKKK..',
    '.KYYYYYYYYK.',
    'KYYYYYYYYYYK',
    'KKKKKKKKKKKK',
    'KGGGGKKGGGGK',
    'KGGGKWWKGGGK',
    'KGGGKKKKGGGK',
    'KGGGGGGGGGGK',
    'KGGGGGGGGGGK',
    '.KKKKKKKKKK.',
    '............',
  ],
  house: [
    '.....KK.....',
    '....KRRK....',
    '...KRRRRK...',
    '..KRRRRRRK..',
    '.KRRRRRRRRK.',
    'KKKKKKKKKKKK',
    '.KWWWWWWWWK.',
    '.KWKKWWKKWK.',
    '.KWKKWWKKWK.',
    '.KWWWWWWWWK.',
    '.KKKKKKKKKK.',
    '............',
  ],
  eye: [
    '............',
    '............',
    '...KKKKKK...',
    '..KWWWWWWK..',
    '.KWWWKKWWWK.',
    'KWWWKRRKWWWK',
    'KWWWKRRKWWWK',
    '.KWWWKKWWWK.',
    '..KWWWWWWK..',
    '...KKKKKK...',
    '............',
    '............',
  ],
  lock: [
    '............',
    '....KKKK....',
    '...K....K...',
    '...K....K...',
    '..KKKKKKKK..',
    '..KGGGGGGK..',
    '..KGGKKGGK..',
    '..KGGKKGGK..',
    '..KGGGGGGK..',
    '..KKKKKKKK..',
    '............',
    '............',
  ],
  coin: [
    '............',
    '...KKKKKK...',
    '..KGGGGGGK..',
    '.KGKKKKKKGK.',
    '.KGGGGGKGGK.',
    '.KGGGGKGGGK.',
    '.KGGGKGGGGK.',
    '.KGGKGGGGGK.',
    '.KGKKKKKKGK.',
    '..KGGGGGGK..',
    '...KKKKKK...',
    '............',
  ],
  star: [
    '.....K......',
    '....KYK.....',
    '....KYK.....',
    'KKKKYYYKKKK.',
    '.KYYYYYYYK..',
    '..KYYYYYK...',
    '..KYYKYYK...',
    '.KYYK.KYYK..',
    '.KYK...KYK..',
    '.KK.....KK..',
    '............',
    '............',
  ],
};

// Every row of a sprite must be the same width; catch typos while developing.
export function checkSprite(name: string, s: Sprite) {
  const w = s[0].length;
  s.forEach((r, i) => {
    if (r.length !== w) throw new Error(`sprite ${name}: row ${i} is ${r.length} wide, expected ${w}`);
  });
}
