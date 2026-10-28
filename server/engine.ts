// Pure game rules for Dead Drop. No I/O here: the server owns transport,
// the ledger owns money. Everything a player may learn flows through `intel`.
import crypto from 'node:crypto';
import type { ChainState, IntelEvent, Orders, OrdersInput, Phase, Pos, RecoveryInfo, Result, Seat, TranscriptEntry, View } from '../lib/types.ts';
import type { Wallet } from './ledger.ts';
import {
  ACTIONS,
  COSTS,
  MAX_TURNS,
  SAFEHOUSES,
  SIZE,
  START_CREDITS,
  chainStep,
  dropFrom,
  houseCommitment,
  inBounds,
  isEntropy,
  other,
  resolve,
} from '../lib/rules.ts';

export { ACTIONS, COSTS, MAX_TURNS, SAFEHOUSES, SIZE, START_CREDITS, dist, inBounds, pingReading, regionOf, same } from '../lib/rules.ts';

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
  // Set when the second seat fills, from the house secret and both players' entropy.
  drop: Pos;
  // The house secret: committed to at creation, revealed when the match ends.
  salt: string;
  commitment: string;
  // Each seat's entropy, as its browser sent it. Absent on matches from before jointly random drops.
  entropy?: string[];
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

export function createMatch(id: string): Match {
  const salt = crypto.randomBytes(32).toString('hex');
  const commitment = houseCommitment(id, salt);
  return {
    id,
    createdAt: Date.now(),
    phase: 'waiting',
    turn: 1,
    drop: { x: -1, y: -1 },
    salt,
    commitment,
    entropy: [],
    carrier: null,
    carrierSince: 0,
    chainHead: commitment,
    transcript: [],
    players: [],
    result: null,
  };
}

// `entropy` is the joining browser's own randomness; the server makes some up for bots and old clients.
export function addPlayer(match: Match, { name, isBot = false, entropy }: { name?: string; isBot?: boolean; entropy?: string }): Player {
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
  if (match.entropy) match.entropy.push(isEntropy(entropy) ? entropy : crypto.randomBytes(32).toString('hex'));
  if (match.players.length === 2) {
    // Both entropies are in: only now does the drop exist.
    if (match.entropy) match.drop = dropFrom(match.id, match.salt, match.entropy);
    match.phase = 'active';
  }
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

export function resolveTurn(match: Match): { turn: number } {
  const t = match.turn;
  const orders = match.players.map((p) => p.pending as Orders);
  const result = resolve(match, t, orders);
  const entry = { turn: t, orders };
  match.transcript.push(entry);
  match.chainHead = chainStep(match.chainHead, entry);
  for (const p of match.players) p.pending = null;
  if (result) finish(match, result);
  else match.turn += 1;
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
    result: over ? { ...over, drop: match.drop, salt: match.salt, entropy: match.entropy, transcript: match.transcript } : null,
  };
}
