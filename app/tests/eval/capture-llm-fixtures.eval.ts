/**
 * Captures real OpenRouter request/response pairs for the submission pipeline (ADR-003 §3:
 * analyzeImage, decide) into `tests/fixtures/llm/<name>.json`. Unit and integration mocks are
 * derived from these captures (repo AGENTS.md, TDD Rules).
 *
 * The chat block captures streamed chat turns (ADR-003 §3 createChatStream, §7): the raw SSE text
 * of every model call plus the provider stream-part sequence per call (`extracted.steps`), from which
 * the `MockLanguageModelV4` `doStream` mocks are derived.
 *
 * Makes real, paid calls. Runs only on demand:
 *   CAPTURE_FIXTURES=1 npx vitest run --config vitest.eval.config.ts tests/eval/capture-llm-fixtures.eval.ts
 * Only the chat turns (3 model calls): add `-t "chat"`.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { generateText, Output, wrapLanguageModel } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { daysBetween, todayInWarsaw, type CaseType } from "@/lib/domain";
import {
  complaintImageReportSchema,
  decisionSchema,
  type Decision,
  type HscUIMessage,
  returnImageReportSchema,
  type CaseForm,
  type ComplaintImageReport,
  type ImageReport,
  type ReturnImageReport,
} from "@/lib/schemas";
import { composeFirstMessage } from "@/server/ai/compose-first-message";
import { createChatStream } from "@/server/ai/create-chat-stream";
import { buildFacts } from "@/server/ai/facts";
import { decisionModel, resetModels, setModelsForTest, visionModel } from "@/server/ai/models";
import { PROMPT_VERSION as CHAT_VERSION } from "@/server/ai/prompts/chat";
import { PROMPT_VERSION as COMPLAINT_DECISION_VERSION } from "@/server/ai/prompts/complaint-decision";
import { PROMPT_VERSION as COMPLAINT_IMAGE_VERSION } from "@/server/ai/prompts/complaint-image";
import { PROMPT_VERSION as RETURN_DECISION_VERSION } from "@/server/ai/prompts/return-decision";
import { PROMPT_VERSION as RETURN_IMAGE_VERSION } from "@/server/ai/prompts/return-image";
import { buildDecisionPrompt, buildImagePrompt } from "@/server/ai/prompts/shared";
import { getEnv, resolveModelIds } from "@/server/env";
import { compressImage } from "@/server/image";
import { caseStore, type Case } from "@/server/store/case-store";

const FIXTURES_DIR = path.resolve(process.cwd(), "tests/fixtures/llm");
/** Real example photos (see that folder's README); never generated images. */
const IMAGES_DIR = path.resolve(process.cwd(), "../assets/example-images");
const DAY_MS = 86_400_000;

/** Same settings as `src/server/ai/models.ts` (not exported there). */
const MODEL_SETTINGS = { structuredOutputs: { strict: true }, usage: { include: true } } as const;

/** Response headers that must never be stored in a fixture. */
const SECRET_HEADER = /set-cookie|cookie|auth|token|key|secret/i;

interface RecordedExchange {
  request: { url: string; method: string; body: unknown };
  response: { status: number; headers: Record<string, string>; body: string };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Replaces every base64 image data URL with `<image:sha256:HEX>` so fixtures stay small. */
function redactImages(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:image/") ? `<image:sha256:${sha256(value)}>` : value;
  }
  if (Array.isArray(value)) return value.map(redactImages);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactImages(v)]));
  }
  return value;
}

/** A `fetch` that forwards to the real one and keeps a sanitized copy of each exchange. */
function createRecordingFetch(log: RecordedExchange[]): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const rawBody = typeof init?.body === "string" ? init.body : null;
    const response = await fetch(input, init);
    const text = await response.clone().text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      if (!SECRET_HEADER.test(name)) headers[name] = value;
    });
    log.push({
      request: { url, method, body: rawBody === null ? null : redactImages(JSON.parse(rawBody)) },
      response: { status: response.status, headers, body: text },
    });
    return response;
  };
}

