'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import Avatar from '@/components/Avatar';
import CityMap from '@/components/CityMap';
import HouseStatus from '@/components/HouseStatus';
import AgentCard from '@/components/AgentCard';
import type { StoredAgent } from '@/lib/agent';
import { AVATARS } from '@/lib/avatars';
import { api, prefs, session, taz } from '@/lib/api';
import type { HouseInfo } from '@/lib/types';

type Mode = 'bot' | 'create' | 'join';
type Joined = { matchId: string; token: string; seat: number };

export default function Launch() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0].id);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Mode | null>(null);
  const [err, setErr] = useState('');
  const [house, setHouse] = useState<HouseInfo | null>(null);
  const [agent, setAgent] = useState<StoredAgent | null>(null);
  const onAgent = useCallback((a: StoredAgent | null) => setAgent(a), []);

  useEffect(() => {
    setName(prefs.get('name'));
    setAvatar(prefs.get('avatar', AVATARS[0].id));
    api<HouseInfo>('/api/house').then(setHouse).catch(() => {});
    const join = new URLSearchParams(location.search).get('join');
    if (join) setCode(join.toUpperCase());
  }, []);

  async function go(kind: Mode) {
    setErr('');
    setBusy(kind);
    prefs.set('name', name);
    prefs.set('avatar', avatar);
    // Joining with an agent makes a head-to-head match on-chain (when the rival has one too).
    const creds = agent ? { agentId: agent.id, agentToken: agent.token } : {};
    try {
      const r =
        kind === 'join'
          ? await api<Joined>('/api/join', { name, avatar, matchId: code.trim(), ...creds })
          : await api<Joined>('/api/match', { name, avatar, vsBot: kind === 'bot', ...creds });
      session.set(r.matchId, r.token);
      router.push(`/play/${r.matchId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  const chosen = AVATARS.find((a) => a.id === avatar) ?? AVATARS[0];

  return (
    <div className="dot-grid min-h-screen">
      <header className="border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center px-5 py-3.5">
          <Logo />
          <span className="ml-auto font-mono text-xs text-muted">no account · nothing tracked</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1fr_420px]">
        <section>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-zec-deep">Launch game</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Choose your agent.</h1>
          <p className="mt-3 max-w-lg text-muted">Your avatar is the one thing your rival sees. Everything else stays shielded.</p>

          <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAvatar(a.id)}
                className={`group flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 transition ${
                  avatar === a.id ? 'border-zec shadow-[0_0_0_3px_rgb(244_183_40/0.25)]' : 'border-line hover:border-faint'
                }`}
              >
                <Avatar id={a.id} size={64} className="transition group-hover:scale-105" />
                <span className={`text-sm font-medium ${avatar === a.id ? 'text-ink' : 'text-muted'}`}>{a.name}</span>
              </button>
            ))}
          </div>

          <label className="mt-8 block max-w-md">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">Codename</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder={chosen.name.toUpperCase()}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-xl border border-line bg-card px-4 py-3 font-display text-lg outline-none transition focus:border-zec focus:shadow-[0_0_0_3px_rgb(244_183_40/0.2)]"
            />
          </label>

          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
            <ModeCard
              title="Play vs bot"
              body={
                house && house.botPrizeZat > 0
                  ? `GHOST plays from its own fog. A win pays ${taz(house.botPrizeZat)}.`
                  : 'Practice against GHOST, same rules as you. No ZEC at stake.'
              }
              cta={busy === 'bot' ? 'Opening vault…' : 'Start'}
              primary
              disabled={!!busy}
              onClick={() => go('bot')}
            />
            <ModeCard
              title="Private match"
              body={
                !house || house.prizeMatchesLeftToday > 0
                  ? `Head-to-head. The winner sweeps a ${taz(house?.prizeZat ?? 1_000_000)} vault. Send the link over a channel you trust.`
                  : "Head-to-head. Today's prize budget is spent, so it's practice until tomorrow."
              }
              cta={busy === 'create' ? 'Opening vault…' : 'Create'}
              disabled={!!busy}
              onClick={() => go('create')}
            />
          </div>
          <div className="mt-3 flex max-w-2xl gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="MATCH CODE"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded-xl border border-line bg-card px-4 py-3 font-mono tracking-[0.3em] outline-none focus:border-zec"
            />
            <button
              onClick={() => go('join')}
              disabled={!!busy || code.length < 6}
              className="rounded-xl border border-line bg-card px-6 font-semibold transition hover:border-faint disabled:opacity-40"
            >
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </div>
          {err && <p className="mt-3 text-sm text-alert">{err}</p>}
        </section>

        <aside className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-line bg-card shadow-sm">
            <div className="relative aspect-square">
              <CityMap />
              <div className="absolute inset-0 fog-grain bg-paper/40" />
              <div className="absolute left-[8.3%] top-[8.3%] -translate-x-1/2 -translate-y-1/2 drop-shadow-lg">
                <Avatar id={avatar} size={58} ring="you" />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-line p-4">
              <Avatar id={avatar} size={44} />
              <div>
                <div className="font-display font-semibold">{name || chosen.name.toUpperCase()}</div>
                <div className="text-xs text-muted">Starts in the Sprout Docks safehouse · 12 shielded credits</div>
              </div>
            </div>
          </div>
          <AgentCard name={name || chosen.name.toUpperCase()} avatar={avatar} enabled={!!house?.agents} onChange={onAgent} />
          <HouseStatus />
          <p className="px-1 text-xs leading-relaxed text-faint">
            Your codename and avatar are stored only in this browser. If you win, you’ll be asked for a testnet address to
            receive the vault. It’s deleted once the payout is sent.
          </p>
        </aside>
      </main>
    </div>
  );
}

type ModeCardProps = { title: string; body: string; cta: string; primary?: boolean; disabled?: boolean; onClick: () => void };

function ModeCard({ title, body, cta, primary = false, disabled = false, onClick }: ModeCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start rounded-2xl border p-5 text-left transition disabled:opacity-60 ${
        primary ? 'border-zec bg-zec-soft hover:bg-[#fbe7b0]' : 'border-line bg-card hover:border-faint'
      }`}
    >
      <span className="font-display text-lg font-semibold">{title}</span>
      <span className="mt-1 text-sm text-muted">{body}</span>
      <span className={`mt-4 rounded-full px-4 py-1.5 text-sm font-semibold ${primary ? 'bg-ink text-paper' : 'bg-paper-2 text-ink'}`}>{cta} →</span>
    </button>
  );
}
