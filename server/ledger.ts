// Wallet backends. ZingoLedger drives real zingo-cli light-client processes on
// Zcash testnet; MockLedger is an in-memory stand-in for tests and offline development.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RecoveryInfo } from '../lib/types.ts';

export const ZAT = 100_000_000;

export type Recipient = { address: string; zat: number; memo?: string };
// A value transfer that carried a memo, as the wallet reports it.
export type Transfer = { txid: string; kind: string; value: number; status: string; memos: string[] };
type Log = (...args: unknown[]) => void;

// Everything the game needs from a wallet.
export interface Wallet {
  address(): Promise<string>;
  transparentAddress(): Promise<string>;
  shieldTransparent(): Promise<string | null>;
  spendable(): Promise<number>;
  send(recipients: Recipient[]): Promise<string>;
  sendAll(address: string, memo: string): Promise<string>;
  recoveryInfo(): Promise<RecoveryInfo>;
  ufvk(): Promise<string>;
  transfers(): Promise<Transfer[]>;
  clearFailed(): Promise<number>;
  close(): Promise<void>;
}

export interface Ledger {
  network: 'testnet' | 'mock';
  explorer: string | null;
  house(): Wallet;
  newVault(matchId: string): Wallet;
}

// ---------------------------------------------------------------- zingo-cli

const SENTINEL_CMD = 'version';
type RawOpts = { fenced?: boolean; timeoutMs?: number };

class ZingoWallet implements Wallet {
  private bin: string;
  private dataDir: string;
  private server: string;
  private log: Log;
  private queue: Promise<unknown> = Promise.resolve();
  private closing = false;
  private restarts = 0;
  private buf = '';
  private waiter: (() => void) | null = null;
  private fail: ((e: Error) => void) | null = null;
  private proc!: ChildProcessWithoutNullStreams;
  private exited!: Promise<unknown>;
  version!: Promise<string>;

  constructor({ bin, dataDir, server, log = () => {} }: { bin: string; dataDir: string; server: string; log?: Log }) {
    this.bin = bin;
    this.dataDir = dataDir;
    this.server = server;
    this.log = log;
    fs.mkdirSync(dataDir, { recursive: true });
    this.#spawn();
  }

  // A crashed or refused CLI (e.g. the wallet file still held by a previous
  // server's process) is restarted with backoff instead of hanging every command.
  #spawn() {
    this.buf = '';
    this.waiter = null;
    this.fail = null;
    const proc = spawn(this.bin, ['--chain', 'testnet', '--data-dir', this.dataDir, '--server', this.server, '--log-file', path.join(this.dataDir, 'cli.log')], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc = proc;
    proc.stdout.on('data', (d: Buffer) => this.#onData(d));
    proc.stderr.on('data', (d: Buffer) => this.#onData(d));
    proc.stdin.on('error', () => {});
    this.exited = new Promise((r) => proc.on('exit', r));
    proc.on('exit', (code) => {
      if (this.proc !== proc) return;
      const tail = this.buf.trim().split('\n').slice(-2).join(' | ');
      this.fail?.(new Error(`zingo-cli exited (${code})${tail ? ': ' + tail : ''}`));
      if (this.closing) return;
      const delay = Math.min(60_000, 3000 * 2 ** this.restarts++);
      this.log(`zingo-cli for ${path.basename(this.dataDir)} exited (${code}); restarting in ${delay / 1000}s`);
      setTimeout(() => this.#spawn(), delay);
    });
    // Going online through the mixnet can take minutes. If even that budget runs out, the process is
    // wedged: kill it so the exit handler restarts it, rather than failing every command forever.
    this.version = this.#raw(SENTINEL_CMD, { fenced: false, timeoutMs: 5 * 60_000 }).then((out) => {
      this.restarts = 0;
      return out.match(/zl_[\w.]+/)![0];
    });
    this.version.catch(() => {
      if (this.proc === proc && proc.exitCode === null) proc.kill();
    });
  }

  #onData(d: Buffer) {
    this.buf += d.toString();
    this.waiter?.();
  }

