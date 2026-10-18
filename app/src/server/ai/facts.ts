import "server-only";
import { daysBetween, LIMITS, todayInWarsaw, type CaseType, type DecisionStatus } from "@/lib/domain";

/** Code-computed facts included in every decision and chat prompt (ADR-003 §3). */
export interface Facts {
  /** Europe/Warsaw calendar day, `YYYY-MM-DD`. */
  today: string;
  purchaseDate: string;
  /** Whole calendar days from the purchase date to `today`. */
  daysSincePurchase: number;
  caseType: CaseType;
  /** `null` before the first decision. */
  currentStatus: DecisionStatus | null;
  needsInfoRounds: number;
  userMessagesRemaining: number;
}

export interface BuildFactsInput {
  purchaseDate: string;
  now: Date;
  caseType: CaseType;
  currentStatus?: DecisionStatus | null;
  needsInfoRounds?: number;
  userMessageCount?: number;
}

export function buildFacts({
  purchaseDate,
  now,
  caseType,
  currentStatus = null,
  needsInfoRounds = 0,
  userMessageCount = 0,
}: BuildFactsInput): Facts {
  const today = todayInWarsaw(now);
  return {
    today,
    purchaseDate,
    daysSincePurchase: daysBetween(purchaseDate, today),
    caseType,
    currentStatus,
    needsInfoRounds,
    userMessagesRemaining: Math.max(0, LIMITS.MAX_USER_MESSAGES - userMessageCount),
  };
}
