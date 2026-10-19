import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CaseForm } from "@/components/case/case-form";
import { ChatInput } from "@/components/case/chat-input";
import { LIMITS } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";

// T6.2 accessibility pass (ADR-004 §3 accessibility bullet).

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

afterEach(cleanup);

const byLabel = (text: string) => screen.getByLabelText(new RegExp(`^${text}`));
const describedText = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

describe("case form", () => {
  const setup = () => {
    const user = userEvent.setup();
    render(<CaseForm disabled={false} onSubmit={vi.fn()} />);
    return { user };
  };

  it("exposes the visual * marker as aria-required on every required field", () => {
    setup();
    expect(screen.getByRole("radiogroup", { name: pl.form.labels.caseType })).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("combobox", { name: new RegExp(`^${pl.form.labels.category}`) })).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(byLabel(pl.form.labels.modelName)).toBeRequired();
    expect(byLabel(pl.form.labels.purchaseDate)).toBeRequired();
    expect(byLabel(pl.form.labels.photo)).toBeRequired();
  });

  it("marks the reason as required only for a complaint (AC-04, AC-05)", async () => {
    const { user } = setup();
    expect(screen.getByRole("textbox", { name: pl.form.reasonLabelDefault })).not.toBeRequired();

    await user.click(screen.getByRole("radio", { name: "Reklamacja" }));
    expect(screen.getByRole("textbox", { name: new RegExp(`^${pl.form.reasonLabel.COMPLAINT}`) })).toBeRequired();

    await user.click(screen.getByRole("radio", { name: "Zwrot" }));
    expect(screen.getByRole("textbox", { name: pl.form.reasonLabel.RETURN })).not.toBeRequired();
  });

  it("describes the reason with its counter without announcing every keystroke", () => {
    setup();
    const reason = screen.getByRole("textbox", { name: pl.form.reasonLabelDefault });
    expect(describedText(reason)).toContain(`0/${LIMITS.REASON_MAX}`);
    const counter = screen.getByText(`0/${LIMITS.REASON_MAX}`);
    expect(counter.closest("[aria-live]")).toBeNull();
    expect(counter.closest('[role="status"], output')).toBeNull();
  });
});

describe("chat input", () => {
  it("describes the message box with its counter without announcing every keystroke", async () => {
    const user = userEvent.setup();
    render(<ChatInput status="ready" onSend={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: pl.chat.inputLabel });
    await user.type(input, "abc");

    expect(describedText(input)).toContain(`3/${LIMITS.CHAT_MESSAGE_MAX}`);
    expect(describedText(input)).toContain(pl.chat.charCount);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("output, [aria-live]")).toBeNull();
  });
});