  // Write a command, then the sentinel; everything before the sentinel's echo is the command's output.
  #raw(cmd: string, { fenced = true, timeoutMs = 120_000 }: RawOpts = {}): Promise<string> {
    const proc = this.proc;
    const run = () =>
      new Promise<string>((resolve, reject) => {
        if (this.proc !== proc || proc.exitCode !== null) return reject(new Error('zingo-cli is restarting'));
        const start = this.buf.length;
        const finish = <T>(fn: (v: T) => void, v: T) => {
          clearTimeout(timer);
          this.waiter = this.fail = null;
          fn(v);
        };
        const timer = setTimeout(() => finish(reject, new Error(`zingo-cli timed out on "${cmd.split(' ')[0]}"`)), timeoutMs);
        this.fail = (e) => finish(reject, e);
        this.waiter = async () => {
          const fence = fenced ? await this.version : null;
          const out = this.buf.slice(start);
          const done = fence ? out.includes(fence) : /zl_[\w.]+/.test(out);
          if (done) finish(resolve, fence ? out.slice(0, out.lastIndexOf(fence)) : out);
        };
        proc.stdin.write(fenced ? `${cmd}\n${SENTINEL_CMD}\n` : `${cmd}\n`);
      });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async cmd(cmd: string, opts?: RawOpts): Promise<string> {
    await this.version;
    const out = await this.#raw(cmd, opts);
    const err = out.match(/^Error: (.*(?:\n(?:caused by|\s).*)*)/m);
    if (err) throw new Error(err[1].replace(/\s+/g, ' ').trim());
    return out;
  }

  async json<T = any>(cmd: string): Promise<T> {
    return firstJSON(await this.cmd(cmd)) as T;
  }

  async waitSynced({ timeoutMs = 10 * 60_000 } = {}): Promise<number> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const { height } = await this.json<{ height: number }>('height');
      const s = await this.json<{ scan_ranges: { priority: string; end_block: string }[] }>('sync status').catch(() => null);
      const scanned = !!s?.scan_ranges.length && s.scan_ranges.every((r) => r.priority === 'Scanned' && Number(r.end_block) >= height);
      if (height > 0 && scanned) return height;
      if (Date.now() > until) throw new Error('wallet sync timed out');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  async address() {
    return (await this.json<{ encoded_address: string }[]>('addresses'))[0].encoded_address;
  }

  // Value transfers that carry memos, both directions. (`messages` prints JSON; `value_transfers` prints a text dump.)
  async transfers(): Promise<Transfer[]> {
    await this.waitSynced();
    const data = await this.json<Transfer[] | { value_transfers?: Transfer[] }>('messages');
    return Array.isArray(data) ? data : (data.value_transfers ?? []);
  }

  // Fallback funding route for faucets that only pay transparent addresses; shielded on arrival.
  async transparentAddress() {
    const list = () => this.json<{ encoded_address: string }[]>('t_addresses');
    const existing = (await list())[0]?.encoded_address;
    if (existing) return existing;
    await this.cmd('new_taddress');
    return (await list())[0].encoded_address;
  }

  async transparentBalance() {
    const out = await this.cmd('balance');
    return Number(out.match(/confirmed_transparent_balance:\s*(\d+)/)?.[1] ?? 0);
  }

  // Move confirmed transparent funds into the shielded pool. Returns a txid or null.
  async shieldTransparent(minZat = 50_000) {
    await this.#beforeSend();
    if ((await this.transparentBalance()) < minZat) return null;
    await this.cmd('shield');
    return this.#confirm();
  }

  async spendable() {
    await this.waitSynced();
    return (await this.json<{ spendable_balance: number }>('spendable_balance')).spendable_balance;
  }

  async #confirm() {
    const out = await this.cmd('confirm', { timeoutMs: 5 * 60_000 });
    const txid = out.match(/[0-9a-f]{64}/);
    if (!txid) throw new Error('no txid in confirm output: ' + out.slice(0, 200));
    return txid[0];
  }

  // A transmission that dies in transit (e.g. a mixnet timeout) leaves a `failed`
  // transaction whose inputs stay locked until it is removed from the wallet.
  async clearFailed() {
    // `transactions` prints a text dump, one `{ txid: … datetime: … status: … }` block per transaction.
    const out = await this.cmd('transactions');
    const failed = [...out.matchAll(/txid: ([0-9a-f]{64})\s*\n\s*datetime:[^\n]*\n\s*status: failed/g)].map((m) => m[1]);
    for (const txid of failed) await this.cmd(`remove_transaction ${txid}`);
    if (failed.length) this.log(`${path.basename(this.dataDir)}: removed ${failed.length} failed transaction(s)`);
    return failed.length;
  }

  async #beforeSend() {
    await this.waitSynced();
    await this.clearFailed().catch((e: Error) => this.log(`clearFailed: ${e.message}`));
  }

  async send(recipients: Recipient[]) {
    await this.#beforeSend();
    const body = recipients.map((r) => ({ address: r.address, amount: r.zat, ...(r.memo ? { memo: safeMemo(r.memo) } : {}) }));
    await this.cmd(`send '${JSON.stringify(body)}'`);
    return this.#confirm();
  }

  async sendAll(address: string, memo: string) {
    await this.#beforeSend();
    await this.cmd(`send_all '${JSON.stringify({ address, memo: safeMemo(memo) })}'`);
    return this.#confirm();
  }

  async recoveryInfo(): Promise<RecoveryInfo> {
    const out = await this.cmd('recovery_info');
    const seed = out.match(/seed[_ ]phrase:?\s*"?([a-z]+(?: [a-z]+){11,23})"?/i)?.[1];
    const birthday = Number(out.match(/birthday:?\s*(\d+)/)?.[1]);
    if (!seed) throw new Error('could not read seed phrase');
    return { seed, birthday };
  }

  async ufvk() {
    return (await this.json<{ ufvk: string }>('export_ufvk')).ufvk;
  }

  async close() {
    this.closing = true;
    try {
      this.proc.stdin.write('quit\n');
    } catch {}
    const t = setTimeout(() => this.proc.kill(), 15_000);
    await this.exited;
    clearTimeout(t);
  }
}

