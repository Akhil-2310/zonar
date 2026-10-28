import Link from 'next/link';
import { Icon } from './Pixel';

export default function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2 font-tiny text-[15px] font-bold tracking-[0.12em] text-ink">
      <Icon name="coin" size={30} className="transition group-hover:-translate-y-0.5" />
      ZONAR
    </Link>
  );
}
