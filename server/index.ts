// One process serves the Next.js app and the game API, so the long-lived
// wallet processes and match state survive page reloads and hot reloads.
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { createMatch, addPlayer, submitOrders, validateOrders, viewFor, forfeit, expire, type Player } from './engine.ts';
import { MockLedger, ZingoLedger, type Ledger } from './ledger.ts';
import { Chain, PRIZE_ZAT, type ChainMatch } from './chain.ts';
import { DripPolicy, PrizePolicy } from './policy.ts';
import { AgentStore } from './agents.ts';
import { Builder } from './builder.ts';
import { fromB64, memoMatches } from '../lib/moves.ts';
import { MatchStore } from './store.ts';
import { botOrders } from './bot.ts';
import { districtOf, tileName } from '../lib/city.ts';
import { AVATAR_IDS } from '../lib/avatars.ts';
import type { AgentStatus, GameView, HouseInfo, OrdersInput, Seat } from '../lib/types.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const ZINGO_CLI = process.env.ZINGO_CLI || path.join(os.homedir(), 'src/zingolib/target/release/zingo-cli');
const env = (name: string, fallback: number) => (process.env[name] !== undefined ? Number(process.env[name]) : fallback);

// Turn clock: orders are due TURN_SECONDS after a turn opens. A player who misses
// MAX_MISSED turns in a row forfeits; a match nobody joins expires after JOIN_MINUTES.
const TURN_MS = env('TURN_SECONDS', 60) * 1000;
// On-chain moves take a few seconds to build, sign and broadcast, so those turns get longer.
const ONCHAIN_TURN_MS = env('ONCHAIN_TURN_SECONDS', 90) * 1000;
const MAX_MISSED = env('MAX_MISSED_TURNS', 3);
const JOIN_MS = env('JOIN_MINUTES', 30) * 60_000;
// Behind a reverse proxy the client's address arrives in X-Forwarded-For.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
// Behind CloudFront: a secret header CloudFront adds to every request it forwards. With it set,
// requests that skip CloudFront (straight to the server's IP) are refused, so nobody can bypass
// the proxy to fake their address. Requests from inside the machine are always allowed.
const ORIGIN_SECRET = process.env.ORIGIN_SECRET || '';

const useMock = process.env.LEDGER === 'mock' || !fs.existsSync(ZINGO_CLI);
const ledger: Ledger = useMock
  ? new MockLedger()
  : new ZingoLedger({ bin: ZINGO_CLI, server: process.env.ZINGO_SERVER || 'https://testnet.zec.rocks:443', root: path.join(ROOT, '.wallets') });
console.log(useMock ? 'Ledger: in-memory mock (set ZINGO_CLI to use testnet)' : `Ledger: Zcash testnet via ${ZINGO_CLI}`);

// Mock matches can't be resumed (their money only ever existed in memory), so they get their own folder.
const store = new MatchStore(path.join(ROOT, '.data', useMock ? 'matches-mock' : 'matches'));
const matches = new Map<string, ChainMatch>();
const streams = new Map<string, Set<{ seat: Seat; res: ServerResponse }>>();
const chain = new Chain(ledger, { onUpdate: changed });
const policy = new PrizePolicy(path.join(ROOT, '.data', useMock ? 'policy-mock.json' : 'policy.json'), {
  prizeZat: PRIZE_ZAT,
  botPrizeZat: env('BOT_PRIZE_ZAT', 0),
  dailyBudgetZat: env('PRIZE_DAILY_BUDGET_ZAT', 10 * PRIZE_ZAT),
  perPlayerDaily: env('PRIZE_MATCHES_PER_DAY', 3),
  // One person on two tabs shouldn't win prizes from themselves; local development is the exception.
  allowSameIp: process.env.ALLOW_SAME_IP ? process.env.ALLOW_SAME_IP === '1' : dev,
});
// Client addresses, held in memory only until the match starts (never written to disk).
const seatIps = new Map<string, string[]>();

// Player agent wallets: the Rust builder holds their view-only keys and builds their move transactions.
// Each refill is NOTE_ZAT-sized notes, one per on-chain move (a zero-value memo costs exactly the 10,000-zat fee).
const NOTE_ZAT = 10_000;
const REFILL_NOTES = env('AGENT_REFILL_NOTES', 24);
const BUILDER_BIN = process.env.BUILDER_BIN || path.join(ROOT, 'builder/target/release/zonar-builder');
const builder =
  !useMock && Builder.available(BUILDER_BIN)
    ? new Builder({ bin: BUILDER_BIN, dir: path.join(ROOT, '.wallets', 'agents'), lightwalletd: process.env.ZINGO_SERVER || 'https://testnet.zec.rocks:443' })
    : null;
