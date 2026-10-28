// The agents players can pick: the pixel pets from lib/sprites, by id. The server uses
// AVATAR_IDS to validate a choice; components/Avatar draws them.
import { GHOST_PET, PETS, petById } from './sprites.ts';

export const AVATARS = PETS.map(({ id, name }) => ({ id, name }));
export const GHOST = { id: GHOST_PET.id, name: GHOST_PET.name };
export const AVATAR_IDS: string[] = [...AVATARS.map((a) => a.id), GHOST.id];
export const avatarById = (id: string | undefined) => {
  const p = petById(id);
  return { id: p.id, name: p.name };
};
