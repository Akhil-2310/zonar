// Who plays for real money. Bot games are practice unless BOT_PRIZE_ZAT is set;
// player-vs-player prize matches need two different players (by IP), each under
// a daily cap, and a house-wide daily budget. IPs are never stored: counts are
// keyed by an HMAC whose key is regenerated every day.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type PolicyConfig = {
  prizeZat: number;
  botPrizeZat: number;
  dailyBudgetZat: number;
  perPlayerDaily: number;
  allowSameIp: boolean;
};
export type Decision = { prizeZat: number; note?: string };

type DayState = { day: string; key: string; spentZat: number; perPlayer: Record<string, number> };

const today = () => new Date().toISOString().slice(0, 10);
const freshDay = (): DayState => ({ day: today(), key: crypto.randomBytes(32).toString('hex'), spentZat: 0, perPlayer: {} });

export class PrizePolicy {
  readonly config: PolicyConfig;
  private file: string;
  private state: DayState;

  constructor(file: string, config: PolicyConfig) {
    this.file = file;
    this.config = config;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      this.state = JSON.parse(fs.readFileSync(file, 'utf8')) as DayState;
    } catch {
      this.state = freshDay();
    }
  }

  // A new day forgets yesterday's counts and its key, so old entries can't be linked to anyone.
  #roll() {
    if (this.state.day !== today()) this.state = freshDay();
  }

  #player(ip: string) {
    return crypto.createHmac('sha256', this.state.key).update(ip).digest('hex').slice(0, 16);
  }

  #save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state));
    fs.renameSync(this.file + '.tmp', this.file);
  }

  prizeMatchesLeftToday(): number {
    this.#roll();
    return Math.max(0, Math.floor((this.config.dailyBudgetZat - this.state.spentZat) / this.config.prizeZat));
  }

  // Decide once, when a match starts, and spend the budget up front.
  decide({ vsBot, ips }: { vsBot: boolean; ips: string[] }): Decision {
    this.#roll();
    const { botPrizeZat, prizeZat, dailyBudgetZat, perPlayerDaily, allowSameIp } = this.config;
    const humans = vsBot ? ips.slice(0, 1) : ips;
    const prize = vsBot ? botPrizeZat : prizeZat;
    if (prize <= 0) return { prizeZat: 0, note: 'Bot matches are practice: no ZEC at stake.' };
    if (!vsBot && !allowSameIp && humans[0] === humans[1]) {
      return { prizeZat: 0, note: 'Both agents joined from the same network, so this is a practice match.' };
    }
    if (this.state.spentZat + prize > dailyBudgetZat) {
      return { prizeZat: 0, note: "Today's prize budget is spent, so this is a practice match. Prizes return tomorrow." };
    }
    const ids = humans.map((ip) => this.#player(ip));
    if (ids.some((id) => (this.state.perPlayer[id] ?? 0) >= perPlayerDaily)) {
      return { prizeZat: 0, note: `A player has reached today's limit of ${perPlayerDaily} prize matches, so this is a practice match.` };
    }
    this.state.spentZat += prize;
    for (const id of new Set(ids)) this.state.perPlayer[id] = (this.state.perPlayer[id] ?? 0) + 1;
    this.#save();
    return { prizeZat: prize };
  }
}

// Testnet allowance for new agent wallets: each grant is capped per player (hashed IP)
// and against a house-wide daily budget, on the same rotating-key scheme as prizes.
export class DripPolicy {
  private file: string;
  private state: DayState;
  readonly perPlayerDaily: number;
  readonly dailyBudgetZat: number;

  constructor(file: string, { perPlayerDaily, dailyBudgetZat }: { perPlayerDaily: number; dailyBudgetZat: number }) {
    this.file = file;
    this.perPlayerDaily = perPlayerDaily;
    this.dailyBudgetZat = dailyBudgetZat;
    try {
      this.state = JSON.parse(fs.readFileSync(file, 'utf8')) as DayState;
    } catch {
      this.state = freshDay();
    }
  }

  // Returns null if granted (and records it), or why not.
  grant(ip: string, zat: number): string | null {
    if (this.state.day !== today()) this.state = freshDay();
    const id = crypto.createHmac('sha256', this.state.key).update(ip).digest('hex').slice(0, 16);
    if ((this.state.perPlayer[id] ?? 0) >= this.perPlayerDaily) return `You've had today's ${this.perPlayerDaily} free refills.`;
    if (this.state.spentZat + zat > this.dailyBudgetZat) return "Today's refill budget is spent. Try again tomorrow.";
    this.state.spentZat += zat;
    this.state.perPlayer[id] = (this.state.perPlayer[id] ?? 0) + 1;
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state));
    fs.renameSync(this.file + '.tmp', this.file);
    return null;
  }
}
