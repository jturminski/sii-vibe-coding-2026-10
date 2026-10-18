import "server-only";
import type { ReturnImageReport } from "@/lib/schemas";
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

/** Ordered return decision rules (ADR-003 §4.4, AC-18, AC-20, AC-22). */
const RETURN_RULES = [
  "Decision rules. Apply them in this order and use the first one that matches:",
  "1. If daysSincePurchase > 14: REJECTED, cite §2 ust. 3 (the return was submitted after the 14-day withdrawal period).",
  "2. Else if the category is Słuchawki and the device appears to be in-ear headphones/earbuds: if the hygienic seal is clearly broken, REJECTED citing §4 ust. 1; if the headphone type or the state of the seal is unclear, MANUAL_REVIEW citing §4 ust. 1.",
  "3. Else if imageUsable is false or categoryMatch is \"no\": NEEDS_INFO. Say what is missing and ask at most 3 concrete text questions. If a new photo is essential, tell the customer to start a new case.",
  "4. Else if the report lists any signs of use or any damage: MANUAL_REVIEW, cite §3 ust. 3 for signs of use and/or §3 ust. 4 for damage, and explain that the right of withdrawal is not lost but a specialist determines any reduction in value. Never REJECTED for signs of use alone.",
  "5. Else: ACCEPTED, cite §2 ust. 1 and §3 ust. 2. Take the next steps from §5 (how to send the device back and the refund timing as written in the terms).",
].join("\n");

/** Return decision prompt (ADR-003 §4.4): role, terms, facts, rules and output rules; case data in `userText`. */
export async function buildReturnDecisionPrompt(input: DecisionPromptInput<ReturnImageReport>): Promise<BuiltPrompt> {
  const policy = await getPolicy("RETURN");
  const instructions = [
    decisionRole("return"),
    "",
    "Store return terms:",
    termsBlock(policy),
    "",
    "Facts:",
    factsBlock(input.facts),
    "",
    RETURN_RULES,
    "",
    decisionOutputRules(),
  ].join("\n");

  return { instructions, userText: decisionUserText(input) };
}
