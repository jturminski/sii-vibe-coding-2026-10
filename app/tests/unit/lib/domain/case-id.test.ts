import { describe, expect, it } from "vitest";
import { CASE_ID_REGEX, formatCaseId } from "@/lib/domain";

describe("CASE_ID_REGEX (AC-25)", () => {
  it("accepts a valid id", () => {
    expect(CASE_ID_REGEX.test("HSC-20261018-A1B2")).toBe(true);
  });

  it.each([
    "hsc-20261018-A1B2",
    "HSC-20261018-a1b2",
    "HSC-2026101-A1B2",
    "HSC-202610181-A1B2",
    "HSC-20261018-A1B",
    "HSC-20261018-A1B2C",
    "XHSC-20261018-A1B2",
    "HSC-20261018-A1B2\n",
  ])("rejects %j", (id) => {
    expect(CASE_ID_REGEX.test(id)).toBe(false);
  });
});

describe("formatCaseId", () => {
  it("builds an id from a YYYY-MM-DD date and suffix", () => {
    expect(formatCaseId("2026-10-18", "A1B2")).toBe("HSC-20261018-A1B2");
  });

  it("accepts a compact YYYYMMDD date", () => {
    expect(formatCaseId("20261018", "A1B2")).toBe("HSC-20261018-A1B2");
  });

  it.each([
    ["2026-10-1", "A1B2"],
    ["2026-10-18", "a1b2"],
    ["2026-10-18", "A1B"],
  ])("throws for invalid input %j / %j", (date, suffix) => {
    expect(() => formatCaseId(date, suffix)).toThrow(/Invalid case id/);
  });

  it("produces ids matching CASE_ID_REGEX", () => {
    expect(formatCaseId("2026-01-05", "ZZ99")).toMatch(CASE_ID_REGEX);
  });
});
