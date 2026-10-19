import { z } from "zod";
import { LIMITS, todayInWarsaw } from "@/lib/domain";
import { caseTypeSchema, categorySchema } from "./enums";
import { ERROR_CODES } from "./error-codes";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** True when `YYYY-MM-DD` names a real calendar day (rejects e.g. 2026-02-30). */
function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Trimmed string where a missing, non-string or blank value reports REQUIRED. */
const requiredText = () => z.string({ error: ERROR_CODES.REQUIRED }).trim().min(1, ERROR_CODES.REQUIRED);

/**
 * Case form fields (PRD AC-03–07, ADR-000 §5). The image file is validated separately.
 * `now` fixes "today" (Europe/Warsaw) for the future-date check.
 */
export function createCaseFormSchema(now: Date = new Date()) {
  const today = todayInWarsaw(now);

  return z
    .object({
      caseType: caseTypeSchema,
      category: categorySchema,
      modelName: requiredText().max(LIMITS.MODEL_NAME_MAX, ERROR_CODES.TOO_LONG),
      purchaseDate: requiredText()
        .regex(ISO_DATE_REGEX, ERROR_CODES.REQUIRED)
        .refine(isCalendarDate, ERROR_CODES.REQUIRED)
        .refine((value) => value <= today, ERROR_CODES.FUTURE_DATE),
      reason: z
        .string({ error: ERROR_CODES.REQUIRED })
        .trim()
        .max(LIMITS.REASON_MAX, ERROR_CODES.TOO_LONG)
        .default(""),
    })
    .superRefine(
      ({ caseType, reason }, ctx) => {
        if (caseType !== "COMPLAINT" || reason.length >= LIMITS.COMPLAINT_REASON_MIN) return;
        ctx.addIssue({
          code: "custom",
          input: reason,
          path: ["reason"],
          message: reason.length === 0 ? ERROR_CODES.REQUIRED : ERROR_CODES.TOO_SHORT,
        });
      },
      // Also run when other fields failed, so the reason error shows together with them (AC-03/04).
      { when: (payload) => !payload.issues.some((issue) => isReasonOrTypeIssue(issue.path)) },
    );
}

/** Issues on `caseType` or `reason` mean the complaint reason rule cannot be evaluated safely. */
function isReasonOrTypeIssue(path: readonly PropertyKey[] = []): boolean {
  return path[0] === "caseType" || path[0] === "reason";
}

export type CaseFormSchema = ReturnType<typeof createCaseFormSchema>;
export type CaseFormInput = z.input<CaseFormSchema>;
export type CaseForm = z.output<CaseFormSchema>;
