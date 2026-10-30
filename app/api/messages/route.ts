import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { MAX_MESSAGE_LENGTH, isTextChannelId } from "@/lib/channels";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// Simple per-IP spam limit: 5 actions (send/edit/delete) per 10 seconds.
// In-memory, so it's per server instance; good enough until we add accounts.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10_000;
const recent = new Map<string, number[]>();

function rateLimited(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) return true;
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 5000) recent.clear(); // keep memory bounded
  return false;
}

const tooFast = () =>
  NextResponse.json({ error: "You're sending messages too fast. Slow down a bit." }, { status: 429 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** The browser's secret token -> the hash we store on its messages. */
function authorKeyFrom(body: Record<string, unknown>): string | null {
  const token = body.authorToken;
  if (typeof token !== "string" || token.length < 32 || token.length > 200) return null;
  return createHash("sha256").update(token).digest("hex");
}

function validContent(body: Record<string, unknown>): string | null {
  const content = String(body.content ?? "").trim();
  return content.length >= 1 && content.length <= MAX_MESSAGE_LENGTH ? content : null;
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  return req.json().catch(() => ({}));
}

/** Send a message */
export async function POST(req: Request) {
  const body = await readBody(req);
  const channel = String(body.channel ?? "");
  const author = String(body.name ?? "").trim();
  const content = validContent(body);
  const authorKey = authorKeyFrom(body);

  if (!isTextChannelId(channel)) return bad("Unknown channel");
  if (author.length < 1 || author.length > 32) return bad("Name must be 1-32 characters");
  if (!content) return bad(`Message must be 1-${MAX_MESSAGE_LENGTH} characters`);
  if (!authorKey) return bad("Missing author token");
  if (rateLimited(req)) return tooFast();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("messages")
      .insert({ channel, author, content, author_key: authorKey })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ message: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not send message. Try again." }, { status: 500 });
  }
}

/** Edit your own message */
export async function PATCH(req: Request) {
  const body = await readBody(req);
  const id = Number(body.id);
  const content = validContent(body);
  const authorKey = authorKeyFrom(body);

  if (!Number.isInteger(id)) return bad("Invalid message id");
  if (!content) return bad(`Message must be 1-${MAX_MESSAGE_LENGTH} characters`);
  if (!authorKey) return bad("Missing author token");
  if (rateLimited(req)) return tooFast();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("messages")
      .update({ content, edited_at: new Date().toISOString() })
      .eq("id", id)
      .eq("author_key", authorKey) // only matches if this browser wrote it
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
    return NextResponse.json({ message: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not edit message. Try again." }, { status: 500 });
  }
}

/** Delete your own message */
export async function DELETE(req: Request) {
  const body = await readBody(req);
  const id = Number(body.id);
  const authorKey = authorKeyFrom(body);

  if (!Number.isInteger(id)) return bad("Invalid message id");
  if (!authorKey) return bad("Missing author token");
  if (rateLimited(req)) return tooFast();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("messages")
      .delete()
      .eq("id", id)
      .eq("author_key", authorKey)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not delete message. Try again." }, { status: 500 });
  }
}
