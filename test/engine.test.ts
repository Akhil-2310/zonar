import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, addPlayer, submitOrders, viewFor, forfeit, expire, SAFEHOUSES, MAX_TURNS, type Match } from '../server/engine.ts';
import { candidates } from '../lib/belief.ts';
import { botOrders } from '../server/bot.ts';
import { MockLedger, firstJSON } from '../server/ledger.ts';
import { Chain, PRIZE_ZAT, type ChainMatch } from '../server/chain.ts';
import { PrizePolicy, type PolicyConfig } from '../server/policy.ts';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { audit, dropFrom, houseCommitment, same } from '../lib/rules.ts';
import os from 'node:os';
import path from 'node:path';
import type { ActionId, OrdersInput, Pos } from '../lib/types.ts';

const stay: OrdersInput = { move: { dx: 0, dy: 0 }, action: 'none' };
const step = (dx: number, dy: number, action: ActionId = 'none', target?: Pos): OrdersInput => ({ move: { dx, dy }, action, target });
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// A match with a funded prize vault, as the server starts one when both seats fill.
function prize(chain: Chain, m: Match): ChainMatch {
  const cm = chain.pending(m);
  chain.start(cm, { prizeZat: PRIZE_ZAT });
  return cm;
}

function setup(drop: Pos = { x: 3, y: 2 }): Match {
  const m = createMatch('TEST');
  addPlayer(m, { name: 'A' });
  addPlayer(m, { name: 'B' });
  m.drop = drop;
  return m;
}

test('the drop comes from the house secret and both players\' entropy, and only exists once both join', () => {
  const m = createMatch('X1');
  assert.equal(m.commitment, houseCommitment('X1', m.salt));
  const [e0, e1] = ['a'.repeat(64), 'b'.repeat(64)];
  addPlayer(m, { name: 'A', entropy: e0 });
  assert.deepEqual(m.drop, { x: -1, y: -1 }, 'no drop while waiting');
  addPlayer(m, { name: 'B', entropy: e1 });
  assert.deepEqual(m.entropy, [e0, e1]);
  assert.deepEqual(m.drop, dropFrom('X1', m.salt, [e0, e1]));
  // Changing either player's entropy moves the drop somewhere (across many secrets).
  let moved = 0;
  for (let i = 0; i < 50; i++) {
    const s = String(i).padStart(64, '0');
    if (!same(dropFrom('X1', s, [e0, e1]), dropFrom('X1', s, [e0, 'c'.repeat(64)]))) moved++;
  }
  assert.ok(moved > 30);
});

test('a finished match replays in the browser audit: every clue, the chain, the drop', () => {
  for (let k = 0; k < 40; k++) {
    const m = createMatch('R' + k);
    const mine = crypto.randomBytes(32).toString('hex');
    addPlayer(m, { name: 'A', entropy: mine });
    addPlayer(m, { name: 'B', isBot: true });
    while (m.phase === 'active') {
      for (const seat of [0, 1] as const) submitOrders(m, seat, botOrders(viewFor(m, seat)));
    }
    for (const seat of [0, 1] as const) {
      const v = viewFor(m, seat);
      const r = v.result!;
      const a = audit({ matchId: m.id, commitment: v.commitment, chainHead: v.chainHead, drop: r.drop, salt: r.salt, entropy: r.entropy, transcript: r.transcript, result: r }, seat, v.intel, seat === 0 ? mine : null);
      assert.deepEqual(a, { commitment: true, drop: true, myEntropy: seat === 0 ? true : null, chain: true, clues: true, clueCount: v.intel.length, firstBadTurn: null, outcome: true });
    }
  }
});

