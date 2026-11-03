import type { Member } from "@/components/VoiceMembers";
import type { ChannelId } from "@/lib/channels";

/** Who's in each public channel / personal room (keyed by channel id or room code), and since when */
export type Occupancy = Record<string, { members: Member[]; startedAt: number | null }>;

/** Where to join: a public channel, or someone's personal room */
export type Target = { kind: "channel"; id: ChannelId } | { kind: "room"; code: string };

export const NO_ONE: Occupancy[string] = { members: [], startedAt: null };
