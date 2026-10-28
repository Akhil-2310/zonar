import Link from 'next/link';
import Logo from '@/components/Logo';
import Avatar from '@/components/Avatar';
import Device from '@/components/Device';
import PixelCity, { PixelCityOverlay } from '@/components/PixelCity';
import { Icon } from '@/components/Pixel';
import HouseStatus from '@/components/HouseStatus';
import { PETS } from '@/lib/sprites';

const STEPS = [
  { n: '01', icon: 'lock', tint: 'bg-butter', title: 'A vault is buried', body: 'The server hides a vault of testnet ZEC somewhere in Halo Spire, the district at the city’s heart, and publishes a hash of where before anyone moves.' },
  { n: '02', icon: 'ping', tint: 'bg-sky', title: 'Hunt through the fog', body: 'Each turn both pets secretly pick a step and an action, then seal their orders. Turns resolve at the same moment.' },
  { n: '03', icon: 'chest', tint: 'bg-mint', title: 'Carry it home', body: 'Dig it up and you turn partly transparent: your tile leaks every other turn. Get caught on the same tile and it’s stolen.' },
  { n: '04', icon: 'coin', tint: 'bg-lilac', title: 'Sweep the vault', body: 'Reach your safehouse and the vault is yours: one shielded transaction to your own wallet, plus a relic minted from the match.' },
];

const ACTIONS = [
  { id: 'ping', name: 'Encrypted ping', cost: '1♥', body: 'Locked, Faint or Static: how close the drop is.' },
  { id: 'leak', name: 'Metadata leak', cost: '1♥', body: 'Exact distance, but your district flashes on the rival’s screen.' },
  { id: 'viewkey', name: 'Viewing key', cost: '4♥', body: 'See into any 2×2 area for one turn.' },
  { id: 'chaff', name: 'Chaff', cost: '2♥', body: 'Fake a leak flash anywhere. Looks exactly like a real one.' },
  { id: 'dig', name: 'Dig', cost: 'free', body: 'Search the tile you’re standing on.' },
  { id: 'none', name: 'Hold', cost: 'free', body: 'Do nothing and stay dark.' },
];

const PRIVACY = [
  { icon: 'eye', title: 'You see only your own intel', body: 'The referee seals both players’ orders and sends each pet only what the rules reveal. Nothing about you reaches your rival’s browser.' },
  { icon: 'lock', title: 'Every move signed by you', body: 'In head-to-head matches each move is a shielded transaction signed in your browser by a passkey-locked wallet. The server can’t forge or spend.' },
  { icon: 'star', title: 'Exposure meter', body: 'Before you seal your orders, your pet tells you exactly what the rival will learn about you this turn.' },
  { icon: 'heart', title: 'Shoulder-surf guard', body: 'Your credit hearts stay blurred on screen until you choose to peek.' },
  { icon: 'house', title: 'Zero third parties', body: 'No analytics, no trackers, no outside scripts or fonts, enforced by a strict content security policy.' },
  { icon: 'coin', title: 'Payout address, then gone', body: 'Asked for only if you win, used for one transaction, and deleted once it’s sent.' },
];

const CHAIN = [
  { label: 'Vault funded', memo: 'DEADDROP VAULT #A281A4 commit 45951e52…', note: 'A fresh wallet per match, funded with the prize. The memo carries the house’s commitment.' },
  { label: 'Moves signed', memo: 'DD1|C1A4D7|T3|S0|1,1|ping|-|Vk2…', note: 'Each move is a zero-value shielded memo from your agent’s wallet to the vault, signed in your browser.' },
  { label: 'Vault swept', memo: 'DEADDROP RELIC #A281A4 | Halo Spire D4 | T12', note: 'One send-all to the winner. The memo is the relic certificate.' },
];

