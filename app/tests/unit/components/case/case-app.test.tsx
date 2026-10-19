import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from "ai";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseApp, caseAppReducer, type CaseAppState } from "@/components/case/case-app";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart, HscUIMessage } from "@/lib/schemas";

// Real JPEG bytes: the dropzone checks the content (AC-08).
const LAPTOP_JPEG = readFileSync(resolve(process.cwd(), "../assets/example-images/laptop-1.png"));
const imageFile = () => new File([LAPTOP_JPEG], "laptop-1.png", { type: "image/png" });

const caseData: CaseDataPart = {
  caseId: "HSC-20261019-A1B2",
  caseType: "RETURN",
  category: "LAPTOP",
  modelName: "Dell XPS 13",
  purchaseDate: "2026-01-15",
  reason: "",
  status: "ACCEPTED",
};

type Writer = UIMessageStreamWriter<HscUIMessage>;

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolvePromise) => (release = resolvePromise));
  return { promise, release };
}

/** A real UI message stream with the exact ADR-002 §4 parts, paused at the given gates. */
function streamResponse(
  gates: { afterAnalyzing?: Promise<void>; afterDeciding?: Promise<void> },
  fail = false,
) {
  const stream = createUIMessageStream<HscUIMessage>({
    execute: async ({ writer }: { writer: Writer }) => {
      writer.write({ type: "start", messageId: "msg-1" });
      writer.write({ type: "data-stage", data: { stage: "analyzing" }, transient: true });
      await gates.afterAnalyzing;
      writer.write({ type: "data-stage", data: { stage: "deciding" }, transient: true });
      await gates.afterDeciding;
      if (fail) throw new Error("decision model failed");
      writer.write({ type: "data-case", data: caseData });
      writer.write({ type: "text-start", id: "t1" });
      writer.write({ type: "text-delta", id: "t1", delta: "## Wstępna decyzja" });
      writer.write({ type: "text-end", id: "t1" });
      writer.write({ type: "finish" });
    },
    onError: () => "PROCESSING_FAILED",
  });
  return createUIMessageStreamResponse({ stream });
}

function mockFetch(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (..._args: [RequestInfo | URL, RequestInit?]) => response());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeAll(() => {
  // jsdom lacks the pointer/scroll APIs Radix Select uses.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const submitButton = () => screen.getByRole("button", { name: pl.form.submit });
/** Error text linked to a control through aria-describedby. */
function describedText(element: HTMLElement): string {
  const ids = element.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

const modelField = () => screen.getByRole("textbox", { name: pl.form.labels.modelName });

async function fillValid(user: ReturnType<typeof userEvent.setup>, container: HTMLElement, file: File) {
  await user.click(screen.getByRole("radio", { name: "Zwrot" }));
  await user.click(screen.getByRole("combobox", { name: pl.form.labels.category }));
  await user.click(await screen.findByRole("option", { name: "Laptop" }));
  await user.type(modelField(), "Dell XPS 13");
  fireEvent.change(screen.getByLabelText(new RegExp(`^${pl.form.labels.purchaseDate}`)), {
    target: { value: "2026-01-15" },
  });
  fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } });
  await screen.findByText(file.name);
}

function setup() {
  const user = userEvent.setup();
  const view = render(<CaseApp />);
  return { ...view, user };
}

