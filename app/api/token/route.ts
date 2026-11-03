import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { randomUUID } from "crypto";
import { CHANNELS, MAX_PARTICIPANTS, isChannelId } from "@/lib/channels";
import { isDeviceType } from "@/lib/device";
import { getLiveKitConfig, getRoomService, listParticipantsSafe } from "@/lib/livekit";
import { isRoomCode, normalizeCode, roomNameForCode } from "@/lib/rooms";
import { ownerCode } from "@/lib/room-codes";

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
    const rooms = getRoomService();

    let room: string; // LiveKit room name
    let title: string; // what the UI calls it
    let canOpen: boolean; // may start the room if nobody is in it

    if (isChannelId(target)) {
      room = target;
      title = CHANNELS.find((c) => c.id === target)!.name;
      canOpen = true;
    } else if (isRoomCode(normalizeCode(target))) {
      const code = normalizeCode(target);
      room = roomNameForCode(code);
      // Only the owner can open their room, so each account has one room (no making rooms from random codes)
      canOpen = ownerCode(body.authorToken) === code;
      title = canOpen ? `${name}'s room` : "";
    } else {
      return NextResponse.json({ error: "Unknown channel or room code" }, { status: 400 });
    }

    if (canOpen) {
      // emptyTimeout only closes the room once everyone has left; calls themselves have no time limit
      const created = await rooms
        .createRoom({ name: room, maxParticipants: MAX_PARTICIPANTS, emptyTimeout: 60, metadata: title })
        .catch(() => null);
      // Keep the title in sync if the owner changed their name since the room was made
      if (created && created.metadata !== title && room !== target) {
        await rooms.updateRoomMetadata(room, title).catch(() => {});
      }
    }

    const participants = await listParticipantsSafe(room);
    if (!canOpen) {
      if (participants.length === 0) {
        return NextResponse.json(
          { error: "This room isn't open right now. The owner has to join first." },
          { status: 404 },
        );
      }
      const [info] = await rooms.listRooms([room]).catch(() => []);
      title = info?.metadata || "Private room";
    }
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

    return NextResponse.json({ token: await at.toJwt(), url, title });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not create token. Is the LiveKit server running?" }, { status: 500 });
  }
}
