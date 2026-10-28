# Deploying Zonar on AWS

One AWS Lightsail server runs everything: the game, the zingo wallets and the transaction builder.
A Lightsail **distribution** (CloudFront) sits in front of it and gives it a free HTTPS address like
`https://d1abc23xyz.cloudfront.net`. That address is what you share with players, and passkeys work on it.

```
Players ──HTTPS──▶ Lightsail distribution (d1abc….cloudfront.net) ──HTTP:80──▶ Lightsail server
                                                                               ├─ Docker: Zonar
                                                                               └─ ~/zonar/.wallets  ~/zonar/.data
```

Time: about 45 minutes, most of it waiting for the first build. Cost: about $24/month for the server,
plus the distribution plan (check Lightsail's pricing page).

> **Pick your address once.** Passkey wallets are tied to the site's address. If you later move to a
> different address (say, your own domain), players have to create new agents. Their funds are safe
> if they saved their seed phrase.

---

## 1. Create the server (about 5 minutes)

1. Open **https://lightsail.aws.amazon.com** and click **Create instance**.
2. **Region:** the one closest to you and your players.
3. **Platform:** Linux/Unix. **Blueprint:** *OS Only* → **Ubuntu 24.04 LTS**.
4. **Plan:** the **4 GB RAM / 2 vCPU** plan, **dual-stack** (with a public IPv4). Smaller plans run out of memory while building.
5. Name it `zonar` and click **Create instance**.
6. Open the instance → **Networking**:
   - **Create static IP** and attach it to `zonar`, so the address never changes.
   - Under **IPv4 Firewall**, check that **SSH (22)** and **HTTP (80)** are listed. Add HTTP if it isn't.

## 2. Install and start the game (about 20 minutes, mostly waiting)

1. On the instance page, click **Connect using SSH**. A terminal opens in your browser.
2. Paste:

   ```bash
   git clone https://github.com/Akhil-2310/zonar.git && cd zonar && sudo bash deploy/setup.sh
   ```

   The script:
   - adds 4 GB of swap
   - installs Docker
   - creates `.env` with a random **origin secret**
   - builds the image and starts the game

   When it finishes, it prints the house info and the **`X-Origin-Secret`** value. Copy that value; you need it in step 4.
3. Lost the secret? Print it again with:

   ```bash
   grep ORIGIN_SECRET ~/zonar/.env
   ```

## 3. Bring your house wallet (about 5 minutes)

The house wallet pays for prize vaults and players' first moves.

**Option A: move your existing funded house (recommended).**

1. On your computer, in the project folder:

   ```bash
   tar czf house.tgz .wallets/house
   ```

2. In the browser SSH window, click the **gear icon → Upload file** and choose `house.tgz`. It lands in the home folder.
3. On the server:

   ```bash
   cd ~/zonar && sudo bash deploy/import-house.sh ~/house.tgz
   ```

4. **Stop running the game on your computer from now on.** Two copies of one wallet spending at once will collide.

**Option B: start fresh.** Skip this step. The server made a new house on first boot. After step 4,
copy its address from the landing page and fund it from a testnet faucet.

Don't copy `.wallets/agents`: those passkey wallets belong to `localhost` and won't work on the new address.

## 4. HTTPS with a Lightsail distribution (about 10 minutes, plus up to 15 to go live)

1. In Lightsail, open **Networking → Create distribution**.
2. **Choose your origin:** the `zonar` instance. **Origin protocol policy:** *HTTP only*.
3. **Caching:** choose **Cache nothing**, so moves and the live match stream always reach the server.
4. **Advanced settings:**
   - **Allowed HTTP methods:** *GET, HEAD, OPTIONS, PUT, PATCH, POST, DELETE*.
   - **Forward query strings:** **All**. The live stream uses them.
   - **Custom origin header:** name `X-Origin-Secret`, value = the secret from step 2.
5. Pick the smallest plan, name it `zonar`, and click **Create distribution**.
6. Wait until the status says **Enabled**, then copy the **default domain**, for example `d1abc23xyz.cloudfront.net`.

The server refuses any request that doesn't carry the secret header, so visiting the static IP directly
shows "Open Zonar through its public link." That's intended: it stops people bypassing CloudFront to fake their address.

## 5. Check it works

1. Open `https://<your default domain>` and play a match against the bot.
2. Create an agent wallet with your passkey. The house sends it 24 moves; they're spendable after about a block (~75 seconds).
3. From a second device on a different network (a phone on mobile data), join a private match.
   Each move should show up as an on-chain transaction, and the winner can claim the prize.

Same-network players still play, but as practice, because prizes need two different networks.

## 6. Backups

- **Lightsail snapshots:** instance → **Snapshots** → turn on **Automatic snapshots** (daily).
- **Off-server copy** of the wallets, every so often:

  ```bash
  cd ~/zonar && sudo tar czf ~/zonar-wallets-$(date +%F).tgz .wallets .data
  ```

  Download it with the SSH window's **gear → Download file**.
  `.wallets` holds the house seed and any unswept vaults; lose it and their testnet funds are gone.

## Day-to-day

From `~/zonar` on the server:

| What | Command |
|---|---|
| Watch the logs | `docker compose logs -f --tail 100` |
| Restart | `docker compose restart` |
| Update to the latest code | `git pull && docker compose up -d --build` |
| Stop | `docker compose down` |
| House balance | open the landing page |

Matches and wallets survive restarts and updates; unfinished payouts resume on boot.

## Settings

Edit `docker-compose.prod.yml` (or add lines to `.env`), then run `docker compose up -d`.

| Setting | Default | What it does |
|---|---|---|
| `PRIZE_ZAT` | `1000000` | Prize per head-to-head win (0.01 TAZ) |
| `PRIZE_DAILY_BUDGET_ZAT` | `10000000` | Most the house pays in prizes per day |
| `PRIZE_MATCHES_PER_DAY` | `3` | Prize matches per player per day |
| `TURN_SECONDS` | `60` | Turn clock (on-chain matches get 90) |
| `ALLOW_SAME_IP` | `0` | `1` lets two tabs on one network play for prizes (testing only) |

## Troubleshooting

- **The build stops with "killed" or out of memory:** check swap with `swapon --show`, then run `docker compose build` again.
- **The distribution shows a 502 or 504 error:** check the game is up (`docker compose ps`) and that HTTP (80) is open in the instance firewall.
- **"Open Zonar through its public link" on the CloudFront address:** the distribution's `X-Origin-Secret` doesn't match `.env`. Fix it in the distribution's settings.
- **Passkey errors:** use the `https://…cloudfront.net` address, never the IP.
- **Match stream keeps reconnecting:** make sure the distribution forwards **all query strings** and caches nothing.
