import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DECISION_STATUSES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import {
  decisionUpdateResultSchema,
  decisionUpdateSchema,
  type CaseForm,
  type Decision,
  type DecisionUpdate,
  type ImageReport,
} from "@/lib/schemas";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies", CASE_TTL_MINUTES: 60 }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import { createUpdateDecisionTool } from "@/server/ai/tools/update-decision";
import { caseStore } from "@/server/store/case-store";

const form: CaseForm = {
  caseType: "RETURN",
  category: "SMARTPHONE",
  modelName: "Galaxy S99",
  purchaseDate: "2026-10-16",
  reason: "Nie spełnia oczekiwań.",
};

const imageReport: ImageReport = {
  caseType: "RETURN",
  imageUsable: false,
  imageIssue: "Zdjęcie jest zbyt ciemne.",
  categoryMatch: "uncertain",
  observedDevice: "Ciemny prostokątny przedmiot",
  visibleDamage: [],
  signsOfUse: [],
  visibleCompleteness: "Nie da się ocenić.",
  resaleCondition: "as_new",
};

const initialDecision: Decision = {
  status: "NEEDS_INFO",
  summary: "Potrzebujemy więcej informacji.",
  photoFindings: "Zdjęcie jest zbyt ciemne.",
  appliedRules: [{ ref: "§2 ust. 1", explanation: "Zwrot w terminie 14 dni." }],
  nextSteps: ["Odpowiedz na pytania."],
  questions: ["Czy urządzenie ma ślady użytkowania?"],
};

const needsInfo: DecisionUpdate = {
  status: "NEEDS_INFO",
  reason: "Nadal brakuje informacji o stanie urządzenia.",
  appliedRules: [{ ref: "§3 ust. 2", explanation: "Stan urządzenia musi być znany." }],
};

/** The updateDecision input the real model sent in `tests/fixtures/llm/chat-needs-info-answer.json`. */
const capturedToolCall = (
  JSON.parse(
    readFileSync(path.resolve(process.cwd(), "tests/fixtures/llm/chat-needs-info-answer.json"), "utf8"),
  ) as { extracted: { toolCalls: { toolName: string; input: string }[] } }
).extracted.toolCalls[0]!;

const accepted: DecisionUpdate = decisionUpdateSchema.parse(JSON.parse(capturedToolCall.input));

type UpdateDecisionTool = ReturnType<typeof createUpdateDecisionTool>;

function run(updateDecision: UpdateDecisionTool, input: DecisionUpdate) {
  return updateDecision.execute!(input, { toolCallId: "call-1", messages: [], context: {} });
}

describe("updateDecision tool", () => {
  let caseId: string;

  beforeEach(() => {
    caseId = caseStore.create({ form, imageReport, initialDecision, messages: [] }).id;
  });

  afterEach(() => {
    caseStore.delete(caseId);
    vi.useRealTimers();
  });

  it("uses decisionUpdateSchema as its input schema and has a description", () => {
    const updateDecision = createUpdateDecisionTool(caseId);
    expect(updateDecision.inputSchema).toBe(decisionUpdateSchema);
    expect(updateDecision.description).toMatch(/only when the status changes/);
  });

  it("accepts the captured model input as valid decisionUpdateSchema input for updateDecision", () => {
    expect(capturedToolCall.toolName).toBe("updateDecision");
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.appliedRules.length).toBeGreaterThan(0);
  });

  it("returns the card payload with the Polish label and the PRD §11.6 disclaimer (ADR-003 §4.6)", async () => {
    const result = await run(createUpdateDecisionTool(caseId), accepted);
    expect(decisionUpdateResultSchema.parse(result)).toEqual({
      status: "ACCEPTED",
      label: DECISION_STATUSES.ACCEPTED,
      reason: accepted.reason,
      appliedRules: accepted.appliedRules,
      disclaimer: pl.firstMessage.disclaimer,
    });
  });

  it("appends to statusHistory with a timestamp and sets currentStatus", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-19T08:00:00Z"), toFake: ["Date"] });
    await run(createUpdateDecisionTool(caseId), accepted);

    const stored = caseStore.get(caseId)!;
    expect(stored.currentStatus).toBe("ACCEPTED");
    expect(stored.statusHistory).toEqual([{ ...accepted, at: new Date("2026-10-19T08:00:00Z") }]);
  });

  it("counts NEEDS_INFO rounds: two calls → 2, then a different status resets the counter to 0", async () => {
    const updateDecision = createUpdateDecisionTool(caseId);
    await run(updateDecision, needsInfo);
    await run(updateDecision, needsInfo);
    expect(caseStore.get(caseId)!.needsInfoRounds).toBe(2);
    expect(caseStore.get(caseId)!.statusHistory).toHaveLength(2);

    await run(updateDecision, accepted);
    const stored = caseStore.get(caseId)!;
    expect(stored.needsInfoRounds).toBe(0);
    expect(stored.currentStatus).toBe("ACCEPTED");
    expect(stored.statusHistory.map((entry) => entry.status)).toEqual(["NEEDS_INFO", "NEEDS_INFO", "ACCEPTED"]);
  });

  it("stores a copy of the input, so later changes to the input do not alter the history", async () => {
    const input = structuredClone(accepted);
    await run(createUpdateDecisionTool(caseId), input);
    input.appliedRules[0]!.explanation = "zmienione";
    expect(caseStore.get(caseId)!.statusHistory[0]!.appliedRules[0]!.explanation).toBe(
      accepted.appliedRules[0]!.explanation,
    );
  });

  it("throws when the case no longer exists, so the model gets a tool error", async () => {
    const updateDecision = createUpdateDecisionTool(caseId);
    caseStore.delete(caseId);
    await expect(run(updateDecision, accepted)).rejects.toThrow(/not found/);
  });
});
