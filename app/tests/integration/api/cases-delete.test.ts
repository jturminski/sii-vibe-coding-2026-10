import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decisionSchema, imageReportSchema, type CaseForm } from "@/lib/schemas";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies", CASE_TTL_MINUTES: 120 }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import { caseStore } from "@/server/store/case-store";
import { DELETE } from "@/app/api/cases/[caseId]/route";

const loadText = (name: string) =>
  (JSON.parse(readFileSync(path.resolve(process.cwd(), "tests/fixtures/llm", `${name}.json`), "utf8")) as {
    extracted: { text: string };
  }).extracted.text;

const form: CaseForm = {
  caseType: "RETURN",
  category: "SMARTPHONE",
  modelName: "Samsung Galaxy A54",
  purchaseDate: "2026-10-10",
  reason: "Urządzenie nie spełnia moich oczekiwań.",
};

function seedCase() {
  return caseStore.create({
    form,
    imageReport: imageReportSchema.parse(JSON.parse(loadText("return-image-analysis"))),
    initialDecision: decisionSchema.parse(JSON.parse(loadText("return-decision"))),
    messages: [],
  });
}

const deleteCase = (caseId: string) =>
  DELETE(new Request(`http://localhost/api/cases/${caseId}`, { method: "DELETE" }), {
    params: Promise.resolve({ caseId }),
  });

describe("DELETE /api/cases/[caseId]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes the case and answers 204 with an empty body", async () => {
    const c = seedCase();
    const response = await deleteCase(c.id);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(caseStore.get(c.id)).toBeUndefined();
  });

  it("is idempotent: DELETE twice → 204, 204", async () => {
    const c = seedCase();
    expect((await deleteCase(c.id)).status).toBe(204);
    expect((await deleteCase(c.id)).status).toBe(204);
  });

  it("an unknown or malformed ID → 204", async () => {
    expect((await deleteCase("HSC-20261019-ZZZZ")).status).toBe(204);
    expect((await deleteCase("not-a-case-id")).status).toBe(204);
  });

  it("leaves other cases untouched", async () => {
    const keep = seedCase();
    const remove = seedCase();
    await deleteCase(remove.id);
    expect(caseStore.get(keep.id)).toBeDefined();
    caseStore.delete(keep.id);
  });
});
