/** Case ID format `HSC-YYYYMMDD-XXXX` (PRD AC-25). */
export const CASE_ID_REGEX = /^HSC-\d{8}-[A-Z0-9]{4}$/;

/** Builds a case ID from a `YYYY-MM-DD` (or `YYYYMMDD`) date and a 4-char uppercase alphanumeric suffix. */
export function formatCaseId(dateYYYYMMDD: string, suffix: string): string {
  const id = `HSC-${dateYYYYMMDD.replaceAll("-", "")}-${suffix}`;
  if (!CASE_ID_REGEX.test(id)) throw new Error(`Invalid case id: ${id}`);
  return id;
}
