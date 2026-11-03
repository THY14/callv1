import { NextResponse } from "next/server";
import { TokenVerifier } from "livekit-server-sdk";
import { getLiveKitConfig, getRoomService } from "@/lib/livekit";

/**
 * Tells everyone in the call that you deafened/undeafened.
 * The caller proves who they are with their own LiveKit join token, so you can only
 * change your own state (and clients never get permission to edit attributes directly).
 */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const body = await req.json().catch(() => ({}));
  const deafened = body.deafened === true;

  try {
    const { apiKey, apiSecret } = getLiveKitConfig();
    // Join tokens expire after 2h but calls have no time limit, so accept old tokens too.
    // Still safe: the token can only ever change its own participant's deafened flag.
    const claims = await new TokenVerifier(apiKey, apiSecret).verify(token, "3650d").catch(() => null);
    const room = claims?.video?.room;
    const identity = claims?.sub;
    if (!room || !identity) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // An empty value removes the attribute
    await getRoomService().updateParticipant(room, identity, { attributes: { deafened: deafened ? "1" : "" } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not update voice state" }, { status: 500 });
  }
}
