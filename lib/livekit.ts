import { RoomServiceClient } from "livekit-server-sdk";

export function getLiveKitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    throw new Error("Missing LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET in .env.local");
  }
  return { url, apiKey, apiSecret };
}

export function getRoomService() {
  const { url, apiKey, apiSecret } = getLiveKitConfig();
  return new RoomServiceClient(url.replace(/^ws/, "http"), apiKey, apiSecret);
}
export async function listParticipantsSafe(room: string) {
  try {
    return await getRoomService().listParticipants(room);
  } catch {
    return [];
  }
}

/**
 * When the current call started: when the earliest person still in it joined (ms), or null if empty.
 * (Not the room's creation time: LiveKit keeps empty rooms around for a minute, which made fresh calls start at 0:55.)
 */
export function callStartedAt(participants: { joinedAtMs?: bigint; joinedAt?: bigint }[]) {
  const times = participants.map((p) => Number(p.joinedAtMs ?? 0n) || Number(p.joinedAt ?? 0n) * 1000).filter(Boolean);
  return times.length ? Math.min(...times) : null;
}
