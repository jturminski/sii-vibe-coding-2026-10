import type { ValidationErrorCode } from "@/lib/i18n/pl";

/**
 * Validation error codes shared by the form and the route handlers (ADR-002 §4).
 * Zod issues carry the code as their `message`; the UI maps it to `pl.validation[code]`.
 */
export const ERROR_CODES = {
  REQUIRED: "REQUIRED",
  TOO_SHORT: "TOO_SHORT",
  TOO_LONG: "TOO_LONG",
  FUTURE_DATE: "FUTURE_DATE",
  INVALID_ENUM: "INVALID_ENUM",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  MULTIPLE_FILES: "MULTIPLE_FILES",
} as const satisfies { [K in ValidationErrorCode]: K };

export type ErrorCode = keyof typeof ERROR_CODES;
