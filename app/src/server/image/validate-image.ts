import "server-only";
import { fileTypeFromBuffer } from "file-type";

import { type AllowedImageMime, LIMITS } from "@/lib/domain";
import { ERROR_CODES } from "@/lib/schemas";

export type ValidateImageResult =
  | { ok: true; mime: AllowedImageMime }
  | { ok: false; code: typeof ERROR_CODES.FILE_TOO_LARGE | typeof ERROR_CODES.UNSUPPORTED_FORMAT };

function isAllowedMime(mime: string): mime is AllowedImageMime {
  return (LIMITS.ALLOWED_IMAGE_MIME as readonly string[]).includes(mime);
}

/**
 * Validates an uploaded image (ADR-002 §3, B2): size first, then magic-byte detection.
 * The file extension and the client-declared type are ignored.
 */
export async function validateImage(bytes: Uint8Array): Promise<ValidateImageResult> {
  if (bytes.byteLength > LIMITS.MAX_IMAGE_BYTES) {
    return { ok: false, code: ERROR_CODES.FILE_TOO_LARGE };
  }
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !isAllowedMime(detected.mime)) {
    return { ok: false, code: ERROR_CODES.UNSUPPORTED_FORMAT };
  }
  return { ok: true, mime: detected.mime };
}