/** Writes a fixture after checking it holds no API key or authorization data. */
async function writeFixture(name: string, fixture: unknown): Promise<void> {
  const json = JSON.stringify(fixture, null, 2) + "\n";
  expect(json).not.toContain(getEnv().OPENROUTER_API_KEY);
  expect(json).not.toMatch(/sk-or/);
  expect(json).not.toMatch(/authorization|bearer/i);
  await mkdir(FIXTURES_DIR, { recursive: true });
  await writeFile(path.join(FIXTURES_DIR, `${name}.json`), json, "utf8");
}

function isoDaysAgo(days: number, now: Date): string {
  const today = todayInWarsaw(now);
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

const capture = process.env.CAPTURE_FIXTURES === "1" ? describe : describe.skip;

capture("capture real OpenRouter fixtures", () => {
  const now = new Date();
  const log: RecordedExchange[] = [];
  const summary: Record<string, unknown> = {};

  const forms: Record<CaseType, Pick<CaseForm, "category" | "modelName" | "purchaseDate" | "reason">> = {
    RETURN: {
      category: "SMARTPHONE",
      modelName: "Samsung Galaxy A54",
      purchaseDate: isoDaysAgo(3, now),
      reason: "Urządzenie nie spełnia moich oczekiwań.",
    },
    COMPLAINT: {
      category: "LAPTOP",
      modelName: "Lenovo IdeaPad 5",
      purchaseDate: isoDaysAgo(400, now),
      reason: "Laptop przestał działać poprawnie podczas normalnego używania w domu.",
    },
  };
  const images: Record<CaseType, string> = { RETURN: "phone-1.jpg", COMPLAINT: "laptop-2.webp" };
  const reports: Partial<Record<CaseType, ImageReport>> = {};

  let ids: { vision: string; decision: string };

  beforeAll(() => {
    ids = resolveModelIds(getEnv());
    const provider = createOpenRouter({
      apiKey: getEnv().OPENROUTER_API_KEY,
      appName: "Hardware Service Decision Copilot",
      fetch: createRecordingFetch(log),
    });
    setModelsForTest({
      vision: provider.chat(ids.vision, MODEL_SETTINGS),
      decision: provider.chat(ids.decision, MODEL_SETTINGS),
    });
  });

  afterAll(() => {
    resetModels();
    console.log("[capture] summary\n" + JSON.stringify(summary, null, 2));
  });

  async function save(name: string, model: string, promptVersion: string, startIndex: number, text: string) {
    expect(log.length, "exactly one HTTP exchange per call").toBe(startIndex + 1);
    const exchange = log[startIndex]!;
    const fixture = {
      capturedAt: new Date().toISOString(),
      model,
      promptVersion,
      request: exchange.request,
      response: exchange.response,
      extracted: { text },
    };
    await writeFixture(name, fixture);
    return exchange.response.status;
  }

  async function captureImage<S extends z.ZodType<ImageReport>>(caseType: CaseType, schema: S, version: string) {
    const name = caseType === "RETURN" ? "return-image-analysis" : "complaint-image-analysis";
    const form = forms[caseType];
    const jpeg = await compressImage(await readFile(path.join(IMAGES_DIR, images[caseType])));
    const prompt = buildImagePrompt(caseType, { category: form.category, modelName: form.modelName });
    const startIndex = log.length;
    const started = performance.now();
    const result = await generateText({
      model: visionModel(),
      instructions: prompt.instructions,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt.userText },
            { type: "file", mediaType: "image/jpeg", data: jpeg.bytes },
          ],
        },
      ],
      output: Output.object({ schema }),
      temperature: 0,
      providerOptions: { openrouter: { reasoning: { effort: "low" } } },
    });
    const latencyMs = Math.round(performance.now() - started);
    const status = await save(name, ids.vision, version, startIndex, result.text);
    const parsed = schema.safeParse(JSON.parse(result.text));
    summary[name] = { model: ids.vision, latencyMs, status, schemaValid: parsed.success, output: result.output };
    expect(parsed.success).toBe(true);
    reports[caseType] = result.output;
  }

  async function captureDecision(caseType: CaseType, version: string) {
    const name = caseType === "RETURN" ? "return-decision" : "complaint-decision";
    const form = forms[caseType];
    const report = reports[caseType];
    expect(report, `image report for ${caseType} captured first`).toBeDefined();
    const facts = buildFacts({ purchaseDate: form.purchaseDate, now, caseType });
    expect(facts.daysSincePurchase).toBe(daysBetween(form.purchaseDate, facts.today));
    const prompt = await buildDecisionPrompt(caseType, { form, report: report!, facts });
    const startIndex = log.length;
    const started = performance.now();
    const result = await generateText({
      model: decisionModel(),
      instructions: prompt.instructions,
      messages: [{ role: "user", content: [{ type: "text", text: prompt.userText }] }],
      output: Output.object({ schema: decisionSchema }),
      temperature: 0,
      providerOptions: { openrouter: { reasoning: { effort: "medium" } } },
    });
    const latencyMs = Math.round(performance.now() - started);
    const status = await save(name, ids.decision, version, startIndex, result.text);
    const parsed = decisionSchema.safeParse(JSON.parse(result.text));
    summary[name] = {
      model: ids.decision,
      latencyMs,
      status,
      schemaValid: parsed.success,
      daysSincePurchase: facts.daysSincePurchase,
      output: result.output,
    };
    expect(parsed.success).toBe(true);
  }

  it("return image analysis (phone-1.jpg)", async () => {
    await captureImage<typeof returnImageReportSchema>("RETURN", returnImageReportSchema, RETURN_IMAGE_VERSION);
    expect((reports.RETURN as ReturnImageReport).caseType).toBe("RETURN");
  });

  it("complaint image analysis (laptop-2.webp)", async () => {
    await captureImage<typeof complaintImageReportSchema>(
      "COMPLAINT",
      complaintImageReportSchema,
      COMPLAINT_IMAGE_VERSION,
    );
    expect((reports.COMPLAINT as ComplaintImageReport).caseType).toBe("COMPLAINT");
  });

  it("return decision", async () => {
    await captureDecision("RETURN", RETURN_DECISION_VERSION);
  });

  it("complaint decision", async () => {
    await captureDecision("COMPLAINT", COMPLAINT_DECISION_VERSION);
  });
});

