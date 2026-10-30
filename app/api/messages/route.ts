import { NextResponse } from "next/server";
import { MAX_MESSAGE_LENGTH, isTextChannelId } from "@/lib/channels";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// Simple per-IP spam limit: 5 messages per 10 seconds.
// In-memory, so it's per server instance; good enough until we add accounts.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10_000;
const recent = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) return true;
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) recent.clear(); // keep memory bounded
  return false;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const channel = String(body.channel ?? "");
  const author = String(body.name ?? "").trim();
  const content = String(body.content ?? "").trim();

  if (!isTextChannelId(channel)) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
  }
  if (author.length < 1 || author.length > 32) {
    return NextResponse.json({ error: "Name must be 1-32 characters" }, { status: 400 });
  }
  if (content.length < 1 || content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "You're sending messages too fast. Slow down a bit." }, { status: 429 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("messages")
      .insert({ channel, author, content })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ message: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not send message. Try again." }, { status: 500 });
  }
}
