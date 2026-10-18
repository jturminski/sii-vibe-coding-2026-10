import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonError, logServerError, PROCESSING_FAILED, type ErrorBody } from "@/server/http/errors";

const SECRET = "sk-or-xyz";

describe("jsonError", () => {
  it("returns 400 VALIDATION with the fields map exactly", async () => {
    const res = jsonError(400, { error: "VALIDATION", fields: { reason: "TOO_SHORT", image: "FILE_TOO_LARGE" } });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toStrictEqual({
      error: "VALIDATION",
      fields: { reason: "TOO_SHORT", image: "FILE_TOO_LARGE" },
    });
  });

  it("returns 400 VALIDATION without fields for the chat route", async () => {
    const res = jsonError(400, { error: "VALIDATION" });
    expect(await res.json()).toStrictEqual({ error: "VALIDATION" });
  });

  it.each([
    [404, "CASE_NOT_FOUND"],
    [409, "MESSAGE_LIMIT"],
    [409, "TURN_IN_PROGRESS"],
  ] as const)("returns %i { error: %s } exactly", async (status, code) => {
    const res = jsonError(status, { error: code });
    expect(res.status).toBe(status);
    expect(await res.json()).toStrictEqual({ error: code });
  });

  it("drops any extra properties smuggled into the body (no stack, message or key)", async () => {
    const cause = new Error(`upstream 401 for openai/gpt-6-luna with key ${SECRET}`);
    const smuggled = {
      error: "CASE_NOT_FOUND",
      message: cause.message,
      stack: cause.stack,
      cause,
    } as unknown as ErrorBody;
    const text = await jsonError(404, smuggled).text();
    expect(JSON.parse(text)).toStrictEqual({ error: "CASE_NOT_FOUND" });
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("stack");
    expect(text).not.toContain("gpt-6-luna");
  });

  it("drops field values that are not documented error codes", async () => {
    const cause = new Error(`boom ${SECRET}`);
    const smuggled = {
      error: "VALIDATION",
      fields: { reason: "TOO_SHORT", image: cause.message, other: cause },
    } as unknown as ErrorBody;
    const text = await jsonError(400, smuggled).text();
    expect(JSON.parse(text)).toStrictEqual({ error: "VALIDATION", fields: { reason: "TOO_SHORT" } });
    expect(text).not.toContain(SECRET);
  });
});

describe("logServerError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs { caseId, code, cause } via console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("boom");
    logServerError({ caseId: "HSC-20261018-AB12", code: PROCESSING_FAILED, cause });
    expect(spy).toHaveBeenCalledWith({ caseId: "HSC-20261018-AB12", code: "PROCESSING_FAILED", cause });
  });

  it("omits caseId when not given", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logServerError({ code: PROCESSING_FAILED, cause: "x" });
    expect(spy).toHaveBeenCalledWith({ code: "PROCESSING_FAILED", cause: "x" });
  });
});

describe("PROCESSING_FAILED", () => {
  it("is the stable stream error code", () => {
    expect(PROCESSING_FAILED).toBe("PROCESSING_FAILED");
  });
});