console.log(builder ? `Agent wallets: on (builder ${BUILDER_BIN})` : 'Agent wallets: off (needs testnet and the zonar-builder binary)');
const agents = new AgentStore(path.join(ROOT, '.data', 'agents.json'));
const drips = new DripPolicy(path.join(ROOT, '.data', 'drips.json'), {
  // Local development: every test player shares localhost, so the per-player cap is loose there.
  perPlayerDaily: env('AGENT_REFILLS_PER_DAY', dev ? 20 : 2),
  dailyBudgetZat: env('AGENT_REFILL_DAILY_BUDGET_ZAT', 40 * REFILL_NOTES * NOTE_ZAT),
});
// Built-but-unsigned move transactions, one per seat: `${matchId}:${seat}`.
const pendingMoves = new Map<string, { buildId: string; turn: number; orders: OrdersInput; memo: string; submitting?: boolean }>();

type Body = Record<string, unknown>;
const newId = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

function getMatch(id: unknown): ChainMatch {
  const match = matches.get(str(id).toUpperCase());
  if (!match) throw httpError(404, 'no such match');
  return match;
}

function seatFor(match: ChainMatch, token: unknown): Seat {
  const p = match.players.find((p) => p.token === token);
  if (!p) throw httpError(403, 'unknown match or token');
  return p.seat;
}

