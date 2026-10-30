import { NextResponse } from "next/server";
import { CHANNELS } from "@/lib/channels";
import { listParticipantsSafe } from "@/lib/livekit";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await Promise.all(
    CHANNELS.map(async (c) => {
      const participants = await listParticipantsSafe(c.id);
      return [
        c.id,
        participants.map((p) => ({
          identity: p.identity,
          name: p.name || "Unknown",
          device: p.attributes?.device || "desktop",
        })),
      ] as const;
    }),
  );
  return NextResponse.json(Object.fromEntries(entries));
}
