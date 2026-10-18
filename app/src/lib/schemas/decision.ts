import { z } from "zod";
import { LIMITS } from "@/lib/domain";
import { decisionStatusSchema } from "./enums";

/** Policy reference "§N ust. M" or a range "§N ust. M–K" (PRD AC-21). */
export const RULE_REF_REGEX = /^§\d+ ust\. \d+(?:[–-]\d+)?$/;

const MAX_RULES = 5;
const MAX_NEXT_STEPS = 5;

const statusSchema = decisionStatusSchema.describe(
  "Decision status: ACCEPTED, REJECTED, MANUAL_REVIEW (specialist review) or NEEDS_INFO (more information needed).",
);

export const appliedRuleSchema = z
  .object({
    ref: z
      .string()
      .regex(RULE_REF_REGEX)
      .describe("Reference to a clause that exists in the provided terms, exactly in the form '§N ust. M'."),
    explanation: z
      .string()
      .min(1)
      .describe("Polish, plain language: how this clause applies to the customer's case."),
  })
  .describe("One policy clause applied to the decision.");

const appliedRulesSchema = z
  .array(appliedRuleSchema)
  .min(1)
  .max(MAX_RULES)
  .describe("Policy clauses the decision is based on, 1 to 5.");

export const decisionSchema = z
  .object({
    status: statusSchema,
    summary: z.string().min(1).describe("Polish, plain language: the decision in 1–3 sentences."),
    photoFindings: z
      .string()
      .describe("Polish, plain language: what the photo analysis found that matters for the decision."),
    appliedRules: appliedRulesSchema,
    nextSteps: z
      .array(z.string().min(1).describe("Polish, plain language: one concrete next step."))
      .min(1)
      .max(MAX_NEXT_STEPS)
      .describe("Polish, plain language: what the customer should do next, 1 to 5 steps."),
    questions: z
      .array(z.string().min(1).describe("Polish, plain language: one question to the customer."))
      .max(LIMITS.MAX_QUESTIONS)
      .describe("Polish, plain language: up to 3 questions, only when the status is NEEDS_INFO; otherwise empty."),
  })
  .describe("Preliminary decision for the case.");

/** `updateDecision` tool input (ADR-000 §5). */
export const decisionUpdateSchema = z
  .object({
    status: statusSchema.describe("The new decision status; call the tool only when the status changes."),
    reason: z.string().min(1).describe("Polish, plain language: why the status changed."),
    appliedRules: appliedRulesSchema,
  })
  .describe("Change of the decision status during the chat.");

/** `updateDecision` tool output, rendered by the UI as the "Zaktualizowana decyzja" card (ADR-003 §4.6). */
export const decisionUpdateResultSchema = z.object({
  status: decisionStatusSchema,
  label: z.string().min(1),
  reason: z.string().min(1),
  appliedRules: z.array(appliedRuleSchema),
  disclaimer: z.string().min(1),
});

export type AppliedRule = z.infer<typeof appliedRuleSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type DecisionUpdate = z.infer<typeof decisionUpdateSchema>;
export type DecisionUpdateResult = z.infer<typeof decisionUpdateResultSchema>;
