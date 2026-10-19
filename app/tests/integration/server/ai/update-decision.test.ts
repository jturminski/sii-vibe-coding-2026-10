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
  type ComplaintImageReport,
  type ImageReport,
} from "@/lib/schemas";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies", CASE_TTL_MINUTES: 60 }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import {
  CHAT_DOWNGRADE_REASON,
  createUpdateDecisionTool,
  maxAllowedChatStatus,
} from "@/server/ai/tools/update-decision";
import { caseStore, type Case } from "@/server/store/case-store";

const form: CaseForm = {
  caseType: "RETURN",
  category: "SMARTPHONE",
  modelName: "Galaxy S99",
  purchaseDate: "2026-10-16",
  reason: "Nie spełnia oczekiwań.",
};

/** A return whose photo confirms the condition: ACCEPTED is allowed in the chat. */
const imageReport: ImageReport = {
  caseType: "RETURN",
  imageUsable: true,
  imageIssue: null,
  categoryMatch: "yes",
  observedDevice: "Smartfon w pudełku",
  visibleDamage: [],
  signsOfUse: [],
  visibleCompleteness: "Telefon, ładowarka i pudełko.",
  resaleCondition: "as_new",
};

const initialDecision: Decision = {
  status: "NEEDS_INFO",
  summary: "Potrzebujemy więcej informacji.",
  photoFindings: "Na zdjęciu nie widać śladów użytkowania.",
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

/** The captured laptop complaint (`chat-needs-info-answer.json`): the photo shows no fault, cause unknown, low confidence. */
const capturedSeed = (
  JSON.parse(
    readFileSync(path.resolve(process.cwd(), "tests/fixtures/llm/chat-needs-info-answer.json"), "utf8"),
  ) as { seed: { initialDecision: Decision } }
).seed;

const complaintForm: CaseForm = {
  caseType: "COMPLAINT",
  category: "LAPTOP",
  modelName: "Lenovo IdeaPad 5",
  purchaseDate: "2025-09-14",
  reason: "Laptop przestał działać poprawnie podczas normalnego używania w domu.",
};

/** The image report of the captured case (from the captured chat prompt). */
const unconfirmedComplaintReport: ComplaintImageReport = {
  caseType: "COMPLAINT",
  imageUsable: true,
  imageIssue: null,
  categoryMatch: "yes",
  observedDevice: "Otwarty laptop Lenovo z ekranem, klawiaturą i touchpadem.",
  visibleDamage: [],
  likelyCause: "unknown",
  causeConfidence: "low",
};

const confirmedComplaintReport: ComplaintImageReport = {
  ...unconfirmedComplaintReport,
  visibleDamage: [{ type: "pęknięcie zawiasu", location: "lewy zawias", extent: "umiarkowane, bez śladów uderzenia" }],
  likelyCause: "manufacturing_defect",
  causeConfidence: "high",
};

const crackedReturnReport: ImageReport = {
  ...imageReport,
  visibleDamage: [{ type: "pęknięcie", location: "ekran", extent: "poważne" }],
  resaleCondition: "damaged",
};

const rejectedForDamage: Decision = {
  ...initialDecision,
  status: "REJECTED",
  summary: "Ekran jest pęknięty.",
  questions: [],
};

type CaseSeed = Pick<Case, "form" | "imageReport" | "initialDecision">;

describe("maxAllowedChatStatus", () => {
  const created: string[] = [];
  const make = (seed: CaseSeed): Case => {
    const c = caseStore.create({ ...seed, messages: [] });
    created.push(c.id);
    return c;
  };

  afterEach(() => {
    for (const id of created.splice(0)) caseStore.delete(id);
  });

  it("caps at MANUAL_REVIEW when the initial decision was REJECTED for visible damage (AC-31)", () => {
    expect(maxAllowedChatStatus(make({ form, imageReport: crackedReturnReport, initialDecision: rejectedForDamage }))).toBe(
      "MANUAL_REVIEW",
    );
    expect(
      maxAllowedChatStatus(
        make({
          form: complaintForm,
          imageReport: { ...confirmedComplaintReport, likelyCause: "mechanical_impact" },
          initialDecision: rejectedForDamage,
        }),
      ),
    ).toBe("MANUAL_REVIEW");
  });

  it("caps at MANUAL_REVIEW for a complaint whose photo shows no fault, cause unknown, low confidence (AC-31a, captured case)", () => {
    expect(
      maxAllowedChatStatus(
        make({ form: complaintForm, imageReport: unconfirmedComplaintReport, initialDecision: capturedSeed.initialDecision }),
      ),
    ).toBe("MANUAL_REVIEW");
  });

  it.each([
    ["no visible damage or fault", { visibleDamage: [] }],
    ["likelyCause unknown", { likelyCause: "unknown" }],
    ["causeConfidence low", { causeConfidence: "low" }],
    ["unusable photo", { imageUsable: false, imageIssue: "Rozmazane." }],
  ] satisfies [string, Partial<ComplaintImageReport>][])(
    "caps a complaint at MANUAL_REVIEW when one signal does not confirm the fault: %s (AC-31a)",
    (_name, change) => {
      const report: ComplaintImageReport = { ...confirmedComplaintReport, ...change };
      expect(maxAllowedChatStatus(make({ form: complaintForm, imageReport: report, initialDecision }))).toBe(
        "MANUAL_REVIEW",
      );
    },
  );

  it("caps a return at MANUAL_REVIEW when the photo is not usable (AC-31a)", () => {
    const report: ImageReport = { ...imageReport, imageUsable: false, imageIssue: "Zdjęcie jest zbyt ciemne." };
    expect(maxAllowedChatStatus(make({ form, imageReport: report, initialDecision }))).toBe("MANUAL_REVIEW");
  });

  it("allows ACCEPTED for a return with a usable photo and no damage", () => {
    expect(maxAllowedChatStatus(make({ form, imageReport, initialDecision }))).toBe("ACCEPTED");
  });

  it("allows ACCEPTED for a complaint whose photo confirms the fault (visible, known cause, medium or high confidence)", () => {
    expect(
      maxAllowedChatStatus(make({ form: complaintForm, imageReport: confirmedComplaintReport, initialDecision })),
    ).toBe("ACCEPTED");
    expect(
      maxAllowedChatStatus(
        make({ form: complaintForm, imageReport: { ...confirmedComplaintReport, causeConfidence: "medium" }, initialDecision }),
      ),
    ).toBe("ACCEPTED");
  });

  it("allows ACCEPTED after an initial REJECTED that was not for visible damage (e.g. past the deadline)", () => {
    expect(
      maxAllowedChatStatus(make({ form, imageReport, initialDecision: { ...rejectedForDamage, summary: "Po terminie." } })),
    ).toBe("ACCEPTED");
  });
});

describe("updateDecision tool: AC-31/AC-31a guard", () => {
  let caseId: string;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    caseId = caseStore.create({
      form: complaintForm,
      imageReport: unconfirmedComplaintReport,
      initialDecision: capturedSeed.initialDecision,
      messages: [],
    }).id;
  });

  afterEach(() => {
    caseStore.delete(caseId);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stores MANUAL_REVIEW instead of the captured ACCEPTED and returns the MANUAL_REVIEW card (regression)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-19T08:00:00Z"), toFake: ["Date"] });
    const result = await run(createUpdateDecisionTool(caseId), accepted);

    expect(decisionUpdateResultSchema.parse(result)).toEqual({
      status: "MANUAL_REVIEW",
      label: DECISION_STATUSES.MANUAL_REVIEW,
      reason: CHAT_DOWNGRADE_REASON,
      appliedRules: capturedSeed.initialDecision.appliedRules,
      disclaimer: pl.firstMessage.disclaimer,
    });
    const stored = caseStore.get(caseId)!;
    expect(stored.currentStatus).toBe("MANUAL_REVIEW");
    expect(stored.needsInfoRounds).toBe(0);
    expect(stored.statusHistory).toEqual([
      {
        status: "MANUAL_REVIEW",
        reason: CHAT_DOWNGRADE_REASON,
        appliedRules: capturedSeed.initialDecision.appliedRules,
        at: new Date("2026-10-19T08:00:00Z"),
      },
    ]);
  });

  it("states the new status label in Polish, so the follow-up text is anchored", () => {
    expect(CHAT_DOWNGRADE_REASON).toContain(`„${DECISION_STATUSES.MANUAL_REVIEW}”`);
  });

  it("logs the downgrade with caseId, step and downgradedFrom", async () => {
    await run(createUpdateDecisionTool(caseId), accepted);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toEqual({ caseId, step: "updateDecision", downgradedFrom: "ACCEPTED" });
  });

  it("passes other statuses through unchanged and without a log", async () => {
    const updateDecision = createUpdateDecisionTool(caseId);
    for (const status of ["NEEDS_INFO", "MANUAL_REVIEW", "REJECTED"] as const) {
      const result = await run(updateDecision, { ...needsInfo, status });
      expect(result).toMatchObject({ status, reason: needsInfo.reason });
    }
    expect(caseStore.get(caseId)!.statusHistory.map((entry) => entry.status)).toEqual([
      "NEEDS_INFO",
      "MANUAL_REVIEW",
      "REJECTED",
    ]);
    expect(warn).not.toHaveBeenCalled();
  });
});

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

  it("returns the card payload with the Polish label and the PRD §11.6 disclaimer; a confirmed case stays ACCEPTED (ADR-003 §4.6)", async () => {
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
