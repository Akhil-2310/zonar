'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import Board from '@/components/game/Board';
import Orders from '@/components/game/Orders';
import { Agents, Intel, Trail } from '@/components/game/Panels';
import { End, Waiting } from '@/components/game/Modals';
import { DIRS } from '@/lib/belief';
import { ACTIONS, MOVE_KEYS, needsAim, type Draft } from '@/lib/game';
import { api, session as tokens, taz, type Session } from '@/lib/api';
import { mmss, useSecondsLeft } from '@/lib/useClock';
import { sealOnchain, storedAgent } from '@/lib/agent';
import type { ActionId, Dir, GameView, Pos } from '@/lib/types';

const freshDraft = (): Draft => ({ move: { dx: 0, dy: 0 }, action: 'ping', target: null });

export default function Game() {
  const id = String(useParams<{ id: string }>().id);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [lost, setLost] = useState<null | 'retrying' | 'gone'>(null);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [aiming, setAiming] = useState(false);
  const [modalClosed, setModalClosed] = useState(false);
  const [error, setError] = useState('');
  // Progress of an on-chain seal: building, signing, broadcasting.
  const [sealing, setSealing] = useState('');
  const turnRef = useRef<number | null>(null);
  const viewRef = useRef<GameView | null>(null);
  const secondsLeft = useSecondsLeft(view?.clock);

  useEffect(() => {
    const token = tokens.get(id);
    if (!token) return setLost('gone');
    setSession({ matchId: id, token });
    const es = new EventSource(`/api/stream?matchId=${id}&token=${token}`);
    let got = false;
    es.onmessage = (e: MessageEvent<string>) => {
      got = true;
      setLost(null);
      const next = JSON.parse(e.data) as GameView;
      if (turnRef.current !== null && next.turn !== turnRef.current) {
        setDraft(freshDraft());
        setAiming(false);
      }
      turnRef.current = next.turn;
      viewRef.current = next;
      setView(next);
    };
    es.onerror = () => {
      if (got) return setLost('retrying');
      es.close();
      setLost('gone');
    };
    return () => es.close();
  }, [id]);

  // A ping you can't afford falls back to holding.
  useEffect(() => {
    if (view && draft.action === 'ping' && view.you.credits < view.costs.ping) setDraft((d) => ({ ...d, action: 'none' }));
  }, [view, draft.action]);

  const active = view?.phase === 'active' && !view.you.locked;

  const setMove = useCallback((d: Dir) => setDraft((x) => ({ ...x, move: { dx: d.dx, dy: d.dy } })), []);
  const setAction = useCallback((a: ActionId) => {
    setDraft((x) => ({ ...x, action: a, target: null }));
    setAiming(needsAim(a));
  }, []);

  const seal = useCallback(async () => {
    if (!active || !session || !view || sealing) return;
    if (needsAim(draft.action) && !draft.target) return;
    setError('');
    if (!view.onchain.enabled) {
      try {
        await api('/api/orders', { ...session, ...draft });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    // On-chain: this browser's agent signs the move as a shielded transaction.
    const agent = storedAgent();
    if (!agent) return setError("This match's agent wallet isn't on this device.");
    // The vault gets its address a few seconds into the match; moves can't be built before that.
    for (let i = 0; i < 120 && !viewRef.current?.chain.vault.address; i++) {
      setSealing('Waiting for the match vault to open…');
      await new Promise((r) => setTimeout(r, 1000));
    }
    for (let attempt = 0; ; attempt++) {
      try {
        setSealing('Unlocking your agent…');
        await sealOnchain(agent, session, view.turn, view.seat, draft, setSealing);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // The vault gets its address a few seconds into the match; keep trying meanwhile.
        if (/vault is still opening/.test(msg) && attempt < 20) {
          setSealing('Waiting for the match vault to open…');
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        setError(msg);
        break;
      }
    }
    setSealing('');
  }, [active, draft, session, view, sealing]);

  const onCell = (p: Pos) => {
    if (!active || !view) return;
    if (needsAim(draft.action) && (aiming || !draft.target)) {
      const target = draft.action === 'viewkey' ? { x: Math.min(p.x, view.size - 2), y: Math.min(p.y, view.size - 2) } : p;
      setDraft((x) => ({ ...x, target }));
      setAiming(false);
      return;
    }
    const dx = p.x - view.you.pos.x;
    const dy = p.y - view.you.pos.y;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) setMove({ dx, dy });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active || !view || (e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const mi = MOVE_KEYS.indexOf(k);
      if (mi >= 0) {
        const d = DIRS[mi];
        const to = { x: view.you.pos.x + d.dx, y: view.you.pos.y + d.dy };
        if (to.x >= 0 && to.y >= 0 && to.x < view.size && to.y < view.size) setMove(d);
      } else if (k >= '1' && k <= '6') {
        const a = ACTIONS[Number(k) - 1];
        if (view.costs[a.id] <= view.you.credits) setAction(a.id);
      } else if (k === 'enter') seal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, view, seal, setMove, setAction]);

  if (lost === 'gone') {
    return (
      <Centered>
        <h1 className="font-display text-2xl font-bold">This match isn’t on this device.</h1>
        <p className="mt-2 text-muted">Match tokens live only in the browser that joined. If you were invited, join with the code.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href={`/play?join=${id}`} className="rounded-full bg-zec px-6 py-3 font-semibold">Join {id}</Link>
          <Link href="/play" className="rounded-full border border-line bg-card px-6 py-3 font-semibold">New match</Link>
        </div>
      </Centered>
    );
  }
  if (!view) return <Centered><p className="font-mono text-sm text-muted">Decrypting match {id}…</p></Centered>;

  const v = view;
  const shown = Math.min(v.turn, v.maxTurns);
  const status =
    v.phase === 'waiting' ? 'Waiting for a rival agent…'
    : v.phase === 'over' ? 'Match over.'
    : v.you.locked ? (v.rival?.locked ? 'Resolving…' : `Orders sealed. Waiting on ${v.rival?.name}…`)
    : v.you.carrying ? 'You carry the drop. Get it to your safehouse.'
    : v.rival?.carrying ? 'The rival has the drop. Intercept them before they reach their safehouse.'
    : 'Choose a step and an action, then seal your orders.';
  const vs = v.chain.vault.status;
  const mode = v.chain.mode ?? 'prize';
  const urgent = active && secondsLeft !== null && secondsLeft <= 10;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-3">
          <Logo href="/" />
          <div className="ml-2 flex flex-wrap gap-2">
            <Chip label="match"><span className="tracking-[0.15em]">{v.matchId}</span></Chip>
            <Chip label="turn">
              {shown}/{v.maxTurns}
              <span className="absolute bottom-0 left-0 h-0.5 bg-zec transition-all" style={{ width: `${(shown / v.maxTurns) * 100}%` }} />
            </Chip>
            {v.phase === 'active' && secondsLeft !== null && (
              <Chip label="clock">
                <span className={urgent ? 'text-alert' : ''}>{mmss(secondsLeft)}</span>
              </Chip>
            )}
            <Chip label="vault">
              {mode === 'prize' ? taz(v.chain.prizeZat) : mode === 'practice' ? 'practice' : 'at start'}
              {mode === 'prize' && <span className={`h-2 w-2 rounded-full ${vs === 'funded' ? 'bg-ok' : vs === 'failed' ? 'bg-alert' : 'animate-pulse-dot bg-zec'}`} />}
            </Chip>
          </div>
          <div className="ml-auto hidden gap-1.5 sm:flex">
            {[v.chain.network, v.onchain.enabled ? 'on-chain moves' : 'shielded', '0 trackers'].map((t) => (
              <span key={t} className="rounded-full border border-zec/50 bg-zec-soft px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zec-deep">{t}</span>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="space-y-3">
          <div className="flex min-h-7 items-center justify-between gap-3">
            <p className="font-medium">{status}</p>
            {lost === 'retrying' && <span className="font-mono text-xs text-alert">reconnecting…</span>}
            {error && <span className="font-mono text-xs text-alert">{error}</span>}
          </div>
          <div className="mx-auto max-w-[720px]">
            <Board view={v} draft={draft} onCell={onCell} />
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted">
            <Legend className="bg-zec rounded-full">you</Legend>
            <Legend className="bg-zec/20 ring-1 ring-zec/50">possible drop</Legend>
            <Legend className="hatch bg-paper-2 ring-1 ring-line">ruled out</Legend>
            <Legend className="bg-alert/40">leak flash</Legend>
            <Legend className="rounded-full border border-dashed border-rival">rival last seen</Legend>
            <Legend className="h-1.5 w-1.5 rounded-full bg-alert">surveillance</Legend>
          </div>
        </section>

        <aside className="space-y-4">
          <Agents view={v} />
          <Orders view={v} draft={draft} aiming={aiming} onMove={setMove} onAction={setAction} onSeal={seal} secondsLeft={secondsLeft} sealing={sealing} />
          <Intel view={v} />
          <Trail view={v} onResign={() => session && confirm('Resign this match?') && api('/api/resign', session)} />
        </aside>
      </main>

      {v.phase === 'waiting' && <Waiting view={v} />}
      {v.phase === 'over' && session && !modalClosed && <End view={v} session={session} onClose={() => setModalClosed(true)} />}
      {v.phase === 'over' && modalClosed && (
        <button onClick={() => setModalClosed(false)} className="fixed bottom-6 right-6 z-40 rounded-full bg-ink px-5 py-3 font-semibold text-paper shadow-xl">
          Results & payout
        </button>
      )}
    </div>
  );
}

function Chip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="relative flex items-center gap-2 overflow-hidden rounded-full border border-line bg-card px-3 py-1 font-mono text-sm font-semibold">
      <span className="text-[10px] font-medium uppercase tracking-wider text-faint">{label}</span>
      {children}
    </span>
  );
}

function Legend({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={`inline-block h-2.5 w-2.5 rounded-[3px] ${className}`} />
      {children}
    </span>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="dot-grid flex min-h-screen items-center justify-center p-6 text-center"><div>{children}</div></div>;
}
