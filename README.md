# Zonar

Two agents hunt a vault of **real Zcash testnet ZEC** buried in the heart of a surveilled 7×7 city. The winner sweeps the vault to their own address in one shielded transaction and keeps a relic, a collectible generated from the match's fairness commitment.

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

```
docker compose up --build -d
```

- **What's in the image:** zingo-cli and its Nym proxy are built from a pinned zingolib commit. Wallets go in the `wallets` volume and match state in `data`. **Back up `wallets`:** it holds the house seed and any unswept vaults.
- **Behind a TLS reverse proxy** (Caddy, nginx), set `TRUST_PROXY=1` so the prize limits see real client IPs.
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
- **Resolution order:** spend → move → collision/steal → dig → intel → carrier exposure → win/draw. Simultaneous digs on the drop are decided by a coin flip.
