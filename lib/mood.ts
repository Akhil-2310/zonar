// How each pet feels right now, read straight from the game state, with a line for its speech bubble.
import { candidates } from './belief.ts';
import { lastTurn } from './game.ts';
import type { Mood } from './sprites.ts';
import type { GameView } from './types.ts';

export type PetMood = { mood: Mood; line: string };

export function yourMood(v: GameView): PetMood {
  const lt = lastTurn(v);
  if (v.phase === 'waiting') return { mood: 'sleepy', line: 'Waiting for a rival agent…' };
  if (v.phase === 'over' && v.result) {
    if (v.result.winner === v.seat) return { mood: 'party', line: 'We did it! The vault is ours!' };
    if (v.result.winner === null) return { mood: 'sleepy', line: 'Nobody got it. Rematch?' };
    return { mood: 'sad', line: 'They got away with it…' };
  }
  const exposedNow = v.intel.some((e) => e.type === 'exposed' && e.turn === lt);
  if (v.you.carrying) return exposedNow ? { mood: 'nervous', line: "They can see me! Keep moving!" } : { mood: 'proud', line: 'Got it! Heading home.' };
  if (v.rival?.carrying) return { mood: 'angry', line: 'They have the drop. Chase them!' };
  if (v.you.locked) return { mood: 'sleepy', line: 'Orders sealed. Waiting…' };
  if (v.intel.some((e) => e.type === 'flash' && e.turn === lt)) return { mood: 'nervous', line: 'A leak flashed… or was it chaff?' };
  if (v.you.credits <= 2) return { mood: 'hungry', line: 'So hungry for intel… credits low.' };
  const c = candidates(v);
  if (c && c.length <= 2) return { mood: 'happy', line: 'I can smell it! Dig!' };
  return { mood: 'curious', line: 'Sniffing around for the drop…' };
}

export function rivalMood(v: GameView): Mood {
  if (!v.rival) return 'sleepy';
  if (v.phase === 'over' && v.result) return v.result.winner === v.seat ? 'sad' : v.result.winner === null ? 'sleepy' : 'party';
  if (v.rival.carrying) return 'proud';
  if (v.you.carrying) return 'angry';
  return v.rival.locked ? 'sleepy' : 'curious';
}