test('the audit catches a server that lies', () => {
  const m = setup({ x: 3, y: 3 });
  m.drop = dropFrom(m.id, m.salt, m.entropy!);
  submitOrders(m, 0, step(1, 1, 'ping'));
  submitOrders(m, 1, stay);
  submitOrders(m, 0, step(1, 1, 'leak'));
  submitOrders(m, 1, stay);
  forfeit(m, 1);
  const v = viewFor(m, 0);
  const r = v.result!;
  const reveal = { matchId: m.id, commitment: v.commitment, chainHead: v.chainHead, drop: r.drop, salt: r.salt, entropy: r.entropy, transcript: r.transcript, result: r };
  assert.equal(audit(reveal, 0, v.intel).clues, true);
  // A doctored leak distance.
  const forged = v.intel.map((e) => (e.type === 'leak' ? { ...e, distance: e.distance + 1 } : e));
  assert.deepEqual([audit(reveal, 0, forged).clues, audit(reveal, 0, forged).firstBadTurn], [false, 2]);
  // A drop moved after the fact.
  const moved = { ...reveal, drop: { x: r.drop.x === 2 ? 3 : 2, y: r.drop.y } };
  assert.equal(audit(moved, 0, v.intel).drop, false);
  // Entropy swapped for a value the house liked better.
  assert.equal(audit(reveal, 0, v.intel, 'f'.repeat(64)).myEntropy, false);
  // A rewritten turn.
  const t = structuredClone(r.transcript);
  t[0].orders[0].action = 'none';
  assert.equal(audit({ ...reveal, transcript: t }, 0, v.intel).chain, false);
});

test('7×7 city: the drop is always in the vault district, which is fair to both safehouses', async () => {
  const { VAULT_DISTRICT, inVaultDistrict, districtArea, districtOf } = await import('../lib/city.ts');
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const m = createMatch('V' + i);
    addPlayer(m, { name: 'A' });
    addPlayer(m, { name: 'B' });
    assert.ok(inVaultDistrict(m.drop), `drop ${m.drop.x},${m.drop.y} outside the vault district`);
    seen.add(`${m.drop.x},${m.drop.y}`);
  }
  assert.equal(seen.size, 9, 'every vault tile gets used');
  assert.deepEqual(SAFEHOUSES, [{ x: 0, y: 0 }, { x: 6, y: 6 }]);
  // Mirror symmetry: each vault tile has a twin that is as far from the other safehouse.
  const d = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const tiles = [...seen].map((s) => ({ x: Number(s.split(',')[0]), y: Number(s.split(',')[1]) }));
  const sumA = tiles.reduce((n, t) => n + d(t, SAFEHOUSES[0]), 0);
  const sumB = tiles.reduce((n, t) => n + d(t, SAFEHOUSES[1]), 0);
  assert.equal(sumA, sumB);
  assert.equal(d({ x: 3, y: 3 }, SAFEHOUSES[0]), d({ x: 3, y: 3 }, SAFEHOUSES[1]), 'D4 is the true centre');
  // Districts are 2-3-2 bands; a leak flashes the whole district.
  assert.deepEqual(districtArea({ x: 3, y: 4 }), VAULT_DISTRICT);
  assert.deepEqual(districtArea({ x: 6, y: 0 }), { x: 5, y: 0, w: 2, h: 2 });
  assert.deepEqual(districtArea({ x: 0, y: 3 }), { x: 0, y: 2, w: 2, h: 3 });
  assert.equal(districtOf({ x: 3, y: 3 }), 'Halo Spire');
});

test('turn resolves only when both lock in, and spends hidden credits', () => {
  const m = setup();
  assert.equal(submitOrders(m, 0, step(1, 1, 'ping')), null);
  assert.equal(m.turn, 1);
  submitOrders(m, 1, stay);
  assert.equal(m.turn, 2);
  assert.equal(m.players[0].credits, 11);
  assert.deepEqual(m.players[0].intel.at(-1), { turn: 1, type: 'ping', at: { x: 1, y: 1 }, reading: 'Faint' });
  assert.equal(viewFor(m, 1).rival?.pos, undefined);
});

test('leak and chaff produce identical flashes for the rival', () => {
  const m = setup();
  submitOrders(m, 0, step(1, 0, 'leak'));
  submitOrders(m, 1, step(0, 0, 'chaff', { x: 0, y: 1 }));
  const [fromLeak] = m.players[1].intel.filter((e) => e.type === 'flash');
  const [fromChaff] = m.players[0].intel.filter((e) => e.type === 'flash');
  assert.deepEqual(Object.keys(fromLeak), Object.keys(fromChaff));
  assert.ok(fromLeak.type === 'flash');
  assert.deepEqual(fromLeak.region, { x: 0, y: 0, w: 2, h: 2 });
});

