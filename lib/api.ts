// Browser-side helpers for the game API.
export type Session = { matchId: string; token: string };

export async function api<T = { ok: true }>(path: string, body?: object): Promise<T> {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data as T;
}

export const ZAT = 1e8;
export const taz = (zat: number) => (zat / ZAT).toFixed(zat >= ZAT / 100 ? 3 : 5) + ' TAZ';
export const short = (h: string) => h.slice(0, 8) + '…' + h.slice(-4);

// localStorage can throw (private windows, blocked storage); the game works without it.
function read(key: string): string | null {
  try {
    return localStorage.getItem('deaddrop:' + key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem('deaddrop:' + key, value);
  } catch {}
}

// Match tokens stay in this browser only.
export const session = {
  get: (matchId: string) => read(matchId),
  set: (matchId: string, token: string) => write(matchId, token),
};
// The randomness this browser added to a match's drop, kept to check against the reveal.
export const entropy = {
  fresh: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''),
  get: (matchId: string) => read('entropy:' + matchId),
  set: (matchId: string, hex: string) => write('entropy:' + matchId, hex),
};
export const prefs = {
  get: (key: string, fallback = '') => read(key) ?? fallback,
  set: (key: string, value: string) => write(key, value),
};
