// Agent avatars. Plain data so the server can validate ids; components/Avatar draws them.
export type AvatarSpec = {
  id: string;
  name: string;
  bg: string;
  skin: string;
  hair: string;
  jacket: string;
  gear: 'shades' | 'hood' | 'beanie' | 'headset' | 'fedora' | 'mask';
  hairStyle: 'bob' | 'short' | 'curly' | 'spiky' | 'none';
  eyes?: string;
};
export const AVATARS: AvatarSpec[] = [
  { id: 'nightjar', name: 'Nightjar', bg: '#FDE7A9', skin: '#E9B48A', hair: '#2B2118', jacket: '#1F2937', gear: 'shades', hairStyle: 'bob' },
  { id: 'cipher', name: 'Cipher', bg: '#DCE8FB', skin: '#C68B62', hair: '#151515', jacket: '#334155', gear: 'hood', hairStyle: 'none' },
  { id: 'sapling', name: 'Sapling', bg: '#DDF1D6', skin: '#F2C9A5', hair: '#8A4B22', jacket: '#3F6212', gear: 'beanie', hairStyle: 'short' },
  { id: 'relay', name: 'Relay', bg: '#F4DDEB', skin: '#8D5A3B', hair: '#1C1410', jacket: '#7C2D12', gear: 'headset', hairStyle: 'curly' },
  { id: 'courier', name: 'Courier', bg: '#E9E3D6', skin: '#DDA77F', hair: '#3B2A1E', jacket: '#57534E', gear: 'fedora', hairStyle: 'short' },
  { id: 'mixer', name: 'Mixer', bg: '#E2DCF7', skin: '#B97A55', hair: '#2A1B12', jacket: '#4C1D95', gear: 'mask', hairStyle: 'spiky' },
];
// The bot's look, not selectable.
export const GHOST: AvatarSpec = { id: 'ghost', name: 'Ghost', bg: '#E5E7EB', skin: '#111827', hair: '#111827', jacket: '#111827', gear: 'hood', hairStyle: 'none', eyes: '#F4B728' };

export const AVATAR_IDS: string[] = [...AVATARS.map((a) => a.id), GHOST.id];
export const avatarById = (id: string | undefined): AvatarSpec => AVATARS.find((a) => a.id === id) ?? (id === GHOST.id ? GHOST : AVATARS[0]);