test('dig, exposure every other turn, steal on collision, extraction win', () => {
  const m = setup({ x: 2, y: 2 });
  submitOrders(m, 0, step(1, 1));
  submitOrders(m, 1, step(-1, -1)); // B on 5,5
  submitOrders(m, 0, step(1, 1, 'dig')); // A on 2,2 digs
  submitOrders(m, 1, step(-1, -1)); // B on 4,4
  assert.equal(m.carrier, 0);
  assert.ok(m.players[1].intel.some((e) => e.type === 'rivalPickup'));
  assert.ok(m.players[1].intel.some((e) => e.type === 'rivalSeen' && e.turn === 2));
  submitOrders(m, 0, stay);
  submitOrders(m, 1, step(-1, -1)); // B on 3,3
  submitOrders(m, 0, stay);
  submitOrders(m, 1, step(-1, -1)); // B steps onto A: steal
  assert.equal(m.carrier, 1);
  assert.ok(m.players[0].intel.some((e) => e.type === 'collision' && e.stolen));
  for (let i = 0; i < 4; i++) {
    submitOrders(m, 0, stay);
    submitOrders(m, 1, step(1, 1));
  }
  assert.equal(m.phase, 'over');
  assert.deepEqual(m.result, { winner: 1, reason: 'extracted' });
});

test('draw after max turns', () => {
  const m = setup();
  for (let i = 0; i < MAX_TURNS; i++) {
    submitOrders(m, 0, stay);
    submitOrders(m, 1, stay);
  }
  assert.equal(m.phase, 'over');
  assert.equal(m.result?.winner, null);
});

test('rejects illegal orders', () => {
  const m = setup();
  assert.throws(() => submitOrders(m, 0, step(-1, 0)), /leaves the grid/);
  assert.throws(() => submitOrders(m, 0, step(0, 0, 'viewkey', { x: 6, y: 6 })), /2×2/);
  m.players[0].credits = 0;
  assert.throws(() => submitOrders(m, 0, step(0, 0, 'ping')), /credits/);
});

test('belief never rules out the true drop', () => {
  for (let k = 0; k < 50; k++) {
    const m = setup();
    for (let i = 0; i < 6 && m.phase === 'active'; i++) {
      submitOrders(m, 0, botOrders(viewFor(m, 0)));
      if (m.phase === 'active') submitOrders(m, 1, botOrders(viewFor(m, 1)));
      const c = candidates(viewFor(m, 0));
      if (c) assert.ok(c.some((t) => t.x === m.drop.x && t.y === m.drop.y));
    }
  }
});

test('bot vs bot matches always terminate', () => {
  const outcomes: Record<string, number> = { 0: 0, 1: 0, null: 0 };
  for (let k = 0; k < 200; k++) {
    const m = createMatch('B' + k);
    addPlayer(m, { name: 'A' });
    addPlayer(m, { name: 'B' });
    while (m.phase === 'active') {
      submitOrders(m, 0, botOrders(viewFor(m, 0)));
      if (m.phase === 'active') submitOrders(m, 1, botOrders(viewFor(m, 1)));
    }
    outcomes[String(m.result?.winner)]++;
  }
  console.log('bot vs bot outcomes', outcomes);
});

test('neither seat is favoured: 3,000 bot games split close to evenly', () => {
  const wins = [0, 0];
  for (let k = 0; k < 3000; k++) {
    const m = createMatch('S' + k);
    addPlayer(m, { name: 'A' });
    addPlayer(m, { name: 'B' });
    while (m.phase === 'active') {
      submitOrders(m, 0, botOrders(viewFor(m, 0)));
      if (m.phase === 'active') submitOrders(m, 1, botOrders(viewFor(m, 1)));
    }
    if (m.result?.winner != null) wins[m.result.winner]++;
  }
  const share = wins[0] / (wins[0] + wins[1]);
  assert.ok(share > 0.46 && share < 0.54, `seat 0 won ${(share * 100).toFixed(1)}%`);
});

