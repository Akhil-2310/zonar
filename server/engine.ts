// Pure game rules for Dead Drop. No I/O here: the server owns transport,
// the ledger owns money. Everything a player may learn flows through `intel`.
import crypto from 'node:crypto';
import type {
  ActionId,
  Area,
  ChainState,
  IntelBody,
  IntelEvent,
  Orders,
  OrdersInput,
  Phase,
  Pos,
  Reading,
  RecoveryInfo,
  Result,
  Seat,
  TranscriptEntry,
  View,
} from '../lib/types.ts';
import type { Wallet } from './ledger.ts';
import { CITY_SIZE, VAULT_DISTRICT, districtArea } from '../lib/city.ts';

export const SIZE = CITY_SIZE;
export const MAX_TURNS = 20;
export const START_CREDITS = 12;
export const COSTS: Record<ActionId, number> = { none: 0, dig: 0, ping: 1, leak: 1, chaff: 2, viewkey: 4 };
export const SAFEHOUSES: [Pos, Pos] = [{ x: 0, y: 0 }, { x: SIZE - 1, y: SIZE - 1 }];
export const ACTIONS = Object.keys(COSTS) as ActionId[];

export type Player = {
  seat: Seat;
  name: string;
  isBot: boolean;
  token: string;
  pos: Pos;
  credits: number;
  pending: Orders | null;
  intel: IntelEvent[];
  avatar?: string;
  // Consecutive turns this player let the clock run out on.
  missed?: number;
  // The player's agent wallet, when they joined with one.
  agentId?: string;
};

export type Match = {
  id: string;
  createdAt: number;
  phase: Phase;
  turn: number;
  drop: Pos;
  salt: string;
  commitment: string;
  carrier: Seat | null;
  carrierSince: number;
  // Hash chain over every turn's orders, seeded with the commitment. Anchored on-chain as it grows.
  chainHead: string;
  transcript: TranscriptEntry[];
  players: Player[];
  result: Result | null;
  // When the current turn's orders are due (epoch ms); null outside active play.
  turnDeadline?: number | null;
  // On-chain match: every sealed move is a signed shielded transaction from the player's agent to the vault.
  onchain?: boolean;
  moves?: OnchainMove[];

  // Set by Chain and persisted with the match. vaultSeed is never sent to anyone but the winner.
  vaultSeed?: RecoveryInfo;
  chain?: ChainState;
  anchorWanted?: { turn: number; head: string };
  anchorQueued?: boolean;
  anchorInFlight?: boolean;
  anchorFailed?: boolean;
  payout?: { address: string; memo: string };
  settling?: boolean;
  // A live wallet process: defined non-enumerable, so it never reaches disk or the wire.
  vaultWallet?: Wallet;
};

// One move as it went on-chain. The memo stays private until the match ends.
export type OnchainMove = { turn: number; seat: Seat; txid: string; memo: string };

type Rng = (max: number) => number;
const randomInt: Rng = (max) => crypto.randomInt(max);

export const inBounds = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE;
export const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
// Moves are one step in any of 8 directions, so Chebyshev distance is "turns away".
export const dist = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export function pingReading(d: number): Reading {
  if (d <= 1) return 'Locked';
  if (d <= 3) return 'Faint';
  return 'Static';
}

// A leak (real or chaff) flashes the whole district the tile is in on the rival's screen.
export const regionOf = (p: Pos): Area => districtArea(p);

export function commitmentOf(matchId: string, drop: Pos, salt: string): string {
  return crypto.createHash('sha256').update(`${matchId}|${drop.x},${drop.y}|${salt}`).digest('hex');
}

