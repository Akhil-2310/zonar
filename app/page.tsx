import Link from 'next/link';
import Logo from '@/components/Logo';
import CityMap from '@/components/CityMap';
import Avatar from '@/components/Avatar';
import HouseStatus from '@/components/HouseStatus';

const STEPS = [
  { n: '01', title: 'The drop is hidden', body: 'The server buries a vault of testnet ZEC somewhere in Halo Spire, the district at the city’s heart, and publishes a hash of its location before anyone moves.' },
  { n: '02', title: 'Hunt through the fog', body: 'Each turn both agents secretly pick a step and an action, then seal their orders. Turns resolve at the same moment.' },
  { n: '03', title: 'Carry it home', body: 'Dig it up and you turn partly transparent: your block leaks every other turn. Get caught on the same block and it’s stolen.' },
  { n: '04', title: 'Sweep the vault', body: 'Reach your safehouse and the vault is yours: one shielded transaction to your own wallet, plus a relic minted from the match.' },
];

const ACTIONS = [
  { name: 'Encrypted ping', cost: '1 cr', body: 'Locked, Faint or Static: how close the drop is.' },
  { name: 'Metadata leak', cost: '1 cr', body: 'Exact distance, but your district flashes on the rival’s map.' },
  { name: 'Viewing key', cost: '4 cr', body: 'See into any 2×2 area for one turn.' },
  { name: 'Chaff', cost: '2 cr', body: 'Fake a leak flash anywhere. Indistinguishable from a real one.' },
  { name: 'Dig', cost: 'free', body: 'Search the block you’re standing on.' },
];

const PRIVACY = [
  { title: 'Fog enforced by encryption', body: 'Orders are sealed server-side and the rival only ever receives what the rules reveal. Nothing about you is in their browser.' },
  { title: 'Exposure meter', body: 'Before you seal your orders, the game spells out exactly what the rival will learn about you this turn.' },
  { title: 'Shoulder-surf guard', body: 'Your credit balance stays blurred on screen until you choose to peek.' },
  { title: 'Zero third parties', body: 'No analytics, no trackers, no external fonts or scripts, enforced by a strict content security policy.' },
  { title: 'No accounts', body: 'A codename and an avatar. Your match token lives only in this browser.' },
  { title: 'Payout address, then gone', body: 'Asked for only if you win, used for one transaction, and deleted once it’s sent.' },
];

const CHAIN = [
  { label: 'Vault funded', memo: 'DEADDROP VAULT #A281A4 commit 45951e52…', note: 'A fresh wallet per match, funded with the prize. The memo carries the drop commitment.' },
  { label: 'Turns anchored', memo: 'DEADDROP #A281A4 T12 b1a31af0…', note: 'A hash chain over every sealed order, written into zero-value shielded memos as the game runs.' },
  { label: 'Vault swept', memo: 'DEADDROP RELIC #A281A4 | Halo Spire D5 | T12', note: 'One send-all to the winner. The memo is the relic certificate.' },
];

