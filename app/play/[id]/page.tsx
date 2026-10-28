'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import Board from '@/components/game/Board';
import Orders from '@/components/game/Orders';
import { Intel, PetStatus, RivalCard, Trail } from '@/components/game/Panels';
import Device, { ScreenIcon } from '@/components/Device';
import Avatar from '@/components/Avatar';
import { Icon } from '@/components/Pixel';
import { End, Waiting } from '@/components/game/Modals';
import Celebration from '@/components/Celebration';
import { Toasts, useToasts } from '@/components/Toasts';
import { DIRS } from '@/lib/belief';
import { ACTIONS, MOVE_KEYS, describe, needsAim, type Draft } from '@/lib/game';
import { api, prefs, session as tokens, taz, type Session } from '@/lib/api';
import { mmss, useSecondsLeft } from '@/lib/useClock';
import { sealOnchain, storedAgent } from '@/lib/agent';
import type { ActionId, Dir, GameView, IntelEvent, Pos } from '@/lib/types';

const freshDraft = (): Draft => ({ move: { dx: 0, dy: 0 }, action: 'ping', target: null });
// Arrow keys nudge the chosen step one tile at a time: ↑ then → is the up-right diagonal,
// and the opposite arrow steps back toward staying put.
const ARROW_NUDGE: Record<string, Dir> = {
  arrowup: { dx: 0, dy: -1 },
  arrowdown: { dx: 0, dy: 1 },
  arrowleft: { dx: -1, dy: 0 },
  arrowright: { dx: 1, dy: 0 },
};
const clampStep = (n: number) => Math.max(-1, Math.min(1, n));

// The pixel icon for each kind of clue, used by the turn toasts.
const INTEL_ICON: Record<IntelEvent['type'], string> = {
  ping: 'ping',
  leak: 'leak',
  flash: 'eye',
  chaffPlanted: 'chaff',
  viewkey: 'viewkey',
  dig: 'dig',
  rivalPickup: 'chest',
  rivalSeen: 'eye',
  exposed: 'eye',
  collision: 'star',
};

