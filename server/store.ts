// Matches live on disk so a restart never strands a vault mid-claim.
// One JSON file per match, written atomically (tmp file + rename).
import fs from 'node:fs';
import path from 'node:path';
import type { Match } from './engine.ts';

export class MatchStore {
  private dir: string;
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  #file(id: string) {
    return path.join(this.dir, `${id}.json`);
  }

  // Coalesce bursts of updates (a turn resolving, a chain job finishing) into one write.
  save(match: Match) {
    if (this.timers.has(match.id)) return;
    this.timers.set(
      match.id,
      setTimeout(() => {
        this.timers.delete(match.id);
        this.saveNow(match);
      }, 50),
    );
  }

  saveNow(match: Match) {
    const tmp = this.#file(match.id) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(match));
    fs.renameSync(tmp, this.#file(match.id));
  }

  flush(matches: Iterable<Match>) {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const m of matches) this.saveNow(m);
  }

  loadAll(): Match[] {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')) as Match);
  }
}
