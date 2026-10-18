import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DecisionBadge } from "@/components/case/decision-badge";
import type { DecisionStatus } from "@/lib/domain";

afterEach(cleanup);

const CASES: ReadonlyArray<[DecisionStatus, string]> = [
  ["ACCEPTED", "Przyjęte"],
  ["REJECTED", "Odrzucone"],
  ["MANUAL_REVIEW", "Do weryfikacji przez specjalistę"],
  ["NEEDS_INFO", "Potrzebne dodatkowe informacje"],
];

describe("DecisionBadge (PRD AC-16, ADR-004 Decision badge)", () => {
  it.each(CASES)("renders %s with the exact Polish label and data-status", (status, label) => {
    render(<DecisionBadge status={status} />);

    const badge = screen.getByText(label);
    expect(badge).toHaveTextContent(new RegExp(`^${label}$`));
    expect(badge).toHaveAttribute("data-status", status);
    expect(badge).toHaveAttribute("data-slot", "badge");
  });

  it("uses a distinct color variant for every status", () => {
    const classNames = CASES.map(([status]) => {
      const { container } = render(<DecisionBadge status={status} />);
      const badge = container.querySelector(`[data-status="${status}"]`);
      return badge?.className ?? "";
    });

    expect(new Set(classNames).size).toBe(CASES.length);
  });

  it("merges a custom className", () => {
    render(<DecisionBadge status="ACCEPTED" className="custom-class" />);

    expect(screen.getByText("Przyjęte")).toHaveClass("custom-class");
  });
});