// The address our proxy saw. Proxies append to X-Forwarded-For, so the last entry is the one our
// own proxy added; anything before it came from the client and can be made up.
function clientIp(req: IncomingMessage): string {
  const fwd = TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1)!.trim() : '';
  return fwd || req.socket.remoteAddress || 'unknown';
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function fromOrigin(req: IncomingMessage): boolean {
  if (!ORIGIN_SECRET || LOOPBACK.has(req.socket.remoteAddress ?? '')) return true;
  const got = Buffer.from(String(req.headers['x-origin-secret'] ?? ''));
  const want = Buffer.from(ORIGIN_SECRET);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function fullView(match: ChainMatch, seat: Seat): GameView {
  const me = match.players[seat];
  const turnMs = match.onchain ? ONCHAIN_TURN_MS : TURN_MS;
  const clock = { deadline: match.turnDeadline ?? null, now: Date.now(), turnSeconds: turnMs / 1000, missed: me.missed ?? 0, maxMissed: MAX_MISSED };
  const moves = match.moves ?? [];
  const onchain: GameView['onchain'] = { enabled: !!match.onchain, moves: moves.map(({ turn, seat, txid }) => ({ turn, seat, txid })) };
  // Memos spell out the orders, so they stay sealed until the match is over.
  if (match.phase === 'over' && match.onchain) {
    onchain.reveal = {
      memos: moves.map(({ turn, seat, memo }) => ({ turn, seat, memo })),
      orderKeys: match.players.map((p) => agents.get(p.agentId)?.orderPub ?? null),
    };
  }
  const v: GameView = { ...viewFor(match, seat), chain: match.chain, clock, onchain, agent: !!me.agentId };
  v.you.avatar = match.players[seat].avatar;
  if (v.rival) v.rival.avatar = match.players[1 - seat].avatar;
  if (v.result && match.result?.winner === seat && match.vaultSeed) v.result.vaultSeed = match.vaultSeed;
  return v;
}

// Every state change goes to disk and to both players.
function changed(match: ChainMatch) {
  store.save(match);
  for (const { seat, res } of streams.get(match.id) ?? []) res.write(`data: ${JSON.stringify(fullView(match, seat))}\n\n`);
}

type Joiner = { name?: string; avatar?: string; isBot?: boolean; ip?: string; agentId?: string; entropy?: string };

function join(match: ChainMatch, { name, avatar, isBot = false, ip, agentId, entropy }: Joiner): Player {
  const p = addPlayer(match, { name, isBot, entropy });
  p.avatar = avatar && AVATAR_IDS.includes(avatar) ? avatar : AVATAR_IDS[(match.players.length * 3) % AVATAR_IDS.length];
  p.agentId = agentId;
  if (!isBot) seatIps.set(match.id, [...(seatIps.get(match.id) ?? []), ip ?? 'unknown']);
  if (match.phase === 'active') {
    // Both seats are filled: decide whether real ZEC is at stake, then start the clock.
    const vsBot = match.players.some((q) => q.isBot);
    // Head-to-head between two agents: every move goes on-chain, signed by its player.
    match.onchain = !vsBot && !!builder && match.players.every((q) => q.agentId);
    match.moves = [];
    chain.start(match, { ...policy.decide({ vsBot, ips: seatIps.get(match.id) ?? [] }), vault: match.onchain });
    seatIps.delete(match.id);
    onTurnStart(match);
  }
  return p;
}

function onTurnStart(match: ChainMatch) {
  match.turnDeadline = match.phase === 'active' ? Date.now() + (match.onchain ? ONCHAIN_TURN_MS : TURN_MS) : null;
  for (const seat of [0, 1]) {
    const pm = pendingMoves.get(`${match.id}:${seat}`);
    if (pm && (pm.turn !== match.turn || match.phase !== 'active') && !pm.submitting) {
      builder?.cancel(pm.buildId);
      pendingMoves.delete(`${match.id}:${seat}`);
    }
  }
  if (match.phase === 'over') {
    if (!match.settling) {
      match.settling = true;
      chain.settle(match);
    }
    return;
  }
  for (const p of match.players) {
    if (!p.isBot || p.pending) continue;
    setTimeout(() => {
      try {
        order(match, p.seat, botOrders(viewFor(match, p.seat)));
      } catch (e) {
        console.error('bot failed, holding position:', e instanceof Error ? e.message : e);
        order(match, p.seat, { move: { dx: 0, dy: 0 }, action: 'none' });
      }
    }, 700);
  }
}

function order(match: ChainMatch, seat: Seat, orders: OrdersInput | Body, { auto = false } = {}) {
  const p = match.players[seat];
  const resolved = submitOrders(match, seat, orders);
  // Sealing your own orders resets the streak; a clock-forced hold extends it.
  p.missed = auto ? (p.missed ?? 0) + 1 : 0;
  if (resolved) {
    chain.anchor(match);
    onTurnStart(match);
  }
  changed(match);
}

// Once a second: run out turn clocks and expire lobbies nobody joined.
function tick() {
  const now = Date.now();
  for (const match of matches.values()) {
    if (match.phase === 'waiting' && now - match.createdAt > JOIN_MS) {
      expire(match);
      onTurnStart(match);
      changed(match);
    } else if (match.phase === 'active' && match.onchain && !match.chain.vault.address) {
      // Moves can't go on-chain until the vault has an address: the clock waits for it.
      match.turnDeadline = now + ONCHAIN_TURN_MS;
    } else if (match.phase === 'active' && match.turnDeadline && now > match.turnDeadline) {
      // Whoever hasn't sealed holds position and stays dark; too many in a row and they've abandoned the match.
      for (const p of match.players) {
        if (p.pending || match.phase !== 'active') continue;
        if (pendingMoves.get(`${match.id}:${p.seat}`)?.submitting) continue; // their move is broadcasting
        if ((p.missed ?? 0) + 1 >= MAX_MISSED) {
          forfeit(match, p.seat, 'abandoned');
          onTurnStart(match);
          changed(match);
        } else {
          order(match, p.seat, { move: { dx: 0, dy: 0 }, action: 'none' }, { auto: true });
        }
      }
    }
  }
}
setInterval(tick, 1000).unref();

const routes: Record<string, (body: Body, req: IncomingMessage) => unknown> = {
  'GET /api/house': (): HouseInfo => ({
    ...chain.houseInfo,
    botPrizeZat: policy.config.botPrizeZat,
    prizeMatchesLeftToday: policy.prizeMatchesLeftToday(),
    agents: !!builder,
  }),
  'POST /api/match': (body, req) => {
    const agentId = joiningAgent(body);
    const match = chain.pending(createMatch(newId()));
    matches.set(match.id, match);
    const p = join(match, { name: str(body.name), avatar: str(body.avatar), ip: clientIp(req), agentId, entropy: str(body.entropy) });
    if (body.vsBot) join(match, { name: 'GHOST', avatar: 'ghost', isBot: true });
    changed(match);
    return { matchId: match.id, token: p.token, seat: p.seat };
  },
  'POST /api/join': (body, req) => {
    const match = getMatch(body.matchId);
    const p = join(match, { name: str(body.name), avatar: str(body.avatar), ip: clientIp(req), agentId: joiningAgent(body), entropy: str(body.entropy) });
    changed(match);
    return { matchId: match.id, token: p.token, seat: p.seat };
  },
  'POST /api/orders': (body) => {
    const match = getMatch(body.matchId);
    const seat = seatFor(match, body.token);
    if (match.onchain) throw new Error('this match is on-chain: seal your move with your agent');
    order(match, seat, body);
    return { ok: true };
  },

  // ---------- agent wallets ----------
  'POST /api/agents': async (body, req) => {
    if (!builder) throw new Error('agent wallets need the testnet server with the transaction builder');
    const orderPub = str(body.orderPub);
    if (fromB64(orderPub).length !== 32) throw new Error('bad order key');
    const { agent, token } = agents.create({
      name: str(body.name).slice(0, 24) || 'Agent',
      avatar: str(body.avatar),
      ufvk: str(body.ufvk),
      seedFingerprint: str(body.seedFingerprint),
      accountIndex: Number(body.accountIndex) || 0,
      orderPub,
    });
    await builder.register({ id: agent.id, ufvk: agent.ufvk, seed_fingerprint: agent.seedFingerprint, account_index: agent.accountIndex });
    refill(agent.id, clientIp(req));
    return { agentId: agent.id, agentToken: token };
  },
  'POST /api/agents/status': async (body): Promise<AgentStatus> => {
    const agent = agents.auth(body.agentId, body.agentToken);
    const b = await builder!.balance(agent.id);
    return {
      id: agent.id,
      name: agent.name,
      spendableZat: b.spendable_zats,
      pendingZat: b.pending_zats,
      movesFunded: Math.floor(b.spendable_zats / NOTE_ZAT),
      noteZat: NOTE_ZAT,
      refill: agent.refill && { status: agent.refill.status, txid: agent.refill.txid, error: agent.refill.error },
    };
  },
  'POST /api/agents/refill': (body, req) => {
    const agent = agents.auth(body.agentId, body.agentToken);
    if (agent.refill?.status === 'sending') throw new Error('a refill is already on its way');
    refill(agent.id, clientIp(req), true);
    return { ok: true };
  },
  // A fresh address of the agent's own wallet, e.g. to claim a vault into.
  'POST /api/agents/address': async (body) => {
    const agent = agents.auth(body.agentId, body.agentToken);
    return { address: (await builder!.addresses(agent.id, 1))[0] };
  },

  // ---------- on-chain moves ----------
  // 1. The browser sends its orders with the memo it signed; we check both and build the transaction.
  'POST /api/moves/build': async (body) => {
    const match = getMatch(body.matchId);
    const seat = seatFor(match, body.token);
    if (!match.onchain || !builder) throw new Error('this match is not on-chain');
    const agent = agents.get(match.players[seat].agentId)!;
    const orders = body.orders as OrdersInput;
    const invalid = validateOrders(match, seat, orders);
    if (invalid) throw new Error(invalid);
    const memo = str(body.memo);
    if (!memoMatches(memo, fromB64(agent.orderPub), match.id, match.turn, seat, orders)) throw new Error("the move's signature doesn't match its orders");
    const vault = match.chain.vault.address;
    if (!vault) throw httpError(409, 'the match vault is still opening; try again in a few seconds');
    const key = `${match.id}:${seat}`;
    const previous = pendingMoves.get(key);
    if (previous?.submitting) throw new Error('your move is already broadcasting');
    if (previous) builder.cancel(previous.buildId);
    const built = await builder.build(agent.id, vault, memo);
    pendingMoves.set(key, { buildId: built.build_id, turn: match.turn, orders, memo });
    return { buildId: built.build_id, pczt: built.pczt, vault, turn: match.turn };
  },
  // 2. The browser checked and signed it; we combine it with our proof and broadcast. Then the move counts.
  'POST /api/moves/submit': async (body) => {
    const match = getMatch(body.matchId);
    const seat = seatFor(match, body.token);
    const key = `${match.id}:${seat}`;
    const pm = pendingMoves.get(key);
    if (!pm || pm.buildId !== body.buildId) throw new Error('that move is no longer pending; seal it again');
    if (pm.turn !== match.turn || match.phase !== 'active' || match.players[seat].pending) throw new Error('the turn moved on before your move was sent');
    pm.submitting = true;
    try {
      const txid = await builder!.submit(pm.buildId, str(body.signed));
      (match.moves ??= []).push({ turn: pm.turn, seat, txid, memo: pm.memo });
      pendingMoves.delete(key);
      // The broadcast is done, so the move stands even if the clock ran out while it was in flight.
      if (match.phase === 'active' && match.turn === pm.turn && !match.players[seat].pending) order(match, seat, pm.orders);
      else changed(match);
      return { txid };
    } catch (e) {
      pendingMoves.delete(key);
      throw e;
    }
  },
  'POST /api/resign': (body) => {
    const match = getMatch(body.matchId);
    forfeit(match, seatFor(match, body.token));
    onTurnStart(match);
    changed(match);
    return { ok: true };
  },
  // The payout address is kept only until the sweep is sent, so a restart can finish the payout.
  'POST /api/claim': async (body) => {
    const match = getMatch(body.matchId);
    const seat = seatFor(match, body.token);
    if (match.phase !== 'over' || match.result?.winner !== seat) throw new Error('only the winner can claim the vault');
    const me = match.players[seat];
    const relic = `ZONAR RELIC #${match.id} | ${districtOf(match.drop)} ${tileName(match.drop)} | T${match.turn} | ${me.name} | commit ${match.commitment}`;
    await chain.claim(match, str(body.address).trim(), relic);
    return { ok: true };
  },
};

function joiningAgent(body: Body): string | undefined {
  if (!body.agentId) return undefined;
  return agents.auth(body.agentId, body.agentToken).id;
}

// Sends a new agent (or one asking for more) a batch of move-sized notes from the house.
function refill(agentId: string, ip: string, explicit = false) {
  const agent = agents.get(agentId)!;
  const denied = drips.grant(ip, REFILL_NOTES * NOTE_ZAT);
  if (denied) {
    if (explicit) throw new Error(denied);
    agent.refill = { status: 'failed', error: denied, at: Date.now() };
    agents.save();
    return;
  }
  agent.refill = { status: 'sending', at: Date.now() };
  agents.save();
  (async () => {
    const addresses = await builder!.addresses(agentId, REFILL_NOTES);
    const txid = await chain.houseSend('agent refill', addresses.map((address) => ({ address, zat: NOTE_ZAT })));
    agent.refill = { status: 'sent', txid, at: Date.now() };
    console.log(`[agent ${agentId}] refilled with ${REFILL_NOTES} notes: ${txid}`);
  })()
    .catch((e) => {
      agent.refill = { status: 'failed', error: e instanceof Error ? e.message : String(e), at: Date.now() };
    })
    .finally(() => agents.save());
}

function stream(req: IncomingMessage, res: ServerResponse, url: URL) {
  const match = getMatch(url.searchParams.get('matchId'));
  const seat = seatFor(match, url.searchParams.get('token'));
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const entry = { seat, res };
  if (!streams.has(match.id)) streams.set(match.id, new Set());
  streams.get(match.id)!.add(entry);
  res.write(`data: ${JSON.stringify(fullView(match, seat))}\n\n`);
  const ping = setInterval(() => res.write(': keepalive\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    streams.get(match.id)?.delete(entry);
  });
}

function send(res: ServerResponse, status: number, obj: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// The page may only talk to this server: no third-party scripts, fonts, or beacons.
// Next.js needs inline scripts (and eval in dev for fast refresh).
const CSP = [
  "default-src 'self'",
  // wasm-unsafe-eval lets the page run the Wasm transaction signer; it does not allow JS eval.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ');

// ---------- boot ----------
for (const match of store.loadAll() as ChainMatch[]) {
  matches.set(match.id, match);
  match.createdAt ??= Date.now();
  if (match.phase === 'over') match.settling = true;
  chain.resume(match);
  // Downtime isn't the players' fault: active matches get a fresh clock.
  if (match.phase === 'active') onTurnStart(match);
}
console.log(`Restored ${matches.size} match(es) from disk`);

const server = http.createServer();
const app = next({ dev, dir: ROOT, hostname: 'localhost', port: PORT, httpServer: server });
const handle = app.getRequestHandler();
await app.prepare();

server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!fromOrigin(req)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Open Zonar through its public link.\n');
  }
  res.setHeader('content-security-policy', CSP);
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  if (!url.pathname.startsWith('/api/')) return handle(req, res);
  try {
    if (req.method === 'GET' && url.pathname === '/api/stream') return stream(req, res, url);
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return send(res, 404, { error: 'not found' });
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    send(res, 200, await route(body && typeof body === 'object' ? body : {}, req));
  } catch (e) {
    const err = e as Error & { status?: number };
    send(res, err.status || 400, { error: err.message });
  }
});
server.listen(PORT, () => console.log(`Zonar running on http://localhost:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    store.flush(matches.values());
    server.close();
    builder?.close();
    await Promise.allSettled([chain.close(), ...[...matches.values()].map((m) => m.vaultWallet?.close())]);
    process.exit(0);
  });
}
