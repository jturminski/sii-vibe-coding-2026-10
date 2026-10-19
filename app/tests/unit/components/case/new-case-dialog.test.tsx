import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewCaseDialog } from "@/components/case/new-case-dialog";
import { pl } from "@/lib/i18n/pl";

afterEach(cleanup);

function setup() {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<NewCaseDialog onConfirm={onConfirm} />);
  return { user, onConfirm };
}

describe("NewCaseDialog (PRD §4.7, AC-38)", () => {
  it("asks for confirmation with the PRD text", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: pl.chat.newCase }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(pl.dialog.newCaseMessage)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: pl.dialog.confirm })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: pl.dialog.cancel })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancel closes the dialog without confirming", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: pl.chat.newCase }));
    await user.click(await screen.findByRole("button", { name: pl.dialog.cancel }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirm calls onConfirm once", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: pl.chat.newCase }));
    await user.click(await screen.findByRole("button", { name: pl.dialog.confirm }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
