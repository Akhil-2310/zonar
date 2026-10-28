# Zonar 🛰️

**A fog-of-war treasure hunt where the fog is real cryptography.**

Two agents drop into a surveilled pixel city. Somewhere in its glowing heart, a vault of real Zcash testnet ZEC is buried. Find it, dig it up, and carry it home before your rival steals it off your back. When two agents play head-to-head, every move is a sealed, signed **shielded Zcash transaction**: on-chain, provable, and invisible to the other player until the match ends.

**Play it now: https://dz1798t62xgz8.cloudfront.net**

No sign-up, no download. Practice against the bot in a minute, then send a friend a link and play for a real testnet prize.

---

## Why we built this

Fog-of-war games have always had a dirty secret: **the fog is fake.** The server sees everything. Your opponent's position sits in a packet on your machine, one wallhack away. And the referee asks you to trust that it didn't peek, didn't nudge the loot, didn't fix the outcome.

Blockchains promise fairness, but public chains make it worse: every move is out in the open for anyone to read, so hidden-information games are impossible on them.

Zcash was built for exactly this. With shielded transactions, both halves work at once:

- **Hidden:** shielded transactions encrypt sender, receiver, amount and memo. Your rival sees *that* you moved. They never see *where* you moved.
- **Provable:** every move is still a real transaction on a public ledger, timestamped and signed by your own key. When the match ends, the viewing key is published and everyone can check that the game was played exactly as it said.

Zonar is a small, playful demo of a big idea: **privacy and verifiability aren't opposites.** You can have a game where nobody can cheat by peeking, nobody can rewrite history, and the payout is a transaction anyone can check.

## What "shielded" means here

A normal (transparent) crypto transaction is a postcard: anyone can read who sent what to whom. A **shielded** Zcash transaction is a sealed envelope that comes with a zero-knowledge proof that the contents are valid. The network checks the proof, never the contents.

In Zonar, that gives you things no ordinary fog-of-war game can:

| | Ordinary online game | Public-chain game | **Zonar** |
|---|---|---|---|
| Rival can't see your moves | Only if the server is honest | ❌ everything is public | ✅ encrypted on-chain |
| Moves can't be rewritten later | Trust the server | ✅ | ✅ signed and anchored |
| Anyone can audit the match afterwards | ❌ | ✅ but no secrets ever | ✅ viewing key published at the end |
| Prize payout you can verify | ❌ | ✅ but in public | ✅ a shielded sweep from the vault to your address |

- **Your agent wallet** lives in your browser, unlocked by your **passkey** (Face ID, Touch ID or a security key). The server can build your transactions but can never spend your money.
- **Each move** is a signed memo inside a shielded transaction sent to the match's vault.
- **The vault** is a fresh shielded wallet per match, funded by the house. The winner sweeps it in one shielded transaction whose memo is their **relic**, a collectible certificate of the win.

## Why it's fun

