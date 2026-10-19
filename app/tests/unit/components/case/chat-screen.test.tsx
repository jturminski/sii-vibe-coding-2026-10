import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChatScreen } from "@/components/case/chat-screen";
import { DECISION_STATUSES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart, HscUIMessage } from "@/lib/schemas";

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
  caseType: "RETURN",
  category: "LAPTOP",
  modelName: "Dell XPS 13",
  purchaseDate: "2026-01-15",
  reason: "",
  status: "ACCEPTED",
};

// 2026-10-19 12:34 Europe/Warsaw (CEST, UTC+2).
const CREATED_AT = Date.UTC(2026, 9, 19, 10, 34);

const firstMessage: HscUIMessage = {
  id: "msg-1",
  role: "assistant",
  metadata: { createdAt: CREATED_AT },
  parts: [
    { type: "data-case", data: caseData },
    {
      type: "text",
      text: [
        "Dzień dobry!",
        "",
        "## Decyzja",
        "",
        "**Przyjęte**",
        "",
        "## Następne kroki",
        "",
        "- Zapakuj urządzenie",
        "- Odeślij je do sklepu",
      ].join("\n"),
    },
  ],
};

function setup() {
  const user = userEvent.setup();
  const view = render(
    <ChatScreen
      caseId={caseData.caseId}
      caseData={caseData}
      firstMessage={firstMessage}
      imagePreviewUrl="blob:preview"
    />,
  );
  return { ...view, user };
}

describe("ChatScreen (PRD §9.2, ADR-004 §3)", () => {
  it("renders the first message markdown as headings and list items (AC-26)", () => {
    setup();
    const log = screen.getByRole("log");
    expect(within(log).getByRole("heading", { level: 2, name: "Decyzja" })).toBeInTheDocument();
    expect(within(log).getByRole("heading", { level: 2, name: "Następne kroki" })).toBeInTheDocument();
    const items = within(log).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["Zapakuj urządzenie", "Odeślij je do sklepu"]);
    expect(log.textContent).not.toContain("## ");
    expect(log.textContent).not.toContain("**");
  });

  it("does not render the data-case part as text", () => {
    setup();
    const log = screen.getByRole("log");
    expect(log.textContent).not.toContain(caseData.caseId);
    expect(log.textContent).not.toContain("Dell XPS 13");
    expect(log.textContent).not.toContain("data-case");
  });

  it("marks the log as a polite live region", () => {
    setup();
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite");
  });

  it("shows the message timestamp from metadata.createdAt", () => {
    setup();
    const time = screen.getByRole("log").querySelector("time");
    expect(time).toHaveAttribute("datetime", new Date(CREATED_AT).toISOString());
    expect(time).toHaveTextContent("12:34");
  });

  it("places the assistant message on the assistant side", () => {
    setup();
    const log = screen.getByRole("log");
    expect(log.querySelector(".is-assistant")).not.toBeNull();
    expect(log.querySelector(".is-user")).toBeNull();
  });

  it("has a message input with the Polish placeholder (PRD §9.2)", () => {
    setup();
    expect(screen.getByRole("textbox", { name: pl.chat.inputLabel })).toHaveAttribute(
      "placeholder",
      pl.chat.inputPlaceholder,
    );
    expect(screen.getByRole("button", { name: pl.chat.send })).toBeInTheDocument();
  });

  it("keeps the summary collapsed below 1024px and opens it on demand (AC-40)", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button", { name: pl.panel.title });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const badge = () => document.querySelector('[data-status="ACCEPTED"]');
    expect(badge()).toBeNull();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(badge()).toHaveTextContent(DECISION_STATUSES.ACCEPTED);
    expect(screen.getByText(caseData.caseId)).toBeInTheDocument();
  });

  it("offers Nowe zgłoszenie when the session expired (404 CASE_NOT_FOUND)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "CASE_NOT_FOUND" }, { status: 404 })));
    const onNewCase = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatScreen
        caseId={caseData.caseId}
        caseData={caseData}
        firstMessage={firstMessage}
        imagePreviewUrl="blob:preview"
        onNewCase={onNewCase}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: pl.chat.inputLabel }), "Halo?{Enter}");
    const notice = (await screen.findByText(pl.errors.sessionExpired)).parentElement!;
    await user.click(within(notice).getByRole("button", { name: pl.chat.newCase }));

    expect(onNewCase).toHaveBeenCalledTimes(1);
  });
});