export default function Landing() {
  return (
    <div className="dot-grid">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-8 px-5 py-3.5">
          <Logo />
          <div className="hidden gap-6 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#privacy" className="hover:text-ink">Privacy</a>
            <a href="#chain" className="hover:text-ink">On-chain</a>
          </div>
          <Link href="/play" className="ml-auto rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper transition hover:bg-black">
            Launch game
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.05fr_1fr] md:pt-20">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-zec/50 bg-zec-soft px-3 py-1 font-mono text-xs font-medium text-zec-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-zec" /> Live on Zcash testnet
            </p>
            <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight md:text-6xl">
              The city sees everything.
              <span className="mt-1 block text-zec-deep">Except what’s shielded.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Two privacy agents. One vault of testnet ZEC buried in a surveilled city. Every reading you take costs you
              privacy, and every flash on the map might be a lie. Carry the drop home to sweep the vault.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/play" className="rounded-full bg-zec px-7 py-3.5 font-semibold text-ink shadow-[0_8px_24px_-8px_rgb(244_183_40/0.8)] transition hover:-translate-y-0.5 hover:bg-[#ffc53d]">
                Launch game →
              </Link>
              <a href="#how" className="rounded-full border border-line bg-card px-7 py-3.5 font-semibold text-ink transition hover:border-faint">
                How it works
              </a>
            </div>
            <div className="mt-8 max-w-xl">
              <HouseStatus />
            </div>
          </div>
          <HeroMap />
        </section>

        {/* Stats */}
        <section className="border-y border-line bg-card/70">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 md:grid-cols-5">
            {[
              ['7×7', 'city blocks'],
              ['9', 'districts'],
              ['20', 'turns max'],
              ['0.01 TAZ', 'per head-to-head win'],
              ['0', 'trackers'],
            ].map(([k, v]) => (
              <div key={v}>
                <div className="font-display text-3xl font-bold">{k}</div>
                <div className="text-sm text-muted">{v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <SectionHead eyebrow="How it works" title="Hide. Hunt. Carry. Sweep." />
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-line bg-card p-6 shadow-sm">
                <div className="font-mono text-sm font-semibold text-zec-deep">{s.n}</div>
                <h3 className="mt-3 font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 grid gap-8 rounded-3xl border border-line bg-paper-2 p-8 md:grid-cols-[280px_1fr]">
            <div>
              <h3 className="font-display text-2xl font-semibold">Your toolkit</h3>
              <p className="mt-2 text-sm text-muted">
                12 credits, held as a balance your rival never sees. Every one spent trades privacy for information.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ACTIONS.map((a) => (
                <div key={a.name} className="rounded-xl border border-line bg-card p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{a.name}</span>
                    <span className="font-mono text-xs font-semibold text-zec-deep">{a.cost}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-muted">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <SectionHead eyebrow="Privacy by design" title="Built like a privacy tool, not just themed like one." />
            <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
              {PRIVACY.map((p) => (
                <div key={p.title} className="border-l-2 border-zec pl-4">
                  <h3 className="font-display font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* On-chain */}
        <section id="chain" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <SectionHead eyebrow="On-chain" title="Real shielded transactions. Verifiable fairness." />
          <div className="mt-10 grid gap-10 md:grid-cols-[1fr_340px]">
            <ol className="relative space-y-6 border-l-2 border-dashed border-line pl-8">
              {CHAIN.map((c) => (
                <li key={c.label} className="relative">
                  <span className="absolute -left-[41px] top-1 h-4 w-4 rounded-full border-4 border-paper bg-zec" />
                  <h3 className="font-display text-lg font-semibold">{c.label}</h3>
                  <p className="mt-1 text-sm text-muted">{c.note}</p>
                  <code className="mt-2 inline-block rounded-lg border border-line bg-card px-3 py-1.5 font-mono text-xs text-ink">{c.memo}</code>
                </li>
              ))}
              <li className="relative">
                <span className="absolute -left-[41px] top-1 h-4 w-4 rounded-full border-4 border-paper bg-ok" />
                <h3 className="font-display text-lg font-semibold">Anyone can check</h3>
                <p className="mt-1 text-sm text-muted">
                  At the end, the drop’s location and salt are revealed and re-hashed in your browser. The vault’s viewing key is
                  published so every anchored memo can be decrypted and compared.
                </p>
              </li>
            </ol>
            <div className="rounded-3xl border border-line bg-gradient-to-b from-zec-soft to-card p-6 text-center shadow-sm">
              <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border-4 border-zec bg-card shadow-[0_0_0_10px_rgb(244_183_40/0.15)]">
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 49 }, (_, i) => {
                    const x = i % 7;
                    const y = Math.floor(i / 7);
                    const vault = x >= 2 && x <= 4 && y >= 2 && y <= 4;
                    return <span key={i} className={`h-2.5 w-2.5 rounded-[3px] ${i === 23 ? 'bg-zec' : vault ? 'bg-zec/35' : 'bg-line'}`} />;
                  })}
                </div>
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">The relic</h3>
              <p className="mt-1 text-sm text-muted">
                Winners keep a collectible drawn from the match’s commitment hash, sealed in the memo of their payout.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-5 pb-24">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-3xl bg-ink p-10 text-paper md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-3xl font-bold">Ready to go dark?</h2>
              <p className="mt-2 text-paper/70">Practice against the bot, then take on a friend for a real testnet vault.</p>
            </div>
            <Link href="/play" className="rounded-full bg-zec px-7 py-3.5 font-semibold text-ink transition hover:bg-[#ffc53d]">
              Launch game →
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center font-mono text-xs text-faint">
        Dead Drop · Zcash testnet · no cookies, no analytics
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-zec-deep">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
    </div>
  );
}

// A static scene: your agent closing on the vault district, a rival leak flashing, fog over the rest.
function HeroMap() {
  const fogged = new Set([0, 1, 7, 8, 5, 6, 12, 13, 19, 20, 26, 27, 28, 35, 36, 42, 43, 33, 34, 40, 41, 47, 48]);
  const flash = new Set([5, 6, 12, 13]); // Sapling Row, top right
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-zec/25 via-transparent to-rival/15 blur-2xl" />
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-card shadow-[0_30px_80px_-30px_rgb(31_26_20/0.35)]">
        <CityMap />
        <div className="absolute inset-0 grid grid-cols-7 grid-rows-7">
          {Array.from({ length: 49 }, (_, i) => (
            <div
              key={i}
              className={
                flash.has(i)
                  ? 'animate-flash bg-alert/20 ring-1 ring-alert/40 ring-inset'
                  : fogged.has(i)
                    ? 'fog-grain bg-paper/75'
                    : ''
              }
            />
          ))}
        </div>
        <div className="absolute left-[21.4%] top-[35.7%] -translate-x-1/2 -translate-y-1/2 drop-shadow-lg">
          <Avatar id="nightjar" size={64} ring="you" />
        </div>
        <div className="absolute left-[78.6%] top-[21.4%] -translate-x-1/2 -translate-y-1/2 opacity-80">
          <div className="rounded-full border-2 border-dashed border-rival p-0.5">
            <Avatar id="cipher" size={44} />
          </div>
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-line bg-card/95 px-4 py-2.5 text-sm shadow-sm">
          <span>
            <b className="text-alert">Leak flash</b> <span className="text-muted">over Sapling Row. Real or chaff?</span>
          </span>
          <span className="font-mono text-xs text-muted">T4/20</span>
        </div>
      </div>
    </div>
  );
}
