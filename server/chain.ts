// Ties matches to the chain without ever blocking gameplay. Every chain step is
// a background job that updates `match.chain` (public, sent to both players)
// and calls onUpdate so clients see progress.
//
//   pending : a new match waits for its second player; nothing is spent yet
//   start   : the prize policy has spoken: practice matches stop here; prize matches get
//             a fresh vault wallet that the house funds (memo carries the commitment)
//   anchor  : the turn hash chain is written into memos sent to the vault, coalesced to the latest turn
//   settle  : vault viewing key published to both players; seed released to the winner; draws refund the house
//   claim   : winner's one-click sweep of the whole vault to their own address, memo = relic certificate
//   resume  : after a restart, pick every unfinished step back up, checking the vault's own history
//             first so nothing is funded or paid twice
//
// A vault's wallet process runs only while a step needs it (address, funding check,
// settlement, sweep) and is closed afterwards; anchors are sent by the house alone.

import type { ChainState, HouseInfo } from '../lib/types.ts';
import type { Match } from './engine.ts';
import type { Ledger, Recipient, Transfer, Wallet } from './ledger.ts';

export const PRIZE_ZAT = Number(process.env.PRIZE_ZAT) || 1_000_000; // 0.01 TAZ
// Anchors are zero-value notes: just the memo. Any value below the ZIP 317 marginal fee
// (5000 zat) would be dust that send-all skips, stranding it in the vault.
const ANCHOR_ZAT = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Errors worth waiting out: unconfirmed change, wallet restarts, and network/mixnet hiccups.
const TRANSIENT = /insufficient|not enough|spendable|sync|restarting|exited|timed out|transmission|transport|deadline|unavailable/i;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const isTestnetAddress = (a: unknown) => /^(utest1|ztestsapling1|tm)[0-9a-z]{20,}$/i.test(String(a || ''));

// A match once Chain.pending has given it chain state.
export type ChainMatch = Match & { chain: ChainState };
type Where = 'vault' | 'sweep' | 'refund';
// Matches saved before modes existed always had a funded vault.
const isPrize = (m: ChainMatch) => (m.chain.mode ?? 'prize') === 'prize';

export class Chain {
  houseInfo: Omit<HouseInfo, 'botPrizeZat' | 'prizeMatchesLeftToday' | 'agents'>;
  private ledger: Ledger;
  private onUpdate: (match: ChainMatch) => void;
  private log: (...args: unknown[]) => void;
  private retryMs: number;
  private house: Wallet;
  private houseQueue: Promise<unknown> = Promise.resolve();

  constructor(
    ledger: Ledger,
    { onUpdate, log = console.log, retryMs = 20_000 }: { onUpdate: (match: ChainMatch) => void; log?: (...args: unknown[]) => void; retryMs?: number },
  ) {
    this.ledger = ledger;
    this.onUpdate = onUpdate;
    this.log = log;
    this.retryMs = retryMs;
    this.house = ledger.house();
    this.houseInfo = { network: ledger.network, address: null, taddress: null, spendableZat: null, prizeZat: PRIZE_ZAT };
    this.refreshHouse();
    setInterval(() => this.refreshHouse(), 60_000).unref();
  }