export function createMatch(id: string, rng: Rng = randomInt): Match {
  // The drop is always buried somewhere in the central vault district (C3–E5): each of
  // its tiles mirrors another the same distance from the opposite safehouse.
  const drop: Pos = { x: VAULT_DISTRICT.x + rng(VAULT_DISTRICT.w), y: VAULT_DISTRICT.y + rng(VAULT_DISTRICT.h) };
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id,
    createdAt: Date.now(),
    phase: 'waiting',
    turn: 1,
    drop,
    salt,
    commitment: commitmentOf(id, drop, salt),
    carrier: null,
    carrierSince: 0,
    chainHead: commitmentOf(id, drop, salt),
    transcript: [],
    players: [],
    result: null,
  };
}

export function addPlayer(match: Match, { name, isBot = false }: { name?: string; isBot?: boolean }): Player {
  if (match.players.length >= 2) throw new Error('match is full');
  const seat = match.players.length as Seat;
  const player: Player = {
    seat,
    name: String(name || `Agent ${seat + 1}`).slice(0, 24),
    isBot,
    token: crypto.randomBytes(16).toString('hex'),
    pos: { ...SAFEHOUSES[seat] },
    credits: START_CREDITS,
    pending: null,
    intel: [],
  };
  match.players.push(player);
  if (match.players.length === 2) match.phase = 'active';
  return player;
}

// Orders arrive as untrusted JSON, so every field is checked before it's believed.
export function validateOrders(match: Match, seat: Seat, orders: unknown): string | null {
  if (match.phase !== 'active') return 'match is not active';
  const p = match.players[seat];
  if (p.pending) return 'orders already locked this turn';
  const { move, action, target } = (orders ?? {}) as Partial<OrdersInput>;
  const step = (n: unknown) => n === -1 || n === 0 || n === 1;
  if (!move || !step(move.dx) || !step(move.dy)) return 'bad move';
  if (!inBounds({ x: p.pos.x + move.dx, y: p.pos.y + move.dy })) return 'move leaves the grid';
  if (!action || !ACTIONS.includes(action)) return 'unknown action';
  if (COSTS[action] > p.credits) return 'not enough credits';
  const tile = (t: unknown): t is Pos => !!t && Number.isInteger((t as Pos).x) && Number.isInteger((t as Pos).y) && inBounds(t as Pos);
  if (action === 'chaff' && !tile(target)) return 'chaff needs a target tile';
  if (action === 'viewkey' && !(tile(target) && target.x < SIZE - 1 && target.y < SIZE - 1)) return 'viewing key needs a 2×2 anchor';
  return null;
}

export function submitOrders(match: Match, seat: Seat, orders: unknown): { turn: number } | null {
  const err = validateOrders(match, seat, orders);
  if (err) throw new Error(err);
  const { move, action, target } = orders as OrdersInput;
  match.players[seat].pending = {
    move: { dx: move.dx, dy: move.dy },
    action,
    target: target ? { x: target.x, y: target.y } : null,
  };
  return match.players.every((p) => p.pending) ? resolveTurn(match) : null;
}

const dropPos = (m: Match): Pos => (m.carrier === null ? m.drop : m.players[m.carrier].pos);

