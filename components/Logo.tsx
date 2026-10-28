import Link from 'next/link';

export default function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-display text-[15px] font-bold tracking-[0.18em] text-ink">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#F4B728" />
        <path d="M10 10h12v2.6L14.2 20H22v2.6H10v-2.6L17.8 12.6H10z" fill="#1F1A14" />
        <rect x="15" y="6" width="2" height="4" fill="#1F1A14" />
        <rect x="15" y="22" width="2" height="4" fill="#1F1A14" />
      </svg>
      DEAD DROP
    </Link>
  );
}
