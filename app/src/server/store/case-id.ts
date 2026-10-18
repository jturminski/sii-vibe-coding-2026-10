import "server-only";
import { formatCaseId, todayInWarsaw } from "@/lib/domain";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SUFFIX_LENGTH = 4;
// Largest multiple of the alphabet size within a byte; higher bytes are rejected to avoid modulo bias.
const BYTE_LIMIT = 256 - (256 % ALPHABET.length);

function randomSuffix(): string {
  let suffix = "";
  const bytes = new Uint8Array(SUFFIX_LENGTH * 2);
  while (suffix.length < SUFFIX_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < BYTE_LIMIT && suffix.length < SUFFIX_LENGTH) suffix += ALPHABET[byte % ALPHABET.length];
    }
  }
  return suffix;
}

/** `HSC-YYYYMMDD-XXXX` with the Europe/Warsaw date; regenerated while `exists(id)` is true (ADR-002 §3). */
export function createCaseId(now: Date, exists: (id: string) => boolean): string {
  const date = todayInWarsaw(now);
  let id: string;
  do {
    id = formatCaseId(date, randomSuffix());
  } while (exists(id));
  return id;
}
