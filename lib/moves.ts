// The on-chain record of a sealed move. In an on-chain match every move is a shielded
// transaction from the player's agent wallet to the match vault, carrying this memo:
//
//   DD1|<match>|T<turn>|S<seat>|<dx>,<dy>|<action>|<tx>,<ty or ->|<ed25519 signature, base64>
//
// The signature is made in the player's browser with an order key derived from their
// seed, so the server can't alter a move without the alteration being detectable by
// anyone holding the vault's viewing key (published when the match ends).
import { ed25519 } from '@noble/curves/ed25519';
import type { Orders, OrdersInput, Seat } from './types.ts';

const enc = new TextEncoder();

export function memoBody(matchId: string, turn: number, seat: Seat, o: OrdersInput): string {
  const target = o.target ? `${o.target.x},${o.target.y}` : '-';
  return `DD1|${matchId}|T${turn}|S${seat}|${o.move.dx},${o.move.dy}|${o.action}|${target}`;
}

export function signMemo(body: string, orderKey: Uint8Array): string {
  return `${body}|${toB64(ed25519.sign(enc.encode(body), orderKey))}`;
}

// Splits a signed memo and checks the signature. Returns the signed body, or null if forged.
export function verifyMemo(memo: string, orderPub: Uint8Array): string | null {
  const cut = memo.lastIndexOf('|');
  if (cut < 0) return null;
  const body = memo.slice(0, cut);
  try {
    return ed25519.verify(fromB64(memo.slice(cut + 1)), enc.encode(body), orderPub) ? body : null;
  } catch {
    return null;
  }
}

// A move memo is valid for these orders only if it is exactly their canonical form, signed.
export function memoMatches(memo: string, orderPub: Uint8Array, matchId: string, turn: number, seat: Seat, o: Orders | OrdersInput): boolean {
  return verifyMemo(memo, orderPub) === memoBody(matchId, turn, seat, o);
}

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
