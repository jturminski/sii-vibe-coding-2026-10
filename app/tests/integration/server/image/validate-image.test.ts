import { describe, expect, it } from "vitest";

import { LIMITS } from "@/lib/domain";
import { ERROR_CODES } from "@/lib/schemas";
import { validateImage } from "@/server/image";

import { EXAMPLE_IMAGES, readExampleImage } from "./fixtures";

describe("validateImage", () => {
  it.each(EXAMPLE_IMAGES)("accepts the real sample photo %s", async (name) => {
    const result = await validateImage(await readExampleImage(name));

    expect(result.ok).toBe(true);
  });

  it("detects laptop-1.png as JPEG from its content, ignoring the extension", async () => {
    const result = await validateImage(await readExampleImage("laptop-1.png"));

    expect(result).toEqual({ ok: true, mime: "image/jpeg" });
  });

  it("detects laptop-2.webp as WebP", async () => {
    const result = await validateImage(await readExampleImage("laptop-2.webp"));

    expect(result).toEqual({ ok: true, mime: "image/webp" });
  });

  it("rejects a UTF-8 text buffer as UNSUPPORTED_FORMAT", async () => {
    const text = new TextEncoder().encode("To nie jest zdjęcie, tylko zwykły tekst.");

    const result = await validateImage(text);

    expect(result).toEqual({ ok: false, code: ERROR_CODES.UNSUPPORTED_FORMAT });
  });

  it("rejects an empty buffer as UNSUPPORTED_FORMAT", async () => {
    const result = await validateImage(new Uint8Array(0));

    expect(result).toEqual({ ok: false, code: ERROR_CODES.UNSUPPORTED_FORMAT });
  });

  it("rejects one byte over the limit as FILE_TOO_LARGE", async () => {
    expect(LIMITS.MAX_IMAGE_BYTES).toBe(10_485_760);

    const result = await validateImage(Buffer.alloc(10_485_761));

    expect(result).toEqual({ ok: false, code: ERROR_CODES.FILE_TOO_LARGE });
  });

  it("checks the size before the format (oversized non-image is FILE_TOO_LARGE)", async () => {
    const result = await validateImage(Buffer.alloc(LIMITS.MAX_IMAGE_BYTES + 1, "a"));

    expect(result).toEqual({ ok: false, code: ERROR_CODES.FILE_TOO_LARGE });
  });

  it("lets exactly MAX_IMAGE_BYTES through the size check", async () => {
    // Zero-filled buffer of exactly the limit: passes size, then fails format detection.
    const result = await validateImage(Buffer.alloc(10_485_760));

    expect(result).toEqual({ ok: false, code: ERROR_CODES.UNSUPPORTED_FORMAT });
  });
});
