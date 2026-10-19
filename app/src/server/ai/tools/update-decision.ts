import "server-only";
import { tool } from "ai";
import { DECISION_STATUSES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import { decisionUpdateSchema, type DecisionUpdate, type DecisionUpdateResult } from "@/lib/schemas";
import { caseStore } from "@/server/store/case-store";

const DESCRIPTION = [
  "Record a change of the decision status for this case.",
  "Call it only when the status changes from the current status, never to repeat the current status.",
  "After the call, explain the change to the customer in Polish.",
].join(" ");

/**
 * `updateDecision` tool bound to one case (ADR-003 §3, A3). `execute` records the change in the store
 * (statusHistory, currentStatus, needsInfoRounds) and returns the card payload (§4.6). It never enforces
 * decision rules (ADR-000 D5); it only records them.
 */
export function createUpdateDecisionTool(caseId: string) {
  return tool({
    description: DESCRIPTION,
    inputSchema: decisionUpdateSchema,
    execute: async (input: DecisionUpdate): Promise<DecisionUpdateResult> => {
      const update = structuredClone(input);
      const updated = caseStore.update(caseId, (c) => {
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
