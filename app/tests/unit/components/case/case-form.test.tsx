import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CaseForm } from "@/components/case/case-form";
import { LIMITS, todayInWarsaw } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";

// Real JPEG bytes (the dropzone checks the content, AC-08).
const LAPTOP_JPEG = readFileSync(resolve(process.cwd(), "../assets/example-images/laptop-1.png"));
const imageFile = () => new File([LAPTOP_JPEG], "laptop-1.png", { type: "image/png" });

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
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const required = pl.validation.REQUIRED;

function setup(props: Partial<Parameters<typeof CaseForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  const view = render(<CaseForm disabled={false} onSubmit={onSubmit} {...props} />);
  return { ...view, onSubmit, user };
}

const submitButton = () => screen.getByRole("button", { name: pl.form.submit });
const reasonField = () => screen.getByRole("textbox", { name: /Opis|Powód/ });
/** Labels carry a visual, aria-hidden "*" required marker, so match by prefix. */
const byLabel = (text: string) => screen.getByLabelText(new RegExp(`^${text}`));
const fileInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="file"]')!;

/** Error text linked to a control through aria-describedby. */
function describedText(element: HTMLElement): string {
  const ids = element.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
}

async function pickCategory(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("combobox", { name: pl.form.labels.category }));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("CaseForm (PRD AC-01–07, AC-11, §9.1)", () => {
  it("renders the fields in PRD §9.1 order with labels", () => {
    setup();
    const group = screen.getByRole("radiogroup", { name: pl.form.labels.caseType });
    expect(within(group).getByRole("radio", { name: "Zwrot" })).not.toBeChecked();
    expect(within(group).getByRole("radio", { name: "Reklamacja" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: pl.form.labels.category })).toHaveTextContent(
      pl.form.categoryPlaceholder,
    );
    expect(screen.getByRole("textbox", { name: pl.form.labels.modelName })).toHaveAttribute(
      "placeholder",
      pl.form.modelPlaceholder,
    );
    const date = byLabel(pl.form.labels.purchaseDate);
    expect(date).toHaveAttribute("type", "date");
    expect(date).toHaveAttribute("max", todayInWarsaw(new Date()));
    expect(reasonField()).toHaveAttribute("maxLength", String(LIMITS.REASON_MAX));
    expect(byLabel(pl.form.labels.photo)).toHaveAttribute("type", "file");
    expect(submitButton()).toBeInTheDocument();
  });

  it("lists exactly the AC-02 categories", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("combobox", { name: pl.form.labels.category }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Smartfon",
      "Laptop",
      "Tablet",
      "Słuchawki",
      "Smartwatch / opaska",
      "Telewizor / monitor",
      "Konsola do gier",
      "Aparat fotograficzny",
      "Inne",
    ]);
  });

  it("empty submit shows REQUIRED under 5 fields, focuses the first and does not submit (AC-03)", async () => {
    const { user, onSubmit } = setup();
    await user.click(submitButton());

    await waitFor(() => expect(screen.getAllByText(required)).toHaveLength(5));
    const group = screen.getByRole("radiogroup", { name: pl.form.labels.caseType });
    expect(describedText(group)).toContain(required);
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(describedText(screen.getByRole("combobox", { name: pl.form.labels.category }))).toContain(required);
    expect(describedText(screen.getByRole("textbox", { name: pl.form.labels.modelName }))).toContain(required);
    expect(describedText(byLabel(pl.form.labels.purchaseDate))).toContain(required);
    expect(describedText(byLabel(pl.form.labels.photo))).toContain(required);
    expect(describedText(reasonField())).not.toContain(required);
    expect(screen.getByRole("radio", { name: "Zwrot" })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not require the reason for Zwrot (AC-05)", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("radio", { name: "Zwrot" }));
    await user.click(submitButton());

    await waitFor(() => expect(screen.getAllByText(required)).toHaveLength(4));
    expect(describedText(reasonField())).not.toContain(required);
    expect(screen.getByRole("combobox", { name: pl.form.labels.category })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Reklamacja with a 19-character reason shows the TOO_SHORT text (AC-04)", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("radio", { name: "Reklamacja" }));
    await user.type(reasonField(), "a".repeat(19));
    await user.click(submitButton());

    expect(await screen.findByText(pl.validation.TOO_SHORT)).toBeInTheDocument();
    expect(describedText(reasonField())).toContain(pl.validation.TOO_SHORT);
  });

  it("a future purchase date shows the FUTURE_DATE text (AC-07)", async () => {
    const { user } = setup();
    const tomorrow = todayInWarsaw(new Date(Date.now() + 2 * 86_400_000));
    fireEvent.change(byLabel(pl.form.labels.purchaseDate), { target: { value: tomorrow } });
    await user.click(submitButton());

    expect(await screen.findByText(pl.validation.FUTURE_DATE)).toBeInTheDocument();
    expect(describedText(byLabel(pl.form.labels.purchaseDate))).toContain(pl.validation.FUTURE_DATE);
  });

  it("the reason counter shows n/2000 and blocks more input (AC-06)", async () => {
    const { user } = setup();
    expect(screen.getByText(`0/${LIMITS.REASON_MAX}`)).toBeInTheDocument();
    fireEvent.change(reasonField(), { target: { value: "a".repeat(LIMITS.REASON_MAX - 1) } });
    await user.type(reasonField(), "bcd");

    expect(reasonField()).toHaveValue(`${"a".repeat(LIMITS.REASON_MAX - 1)}b`);
    expect(screen.getByText(`${LIMITS.REASON_MAX}/${LIMITS.REASON_MAX}`)).toBeInTheDocument();
  });

  it("the case type switches the reason label and the photo hint (AC-05, §9.1)", async () => {
    const { user } = setup();
    expect(screen.queryByText(pl.form.photoHint.RETURN)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Reklamacja" }));
    expect(screen.getByRole("textbox", { name: pl.form.reasonLabel.COMPLAINT })).toBeInTheDocument();
    expect(screen.getByText(pl.form.photoHint.COMPLAINT)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Zwrot" }));
    expect(screen.getByRole("textbox", { name: pl.form.reasonLabel.RETURN })).toBeInTheDocument();
    expect(screen.getByText(pl.form.photoHint.RETURN)).toBeInTheDocument();
    expect(screen.queryByText(pl.form.photoHint.COMPLAINT)).not.toBeInTheDocument();
  });

  it("a valid submit calls onSubmit once with the values and the File", async () => {
    const { user, onSubmit, container } = setup();
    await user.click(screen.getByRole("radio", { name: "Reklamacja" }));
    await pickCategory(user, "Laptop");
    await user.type(screen.getByRole("textbox", { name: pl.form.labels.modelName }), "  Dell XPS 13 ");
    fireEvent.change(byLabel(pl.form.labels.purchaseDate), { target: { value: "2026-01-15" } });
    await user.type(reasonField(), "Ekran migocze po dwóch tygodniach użytkowania.");
    const file = imageFile();
    fireEvent.change(fileInput(container), { target: { files: [file] } });
    await screen.findByText(file.name);

    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        caseType: "COMPLAINT",
        category: "LAPTOP",
        modelName: "Dell XPS 13",
        purchaseDate: "2026-01-15",
        reason: "Ekran migocze po dwóch tygodniach użytkowania.",
      },
      file,
    );
  });

  it("shows a translated error for a rejected photo", async () => {
    const { container } = setup();
    fireEvent.change(fileInput(container), {
      target: { files: [new File(["not an image"], "notes.png", { type: "image/png" })] },
    });
    expect(await screen.findByText(pl.validation.UNSUPPORTED_FORMAT)).toBeInTheDocument();
  });

  describe("a rejected photo after a valid one (AC-10)", () => {
    const notAnImage = () => new File(["to nie jest obraz"], "notes.png", { type: "image/png" });

    async function fillValid(user: ReturnType<typeof userEvent.setup>, container: HTMLElement, file: File) {
      await user.click(screen.getByRole("radio", { name: "Zwrot" }));
      await pickCategory(user, "Laptop");
      await user.type(screen.getByRole("textbox", { name: pl.form.labels.modelName }), "Dell XPS 13");
      fireEvent.change(byLabel(pl.form.labels.purchaseDate), { target: { value: "2026-01-15" } });
      fireEvent.change(fileInput(container), { target: { files: [file] } });
      await screen.findByText(file.name);
    }

    it("keeps the held file, shows the error and blocks submit until a valid file is chosen", async () => {
      const { user, onSubmit, container } = setup();
      const held = imageFile();
      await fillValid(user, container, held);

      fireEvent.change(fileInput(container), { target: { files: [notAnImage()] } });
      expect(await screen.findByText(pl.validation.UNSUPPORTED_FORMAT)).toBeInTheDocument();
      expect(screen.getByRole("img", { name: held.name })).toBeInTheDocument();

      await user.click(submitButton());
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(pl.validation.UNSUPPORTED_FORMAT)).toBeInTheDocument();
      await waitFor(() => expect(byLabel(pl.form.labels.photo)).toHaveFocus());

      const next = new File([LAPTOP_JPEG], "next.png", { type: "image/png" });
      fireEvent.change(fileInput(container), { target: { files: [next] } });
      await screen.findByText(next.name);
      expect(screen.queryByText(pl.validation.UNSUPPORTED_FORMAT)).not.toBeInTheDocument();

      await user.click(submitButton());
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0]?.[1]).toBe(next);
    });

    it("keeps the photo error alongside other field errors on submit", async () => {
      const { user, onSubmit, container } = setup();
      fireEvent.change(fileInput(container), { target: { files: [imageFile()] } });
      await screen.findByText("laptop-1.png");
      fireEvent.change(fileInput(container), { target: { files: [notAnImage()] } });
      await screen.findByText(pl.validation.UNSUPPORTED_FORMAT);

      await user.click(submitButton());

      await waitFor(() => expect(screen.getAllByText(required)).toHaveLength(4));
      expect(screen.getByText(pl.validation.UNSUPPORTED_FORMAT)).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Zwrot" })).toHaveFocus();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("clears the photo error when Usuń is clicked", async () => {
      const { user, container } = setup();
      fireEvent.change(fileInput(container), { target: { files: [imageFile()] } });
      await screen.findByText("laptop-1.png");
      fireEvent.change(fileInput(container), { target: { files: [notAnImage()] } });
      await screen.findByText(pl.validation.UNSUPPORTED_FORMAT);

      await user.click(screen.getByRole("button", { name: pl.form.removeFile }));

      expect(screen.queryByText(pl.validation.UNSUPPORTED_FORMAT)).not.toBeInTheDocument();
      expect(screen.queryByText("laptop-1.png")).not.toBeInTheDocument();
    });
  });

  it("disabled disables every field and the submit button (AC-11)", () => {
    setup({ disabled: true });
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.getByRole("combobox", { name: pl.form.labels.category })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: pl.form.labels.modelName })).toBeDisabled();
    expect(byLabel(pl.form.labels.purchaseDate)).toBeDisabled();
    expect(reasonField()).toBeDisabled();
    expect(byLabel(pl.form.labels.photo)).toBeDisabled();
    expect(screen.getByRole("button", { name: pl.form.chooseFile })).toBeDisabled();
    expect(submitButton()).toBeDisabled();
  });

  it("shows the error banner as an alert at the top of the form", () => {
    setup({ bannerError: pl.errors.processingBanner });
    expect(screen.getByRole("alert")).toHaveTextContent(pl.errors.processingBanner);
  });

  it("prefills defaultValues", () => {
    setup({ defaultValues: { caseType: "RETURN", modelName: "iPad Air" } });
    expect(screen.getByRole("radio", { name: "Zwrot" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: pl.form.labels.modelName })).toHaveValue("iPad Air");
  });
});
