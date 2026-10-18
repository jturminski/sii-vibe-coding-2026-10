"use client";

import { useId, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { fileTypeFromBlob } from "file-type";
import { ImageIcon, UploadIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { LIMITS } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import { ERROR_CODES, type ErrorCode } from "@/lib/schemas";

const ACCEPT = LIMITS.ALLOWED_IMAGE_MIME.join(",");
const KB = 1024;
const MB = 1024 * 1024;
const sizeFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });

/** File size in Polish formatting: KB below 1 MB, MB from 1 MB up (e.g. "512 KB", "1,2 MB"). */
export function formatFileSize(bytes: number): string {
  return bytes < MB
    ? `${sizeFormat.format(Math.max(1, Math.round(bytes / KB)))} KB`
    : `${sizeFormat.format(bytes / MB)} MB`;
}

/** Size check first (AC-09), then content sniffing (AC-08). */
async function validateImage(file: File): Promise<ErrorCode | undefined> {
  if (file.size > LIMITS.MAX_IMAGE_BYTES) return ERROR_CODES.FILE_TOO_LARGE;
  const type = await fileTypeFromBlob(file).catch(() => undefined);
  const allowed: readonly string[] = LIMITS.ALLOWED_IMAGE_MIME;
  return type && allowed.includes(type.mime) ? undefined : ERROR_CODES.UNSUPPORTED_FORMAT;
}

export type ImageDropzoneProps = {
  value: File | null;
  /** Called with the accepted file, or with `null` and an error code when the selection is rejected. */
  onChange: (file: File | null, errorCode?: ErrorCode) => void;
  /** Already translated error message shown under the drop area. */
  error?: string;
  disabled?: boolean;
  hint?: string;
  /** Id of the hidden file input, so a form label can point at it. */
  id?: string;
};

/** Single-image picker with a drop area, a preview and a remove action (PRD AC-08..AC-10, §9.1 item 6). */
export function ImageDropzone({ value, onChange, error, disabled, hint, id }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;

  // One object URL per held file, attached before paint; replacing or removing the file
  // revokes the previous URL (AC-10).
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!value || !img) return;
    const url = URL.createObjectURL(value);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFiles = async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    const [file] = list;
    if (!file) return;
    const request = ++requestRef.current;
    resetInput();
    if (list.length > 1) {
      onChange(null, ERROR_CODES.MULTIPLE_FILES);
      return;
    }
    const code = await validateImage(file);
    // Ignore a slower validation that finished after a newer selection.
    if (request !== requestRef.current) return;
    onChange(code ? null : file, code);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    void handleFiles(event.dataTransfer?.files);
  };

  const handleRemove = () => {
    requestRef.current++;
    resetInput();
    onChange(null, undefined);
  };

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="image-dropzone"
        data-dragover={dragOver || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/40 p-6 text-center transition-colors",
          dragOver && "border-primary bg-primary/10",
          error && "border-destructive",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => void handleFiles(event.target.files)}
        />

        {value ? (
          <div className="flex w-full items-center gap-4 text-left">
            {/* A blob: URL preview set via ref; it cannot go through next/image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              alt={value.name}
              className="size-20 shrink-0 rounded-lg border border-border bg-background object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium text-foreground">{value.name}</span>
              <span className="text-sm text-muted-foreground">{formatFileSize(value.size)}</span>
            </div>
            <Button type="button" variant="outline" onClick={handleRemove} disabled={disabled}>
              <XIcon data-icon="inline-start" aria-hidden />
              {pl.form.removeFile}
            </Button>
          </div>
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
        )}

        <Button
          type="button"
          variant={value ? "ghost" : "outline"}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-describedby={describedBy}
        >
          <UploadIcon data-icon="inline-start" aria-hidden />
          {pl.form.chooseFile}
        </Button>
      </div>

      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
