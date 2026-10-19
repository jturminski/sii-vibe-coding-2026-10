/**
 * Captures real OpenRouter request/response pairs for the submission pipeline (ADR-003 §3:
 * analyzeImage, decide) into `tests/fixtures/llm/<name>.json`. Unit and integration mocks are
 * derived from these captures (repo AGENTS.md, TDD Rules).
 *
 * Makes real, paid calls. Runs only on demand:
 *   CAPTURE_FIXTURES=1 npx vitest run --config vitest.eval.config.ts tests/eval/capture-llm-fixtures.eval.ts
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { daysBetween, todayInWarsaw, type CaseType } from "@/lib/domain";
import {
  complaintImageReportSchema,
  decisionSchema,
  returnImageReportSchema,
  type CaseForm,
  type ComplaintImageReport,
  type ImageReport,
  type ReturnImageReport,
} from "@/lib/schemas";
import { buildFacts } from "@/server/ai/facts";
import { decisionModel, resetModels, setModelsForTest, visionModel } from "@/server/ai/models";
import { PROMPT_VERSION as COMPLAINT_DECISION_VERSION } from "@/server/ai/prompts/complaint-decision";
import { PROMPT_VERSION as COMPLAINT_IMAGE_VERSION } from "@/server/ai/prompts/complaint-image";
import { PROMPT_VERSION as RETURN_DECISION_VERSION } from "@/server/ai/prompts/return-decision";
import { PROMPT_VERSION as RETURN_IMAGE_VERSION } from "@/server/ai/prompts/return-image";
import { buildDecisionPrompt, buildImagePrompt } from "@/server/ai/prompts/shared";
import { getEnv, resolveModelIds } from "@/server/env";
import { compressImage } from "@/server/image";

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
    const json = JSON.stringify(fixture, null, 2) + "\n";
    expect(json).not.toContain(getEnv().OPENROUTER_API_KEY);
    expect(json).not.toMatch(/sk-or/);
    expect(json).not.toMatch(/authorization/i);
    await mkdir(FIXTURES_DIR, { recursive: true });
    await writeFile(path.join(FIXTURES_DIR, `${name}.json`), json, "utf8");
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
