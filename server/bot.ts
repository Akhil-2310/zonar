// A simple AI rival that plays only from its own view (no peeking at the drop).
import { candidates, lastSeenRival, dist, same, DIRS } from '../lib/belief.ts';
import type { Dir, OrdersInput, Pos, View } from '../lib/types.ts';

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function botOrders(view: View): OrdersInput {
  const { you, size, costs, turn } = view;
  const rival = view.rival!;
  const inBounds = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < size && p.y < size;
  const moves = DIRS.filter((d) => inBounds({ x: you.pos.x + d.dx, y: you.pos.y + d.dy }));
  const after = (d: Dir): Pos => ({ x: you.pos.x + d.dx, y: you.pos.y + d.dy });
  const toward = (target: Pos, avoid?: Pos | null): Dir => {
    const score = (d: Dir) => {
      const p = after(d);
      const manhattan = Math.abs(p.x - target.x) + Math.abs(p.y - target.y);
      return dist(p, target) * 10 + manhattan + (avoid && dist(p, avoid) <= 1 ? 25 : 0) + Math.random();
    };
    return moves.reduce((best, d) => (score(d) < score(best) ? d : best));
  };
  const seen = lastSeenRival(view);

  if (you.carrying) {
    const avoid = seen && turn - seen.turn <= 2 ? seen.at : null;
    const move = toward(you.home, avoid);
    // Throw chaff toward the far side of the board to pull the hunter away.
    if (you.credits >= costs.chaff && Math.random() < 0.35) {
      return { move, action: 'chaff', target: { x: size - 1 - you.pos.x, y: you.pos.y } };
    }
    return { move, action: 'none' };
  }

  if (rival.carrying) {
    // Intercept: head for the carrier if recently seen, otherwise guard the route to their safehouse.
    const target = seen && turn - seen.turn <= 2 ? seen.at : { x: (rival.home.x + you.pos.x) >> 1, y: (rival.home.y + you.pos.y) >> 1 };
    return { move: toward(target), action: 'none' };
  }

  const cands = candidates(view) ?? [];
  const center = { x: size >> 1, y: size >> 1 };
  const target = cands.length ? cands.reduce((best, c) => (dist(you.pos, c) < dist(you.pos, best) ? c : best)) : center;
  const move = toward(target);
  const next = after(move);
  const onCandidate = cands.some((c) => same(c, next));

  if (onCandidate && (cands.length <= 4 || you.credits === 0)) return { move, action: 'dig' };
  if (you.credits >= costs.viewkey && cands.length >= 6 && turn >= 3 && Math.random() < 0.3) {
    let best = { x: 0, y: 0, n: -1 };
    for (let y = 0; y < size - 1; y++)
      for (let x = 0; x < size - 1; x++) {
        const n = cands.filter((c) => c.x - x >= 0 && c.x - x < 2 && c.y - y >= 0 && c.y - y < 2).length;
        if (n > best.n) best = { x, y, n };
      }
    return { move, action: 'viewkey', target: { x: best.x, y: best.y } };
  }
  if (cands.length && you.credits > 6 && Math.random() < 0.1) {
    return { move, action: 'chaff', target: pick(cands) };
  }
  if (you.credits >= costs.leak && cands.length > 8 && Math.random() < 0.3) return { move, action: 'leak' };
  if (you.credits >= costs.ping) return { move, action: 'ping' };
  return { move, action: onCandidate ? 'dig' : 'none' };
}
