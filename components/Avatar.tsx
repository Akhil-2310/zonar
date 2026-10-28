import { avatarById, type AvatarSpec } from '@/lib/avatars';

type Props = { id?: string; size?: number; ring?: 'you' | 'rival'; className?: string };

// Flat-illustrated agent portrait drawn in a 64×64 box.
export default function Avatar({ id, size = 48, ring, className = '' }: Props) {
  const a = avatarById(id);
  const ringColor = ring === 'you' ? '#F4B728' : ring === 'rival' ? '#2F6FED' : null;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`${a.name} avatar`}
    >
      <defs>
        <clipPath id={`clip-${a.id}`}>
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill={a.bg} />
      <g clipPath={`url(#clip-${a.id})`}>
        {/* shoulders */}
        <path d="M8 66c2-13 12-19 24-19s22 6 24 19z" fill={a.jacket} />
        <rect x="27" y="38" width="10" height="10" rx="4" fill={a.skin} />
        {a.gear === 'hood' && <path d="M13 64c0-26 7-46 19-46s19 20 19 46z" fill={a.jacket} />}
        {/* head */}
        <ellipse cx="32" cy="29" rx="11" ry="12.5" fill={a.skin} />
        <Hair a={a} />
        <Face a={a} />
        <Gear a={a} />
      </g>
      {ringColor && <circle cx="32" cy="32" r="30" fill="none" stroke={ringColor} strokeWidth="3.5" />}
    </svg>
  );
}

function Hair({ a }: { a: AvatarSpec }) {
  switch (a.hairStyle) {
    case 'bob':
      return <path d="M20 30c-1-11 5-17 12-17s13 6 12 17l-2 7c0-6-1-12-3-14-3 3-10 4-17 3-1 3-1 7-1 11z" fill={a.hair} />;
    case 'short':
      return <path d="M21 26c0-8 5-12 11-12s11 4 11 12c-3-4-7-5-11-5s-8 1-11 5z" fill={a.hair} />;
    case 'curly':
      return (
        <g fill={a.hair}>
          {[20, 25, 30, 35, 40, 44].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 18 : 20} r="5" />
          ))}
        </g>
      );
    case 'spiky':
      return <path d="M20 25l2-9 4 5 3-8 3 7 4-7 2 8 5-4-1 9c-4-3-8-4-11-4s-8 1-11 3z" fill={a.hair} />;
    default:
      return null;
  }
}

function Face({ a }: { a: AvatarSpec }) {
  if (a.eyes) {
    // The bot: a void with glowing eyes.
    return (
      <g fill={a.eyes}>
        <ellipse cx="27.5" cy="30" rx="2.6" ry="1.8" />
        <ellipse cx="36.5" cy="30" rx="2.6" ry="1.8" />
      </g>
    );
  }
  return (
    <g>
      {a.gear !== 'shades' && (
        <g fill="#1F1A14">
          <circle cx="27.5" cy="30" r="1.4" />
          <circle cx="36.5" cy="30" r="1.4" />
        </g>
      )}
      {a.gear !== 'mask' && <path d="M29 36.5c1.8 1.3 4.2 1.3 6 0" stroke="#1F1A14" strokeWidth="1.3" fill="none" strokeLinecap="round" />}
    </g>
  );
}

function Gear({ a }: { a: AvatarSpec }) {
  switch (a.gear) {
    case 'shades':
      return (
        <g>
          <rect x="21" y="27" width="9.5" height="5.5" rx="2" fill="#111" />
          <rect x="33.5" y="27" width="9.5" height="5.5" rx="2" fill="#111" />
          <rect x="30" y="28.5" width="4" height="1.4" fill="#111" />
          <rect x="22.5" y="28" width="3" height="1.2" rx=".6" fill="#F4B728" opacity=".8" />
        </g>
      );
    case 'hood':
      return <path d="M19 30c0-11 6-17 13-17s13 6 13 17c-3-6-8-9-13-9s-10 3-13 9z" fill={a.jacket} />;
    case 'beanie':
      return (
        <g>
          <path d="M20 24c0-8 5-12 12-12s12 4 12 12z" fill="#D9534F" />
          <rect x="19" y="22" width="26" height="5" rx="2.5" fill="#B94541" />
          <circle cx="32" cy="11" r="3" fill="#F4B728" />
          <path d="M22 44c6 3 14 3 20 0v5H22z" fill="#F4B728" />
        </g>
      );
    case 'headset':
      return (
        <g fill="none" stroke="#1F2937" strokeWidth="2.4">
          <path d="M20 29c0-9 5-14 12-14s12 5 12 14" />
          <rect x="17.5" y="26" width="5" height="8" rx="2" fill="#1F2937" />
          <rect x="41.5" y="26" width="5" height="8" rx="2" fill="#1F2937" />
          <path d="M44 33c0 4-4 6-8 6" strokeWidth="1.6" />
        </g>
      );
    case 'fedora':
      return (
        <g>
          <ellipse cx="32" cy="21" rx="17" ry="3.5" fill="#3F3A34" />
          <path d="M23 21c0-7 4-10 9-10s9 3 9 10z" fill="#4B453E" />
          <rect x="23" y="17" width="18" height="2.6" fill="#F4B728" />
        </g>
      );
    case 'mask':
      return <path d="M21 32h22v4c0 5-5 9-11 9s-11-4-11-9z" fill="#6D28D9" />;
    default:
      return null;
  }
}