  // Wallet processes can restart under us; give a call a few chances before giving up.
  async #retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
    for (let i = 1; ; i++) {
      try {
        return await fn();
      } catch (e) {
        if (i >= tries) throw e;
        await sleep(this.retryMs);
      }
    }
  }

  async refreshHouse() {
    try {
      this.houseInfo.address ??= await this.house.address();
      this.houseInfo.taddress ??= await this.house.transparentAddress();
      // Shielding is a spend, so it goes through the house queue like any other.
      const shielded = await this.#houseJob('shield', () => this.house.shieldTransparent(), { tries: 1 });
      if (shielded) this.log(`house shielded transparent funds ${shielded}`);
      this.houseInfo.spendableZat = await this.house.spendable();
    } catch (e) {
      this.log('house status:', message(e));
    }
  }

  // House wallet operations run one at a time; a spend's change note must confirm before the next.
  #houseJob<T>(label: string, fn: () => Promise<T>, { tries = 45 } = {}): Promise<T> {
    const run = async (): Promise<T> => {
      for (let i = 1; ; i++) {
        try {
          return await fn();
        } catch (e) {
          if (i >= tries || !TRANSIENT.test(message(e))) throw e;
          this.log(`${label}: waiting for spendable house funds (${message(e)})`);
          await sleep(this.retryMs);
        }
      }
    };
    const p = this.houseQueue.then(run, run);
    this.houseQueue = p.catch(() => {});
    return p;
  }

  #fail(match: ChainMatch, where: Where, e: unknown) {
    this.log(`[${match.id}] ${where} failed:`, message(e));
    if (where === 'vault') match.chain.vault = { ...match.chain.vault, status: 'failed', error: message(e) };
    else match.chain[where] = { ...match.chain[where], status: 'failed', error: message(e) };
    this.onUpdate(match);
  }

  pending(match: Match): ChainMatch {
    const m = match as ChainMatch;
    m.chain = {
      mode: 'pending',
      network: this.ledger.network,
      explorer: this.ledger.explorer,
      prizeZat: 0,
      vault: { status: 'none' },
      anchors: [],
      sweep: null,
      refund: null,
      ufvk: null,
    };
    return m;
  }

  // Called once, when the second player arrives and the prize policy has decided.
  // An on-chain match needs a vault for its move memos even when there is no prize.
  start(match: ChainMatch, { prizeZat, note, vault = false }: { prizeZat: number; note?: string; vault?: boolean }) {
    if (prizeZat <= 0) {
      match.chain = { ...match.chain, mode: 'practice', note, prizeZat: 0, vault: { status: vault ? 'creating' : 'none' } };
      this.onUpdate(match);
      if (vault) this.#openUnfunded(match).catch((e) => this.#fail(match, 'vault', e));
      return;
    }
    match.chain = { ...match.chain, mode: 'prize', prizeZat, vault: { status: 'creating' } };
    this.onUpdate(match);
    this.#fund(match).catch((e) => this.#fail(match, 'vault', e));
  }

  #vault(match: Match): Wallet {
    if (!match.vaultWallet) {
      Object.defineProperty(match, 'vaultWallet', { value: this.ledger.newVault(match.id), enumerable: false, configurable: true, writable: true });
    }
    return match.vaultWallet!;
  }

  // Close the vault's wallet process; the next step that needs it opens a fresh one.
  #release(match: Match) {
    const w = match.vaultWallet;
    if (!w) return;
    delete match.vaultWallet;
    w.close().catch(() => {});
  }

  async #openUnfunded(match: ChainMatch) {
    const address = await this.#retry(() => this.#vault(match).address());
    match.chain.vault = { status: 'ready', address };
    this.#release(match);
    this.onUpdate(match);
  }

  // The house pays several recipients in one transaction (agent refills), queued with its other spends.
  houseSend(label: string, recipients: Recipient[]): Promise<string> {
    return this.#houseJob(label, () => this.house.send(recipients)).then((txid) => {
      this.refreshHouse();
      return txid;
    });
  }

  async #fund(match: ChainMatch) {
    const address = match.chain.vault.address ?? (await this.#retry(() => this.#vault(match).address()));
    match.chain.vault = { status: 'funding', address };
    this.onUpdate(match);
    const txid = await this.#houseJob('fund vault', () =>
      this.house.send([{ address, zat: match.chain.prizeZat, memo: `ZONAR VAULT #${match.id} commit ${match.commitment}` }]));
    this.#funded(match, txid);
  }

  #funded(match: ChainMatch, txid: string) {
    match.chain.vault = { ...match.chain.vault, status: 'funded', fundTxid: txid };
    this.log(`[${match.id}] vault funded ${txid}`);
    // Not needed again until the match ends (settle reopens it).
    if (match.phase !== 'over') this.#release(match);
    this.onUpdate(match);
    this.refreshHouse();
    // Turns played before the vault existed still need anchoring.
    if (match.transcript.length) this.anchor(match);
  }

  // A transfer this vault already made or received, identified by its memo.
  async #findTransfer(match: ChainMatch, kind: string, memoPrefix: string): Promise<Transfer | undefined> {
    const transfers = await this.#retry(() => this.#vault(match).transfers());
    // Matches from before the rename wrote DEADDROP memos.
    const prefixes = [memoPrefix, memoPrefix.replace(/^ZONAR/, 'DEADDROP')];
    return transfers.find((t) => t.kind === kind && t.status !== 'failed' && (t.memos || []).some((m) => prefixes.some((p) => m.startsWith(p))));
  }

  resume(match: ChainMatch) {
    match.anchorQueued = false;
    match.anchorInFlight = false;
    if (match.chain.mode === 'practice') {
      if (match.chain.vault.status === 'creating') this.#openUnfunded(match).catch((e) => this.#fail(match, 'vault', e));
      else if (match.phase === 'over') this.settle(match);
      return;
    }
    if (!isPrize(match) || match.chain.vault.status === 'failed') return;
    (async () => {
      const v = match.chain.vault;
      if (v.status !== 'funded') {
        const prior = v.address && (await this.#findTransfer(match, 'received', `ZONAR VAULT #${match.id}`));
        if (prior) this.#funded(match, prior.txid);
        else await this.#fund(match);
      } else if (match.transcript.length && (match.chain.anchors.at(-1)?.turn ?? 0) < match.transcript.at(-1)!.turn) {
        this.anchor(match);
      }
      if (match.phase !== 'over') return;
      await this.settle(match);
      if (match.chain.sweep?.status === 'confirming' && match.payout) this.#runSweep(match);
    })().catch((e) => this.#fail(match, 'vault', e));
  }

  anchor(match: ChainMatch) {
    if (!isPrize(match)) return;
    const latest = match.transcript.at(-1);
    if (!latest) return;
    match.anchorWanted = { turn: latest.turn, head: match.chainHead };
    if (match.anchorQueued) return;
    match.anchorQueued = true;
    this.#houseJob('anchor', async () => {
      match.anchorQueued = false;
      const a = match.anchorWanted!;
      const last = match.chain.anchors.at(-1);
      const address = match.chain.vault.address;
      if (!address || (last && last.turn >= a.turn)) return;
      match.anchorInFlight = true;
      try {
        const txid = await this.house.send([{ address, zat: ANCHOR_ZAT, memo: `ZONAR #${match.id} T${a.turn} ${a.head}` }]);
        match.chain.anchors.push({ turn: a.turn, head: a.head, txid });
      } finally {
        match.anchorInFlight = false;
      }
      this.onUpdate(match);
    }).catch((e) => {
      match.anchorQueued = false;
      match.anchorFailed = true;
      this.log(`[${match.id}] anchor failed:`, message(e));
    });
  }

  // Safe to call again after a restart: every step checks whether it already happened,
  // and the vault's wallet is only opened if something is actually left to do.
  async settle(match: ChainMatch) {
    // An on-chain practice vault holds no money; publishing its viewing key lets anyone read the moves.
    if (match.chain.mode === 'practice' && match.chain.vault.status === 'ready') {
      try {
        match.chain.ufvk ??= await this.#retry(() => this.#vault(match).ufvk());
        this.#release(match);
        this.onUpdate(match);
      } catch (e) {
        this.log(`[${match.id}] practice vault viewing key:`, message(e));
      }
      return;
    }
    if (!isPrize(match) || match.chain.vault.status === 'failed') return;
    const winner = match.result?.winner ?? null;
    try {
      match.chain.ufvk ??= await this.#retry(() => this.#vault(match).ufvk());
      if (winner !== null) {
        match.vaultSeed ??= await this.#retry(() => this.#vault(match).recoveryInfo());
      } else if (match.chain.refund?.status !== 'sent') {
        match.chain.refund = { status: 'confirming' };
        this.onUpdate(match);
        const memo = `ZONAR REFUND #${match.id}`;
        const prior = await this.#findTransfer(match, 'sent', memo);
        const txid = prior?.txid ?? (await this.#sweepWhenFunded(match, this.houseInfo.address ?? (await this.house.address()), memo));
        match.chain.refund = { status: 'sent', txid };
      }
    } catch (e) {
      return this.#fail(match, winner === null ? 'refund' : 'vault', e);
    }
    if (match.chain.sweep?.status !== 'confirming') this.#release(match);
    this.onUpdate(match);
  }

  // The payout address is kept on the match only while its sweep is pending, so a restart can finish it.
  async claim(match: ChainMatch, address: string, memo: string) {
    if (!isPrize(match)) throw new Error('this was a practice match: there is no vault to claim');
    if (!isTestnetAddress(address)) throw new Error('enter a Zcash testnet address (utest1…, ztestsapling1… or tm…)');
    if (match.chain.sweep && match.chain.sweep.status !== 'failed') throw new Error('already claimed');
    match.payout = { address, memo };
    match.chain.sweep = { status: 'confirming' };
    this.onUpdate(match);
    this.#runSweep(match);
  }

  #runSweep(match: ChainMatch) {
    const payout = match.payout!;
    (async () => {
      const prior = await this.#findTransfer(match, 'sent', `ZONAR RELIC #${match.id}`);
      return prior?.txid ?? this.#sweepWhenFunded(match, payout.address, payout.memo);
    })()
      .then((txid) => {
        match.chain.sweep = { status: 'sent', txid };
        delete match.payout;
        this.log(`[${match.id}] vault swept ${txid}`);
        this.#release(match);
        this.onUpdate(match);
      })
      .catch((e) => this.#fail(match, 'sweep', e));
  }

  // Anchors still on their way to the vault: queued, being sent, or not yet covering the last turn.
  #anchorsPending(match: ChainMatch): boolean {
    if (match.anchorFailed) return false;
    const last = match.chain.anchors.at(-1);
    return !!(match.anchorQueued || match.anchorInFlight || (match.anchorWanted && (!last || last.turn < match.anchorWanted.turn)));
  }

  // Sweep once anchoring has finished and the prize has confirmed, so the audit trail is complete before payout.
  // If anchors are still unconfirmed when time runs out, sweep whatever is spendable rather than fail.
  async #sweepWhenFunded(match: ChainMatch, to: string, memo: string): Promise<string> {
    const prize = match.chain.prizeZat || PRIZE_ZAT;
    for (let i = 0; i < 90; i++) {
      if (match.chain.vault.status === 'failed') throw new Error('vault was never funded');
      if (match.chain.vault.status === 'funded' && !this.#anchorsPending(match)) {
        const vault = this.#vault(match);
        const spendable = await vault.spendable().catch((e) => (this.log(`[${match.id}] balance check: ${message(e)}`), 0));
        if (spendable >= prize + ANCHOR_ZAT * match.chain.anchors.length) {
          try {
            return await vault.sendAll(to, memo);
          } catch (e) {
            if (!TRANSIENT.test(message(e))) throw e;
            this.log(`[${match.id}] sweep will retry: ${message(e)}`);
          }
        }
      }
      await sleep(this.retryMs);
    }
    const vault = this.#vault(match);
    if (match.chain.vault.status === 'funded' && (await vault.spendable()) >= prize) return vault.sendAll(to, memo);
    throw new Error('vault funds did not confirm in time');
  }

  async close() {
    await this.house.close();
  }
}
