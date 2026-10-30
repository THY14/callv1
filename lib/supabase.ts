import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ChatMessage = {
  id: number;
  channel: string;
  author: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  /** SHA-256 of the sender's browser token; safe to expose, used to spot "my" messages */
  author_key: string | null;
};

let client: SupabaseClient | null | undefined;

/** Browser client (read + realtime only). Returns null if Supabase isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}
