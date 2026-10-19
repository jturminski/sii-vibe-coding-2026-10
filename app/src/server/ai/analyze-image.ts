import "server-only";
import { generateText, Output } from "ai";
import type { CaseType, Category } from "@/lib/domain";
import { complaintImageReportSchema, returnImageReportSchema, type ImageReport } from "@/lib/schemas";
import { visionModel } from "@/server/ai/models";
import { PROMPT_VERSION as COMPLAINT_IMAGE_VERSION } from "@/server/ai/prompts/complaint-image";
import { PROMPT_VERSION as RETURN_IMAGE_VERSION } from "@/server/ai/prompts/return-image";
import { buildImagePrompt } from "@/server/ai/prompts/shared";

/** Image-analysis input: the declared category and model name only, never the reason (PRD AC-15). */
export interface AnalyzeImageInput {
  caseId: string;
  caseType: CaseType;
  category: Category;
  modelName: string;
  /** Server-compressed JPEG bytes (PRD AC-12). */
  jpeg: Uint8Array;
  signal: AbortSignal;
}

/**
 * Stage 1 of the submission pipeline (ADR-003 §3 `analyzeImage`, A1): a structured visual report
 * from the photo. Throws on API error, abort or schema failure.
 */
export async function analyzeImage({
  caseId,
  caseType,
  category,
  modelName,
  jpeg,
  signal,
}: AnalyzeImageInput): Promise<ImageReport> {
  const prompt = buildImagePrompt(caseType, { category, modelName });
  const schema = caseType === "RETURN" ? returnImageReportSchema : complaintImageReportSchema;
  const model = visionModel();
  const started = performance.now();
  try {
    const result = await generateText({
      model,
      instructions: prompt.instructions,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt.userText },
            { type: "file", mediaType: "image/jpeg", data: jpeg },
          ],
        },
      ],
      output: Output.object<ImageReport>({ schema }),
      temperature: 0,
      providerOptions: { openrouter: { reasoning: { effort: "low" } } },
      abortSignal: signal,
    });
    return result.output;
  } finally {
    console.info({
      caseId,
      step: "analyzeImage",
      promptVersion: caseType === "RETURN" ? RETURN_IMAGE_VERSION : COMPLAINT_IMAGE_VERSION,
      modelId: model.modelId,
      latencyMs: Math.round(performance.now() - started),
    });
  }
}
