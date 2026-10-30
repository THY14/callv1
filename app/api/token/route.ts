import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { randomUUID } from "crypto";
import { MAX_PARTICIPANTS, isChannelId } from "@/lib/channels";
import { getLiveKitConfig, getRoomService, listParticipantsSafe } from "@/lib/livekit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const room = String(body.room ?? "");
  const name = String(body.name ?? "").trim();

  if (!isChannelId(room)) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
  }
  if (name.length < 1 || name.length > 32) {
    return NextResponse.json({ error: "Name must be 1-32 characters" }, { status: 400 });
  }

  try {
    const { url, apiKey, apiSecret } = getLiveKitConfig();

    await getRoomService()
      .createRoom({ name: room, maxParticipants: MAX_PARTICIPANTS, emptyTimeout: 60 })
      .catch(() => {});

    const participants = await listParticipantsSafe(room);
    if (participants.length >= MAX_PARTICIPANTS) {
      return NextResponse.json({ error: `Channel is full (${MAX_PARTICIPANTS}/${MAX_PARTICIPANTS})` }, { status: 403 });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: randomUUID(), // unique per connection, so two people can share a display name
      name,
      ttl: "2h",
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });

    return NextResponse.json({ token: await at.toJwt(), url });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not create token. Is the LiveKit server running?" }, { status: 500 });
  }
}
