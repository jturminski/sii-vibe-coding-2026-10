import "server-only";
import type { UIMessageStreamWriter } from "ai";
import type { CaseForm, Decision, HscUIMessage, ImageReport, StageDataPart } from "@/lib/schemas";
import { analyzeImage } from "@/server/ai/analyze-image";
import { composeFirstMessage } from "@/server/ai/compose-first-message";
import { decide, enforceNeedsInfoQuestions } from "@/server/ai/decide";

export interface RunSubmissionInput {
  caseId: string;
  form: CaseForm;
  /** Server-compressed JPEG bytes (PRD AC-12). */
  jpeg: Uint8Array;
  /** Request time; passed to `decide` for the code-computed facts. */
  now: Date;
  signal: AbortSignal;
  /** Writer from `createUIMessageStream({ execute: ({ writer }) => ... })`. */
  writer: UIMessageStreamWriter<HscUIMessage>;
}

export interface RunSubmissionResult {
  report: ImageReport;
  decision: Decision;
  firstMessageText: string;
}

/**
 * Submission pipeline (ADR-003 §3 `runSubmission`, §7): stage `analyzing` → `analyzeImage` →
 * stage `deciding` → `decide` → `enforceNeedsInfoQuestions` (AC-20 guard) → `composeFirstMessage`. The caller stores
 * the guarded decision, so a downgraded case starts as MANUAL_REVIEW with `needsInfoRounds` 0. Stage parts are transient (ADR-002 §4).
 * Errors propagate unchanged.
 */
export async function runSubmission({
  caseId,
  form,
  jpeg,
  now,
  signal,
  writer,
}: RunSubmissionInput): Promise<RunSubmissionResult> {
  const { caseType, category, modelName } = form;

  writeStage(writer, "analyzing");
  const report = await analyzeImage({ caseId, caseType, category, modelName, jpeg, signal });

  writeStage(writer, "deciding");
  const modelDecision = await decide({ caseId, caseType, form, report, now, signal });
  const decision = enforceNeedsInfoQuestions(modelDecision);
  if (decision.status !== modelDecision.status) {
    console.warn({ caseId, step: "decide", downgradedFrom: modelDecision.status });
  }

  return { report, decision, firstMessageText: composeFirstMessage(caseId, decision) };
}

function writeStage(writer: UIMessageStreamWriter<HscUIMessage>, stage: StageDataPart["stage"]): void {
  writer.write({ type: "data-stage", data: { stage }, transient: true });
}
