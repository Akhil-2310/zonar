// End-to-end on Zcash testnet: two browsers, each with a virtual passkey (Chrome's
// WebAuthn test authenticator, with PRF), create agent wallets through the real UI,
// play a head-to-head match where every move is a signed shielded transaction, and the
// winner claims the vault into their own agent wallet.
//
//   npm run dev                         # testnet server with the builder
//   node test/e2e/onchain.e2e.ts        # BASE=http://localhost:3000 by default
//
// Takes several minutes: refills and the claim wait for blocks (~75s each).
import { chromium, type BrowserContext, type Page } from 'playwright';
import { candidates, dist, same, DIRS } from '../../lib/belief.ts';
import type { ActionId, Dir, GameView, Pos } from '../../lib/types.ts';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const HEADLESS = process.env.HEADED !== '1';
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 600_000, everyMs = 2000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(everyMs);
  }
}

async function player(ctx: BrowserContext, label: string): Promise<Page> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`${label} page error:`, e.message));
  page.on('console', (m) => m.type() === 'error' && log(`${label} console:`, m.text()));
  // A per-browser virtual passkey device with PRF, approving every prompt automatically.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });
  return page;
}

async function createAgent(page: Page, codename: string, avatar: string) {
  await page.goto(`${BASE}/play`);
  await page.getByRole('button', { name: new RegExp(avatar, 'i') }).first().click();
  await page.getByRole('textbox').first().fill(codename);
  await page.getByRole('button', { name: 'Create agent with a passkey' }).click();
  await page.getByText('passkey-locked').waitFor({ timeout: 120_000 });
  log(`${codename}: agent created`);
  const moves = await until(
    `${codename}'s refill to confirm`,
    async () => {
      const n = Number(await page.locator('span.font-mono.text-2xl').first().textContent({ timeout: 1000 }).catch(() => '0'));
      return n >= 12 ? n : null;
    },
    900_000,
    5000,
  );
  log(`${codename}: ${moves} on-chain moves funded`);
}

async function viewOf(page: Page, matchId: string): Promise<GameView> {
  const token = await page.evaluate((id) => localStorage.getItem('deaddrop:' + id), matchId);
  const res = await fetch(`${BASE}/api/stream?matchId=${matchId}&token=${token}`);
  const reader = res.body!.getReader();
  let buf = '';
  while (!buf.includes('\n\n')) buf += new TextDecoder().decode((await reader.read()).value);
  await reader.cancel();
  return JSON.parse(buf.slice(buf.indexOf('data: ') + 6, buf.indexOf('\n\n'))) as GameView;
}

// The hunter plays from its own intel only, like the bot.
function hunterOrders(v: GameView): { move: Dir; action: ActionId } {
  const ok = (d: Dir) => {
    const p = { x: v.you.pos.x + d.dx, y: v.you.pos.y + d.dy };
    return p.x >= 0 && p.y >= 0 && p.x < v.size && p.y < v.size;
  };
  const toward = (t: Pos) =>
    DIRS.filter(ok).reduce((best, d) => (dist({ x: v.you.pos.x + d.dx, y: v.you.pos.y + d.dy }, t) < dist({ x: v.you.pos.x + best.dx, y: v.you.pos.y + best.dy }, t) ? d : best));
  if (v.you.carrying) return { move: toward(v.you.home), action: 'none' };
  const c = candidates(v) ?? [];
  const target = c.reduce((b, x) => (dist(v.you.pos, x) < dist(v.you.pos, b) ? x : b), c[0] ?? { x: 2, y: 2 });
  const move = toward(target);
  const next = { x: v.you.pos.x + move.dx, y: v.you.pos.y + move.dy };
  const action: ActionId = (c.length <= 3 && c.some((x) => same(x, next))) || v.you.credits < 1 ? 'dig' : c.length > 6 && v.you.credits > 2 ? 'leak' : 'ping';
  return { move, action };
}

const KEYS = 'qweasdzxc';
const ACTION_KEY: Record<ActionId, string> = { none: '1', dig: '2', ping: '3', leak: '4', viewkey: '5', chaff: '6' };

// Seals one move through the UI: keyboard shortcuts, then the sign-and-send button.
async function seal(page: Page, o: { move: Dir; action: ActionId }) {
  await page.keyboard.press(KEYS[(o.move.dy + 1) * 3 + (o.move.dx + 1)]);
  await page.keyboard.press(ACTION_KEY[o.action]);
  await page.getByRole('button', { name: 'Sign & send move' }).click();
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const [ctxA, ctxB] = [await browser.newContext(), await browser.newContext()];
  const [a, b] = [await player(ctxA, 'A'), await player(ctxB, 'B')];

  await Promise.all([createAgent(a, 'NIGHTJAR', 'Relay'), createAgent(b, 'SENTRY', 'Cipher')]);

  await a.getByRole('button', { name: /Private match/ }).click();
  await a.waitForURL(/\/play\/[0-9A-F]{6}$/);
  const matchId = a.url().split('/').pop()!;
  log(`A created match ${matchId}`);
  await b.goto(`${BASE}/play?join=${matchId}`);
  await b.getByRole('button', { name: 'Join' }).click();
  await b.waitForURL(new RegExp(`/play/${matchId}$`));
  log('B joined');

  let v = await viewOf(a, matchId);
  if (!v.onchain.enabled) throw new Error('match did not go on-chain');
  log(`on-chain match, ${v.chain.mode} mode${v.chain.mode === 'prize' ? ` (${v.chain.prizeZat} zat vault)` : ''}`);

  for (let turn = 1; v.phase === 'active'; turn = v.turn) {
    const tTurn = Date.now();
    await Promise.all([seal(a, hunterOrders(v)), seal(b, { move: { dx: 0, dy: 0 }, action: 'none' })]);
    v = await until(`turn ${turn} to resolve`, async () => {
      const next = await viewOf(a, matchId);
      return next.turn !== turn || next.phase !== 'active' ? next : null;
    }, 180_000, 1000);
    const txs = v.onchain.moves.filter((m) => m.turn === turn).map((m) => `${m.seat}:${m.txid.slice(0, 10)}`);
    log(`turn ${turn} resolved in ${((Date.now() - tTurn) / 1000).toFixed(1)}s, txs ${txs.join(' ')}${v.you.carrying ? ' (A carrying)' : ''}`);
  }
  log(`match over: ${v.result?.reason}, winner seat ${v.result?.winner}, ${v.onchain.moves.length} on-chain moves`);

  const verified = await a.getByText(/on-chain moves: each signed by its agent/).textContent({ timeout: 30_000 });
  log(`A's browser: ${verified}`);
  const verifiedB = await b.getByText(/on-chain moves: each signed by its agent/).textContent({ timeout: 30_000 });
  log(`B's browser: ${verifiedB}`);

  if (v.result?.winner === 0 && v.chain.mode === 'prize') {
    await a.getByRole('button', { name: 'Claim into my agent wallet' }).click();
    log('A claimed into its agent wallet');
    const swept = await until('the sweep', async () => {
      const next = await viewOf(a, matchId);
      if (next.chain.sweep?.status === 'failed') throw new Error(next.chain.sweep.error);
      return next.chain.sweep?.status === 'sent' ? next.chain.sweep.txid : null;
    }, 1_200_000, 10_000);
    log(`vault swept into A's agent: ${swept}`);
  }
  await browser.close();
  log('done');
}

main().catch((e) => {
  log('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
