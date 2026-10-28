// The rules of Dead Drop, shared by the server and the browser. The server resolves each
// turn with `resolve`; when a match ends, each browser replays the revealed transcript
// through the same `resolve` and checks that every clue it was shown is what the rules say.
//
// Fairness, end to end:
//   1. Creating a match, the house picks a secret and publishes sha256(match|house|secret).
//   2. Each player's browser sends 32 random bytes of its own when it creates or joins.
//   3. The drop is derived from all three, after both seats are filled. The house committed
//      before seeing either player's entropy, and each player chose theirs blind, so nobody
//      picks the drop alone.
//   4. At the end the secret, both entropies and every turn's orders are revealed. The
//      browser re-derives the drop, re-hashes the turn chain and replays every clue.
import { sha256 as sha256Bytes } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { CITY_SIZE, VAULT_DISTRICT, districtArea } from './city.ts';
import type { ActionId, Area, IntelBody, IntelEvent, Orders, Pos, Reading, Result, Seat, TranscriptEntry } from './types.ts';

export const SIZE = CITY_SIZE;
export const MAX_TURNS = 20;
export const START_CREDITS = 12;
export const COSTS: Record<ActionId, number> = { none: 0, dig: 0, ping: 1, leak: 1, chaff: 2, viewkey: 4 };
export const SAFEHOUSES: [Pos, Pos] = [{ x: 0, y: 0 }, { x: SIZE - 1, y: SIZE - 1 }];
export const ACTIONS = Object.keys(COSTS) as ActionId[];

export const sha256 = (s: string): string => bytesToHex(sha256Bytes(utf8ToBytes(s)));
export const isEntropy = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

export const inBounds = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE;
export const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
// Moves are one step in any of 8 directions, so Chebyshev distance is "turns away".
export const dist = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export function pingReading(d: number): Reading {
  if (d <= 1) return 'Locked';
  if (d <= 3) return 'Faint';
  return 'Static';
}

// A leak (real or chaff) flashes the whole district the tile is in on the rival's screen.
export const regionOf = (p: Pos): Area => districtArea(p);

// What the house publishes before anyone moves.
export const houseCommitment = (matchId: string, secret: string) => sha256(`${matchId}|house|${secret}`);

// Matches from before jointly random drops committed to the drop itself.
export const legacyCommitment = (matchId: string, drop: Pos, salt: string) => sha256(`${matchId}|${drop.x},${drop.y}|${salt}`);

// The drop: one of the vault district's tiles, picked by the house secret and both players' entropy.
export function dropFrom(matchId: string, secret: string, entropy: string[]): Pos {
  const n = VAULT_DISTRICT.w * VAULT_DISTRICT.h;
  const i = parseInt(sha256(`${matchId}|drop|${secret}|${entropy.join('|')}`).slice(0, 12), 16) % n;
  return { x: VAULT_DISTRICT.x + (i % VAULT_DISTRICT.w), y: VAULT_DISTRICT.y + Math.floor(i / VAULT_DISTRICT.w) };
}

// One link of the turn hash chain, seeded with the commitment and anchored on-chain as it grows.
export const chainStep = (head: string, entry: TranscriptEntry) => sha256(head + JSON.stringify(entry));

// Two agents digging the drop's tile in the same instant: a coin flip from the house secret,
// so the replay lands the same way.
export const tieBreak = (secret: string, turn: number, n: number) => parseInt(sha256(`${secret}|tie|${turn}`).slice(0, 12), 16) % n;

// The part of a match the rules act on. The server's Match is one of these.
export type Board = {
  drop: Pos;
  salt: string;
  carrier: Seat | null;
  carrierSince: number;
  players: { seat: Seat; pos: Pos; credits: number; intel: IntelEvent[] }[];
};

const dropPos = (b: Board): Pos => (b.carrier === null ? b.drop : b.players[b.carrier].pos);

