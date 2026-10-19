import { readFileSync } from "node:fs";
import path from "node:path";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decisionSchema,
  imageReportSchema,
  type CaseForm,
  type Decision,
  type HscUIMessage,
} from "@/lib/schemas";
import { readUIStream } from "../../helpers/read-ui-stream";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies", CASE_TTL_MINUTES: 120 }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import { resetModels, setModelsForTest } from "@/server/ai/models";
import { caseStore, type Case } from "@/server/store/case-store";
import { POST } from "@/app/api/cases/[caseId]/chat/route";

/**
 * Real streamed chat turns from `tests/eval/capture-llm-fixtures.eval.ts`: `extracted.steps` holds the
 * provider stream parts of each model call, replayed here by `MockLanguageModelV4` `doStream`.
 */
interface ChatFixture {
  model: string;
  seed: { initialDecision: unknown; userMessage: string };
  extracted: {
    steps: LanguageModelV4StreamPart[][];
    text: string;
    toolCalls: { toolCallId: string; toolName: string; input: string }[];
    statusAfter: string;
  };
}

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), "tests/fixtures/llm", `${name}.json`), "utf8")) as T;
}

/** A NEEDS_INFO answer: call 1 streams reasoning and the updateDecision tool call (ACCEPTED), call 2 the text. */
const TOOL_TURN = loadJson<ChatFixture>("chat-needs-info-answer");
/** A question answered in text only (one model call). */
const QUESTION = loadJson<ChatFixture>("chat-question");
const MODEL_ID = TOOL_TURN.model;

const form: CaseForm = {
  caseType: "COMPLAINT",
  category: "LAPTOP",
  modelName: "Lenovo IdeaPad 5",
  purchaseDate: "2025-09-14",
  reason: "Laptop przestał działać poprawnie podczas normalnego używania w domu.",
};
const imageReport = imageReportSchema.parse(
  JSON.parse(loadJson<{ extracted: { text: string } }>("complaint-image-analysis").extracted.text),
);
const initialDecision: Decision = decisionSchema.parse(TOOL_TURN.seed.initialDecision);

const FORBIDDEN = ["stack", "OPENROUTER", "sk-or", MODEL_ID];

function mockModel(...steps: LanguageModelV4StreamPart[][]) {
  return new MockLanguageModelV4({
    provider: "openrouter",
    modelId: MODEL_ID,
    doStream: steps.map((chunks) => ({ stream: simulateReadableStream({ chunks, chunkDelayInMs: null }) })),
  });
}

/** The captured text-only model call. */
const textTurn = () => mockModel(...structuredClone(QUESTION.extracted.steps));
/** The captured tool-call turn (updateDecision → ACCEPTED, then the text). */
const toolTurn = () => mockModel(...structuredClone(TOOL_TURN.extracted.steps));

/** Replays the captured tool call (status changes), then the second model call fails mid-stream. */
function failingAfterToolCall(error = new Error("upstream 502 sk-or-v1-secret at OpenRouter")) {
  const [toolStep, textStep] = structuredClone(TOOL_TURN.extracted.steps);
  const partial = textStep!.filter((part) => part.type !== "finish").slice(0, 3);
  return mockModel(toolStep!, [...partial, { type: "error", error }]);
}

/** A model whose stream stays open until `release` is called. */
function blockingModel() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chunks = structuredClone(QUESTION.extracted.steps[0]!);
  const model = new MockLanguageModelV4({
    provider: "openrouter",
    modelId: MODEL_ID,
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        async start(controller) {
          await gate;
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
    }),
  });
  return { model, release };
}

const userMessage = (text: string, id = "u-1"): HscUIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });

function chatRequest(caseId: string, body: unknown) {
  const request = new Request(`http://localhost/api/cases/${caseId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ caseId }) });
}

const send = (caseId: string, message: HscUIMessage) => chatRequest(caseId, { message });

function seedCase(overrides: Partial<Case> = {}): Case {
  return caseStore.create((id) => ({
    form,
    imageReport,
    initialDecision,
    currentStatus: initialDecision.status,
    statusHistory: [
      { status: initialDecision.status, reason: initialDecision.summary, appliedRules: initialDecision.appliedRules, at: new Date() },
    ],
    needsInfoRounds: 1,
    userMessageCount: 0,
    messages: [
      {
        id: "m-first",
        role: "assistant",
        parts: [
          { type: "data-case", data: { caseId: id, ...form, status: initialDecision.status } },
          { type: "text", text: "Status: Potrzebne dodatkowe informacje.", state: "done" },
        ],
      },
    ],
    ...overrides,
  }));
}

/** History with `count` user/assistant exchanges after the first message (user IDs `u-1` … `u-count`). */
function historyWith(count: number): HscUIMessage[] {
  const history: HscUIMessage[] = [];
  for (let i = 1; i <= count; i++) {
    history.push(userMessage(`Pytanie ${i}`, `u-${i}`));
    history.push({ id: `a-${i}`, role: "assistant", parts: [{ type: "text", text: `Odpowiedź ${i}`, state: "done" }] });
  }
  return history;
}

const userIds = (c: Case) => c.messages.filter((m) => m.role === "user").map((m) => m.id);

async function expectJsonError(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  const text = await response.text();
  expect(JSON.parse(text)).toEqual(body);
  for (const word of FORBIDDEN) expect(text).not.toContain(word);
}

describe("POST /api/cases/[caseId]/chat", () => {
  let created: Case[];

  beforeEach(() => {
    resetModels();
    created = [];
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const c of created) caseStore.delete(c.id);
    resetModels();
    vi.restoreAllMocks();
  });

  const seed = (overrides: Partial<Case> = {}) => {
    const c = seedCase(overrides);
    created.push(c);
    return c;
  };

  describe("pre-stream checks", () => {
    it("unknown case ID → 404 CASE_NOT_FOUND and no model call", async () => {
      const model = textTurn();
      setModelsForTest({ decision: model });
      const response = await send("HSC-20261019-ZZZZ", userMessage("Halo?"));
      await expectJsonError(response, 404, { error: "CASE_NOT_FOUND" });
      expect(model.doStreamCalls).toHaveLength(0);
    });

    it.each([
      ["invalid JSON", "{not json"],
      ["missing message", {}],
      ["assistant role", { message: { id: "x", role: "assistant", parts: [{ type: "text", text: "Hej" }] } }],
      ["blank text", { message: userMessage("   ") }],
      ["text over 2000 chars", { message: userMessage("a".repeat(2001)) }],
    ])("%s → 400 VALIDATION", async (_name, body) => {
      const c = seed();
      const response = await chatRequest(c.id, body);
      await expectJsonError(response, 400, { error: "VALIDATION" });
      expect(caseStore.get(c.id)!.turnInProgress).toBe(false);
    });

    it("20 stored user messages + a new one → 409 MESSAGE_LIMIT, nothing changes", async () => {
      const c = seed({ messages: historyWith(20), userMessageCount: 20 });
      const model = textTurn();
      setModelsForTest({ decision: model });
      const response = await send(c.id, userMessage("Jeszcze jedno pytanie", "u-21"));
      await expectJsonError(response, 409, { error: "MESSAGE_LIMIT" });
      expect(model.doStreamCalls).toHaveLength(0);
      expect(caseStore.get(c.id)!.userMessageCount).toBe(20);
      expect(caseStore.get(c.id)!.turnInProgress).toBe(false);
    });

    it("a retry of the 20th message is still allowed and not counted again", async () => {
      const c = seed({ messages: historyWith(20), userMessageCount: 20 });
      setModelsForTest({ decision: textTurn() });
      const response = await send(c.id, userMessage("Pytanie 20", "u-20"));
      expect(response.status).toBe(200);
      const chunks = await readUIStream(response);
      expect(chunks.at(-1)).toMatchObject({ type: "finish" });

      const stored = caseStore.get(c.id)!;
      expect(stored.userMessageCount).toBe(20);
      expect(userIds(stored)).toHaveLength(20);
      expect(userIds(stored).filter((id) => id === "u-20")).toHaveLength(1);
      // The retried exchange is replaced: the 20th user message is followed by the new reply only.
      expect(stored.messages.at(-2)!.id).toBe("u-20");
      expect(stored.messages.at(-1)!.parts).toContainEqual(
        expect.objectContaining({ type: "text", text: QUESTION.extracted.text }),
      );
      expect(stored.messages).toHaveLength(40);
    });

    it("a second POST while the first turn is streaming → 409 TURN_IN_PROGRESS", async () => {
      const c = seed();
      const { model, release } = blockingModel();
      setModelsForTest({ decision: model });

      const first = await send(c.id, userMessage("Pierwsze pytanie"));
      expect(first.status).toBe(200);
      expect(caseStore.get(c.id)!.turnInProgress).toBe(true);

      const second = await send(c.id, userMessage("Drugie pytanie", "u-2"));
      await expectJsonError(second, 409, { error: "TURN_IN_PROGRESS" });

      release();
      await readUIStream(first);
      const stored = caseStore.get(c.id)!;
      expect(stored.turnInProgress).toBe(false);
      expect(userIds(stored)).toEqual(["u-1"]);
      expect(stored.userMessageCount).toBe(1);
    });
  });

  describe("streamed turn", () => {
    it("replays the captured tool-call turn: persists the updated status, the messages and the count", async () => {
      const c = seed();
      const before = caseStore.get(c.id)!.lastActivityAt;
      setModelsForTest({ decision: toolTurn() });
      const message = userMessage(TOOL_TURN.seed.userMessage);

      const response = await send(c.id, message);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const chunks = await readUIStream(response);
      const captured = TOOL_TURN.extracted.toolCalls[0]!;
      expect(chunks).toContainEqual(
        expect.objectContaining({ type: "tool-output-available", toolCallId: captured.toolCallId }),
      );
      expect(chunks.at(-1)).toMatchObject({ type: "finish" });

      const stored = caseStore.get(c.id)!;
      expect(stored.currentStatus).toBe(TOOL_TURN.extracted.statusAfter);
      expect(stored.statusHistory.map((entry) => entry.status)).toEqual(["NEEDS_INFO", "ACCEPTED"]);
      expect(stored.userMessageCount).toBe(1);
      expect(stored.turnInProgress).toBe(false);
      expect(stored.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stored.messages).toHaveLength(3);
      expect(stored.messages[1]).toEqual(message);
      const reply = stored.messages[2]!;
      expect(reply.role).toBe("assistant");
      expect(reply.parts.find((part) => part.type === "tool-updateDecision")).toMatchObject({
        toolCallId: captured.toolCallId,
        state: "output-available",
        output: { status: "ACCEPTED" },
      });
      const text = reply.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
      expect(text).toBe(TOOL_TURN.extracted.text);
    });

    it("tells the model the remaining messages after this one (userMessagesRemaining counts the new message)", async () => {
      const c = seed({ messages: historyWith(5), userMessageCount: 5 });
      const model = textTurn();
      setModelsForTest({ decision: model });
      await readUIStream(await send(c.id, userMessage("Szóste pytanie", "u-6")));

      const system = model.doStreamCalls[0]!.prompt[0]!;
      expect(system.role).toBe("system");
      expect(system.content).toContain("userMessagesRemaining: 14");
      expect(caseStore.get(c.id)!.userMessageCount).toBe(6);
    });

    it("a retry does not change the remaining count in the prompt", async () => {
      const c = seed({ messages: historyWith(5), userMessageCount: 5 });
      const model = textTurn();
      setModelsForTest({ decision: model });
      await readUIStream(await send(c.id, userMessage("Pytanie 5", "u-5")));

      expect(model.doStreamCalls[0]!.prompt[0]!.content).toContain("userMessagesRemaining: 15");
      // The model sees the history up to and including the retried message only.
      expect(model.doStreamCalls[0]!.prompt.at(-1)).toEqual({ role: "user", content: [{ type: "text", text: "Pytanie 5" }] });
      expect(caseStore.get(c.id)!.userMessageCount).toBe(5);
    });

    it("a mock error mid-stream → error chunk PROCESSING_FAILED, status snapshot restored, nothing persisted", async () => {
      const c = seed();
      const snapshot = caseStore.snapshotStatus(c.id)!;
      const messagesBefore = structuredClone(caseStore.get(c.id)!.messages);
      setModelsForTest({ decision: failingAfterToolCall() });

      const response = await send(c.id, userMessage("Laptop sam się wyłącza."));
      expect(response.status).toBe(200);
      const body = await response.text();
      for (const word of FORBIDDEN) expect(body).not.toContain(word);
      expect(body).toContain('"type":"error"');
      expect(body).toContain('"errorText":"PROCESSING_FAILED"');

      const stored = caseStore.get(c.id)!;
      expect(caseStore.snapshotStatus(c.id)).toEqual(snapshot);
      expect(stored.messages).toEqual(messagesBefore);
      expect(stored.userMessageCount).toBe(0);
      expect(stored.turnInProgress).toBe(false);
    });

    it("the same message ID twice after a failed first attempt → one stored user message, count 1", async () => {
      const c = seed();
      const message = userMessage(TOOL_TURN.seed.userMessage);

      setModelsForTest({ decision: failingAfterToolCall() });
      await (await send(c.id, message)).text();

      setModelsForTest({ decision: toolTurn() });
      const retry = await send(c.id, message);
      expect(retry.status).toBe(200);
      await readUIStream(retry);

      const stored = caseStore.get(c.id)!;
      expect(userIds(stored)).toEqual([message.id]);
      expect(stored.userMessageCount).toBe(1);
      expect(stored.currentStatus).toBe("ACCEPTED");
      expect(stored.statusHistory).toHaveLength(2);
    });

    it("a model that throws before streaming → error chunk PROCESSING_FAILED, nothing persisted, flag cleared", async () => {
      const c = seed();
      setModelsForTest({
        decision: new MockLanguageModelV4({
          provider: "openrouter",
          modelId: MODEL_ID,
          doStream: async () => {
            throw new Error(`401 OPENROUTER_API_KEY sk-or-v1-abc invalid for ${MODEL_ID}`);
          },
        }),
      });
      const response = await send(c.id, userMessage("Pytanie"));
      const body = await response.text();
      for (const word of FORBIDDEN) expect(body).not.toContain(word);
      expect(body).toContain('"errorText":"PROCESSING_FAILED"');
      const stored = caseStore.get(c.id)!;
      expect(stored.messages).toHaveLength(1);
      expect(stored.userMessageCount).toBe(0);
      expect(stored.turnInProgress).toBe(false);
    });

    it("a client disconnect mid-stream restores the status and clears the flag", async () => {
      const c = seed();
      const snapshot = caseStore.snapshotStatus(c.id)!;
      const { model } = blockingModel();
      setModelsForTest({ decision: model });

      const response = await send(c.id, userMessage("Pytanie"));
      await response.body!.cancel();

      // The cancel reaches the route's stream through the SSE pipe asynchronously.
      await vi.waitFor(() => expect(caseStore.get(c.id)!.turnInProgress).toBe(false));
      const stored = caseStore.get(c.id)!;
      expect(caseStore.snapshotStatus(c.id)).toEqual(snapshot);
      expect(stored.messages).toHaveLength(1);
      expect(stored.userMessageCount).toBe(0);
    });
  });
});