test('chain: vault funded, turns anchored, winner claims, draws refund (mock ledger)', async () => {
  const ledger = new MockLedger();
  const chain = new Chain(ledger, { onUpdate: () => {}, log: () => {}, retryMs: 10 });

  const m = prize(chain, setup({ x: 2, y: 2 }));
  await tick();
  assert.equal(m.chain.vault.status, 'funded');
  submitOrders(m, 0, stay);
  submitOrders(m, 1, stay);
  chain.anchor(m);
  await tick();
  assert.equal(m.chain.anchors.at(-1)?.head, m.chainHead);
  assert.match(ledger.txs.at(-1)?.memo ?? '', /DEADDROP #TEST T1 [0-9a-f]{64}/);
  assert.equal(ledger.txs.at(-1)?.zat, 0, 'anchors carry no value, so nothing becomes dust');

  m.phase = 'over';
  m.result = { winner: 0, reason: 'extracted' };
  await chain.settle(m);
  assert.equal(m.vaultSeed?.seed.split(' ').length, 24);
  await assert.rejects(chain.claim(m, 'not-an-address', 'x'), /testnet address/);
  const payout = 'utest1' + 'q'.repeat(60);
  await chain.claim(m, payout, 'DEADDROP RELIC');
  await tick();
  assert.equal(m.chain.sweep?.status, 'sent');
  assert.equal(ledger.balances.get(payout), PRIZE_ZAT - 10_000);

  const d = prize(chain, setup());
  await tick();
  d.phase = 'over';
  d.result = { winner: null, reason: 'timeout' };
  await chain.settle(d);
  assert.equal(d.chain.refund?.status, 'sent');
  assert.equal(d.vaultSeed, undefined);
});

test('chain: sweep waits for in-flight anchors and leaves the vault empty', async () => {
  const ledger = new MockLedger();
  const chain = new Chain(ledger, { onUpdate: () => {}, log: () => {}, retryMs: 10 });
  const house = ledger.house();
  const send = house.send;
  const m = prize(chain, setup({ x: 2, y: 2 }));
  await tick();
  // From here on the house is slow, like a testnet send waiting on its change note.
  house.send = async (rs) => (await tick(150), send(rs));
  submitOrders(m, 0, stay);
  submitOrders(m, 1, stay);
  chain.anchor(m);
  m.phase = 'over';
  m.result = { winner: 0, reason: 'extracted' };
  await chain.settle(m);
  const payout = 'utest1' + 'w'.repeat(60);
  await chain.claim(m, payout, 'DEADDROP RELIC');
  const sweepStatus = () => m.chain.sweep?.status;
  assert.equal(sweepStatus(), 'confirming', 'holds while the anchor is still in flight');
  for (let i = 0; i < 100 && sweepStatus() !== 'sent'; i++) await tick(10);
  assert.equal(sweepStatus(), 'sent');
  const sweepTx = ledger.txs.findIndex((t) => t.to === payout);
  const anchorTx = ledger.txs.findIndex((t) => /T1 /.test(t.memo || ''));
  assert.ok(anchorTx >= 0 && anchorTx < sweepTx, 'anchor lands before the sweep');
  assert.equal(ledger.balances.get(payout), PRIZE_ZAT - 10_000);
  assert.equal(ledger.balances.get(m.chain.vault.address!), 0, 'vault left empty');
});

test('firstJSON ignores trailing wallet chatter', () => {
  assert.deepEqual(firstJSON('noise\n{\n  "spendable_balance": 5,\n  "m": "a}b\\"c"\n}\nSync complete.\n{"x":1}'), { spendable_balance: 5, m: 'a}b"c' });
  assert.deepEqual(firstJSON('[{"a":[1,2]}] trailing'), [{ a: [1, 2] }]);
});

test('vault wallet processes run only while a step needs them; the seed is persisted', async () => {
  const ledger = new MockLedger();
  const chain = new Chain(ledger, { onUpdate: () => {}, log: () => {}, retryMs: 10 });
  const m = prize(chain, setup({ x: 2, y: 2 }));
  await tick();
  assert.equal(m.chain.vault.status, 'funded');
  assert.equal(m.vaultWallet, undefined, 'closed once funded: anchors come from the house');
  submitOrders(m, 0, stay);
  submitOrders(m, 1, stay);
  chain.anchor(m);
  await tick();
  assert.equal(m.vaultWallet, undefined, 'anchoring never opens the vault');
  m.phase = 'over';
  m.result = { winner: 0, reason: 'extracted' };
  await chain.settle(m);
  assert.equal(m.vaultWallet, undefined, 'closed after settlement');
  assert.ok(JSON.parse(JSON.stringify(m)).vaultSeed?.seed, 'seed survives a restart');
  assert.equal(JSON.parse(JSON.stringify(m)).vaultWallet, undefined, 'live process never serialised');
});

test('practice matches move no money and cannot be claimed', async () => {
  const ledger = new MockLedger();
  const chain = new Chain(ledger, { onUpdate: () => {}, log: () => {}, retryMs: 10 });
  const m = chain.pending(setup());
  chain.start(m, { prizeZat: 0, note: 'practice' });
  submitOrders(m, 0, stay);
  submitOrders(m, 1, stay);
  chain.anchor(m);
  await tick();
  assert.equal(m.chain.mode, 'practice');
  assert.equal(ledger.txs.length, 0);
  m.phase = 'over';
  m.result = { winner: 0, reason: 'extracted' };
  await chain.settle(m);
  await assert.rejects(chain.claim(m, 'utest1' + 'q'.repeat(60), 'x'), /practice/);
});

test('prize policy: bots practice, one person cannot farm, caps hold', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'policy-')), 'p.json');
  const cfg: PolicyConfig = { prizeZat: 100, botPrizeZat: 0, dailyBudgetZat: 300, perPlayerDaily: 2, allowSameIp: false };
  const pol = new PrizePolicy(file, cfg);
  assert.equal(pol.decide({ vsBot: true, ips: ['1.1.1.1'] }).prizeZat, 0);
  assert.equal(pol.decide({ vsBot: false, ips: ['1.1.1.1', '1.1.1.1'] }).prizeZat, 0, 'same network');
  assert.equal(pol.decide({ vsBot: false, ips: ['1.1.1.1', '2.2.2.2'] }).prizeZat, 100);
  assert.equal(pol.decide({ vsBot: false, ips: ['1.1.1.1', '3.3.3.3'] }).prizeZat, 100);
  assert.match(pol.decide({ vsBot: false, ips: ['1.1.1.1', '4.4.4.4'] }).note ?? '', /limit/, 'per-player cap');
  assert.equal(pol.decide({ vsBot: false, ips: ['5.5.5.5', '6.6.6.6'] }).prizeZat, 100);
  assert.match(pol.decide({ vsBot: false, ips: ['7.7.7.7', '8.8.8.8'] }).note ?? '', /budget/, 'daily budget');
  assert.equal(pol.prizeMatchesLeftToday(), 0);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('1.1.1.1'), 'raw IPs never hit disk');
  const withBotPrize = new PrizePolicy(file + '2', { ...cfg, botPrizeZat: 10 });
  assert.equal(withBotPrize.decide({ vsBot: true, ips: ['9.9.9.9'] }).prizeZat, 10);
});

