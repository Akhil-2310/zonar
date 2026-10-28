import type { ReactNode } from 'react';

type Shell = 'pink' | 'mint' | 'lilac' | 'butter';
const SHELL: Record<Shell, { body: string; deep: string }> = {
  pink: { body: '#ffc7da', deep: '#f08db1' },
  mint: { body: '#bff0d6', deep: '#6fcf9f' },
  lilac: { body: '#ddd0ff', deep: '#a58beb' },
  butter: { body: '#ffe7a0', deep: '#f2b84b' },
};

type Button = { label: string; onClick?: () => void; disabled?: boolean; big?: boolean; glyph: string };

// The handheld: an egg of glossy toy plastic with a keychain loop, a screen bezel and three buttons.
export default function Device({
  children,
  top,
  bottom,
  buttons,
  shell = 'pink',
  brand = 'DEAD DROP',
  className = '',
}: {
  children: ReactNode;
  top?: ReactNode;
  bottom?: ReactNode;
  buttons?: [Button, Button, Button];
  shell?: Shell;
  brand?: string;
  className?: string;
}) {
  const s = SHELL[shell];
  return (
    <div className={`relative mx-auto w-full max-w-[640px] pt-7 ${className}`}>
      {/* keychain loop */}
      <div className="absolute left-1/2 top-0 z-0 h-12 w-12 -translate-x-1/2 rounded-full border-[6px] border-ink bg-transparent" />
      <div
        className="toy relative z-10 rounded-[50%_50%_44%_44%/38%_38%_34%_34%] px-[7%] pb-[7%] pt-[10%]"
        style={{
          backgroundColor: s.body,
          backgroundImage: `radial-gradient(120% 70% at 28% 12%, rgba(255,255,255,0.65), transparent 45%), radial-gradient(90% 60% at 80% 100%, ${s.deep}55, transparent 60%)`,
        }}
      >
        <div className="mb-3 text-center font-tiny text-[11px] tracking-[0.35em] text-ink/70">{brand}</div>
        {/* screen bezel */}
        <div className="rounded-[22px] border-[3px] border-ink bg-[#3a2e4a] p-[3.5%] shadow-[inset_0_4px_0_rgba(255,255,255,0.12)]">
          {top && <div className="mb-[2.5%]">{top}</div>}
          {children}
          {bottom && <div className="mt-[2.5%]">{bottom}</div>}
        </div>
        {buttons && (
          <div className="mt-[6%] flex items-end justify-center gap-[9%]">
            {buttons.map((b, i) => (
              <div key={i} className={`flex flex-col items-center gap-1.5 ${i === 1 ? '' : 'mb-4'}`}>
                <button
                  onClick={b.onClick}
                  disabled={b.disabled}
                  aria-label={b.label}
                  className={`toy-sm press flex items-center justify-center rounded-full font-tiny text-ink transition disabled:opacity-50 ${
                    b.big ? 'h-16 w-16 text-lg sm:h-[72px] sm:w-[72px]' : 'h-12 w-12 text-base'
                  }`}
                  style={{ backgroundColor: b.big ? '#ffe9a3' : s.deep }}
                >
                  {b.glyph}
                </button>
                <span className="font-tiny text-[10px] tracking-widest text-ink/80">{b.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// One item in the screen's icon rows, inverted when selected like a handheld's menu.
export function ScreenIcon({ selected, disabled, onClick, label, children }: { selected?: boolean; disabled?: boolean; onClick?: () => void; label: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border-2 px-1 py-1 text-ink transition disabled:opacity-35 ${
        selected ? '-translate-y-0.5 border-butter bg-butter shadow-[0_3px_0_#00000055]' : 'border-transparent bg-lcd/75 hover:bg-lcd'
      }`}
    >
      {children}
    </button>
  );
}
