import { ICONS, ICON_PALETTE, type Palette, type Sprite } from '@/lib/sprites';

// Draws a sprite as crisp SVG pixels, merging horizontal runs of one colour into a single rect.
export function PixelSprite({ sprite, palette, size, className = '', title }: { sprite: Sprite; palette: Palette; size?: number; className?: string; title?: string }) {
  const w = sprite[0].length;
  const h = sprite.length;
  const rects = [];
  for (let y = 0; y < h; y++) {
    const row = sprite[y];
    let x = 0;
    while (x < w) {
      const c = row[x];
      let run = 1;
      while (x + run < w && row[x + run] === c) run++;
      if (c !== '.' && palette[c]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={palette[c]} />);
      x += run;
    }
  }
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={size ? (size * h) / w : undefined}
      className={className}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  );
}

export function Icon({ name, size = 20, className = '', title }: { name: string; size?: number; className?: string; title?: string }) {
  const sprite = ICONS[name];
  if (!sprite) return null;
  return <PixelSprite sprite={sprite} palette={ICON_PALETTE} size={size} className={className} title={title} />;
}