test('abandoned and expired matches end cleanly', () => {
  const m = setup();
  forfeit(m, 1, 'abandoned');
  assert.deepEqual(m.result, { winner: 0, reason: 'abandoned' });
  const w = createMatch('W1');
  addPlayer(w, { name: 'A' });
  expire(w);
  assert.equal(w.phase, 'over');
  assert.deepEqual(w.result, { winner: null, reason: 'expired' });
});

test('signed move memos: verify, and any change to orders or signer is caught', async () => {
  const { ed25519 } = await import('@noble/curves/ed25519');
  const { memoBody, signMemo, memoMatches } = await import('../lib/moves.ts');
  const key = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(key);
  const orders = step(1, -1, 'viewkey', { x: 2, y: 3 });
  const memo = signMemo(memoBody('M1', 4, 1, orders), key);
  assert.ok(new TextEncoder().encode(memo).length <= 512, 'fits a Zcash memo');
  assert.ok(memoMatches(memo, pub, 'M1', 4, 1, orders));
  assert.ok(!memoMatches(memo, pub, 'M1', 4, 1, step(1, -1, 'dig')), 'different orders');
  assert.ok(!memoMatches(memo, pub, 'M1', 5, 1, orders), 'replayed into another turn');
  assert.ok(!memoMatches(memo.replace('viewkey', 'leak'), pub, 'M1', 4, 1, step(1, -1, 'leak', { x: 2, y: 3 })), 'edited memo');
  assert.ok(!memoMatches(memo, ed25519.getPublicKey(ed25519.utils.randomPrivateKey()), 'M1', 4, 1, orders), 'wrong agent');
});

test('agent refills are capped per player and by a daily budget', async () => {
  const { DripPolicy } = await import('../server/policy.ts');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'drip-')), 'd.json');
  const d = new DripPolicy(file, { perPlayerDaily: 2, dailyBudgetZat: 500 });
  assert.equal(d.grant('1.1.1.1', 200), null);
  assert.equal(d.grant('1.1.1.1', 200), null);
  assert.match(d.grant('1.1.1.1', 200) ?? '', /refills/);
  assert.match(d.grant('2.2.2.2', 200) ?? '', /budget/);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('1.1.1.1'));
});
