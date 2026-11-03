import { NextResponse } from "next/server";
import { TrackSource } from "livekit-server-sdk";
import { CHANNELS } from "@/lib/channels";
import { listParticipantsSafe } from "@/lib/livekit";
import { isRoomCode, normalizeCode, roomNameForCode } from "@/lib/rooms";

export const dynamic = "force-dynamic";

/**
 * Who is in each public channel, keyed by channel id.
 * ?codes=K7P4QX,... also returns personal rooms (keyed by code); you need the code to see one.
 */
export async function GET(req: Request) {
  const codes = (new URL(req.url).searchParams.get("codes") ?? "")
    .split(",")
    .map(normalizeCode)
    .filter(isRoomCode)
    .slice(0, 3);

  const targets = [
    ...CHANNELS.map((c) => ({ key: c.id as string, room: c.id as string })),
    ...codes.map((code) => ({ key: code, room: roomNameForCode(code) })),
  ];

  const entries = await Promise.all(
    targets.map(async ({ key, room }) => {
      const participants = await listParticipantsSafe(room);
      return [
        key,
        participants.map((p) => ({
          identity: p.identity,
          name: p.name || "Unknown",
          device: p.attributes?.device || "desktop",
          // No mic track at all (e.g. permission denied) counts as muted too
          muted: !p.tracks.some((t) => t.source === TrackSource.MICROPHONE && !t.muted),
          deafened: p.attributes?.deafened === "1",
        })),
      ] as const;
    }),
  );
  return NextResponse.json(Object.fromEntries(entries));
}
