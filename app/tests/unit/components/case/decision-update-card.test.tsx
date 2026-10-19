import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DecisionUpdateCard, DecisionUpdatePart } from "@/components/case/decision-update-card";
import { DECISION_STATUSES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { DecisionUpdateResult } from "@/lib/schemas";

afterEach(cleanup);

const output: DecisionUpdateResult = {
  status: "MANUAL_REVIEW",
  label: DECISION_STATUSES.MANUAL_REVIEW,
  reason: "Nowe informacje wymagają oceny specjalisty.",
  appliedRules: [
    { ref: "§4 ust. 2", explanation: "Uszkodzenia mechaniczne ocenia specjalista." },
    { ref: "§6 ust. 1–3", explanation: "Procedura weryfikacji." },
  ],
  disclaimer: "Ta decyzja jest wstępna i nie jest wiążąca.",
};

const input = { status: output.status, reason: output.reason, appliedRules: output.appliedRules };

describe("DecisionUpdateCard (AC-30)", () => {
  it("shows the title, status badge, reason, refs and disclaimer", () => {
    render(<DecisionUpdateCard result={output} />);
    const card = screen.getByRole("article", { name: pl.chat.updatedDecisionTitle });
    expect(within(card).getByRole("heading", { name: pl.chat.updatedDecisionTitle })).toBeInTheDocument();
    expect(within(card).getByText(DECISION_STATUSES.MANUAL_REVIEW)).toHaveAttribute("data-status", "MANUAL_REVIEW");
    expect(within(card).getByText(output.reason)).toBeInTheDocument();
    expect(within(card).getByText("§4 ust. 2")).toBeInTheDocument();
    expect(within(card).getByText("§6 ust. 1–3")).toBeInTheDocument();
    expect(within(card).getByText("Uszkodzenia mechaniczne ocenia specjalista.")).toBeInTheDocument();
    expect(within(card).getByText(output.disclaimer)).toBeInTheDocument();
  });
});

describe("DecisionUpdatePart (ADR-004 §3 tool part states)", () => {
  it("renders the card for output-available", () => {
    render(
      <DecisionUpdatePart
        part={{ type: "tool-updateDecision", toolCallId: "c1", state: "output-available", input, output }}
      />,
    );
    expect(screen.getByRole("article", { name: pl.chat.updatedDecisionTitle })).toBeInTheDocument();
  });

  it.each(["input-streaming", "input-available"] as const)("shows the updating row for %s", (state) => {
    const part =
      state === "input-streaming"
        ? ({ type: "tool-updateDecision", toolCallId: "c1", state, input: undefined } as const)
        : ({ type: "tool-updateDecision", toolCallId: "c1", state, input } as const);
    render(<DecisionUpdatePart part={part} />);
    expect(screen.getByText(pl.chat.updatingDecision)).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("renders nothing for output-error", () => {
    const { container } = render(
      <DecisionUpdatePart
        part={{ type: "tool-updateDecision", toolCallId: "c1", state: "output-error", input, errorText: "boom" }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
