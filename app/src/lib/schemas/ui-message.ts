import type { UIMessage } from "ai";
import { z } from "zod";
import { CASE_ID_REGEX } from "@/lib/domain";
import type { DecisionUpdate, DecisionUpdateResult } from "./decision";
import { caseTypeSchema, categorySchema, decisionStatusSchema } from "./enums";

/** Persistent `data-case` part: the summary panel reads it (ADR-002 §4). */
export const caseDataPartSchema = z.object({
  caseId: z.string().regex(CASE_ID_REGEX),
  caseType: caseTypeSchema,
  category: categorySchema,
  modelName: z.string(),
  purchaseDate: z.string(),
  reason: z.string(),
  status: decisionStatusSchema,
});

/** Transient `data-stage` part shown while the submission is processed. */
export const stageDataPartSchema = z.object({
  stage: z.enum(["analyzing", "deciding"]),
});

export const hscMetadataSchema = z.object({
  createdAt: z.number(),
});

/** Data part schemas keyed by name, e.g. for `useChat({ dataPartSchemas })`. */
export const hscDataPartSchemas = {
  case: caseDataPartSchema,
  stage: stageDataPartSchema,
};

export type CaseDataPart = z.infer<typeof caseDataPartSchema>;
export type StageDataPart = z.infer<typeof stageDataPartSchema>;
export type HscMetadata = z.infer<typeof hscMetadataSchema>;

export type HscDataParts = {
  case: CaseDataPart;
  stage: StageDataPart;
};

/** UI tool types declared from the schemas, so client code never imports the server tool implementation. */
export type HscUITools = {
  updateDecision: { input: DecisionUpdate; output: DecisionUpdateResult };
};

export type HscUIMessage = UIMessage<HscMetadata, HscDataParts, HscUITools>;
