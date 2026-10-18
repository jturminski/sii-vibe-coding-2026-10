import { describe, expect, it } from "vitest";
import { chatRequestSchema } from "@/lib/schemas";
import { fieldCodes } from "./helpers";

const request = (text: string, extra: Record<string, unknown> = {}) => ({
  message: { id: "msg-1", role: "user", parts: [{ type: "text", text }], ...extra },
});

describe("chatRequestSchema", () => {
  it("accepts a user message with one text part and trims it", () => {
    const result = chatRequestSchema.safeParse(request("  Dzień dobry  "));
    expect(result.success).toBe(true);
    expect(result.data?.message.parts[0].text).toBe("Dzień dobry");
  });

  it("AC-28: accepts 2000 chars and rejects 2001 chars with TOO_LONG", () => {
    expect(chatRequestSchema.safeParse(request("a".repeat(2000))).success).toBe(true);
    expect(fieldCodes(chatRequestSchema.safeParse(request("a".repeat(2001))))).toEqual({
      "message.parts.0.text": "TOO_LONG",
    });
  });

  it("AC-28: rejects empty and whitespace-only text with REQUIRED", () => {
    expect(fieldCodes(chatRequestSchema.safeParse(request("")))).toEqual({ "message.parts.0.text": "REQUIRED" });
    expect(fieldCodes(chatRequestSchema.safeParse(request(" \n\t ")))).toEqual({
      "message.parts.0.text": "REQUIRED",
    });
  });

  it("rejects non-user roles", () => {
    expect(chatRequestSchema.safeParse(request("hej", { role: "assistant" })).success).toBe(false);
  });

  it("requires exactly one text part", () => {
    const text = { type: "text", text: "hej" };
    expect(chatRequestSchema.safeParse(request("x", { parts: [] })).success).toBe(false);
    expect(chatRequestSchema.safeParse(request("x", { parts: [text, text] })).success).toBe(false);
    expect(
      chatRequestSchema.safeParse(request("x", { parts: [{ type: "file", mediaType: "image/png", url: "x" }] }))
        .success,
    ).toBe(false);
  });

  it("requires a message id", () => {
    expect(chatRequestSchema.safeParse(request("hej", { id: "" })).success).toBe(false);
    expect(chatRequestSchema.safeParse({}).success).toBe(false);
  });
});
