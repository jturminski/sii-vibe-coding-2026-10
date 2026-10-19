import { readFileSync } from "node:fs";
import path from "node:path";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DECISION_STATUSES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import {
  decisionUpdateSchema,
  type CaseForm,
  type Decision,
  type DecisionUpdate,
  type HscUIMessage,
  type ImageReport,
} from "@/lib/schemas";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies", CASE_TTL_MINUTES: 60 }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import { createChatStream } from "@/server/ai/create-chat-stream";
import { resetModels, setModelsForTest } from "@/server/ai/models";
import { buildChatPrompt, PROMPT_VERSION as CHAT_PROMPT_VERSION } from "@/server/ai/prompts/chat";
import { caseStore, type Case } from "@/server/store/case-store";

/**
 * Real streamed chat turns from `tests/eval/capture-llm-fixtures.eval.ts`: `extracted.steps` holds the
 * provider stream parts of each model call, replayed here by `MockLanguageModelV4` `doStream`.
 */
interface ChatFixture {
  model: string;
  extracted: {
    steps: LanguageModelV4StreamPart[][];
    text: string;
    toolCalls: { toolCallId: string; toolName: string; input: string }[];
    statusAfter: string;
  };
}

function loadChatFixture(name: string): ChatFixture {
  const file = path.resolve(process.cwd(), "tests/fixtures/llm", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as ChatFixture;
}

/** A question answered in text only (one model call). */
const QUESTION = loadChatFixture("chat-question");
/** A NEEDS_INFO answer: call 1 streams reasoning and the updateDecision tool call, call 2 the text. */
const TOOL_TURN = loadChatFixture("chat-needs-info-answer");
const MODEL_ID = QUESTION.model;

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

/** The captured updateDecision input (status ACCEPTED). */
const accepted: DecisionUpdate = decisionUpdateSchema.parse(JSON.parse(TOOL_TURN.extracted.toolCalls[0]!.input));

const firstMessage: HscUIMessage = {
  id: "m-first",
  role: "assistant",
  parts: [
    {
      type: "data-case",
      data: { caseId: "HSC-20261019-AB12", ...form, status: "NEEDS_INFO" },
    },
    { type: "text", text: "Status: Potrzebne dodatkowe informacje." },
  ],
};

const userMessage = (text: string, id = "u-1"): HscUIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });

/**
 * The captured tool-call model call with another input and call ID: the captured input deltas are
 * replaced by one delta carrying `input`; every other part is replayed as captured.
 */
function toolCallStep(input: DecisionUpdate, toolCallId = "call-1"): LanguageModelV4StreamPart[] {
  const json = JSON.stringify(input);
  let deltaSent = false;
  return structuredClone(TOOL_TURN.extracted.steps[0]!).flatMap((part): LanguageModelV4StreamPart[] => {
    switch (part.type) {
      case "tool-input-start":
      case "tool-input-end":
        return [{ ...part, id: toolCallId }];
      case "tool-input-delta":
        if (deltaSent) return [];
        deltaSent = true;
        return [{ ...part, id: toolCallId, delta: json }];
      case "tool-call":
        return [{ ...part, toolCallId, input: json }];
      default:
        return [part];
    }
  });
}

/** The captured text-only model call with `text` streamed in two deltas instead of the captured text. */
function textStep(text: string): LanguageModelV4StreamPart[] {
  return structuredClone(QUESTION.extracted.steps[0]!).flatMap((part): LanguageModelV4StreamPart[] => {
    if (part.type === "text-delta") return [];
    if (part.type !== "text-start") return [part];
    return [
      part,
      { type: "text-delta", id: part.id, delta: text.slice(0, 10) },
      { type: "text-delta", id: part.id, delta: text.slice(10) },
    ];
  });
}

function mockModel(...steps: LanguageModelV4StreamPart[][]) {
  return new MockLanguageModelV4({
    provider: "openrouter",
    modelId: MODEL_ID,
    doStream: steps.map((chunks) => ({ stream: simulateReadableStream({ chunks, chunkDelayInMs: null }) })),
  });
}

