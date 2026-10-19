import { readFileSync } from "node:fs";
import path from "node:path";
import type { UIMessageStreamWriter } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decisionSchema, imageReportSchema, type HscUIMessage } from "@/lib/schemas";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies" }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import { composeFirstMessage } from "@/server/ai/compose-first-message";
import { resetModels, setModelsForTest } from "@/server/ai/models";
import { runSubmission } from "@/server/ai/run-submission";

/** Real captures from `tests/eval/capture-llm-fixtures.eval.ts`; `extracted.text` is the raw model text. */
interface LlmFixture {
  model: string;
  extracted: { text: string };
  response: { body: string };
}

function loadFixture(name: string): LlmFixture {
  const file = path.resolve(process.cwd(), "tests/fixtures/llm", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as LlmFixture;
}

/** A mock model answering with the captured text, finish reason and token usage. */
function mockModel(fixture: LlmFixture) {
  const body = JSON.parse(fixture.response.body) as {
    choices: { finish_reason: string }[];
    usage: { prompt_tokens: number; completion_tokens: number; completion_tokens_details: { reasoning_tokens: number } };
  };
  const { usage } = body;
  return new MockLanguageModelV4({
    provider: "openrouter",
    modelId: fixture.model,
    doGenerate: {
      content: [{ type: "text", text: fixture.extracted.text }],
      finishReason: { unified: "stop", raw: body.choices[0]?.finish_reason },
      usage: {
        inputTokens: { total: usage.prompt_tokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: {
          total: usage.completion_tokens,
          text: undefined,
          reasoning: usage.completion_tokens_details.reasoning_tokens,
        },
      },
      warnings: [],
    },
  });
}

/** Records every chunk written, standing in for the `createUIMessageStream` writer. */
function spyWriter() {
  const write = vi.fn<UIMessageStreamWriter<HscUIMessage>["write"]>();
  const writer: UIMessageStreamWriter<HscUIMessage> = { write, merge: vi.fn(), onError: undefined };
  return { writer, write };
}

const IMAGE_ANALYSIS = loadFixture("return-image-analysis");
const DECISION = loadFixture("return-decision");
const CASE_ID = "HSC-20261019-AB12";

const form = {
  caseType: "RETURN" as const,
  category: "SMARTPHONE" as const,
  modelName: "Samsung Galaxy A54",
  purchaseDate: "2026-10-16",
  reason: "Urządzenie nie spełnia moich oczekiwań.",
};

function input(writer: UIMessageStreamWriter<HscUIMessage>) {
  return {
    caseId: CASE_ID,
    form,
    jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    now: new Date("2026-10-19T07:13:00Z"),
    signal: new AbortController().signal,
    writer,
  };
}

describe("runSubmission", () => {
  beforeEach(() => {
    resetModels();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetModels();
    vi.restoreAllMocks();
  });

  it("writes transient analyzing then deciding stage parts", async () => {
    setModelsForTest({ vision: mockModel(IMAGE_ANALYSIS), decision: mockModel(DECISION) });
    const { writer, write } = spyWriter();
    await runSubmission(input(writer));
    expect(write.mock.calls.map(([part]) => part)).toEqual([
      { type: "data-stage", data: { stage: "analyzing" }, transient: true },
      { type: "data-stage", data: { stage: "deciding" }, transient: true },
    ]);
  });

  it("writes analyzing before the vision call and deciding before the decision call", async () => {
    const vision = mockModel(IMAGE_ANALYSIS);
    const decision = mockModel(DECISION);
    setModelsForTest({ vision, decision });
    const { writer, write } = spyWriter();
    const callsAtWrite: [number, number][] = [];
    write.mockImplementation(() => {
      callsAtWrite.push([vision.doGenerateCalls.length, decision.doGenerateCalls.length]);
    });
    await runSubmission(input(writer));
    expect(callsAtWrite).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it("returns the report, the decision and the composed first message", async () => {
    setModelsForTest({ vision: mockModel(IMAGE_ANALYSIS), decision: mockModel(DECISION) });
    const { writer } = spyWriter();
    const result = await runSubmission(input(writer));
    const expectedDecision = decisionSchema.parse(JSON.parse(DECISION.extracted.text));
    expect(result).toEqual({
      report: imageReportSchema.parse(JSON.parse(IMAGE_ANALYSIS.extracted.text)),
      decision: expectedDecision,
      firstMessageText: composeFirstMessage(CASE_ID, expectedDecision),
    });
  });

  it("propagates a vision error unchanged and never writes deciding", async () => {
    const failure = new Error("vision provider down");
    const vision = new MockLanguageModelV4({
      doGenerate: () => {
        throw failure;
      },
    });
    const decision = mockModel(DECISION);
    setModelsForTest({ vision, decision });
    const { writer, write } = spyWriter();
    await expect(runSubmission(input(writer))).rejects.toBe(failure);
    expect(write.mock.calls.map(([part]) => part)).toEqual([
      { type: "data-stage", data: { stage: "analyzing" }, transient: true },
    ]);
    expect(decision.doGenerateCalls).toHaveLength(0);
  });
});
