// The winner's collectible: a vault relic whose art is derived from the
// match's fairness commitment, so every relic is unique and verifiable.
import { districtOf, tileName } from './city.ts';
import type { Pos } from './types.ts';

export type RelicInput = { matchId: string; commitment: string; drop: Pos; turn: number; codename: string; sweepTxid?: string; practice?: boolean };

export function relicSVG({ matchId, commitment, drop, turn, codename, sweepTxid, practice }: RelicInput): string {
  const bytes = (commitment.match(/../g) ?? []).map((h) => parseInt(h, 16));
  const cx = 200;
  const cy = 190;
  const rays = bytes
    .slice(0, 24)
    .map((b, i) => {
      const a = (i / 24) * Math.PI * 2;
      const r1 = 92;
      const r2 = 100 + (b / 255) * 34;
      return `<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cy + Math.sin(a) * r2}" stroke="#E0A419" stroke-width="${1 + (b % 4)}" stroke-linecap="round" opacity="${0.45 + (b / 255) * 0.55}"/>`;
    })
    .join('');
  // The 6×6 city as a grid of dots; the drop's tile is lit.
  const grid = [];
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 6; x++) {
      const hit = x === drop.x && y === drop.y;
      grid.push(`<rect x="${cx - 33 + x * 11}" y="${cy - 33 + y * 11}" width="8" height="8" rx="1.5" fill="${hit ? '#F4B728' : '#EADFC4'}"/>`);
    }
  const esc = (s: string | number) => String(s).replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="400" height="520">
  <defs>
    <radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#FFFBEF"/><stop offset="1" stop-color="#F6ECD3"/></radialGradient>
  </defs>
  <rect width="400" height="520" rx="22" fill="url(#g)"/>
  <rect x="10" y="10" width="380" height="500" rx="16" fill="none" stroke="#E0A419" stroke-opacity=".5"/>
  ${rays}
  <circle cx="${cx}" cy="${cy}" r="86" fill="#FFFDF7" stroke="#E0A419" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="76" fill="none" stroke="#E0A419" stroke-opacity=".35" stroke-dasharray="2 5"/>
  ${grid.join('')}
  <text x="200" y="352" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="13" letter-spacing="5" fill="#B7860B">DEAD DROP RELIC</text>
  <text x="200" y="384" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22" font-weight="700" fill="#1F1A14">${esc(districtOf(drop))} · ${tileName(drop)}</text>
  <text x="200" y="410" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="12" fill="#6B6153">match ${esc(matchId)} · extracted turn ${turn} · ${esc(codename)}</text>
  <text x="200" y="448" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="9.5" fill="#9A8F7C">commit ${commitment.slice(0, 32)}</text>
  <text x="200" y="462" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="9.5" fill="#9A8F7C">${commitment.slice(32)}</text>
  <text x="200" y="490" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="9.5" fill="#B7860B">${practice ? 'practice relic · not on-chain' : sweepTxid ? 'sealed in testnet tx ' + sweepTxid.slice(0, 20) + '…' : 'unsealed: claim to anchor on testnet'}</text>
</svg>`;
}
