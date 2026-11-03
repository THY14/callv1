import { createHash, randomInt } from "crypto";
import { CODE_ALPHABET, CODE_LENGTH } from "@/lib/rooms";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// Server only. Rooms live in the Supabase "rooms" table (see supabase/schema.sql).

export type RoomRecord = { code: string; owner_key: string; owner_name: string };

/** The browser's secret token (lib/author.ts) -> the hash that identifies its account. */
export function authorKeyFrom(token: unknown): string | null {
  if (typeof token !== "string" || token.length < 32 || token.length > 200) return null;
  return createHash("sha256").update(token).digest("hex");
}

export async function findRoomByOwner(ownerKey: string): Promise<RoomRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("rooms")
    .select("code, owner_key, owner_name")
    .eq("owner_key", ownerKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findRoomByCode(code: string): Promise<RoomRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("rooms")
    .select("code, owner_key, owner_name")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function randomCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Returns the account's room, creating it if it has none (one room per account). */
export async function createRoomFor(ownerKey: string, ownerName: string): Promise<RoomRecord> {
  const existing = await findRoomByOwner(ownerKey);
  if (existing) return existing;

  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("rooms")
      .insert({ code: randomCode(), owner_key: ownerKey, owner_name: ownerName })
      .select("code, owner_key, owner_name")
      .single();
    if (!error) return data;
    // 23505 = unique violation: the code was taken (try another) or a double-click already made our room
    if (error.code !== "23505") throw error;
    const mine = await findRoomByOwner(ownerKey);
    if (mine) return mine;
  }
  throw new Error("Could not find a free room code");
}

export async function setOwnerName(code: string, ownerName: string) {
  await getSupabaseAdmin().from("rooms").update({ owner_name: ownerName }).eq("code", code);
}
