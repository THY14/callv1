// Personal rooms: every browser ("account") owns exactly one room, opened with a short code.
// Safe to import on the client; the code itself is computed on the server (lib/room-codes.ts).

// No 0/O, 1/I/L, so codes are easy to read out loud and type on a phone
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** "k7p-4qx " -> "K7P4QX" */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isRoomCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** "K7P4QX" -> "K7P-4QX" for display */
export function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** LiveKit room name, prefixed so it can never clash with a public channel id. */
export function roomNameForCode(code: string): string {
  return `room-${code}`;
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/?room=${code}`;
}

/** Formats what someone is typing into a code box: "k7p4" -> "K7P-4" */
export function formatCodeInput(raw: string): string {
  const code = normalizeCode(raw).slice(0, CODE_LENGTH);
  return code.length > 3 ? formatCode(code) : code;
}
