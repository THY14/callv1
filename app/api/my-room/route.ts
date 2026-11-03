import { NextResponse } from "next/server";
import { ownerCode } from "@/lib/room-codes";

/** Returns this browser's personal room code. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const code = ownerCode(body.authorToken);
    if (!code) return NextResponse.json({ error: "Missing author token" }, { status: 400 });
    return NextResponse.json({ code });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not get your room" }, { status: 500 });
  }
}
