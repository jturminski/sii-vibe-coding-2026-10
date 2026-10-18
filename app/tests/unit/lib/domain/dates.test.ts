import { describe, expect, it } from "vitest";
import { daysBetween, todayInWarsaw } from "@/lib/domain";

describe("todayInWarsaw", () => {
  it("returns the Warsaw calendar date, not the UTC one", () => {
    expect(todayInWarsaw(new Date("2026-10-18T23:30:00Z"))).toBe("2026-10-19");
  });

  it("handles winter time (UTC+1)", () => {
    expect(todayInWarsaw(new Date("2026-12-31T22:59:59Z"))).toBe("2026-12-31");
    expect(todayInWarsaw(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });
});

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-10-03", "2026-10-18")).toBe(15);
  });

  it("is DST-safe", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("handles leap years", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("returns 0 for the same day and negative for reversed order", () => {
    expect(daysBetween("2026-10-18", "2026-10-18")).toBe(0);
    expect(daysBetween("2026-10-18", "2026-10-03")).toBe(-15);
  });
});
