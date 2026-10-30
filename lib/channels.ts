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

export const MAX_MESSAGE_LENGTH = 2000;

export const TEXT_CHANNELS = [
  { id: "general", name: "general" },
  { id: "memes", name: "memes" },
] as const;

export type TextChannelId = (typeof TEXT_CHANNELS)[number]["id"];

export function isTextChannelId(id: string): id is TextChannelId {
  return TEXT_CHANNELS.some((c) => c.id === id);
}
