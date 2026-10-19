import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from "ai";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChatScreen } from "@/components/case/chat-screen";
import { DECISION_STATUSES, LIMITS } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart, DecisionUpdateResult, HscUIMessage } from "@/lib/schemas";

beforeAll(() => {
  // jsdom lacks ResizeObserver (used by use-stick-to-bottom in Conversation).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const caseData: CaseDataPart = {
  caseId: "HSC-20261019-A1B2",
  caseType: "COMPLAINT",
  category: "LAPTOP",
  modelName: "Dell XPS 13",
  purchaseDate: "2026-01-15",
  reason: "Ekran migocze po kilku minutach pracy.",
  status: "REJECTED",
};

const firstMessage: HscUIMessage = {
  id: "msg-1",
  role: "assistant",
  metadata: { createdAt: Date.UTC(2026, 9, 19, 10, 34) },
  parts: [
    { type: "data-case", data: caseData },
    { type: "text", text: "## Decyzja\n\n**Odrzucone**" },
  ],
};

type Writer = UIMessageStreamWriter<HscUIMessage>;

let replyCounter = 0;

/** A real UI message stream response, as the chat route writes it (ADR-002 §5). */
function streamResponse(execute: (writer: Writer) => Promise<void> | void) {
  const stream = createUIMessageStream<HscUIMessage>({ execute: ({ writer }) => execute(writer) });
  return createUIMessageStreamResponse({ stream });
}

function writeText(writer: Writer, text: string) {
  const id = `t-${replyCounter}`;
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

function textReply(text: string) {
  return () =>
    streamResponse((writer) => {
      replyCounter += 1;
      writer.write({ type: "start", messageId: `reply-${replyCounter}` });
      writeText(writer, text);
      writer.write({ type: "finish" });
    });
}

function jsonResponse(status: number, body: unknown) {
  return () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(...responses: Array<() => Response | Promise<Response>>) {
  const queue = [...responses];
  const fetchMock = vi.fn(async (..._args: [RequestInfo | URL, RequestInit?]) => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) throw new Error("no response queued");
    return next();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof mockFetch>, call: number) {
  const init = fetchMock.mock.calls[call]?.[1];
  return JSON.parse(String(init?.body)) as { message: HscUIMessage };
}

function setup() {
  const user = userEvent.setup();
  render(
    <ChatScreen caseId={caseData.caseId} caseData={caseData} firstMessage={firstMessage} imagePreviewUrl="blob:preview" />,
  );
  const textbox = () => screen.getByRole("textbox", { name: pl.chat.inputLabel });
  const sendButton = () => screen.getByRole("button", { name: pl.chat.send });
  return { user, textbox, sendButton };
}

const typing = () => screen.queryByRole("status", { name: pl.chat.typing });

describe("ChatScreen interactive chat (PRD §4.4, ADR-004 §3)", () => {
  it("has a stable test id on the chat root", () => {
    setup();
    expect(screen.getByTestId("chat-screen")).toBeInTheDocument();
  });

  it("sends the message, shows the user bubble, then the streamed reply (AC-27)", async () => {
    const fetchMock = mockFetch(textReply("Dziękuję za informację."));
    const { user, textbox } = setup();

    await user.type(textbox(), "Czy mogę odesłać kurierem?{Enter}");

    const log = screen.getByRole("log");
    await within(log).findByText("Czy mogę odesłać kurierem?");
    expect(log.querySelector(".is-user")).not.toBeNull();
    expect(await within(log).findByText("Dziękuję za informację.")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`/api/cases/${caseData.caseId}/chat`);
    const { message } = requestBody(fetchMock, 0);
    expect(message.role).toBe("user");
    expect(message.parts).toEqual([{ type: "text", text: "Czy mogę odesłać kurierem?" }]);
    expect(textbox()).toHaveValue("");
  });

  it("shows the typing indicator and disables send while the reply streams (AC-29)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockFetch(() =>
      streamResponse(async (writer) => {
        writer.write({ type: "start", messageId: "reply-gated" });
        await gate;
        writeText(writer, "Gotowe.");
        writer.write({ type: "finish" });
      }),
    );
    const { user, textbox, sendButton } = setup();
    expect(typing()).not.toBeInTheDocument();

    await user.type(textbox(), "Pytanie{Enter}");

    await waitFor(() => expect(typing()).toBeInTheDocument());
    await user.type(textbox(), "Kolejne");
    expect(sendButton()).toBeDisabled();

    release();
    expect(await screen.findByText("Gotowe.")).toBeInTheDocument();
    await waitFor(() => expect(typing()).not.toBeInTheDocument());
    expect(sendButton()).toBeEnabled();
  });

  it("renders the decision update card and updates the panel badge (AC-30)", async () => {
    const output: DecisionUpdateResult = {
      status: "MANUAL_REVIEW",
      label: DECISION_STATUSES.MANUAL_REVIEW,
      reason: "Sprawę oceni specjalista.",
      appliedRules: [{ ref: "§4 ust. 2", explanation: "Ocena specjalisty." }],
      disclaimer: "Ta decyzja jest wstępna i nie jest wiążąca.",
    };
    mockFetch(() =>
      streamResponse((writer) => {
        writer.write({ type: "start", messageId: "reply-tool" });
        writer.write({
          type: "tool-input-available",
          toolCallId: "call-1",
          toolName: "updateDecision",
          input: { status: output.status, reason: output.reason, appliedRules: output.appliedRules },
        });
        writer.write({ type: "tool-output-available", toolCallId: "call-1", output });
        writeText(writer, "Zmieniłem decyzję.");
        writer.write({ type: "finish" });
      }),
    );
    const { user, textbox } = setup();
    await user.click(screen.getByRole("button", { name: pl.panel.title }));
    const panel = screen.getByRole("region", { name: pl.panel.title });
    expect(within(panel).getByText(DECISION_STATUSES.REJECTED)).toBeInTheDocument();

    await user.type(textbox(), "Urządzenie nie spadło.{Enter}");

    const card = await screen.findByRole("article", { name: pl.chat.updatedDecisionTitle });
    expect(within(card).getByText(output.reason)).toBeInTheDocument();
    expect(within(panel).getByText(DECISION_STATUSES.MANUAL_REVIEW)).toHaveAttribute("data-status", "MANUAL_REVIEW");
    expect(within(panel).queryByText(DECISION_STATUSES.REJECTED)).not.toBeInTheDocument();
  });

  it("enters the limit state on 409 MESSAGE_LIMIT (AC-33)", async () => {
    mockFetch(jsonResponse(409, { error: "MESSAGE_LIMIT" }));
    const { user, textbox } = setup();

    await user.type(textbox(), "Jeszcze jedno pytanie{Enter}");

    expect(await screen.findByText(pl.chat.limitReached)).toBeInTheDocument();
    expect(textbox()).toBeDisabled();
    expect(screen.queryByRole("button", { name: pl.errors.retry })).not.toBeInTheDocument();
  });

  it("shows the session-expired text on 404 CASE_NOT_FOUND", async () => {
    mockFetch(jsonResponse(404, { error: "CASE_NOT_FOUND" }));
    const { user, textbox } = setup();

    await user.type(textbox(), "Halo?{Enter}");

    expect(await screen.findByText(pl.errors.sessionExpired)).toBeInTheDocument();
    expect(textbox()).toBeDisabled();
    expect(screen.queryByRole("button", { name: pl.errors.retry })).not.toBeInTheDocument();
  });

  it("marks the failed message and resends the same message on Ponów (AC-35, AC-36)", async () => {
    const fetchMock = mockFetch(
      () => new Response("Internal Server Error: stack at route.ts:42", { status: 500 }),
      textReply("Odpowiedź po ponowieniu."),
    );
    const { user, textbox } = setup();

    await user.type(textbox(), "Moje pytanie{Enter}");

    expect(await screen.findByText(pl.errors.chatFailed)).toBeInTheDocument();
    expect(screen.getByText("Moje pytanie")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Internal Server Error|500|stack/);

    await user.click(screen.getByRole("button", { name: pl.errors.retry }));

    expect(await screen.findByText("Odpowiedź po ponowieniu.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 1).message.id).toBe(requestBody(fetchMock, 0).message.id);
    expect(screen.getAllByText("Moje pytanie")).toHaveLength(1);
    expect(screen.queryByText(pl.errors.chatFailed)).not.toBeInTheDocument();
  });

  it("does not send whitespace-only messages (AC-28)", async () => {
    const fetchMock = mockFetch(textReply("nie powinno"));
    const { user, textbox, sendButton } = setup();

    await user.type(textbox(), "   ");
    expect(sendButton()).toBeDisabled();
    await user.type(textbox(), "{Enter}");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds a newline on Shift+Enter instead of sending (AC-28)", async () => {
    const fetchMock = mockFetch(textReply("nie powinno"));
    const { user, textbox } = setup();

    await user.type(textbox(), "a{Shift>}{Enter}{/Shift}b");

    expect(textbox()).toHaveValue("a\nb");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits the input to 2000 characters and shows a counter (AC-28)", async () => {
    const { user, textbox } = setup();
    expect(textbox()).toHaveAttribute("maxlength", String(LIMITS.CHAT_MESSAGE_MAX));
    expect(screen.getByText(`0/${LIMITS.CHAT_MESSAGE_MAX}`)).toBeInTheDocument();

    await user.click(textbox());
    await user.paste("x".repeat(LIMITS.CHAT_MESSAGE_MAX + 5));

    expect(textbox()).toHaveValue("x".repeat(LIMITS.CHAT_MESSAGE_MAX));
    expect(screen.getByText(`${LIMITS.CHAT_MESSAGE_MAX}/${LIMITS.CHAT_MESSAGE_MAX}`)).toBeInTheDocument();
  });

  it("disables the input after 20 customer messages on the client (AC-33)", async () => {
    mockFetch(textReply("OK."));
    const { user, textbox } = setup();

    for (let i = 1; i <= LIMITS.MAX_USER_MESSAGES; i += 1) {
      await user.type(textbox(), `Wiadomość ${i}{Enter}`);
      await screen.findByText(`Wiadomość ${i}`);
      await waitFor(() => expect(typing()).not.toBeInTheDocument());
    }

    expect(await screen.findByText(pl.chat.limitReached)).toBeInTheDocument();
    expect(textbox()).toBeDisabled();
  }, 30_000);
});
