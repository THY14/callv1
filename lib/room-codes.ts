import { createHash, createHmac } from "crypto";
import { CODE_ALPHABET, CODE_LENGTH } from "@/lib/rooms";
import { getLiveKitConfig } from "@/lib/livekit";

/**
 * The room code owned by a browser, derived from its secret author token (lib/author.ts).
 * Same token -> same code forever, so each account has exactly one room and we need no database.
 * Keyed with the LiveKit secret, so nobody can work out someone else's code from public data.
 * Returns null for a missing/invalid token.
 */
export function ownerCode(authorToken: unknown): string | null {
  if (typeof authorToken !== "string" || authorToken.length < 32 || authorToken.length > 200) return null;
  const authorKey = createHash("sha256").update(authorToken).digest("hex");
  const mac = createHmac("sha256", getLiveKitConfig().apiSecret).update(`room:${authorKey}`).digest();
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[mac[i] % CODE_ALPHABET.length];
  return code;
}
