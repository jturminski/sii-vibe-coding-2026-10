import type { DecisionStatus } from "@/lib/domain";
import type { HscUIMessage } from "@/lib/schemas";

/**
 * Current case status (ADR-004 §3): the status of the last `tool-updateDecision` output in the
 * conversation, otherwise the initial status from `data-case`. Derived, never stored.
 */
export function currentStatus(messages: readonly HscUIMessage[], initial: DecisionStatus): DecisionStatus {
  for (let m = messages.length - 1; m >= 0; m -= 1) {
    const parts = messages[m]?.parts ?? [];
    for (let p = parts.length - 1; p >= 0; p -= 1) {
      const part = parts[p];
      if (part?.type === "tool-updateDecision" && part.state === "output-available") return part.output.status;
    }
  }
  return initial;
}
