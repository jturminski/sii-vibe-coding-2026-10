import "server-only";
import { generateText, Output } from "ai";
import type { CaseType } from "@/lib/domain";
import { decisionSchema, type CaseForm, type Decision, type ImageReport } from "@/lib/schemas";
import { buildFacts } from "@/server/ai/facts";
import { decisionModel } from "@/server/ai/models";
import { PROMPT_VERSION as COMPLAINT_DECISION_VERSION } from "@/server/ai/prompts/complaint-decision";
import { PROMPT_VERSION as RETURN_DECISION_VERSION } from "@/server/ai/prompts/return-decision";
import { buildDecisionPrompt } from "@/server/ai/prompts/shared";

export interface DecideInput {
  caseId: string;
  caseType: CaseType;
  form: Pick<CaseForm, "category" | "modelName" | "purchaseDate" | "reason">;
  /** Stage 1 report for the same case type. */
  report: ImageReport;
  /** Request time; the facts (today, daysSincePurchase) are computed from it. */
  now: Date;
  signal: AbortSignal;
}

/**
 * Stage 2 of the submission pipeline (ADR-003 §3 `decide`, A1): a text-only structured decision from
 * the form, the image report and code-computed facts. Throws on API error, abort or schema failure.
 */
export async function decide({ caseId, caseType, form, report, now, signal }: DecideInput): Promise<Decision> {
  const facts = buildFacts({ purchaseDate: form.purchaseDate, now, caseType });
  const prompt = await buildDecisionPrompt(caseType, { form, report, facts });
  const model = decisionModel();
  const started = performance.now();
  try {
    const result = await generateText({
      model,
      instructions: prompt.instructions,
      messages: [{ role: "user", content: [{ type: "text", text: prompt.userText }] }],
      output: Output.object({ schema: decisionSchema }),
      temperature: 0,
      providerOptions: { openrouter: { reasoning: { effort: "medium" } } },
      abortSignal: signal,
    });
    return result.output;
  } finally {
    console.info({
      caseId,
      step: "decide",
      promptVersion: caseType === "RETURN" ? RETURN_DECISION_VERSION : COMPLAINT_DECISION_VERSION,
      modelId: model.modelId,
      latencyMs: Math.round(performance.now() - started),
    });
  }
}
