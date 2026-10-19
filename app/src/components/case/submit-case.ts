import { parseJsonEventStream, readUIMessageStream, uiMessageChunkSchema, type UIMessageChunk } from "ai";
import { z } from "zod";
import {
  caseDataPartSchema,
  ERROR_CODES,
  stageDataPartSchema,
  type CaseDataPart,
  type CaseForm,
  type ErrorCode,
  type HscUIMessage,
  type StageDataPart,
} from "@/lib/schemas";

/** Multipart field names of `POST /api/cases` (ADR-002 §4). */
export type SubmissionField = keyof CaseForm | "image";

export type SubmissionFieldErrors = Partial<Record<SubmissionField, ErrorCode>>;

export type SubmitCaseResult =
  | { kind: "success"; caseId: string; caseData: CaseDataPart; message: HscUIMessage }
  | { kind: "validation"; fields: SubmissionFieldErrors };

export type SubmitCaseOptions = {
  /** Called for every transient `data-stage` chunk, before message assembly. */
  onStage: (stage: StageDataPart["stage"]) => void;
};

/** Processing failed: an error chunk, a network error or an unusable response (AC-34). */
export class ProcessingFailed extends Error {
  constructor(options?: { cause?: unknown }) {
    super("PROCESSING_FAILED", options);
    this.name = "ProcessingFailed";
  }
}

const errorCodeSchema = z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);
const validationBodySchema = z.object({
  error: z.literal("VALIDATION"),
  fields: z.partialRecord(
    z.enum(["caseType", "category", "modelName", "purchaseDate", "reason", "image"]),
    errorCodeSchema,
  ),
});

function toFormData(values: CaseForm, file: File): FormData {
  const body = new FormData();
  body.set("caseType", values.caseType);
  body.set("category", values.category);
  body.set("modelName", values.modelName);
  body.set("purchaseDate", values.purchaseDate);
  body.set("reason", values.reason);
  body.set("image", file);
  return body;
}

/** Decodes the SSE body into UI message chunks; parse failures and error chunks fail the stream. */
function toChunks(body: ReadableStream<Uint8Array>, onStage: SubmitCaseOptions["onStage"]) {
  return parseJsonEventStream({ stream: body, schema: uiMessageChunkSchema }).pipeThrough(
    new TransformStream<ParsedChunk, UIMessageChunk>({
      transform(result, controller) {
        if (!result.success) throw new ProcessingFailed({ cause: result.error });
        const chunk = result.value;
        if (chunk.type === "error") throw new ProcessingFailed({ cause: chunk.errorText });
        if (chunk.type === "data-stage") {
          const stage = stageDataPartSchema.safeParse(chunk.data);
          if (stage.success) onStage(stage.data.stage);
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

type ParsedChunk =
  | { success: true; value: UIMessageChunk; rawValue: unknown }
  | { success: false; error: unknown; rawValue: unknown };

/**
 * Submits the case form (ADR-004 §3 "Case form" submit bullet, F2).
 * 400 → the field codes. 200 → the stages via `onStage`, then the first assistant message.
 * Anything else rejects with `ProcessingFailed`.
 */
export async function submitCase(values: CaseForm, file: File, { onStage }: SubmitCaseOptions): Promise<SubmitCaseResult> {
  let response: Response;
  try {
    response = await fetch("/api/cases", { method: "POST", body: toFormData(values, file) });
  } catch (error) {
    throw new ProcessingFailed({ cause: error });
  }

  if (response.status === 400) {
    const body = validationBodySchema.safeParse(await response.json().catch(() => null));
    if (!body.success) throw new ProcessingFailed({ cause: body.error });
    return { kind: "validation", fields: body.data.fields };
  }
  if (!response.ok || !response.body) throw new ProcessingFailed({ cause: response.status });

  let message: HscUIMessage | undefined;
  try {
    for await (const next of readUIMessageStream<HscUIMessage>({
      stream: toChunks(response.body, onStage),
      terminateOnError: true,
    })) {
      message = next;
    }
  } catch (error) {
    throw error instanceof ProcessingFailed ? error : new ProcessingFailed({ cause: error });
  }

  const casePart = message?.parts.find((part) => part.type === "data-case");
  const caseData = caseDataPartSchema.safeParse(casePart?.data);
  if (!message || !caseData.success) throw new ProcessingFailed({ cause: "MISSING_CASE_DATA" });

  return { kind: "success", caseId: caseData.data.caseId, caseData: caseData.data, message };
}
