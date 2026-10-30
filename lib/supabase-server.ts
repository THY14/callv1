import { createClient } from "@supabase/supabase-js";

/** Server-only client with the secret key (bypasses row level security). Never import this in client code. */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
