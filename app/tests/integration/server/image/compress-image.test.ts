import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { compressImage, ImageDecodeError } from "@/server/image";

import { EXAMPLE_IMAGES, readExampleImage } from "./fixtures";

const MAX_SIDE = 1568;

describe("compressImage", () => {
  it("downsizes laptop-1.png (3024x3135 JPEG) to longest side 1568 as JPEG without EXIF", async () => {
    const result = await compressImage(await readExampleImage("laptop-1.png"));

    expect(result.mediaType).toBe("image/jpeg");
    expect(Math.max(result.width, result.height)).toBe(MAX_SIDE);

    const meta = await sharp(result.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(result.width);
    expect(meta.height).toBe(result.height);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("does not enlarge phone-2.jpeg (387x516)", async () => {
    const result = await compressImage(await readExampleImage("phone-2.jpeg"));

    expect({ width: result.width, height: result.height }).toEqual({ width: 387, height: 516 });
    const meta = await sharp(result.bytes).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 387, height: 516 });
  });

  it("re-encodes WebP input as JPEG", async () => {
    const result = await compressImage(await readExampleImage("laptop-2.webp"));

    expect(result.mediaType).toBe("image/jpeg");
    expect((await sharp(result.bytes).metadata()).format).toBe("jpeg");
  });

  it.each(EXAMPLE_IMAGES)("produces a JPEG within 1568x1568 for %s", async (name) => {
    const result = await compressImage(await readExampleImage(name));

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.width).toBeLessThanOrEqual(MAX_SIDE);
    expect(result.height).toBeLessThanOrEqual(MAX_SIDE);
    const meta = await sharp(result.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
  });

  it("throws ImageDecodeError mapped to UNSUPPORTED_FORMAT for undecodable bytes", async () => {
    const text = new TextEncoder().encode("not an image");

    const error = await compressImage(text).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ImageDecodeError);
    expect(error).toMatchObject({ code: "UNSUPPORTED_FORMAT" });
  });
});
