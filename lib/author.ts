// Proves "this message is mine" without accounts: each browser keeps a random secret token.
// The server stores only its SHA-256 hash on each message, and edits/deletes must present the token.

const STORAGE_KEY = "authorToken";

export function getAuthorToken(): string {
  let token = localStorage.getItem(STORAGE_KEY);
  if (!token) {
    token = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, token);
  }
  return token;
}

let cachedKey: Promise<string> | null = null;

/** Hash of our token, to recognise our own messages (matches messages.author_key). */
export function getAuthorKey(): Promise<string> {
  cachedKey ??= sha256Hex(getAuthorToken());
  return cachedKey;
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