capture("capture real OpenRouter chat fixtures", () => {
  const now = new Date();
  const log: RecordedExchange[] = [];
  /** Provider stream parts, one array per model call (`doStream`), in arrival order. */
  const steps: LanguageModelV4StreamPart[][] = [];
  const summary: Record<string, unknown> = {};
  let modelId: string;

  /** The T3.2 complaint captures: the same form, the captured image report and the captured decision. */
  const form: CaseForm = {
    caseType: "COMPLAINT",
    category: "LAPTOP",
    modelName: "Lenovo IdeaPad 5",
    purchaseDate: isoDaysAgo(400, now),
    reason: "Laptop przestał działać poprawnie podczas normalnego używania w domu.",
  };
  let imageReport: ImageReport;
  let capturedDecision: Decision;

  beforeAll(async () => {
    const load = async (name: string) =>
      JSON.parse(await readFile(path.join(FIXTURES_DIR, `${name}.json`), "utf8")) as { extracted: { text: string } };
    imageReport = complaintImageReportSchema.parse(JSON.parse((await load("complaint-image-analysis")).extracted.text));
    capturedDecision = decisionSchema.parse(JSON.parse((await load("complaint-decision")).extracted.text));

    modelId = resolveModelIds(getEnv()).decision;
    const provider = createOpenRouter({
      apiKey: getEnv().OPENROUTER_API_KEY,
      appName: "Hardware Service Decision Copilot",
      fetch: createRecordingFetch(log),
    });
    // Records every provider stream part while passing it on unchanged.
    const recorded = wrapLanguageModel({
      model: provider.chat(modelId, MODEL_SETTINGS),
      middleware: {
        wrapStream: async ({ doStream }) => {
          const result = await doStream();
          const parts: LanguageModelV4StreamPart[] = [];
          steps.push(parts);
          const stream = result.stream.pipeThrough(
            new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
              transform(part, controller) {
                parts.push(structuredClone(part));
                controller.enqueue(part);
              },
            }),
          );
          return { ...result, stream };
        },
      },
    });
    setModelsForTest({ decision: recorded });
  });

  afterAll(() => {
    resetModels();
    console.log("[capture] chat summary\n" + JSON.stringify(summary, null, 2));
  });

  /** Seeds the case as `POST /api/cases` stores it: first message, status history, NEEDS_INFO rounds. */
  function seedCase(decision: Decision): Case {
    const createdAt = now.getTime();
    return caseStore.create((id) => ({
      form,
      imageReport,
      initialDecision: decision,
      currentStatus: decision.status,
      statusHistory: [
        { status: decision.status, reason: decision.summary, appliedRules: decision.appliedRules, at: now },
      ],
      needsInfoRounds: decision.status === "NEEDS_INFO" ? 1 : 0,
      userMessageCount: 0,
      messages: [
        {
          id: "m-first",
          role: "assistant",
          metadata: { createdAt },
          parts: [
            { type: "data-case", data: { caseId: id, ...form, status: decision.status } },
            { type: "text", text: composeFirstMessage(id, decision), state: "done" },
          ],
        },
      ],
    }));
  }

  async function captureTurn(name: string, decision: Decision, text: string) {
    const caseRecord = seedCase(decision);
    const statusBefore = caseRecord.currentStatus;
    const message: HscUIMessage = { id: "u-1", role: "user", parts: [{ type: "text", text }] };
    const logStart = log.length;
    const stepStart = steps.length;
    let messages: HscUIMessage[] = [];

    const started = performance.now();
    const stream = await createChatStream({
      caseRecord,
      message,
      signal: AbortSignal.timeout(120_000),
      onFinish: (event) => {
        messages = event.messages;
      },
    });
    const uiChunks: unknown[] = [];
    const reader = stream.getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) uiChunks.push(r.value);
    const latencyMs = Math.round(performance.now() - started);

    const exchanges = log.slice(logStart);
    const turnSteps = steps.slice(stepStart);
    expect(exchanges.length, "one HTTP exchange per model call").toBe(turnSteps.length);
    const reply = messages.at(-1);
    expect(reply?.role).toBe("assistant");
    const replyText = (reply?.parts ?? [])
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
    const toolCalls = turnSteps.flat().flatMap((part) => (part.type === "tool-call" ? [part] : []));
    const stored = caseStore.get(caseRecord.id)!;

    await writeFixture(name, {
      capturedAt: new Date().toISOString(),
      model: modelId,
      promptVersion: CHAT_VERSION,
      seed: {
        caseType: form.caseType,
        currentStatus: statusBefore,
        needsInfoRounds: decision.status === "NEEDS_INFO" ? 1 : 0,
        initialDecision: decision,
        userMessage: text,
      },
      exchanges,
      extracted: {
        /** Provider stream parts per model call; `MockLanguageModelV4` `doStream` replays them. */
        steps: turnSteps,
        text: replyText,
        toolCalls,
        statusAfter: stored.currentStatus,
        reply,
      },
    });
    summary[name] = {
      model: modelId,
      latencyMs,
      modelCalls: turnSteps.length,
      statuses: exchanges.map((e) => e.response.status),
      statusBefore,
      statusAfter: stored.currentStatus,
      toolCalls: toolCalls.map((call) => ({ toolName: call.toolName, input: JSON.parse(call.input) })),
      text: replyText,
    };
    caseStore.delete(caseRecord.id);
    return { replyText, toolCalls };
  }

  it("chat turn without a status change (question about the complaint duration)", async () => {
    const { replyText, toolCalls } = await captureTurn(
      "chat-question",
      capturedDecision,
      "Ile trwa rozpatrzenie reklamacji?",
    );
    expect(replyText.length).toBeGreaterThan(0);
    expect(toolCalls).toEqual([]);
  });

  it("chat turn answering a NEEDS_INFO question", async () => {
    const needsInfo: Decision = {
      status: "NEEDS_INFO",
      summary:
        "Aby ocenić reklamację, potrzebujemy dokładniejszego opisu usterki. Na zdjęciu nie widać uszkodzeń zewnętrznych.",
      photoFindings: capturedDecision.photoFindings,
      appliedRules: capturedDecision.appliedRules,
      nextSteps: ["Odpowiedz na pytania poniżej."],
      questions: [
        "Na czym dokładnie polega usterka i kiedy się pojawiła?",
        "Czy laptop upadł, został uderzony lub miał kontakt z cieczą?",
      ],
    };
    await captureTurn(
      "chat-needs-info-answer",
      needsInfo,
      "Od tygodnia laptop sam się wyłącza po około 10 minutach pracy, nawet przy przeglądaniu internetu. Nigdy nie upadł, nie był uderzony ani zalany, cały czas stoi na biurku w domu.",
    );
  });
});