// Resolution order: spend → move → collision → dig → intel actions → exposure → win/draw.
export function resolveTurn(match: Match, rng: Rng = randomInt): { turn: number } {
  const t = match.turn;
  const [a, b] = match.players;
  const orders = match.players.map((p) => p.pending as Orders);
  const log = (p: Player, ev: IntelBody) => p.intel.push({ turn: t, ...ev });

  match.players.forEach((p, i) => {
    p.credits -= COSTS[orders[i].action];
    p.pos = { x: p.pos.x + orders[i].move.dx, y: p.pos.y + orders[i].move.dy };
  });

  if (same(a.pos, b.pos)) {
    if (match.carrier !== null) {
      const thief = other(match.carrier);
      match.carrier = thief;
      match.carrierSince = t;
      for (const p of match.players) log(p, { type: 'collision', at: { ...p.pos }, stolen: true, carrier: thief === p.seat });
    } else {
      for (const p of match.players) log(p, { type: 'collision', at: { ...p.pos }, stolen: false, carrier: false });
    }
  }

  const diggers = match.players.filter((_, i) => orders[i].action === 'dig');
  const winners = match.carrier === null ? diggers.filter((p) => same(p.pos, match.drop)) : [];
  // Two agents digging the same tile in the same instant: a coin flip decides who grabs it.
  const finder = winners.length ? winners[winners.length > 1 ? rng(winners.length) : 0] : null;
  for (const p of diggers) log(p, { type: 'dig', at: { ...p.pos }, found: p === finder });
  if (finder) {
    match.carrier = finder.seat;
    match.carrierSince = t;
    log(match.players[other(finder.seat)], { type: 'rivalPickup' });
  }

  match.players.forEach((p, i) => {
    const o = orders[i];
    const rival = match.players[other(p.seat)];
    if (o.action === 'ping') {
      log(p, { type: 'ping', at: { ...p.pos }, reading: pingReading(dist(p.pos, dropPos(match))) });
    } else if (o.action === 'leak') {
      log(p, { type: 'leak', at: { ...p.pos }, distance: dist(p.pos, dropPos(match)) });
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
        drop: match.carrier === null && inArea(match.drop) ? { ...match.drop } : null,
        rival: inArea(rival.pos) ? { ...rival.pos } : null,
      });
    }
  });

  // A carrier is partly transparent: their tile leaks to the rival every other turn, starting on pickup.
  if (match.carrier !== null && (t - match.carrierSince) % 2 === 0) {
    const c = match.players[match.carrier];
    log(match.players[other(match.carrier)], { type: 'rivalSeen', at: { ...c.pos } });
    log(c, { type: 'exposed', at: { ...c.pos } });
  }

  match.transcript.push({ turn: t, orders });
  match.chainHead = crypto.createHash('sha256').update(match.chainHead + JSON.stringify({ turn: t, orders })).digest('hex');
  for (const p of match.players) p.pending = null;

  if (match.carrier !== null && same(match.players[match.carrier].pos, SAFEHOUSES[match.carrier])) {
    finish(match, { winner: match.carrier, reason: 'extracted' });
  } else if (t >= MAX_TURNS) {
    finish(match, { winner: null, reason: 'timeout' });
  } else {
    match.turn += 1;
  }
  return { turn: t };
}

function finish(match: Match, result: Result) {
  match.phase = 'over';
  match.result = result;
}

// A resignation, or a player who let the clock run out too many turns in a row.
export function forfeit(match: Match, seat: Seat, reason: 'forfeit' | 'abandoned' = 'forfeit') {
  if (match.phase !== 'active') return;
  finish(match, { winner: other(seat), reason });
}

// A match nobody joined.
export function expire(match: Match) {
  if (match.phase !== 'waiting') return;
  finish(match, { winner: null, reason: 'expired' });
}

// Everything one seat is allowed to see. Never includes the rival's position,
// credits or pending orders — only whether they've locked in.
export function viewFor(match: Match, seat: Seat): View {
  const me = match.players[seat];
  const rival = match.players[other(seat)];
  const over = match.phase === 'over' && match.result;
  return {
    matchId: match.id,
    seat,
    phase: match.phase,
    turn: match.turn,
    maxTurns: MAX_TURNS,
    size: SIZE,
    costs: COSTS,
    commitment: match.commitment,
    chainHead: match.chainHead,
    you: {
      name: me.name,
      pos: me.pos,
      home: SAFEHOUSES[seat],
      credits: me.credits,
      carrying: match.carrier === seat,
      locked: !!me.pending,
      pending: me.pending,
    },
    rival: rival
      ? {
          name: rival.name,
          home: SAFEHOUSES[other(seat)],
          carrying: match.carrier === other(seat),
          locked: !!rival.pending,
          isBot: rival.isBot,
          pos: over ? rival.pos : undefined,
        }
      : null,
    intel: me.intel,
    result: over ? { ...over, drop: match.drop, salt: match.salt, transcript: match.transcript } : null,
  };
}
