export const MAX_PARTICIPANTS = 10;

export const CHANNELS = [
  { id: "general", name: "General" },
  { id: "gaming", name: "Gaming" },
  { id: "chill", name: "Chill Zone" },
] as const;

export type ChannelId = (typeof CHANNELS)[number]["id"];

export function isChannelId(id: string): id is ChannelId {
  return CHANNELS.some((c) => c.id === id);
}
