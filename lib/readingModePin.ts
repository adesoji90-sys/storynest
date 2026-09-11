// PIN hashing for Reading Mode's exit gate. Uses Node's built-in
// `crypto.scrypt` — deliberately memory-hard (unlike a bare SHA-256
// hash), which matters specifically because a 4-digit PIN only has
// 10,000 possible values; scrypt's cost makes brute-forcing all of them
// meaningfully slower, one real layer of defense alongside the
// attempt-lockout tracked on the Family row itself. No new dependency
// needed — this is exactly what Node's own crypto docs recommend scrypt
// for.
//
// Stored format is "salt:hash", both hex-encoded, as a single string in
// one database column — simpler than two separate columns, and this
// value is never meant to be human-read or queried by anything other
// than verifyPin below.

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  // timingSafeEqual requires equal-length buffers -- a length mismatch
  // means corrupted/foreign data, not a real candidate, so treat it as
  // a plain failed match rather than letting the length check itself
  // leak timing information.
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
