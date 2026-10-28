'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import Avatar from '@/components/Avatar';
import PixelCity from '@/components/PixelCity';
import Device from '@/components/Device';
import { Icon } from '@/components/Pixel';
import HouseStatus from '@/components/HouseStatus';
import AgentCard from '@/components/AgentCard';
import type { StoredAgent } from '@/lib/agent';
import { AVATARS } from '@/lib/avatars';
import { api, entropy, prefs, session, taz } from '@/lib/api';
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
    // This browser's share of the randomness that places the drop.
    const mine = entropy.fresh();
    try {
      const r =
        kind === 'join'
          ? await api<Joined>('/api/join', { name, avatar, matchId: code.trim(), entropy: mine, ...creds })
          : await api<Joined>('/api/match', { name, avatar, vsBot: kind === 'bot', entropy: mine, ...creds });
      session.set(r.matchId, r.token);
      entropy.set(r.matchId, mine);
      router.push(`/play/${r.matchId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  const chosen = AVATARS.find((a) => a.id === avatar) ?? AVATARS[0];
  const tints = ['bg-butter', 'bg-sky', 'bg-mint', 'bg-shell', 'bg-paper-2', 'bg-lilac'];

  return (
    <div className="min-h-screen pb-16">
      <header className="mx-auto flex max-w-6xl items-center px-5 pt-5">
        <Logo />
        <span className="toy-sm ml-auto rounded-full bg-mint px-3 py-0.5 font-tiny text-[10px] uppercase">no account · nothing tracked</span>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 pt-10 lg:grid-cols-[1fr_420px]">
        <section>
          <p className="font-tiny text-[11px] uppercase tracking-[0.2em] text-zec-deep">Launch game</p>
          <h1 className="mt-2 font-display text-5xl font-bold leading-none">Hatch your agent.</h1>
          <p className="mt-3 max-w-lg text-lg text-muted">Your pet is the one thing your rival sees. Everything else stays shielded.</p>

          <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-6">
            {AVATARS.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setAvatar(a.id)}
                className={`toy-sm press group flex flex-col items-center gap-1 rounded-[50%_50%_44%_44%/58%_58%_42%_42%] px-2 pb-3 pt-4 ${avatar === a.id ? 'bg-zec' : tints[i]}`}
              >
                <Avatar id={a.id} mood={avatar === a.id ? 'happy' : 'curious'} animate={avatar === a.id} size={60} />
                <span className="font-tiny text-[10px] uppercase">{a.name}</span>
              </button>
            ))}
          </div>

          <label className="mt-8 block max-w-md">
            <span className="font-tiny text-[11px] uppercase tracking-[0.14em]">Codename</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder={chosen.name.toUpperCase()}
              autoComplete="off"
              spellCheck={false}
              className="toy-sm lcd mt-2 w-full rounded-xl px-4 py-3 font-tiny text-xl uppercase text-lcd-ink outline-none placeholder:text-lcd-mid/60"
            />
          </label>

          <div className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            <ModeCard
              title="Play vs bot"
              body={
                house && house.botPrizeZat > 0
                  ? `GHOST plays from its own fog. A win pays ${taz(house.botPrizeZat)}.`
                  : 'Practice against GHOST, same rules as you. No ZEC at stake.'
              }
              cta={busy === 'bot' ? 'Hatching…' : 'Start'}
              tint="bg-butter"
              icon="star"
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
              tint="bg-lilac"
              icon="chest"
              disabled={!!busy}
              onClick={() => go('create')}
            />
          </div>
          <div className="mt-4 flex max-w-2xl gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="MATCH CODE"
              autoComplete="off"
              spellCheck={false}
              className="toy-sm flex-1 rounded-xl bg-card px-4 py-3 font-tiny text-lg tracking-[0.3em] outline-none"
            />
            <button onClick={() => go('join')} disabled={!!busy || code.length < 6} className="toy-sm press rounded-xl bg-sky px-6 font-bold disabled:opacity-40">
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </div>
          {err && <p className="toy-sm mt-3 inline-block rounded-lg bg-alert-soft px-3 py-1 text-sm text-alert">{err}</p>}
        </section>

        <aside className="space-y-5">
          <Device shell="mint" brand={(name || chosen.name).toUpperCase()}>
            <div className="lcd relative aspect-square overflow-hidden rounded-[10px]">
              <PixelCity />
              <div className="dither absolute inset-0" />
              <div className="absolute left-[7.14%] top-[7.14%] h-[13%] w-[13%] -translate-x-1/2 -translate-y-1/2">
                <Avatar id={avatar} mood="happy" className="h-full w-full" />
              </div>
            </div>
          </Device>
          <AgentCard name={name || chosen.name.toUpperCase()} avatar={avatar} enabled={!!house?.agents} onChange={onAgent} />
          <HouseStatus />
          <p className="px-1 text-[13px] leading-relaxed text-muted">
            Your codename and pet are stored only in this browser. If you win, you’ll be asked for a testnet address to receive the vault.
            It’s deleted once the payout is sent.
          </p>
        </aside>
      </main>
    </div>
  );
}

type ModeCardProps = { title: string; body: string; cta: string; tint: string; icon: string; disabled?: boolean; onClick: () => void };

function ModeCard({ title, body, cta, tint, icon, disabled = false, onClick }: ModeCardProps) {
  return (
    <button onClick={onClick} disabled={disabled} className={`toy press flex flex-col items-start rounded-2xl p-5 text-left disabled:opacity-60 ${tint}`}>
      <span className="flex items-center gap-2">
        <Icon name={icon} size={24} />
        <span className="font-display text-xl font-bold">{title}</span>
      </span>
      <span className="mt-1.5 text-[14px] leading-snug text-ink/75">{body}</span>
      <span className="toy-sm mt-4 rounded-full bg-ink px-4 py-1 text-sm font-bold text-paper">{cta} →</span>
    </button>
  );
}
