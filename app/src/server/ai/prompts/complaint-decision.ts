import "server-only";
import type { ComplaintImageReport } from "@/lib/schemas";
import { getPolicy } from "@/server/policies";
import {
  decisionOutputRules,
  decisionRole,
  decisionUserText,
  factsBlock,
  termsBlock,
  type BuiltPrompt,
  type DecisionPromptInput,
} from "./shared";

export const PROMPT_VERSION = "1";

/** Ordered complaint decision rules (ADR-003 §4.4, AC-19, AC-20). */
const COMPLAINT_RULES = [
  "Decision rules. Apply them in this order and use the first one that matches:",
  "1. If daysSincePurchase > 730 (more than 2 years): REJECTED, cite §2 ust. 3 (the 2-year liability period has passed).",
  "2. Else if imageUsable is false or categoryMatch is \"no\": NEEDS_INFO. Say what is missing and ask at most 3 concrete text questions. If a new photo is essential, tell the customer to start a new case.",
  "3. Else if likelyCause is mechanical_impact or liquid with causeConfidence medium or high: REJECTED, cite §3 ust. 2 (damage caused after delivery is not non-conformity), and suggest checking the manufacturer warranty, without assessing it.",
  "4. Else if likelyCause is manufacturing_defect with causeConfidence medium or high and the customer's statement is consistent with the image report: ACCEPTED, cite §2 ust. 1–2 and the remedy order in §5 ust. 1. Take the next steps from §5 and §6.",
  "5. Else (cause unknown, low confidence, the fault is not visible, or the statement and the image conflict): MANUAL_REVIEW, cite §4 ust. 1 (cause undetermined) or §4 ust. 2 (description contradicts photo).",
].join("\n");

/** Complaint decision prompt (ADR-003 §4.4): role, terms, facts, rules and output rules; case data in `userText`. */
export async function buildComplaintDecisionPrompt(
  input: DecisionPromptInput<ComplaintImageReport>,
): Promise<BuiltPrompt> {
  const policy = await getPolicy("COMPLAINT");
  const instructions = [
    decisionRole("complaint"),
    "",
    "Store complaint terms:",
    termsBlock(policy),
    "",
    "Facts:",
    factsBlock(input.facts),
    "",
    COMPLAINT_RULES,
    "",
    decisionOutputRules(),
  ].join("\n");

  return { instructions, userText: decisionUserText(input) };
}
