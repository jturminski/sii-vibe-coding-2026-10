import { readFileSync } from "node:fs";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CASE_ID_REGEX } from "@/lib/domain";
import { decisionSchema, imageReportSchema } from "@/lib/schemas";
import { parseUIStream, readUIStream, type HscUIChunk } from "../../helpers/read-ui-stream";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies", CASE_TTL_MINUTES: 120 }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import { composeFirstMessage } from "@/server/ai/compose-first-message";
import { resetModels, setModelsForTest } from "@/server/ai/models";
import { caseStore } from "@/server/store/case-store";
import { POST } from "@/app/api/cases/route";

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

/** A mock model answering with the captured text (optionally replaced), finish reason and token usage. */
function mockModel(fixture: LlmFixture, text = fixture.extracted.text) {
  const body = JSON.parse(fixture.response.body) as {
    choices: { finish_reason: string }[];
    usage: { prompt_tokens: number; completion_tokens: number; completion_tokens_details: { reasoning_tokens: number } };
  };
  const { usage } = body;
  return new MockLanguageModelV4({
    provider: "openrouter",
    modelId: fixture.model,
    doGenerate: {
      content: [{ type: "text", text }],
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

const IMAGE_ANALYSIS = loadFixture("return-image-analysis");
const DECISION = loadFixture("return-decision");
const EXPECTED_REPORT = imageReportSchema.parse(JSON.parse(IMAGE_ANALYSIS.extracted.text));
const EXPECTED_DECISION = decisionSchema.parse(JSON.parse(DECISION.extracted.text));

const IMAGES_DIR = path.resolve(process.cwd(), "../assets/example-images");
const sampleImage = (name: string): Uint8Array<ArrayBuffer> => new Uint8Array(readFileSync(path.join(IMAGES_DIR, name)));

const FORM = {
  caseType: "RETURN",
  category: "SMARTPHONE",
  modelName: "Samsung Galaxy A54",
  purchaseDate: "2026-01-15",
  reason: "Urządzenie nie spełnia moich oczekiwań.",
} as const;

type Fields = Partial<Record<keyof typeof FORM, string>>;

function imageFile(name = "phone-2.jpeg", bytes: Uint8Array<ArrayBuffer> = sampleImage(name), type = "image/jpeg") {
  return new File([bytes], name, { type });
}

/** A real multipart request, as the browser form sends it. */
function postRequest({ fields = FORM as Fields, images = [imageFile()] }: { fields?: Fields; images?: File[] } = {}) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) body.append(name, value);
  }
  for (const image of images) body.append("image", image);
  return new Request("http://localhost/api/cases", { method: "POST", body });
}

let vision: MockLanguageModelV4;
let decision: MockLanguageModelV4;

function useModels(models: { vision?: MockLanguageModelV4; decision?: MockLanguageModelV4 } = {}) {
  vision = models.vision ?? mockModel(IMAGE_ANALYSIS);
  decision = models.decision ?? mockModel(DECISION);
  setModelsForTest({ vision, decision });
}

const createdIds: string[] = [];

function caseIdOf(chunks: HscUIChunk[]): string {
  const part = chunks.find((chunk) => chunk.type === "data-case");
  if (part?.type !== "data-case") throw new Error("no data-case chunk");
  createdIds.push(part.data.caseId);
  return part.data.caseId;
}

describe("POST /api/cases", () => {
  beforeEach(() => {
    resetModels();
    useModels();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const id of createdIds.splice(0)) caseStore.delete(id);
    resetModels();
    vi.restoreAllMocks();
  });

  describe("happy path", () => {
    it("streams start, two transient stages, data-case, the text and finish, in that order", async () => {
      const response = await POST(postRequest());
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const chunks = await readUIStream(response);
      caseIdOf(chunks);
      const types = chunks.map((chunk) => chunk.type);
      const textTypes = types.slice(4, -1);

      expect(types.slice(0, 4)).toEqual(["start", "data-stage", "data-stage", "data-case"]);
      expect(textTypes[0]).toBe("text-start");
      expect(textTypes.at(-1)).toBe("text-end");
      expect(textTypes.slice(1, -1).length).toBeGreaterThan(0);
      expect(new Set(textTypes.slice(1, -1))).toEqual(new Set(["text-delta"]));
      expect(types.at(-1)).toBe("finish");

      expect(chunks[1]).toEqual({ type: "data-stage", data: { stage: "analyzing" }, transient: true });
      expect(chunks[2]).toEqual({ type: "data-stage", data: { stage: "deciding" }, transient: true });
    });

    it("sends a persistent data-case with the form fields, the decision status and a valid case ID", async () => {
      const chunks = await readUIStream(await POST(postRequest()));
      const caseId = caseIdOf(chunks);
      const dataCase = chunks.find((chunk) => chunk.type === "data-case");

      expect(caseId).toMatch(CASE_ID_REGEX);
      expect(dataCase).toEqual({
        type: "data-case",
        data: { caseId, ...FORM, status: EXPECTED_DECISION.status },
      });
    });

    it("streams the composed first message for the stored case ID", async () => {
      const chunks = await readUIStream(await POST(postRequest()));
      const caseId = caseIdOf(chunks);
      const text = chunks.flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : [])).join("");
      const ids = new Set(chunks.flatMap((chunk) => ("id" in chunk && chunk.type.startsWith("text-") ? [chunk.id] : [])));

      expect(text).toBe(composeFirstMessage(caseId, EXPECTED_DECISION));
      expect(ids.size).toBe(1);
    });

    it("stores the case with the streamed assistant message and the initial status", async () => {
      const before = Date.now();
      const chunks = await readUIStream(await POST(postRequest()));
      const caseId = caseIdOf(chunks);
      const start = chunks[0];
      if (start?.type !== "start") throw new Error("first chunk is not start");

      const stored = caseStore.get(caseId);
      expect(stored).toBeDefined();
      expect(stored).toMatchObject({
        id: caseId,
        form: FORM,
        imageReport: EXPECTED_REPORT,
        initialDecision: EXPECTED_DECISION,
        currentStatus: EXPECTED_DECISION.status,
        needsInfoRounds: 0,
        userMessageCount: 0,
        turnInProgress: false,
      });
      expect(stored?.statusHistory).toEqual([
        {
          status: EXPECTED_DECISION.status,
          reason: EXPECTED_DECISION.summary,
          appliedRules: EXPECTED_DECISION.appliedRules,
          at: expect.any(Date),
        },
      ]);

      expect(start.messageId).toEqual(expect.any(String));
      expect(start.messageMetadata?.createdAt).toBeGreaterThanOrEqual(before);
      expect(stored?.messages).toEqual([
        {
          id: start.messageId,
          role: "assistant",
          metadata: start.messageMetadata,
          parts: [
            { type: "data-case", data: { caseId, ...FORM, status: EXPECTED_DECISION.status } },
            { type: "text", text: composeFirstMessage(caseId, EXPECTED_DECISION), state: "done" },
          ],
        },
      ]);
    });

    it("uses one case ID in the pipeline log lines, the data-case part and the store", async () => {
      const chunks = await readUIStream(await POST(postRequest()));
      const caseId = caseIdOf(chunks);
      const logged = vi
        .mocked(console.info)
        .mock.calls.map(([entry]) => entry as { caseId?: string; step?: string })
        .filter((entry) => entry.step === "analyzeImage" || entry.step === "decide");

      expect(logged.map((entry) => entry.step)).toEqual(["analyzeImage", "decide"]);
      expect(logged.map((entry) => entry.caseId)).toEqual([caseId, caseId]);
      expect(caseStore.get(caseId)?.id).toBe(caseId);
    });

    it("counts a NEEDS_INFO decision as the first information round", async () => {
      const needsInfo = { ...EXPECTED_DECISION, status: "NEEDS_INFO", questions: ["Kiedy pojawiła się usterka?"] };
      useModels({ decision: mockModel(DECISION, JSON.stringify(needsInfo)) });

      const chunks = await readUIStream(await POST(postRequest()));
      const stored = caseStore.get(caseIdOf(chunks));

      expect(stored?.currentStatus).toBe("NEEDS_INFO");
      expect(stored?.needsInfoRounds).toBe(1);
    });

    it("sends the vision model a compressed JPEG, not the original upload", async () => {
      await readUIStream(await POST(postRequest({ images: [imageFile("laptop-1.png", sampleImage("laptop-1.png"), "image/png")] })))
        .then(caseIdOf);

      const filePart = (vision.doGenerateCalls[0]?.prompt ?? [])
        .flatMap((message) => (message.role === "user" ? message.content : []))
        .find((part) => part.type === "file");
      expect(filePart).toMatchObject({ mediaType: "image/jpeg" });
    });
  });

  describe("validation (400 before any model call)", () => {
    async function expectValidation(request: Request, fields: Record<string, string>) {
      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "VALIDATION", fields });
      expect(vision.doGenerateCalls).toHaveLength(0);
      expect(decision.doGenerateCalls).toHaveLength(0);
      expect(caseStore.size()).toBe(0);
    }

    it("reports a code for every missing field", async () => {
      await expectValidation(postRequest({ fields: {}, images: [] }), {
        caseType: "REQUIRED",
        category: "REQUIRED",
        modelName: "REQUIRED",
        purchaseDate: "REQUIRED",
        image: "REQUIRED",
      });
    });

    it("reports field rule violations with their codes", async () => {
      await expectValidation(
        postRequest({
          fields: { ...FORM, caseType: "COMPLAINT", category: "TOASTER", purchaseDate: "2999-01-01", reason: "za krótko" },
        }),
        { category: "INVALID_ENUM", purchaseDate: "FUTURE_DATE", reason: "TOO_SHORT" },
      );
    });

    it("rejects more than one image with MULTIPLE_FILES", async () => {
      await expectValidation(postRequest({ images: [imageFile("phone-2.jpeg"), imageFile("phone-3.jpeg")] }), {
        image: "MULTIPLE_FILES",
      });
    });

    it("rejects a text file with UNSUPPORTED_FORMAT, whatever its name and declared type", async () => {
      const text = new TextEncoder().encode("To nie jest zdjęcie, tylko zwykły tekst.\n");
      await expectValidation(postRequest({ images: [imageFile("photo.jpg", text, "image/jpeg")] }), {
        image: "UNSUPPORTED_FORMAT",
      });
    });

    it("rejects a JPEG that cannot be decoded with UNSUPPORTED_FORMAT", async () => {
      const truncated = sampleImage("phone-2.jpeg").slice(0, 600);
      await expectValidation(postRequest({ images: [imageFile("phone-2.jpeg", truncated)] }), {
        image: "UNSUPPORTED_FORMAT",
      });
    });

    it("rejects a body that is not multipart", async () => {
      const response = await POST(
        new Request("http://localhost/api/cases", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(FORM),
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "VALIDATION" });
      expect(vision.doGenerateCalls).toHaveLength(0);
    });
  });

  describe("pipeline failure", () => {
    const SECRET = "sk-or-v1-0123456789abcdef";

    function throwingVision() {
      return new MockLanguageModelV4({
        provider: "openrouter",
        modelId: IMAGE_ANALYSIS.model,
        doGenerate: () => {
          throw new Error(`Upstream 401 for ${IMAGE_ANALYSIS.model} with key ${SECRET}`);
        },
      });
    }

    it("ends the stream with a PROCESSING_FAILED error chunk and stores no case", async () => {
      useModels({ vision: throwingVision() });

      const response = await POST(postRequest());
      expect(response.status).toBe(200);
      const chunks = await readUIStream(response);

      expect(chunks.map((chunk) => chunk.type)).toEqual(["start", "data-stage", "error"]);
      expect(chunks.at(-1)).toEqual({ type: "error", errorText: "PROCESSING_FAILED" });
      expect(decision.doGenerateCalls).toHaveLength(0);
      expect(caseStore.size()).toBe(0);
    });

    it("logs the failure on the server", async () => {
      useModels({ vision: throwingVision() });
      await readUIStream(await POST(postRequest()));

      expect(console.error).toHaveBeenCalledWith(
        expect.objectContaining({ code: "PROCESSING_FAILED", cause: expect.any(Error) }),
      );
    });

    it("never leaks the key, a stack trace or the model ID in the body", async () => {
      useModels({ vision: throwingVision() });
      const body = await (await POST(postRequest())).text();

      expect(parseUIStream(body).at(-1)).toEqual({ type: "error", errorText: "PROCESSING_FAILED" });
      expect(body).not.toContain("sk-or");
      expect(body).not.toMatch(/stack|\bat .+:\d+:\d+/i);
      expect(body).not.toContain(IMAGE_ANALYSIS.model);
      expect(body).not.toContain("Upstream");
    });

    it("does not leak the model ID on success either", async () => {
      const body = await (await POST(postRequest())).text();
      caseIdOf(parseUIStream(body));

      expect(body).not.toContain(DECISION.model);
      expect(body).not.toContain("sk-or");
    });
  });
});
