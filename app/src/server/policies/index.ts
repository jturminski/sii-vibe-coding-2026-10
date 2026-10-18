import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CaseType } from "@/lib/domain";
import { getEnv } from "@/server/env";

const POLICY_FILES: Record<CaseType, string> = {
  RETURN: "return-policy.md",
  COMPLAINT: "complaint-policy.md",
};

const cache = new Map<CaseType, string>();

/** Policy markdown for the case type, read from `POLICIES_DIR` (relative to `app/`) once and cached. */
export async function getPolicy(caseType: CaseType): Promise<string> {
  const cached = cache.get(caseType);
  if (cached !== undefined) return cached;

  const file = path.resolve(process.cwd(), getEnv().POLICIES_DIR, POLICY_FILES[caseType]);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (cause) {
    throw new Error(`Policy file not found or unreadable: ${file}. Check POLICIES_DIR.`, { cause });
  }
  cache.set(caseType, text);
  return text;
}

/** Test helper: forget cached policies so the next call reads from disk. */
export function resetPolicyCache(): void {
  cache.clear();
}