describe("CaseApp (ADR-004 §3 page and state machine, AC-11, AC-34)", () => {
  it("shows the intro above the form", () => {
    setup();
    expect(screen.getByText(pl.form.intro)).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it("shows the stages in order, then the chat state", async () => {
    const analyzing = deferred();
    const deciding = deferred();
    const fetchMock = mockFetch(() =>
      streamResponse({ afterAnalyzing: analyzing.promise, afterDeciding: deciding.promise }),
    );
    const { user, container } = setup();
    await fillValid(user, container, imageFile());

    await user.click(submitButton());

    const status = await screen.findByText(pl.processing.analyzingImage);
    expect(status.closest("[aria-live='polite']")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    analyzing.release();
    expect(await screen.findByText(pl.processing.preparingDecision)).toBeInTheDocument();
    expect(screen.queryByText(pl.processing.analyzingImage)).not.toBeInTheDocument();

    deciding.release();
    expect(await screen.findByTestId("chat-screen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: pl.form.submit })).not.toBeInTheDocument();
    expect(screen.queryByText(pl.processing.preparingDecision)).not.toBeInTheDocument();
  });

  it("disables the submit button and the fields while submitting, so a second click does nothing (AC-11)", async () => {
    const gate = deferred();
    const fetchMock = mockFetch(() => streamResponse({ afterAnalyzing: gate.promise }));
    const { user, container } = setup();
    await fillValid(user, container, imageFile());

    await user.click(submitButton());

    await waitFor(() => expect(submitButton()).toBeDisabled());
    expect(modelField()).toBeDisabled();
    await user.click(submitButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    gate.release();
    await screen.findByTestId("chat-screen");
  });

  it("returns to the form with the banner and keeps the values and the file after an error chunk (AC-34)", async () => {
    mockFetch(() => streamResponse({}, true));
    const { user, container } = setup();
    const file = imageFile();
    await fillValid(user, container, file);

    await user.click(submitButton());

    expect(await screen.findByText(pl.errors.processingBanner)).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(modelField()).toHaveValue("Dell XPS 13");
    expect(screen.getByRole("radio", { name: "Zwrot" })).toBeChecked();
    expect(screen.getByText(file.name)).toBeInTheDocument();
    expect(screen.queryByText(pl.processing.preparingDecision)).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-screen")).not.toBeInTheDocument();
  });

  it("returns to the form with the banner after a network error (AC-34)", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const { user, container } = setup();
    await fillValid(user, container, imageFile());

    await user.click(submitButton());

    expect(await screen.findByText(pl.errors.processingBanner)).toBeInTheDocument();
    expect(modelField()).toHaveValue("Dell XPS 13");
  });

  it("maps a 400 body to inline field errors and keeps the values and the file", async () => {
    mockFetch(() =>
      Response.json(
        { error: "VALIDATION", fields: { modelName: "TOO_LONG", image: "UNSUPPORTED_FORMAT" } },
        { status: 400 },
      ),
    );
    const { user, container } = setup();
    const file = imageFile();
    await fillValid(user, container, file);

    await user.click(submitButton());

    await waitFor(() => expect(describedText(modelField())).toContain(pl.validation.TOO_LONG));
    expect(describedText(screen.getByLabelText(new RegExp(`^${pl.form.labels.photo}`)))).toContain(
      pl.validation.UNSUPPORTED_FORMAT,
    );
    expect(screen.queryByText(pl.errors.processingBanner)).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(modelField()).toHaveValue("Dell XPS 13");
    expect(screen.getByText(file.name)).toBeInTheDocument();
  });
});

describe("CaseApp new case and leave guard (PRD §4.7, AC-37, AC-38)", () => {
  /** Submission → chat; DELETE → 204; the chat route answers with `chat`. */
  function routedFetch(chat: () => Response = () => new Response(null, { status: 500 })) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(input).endsWith("/chat")) return chat();
      return streamResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const deleteCalls = (fetchMock: ReturnType<typeof routedFetch>) =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");

  function leaveIsGuarded(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  async function reachChat(chat?: () => Response) {
    const fetchMock = routedFetch(chat);
    const view = setup();
    await fillValid(view.user, view.container, imageFile());
    await view.user.click(submitButton());
    await screen.findByTestId("chat-screen");
    return { ...view, fetchMock };
  }

  const newCaseButton = () => screen.queryByRole("button", { name: pl.chat.newCase });

  it("shows Nowe zgłoszenie only in the chat state", async () => {
    routedFetch();
    setup();
    expect(newCaseButton()).not.toBeInTheDocument();
    cleanup();
    await reachChat();
    expect(newCaseButton()).toBeInTheDocument();
  });

  it("cancel keeps the chat unchanged and sends no DELETE (AC-38)", async () => {
    const { user, fetchMock } = await reachChat();
    // The form's dropzone revokes its own preview on unmount; only calls after this point matter.
    const revokesBefore = vi.mocked(URL.revokeObjectURL).mock.calls.length;

    await user.click(newCaseButton()!);
    await user.click(await screen.findByRole("button", { name: pl.dialog.cancel }));

    expect(screen.getByTestId("chat-screen")).toBeInTheDocument();
    expect(screen.getByText("Wstępna decyzja")).toBeInTheDocument();
    expect(deleteCalls(fetchMock)).toHaveLength(0);
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(revokesBefore);
  });

  it("confirm sends one DELETE and shows an empty form (AC-38)", async () => {
    const { user, fetchMock } = await reachChat();
    const revokesBefore = vi.mocked(URL.revokeObjectURL).mock.calls.length;

    await user.click(newCaseButton()!);
    await user.click(await screen.findByRole("button", { name: pl.dialog.confirm }));

    expect(await screen.findByRole("button", { name: pl.form.submit })).toBeEnabled();
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.slice(revokesBefore)).toContainEqual(["blob:preview"]);
    expect(screen.queryByTestId("chat-screen")).not.toBeInTheDocument();
    expect(modelField()).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Zwrot" })).not.toBeChecked();
    expect(newCaseButton()).not.toBeInTheDocument();
    const deletes = deleteCalls(fetchMock);
    expect(deletes).toHaveLength(1);
    expect(String(deletes[0]?.[0])).toBe(`/api/cases/${caseData.caseId}`);
  });

  it("starts a new case even when the DELETE fails", async () => {
    const fetchMock = routedFetch();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") throw new TypeError("Failed to fetch");
      if (String(input).endsWith("/chat")) return new Response(null, { status: 500 });
      return streamResponse({});
    });
    const { user, container } = setup();
    await fillValid(user, container, imageFile());
    await user.click(submitButton());
    await screen.findByTestId("chat-screen");

    await user.click(newCaseButton()!);
    await user.click(await screen.findByRole("button", { name: pl.dialog.confirm }));

    expect(await screen.findByRole("button", { name: pl.form.submit })).toBeEnabled();
  });

  it("guards leaving the page only in the chat state (AC-37)", async () => {
    routedFetch();
    setup();
    expect(leaveIsGuarded()).toBe(false);
    cleanup();

    const { user } = await reachChat();
    expect(leaveIsGuarded()).toBe(true);

    await user.click(newCaseButton()!);
    await user.click(await screen.findByRole("button", { name: pl.dialog.confirm }));
    await screen.findByRole("button", { name: pl.form.submit });
    expect(leaveIsGuarded()).toBe(false);
  });

  it("session expired offers Nowe zgłoszenie that resets to the form without a dialog", async () => {
    const { user } = await reachChat(() => Response.json({ error: "CASE_NOT_FOUND" }, { status: 404 }));

    await user.type(screen.getByRole("textbox", { name: pl.chat.inputLabel }), "Halo?{Enter}");
    const notice = (await screen.findByText(pl.errors.sessionExpired)).parentElement!;
    await user.click(within(notice).getByRole("button", { name: pl.chat.newCase }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: pl.form.submit })).toBeEnabled();
    expect(modelField()).toHaveValue("");
  });
});

describe("caseAppReducer (ADR-004 §7 state machine)", () => {
  const draft = {
    values: { caseType: "RETURN", category: "LAPTOP", modelName: "X", purchaseDate: "2026-01-15", reason: "" },
    file: new File(["x"], "x.jpg"),
  } as const;
  const message = { id: "msg-1", role: "assistant", parts: [] } as unknown as HscUIMessage;

  it("walks form → submitting → chat → form", () => {
    let state: CaseAppState = { status: "form" };
    state = caseAppReducer(state, { type: "SUBMIT", draft });
    expect(state).toEqual({ status: "submitting", draft, stage: "analyzing" });
    state = caseAppReducer(state, { type: "STAGE", stage: "deciding" });
    expect(state).toEqual({ status: "submitting", draft, stage: "deciding" });
    state = caseAppReducer(state, {
      type: "SUCCESS",
      caseId: caseData.caseId,
      caseData,
      firstMessage: message,
      imagePreviewUrl: "blob:preview",
    });
    expect(state).toMatchObject({ status: "chat", caseId: caseData.caseId, imagePreviewUrl: "blob:preview" });
    expect(caseAppReducer(state, { type: "NEW_CASE" })).toEqual({ status: "form" });
  });

  it("keeps the draft on FAIL and ignores STAGE outside submitting", () => {
    const submitting = caseAppReducer({ status: "form" }, { type: "SUBMIT", draft });
    const failed = caseAppReducer(submitting, { type: "FAIL", bannerError: pl.errors.processingBanner });
    expect(failed).toEqual({ status: "form", draft, bannerError: pl.errors.processingBanner });
    expect(caseAppReducer(failed, { type: "STAGE", stage: "deciding" })).toBe(failed);
  });
});