- **It's a mind game.** You and your rival move at the same time, in secret. You don't know where they are, but they're leaving traces, and so are you.
- **Pings, leaks, chaff and keys.** A ping tells you how close the drop is: Locked, Faint or Static. A leak gives you the exact distance, but flashes your district on the rival's screen. Chaff fakes that flash anywhere you like, to send them the wrong way. A viewing key unlocks a 2×2 patch of the city and shows you the drop or your rival if either is there. Twelve credits, twenty turns. Choose well.
- **Grab it, then run.** Digging up the drop is only half the game. The carrier's position flashes to the rival every other turn, and if they land on your tile they **steal** it. Then *you're* the hunter.
- **It's cute.** A Tamagotchi-style pixel city with cars, fountains, boats and a pet that carries the treasure chest on its head. Toasts after every move, confetti and gold coins when you win.
- **The win is real.** Head-to-head winners get real testnet ZEC and a relic minted from the match's fairness commitment.
- **You can prove you were robbed (or that you weren't).** After every match, your browser replays the whole game itself and checks every clue it was ever shown.

## How to play

1. **Pick a codename and a pet.** Optionally create an agent wallet with your passkey: the house funds it with 24 moves.
2. **Start a match:** practice against GHOST the bot, or create a private match and share the link.
3. **Hunt.** Each turn, seal one move (one step in any direction) and one action. The drop is always somewhere in the central Halo Spire district, C3 to E5.
4. **Dig** when you think you're on it. Found it? The chest jumps onto your pet.
5. **Extract.** Carry it to your own safehouse (A1 if you created the match, G7 if you joined). Arrive with it and you win.
6. **Claim.** In a prize match, sweep the vault into your agent wallet or any testnet address. Then check the fairness proof on the end screen.

## Fair by construction

Nobody, not even the house, chooses where the treasure is:

- Before the match the house publishes a hash commitment to a secret.
- Each player's browser adds its own 32 bytes of randomness.
- The drop is derived from all three, and only once both seats are filled.
- At the end the secret and both randomness values are revealed. Your browser re-derives the drop, checks its own randomness was used, replays every turn through the same rules the server runs, and checks the result against the hash chain anchored on-chain.

If anything doesn't match, the end screen tells you exactly which turn.

---

# For developers

## Run it locally

Requires Node 23.6+ (the server runs its TypeScript directly via Node's type stripping, no build step).

```
npm install
npm run dev                # Next.js dev + game server on :3000 (testnet; needs zingo-cli, see below)
npm run typecheck          # tsc --noEmit, strict
LEDGER=mock npm run dev    # in-memory ledger, no chain
npm run build && npm start # production
npm test
```

Pages: `/` landing, `/play` launch (codename + avatar), `/play/<code>` the match.

## Testnet setup

1. Build zingo-cli (a light wallet that syncs over the Nym mixnet):
   ```
   git clone https://github.com/zingolabs/zingolib ~/src/zingolib && cd ~/src/zingolib
   cargo build --release -p zingo-cli
   cargo run -q --manifest-path tools/workbench/Cargo.toml --bin bundle-nym-proxy -- --release
   ```
   Override the path with `ZINGO_CLI=…`. The indexer defaults to `https://testnet.zec.rocks:443` (`ZINGO_SERVER`).
2. Start the server. It creates the **house wallet** in `.wallets/house` and the landing page shows its address.
3. Fund the house with testnet TAZ from a faucet. Each match costs about `PRIZE_ZAT` (default 0.01 TAZ) plus fees.

## How the chain is used

| When | Transaction | Memo |
| --- | --- | --- |
| Match created | house → fresh per-match **vault** wallet, prize amount | `ZONAR VAULT #id commit <sha256>` |
| After turns | house → vault, zero-value memo note, coalesced to the latest turn | `ZONAR #id T<n> <hash-chain head>` |
| Winner claims | vault → winner's address, everything (`send_all`), after anchoring finishes | the **relic** certificate |
| Draw | vault → house (refund) | `ZONAR REFUND #id` |

- Gameplay never waits on blocks. Chain work runs in the background, and the "On-chain trail" panel links each txid to the testnet explorer.
- **Jointly random drop.** Creating a match, the house publishes `sha256(match|house|secret)`. Each player's browser sends 32 random bytes when it creates or joins, and the drop is derived from the secret plus both entropies only once both seats are filled (`lib/rules.ts`), so neither the house nor either player picks it alone.
- **Full replay.** At the end the secret, both entropies and every turn's orders are revealed. The browser re-derives the drop, checks its own entropy was used, and replays the whole match through the same `resolve` the server runs, comparing every clue it was shown and the outcome. Simultaneous digs are settled from the secret, so the replay is exact.
- The turn hash chain starts at the house commitment and absorbs each turn's orders. At the end the browser re-hashes the revealed transcript and checks it against the anchored head.
- When the match ends, the vault's **viewing key** is published to both players so anyone can decrypt every anchor memo. The vault's **seed** goes only to the winner, who can import it into any testnet wallet instead of using the one-click claim.
- The payout address is requested only on claim, kept on the match only until the sweep is sent, then deleted.

## Persistence and restarts

Every match is saved to `.data/matches/<code>.json` on each change (atomic write). On boot the server reloads them and resumes unfinished chain work:
- a vault still being funded (it first checks the vault's own history for the funding memo, so the house never pays twice)
- missing turn anchors
- the end-of-match settlement
- a pending claim or refund (again checked against the vault's sent memos before sweeping)

Wallet processes that die are restarted with backoff. Failed transmissions (e.g. a mixnet timeout) are removed so their notes unlock, and the step is retried.

## Agent wallets: every move a signed shielded transaction

Players can give their agent a wallet on the launch page. The design follows Zebfin (same author): **the server can build transactions but never spend.**

- **Seed:** created in the browser by the Wasm signer (`public/signer`, built from `builder/crates/zebfin-signer`) and wrapped with XChaCha20-Poly1305 under a key from the passkey's WebAuthn PRF output. Only the wrapped seed is stored, in `localStorage`. Unlocking prompts for the passkey once per tab.
- **Server side:** the game server gets the view-only key (UFVK) and the public half of an Ed25519 order key derived from the seed. `zonar-builder` (Rust, `builder/`, vendoring Zebfin's `zebfin-wallet`) keeps a view-only wallet per agent.
- **Funding:** the house sends each new agent 24 notes of 10,000 zats, the exact fee for one move. Each move spends its own note, so moves don't wait for change to confirm. Refills are capped per player per day and by a daily budget.
- **Each move in a head-to-head match between two agents:**
  1. The browser signs a memo `DD1|match|T<turn>|S<seat>|<move>|<action>|<target>|<ed25519 sig>`.
  2. The server checks the memo and the orders, then asks the builder for a PCZT that pays a zero-value note carrying that memo to the match vault.
  3. The browser decodes the PCZT itself and refuses to sign unless it pays only that note and a normal fee. Then it signs.
  4. The builder combines the signature with its proof (made in parallel) and broadcasts. The move counts once it's on-chain, about 4 seconds end to end.
- **What players see:** txids are public as soon as a move is broadcast. Memos are revealed when the match ends, and each browser re-verifies every move against its agent's key and the replayed transcript. The vault's viewing key is published so anyone can read the memos on-chain.
- **Claiming:** a winner can claim the vault straight into their agent wallet.

The end-to-end test drives two headless browsers with virtual passkeys through this whole flow on testnet:

```
npm run dev                      # testnet, with builder/target/release/zonar-builder built
node test/e2e/onchain.e2e.ts     # several minutes: refills and the claim wait for blocks
```

Build the builder with `cargo build --release -p zonar-builder` in `builder/` (the Docker image does this).

## Prizes, limits and the turn clock

- **Bot matches are practice:** no vault, nothing on-chain. Set `BOT_PRIZE_ZAT` to pay a small bot prize.
- **Head-to-head matches put a vault at stake** when the second player joins, if all of these hold:
  - the two players come from different networks (IPs);
  - each has played fewer than `PRIZE_MATCHES_PER_DAY` prize matches today (default 3);
  - the house has budget left for today (`PRIZE_DAILY_BUDGET_ZAT`, default 0.1 TAZ = 10 matches).

  Otherwise the match is practice, and the players are told why.
- **IPs are never stored.** Daily counts are keyed by an HMAC whose key is regenerated each day (`.data/policy.json`). In development, same-IP matches are allowed so you can test with two tabs; production refuses them (override with `ALLOW_SAME_IP`).
- **Turn clock:** orders are due `TURN_SECONDS` after a turn opens (default 60). Miss the deadline and you hold position with no action. Miss `MAX_MISSED_TURNS` in a row (default 3) and you forfeit. A match link nobody joins expires after `JOIN_MINUTES` (default 30).
- **Vault wallet processes** run only while a step needs them (creating and funding the vault, settlement, the sweep) and are closed afterwards. Finished matches cost nothing at boot.

## Deploying

The server keeps wallet processes and match state alive, so it needs a long-running host with persistent disk (a VPS, Fly.io, Railway). Serverless platforms like Vercel won't work.

**Step-by-step on AWS (one EC2 server behind CloudFront, which gives a free HTTPS address): see [DEPLOY.md](DEPLOY.md).** That's how the live game runs. The rest of this section is the general picture.

```
docker compose up --build -d
```

- **What's in the image:** zingo-cli and its Nym proxy are built from a pinned zingolib commit. Wallets go in the `wallets` volume and match state in `data`. **Back up `wallets`:** it holds the house seed and any unswept vaults.
- **Behind a TLS reverse proxy** (CloudFront, Caddy, nginx), set `TRUST_PROXY=1` so the prize limits see real client IPs (the last `X-Forwarded-For` entry, the one the proxy added). Set `ORIGIN_SECRET` and have the proxy send it as `X-Origin-Secret` to refuse requests that bypass the proxy.
- **House funds:** on first boot a new house wallet is created. Fund its address (shown on the landing page) from a testnet faucet. To reuse an existing house, copy its folder into the `wallets` volume as `house/`.

## Privacy in the UI

- **No third-party requests:** no analytics, no external scripts, enforced by a strict CSP. Fonts come through `next/font`, which self-hosts them at build time. `referrer: no-referrer`.
- **Shoulder-surf guard:** credits are blurred until you peek.
- **Exposure meter:** shows exactly what your sealed orders will reveal to the rival.
- **No accounts:** your codename and match token live only in `localStorage`.

## Layout

- `server/index.ts`: one Node process serving Next.js and the game API (`/api/*`, server-sent events), so wallet processes and match state are long-lived.
- `server/engine.ts`: pure game rules and the turn hash chain.
- `server/chain.ts`: vault, anchor, claim, refund and resume jobs.
- `server/ledger.ts`: zingo-cli REPL driver plus the mock.
- `server/store.ts`: match persistence.
- `server/bot.ts`: the bot rival.
- `app/`: Next.js App Router pages, styled with Tailwind CSS v4 in a light theme.
- `components/`: city map, avatars, board, orders, panels and modals.
- `lib/`: code shared by the server and the browser: `types.ts` (game, intel, chain and view types), `city.ts` (districts and map layout), `belief.ts` (deduction), `avatars.ts`, `relic.ts`, `game.ts`, `api.ts`.

Everything is TypeScript in `strict` mode. Relative imports carry their `.ts` extension and the code sticks to erasable syntax (`erasableSyntaxOnly`), so the same files run under Node directly and under Next's compiler.

## Rule choices

- **The city:** 7×7 tiles in 9 districts, sized 2-3-2 across each row and column, so the city has a true centre. The safehouses are A1 and G7.
- **The drop:** always buried in the central district, Halo Spire (C3–E5). Every tile there mirrors another that is just as far from the other safehouse, and the centre tile D4 is 3 steps from both. Over 4,000 bot-vs-bot games each seat won about 50%.
- **Distance:** Chebyshev (diagonal moves count as 1). Ping readings: Locked ≤1, Faint ≤3, Static beyond.
- **Costs:** ping 1, leak 1, chaff 2, viewing key 4, dig free; 12 starting credits.
- **Flashes:** a leak flashes the sender's whole **district**, and chaff flashes any district. Districts are 2×2, 2×3 or 3×3.
- **Resolution order:** spend → move → collision/steal → dig → intel → carrier exposure → win/draw. Simultaneous digs on the drop are settled by a tie-break derived from the house secret, so the replay is exact.
