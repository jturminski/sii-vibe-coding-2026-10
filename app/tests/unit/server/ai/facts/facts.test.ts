import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/domain";
import { buildFacts } from "@/server/ai/facts";

/** Noon in Warsaw on 2026-10-18 (CEST, UTC+2). */
const NOW = new Date("2026-10-18T10:00:00Z");

describe("buildFacts", () => {
  it("counts 15 days from a purchase on 2026-10-03 to 2026-10-18 (ADR-003 §8)", () => {
    const facts = buildFacts({ purchaseDate: "2026-10-03", now: NOW, caseType: "RETURN" });
    expect(facts).toStrictEqual({
      today: "2026-10-18",
      purchaseDate: "2026-10-03",
      daysSincePurchase: 15,
      caseType: "RETURN",
      currentStatus: null,
      needsInfoRounds: 0,
      userMessagesRemaining: LIMITS.MAX_USER_MESSAGES,
    });
  });

  it("uses the Europe/Warsaw calendar day for today (late evening UTC is already the next day)", () => {
    const facts = buildFacts({
      purchaseDate: "2026-10-18",
      now: new Date("2026-10-18T22:30:00Z"),
      caseType: "COMPLAINT",
    });
    expect(facts.today).toBe("2026-10-19");
    expect(facts.daysSincePurchase).toBe(1);
  });

  it("counts whole calendar days across a leap day", () => {
    const facts = buildFacts({
      purchaseDate: "2028-02-28",
      now: new Date("2028-03-01T12:00:00Z"),
      caseType: "RETURN",
    });
    expect(facts.daysSincePurchase).toBe(2);
  });

  it("passes the chat state through and computes the remaining user messages", () => {
    const facts = buildFacts({
      purchaseDate: "2026-10-03",
      now: NOW,
      caseType: "COMPLAINT",
      currentStatus: "NEEDS_INFO",
      needsInfoRounds: 2,
      userMessageCount: 5,
    });
    expect(facts.currentStatus).toBe("NEEDS_INFO");
    expect(facts.needsInfoRounds).toBe(2);
    expect(facts.userMessagesRemaining).toBe(LIMITS.MAX_USER_MESSAGES - 5);
  });

  it("never reports a negative number of remaining messages", () => {
    const facts = buildFacts({
      purchaseDate: "2026-10-03",
      now: NOW,
      caseType: "RETURN",
      userMessageCount: LIMITS.MAX_USER_MESSAGES + 3,
    });
    expect(facts.userMessagesRemaining).toBe(0);
  });
});
