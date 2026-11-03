import { NextResponse } from "next/server";
import { authorKeyFrom, createRoomFor, findRoomByOwner } from "@/lib/room-codes";

/**
 * Your room's code. { authorToken } only looks it up (code is null if you haven't made one);
 * { authorToken, create: true, name } creates it. Each account gets at most one room.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ownerKey = authorKeyFrom(body.authorToken);
  if (!ownerKey) return NextResponse.json({ error: "Missing author token" }, { status: 400 });

  try {
    if (body.create !== true) {
      const room = await findRoomByOwner(ownerKey);
      return NextResponse.json({ code: room?.code ?? null });
    }
    const name = String(body.name ?? "").trim();
    if (name.length < 1 || name.length > 32) {
      return NextResponse.json({ error: "Name must be 1-32 characters" }, { status: 400 });
    }
    const room = await createRoomFor(ownerKey, name);
    return NextResponse.json({ code: room.code });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Could not create your room. Has the rooms table been added in Supabase (supabase/schema.sql)?" },
      { status: 500 },
    );
  }
}
