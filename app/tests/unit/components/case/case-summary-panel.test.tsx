import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CaseSummaryPanel } from "@/components/case/case-summary-panel";
import { CASE_TYPES, CATEGORIES, DECISION_STATUSES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart } from "@/lib/schemas";

afterEach(cleanup);

const caseData: CaseDataPart = {
  caseId: "HSC-20261019-A1B2",
  caseType: "COMPLAINT",
  category: "LAPTOP",
  modelName: "Dell XPS 13",
  purchaseDate: "2026-01-15",
  reason: "Ekran migocze po kilku minutach pracy i pojawiają się poziome pasy.",
  status: "MANUAL_REVIEW",
};

function setup(overrides: Partial<CaseDataPart> = {}, status?: CaseDataPart["status"]) {
  const user = userEvent.setup();
  render(<CaseSummaryPanel caseData={{ ...caseData, ...overrides }} imagePreviewUrl="blob:preview" status={status} />);
  return { user };
}

/** Value shown next to a panel label (dt/dd pair). */
function valueOf(label: string): string {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling?.textContent ?? "";
}

describe("CaseSummaryPanel (PRD §9.2, AC-25)", () => {
  it("shows the case ID, type, category, model, date and reason", () => {
    setup();
    expect(valueOf(pl.panel.caseId)).toBe("HSC-20261019-A1B2");
    expect(valueOf(pl.panel.caseType)).toBe(CASE_TYPES.COMPLAINT);
    expect(valueOf(pl.panel.category)).toBe(CATEGORIES.LAPTOP);
    expect(valueOf(pl.panel.model)).toBe("Dell XPS 13");
    expect(valueOf(pl.panel.purchaseDate)).toBe("15.01.2026");
    expect(valueOf(pl.panel.reason)).toContain(caseData.reason);
  });

  it("shows the decision badge with the Polish status label", () => {
    setup();
    const badge = screen.getByText(DECISION_STATUSES.MANUAL_REVIEW);
    expect(badge).toHaveAttribute("data-status", "MANUAL_REVIEW");
  });

  it("shows the current status when it differs from the initial one (AC-30)", () => {
    setup({}, "NEEDS_INFO");
    expect(screen.getByText(DECISION_STATUSES.NEEDS_INFO)).toHaveAttribute("data-status", "NEEDS_INFO");
    expect(screen.queryByText(DECISION_STATUSES.MANUAL_REVIEW)).not.toBeInTheDocument();
  });

  it("clamps the reason to 3 lines", () => {
    setup();
    expect(screen.getByText(caseData.reason)).toHaveClass("line-clamp-3");
  });

  it("opens a dialog with the full image when the thumbnail is clicked", async () => {
    const { user } = setup();
    const thumbnail = screen.getByRole("button", { name: pl.panel.openPhoto });
    expect(within(thumbnail).getByRole("img")).toHaveAttribute("src", "blob:preview");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(thumbnail);

    const dialog = await screen.findByRole("dialog", { name: pl.panel.photoDialogTitle });
    expect(within(dialog).getByRole("img", { name: pl.panel.photoAlt })).toHaveAttribute("src", "blob:preview");

    await user.click(within(dialog).getByRole("button", { name: pl.panel.close }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
