'use client';
import { useEffect, useState } from 'react';
import { PixelSprite } from './Pixel';
import { petById, petSprite, type Mood } from '@/lib/sprites';

type Props = {
  id?: string;
  size?: number;
  ring?: 'you' | 'rival';
  mood?: Mood;
  animate?: boolean;
  className?: string;
};

// A pixel pet: hops on a two-frame loop and blinks now and then, like a handheld's.
export default function Avatar({ id, size, ring, mood = 'curious', animate = true, className = '' }: Props) {
  const pet = petById(id);
  const [frame, setFrame] = useState(0);
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (!animate) return;
    const hop = setInterval(() => setFrame((f) => 1 - f), mood === 'sleepy' ? 1100 : mood === 'party' ? 300 : 550);
    let t: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        scheduleBlink();
      }, 2200 + Math.random() * 3000);
    };
    scheduleBlink();
    return () => {
      clearInterval(hop);
      clearTimeout(t);
    };
  }, [animate, mood]);

  const backdrop = ring === 'you' ? 'bg-butter' : ring === 'rival' ? 'bg-sky' : '';
  const outline = ring ? 'rounded-full border-2 border-ink' : '';
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${backdrop} ${outline} ${className}`}
      style={size ? { width: size, height: size } : undefined}
      role="img"
      aria-label={`${pet.name} avatar`}
    >
      <PixelSprite sprite={petSprite(pet, mood, animate ? frame : 0, blink && mood !== 'sleepy')} palette={pet.palette} className={ring ? 'h-[82%] w-[82%]' : 'h-full w-full'} />
    </span>
  );
}
