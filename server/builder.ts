// Runs and talks to deaddrop-builder, the Rust service holding view-only wallets for
// player agents. It builds and proves move transactions; players sign them in the browser.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';

export type Balance = { spendable_zats: number; total_zats: number; pending_zats: number; chain_tip: number };

export class Builder {
  private url: string;
  private proc?: ChildProcess;
  private closing = false;

  constructor({ bin, dir, port = 7071, lightwalletd, log = console.log }: { bin: string; dir: string; port?: number; lightwalletd: string; log?: (...a: unknown[]) => void }) {
    this.url = `http://127.0.0.1:${port}`;
    fs.mkdirSync(dir, { recursive: true });
    const start = (delay: number) => {
      const proc = spawn(bin, [], {
        env: { ...process.env, BUILDER_DIR: dir, BUILDER_PORT: String(port), BUILDER_LIGHTWALLETD: lightwalletd, RUST_LOG: 'info' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.proc = proc;
      const forward = (d: Buffer) => d.toString().trim().split('\n').forEach((l) => log(`[builder] ${l.replace(/^\S+\s+/, '')}`));
      proc.stdout?.on('data', forward);
      proc.stderr?.on('data', forward);
      proc.on('exit', (code) => {
        if (this.closing) return;
        log(`[builder] exited (${code}); restarting in ${delay / 1000}s`);
        setTimeout(() => start(Math.min(delay * 2, 60_000)), delay);
      });
    };
    start(2000);
  }

  static available(bin: string) {
    return fs.existsSync(bin);
  }

  async #call<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('the transaction builder is starting up; try again in a moment');
    }
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) throw new Error(data.error || `builder ${res.status}`);
    return data;
  }

  register(a: { id: string; ufvk: string; seed_fingerprint: string; account_index: number }) {
    return this.#call<{ ok: boolean }>('POST', '/accounts', a);
  }

  addresses(id: string, count: number) {
    return this.#call<{ addresses: string[] }>('POST', `/accounts/${id}/addresses`, { count }).then((r) => r.addresses);
  }

  balance(id: string) {
    return this.#call<Balance>('GET', `/accounts/${id}/balance`);
  }

  build(id: string, to: string, memo: string) {
    return this.#call<{ build_id: string; pczt: string }>('POST', `/accounts/${id}/build`, { to, memo });
  }

  submit(buildId: string, signed: string) {
    return this.#call<{ txid: string }>('POST', `/builds/${buildId}/submit`, { signed }).then((r) => r.txid);
  }

  cancel(buildId: string) {
    return this.#call('POST', `/builds/${buildId}/cancel`).catch(() => {});
  }

  close() {
    this.closing = true;
    this.proc?.kill();
  }
}
