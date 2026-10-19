import { createUIMessageStream, createUIMessageStreamResponse, generateId } from "ai";
import { LIMITS } from "@/lib/domain";
import {
  createCaseFormSchema,
  ERROR_CODES,
  type CaseDataPart,
  type CaseForm,
  type ErrorCode,
  type HscUIMessage,
} from "@/lib/schemas";
import { runSubmission } from "@/server/ai/run-submission";
import { jsonError, logServerError, PROCESSING_FAILED } from "@/server/http/errors";
import { compressImage, validateImage } from "@/server/image";
import { createCaseId } from "@/server/store/case-id";
import { caseStore } from "@/server/store/case-store";

// No `export const runtime = 'nodejs'`: with `cacheComponents` enabled Next 16 rejects the `runtime`
// segment config and always uses Node.js (node_modules/next/dist/docs/.../route-segment-config/runtime.md).
export const maxDuration = 60;

const FORM_FIELDS = ["caseType", "category", "modelName", "purchaseDate", "reason"] as const;

type FieldErrors = Record<string, ErrorCode>;

type ParsedSubmission = { ok: true; form: CaseForm; jpeg: Uint8Array } | { ok: false; fields: FieldErrors };

/** Text fields only; a file sent under a text field name counts as missing. */
function readFormFields(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of FORM_FIELDS) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value;
  }
  return values;
}

/** Non-empty uploaded files under `image` (a browser sends an empty file when nothing is chosen). */
function readImages(formData: FormData): File[] {
  return formData.getAll("image").filter((value): value is File => typeof value !== "string" && value.size > 0);
}

function validateForm(formData: FormData, now: Date): { form?: CaseForm; fields: FieldErrors } {
  const result = createCaseFormSchema(now).safeParse(readFormFields(formData));
  if (result.success) return { form: result.data, fields: {} };
  const fields: FieldErrors = {};
  for (const issue of result.error.issues) {
    const name = issue.path[0];
    if (typeof name === "string" && !(name in fields)) fields[name] = issue.message as ErrorCode;
  }
  return { fields };
}

/** Image checks (ADR-002 §5): count → size → magic bytes → sharp decode; returns the JPEG or an error code. */
async function processImage(images: File[]): Promise<{ jpeg: Uint8Array } | { code: ErrorCode }> {
  const [image] = images;
  if (!image) return { code: ERROR_CODES.REQUIRED };
  if (images.length > 1) return { code: ERROR_CODES.MULTIPLE_FILES };
  const bytes = new Uint8Array(await image.arrayBuffer());
  const checked = await validateImage(bytes);
  if (!checked.ok) return { code: checked.code };
  try {
    return { jpeg: (await compressImage(bytes)).bytes };
  } catch {
    return { code: ERROR_CODES.UNSUPPORTED_FORMAT };
  }
}

/** All pre-stream checks; the image is decoded only when the form fields are valid. */
async function parseSubmission(formData: FormData, now: Date): Promise<ParsedSubmission> {
  const { form, fields } = validateForm(formData, now);
  const images = readImages(formData);
  if (!form) {
    if (images.length !== 1) fields.image = images.length === 0 ? ERROR_CODES.REQUIRED : ERROR_CODES.MULTIPLE_FILES;
    return { ok: false, fields };
  }
  const image = await processImage(images);
  if ("code" in image) return { ok: false, fields: { image: image.code } };
  return { ok: true, form, jpeg: image.jpeg };
}

/**
 * `POST /api/cases` (ADR-002 §5, §7): validates the multipart form and the image before any model
 * call, then streams the submission pipeline. The case is stored only after the pipeline succeeds.
 */
export async function POST(request: Request): Promise<Response> {
  const now = new Date();
  const signal = AbortSignal.timeout(LIMITS.REQUEST_TIMEOUT_MS);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, { error: "VALIDATION" });
  }

  const parsed = await parseSubmission(formData, now);
  if (!parsed.ok) return jsonError(400, { error: "VALIDATION", fields: parsed.fields });
  // The compressed image lives only in this request; it is never stored with the case.
  const { form, jpeg } = parsed;

  const caseId = createCaseId(now, (id) => caseStore.get(id) !== undefined);
  const messageId = generateId();
  const metadata = { createdAt: now.getTime() };

  const stream = createUIMessageStream<HscUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId, messageMetadata: metadata });
      const { report, decision, firstMessageText } = await runSubmission({ caseId, form, jpeg, now, signal, writer });

      const caseData: CaseDataPart = { caseId, ...form, status: decision.status };
      caseStore.create(
        {
          form,
          imageReport: report,
          initialDecision: decision,
          currentStatus: decision.status,
          statusHistory: [
            { status: decision.status, reason: decision.summary, appliedRules: decision.appliedRules, at: now },
          ],
          needsInfoRounds: decision.status === "NEEDS_INFO" ? 1 : 0,
          userMessageCount: 0,
          messages: [
            {
              id: messageId,
              role: "assistant",
              metadata,
              parts: [
                { type: "data-case", data: caseData },
                { type: "text", text: firstMessageText, state: "done" },
              ],
            },
          ],
        },
        { id: caseId },
      );

      // Written only after the case is stored, so a client never sees an ID the store lacks.
      const textId = generateId();
      writer.write({ type: "data-case", data: caseData });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: firstMessageText });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    onError: (error) => {
      logServerError({ caseId, code: PROCESSING_FAILED, cause: error });
      return PROCESSING_FAILED;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
