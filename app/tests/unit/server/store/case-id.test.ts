import { afterEach, describe, expect, it, vi } from "vitest";
import { CASE_ID_REGEX } from "@/lib/domain";
import { createCaseId } from "@/server/store/case-id";

const never = () => false;

describe("createCaseId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the Europe/Warsaw date: 2026-10-18 23:30Z is HSC-20261019-XXXX", () => {
    const id = createCaseId(new Date("2026-10-18T23:30:00Z"), never);
    expect(id).toMatch(/^HSC-20261019-[A-Z0-9]{4}$/);
    expect(id).toMatch(CASE_ID_REGEX);
  });

  it("draws the suffix from crypto.getRandomValues", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    createCaseId(new Date("2026-10-18T10:00:00Z"), never);
    expect(spy).toHaveBeenCalled();
  });

  it("regenerates while exists(id) returns true", () => {
    const seen: string[] = [];
    const exists = vi.fn((id: string) => {
      seen.push(id);
      return seen.length < 3;
    });
    const id = createCaseId(new Date("2026-10-18T10:00:00Z"), exists);
    expect(exists).toHaveBeenCalledTimes(3);
    expect(id).toBe(seen[2]);
  });

  it("produces varied suffixes", () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => createCaseId(new Date("2026-10-18T10:00:00Z"), never)),
    );
    expect(ids.size).toBeGreaterThan(45);
  });
});
