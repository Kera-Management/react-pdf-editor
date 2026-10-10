/**
 * Avatar colours, copied from the app's `utils/avatarPalette.ts` and kept
 * identical to it: same hue list in the same order, same hash, same
 * radius. A person must get the same colour in the editor as everywhere
 * else in the app, and dropping or reordering a hue would shift everyone.
 * (Green stays in this list for that reason; it is the one green the
 * editor allows.)
 */
export const AVATAR_PALETTES = [
  "green",
  "blue",
  "purple",
  "orange",
  "pink",
  "cyan",
  "teal",
  "red",
  "yellow",
] as const;

export type AvatarPalette = (typeof AVATAR_PALETTES)[number] | "gray";

/** `gray` is reserved for an empty seed (no name to hash). */
export const getAvatarPalette = (seed?: string | null): AvatarPalette => {
  const key = (seed ?? "").trim().toLowerCase();
  if (!key) return "gray";
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
};

/** The app's squircle corner: proportional at every avatar size. */
export const AVATAR_SQUIRCLE_RADIUS = "30%";
