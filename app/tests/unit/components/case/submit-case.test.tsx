import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessingFailed, submitCase } from "@/components/case/submit-case";
import type { CaseDataPart, CaseForm, HscUIMessage } from "@/lib/schemas";

const values: CaseForm = {
  caseType: "COMPLAINT",
  category: "LAPTOP",
  modelName: "Dell XPS 13",
  purchaseDate: "2025-08-01",
  reason: "Ekran migocze po kilku minutach pracy.",
};
const file = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "laptop.jpg", { type: "image/jpeg" });

const caseData: CaseDataPart = {
  caseId: "HSC-20261019-A1B2",
  caseType: "COMPLAINT",
  category: "LAPTOP",
  modelName: "Dell XPS 13",
  purchaseDate: "2025-08-01",
  reason: "Ekran migocze po kilku minutach pracy.",
  status: "ACCEPTED",
};
const firstMessageText = "## Wstępna decyzja\n\nZgłoszenie zostało przyjęte.";

type Writer = UIMessageStreamWriter<HscUIMessage>;

/** A real UI message stream response, as the route writes it (ADR-002 §4). */
function streamResponse(execute: (writer: Writer) => Promise<void> | void) {
  const stream = createUIMessageStream<HscUIMessage>({
    execute: ({ writer }) => execute(writer),
    onError: () => "PROCESSING_FAILED",
  });
  return createUIMessageStreamResponse({ stream });
}

function writeStages(writer: Writer) {
  writer.write({ type: "start", messageId: "msg-1" });
  writer.write({ type: "data-stage", data: { stage: "analyzing" }, transient: true });
  writer.write({ type: "data-stage", data: { stage: "deciding" }, transient: true });
}

function writeSuccess(writer: Writer) {
  writeStages(writer);
  writer.write({ type: "data-case", data: caseData });
  writer.write({ type: "text-start", id: "t1" });
  writer.write({ type: "text-delta", id: "t1", delta: "## Wstępna decyzja\n\n" });
  writer.write({ type: "text-delta", id: "t1", delta: "Zgłoszenie zostało przyjęte." });
  writer.write({ type: "text-end", id: "t1" });
  writer.write({ type: "finish" });
}

function mockFetch(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (..._args: [RequestInfo | URL, RequestInit?]) => response());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitCase (ADR-004 §3 submit, F2; ADR-002 §4)", () => {
  it("posts the six multipart fields to /api/cases", async () => {
    const fetchMock = mockFetch(() => streamResponse(writeSuccess));
    const image = file();

    await submitCase(values, image, { onStage: () => {} });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/cases");
    expect(init?.method).toBe("POST");
    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("caseType")).toBe("COMPLAINT");
    expect(body.get("category")).toBe("LAPTOP");
    expect(body.get("modelName")).toBe("Dell XPS 13");
    expect(body.get("purchaseDate")).toBe("2025-08-01");
    expect(body.get("reason")).toBe(values.reason);
    expect((body.get("image") as File).name).toBe("laptop.jpg");
  });

  it("reports the stages in order and resolves with the case data and the first message", async () => {
    mockFetch(() => streamResponse(writeSuccess));
    const onStage = vi.fn();

    const result = await submitCase(values, file(), { onStage });

    expect(onStage.mock.calls).toEqual([["analyzing"], ["deciding"]]);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.caseId).toBe(caseData.caseId);
    expect(result.caseData).toEqual(caseData);
    expect(result.message.id).toBe("msg-1");
    expect(result.message.role).toBe("assistant");
    const text = result.message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
    expect(text).toBe(firstMessageText);
    // Transient stage parts never become part of the persisted message.
    expect(result.message.parts.some((part) => part.type === "data-stage")).toBe(false);
  });

  it("returns the field codes of a 400 validation body", async () => {
    mockFetch(() =>
      Response.json({ error: "VALIDATION", fields: { image: "UNSUPPORTED_FORMAT", modelName: "REQUIRED" } }, { status: 400 }),
    );

    const result = await submitCase(values, file(), { onStage: () => {} });

    expect(result).toEqual({ kind: "validation", fields: { image: "UNSUPPORTED_FORMAT", modelName: "REQUIRED" } });
  });

  it("rejects with ProcessingFailed on an error chunk", async () => {
    mockFetch(() =>
      streamResponse((writer) => {
        writeStages(writer);
        throw new Error("vision model failed");
      }),
    );
    const onStage = vi.fn();

    await expect(submitCase(values, file(), { onStage })).rejects.toBeInstanceOf(ProcessingFailed);
    expect(onStage).toHaveBeenCalledWith("analyzing");
  });

  it("rejects with ProcessingFailed on a network error", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(submitCase(values, file(), { onStage: () => {} })).rejects.toBeInstanceOf(ProcessingFailed);
  });

  it("rejects with ProcessingFailed on an unexpected status", async () => {
    mockFetch(() => new Response("boom", { status: 500 }));

    await expect(submitCase(values, file(), { onStage: () => {} })).rejects.toBeInstanceOf(ProcessingFailed);
  });

  it("rejects with ProcessingFailed when the stream ends without a data-case part", async () => {
    mockFetch(() =>
      streamResponse((writer) => {
        writeStages(writer);
        writer.write({ type: "text-start", id: "t1" });
        writer.write({ type: "text-delta", id: "t1", delta: "Tekst" });
        writer.write({ type: "text-end", id: "t1" });
        writer.write({ type: "finish" });
      }),
    );

    await expect(submitCase(values, file(), { onStage: () => {} })).rejects.toBeInstanceOf(ProcessingFailed);
  });
});
