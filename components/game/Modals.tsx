'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { TxLink } from './Panels';
import { relicSVG } from '@/lib/relic';
import { districtOf, tileName as fmt } from '@/lib/city';
import { sha256 } from '@/lib/game';
import { api, short, taz, type Session } from '@/lib/api';
import { agentAddress, storedAgent } from '@/lib/agent';
import { fromB64, memoMatches } from '@/lib/moves';
import type { GameView } from '@/lib/types';

function Shell({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-ink/30 p-4 backdrop-blur-sm sm:items-center">
      <div className="relative w-full max-w-3xl rounded-3xl border border-line bg-card p-6 shadow-2xl sm:p-8">
        {onClose && (
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full px-2 text-xl text-faint hover:text-ink" aria-label="Close">
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
        <Avatar id={v.you.avatar} size={56} ring="you" />
        <div>
          <h2 className="font-display text-2xl font-bold">Safehouse secured.</h2>
          <p className="text-muted">Send this link to your rival over a channel you trust.</p>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <input readOnly value={link} className="flex-1 rounded-xl border border-line bg-paper px-4 py-3 font-mono text-sm" />
        <button
          onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}
          className="rounded-xl bg-ink px-5 font-semibold text-paper"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-3 font-mono text-sm">
        Match code <b className="tracking-[0.25em]">{v.matchId}</b> · expires in 30 minutes if nobody joins
      </p>
      <p className="mt-2 text-sm text-muted">
        Head-to-head matches put a real testnet vault at stake, within today&apos;s prize limits. Two tabs on the same network play for practice.
      </p>
      <div className="mt-6 rounded-xl border border-line bg-paper-2 p-4 font-mono text-[11px] text-muted">
        Drop location commitment, published before anyone moves:
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
  const [proof, setProof] = useState<{ drop: boolean | null; chain: boolean | null }>({ drop: null, chain: null });

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

  const preimage = `${v.matchId}|${r.drop.x},${r.drop.y}|${r.salt}`;
  useEffect(() => {
    (async () => {
      const dropOk = (await sha256(preimage)) === v.commitment;
      let head = v.commitment;
      for (const t of r.transcript) head = await sha256(head + JSON.stringify(t));
      setProof({ drop: dropOk, chain: head === v.chainHead });
    })();
  }, [preimage, v.commitment, v.chainHead, r.transcript]);

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
    a.download = `dead-drop-relic-${v.matchId}.svg`;
    a.click();
  }

  return (
    <Shell onClose={onClose}>
      <div className="flex items-center gap-4">
        <Avatar id={won || r.winner === null ? v.you.avatar : rival?.avatar} size={56} ring={won ? 'you' : r.winner === null ? undefined : 'rival'} />
        <div>
          <h2 className={`font-display text-3xl font-bold ${won ? 'text-zec-deep' : r.winner === null ? 'text-ink' : 'text-rival'}`}>{title}</h2>
          <p className="text-muted">
            {why[r.reason]} The drop was buried at <b className="text-ink">{fmt(r.drop)}</b> in {districtOf(r.drop)}.
          </p>
        </div>
      </div>

      <div className={`mt-6 grid gap-6 ${won ? 'md:grid-cols-[240px_1fr]' : ''}`}>
        {won && (
          <div>
            <div className="overflow-hidden rounded-2xl shadow-lg" dangerouslySetInnerHTML={{ __html: relic.replace('width="400" height="520"', 'width="100%"') }} />
            <button onClick={download} className="mt-2 w-full rounded-xl border border-line py-2 text-sm font-medium hover:border-faint">
              Download relic
            </button>
          </div>
        )}
        <div className="space-y-4">
          {practice && (
            <p className="rounded-2xl border border-line bg-paper-2 p-4 text-sm text-muted">
              {c.note ?? 'This was a practice match: no vault was at stake.'} Prize matches are head-to-head against another player.
            </p>
          )}
          {won && !practice && (!c.sweep || c.sweep.status === 'failed') && (
            <div className="rounded-2xl border border-zec/60 bg-zec-soft/60 p-4">
              <p className="text-sm">
                Claim the vault: <b>{taz(c.prizeZat)}</b>, swept to your address in one shielded transaction. Its memo carries your relic.
              </p>
              {myAgent && (
                <button onClick={() => claim(true)} disabled={busy} className="mt-3 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-paper disabled:opacity-40">
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
                  className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 font-mono text-xs outline-none focus:border-zec"
                />
                <button onClick={() => claim()} disabled={busy || !addr} className="rounded-xl bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40">
                  Claim treasure
                </button>
              </div>
              {(err || c.sweep?.status === 'failed') && <p className="mt-2 text-xs text-alert">{err || c.sweep?.error}</p>}
              <p className="mt-2 text-[11px] text-muted">Kept only until the payout is sent, then deleted.</p>
            </div>
          )}
          {won && c.sweep?.status === 'confirming' && (
            <p className="flex items-center gap-2 rounded-2xl border border-line bg-paper-2 p-4 text-sm text-muted">
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-zec" />
              Waiting for the vault’s funding and anchors to confirm, then sweeping. A few blocks (~75s each). You can close this page.
            </p>
          )}
          {won && c.sweep?.status === 'sent' && (
            <p className="rounded-2xl border border-ok/40 bg-ok/5 p-4 text-sm">
              Swept to your wallet. <TxLink chain={c} txid={c.sweep.txid} />
            </p>
          )}
          {won && r.vaultSeed && (
            <details className="rounded-2xl border border-line p-4 text-sm">
              <summary className="cursor-pointer text-muted">Or take the vault’s spending key yourself</summary>
              <p className="mt-2 text-xs text-muted">Import into any testnet wallet (birthday {r.vaultSeed.birthday}). Anyone holding this can spend the vault.</p>
              <button onClick={() => setShowSeed(!showSeed)} className={`mt-2 w-full break-words rounded-lg bg-paper-2 p-3 text-left font-mono text-xs transition ${showSeed ? '' : 'blur-sm'}`}>
                {r.vaultSeed.seed}
              </button>
            </details>
          )}

          <div className="space-y-1.5 rounded-2xl border border-line bg-paper p-4 font-mono text-[11px] text-muted">
            <div className="font-semibold uppercase tracking-[0.14em] text-ink">Fairness proof</div>
            <div className="break-all">sha256({preimage})</div>
            <Check ok={proof.drop}>{proof.drop === false ? `does not match commitment ${short(v.commitment)}!` : `matches the opening commitment ${short(v.commitment)}. The drop never moved.`}</Check>
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
            {c.ufvk && <div className="break-all pt-1">Vault viewing key (decrypts every anchor memo): {c.ufvk}</div>}
          </div>

          <div className="flex gap-2">
            <Link href="/play" className="flex-1 rounded-xl bg-zec py-3 text-center font-semibold text-ink hover:bg-[#ffc53d]">
              New match
            </Link>
            <button onClick={onClose} className="flex-1 rounded-xl border border-line py-3 font-semibold hover:border-faint">
              View board
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  if (ok == null) return <div>verifying…</div>;
  return <div className={ok ? 'text-ok' : 'text-alert'}>{ok ? '✓' : '✗'} {children}</div>;
}
