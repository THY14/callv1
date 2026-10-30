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
