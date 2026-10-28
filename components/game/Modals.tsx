'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { Icon } from '@/components/Pixel';
import { TxLink } from './Panels';
import { relicSVG } from '@/lib/relic';
import { districtOf, tileName as fmt } from '@/lib/city';
import { audit, type Audit } from '@/lib/rules';
import { api, entropy, short, taz, type Session } from '@/lib/api';
import { agentAddress, storedAgent } from '@/lib/agent';
import { fromB64, memoMatches } from '@/lib/moves';
import type { GameView } from '@/lib/types';

function Shell({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="toy relative w-full max-w-3xl rounded-[28px] bg-card p-6 sm:p-8">
        {onClose && (
          <button onClick={onClose} className="toy-sm press absolute right-4 top-4 h-9 w-9 rounded-full bg-alert-soft font-tiny text-lg leading-none" aria-label="Close">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function Waiting({ view: v }: { view: GameView }) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setLink(`${location.origin}/play?join=${v.matchId}`), [v.matchId]);
  return (
    <Shell>
      <div className="flex items-center gap-4">
        <div className="toy-sm lcd rounded-2xl p-2">
          <Avatar id={v.you.avatar} mood="sleepy" size={72} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold">Safehouse secured.</h2>
          <p className="text-muted">Send this link to your rival over a channel you trust.</p>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <input readOnly value={link} className="toy-sm flex-1 rounded-xl bg-lcd px-4 py-3 font-mono text-sm text-lcd-ink" />
        <button
          onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}
          className="toy-sm press rounded-xl bg-zec px-5 font-bold"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-3 font-tiny text-xs">
        Match code <b className="tracking-[0.25em]">{v.matchId}</b> · expires in 30 minutes if nobody joins
      </p>
      <p className="mt-2 text-sm text-muted">
        Head-to-head matches put a real testnet vault at stake, within today&apos;s prize limits. Two tabs on the same network play for practice.
      </p>
      <div className="toy-sm mt-6 rounded-xl bg-paper p-4 font-mono text-[11px] text-muted">
        House commitment, published before anyone moves. The drop is placed from the house&apos;s secret and both players&apos; own randomness, once you&apos;re both in:
        <div className="mt-1 break-all text-ink">{v.commitment}</div>
      </div>
    </Shell>
  );
}

export function End({ view: v, session, onClose }: { view: GameView; session: Session; onClose: () => void }) {
  const r = v.result!;
  const rival = v.rival;
  const c = v.chain;
  const won = r.winner === v.seat;
  const [addr, setAddr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSeed, setShowSeed] = useState(false);

  // On-chain matches: every revealed move memo must be signed by its seat's agent and
  // spell out exactly the orders the replayed transcript says that seat gave.
  const moves = (() => {
    const reveal = v.onchain.reveal;
    if (!reveal) return null;
    const bad = reveal.memos.filter(({ turn, seat, memo }) => {
      const key = reveal.orderKeys[seat];
      const orders = r.transcript.find((t) => t.turn === turn)?.orders[seat];
      return !key || !orders || !memoMatches(memo, fromB64(key), v.matchId, turn, seat, orders);
    });
    return { total: reveal.memos.length, bad: bad.length };
  })();
  const myAgent = typeof window !== 'undefined' && v.agent ? storedAgent() : null;

  // Replays the whole match in this browser under the same rules the server ran.
  const proof: Audit = useMemo(
    () =>
      audit(
        { matchId: v.matchId, commitment: v.commitment, chainHead: v.chainHead, drop: r.drop, salt: r.salt, entropy: r.entropy, transcript: r.transcript, result: r },
        v.seat,
        v.intel,
        entropy.get(v.matchId),
      ),
    [v.matchId, v.commitment, v.chainHead, v.seat, v.intel, r],
  );

  const practice = (c.mode ?? 'prize') !== 'prize';
  const relic = won ? relicSVG({ matchId: v.matchId, commitment: v.commitment, drop: r.drop, turn: v.turn, codename: v.you.name, sweepTxid: c.sweep?.txid, practice }) : '';
  const title =
    r.reason === 'expired' ? 'No rival showed up.'
    : r.reason === 'abandoned' && !won ? 'You went dark for too long.'
    : r.winner === null ? (practice ? 'Draw.' : 'Draw. The vault returns to the house.')
    : won ? (practice ? 'Practice extraction complete.' : 'Extraction complete.')
    : practice ? 'Your rival got there first.' : 'The vault is gone.';
  const why: Record<typeof r.reason, string> = {
    extracted: won ? 'You carried the drop home.' : `${rival?.name} carried the drop home.`,
    timeout: '20 turns passed with no extraction.',
    forfeit: won ? 'Your rival resigned.' : 'You resigned.',
    abandoned: won ? 'Your rival went dark for too many turns and abandoned the match.' : 'You let the clock run out too many turns in a row.',
    expired: 'This match link expired before anyone joined.',
  };
  const anchored = c.anchors.at(-1);

  async function claim(toAgent = false) {
    setErr('');
    setBusy(true);
    try {
      const address = toAgent && myAgent ? await agentAddress(myAgent) : addr.trim();
      await api('/api/claim', { ...session, address });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([relic], { type: 'image/svg+xml' }));
    a.download = `zonar-relic-${v.matchId}.svg`;
    a.click();
  }

  return (
    <Shell onClose={onClose}>
      <div className="flex items-center gap-4">
        <div className={`toy-sm lcd relative rounded-2xl p-2 ${won ? 'animate-wobble' : ''}`}>
          <Avatar id={v.you.avatar} mood={won ? 'party' : r.winner === null ? 'sleepy' : 'sad'} size={88} />
          {won && <Icon name="star" size={22} className="absolute -right-3 -top-3 animate-bob" />}
        </div>
        <div>
          <p className="font-tiny text-[11px] uppercase tracking-[0.2em] text-muted">{won ? 'you win' : r.winner === null ? 'draw' : 'you lose'}</p>
          <h2 className={`font-display text-3xl font-bold leading-tight ${won ? 'text-zec-deep' : r.winner === null ? 'text-ink' : 'text-rival'}`}>{title}</h2>
          <p className="text-muted">
            {why[r.reason]} The drop was buried at <b className="text-ink">{fmt(r.drop)}</b> in {districtOf(r.drop)}.
          </p>
        </div>
      </div>

      <div className={`mt-6 grid gap-6 ${won ? 'md:grid-cols-[240px_1fr]' : ''}`}>
        {won && (
          <div>
            <div className="toy overflow-hidden rounded-2xl" dangerouslySetInnerHTML={{ __html: relic.replace('width="400" height="520"', 'width="100%"') }} />
            <button onClick={download} className="toy-sm press mt-3 w-full rounded-xl bg-butter py-2 text-sm font-bold">
              Download relic
            </button>
          </div>
        )}
        <div className="space-y-4">
          {practice && (
            <p className="toy-sm rounded-2xl bg-lilac p-4 text-sm">
              {c.note ?? 'This was a practice match: no vault was at stake.'} Prize matches are head-to-head against another player.
            </p>
          )}
          {won && !practice && (!c.sweep || c.sweep.status === 'failed') && (
            <div className="toy-sm rounded-2xl bg-butter p-4">
              <p className="text-sm">
                Claim the vault: <b>{taz(c.prizeZat)}</b>, swept to your address in one shielded transaction. Its memo carries your relic.
              </p>
              {myAgent && (
                <button onClick={() => claim(true)} disabled={busy} className="toy-sm press mt-3 w-full rounded-xl bg-ink py-2.5 font-bold text-paper disabled:opacity-40">
                  Claim into my agent wallet
                </button>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  value={addr}
                  onChange={(e) => setAddr(e.target.value)}
                  placeholder="your testnet address: utest1…"
                  autoComplete="off"
                  spellCheck={false}
                  className="toy-sm min-w-0 flex-1 rounded-xl bg-card px-3 py-2.5 font-mono text-xs outline-none"
                />
                <button onClick={() => claim()} disabled={busy || !addr} className="toy-sm press rounded-xl bg-ink px-4 text-sm font-bold text-paper disabled:opacity-40">
                  Claim treasure
                </button>
              </div>
              {(err || c.sweep?.status === 'failed') && <p className="mt-2 text-xs text-alert">{err || c.sweep?.error}</p>}
              <p className="mt-2 text-[11px] text-muted">Kept only until the payout is sent, then deleted.</p>
            </div>
          )}
          {won && c.sweep?.status === 'confirming' && (
            <p className="toy-sm flex items-center gap-2 rounded-2xl bg-sky p-4 text-sm">
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-zec" />
              Waiting for the vault’s funding and anchors to confirm, then sweeping. A few blocks (~75s each). You can close this page.
            </p>
          )}
          {won && c.sweep?.status === 'sent' && (
            <p className="toy-sm rounded-2xl bg-mint p-4 text-sm">
              Swept to your wallet. <TxLink chain={c} txid={c.sweep.txid} />
            </p>
          )}
          {won && r.vaultSeed && (
            <details className="toy-sm rounded-2xl bg-card p-4 text-sm">
              <summary className="cursor-pointer text-muted">Or take the vault’s spending key yourself</summary>
              <p className="mt-2 text-xs text-muted">Import into any testnet wallet (birthday {r.vaultSeed.birthday}). Anyone holding this can spend the vault.</p>
              <button onClick={() => setShowSeed(!showSeed)} className={`mt-2 w-full break-words rounded-lg bg-paper-2 p-3 text-left font-mono text-xs transition ${showSeed ? '' : 'blur-sm'}`}>
                {r.vaultSeed.seed}
              </button>
            </details>
          )}

          <div className="lcd space-y-1.5 rounded-2xl border-2 border-ink p-4 font-mono text-[11px] text-lcd-ink">
            <div className="font-tiny text-[11px] uppercase tracking-[0.14em]">Fairness proof</div>
            <Check ok={proof.commitment}>
              {proof.commitment ? `The house secret re-hashes to the opening commitment ${short(v.commitment)}.` : `The house secret does not match commitment ${short(v.commitment)}!`}
            </Check>
            {proof.drop !== null && (
              <Check ok={proof.drop}>
                {proof.drop
                  ? `The drop at ${fmt(r.drop)} follows from the house secret plus both players' randomness. Nobody picked it alone.`
                  : 'The drop is not where the house secret and both players’ randomness put it!'}
              </Check>
            )}
            {proof.myEntropy !== null && (
              <Check ok={proof.myEntropy}>{proof.myEntropy ? 'Your browser’s randomness was used as sent.' : 'The server did not use the randomness your browser sent!'}</Check>
            )}
            <Check ok={proof.clues}>
              {proof.clues
                ? `Replayed all ${r.transcript.length} turns: every one of your ${proof.clueCount} clues is exactly what the rules give.`
                : `Your clues diverge from the rules at turn ${proof.firstBadTurn}!`}
            </Check>
            <Check ok={proof.outcome}>{proof.outcome ? 'Every move was legal, and the replay ends the way the match did.' : 'The replay does not end the way the server says!'}</Check>
            {moves && (
              <Check ok={moves.bad === 0}>
                {moves.bad === 0
                  ? `${moves.total} on-chain moves: each signed by its agent and matching the replayed orders.`
                  : `${moves.bad} of ${moves.total} on-chain moves don't match their signatures or the transcript!`}
              </Check>
            )}
            <Check ok={proof.chain}>
              {proof.chain === false
                ? 'turn transcript does not match the hash chain!'
                : `${r.transcript.length} turns re-hash to ${short(v.chainHead)}${anchored ? `, anchored on-chain through turn ${anchored.turn}` : ''}.`}
            </Check>
            {r.entropy && <div className="break-all pt-1">House secret {r.salt} · entropy {r.entropy.map((e) => short(e)).join(' + ')}</div>}
            {c.ufvk && <div className="break-all pt-1">Vault viewing key (decrypts every anchor memo): {c.ufvk}</div>}
          </div>

          <div className="flex gap-2">
            <Link href="/play" className="toy press flex-1 rounded-xl bg-zec py-3 text-center font-bold text-ink">
              New match
            </Link>
            <button onClick={onClose} className="toy press flex-1 rounded-xl bg-card py-3 font-bold">
              View board
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <div className={ok ? 'font-semibold text-[#2c7a4b]' : 'font-semibold text-alert'}>{ok ? '✓' : '✗'} {children}</div>;
}
