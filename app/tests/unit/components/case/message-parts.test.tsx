import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageParts } from "@/components/case/message-parts";
import { DECISION_STATUSES, type DecisionStatus } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart, Decision, HscUIMessage } from "@/lib/schemas";
import { composeFirstMessage } from "@/server/ai/compose-first-message";

afterEach(cleanup);

const CASE_ID = "HSC-20261019-A1B2";
const fm = pl.firstMessage;
const STATUSES = Object.keys(DECISION_STATUSES) as DecisionStatus[];

function caseData(status: DecisionStatus): CaseDataPart {
  return {
    caseId: CASE_ID,
    caseType: "RETURN",
    category: "LAPTOP",
    modelName: "Dell XPS 13",
    purchaseDate: "2026-01-15",
    reason: "",
    status,
  };
}

function decision(status: DecisionStatus): Decision {
  return {
    status,
    summary: "Krótkie podsumowanie decyzji.",
    photoFindings: "Na zdjęciu widać urządzenie bez uszkodzeń.",
    appliedRules: [{ ref: "§2 ust. 1", explanation: "Zwrot w ciągu 14 dni od dostawy." }],
    nextSteps: ["Zapakuj urządzenie."],
    questions: status === "NEEDS_INFO" ? ["Kiedy pojawiła się usterka?"] : [],
  };
}

/** The real first message: the composer's text plus the `data-case` part (ADR-002 §4). */
function firstMessage(status: DecisionStatus, text = composeFirstMessage(CASE_ID, decision(status))): HscUIMessage {
  return {
    id: "msg-1",
    role: "assistant",
    parts: [
      { type: "data-case", data: caseData(status) },
      { type: "text", text },
    ],
  };
}

describe("MessageParts first message status badge (AC-24, defect D2)", () => {
  it.each(STATUSES)("renders exactly one %s badge directly under the Decyzja heading", (status) => {
    const { container } = render(<MessageParts message={firstMessage(status)} />);

    const badges = container.querySelectorAll("[data-status]");
    expect(badges).toHaveLength(1);
    const badge = badges[0]!;
    expect(badge).toHaveAttribute("data-status", status);
    expect(badge).toHaveTextContent(DECISION_STATUSES[status]);

    const heading = screen.getByRole("heading", { level: 2, name: fm.headings.decision });
    const order = (a: Node, b: Node) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order(heading, badge)).toBeTruthy();
    expect(order(badge, screen.getByText("Krótkie podsumowanie decyzji."))).toBeTruthy();
  });

  it.each(STATUSES)("does not repeat the %s label as text next to the badge", (status) => {
    const { container } = render(<MessageParts message={firstMessage(status)} />);
    const text = container.textContent ?? "";
    expect(text.split(DECISION_STATUSES[status])).toHaveLength(2);
    expect(text).not.toContain("**");
    expect(container.querySelector("strong")?.textContent).not.toBe(DECISION_STATUSES[status]);
  });

  it("keeps the greeting, headings, lists, disclaimer and case ID line (AC-26, TAC-003-03)", () => {
    render(<MessageParts message={firstMessage("NEEDS_INFO")} />);
    expect(screen.getByText(fm.greeting)).toBeInTheDocument();
    for (const name of Object.values(fm.headings)) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(fm.disclaimer)).toBeInTheDocument();
    expect(screen.getByText(`${fm.caseIdPrefix} ${CASE_ID}`)).toBeInTheDocument();
  });

  it("uses the initial status from data-case, so a different label is left as plain markdown", () => {
    // Text says Przyjęte, data-case says REJECTED: no match, render the text unchanged without a badge.
    const text = composeFirstMessage(CASE_ID, decision("ACCEPTED"));
    const { container } = render(<MessageParts message={firstMessage("REJECTED", text)} />);
    expect(container.querySelector("[data-status]")).toBeNull();
    expect(screen.getByText(DECISION_STATUSES.ACCEPTED)).toBeInTheDocument();
  });

  it("does not add a badge to assistant replies without a data-case part, even with a Decyzja heading", () => {
    const reply: HscUIMessage = {
      id: "msg-2",
      role: "assistant",
      parts: [{ type: "text", text: `${fm.greeting}\n\n## ${fm.headings.decision}\n\n${DECISION_STATUSES.ACCEPTED}\n\nDalej.` }],
    };
    const { container } = render(<MessageParts message={reply} />);
    expect(container.querySelector("[data-status]")).toBeNull();
    expect(screen.getByText(DECISION_STATUSES.ACCEPTED)).toBeInTheDocument();
  });
});