export default function Game() {
  const id = String(useParams<{ id: string }>().id);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [lost, setLost] = useState<null | 'retrying' | 'gone'>(null);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [aiming, setAiming] = useState(false);
  const [modalClosed, setModalClosed] = useState(false);
  // The win party plays once per match, not on every reload.
  const [party, setParty] = useState(false);
  const [error, setError] = useState('');
  // Progress of an on-chain seal: building, signing, broadcasting.
  const [sealing, setSealing] = useState('');
  const turnRef = useRef<number | null>(null);
  const viewRef = useRef<GameView | null>(null);
  const secondsLeft = useSecondsLeft(view?.clock);
  const { toasts, push: toast, dismiss } = useToasts();

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
      const prev = viewRef.current;
      if (turnRef.current !== null && next.turn !== turnRef.current) {
        setDraft(freshDraft());
        setAiming(false);
      }
      // After each turn resolves, every new clue pops up as a toast.
      if (prev) {
        const fresh = next.intel.slice(prev.intel.length);
        fresh.forEach((ev, i) => {
          const [text, tone] = describe(ev);
          toast({ text, tone: tone ?? 'info', icon: ev.type === 'dig' && ev.found ? 'chest' : INTEL_ICON[ev.type], title: `Turn ${ev.turn}` }, i * 350);
        });
        if (!fresh.length && next.turn !== prev.turn && next.phase === 'active') toast({ text: 'Turn resolved. Nothing new on your screen.', icon: 'none', title: `Turn ${prev.turn}` });
        if (prev.phase === 'waiting' && next.phase === 'active') toast({ text: `${next.rival?.name ?? 'Your rival'} is in. The hunt is on.`, icon: 'star', title: 'Match start' });
        if (!next.rival?.isBot && !prev.rival?.locked && next.rival?.locked && next.phase === 'active' && !next.you.locked) toast({ text: `${next.rival?.name} has sealed their move.`, icon: 'lock', title: 'Rival' });
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

  const won = view?.phase === 'over' && view.result?.winner === view.seat;
  useEffect(() => {
    if (!won || prefs.get('celebrated:' + id)) return;
    prefs.set('celebrated:' + id, '1');
    setParty(true);
  }, [won, id]);

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
        toast({ text: `${ACTIONS.find((a) => a.id === draft.action)?.label} sealed. Waiting for the turn to resolve.`, icon: draft.action, title: `Turn ${view.turn}` });
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
        toast({ text: 'Move signed and broadcast as a shielded transaction.', icon: 'lock', title: `Turn ${view.turn}`, tone: 'good' });
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
  }, [active, draft, session, view, sealing, toast]);

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
      const nudge = ARROW_NUDGE[k];
      if (nudge) {
        e.preventDefault(); // don't scroll the page while steering
        setDraft((x) => {
          const move = { dx: clampStep(x.move.dx + nudge.dx), dy: clampStep(x.move.dy + nudge.dy) };
          const to = { x: view.you.pos.x + move.dx, y: view.you.pos.y + move.dy };
          return to.x >= 0 && to.y >= 0 && to.x < view.size && to.y < view.size ? { ...x, move } : x;
        });
      } else if (mi >= 0) {
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
        <Avatar id="ghost" mood="sad" size={96} />
        <h1 className="mt-4 font-display text-3xl font-bold">This match isn’t on this device.</h1>
        <p className="mt-2 text-muted">Match tokens live only in the browser that joined. If you were invited, join with the code.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href={`/play?join=${id}`} className="toy press rounded-full bg-zec px-6 py-3 font-bold">Join {id}</Link>
          <Link href="/play" className="toy press rounded-full bg-card px-6 py-3 font-bold">New match</Link>
        </div>
      </Centered>
    );
  }
  if (!view) {
    return (
      <Centered>
        <Avatar id="nightjar" mood="sleepy" size={96} />
        <p className="mt-4 font-tiny text-sm">Decrypting match {id}…</p>
      </Centered>
    );
  }

  const v = view;
  const shown = Math.min(v.turn, v.maxTurns);
  const vs = v.chain.vault.status;
  const mode = v.chain.mode ?? 'prize';
  const urgent = active && secondsLeft !== null && secondsLeft <= 10;
  const affordable = ACTIONS.filter((a) => v.costs[a.id] <= v.you.credits);
  const cycle = (dir: 1 | -1) => {
    const i = affordable.findIndex((a) => a.id === draft.action);
    setAction(affordable[(i + dir + affordable.length) % affordable.length].id);
  };
  const canSeal = active && !sealing && !(needsAim(draft.action) && !draft.target);

  const actionRow = (
    <div className="flex gap-1">
      {ACTIONS.map((a) => (
        <ScreenIcon key={a.id} label={`${a.label} (${v.costs[a.id] || 'free'})`} selected={draft.action === a.id} disabled={!active || v.costs[a.id] > v.you.credits} onClick={() => setAction(a.id)}>
          <Icon name={a.id} size={26} />
          <span className="font-tiny text-[11px] leading-none">{v.costs[a.id] ? `${v.costs[a.id]}♥` : 'free'}</span>
        </ScreenIcon>
      ))}
    </div>
  );
  const statusRow = (
    <div className="flex items-center justify-between gap-2 px-1 font-tiny text-[14px] text-lcd">
      <span className="flex items-center gap-1.5">
        <Icon name="clock" size={16} />
        <span className={urgent ? 'animate-pulse-dot text-alert' : ''}>{v.phase === 'active' && secondsLeft !== null ? mmss(secondsLeft) : '--:--'}</span>
      </span>
      <span>
        T{shown}/{v.maxTurns}
      </span>
      <span className="flex items-center gap-1.5">
        <Icon name="coin" size={16} />
        {mode === 'prize' ? taz(v.chain.prizeZat) : mode === 'practice' ? 'PRACTICE' : 'AT START'}
        {mode === 'prize' && <span className={`h-2 w-2 ${vs === 'funded' ? 'bg-ok' : vs === 'failed' ? 'bg-alert' : 'animate-pulse-dot bg-zec'}`} />}
      </span>
      {v.you.locked && <Icon name="lock" size={16} title="orders sealed" />}
    </div>
  );

  return (
    <div className="min-h-screen pb-16">
      <header className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-5 pt-5">
        <Logo href="/" />
        <span className="toy-sm rounded-full bg-card px-3 py-1 font-tiny text-[11px]">
          match <b className="tracking-[0.2em]">{v.matchId}</b>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {[v.chain.network, v.onchain.enabled ? 'on-chain moves' : 'shielded', '0 trackers'].map((t, i) => (
            <span key={t} className={`toy-sm rounded-full px-3 py-0.5 font-tiny text-[10px] uppercase ${['bg-mint', 'bg-butter', 'bg-lilac'][i]}`}>
              {t}
            </span>
          ))}
        </div>
      </header>

      <main className="mx-auto grid max-w-[1320px] items-start gap-6 px-5 pt-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* The map: the handheld on the left. */}
        <section>
          <Device
            top={actionRow}
            bottom={statusRow}
            buttons={[
              { label: 'ACT', glyph: '◀', onClick: () => cycle(-1), disabled: !active },
              { label: v.onchain.enabled ? 'SIGN' : 'SEAL', glyph: '●', big: true, onClick: seal, disabled: !canSeal },
              { label: 'ACT', glyph: '▶', onClick: () => cycle(1), disabled: !active },
            ]}
          >
            <Board view={v} draft={draft} onCell={onCell} />
          </Device>
          <div className="mt-3 min-h-6 text-center">
            {lost === 'retrying' && <span className="font-tiny text-xs text-alert">reconnecting…</span>}
            {error && <span className="toy-sm inline-block rounded-lg bg-alert-soft px-3 py-1 text-sm text-alert">{error}</span>}
          </div>
          <Legend />
        </section>

        {/* Everything else: you, the rival, your orders, what you've learned, the chain. */}
        <aside className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            <PetStatus view={v} draft={draft} />
            <RivalCard view={v} />
          </div>
          <Orders view={v} draft={draft} aiming={aiming} onMove={setMove} onAction={setAction} onSeal={seal} secondsLeft={secondsLeft} sealing={sealing} />
          <Intel view={v} />
          <Trail view={v} onResign={() => session && confirm('Resign this match?') && api('/api/resign', session)} />
        </aside>
      </main>

      <Toasts toasts={toasts} onDismiss={dismiss} />
      {party && <Celebration avatar={v.you.avatar} title={mode === 'prize' ? 'Vault cracked!' : 'Extraction!'} sub={mode === 'prize' ? `${taz(v.chain.prizeZat)} is yours to claim.` : 'You carried the drop home.'} />}
      {v.phase === 'waiting' && <Waiting view={v} />}
      {v.phase === 'over' && session && !modalClosed && <End view={v} session={session} onClose={() => setModalClosed(true)} />}
      {v.phase === 'over' && modalClosed && (
        <button onClick={() => setModalClosed(false)} className="toy press fixed bottom-6 right-6 z-40 rounded-full bg-zec px-5 py-3 font-bold">
          Results & payout
        </button>
      )}
    </div>
  );
}

function Legend() {
  const items: [string, ReactNode][] = [
    ['you', <span key="y" className="font-tiny text-xs text-zec-deep">▼</span>],
    ['possible drop', <span key="p" className="lcd dither-light block h-4 w-4 border-2 border-ink" />],
    ['ruled out', <span key="r" className="lcd dither-heavy block h-4 w-4 border-2 border-ink" />],
    ['leak flash', <span key="l" className="block h-4 w-4 border-2 border-ink bg-alert/50" />],
    ['vault district', <span key="v" className="block h-4 w-4 border-2 border-dashed border-zec bg-[#f6ebbf]" />],
    ['surveillance', <span key="s" className="block h-2 w-2 bg-alert" />],
  ];
  return (
    <div className="mx-auto mt-1 flex max-w-[720px] flex-wrap justify-center gap-x-4 gap-y-2 font-tiny text-[11px] uppercase text-muted">
      {items.map(([label, swatch]) => (
        <span key={label} className="flex items-center gap-1.5">
          {swatch}
          {label}
        </span>
      ))}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}
