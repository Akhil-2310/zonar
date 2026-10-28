import { VAULT_DISTRICT, cityLayout } from '@/lib/city';

const city = cityLayout();
const V = { x: VAULT_DISTRICT.x * 100, y: VAULT_DISTRICT.y * 100, w: VAULT_DISTRICT.w * 100, h: VAULT_DISTRICT.h * 100 };
const SHADES = ['#E7E0D2', '#DED6C6', '#EDE7DB'];
const r1 = (n: number) => Math.round(n * 10) / 10;

// The surveilled city, light theme: paper streets, stone blocks, green parks.
export default function CityMap({ labels = true, className = '' }: { labels?: boolean; className?: string }) {
  const W = city.size;
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className={`block h-full w-full ${className}`} aria-hidden="true">
      <rect width={W} height={W} fill="#F3EEE4" />
      {city.avenues.map((a) => (
        <g key={a}>
          <rect x={a - 6} y="0" width="12" height={W} fill="#ECE5D7" />
          <rect x="0" y={a - 6} width={W} height="12" fill="#ECE5D7" />
          <line x1={a} y1="0" x2={a} y2={W} stroke="#FFFFFF" strokeDasharray="7 9" strokeWidth="1.4" />
          <line x1="0" y1={a} x2={W} y2={a} stroke="#FFFFFF" strokeDasharray="7 9" strokeWidth="1.4" />
        </g>
      ))}
      {city.water.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} fill="#CFE4F2" />
      ))}
      {city.blocks.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="4" fill="#FBF8F2" stroke="#E4DCCC" strokeWidth="1" />
      ))}
      {city.parks.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx="3" fill="#DCEBCD" />
      ))}
      {city.trees.map((t, i) => (
        <circle key={i} cx={r1(t.x)} cy={r1(t.y)} r={r1(t.r)} fill="#AFCF95" />
      ))}
      {city.buildings.map((b, i) => (
        <rect key={i} x={r1(b.x)} y={r1(b.y)} width={r1(b.w)} height={r1(b.h)} rx="1.5" fill={SHADES[b.shade]} />
      ))}
      {city.roofs.map((r, i) => (
        <rect key={i} x={r1(r.x)} y={r1(r.y)} width={r1(r.w)} height={r1(r.h)} fill="#D2C8B5" />
      ))}
      {city.landmarks.map((l, i) => (
        <g key={i}>
          <circle cx={l.x} cy={l.y} r="18" fill="none" stroke="#E0A419" strokeWidth="2.5" />
          <circle cx={l.x} cy={l.y} r="8" fill="#F4B728" />
        </g>
      ))}
      {city.cams.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3" fill="#E5484D" className="animate-cam" style={{ animationDelay: `${c.phase}s` }} />
      ))}
      {labels && <rect x={V.x + 4} y={V.y + 4} width={V.w - 8} height={V.h - 8} rx="10" fill="none" stroke="#E0A419" strokeWidth="3" strokeDasharray="10 8" opacity="0.8" />}
      {labels &&
        city.labels.map((l) => (
          <text
            key={l.name}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-mono"
            fontSize="10"
            fontWeight="700"
            letterSpacing="2"
            fill="#A87B0C"
            stroke="#FBF8F1"
            strokeWidth="4"
            paintOrder="stroke"
          >
            {l.name.toUpperCase()}
          </text>
        ))}
    </svg>
  );
}

// District names on their own layer so they sit above the fog.
// District names and the vault district's outline, on their own layer above the fog.
export function CityLabels() {
  const W = city.size;
  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <rect x={V.x + 4} y={V.y + 4} width={V.w - 8} height={V.h - 8} rx="10" fill="none" stroke="#E0A419" strokeWidth="3" strokeDasharray="10 8" opacity="0.8" />
      <text x={V.x + V.w / 2} y={V.y + V.h - 14} textAnchor="middle" className="font-mono" fontSize="9" fontWeight="700" letterSpacing="2" fill="#A87B0C" stroke="#FBF8F1" strokeWidth="4" paintOrder="stroke">
        THE DROP IS IN HERE
      </text>
      {city.labels.map((l) => (
        <text
          key={l.name}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-mono"
          fontSize="10"
          fontWeight="700"
          letterSpacing="2"
          fill="#A87B0C"
          stroke="#FBF8F1"
          strokeWidth="4"
          paintOrder="stroke"
        >
          {l.name.toUpperCase()}
        </text>
      ))}
    </svg>
  );
}