export default function Landing() {
  return (
    <div className="overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center gap-8 px-5 pt-5">
        <Logo />
        <nav className="hidden gap-6 font-tiny text-[11px] uppercase md:flex">
          <a href="#how" className="hover:text-zec-deep">How it works</a>
          <a href="#privacy" className="hover:text-zec-deep">Privacy</a>
          <a href="#chain" className="hover:text-zec-deep">On-chain</a>
        </nav>
        <Link href="/play" className="toy-sm press ml-auto rounded-full bg-ink px-5 py-2 font-bold text-paper">
          Launch game
        </Link>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 md:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="toy-sm mb-5 inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 font-tiny text-[11px] uppercase">
              <span className="h-2 w-2 animate-pulse-dot bg-ok" /> Live on Zcash testnet
            </p>
            <h1 className="font-display text-6xl font-bold leading-[0.95] md:text-7xl">
              Raise a tiny spy.
              <span className="mt-2 block text-shell-deep [text-shadow:3px_3px_0_var(--color-ink)]">Steal a real vault.</span>
            </h1>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-muted">
              Two pocket-sized privacy agents. One vault of testnet ZEC buried in a city under total surveillance. Every reading costs your pet a
              little privacy, and every flash on the screen might be a lie.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/play" className="toy press rounded-full bg-zec px-8 py-3.5 text-lg font-bold">
                Hatch your agent →
              </Link>
              <a href="#how" className="toy press rounded-full bg-card px-8 py-3.5 text-lg font-bold">
                How it works
              </a>
            </div>
            <div className="mt-8 max-w-xl">
              <HouseStatus />
            </div>
          </div>
          <HeroDevice />
        </section>

        {/* Pet lineup */}
        <section className="border-y-[3px] border-ink bg-shell">
          <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-around gap-6 px-5 py-8">
            {PETS.map((p, i) => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                <Avatar id={p.id} mood={(['happy', 'curious', 'proud', 'party', 'curious', 'happy'] as const)[i]} size={72} />
                <span className="font-tiny text-[11px] uppercase">{p.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-20">
          <SectionHead eyebrow="How it works" title="Hide. Hunt. Carry. Sweep." />
          <div className="mt-10 grid gap-5 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className={`toy rounded-[24px] p-6 ${s.tint}`}>
                <div className="flex items-center justify-between">
                  <Icon name={s.icon} size={34} />
                  <span className="font-tiny text-sm">{s.n}</span>
                </div>
                <h3 className="mt-4 font-display text-2xl font-bold leading-tight">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/75">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="toy mt-14 grid gap-8 rounded-[28px] bg-card p-8 md:grid-cols-[260px_1fr]">
            <div>
              <h3 className="font-display text-3xl font-bold">Your toolkit</h3>
              <p className="mt-2 text-muted">
                12 hearts of credit, a balance your rival never sees. Every heart spent trades a little privacy for information.
              </p>
              <div className="mt-4 flex flex-wrap gap-0.5">
                {Array.from({ length: 12 }, (_, i) => (
                  <Icon key={i} name="heart" size={18} />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ACTIONS.map((a) => (
                <div key={a.id} className="toy-sm rounded-2xl bg-paper p-4">
                  <div className="flex items-center gap-2">
                    <Icon name={a.id} size={24} />
                    <span className="flex-1 font-bold">{a.name}</span>
                    <span className="font-tiny text-[11px]">{a.cost}</span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-snug text-muted">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-10 border-y-[3px] border-ink bg-lilac">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <SectionHead eyebrow="Privacy by design" title="Built like a privacy tool, dressed like a toy." />
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {PRIVACY.map((p) => (
                <div key={p.title} className="toy rounded-[22px] bg-card p-5">
                  <Icon name={p.icon} size={30} />
                  <h3 className="mt-3 font-display text-xl font-bold">{p.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* On-chain */}
        <section id="chain" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-20">
          <SectionHead eyebrow="On-chain" title="Real shielded transactions. Verifiable fairness." />
          <div className="mt-10 grid gap-10 md:grid-cols-[1fr_340px]">
            <ol className="space-y-5">
              {CHAIN.map((c, i) => (
                <li key={c.label} className="toy flex gap-4 rounded-[22px] bg-card p-5">
                  <span className="toy-sm flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zec font-tiny">{i + 1}</span>
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-bold">{c.label}</h3>
                    <p className="mt-1 text-[15px] text-muted">{c.note}</p>
                    <code className="lcd mt-2 inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border-2 border-ink px-3 py-1.5 font-mono text-xs text-lcd-ink">{c.memo}</code>
                  </div>
                </li>
              ))}
              <li className="toy flex gap-4 rounded-[22px] bg-mint p-5">
                <span className="toy-sm flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok font-tiny text-white">✓</span>
                <div>
                  <h3 className="font-display text-xl font-bold">Anyone can check</h3>
                  <p className="mt-1 text-[15px] text-ink/75">
                    Nobody picks the drop alone: it comes from the house’s committed secret plus both players’ own randomness. At the end your
                    browser replays every turn under the same rules, checks every clue you were shown, and verifies every signed move. The vault’s viewing key is published so anyone can read the memos on-chain.
                  </p>
                </div>
              </li>
            </ol>
            <div className="toy self-start rounded-[28px] bg-butter p-6 text-center">
              <div className="toy-sm mx-auto flex h-44 w-44 items-center justify-center rounded-full bg-card">
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 49 }, (_, i) => {
                    const x = i % 7;
                    const y = Math.floor(i / 7);
                    const vault = x >= 2 && x <= 4 && y >= 2 && y <= 4;
                    return <span key={i} className={`h-3 w-3 ${i === 24 ? 'bg-zec' : vault ? 'bg-zec/35' : 'bg-ink/10'}`} />;
                  })}
                </div>
              </div>
              <h3 className="mt-5 font-display text-2xl font-bold">The relic</h3>
              <p className="mt-1 text-[15px] text-ink/75">Winners keep a collectible drawn from the match’s commitment hash, sealed in the memo of their payout.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-5 pb-24">
          <div className="toy mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-[32px] bg-ink p-10 text-paper md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <Avatar id="cipher" mood="party" size={84} />
              <div>
                <h2 className="font-display text-4xl font-bold">Ready to go dark?</h2>
                <p className="mt-1 text-lg text-paper/70">Practice against the bot, then take on a friend for a real testnet vault.</p>
              </div>
            </div>
            <Link href="/play" className="toy press rounded-full bg-zec px-8 py-3.5 text-lg font-bold text-ink">
              Hatch your agent →
            </Link>
          </div>
        </section>
      </main>

      <footer className="pb-10 text-center font-tiny text-[10px] uppercase text-muted">Dead Drop · Zcash testnet · no cookies, no analytics</footer>
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="font-tiny text-[11px] uppercase tracking-[0.2em] text-zec-deep">{eyebrow}</p>
      <h2 className="mt-3 font-display text-4xl font-bold leading-tight md:text-5xl">{title}</h2>
    </div>
  );
}

// The toy in attract mode: your pet hunting near the vault district while a rival leak flashes.
function HeroDevice() {
  const fogged = new Set([0, 1, 7, 8, 5, 6, 12, 13, 19, 20, 26, 27, 28, 35, 36, 42, 43, 33, 34, 40, 41, 47, 48]);
  const flash = new Set([5, 6, 12, 13]); // Sapling Row, top right
  return (
    <div className="relative">
      <div className="absolute -left-6 top-24 hidden animate-bob md:block">
        <Icon name="star" size={36} />
      </div>
      <div className="absolute -right-4 bottom-40 hidden animate-bob md:block" style={{ animationDelay: '0.4s' }}>
        <Icon name="heart" size={32} />
      </div>
      <Device
        top={
          <div className="flex gap-1">
            {['none', 'dig', 'ping', 'leak', 'viewkey', 'chaff'].map((a) => (
              <span key={a} className={`flex flex-1 justify-center rounded-lg border-2 py-1 ${a === 'ping' ? 'border-butter bg-butter' : 'border-transparent bg-lcd/75'}`}>
                <Icon name={a} size={20} />
              </span>
            ))}
          </div>
        }
        bottom={
          <div className="flex justify-between px-1 font-tiny text-[11px] text-lcd">
            <span className="flex items-center gap-1.5"><Icon name="clock" size={14} /> 0:42</span>
            <span>T4/20</span>
            <span className="flex items-center gap-1.5"><Icon name="coin" size={14} /> 0.010 TAZ</span>
          </div>
        }
        buttons={[
          { label: 'ACT', glyph: '◀' },
          { label: 'SEAL', glyph: '●', big: true },
          { label: 'ACT', glyph: '▶' },
        ]}
      >
        <div className="lcd relative aspect-square overflow-hidden rounded-[10px]">
          <PixelCity />
          <div className="absolute inset-0 grid grid-cols-7 grid-rows-7">
            {Array.from({ length: 49 }, (_, i) => (
              <div key={i} className={flash.has(i) ? 'animate-flash' : fogged.has(i) ? 'dither-heavy' : ''} style={flash.has(i) ? { animationIterationCount: 'infinite' } : undefined} />
            ))}
          </div>
          <PixelCityOverlay labels={false} />
          <div className="absolute left-[21.4%] top-[35.7%] h-[13%] w-[13%] -translate-x-1/2 -translate-y-1/2">
            <Avatar id="nightjar" mood="curious" className="h-full w-full" />
          </div>
          <div className="absolute left-[78.6%] top-[21.4%] h-[11%] w-[11%] -translate-x-1/2 -translate-y-1/2 opacity-60">
            <Avatar id="cipher" mood="angry" animate={false} className="h-full w-full grayscale" />
          </div>
        </div>
      </Device>
    </div>
  );
}
