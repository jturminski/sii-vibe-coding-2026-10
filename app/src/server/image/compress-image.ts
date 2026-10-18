import "server-only";
import sharp from "sharp";

import { ERROR_CODES } from "@/lib/schemas";

/** Longest side after compression (ADR-002 B1). */
const MAX_SIDE = 1568;
const JPEG_QUALITY = 80;

export type CompressedImage = {
  bytes: Uint8Array;
  mediaType: "image/jpeg";
  width: number;
  height: number;
};

/** Thrown when sharp cannot decode the input; maps to `UNSUPPORTED_FORMAT`. */
export class ImageDecodeError extends Error {
  readonly code = ERROR_CODES.UNSUPPORTED_FORMAT;

  constructor(options?: { cause?: unknown }) {
    super("Image could not be decoded", options);
    this.name = "ImageDecodeError";
  }
}

/**
 * Normalizes an image for the model (ADR-002 §3, B1): apply EXIF orientation, fit within
 * 1568x1568 without enlarging, flatten alpha on white, re-encode as JPEG q80 (mozjpeg).
 * sharp drops all metadata (EXIF, ICC, XMP) unless asked to keep it.
 */
export async function compressImage(bytes: Uint8Array): Promise<CompressedImage> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(data), mediaType: "image/jpeg", width: info.width, height: info.height };
  } catch (cause) {
    throw new ImageDecodeError({ cause });
  }
}
