import type { z } from "zod";

/** Maps each failing path (segments joined by ".") to the first error code reported for it. */
export function fieldCodes(result: z.ZodSafeParseResult<unknown>): Record<string, string> {
  if (result.success) return {};
  const codes: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".");
    codes[key] ??= issue.message;
  }
  return codes;
}
