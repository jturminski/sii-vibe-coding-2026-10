import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageDropzone, formatFileSize } from "@/components/case/image-dropzone";
import { pl } from "@/lib/i18n/pl";
import type { ErrorCode } from "@/lib/schemas";

// Real JPEG bytes stored under a .png name (AC-08: detection by content, not extension).
const LAPTOP_JPEG_AS_PNG = readFileSync(
  resolve(process.cwd(), "../assets/example-images/laptop-1.png"),
);

const jpegFile = (name = "laptop-1.png") => new File([LAPTOP_JPEG_AS_PNG], name, { type: "image/png" });

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  let n = 0;
  createObjectURL = vi.fn(() => `blob:preview-${++n}`);
  revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  cleanup();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

/** Controlled harness that stores what the dropzone reports, like the case form will. */
function Harness({ onChange }: { onChange?: (file: File | null, code?: ErrorCode) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<ErrorCode | undefined>();
  return (
    <ImageDropzone
      value={file}
      error={error ? pl.validation[error] : undefined}
      hint={pl.form.photoHint.COMPLAINT}
      onChange={(next, code) => {
        setFile(next);
        setError(code);
        onChange?.(next, code);
      }}
    />
  );
}

const fileInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="file"]')!;

const select = (container: HTMLElement, ...files: File[]) =>
  fireEvent.change(fileInput(container), { target: { files } });

describe("ImageDropzone (AC-08, AC-09, AC-10)", () => {
  it("renders the choose-file button, the hint and a hidden image-only input", () => {
    const { container } = render(<Harness />);

    expect(screen.getByRole("button", { name: pl.form.chooseFile })).toBeInTheDocument();
    expect(screen.getByText(pl.form.photoHint.COMPLAINT)).toBeInTheDocument();
    const input = fileInput(container);
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input).not.toHaveAttribute("multiple");
    expect(input).toHaveClass("sr-only");
  });

  it("accepts a JPEG named .png and shows the thumbnail, name, Polish size and Usuń", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    const file = jpegFile();

    select(container, file);

    const img = await screen.findByRole("img", { name: "laptop-1.png" });
    expect(img).toHaveAttribute("src", "blob:preview-1");
    expect(onChange).toHaveBeenLastCalledWith(file, undefined);
    expect(screen.getByText("laptop-1.png")).toBeInTheDocument();
    expect(screen.getByText(formatFileSize(file.size))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: pl.form.removeFile })).toBeInTheDocument();
  });

  it("rejects a text file named .jpg with the format error", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);

    select(container, new File(["to nie jest obraz"], "fake.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText(pl.validation.UNSUPPORTED_FORMAT)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(null, "UNSUPPORTED_FORMAT");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("rejects an 11 MB file with the size error before checking its content", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);

    // Not an image either: the size error must win because the size check runs first.
    select(container, new File([new Uint8Array(11 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText(pl.validation.FILE_TOO_LARGE)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(null, "FILE_TOO_LARGE");
  });

  it("replaces the first file with the second, keeps one preview and revokes the first URL", async () => {
    const { container } = render(<Harness />);

    select(container, jpegFile("first.png"));
    await screen.findByRole("img", { name: "first.png" });
    select(container, jpegFile("second.jpg"));
    await screen.findByRole("img", { name: "second.jpg" });

    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByText("first.png")).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(revokeObjectURL).not.toHaveBeenCalledWith(screen.getByRole("img").getAttribute("src"));
  });

  it("clears the file and revokes its URL when Usuń is clicked", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    select(container, jpegFile());
    const img = await screen.findByRole("img");
    const url = img.getAttribute("src");

    fireEvent.click(screen.getByRole("button", { name: pl.form.removeFile }));

    expect(onChange).toHaveBeenLastCalledWith(null, undefined);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: pl.form.removeFile })).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
    expect(fileInput(container).value).toBe("");
  });

  it("accepts a single dropped image", async () => {
    render(<Harness />);

    fireEvent.drop(screen.getByTestId("image-dropzone"), { dataTransfer: { files: [jpegFile()] } });

    expect(await screen.findByRole("img", { name: "laptop-1.png" })).toBeInTheDocument();
  });

  it("rejects several dropped files with the multiple-files error", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.drop(screen.getByTestId("image-dropzone"), {
      dataTransfer: { files: [jpegFile("a.png"), jpegFile("b.png")] },
    });

    expect(await screen.findByText(pl.validation.MULTIPLE_FILES)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(null, "MULTIPLE_FILES");
  });

  it("disables the controls and ignores drops when disabled", () => {
    const onChange = vi.fn();
    const { container } = render(<ImageDropzone value={null} onChange={onChange} disabled />);

    expect(screen.getByRole("button", { name: pl.form.chooseFile })).toBeDisabled();
    expect(fileInput(container)).toBeDisabled();
    fireEvent.drop(screen.getByTestId("image-dropzone"), { dataTransfer: { files: [jpegFile()] } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("formatFileSize", () => {
  it("uses Polish number formatting with KB below 1 MB and MB above", () => {
    expect(formatFileSize(512 * 1024)).toBe("512 KB");
    expect(formatFileSize(1_220_926)).toBe("1,2 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10 MB");
  });
});
