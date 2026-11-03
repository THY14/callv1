import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { randomUUID } from "crypto";
import { CHANNELS, MAX_PARTICIPANTS, isChannelId } from "@/lib/channels";
import { isDeviceType } from "@/lib/device";
import { callStartedAt, getLiveKitConfig, getRoomService, listParticipantsSafe } from "@/lib/livekit";
import { isRoomCode, normalizeCode, roomNameForCode } from "@/lib/rooms";
import { authorKeyFrom, findRoomByCode, setOwnerName } from "@/lib/room-codes";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const target = String(body.room ?? "");
  const name = String(body.name ?? "").trim();
  // Only accept known values, so clients can't put arbitrary text in everyone's UI
  const device = isDeviceType(body.device) ? body.device : "desktop";
  const deafened = body.deafened === true;

  if (name.length < 1 || name.length > 32) {
    return NextResponse.json({ error: "Name must be 1-32 characters" }, { status: 400 });
  }

  try {
    const { url, apiKey, apiSecret } = getLiveKitConfig();

    let room: string; // LiveKit room name
    let title: string; // what the UI calls it

    if (isChannelId(target)) {
      room = target;
      title = CHANNELS.find((c) => c.id === target)!.name;
    } else if (isRoomCode(normalizeCode(target))) {
      // Anyone with the code can join, owner there or not. Only codes made with "Create room" work.
      const record = await findRoomByCode(normalizeCode(target));
      if (!record) {
        return NextResponse.json({ error: "No room with that code. Check it and try again." }, { status: 404 });
      }
      room = roomNameForCode(record.code);
      const isOwner = authorKeyFrom(body.authorToken) === record.owner_key;
      // Keep the room's title in step if the owner changed their display name
      if (isOwner && record.owner_name !== name) await setOwnerName(record.code, name).catch(() => {});
      title = `${isOwner ? name : record.owner_name}'s room`;
    } else {
      return NextResponse.json({ error: "Unknown channel or room code" }, { status: 400 });
    }

    // Returns the existing room if the call is already running. emptyTimeout only closes the
    // room once nobody is in it; calls themselves have no time limit.
    await getRoomService()
      .createRoom({ name: room, maxParticipants: MAX_PARTICIPANTS, emptyTimeout: 60 })
      .catch(() => null);

    const participants = await listParticipantsSafe(room);
    if (participants.length >= MAX_PARTICIPANTS) {
      return NextResponse.json({ error: `Room is full (${MAX_PARTICIPANTS}/${MAX_PARTICIPANTS})` }, { status: 403 });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: randomUUID(), // unique per connection, so two people can share a display name
      name,
      ttl: "2h", // only limits how long the token can be used to join; calls can run longer
      // Visible to everyone in the room. "deafened" is kept up to date by /api/voice-state
      attributes: deafened ? { device, deafened: "1" } : { device },
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });

    return NextResponse.json({
      token: await at.toJwt(),
      url,
      title,
      startedAt: callStartedAt(participants) ?? Date.now(), // for the call timer; nobody in yet = starts now
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not join. Please try again." }, { status: 500 });
  }
}