// Background sync messages can land right after a command's JSON, so take only the first complete value.
export function firstJSON(out: string): unknown {
  const start = out.search(/[[{]/);
  if (start < 0) throw new Error('no JSON in zingo-cli output: ' + out.slice(0, 120));
  let depth = 0;
  let inStr = false;
  for (let i = start; i < out.length; i++) {
    const c = out[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) return JSON.parse(out.slice(start, i + 1));
  }
  throw new Error('truncated JSON in zingo-cli output');
}

// Memos travel inside a single-quoted CLI argument as JSON: keep them to safe characters.
const safeMemo = (m: string) => String(m).replace(/[^\w .,:;|#/+=()\-–·]/g, '').slice(0, 500);

export class ZingoLedger implements Ledger {
  network = 'testnet' as const;
  explorer = 'https://testnet.zcashexplorer.app/transactions/';
  private bin: string;
  private server: string;
  private root: string;
  private log: Log;
  private houseWallet?: Wallet;

  constructor({ bin, server, root, log = console.log }: { bin: string; server: string; root: string; log?: Log }) {
    this.bin = bin;
    this.server = server;
    this.root = root;
    this.log = log;
  }

  #open(name: string): Wallet {
    return new ZingoWallet({ bin: this.bin, server: this.server, dataDir: path.join(this.root, name), log: this.log });
  }

  house() {
    return (this.houseWallet ??= this.#open('house'));
  }

  newVault(matchId: string) {
    return this.#open(path.join('vaults', matchId));
  }
}

// ---------------------------------------------------------------- mock

type MockTx = { txid: string; from: string; to: string; zat: number; memo?: string };

export class MockLedger implements Ledger {
  network = 'mock' as const;
  explorer = null;
  balances = new Map<string, number>();
  txs: MockTx[] = [];
  private houseZat: number;
  private houseWallet?: Wallet;

  constructor({ houseZat = 2 * ZAT } = {}) {
    this.houseZat = houseZat;
  }

  #wallet(initialZat = 0): Wallet {
    const address = 'utest1mock' + crypto.randomBytes(24).toString('hex');
    const seed = Array.from({ length: 24 }, () => crypto.randomBytes(3).toString('hex')).join(' ');
    this.balances.set(address, initialZat);
    const balance = () => this.balances.get(address) ?? 0;
    const move = (to: string, zat: number, memo?: string) => {
      const fee = 10_000;
      if (balance() < zat + fee) throw new Error('insufficient spendable balance');
      this.balances.set(address, balance() - zat - fee);
      this.balances.set(to, (this.balances.get(to) ?? 0) + zat);
      const txid = crypto.randomBytes(32).toString('hex');
      this.txs.push({ txid, from: address, to, zat, memo });
      return txid;
    };
    return {
      address: async () => address,
      transparentAddress: async () => 'tmMock' + address.slice(10, 40),
      shieldTransparent: async () => null,
      spendable: async () => balance(),
      send: async (rs) => rs.map((r) => move(r.address, r.zat, r.memo)).at(-1)!,
      sendAll: async (to, memo) => move(to, balance() - 10_000, memo),
      recoveryInfo: async () => ({ seed, birthday: 1 }),
      clearFailed: async () => 0,
      transfers: async () =>
        this.txs
          .filter((t) => t.to === address || t.from === address)
          .map((t) => ({ txid: t.txid, kind: t.to === address ? 'received' : 'sent', value: t.zat, status: 'confirmed', memos: t.memo ? [t.memo] : [] })),
      ufvk: async () => 'uviewtest1mock' + crypto.createHash('sha256').update(seed).digest('hex'),
      close: async () => {},
    };
  }

  house() {
    return (this.houseWallet ??= this.#wallet(this.houseZat));
  }

  // Like a vault's data directory on disk, reopening a match's vault gets the same wallet back.
  #vaults = new Map<string, Wallet>();
  newVault(matchId: string) {
    let w = this.#vaults.get(matchId);
    if (!w) this.#vaults.set(matchId, (w = this.#wallet()));
    return w;
  }
}
