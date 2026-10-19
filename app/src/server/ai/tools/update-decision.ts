import "server-only";
import { tool } from "ai";
import { DECISION_STATUSES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import { decisionUpdateSchema, type DecisionUpdate, type DecisionUpdateResult } from "@/lib/schemas";
import { caseStore, type Case } from "@/server/store/case-store";

const DESCRIPTION = [
  "Record a change of the decision status for this case.",
  "Call it only when the status changes from the current status, never to repeat the current status.",
  "After the call, explain the change to the customer in Polish.",
].join(" ");

/** Reason stored and shown on the card when an ACCEPTED request is capped at MANUAL_REVIEW (AC-31, AC-31a). */
export const CHAT_DOWNGRADE_REASON = pl.chat.downgradeReason;

/** Highest status the chat may set for a case: ACCEPTED, or MANUAL_REVIEW when acceptance is not allowed. */
export type MaxChatStatus = "ACCEPTED" | "MANUAL_REVIEW";

/**
 * Server-side cap for chat status changes (ADR-003 §4.5, PRD AC-31, AC-31a). Statements in the chat cannot
 * replace photo evidence, so ACCEPTED is not allowed when:
 * - AC-31: the initial decision was REJECTED and the image report lists visible damage;
 * - AC-31a: the image report does not confirm the case: the photo is not usable (both case types), or, for a
 *   complaint, `visibleDamage` is empty (no visible fault), `likelyCause` is "unknown" or `causeConfidence` is "low".
 * A return has no reported fault to confirm, so a usable photo is enough there.
 */
export function maxAllowedChatStatus({ imageReport, initialDecision }: Pick<Case, "imageReport" | "initialDecision">): MaxChatStatus {
  const rejectedForDamage = initialDecision.status === "REJECTED" && imageReport.visibleDamage.length > 0;
  if (rejectedForDamage || !imageReport.imageUsable) return "MANUAL_REVIEW";
  if (imageReport.caseType === "COMPLAINT") {
    const faultConfirmed =
      imageReport.visibleDamage.length > 0 &&
      imageReport.likelyCause !== "unknown" &&
      imageReport.causeConfidence !== "low";
    if (!faultConfirmed) return "MANUAL_REVIEW";
  }
  return "ACCEPTED";
}

/**
 * `updateDecision` tool bound to one case (ADR-003 §3, A3). `execute` records the change in the store
 * (statusHistory, currentStatus, needsInfoRounds) and returns the card payload (§4.6). needsInfoRounds is +1 for
 * NEEDS_INFO and 0 for any other status; a turn that keeps NEEDS_INFO without a tool call is counted by the chat
 * route instead (AC-32). It records the model's
 * decision as sent, except for one guard (defence in depth for AC-31/AC-31a): an ACCEPTED request that
 * `maxAllowedChatStatus` does not allow is stored and returned as MANUAL_REVIEW with the initial decision's
 * appliedRules (real policy references for this case) instead of the model's acceptance rules.
 */
export function createUpdateDecisionTool(caseId: string) {
  return tool({
    description: DESCRIPTION,
    inputSchema: decisionUpdateSchema,
    execute: async (input: DecisionUpdate): Promise<DecisionUpdateResult> => {
      let update = structuredClone(input);
      const updated = caseStore.update(caseId, (c) => {
        if (update.status === "ACCEPTED" && maxAllowedChatStatus(c) === "MANUAL_REVIEW") {
          update = {
            status: "MANUAL_REVIEW",
            reason: CHAT_DOWNGRADE_REASON,
            appliedRules: structuredClone(c.initialDecision.appliedRules),
          };
          console.warn({ caseId, step: "updateDecision", downgradedFrom: "ACCEPTED" });
        }
        c.statusHistory.push({ ...update, at: new Date() });
        c.currentStatus = update.status;
        c.needsInfoRounds = update.status === "NEEDS_INFO" ? c.needsInfoRounds + 1 : 0;
      });
      if (!updated) throw new Error(`Case ${caseId} not found`);

      return {
        status: update.status,
        label: DECISION_STATUSES[update.status],
        reason: update.reason,
        appliedRules: update.appliedRules,
        disclaimer: pl.firstMessage.disclaimer,
      };
    },
  });
}