// Resolves one turn in place: spend → move → collision → dig → intel → exposure. Returns
// the result when this turn ends the match.
export function resolve(b: Board, t: number, orders: Orders[]): Result | null {
  const [a, c] = b.players;
  const log = (p: Board['players'][number], ev: IntelBody) => p.intel.push({ turn: t, ...ev });

  b.players.forEach((p, i) => {
    p.credits -= COSTS[orders[i].action];
    p.pos = { x: p.pos.x + orders[i].move.dx, y: p.pos.y + orders[i].move.dy };
  });

  if (same(a.pos, c.pos)) {
    if (b.carrier !== null) {
      const thief = other(b.carrier);
      b.carrier = thief;
      b.carrierSince = t;
      for (const p of b.players) log(p, { type: 'collision', at: { ...p.pos }, stolen: true, carrier: thief === p.seat });
    } else {
      for (const p of b.players) log(p, { type: 'collision', at: { ...p.pos }, stolen: false, carrier: false });
    }
  }

  const diggers = b.players.filter((_, i) => orders[i].action === 'dig');
  const winners = b.carrier === null ? diggers.filter((p) => same(p.pos, b.drop)) : [];
  const finder = winners.length ? winners[winners.length > 1 ? tieBreak(b.salt, t, winners.length) : 0] : null;
  for (const p of diggers) log(p, { type: 'dig', at: { ...p.pos }, found: p === finder });
  if (finder) {
    b.carrier = finder.seat;
    b.carrierSince = t;
    log(b.players[other(finder.seat)], { type: 'rivalPickup' });
  }

  b.players.forEach((p, i) => {
    const o = orders[i];
    const rival = b.players[other(p.seat)];
    if (o.action === 'ping') {
      log(p, { type: 'ping', at: { ...p.pos }, reading: pingReading(dist(p.pos, dropPos(b))) });
    } else if (o.action === 'leak') {
      log(p, { type: 'leak', at: { ...p.pos }, distance: dist(p.pos, dropPos(b)) });
      log(rival, { type: 'flash', region: regionOf(p.pos) });
    } else if (o.action === 'chaff' && o.target) {
      log(p, { type: 'chaffPlanted', region: regionOf(o.target) });
      log(rival, { type: 'flash', region: regionOf(o.target) });
    } else if (o.action === 'viewkey' && o.target) {
      const area: Area = { x: o.target.x, y: o.target.y, w: 2, h: 2 };
      const inArea = (q: Pos) => q.x >= area.x && q.x < area.x + 2 && q.y >= area.y && q.y < area.y + 2;
      log(p, {
        type: 'viewkey',
        area,
        drop: b.carrier === null && inArea(b.drop) ? { ...b.drop } : null,
        rival: inArea(rival.pos) ? { ...rival.pos } : null,
      });
    }
  });

  // A carrier is partly transparent: their tile leaks to the rival every other turn, starting on pickup.
  if (b.carrier !== null && (t - b.carrierSince) % 2 === 0) {
    const carrier = b.players[b.carrier];
    log(b.players[other(b.carrier)], { type: 'rivalSeen', at: { ...carrier.pos } });
    log(carrier, { type: 'exposed', at: { ...carrier.pos } });
  }

  if (b.carrier !== null && same(b.players[b.carrier].pos, SAFEHOUSES[b.carrier])) return { winner: b.carrier, reason: 'extracted' };
  if (t >= MAX_TURNS) return { winner: null, reason: 'timeout' };
  return null;
}

// ---------- the end-of-match audit, run in each player's browser ----------

export type Reveal = {
  matchId: string;
  commitment: string;
  chainHead: string;
  drop: Pos;
  salt: string;
  // Both players' entropy, by seat. Absent on matches from before jointly random drops.
  entropy?: string[];
  transcript: TranscriptEntry[];
  result: Result;
};

export type Audit = {
  // The house secret re-hashes to the commitment published before anyone moved.
  commitment: boolean;
  // The drop is the one the secret and both players' entropy derive (null on legacy matches).
  drop: boolean | null;
  // The entropy this browser sent is the entropy the server used for its seat (null if it doesn't know).
  myEntropy: boolean | null;
  // The turns re-hash to the final chain head.
  chain: boolean;
  // Replaying every turn under the rules gives exactly the clues this seat was shown.
  clues: boolean;
  // How many clues were replayed for this seat, and the first turn where they diverge.
  clueCount: number;
  firstBadTurn: number | null;
  // The replay ends the way the server says the match ended.
  outcome: boolean;
};

const canon = (intel: IntelEvent[]) => intel.map((e) => JSON.stringify(e, Object.keys(e).sort()));

export function audit(r: Reveal, seat: Seat, shown: IntelEvent[], myEntropy?: string | null): Audit {
  const legacy = !r.entropy;
  const commitment = legacy ? legacyCommitment(r.matchId, r.drop, r.salt) === r.commitment : houseCommitment(r.matchId, r.salt) === r.commitment;
  const drop = legacy ? null : same(dropFrom(r.matchId, r.salt, r.entropy!), r.drop);
  const mine = myEntropy && r.entropy ? r.entropy[seat] === myEntropy : null;

  let head = r.commitment;
  for (const t of r.transcript) head = chainStep(head, t);

  const b: Board = {
    drop: r.drop,
    salt: r.salt,
    carrier: null,
    carrierSince: 0,
    players: ([0, 1] as Seat[]).map((s) => ({ seat: s, pos: { ...SAFEHOUSES[s] }, credits: START_CREDITS, intel: [] })),
  };
  let ended: Result | null = null;
  let legal = true;
  for (const { turn, orders } of r.transcript) {
    if (ended) legal = false;
    orders.forEach((o, i) => {
      const p = b.players[i];
      const to = { x: p.pos.x + o.move.dx, y: p.pos.y + o.move.dy };
      if (Math.abs(o.move.dx) > 1 || Math.abs(o.move.dy) > 1 || !inBounds(to) || COSTS[o.action] > p.credits) legal = false;
    });
    ended = resolve(b, turn, orders) ?? ended;
  }

  const replayed = canon(b.players[seat].intel);
  const seen = canon(shown);
  const bad = Math.max(replayed.length, seen.length);
  let firstBad: number | null = null;
  for (let i = 0; i < bad; i++) {
    if (replayed[i] !== seen[i]) {
      firstBad = (b.players[seat].intel[i] ?? shown[i]).turn;
      break;
    }
  }

  // Resignations and abandoned seats end a match early; the replay only has to not contradict them.
  const outcome =
    legal &&
    (r.result.reason === 'extracted' || r.result.reason === 'timeout'
      ? !!ended && ended.reason === r.result.reason && ended.winner === r.result.winner
      : !ended);

  return { commitment, drop, myEntropy: mine, chain: head === r.chainHead, clues: firstBad === null, clueCount: replayed.length, firstBadTurn: firstBad, outcome };
}
