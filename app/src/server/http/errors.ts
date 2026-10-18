import "server-only";
import { ERROR_CODES, type ErrorCode } from "@/lib/schemas";

/** Stream error text for any failed submission or chat turn (ADR-002 §4). */
export const PROCESSING_FAILED = "PROCESSING_FAILED";

/** The only JSON error bodies the API returns (ADR-002 §4). */
export type ErrorBody =
  | { error: "VALIDATION"; fields?: Partial<Record<string, ErrorCode>> }
  | { error: "CASE_NOT_FOUND" }
  | { error: "MESSAGE_LIMIT" }
  | { error: "TURN_IN_PROGRESS" };

export type ErrorStatus = 400 | 404 | 409;

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_CODES, value);
}

/**
 * Builds the response body from whitelisted keys only, so a stack trace, upstream
 * message, model ID or key can never reach the client (AC-36, TAC-002-01).
 */
function sanitize(body: ErrorBody): ErrorBody {
  if (body.error !== "VALIDATION") return { error: body.error };
  if (body.fields === undefined) return { error: "VALIDATION" };
  const fields: Record<string, ErrorCode> = {};
  for (const [name, code] of Object.entries(body.fields)) {
    if (isErrorCode(code)) fields[name] = code;
  }
  return { error: "VALIDATION", fields };
}

export function jsonError(status: ErrorStatus, body: ErrorBody): Response {
  return Response.json(sanitize(body), { status });
}

/** Server-side log of an internal failure; never returned to the client. */
export function logServerError({ caseId, code, cause }: { caseId?: string; code: string; cause: unknown }): void {
  console.error(caseId === undefined ? { code, cause } : { caseId, code, cause });
}