async function readAll<T>(stream: ReadableStream<T>): Promise<T[]> {
  const chunks: T[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

type FinishEvent = { messages: HscUIMessage[]; isAborted: boolean };

/** Runs one chat turn to completion and returns the UI chunks and the onFinish event. */
async function runTurn(caseRecord: Case, message: HscUIMessage, signal = new AbortController().signal) {
  let finished: FinishEvent | undefined;
  const stream = await createChatStream({
    caseRecord,
    message,
    signal,
    onFinish: (event) => {
      finished = event;
    },
  });
  const chunks = await readAll(stream);
  return { chunks, finished };
}

describe("createChatStream", () => {
  let caseRecord: Case;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetModels();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    caseRecord = caseStore.create({ form, imageReport, initialDecision, messages: [firstMessage] });
  });

  afterEach(() => {
    caseStore.delete(caseRecord.id);
    resetModels();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("streams a tool-updateDecision part in output-available with the card payload, then the text (AC-30)", async () => {
    setModelsForTest({ decision: mockModel(toolCallStep(accepted), textStep("Zaktualizowałem decyzję na Przyjęte.")) });
    const { chunks, finished } = await runTurn(caseRecord, userMessage("Telefon jest nowy, bez rys."));

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "tool-output-available",
        toolCallId: "call-1",
        output: {
          status: "ACCEPTED",
          label: DECISION_STATUSES.ACCEPTED,
          reason: accepted.reason,
          appliedRules: accepted.appliedRules,
          disclaimer: pl.firstMessage.disclaimer,
        },
      }),
    );

    const reply = finished!.messages.at(-1)!;
    expect(reply.role).toBe("assistant");
    const toolPart = reply.parts.find((part) => part.type === "tool-updateDecision");
    expect(toolPart).toMatchObject({ state: "output-available", input: accepted, output: { status: "ACCEPTED" } });
    const textPart = reply.parts.find((part) => part.type === "text");
    expect(textPart).toMatchObject({ text: "Zaktualizowałem decyzję na Przyjęte." });
    expect(reply.parts.indexOf(toolPart!)).toBeLessThan(reply.parts.indexOf(textPart!));
  });

  it("replays the captured tool-call turn: tool-updateDecision in output-available, then the captured text", async () => {
    setModelsForTest({ decision: mockModel(...structuredClone(TOOL_TURN.extracted.steps)) });
    const { finished } = await runTurn(caseRecord, userMessage("Laptop sam się wyłącza po 10 minutach."));

    const captured = TOOL_TURN.extracted.toolCalls[0]!;
    const reply = finished!.messages.at(-1)!;
    const toolPart = reply.parts.find((part) => part.type === "tool-updateDecision");
    expect(toolPart).toMatchObject({
      toolCallId: captured.toolCallId,
      state: "output-available",
      input: accepted,
      output: { status: TOOL_TURN.extracted.statusAfter, label: DECISION_STATUSES.ACCEPTED, reason: accepted.reason },
    });
    const text = reply.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
    expect(text).toBe(TOOL_TURN.extracted.text);
    expect(caseStore.get(caseRecord.id)!.currentStatus).toBe(TOOL_TURN.extracted.statusAfter);
  });

  it("replays the captured text-only turn: no tool part and the status stays unchanged", async () => {
    setModelsForTest({ decision: mockModel(...structuredClone(QUESTION.extracted.steps)) });
    const { finished } = await runTurn(caseRecord, userMessage("Ile trwa rozpatrzenie reklamacji?"));

    const reply = finished!.messages.at(-1)!;
    expect(reply.parts.some((part) => part.type === "tool-updateDecision")).toBe(false);
    expect(reply.parts).toContainEqual(expect.objectContaining({ type: "text", text: QUESTION.extracted.text }));
    expect(caseStore.get(caseRecord.id)!.currentStatus).toBe("NEEDS_INFO");
  });

  it("passes the full message list to onFinish: the history, the new user message and the reply (AC-27)", async () => {
    setModelsForTest({ decision: mockModel(textStep("Status się nie zmienia.")) });
    const message = userMessage("Jakie są następne kroki?");
    const { finished } = await runTurn(caseRecord, message);

    expect(finished!.isAborted).toBe(false);
    expect(finished!.messages).toHaveLength(3);
    expect(finished!.messages[0]).toEqual(firstMessage);
    expect(finished!.messages[1]).toEqual(message);
    expect(finished!.messages[2]).toMatchObject({ role: "assistant", id: expect.any(String) });
    expect(finished!.messages[2]!.parts).toContainEqual(expect.objectContaining({ type: "text", text: "Status się nie zmienia." }));
  });

  it("records the tool side effects: two NEEDS_INFO turns → needsInfoRounds 2, an ACCEPTED turn resets it to 0", async () => {
    setModelsForTest({ decision: mockModel(toolCallStep(needsInfo), textStep("Potrzebuję jeszcze jednej informacji.")) });
    await runTurn(caseRecord, userMessage("Nie wiem."));
    setModelsForTest({ decision: mockModel(toolCallStep(needsInfo), textStep("Nadal brakuje informacji.")) });
    await runTurn(caseRecord, userMessage("Nie pamiętam.", "u-2"));

    expect(caseStore.get(caseRecord.id)!.needsInfoRounds).toBe(2);
    expect(caseStore.get(caseRecord.id)!.statusHistory).toHaveLength(2);

    setModelsForTest({ decision: mockModel(toolCallStep(accepted), textStep("Zwrot przyjęty wstępnie.")) });
    await runTurn(caseRecord, userMessage("Telefon jest nowy i kompletny.", "u-3"));

    const stored = caseStore.get(caseRecord.id)!;
    expect(stored.needsInfoRounds).toBe(0);
    expect(stored.currentStatus).toBe("ACCEPTED");
    expect(stored.statusHistory.map((entry) => entry.status)).toEqual(["NEEDS_INFO", "NEEDS_INFO", "ACCEPTED"]);
  });

  it("calls the decision model with the chat prompt, the converted history, the tool and reasoning effort medium", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-19T08:00:00Z"), toFake: ["Date"] });
    const model = mockModel(textStep("Odpowiedź."));
    setModelsForTest({ decision: model });
    await runTurn(caseRecord, userMessage("Ile trwa zwrot pieniędzy?"));

    expect(model.doStreamCalls).toHaveLength(1);
    const call = model.doStreamCalls[0]!;
    const instructions = await buildChatPrompt({ caseRecord, now: new Date("2026-10-19T08:00:00Z") });
    expect(call.prompt[0]).toEqual({ role: "system", content: instructions });
    expect(call.prompt.slice(1)).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Status: Potrzebne dodatkowe informacje." }] },
      { role: "user", content: [{ type: "text", text: "Ile trwa zwrot pieniędzy?" }] },
    ]);
    expect(call.providerOptions).toEqual({ openrouter: { reasoning: { effort: "medium" } } });
    expect(call.tools).toEqual([expect.objectContaining({ type: "function", name: "updateDecision" })]);
  });

  it("stops after 3 steps even when the model keeps calling the tool", async () => {
    const model = new MockLanguageModelV4({
      provider: "openrouter",
      modelId: MODEL_ID,
      doStream: async () => ({
        stream: simulateReadableStream({ chunks: toolCallStep(needsInfo, `call-${Math.random()}`), chunkDelayInMs: null }),
      }),
    });
    setModelsForTest({ decision: model });
    await runTurn(caseRecord, userMessage("?"));
    expect(model.doStreamCalls).toHaveLength(3);
  });

  it("passes the abort signal to the model call", async () => {
    const controller = new AbortController();
    const model = mockModel(textStep("Odpowiedź."));
    setModelsForTest({ decision: model });
    await runTurn(caseRecord, userMessage("Pytanie"), controller.signal);
    const signal = model.doStreamCalls[0]!.abortSignal!;
    expect(signal.aborted).toBe(false);
    controller.abort(new Error("request timeout"));
    expect(signal.aborted).toBe(true);
  });

  it("logs caseId, step, prompt version, model ID and latency once per turn", async () => {
    setModelsForTest({ decision: mockModel(toolCallStep(accepted), textStep("Gotowe.")) });
    await runTurn(caseRecord, userMessage("Telefon jest nowy."));
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]![0]).toEqual({
      caseId: caseRecord.id,
      step: "chat",
      promptVersion: CHAT_PROMPT_VERSION,
      modelId: MODEL_ID,
      latencyMs: expect.any(Number),
    });
  });
});
