"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Controller, useForm, useWatch, type FieldError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleAlertIcon } from "lucide-react";
import { ImageDropzone } from "@/components/case/image-dropzone";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CASE_TYPES, CATEGORIES, LIMITS, todayInWarsaw, type CaseType, type Category } from "@/lib/domain";
import { pl, type ValidationErrorCode } from "@/lib/i18n/pl";
import {
  createCaseFormSchema,
  ERROR_CODES,
  type CaseForm as CaseFormValues,
  type CaseFormInput,
  type ErrorCode,
} from "@/lib/schemas";

const caseTypes = Object.entries(CASE_TYPES) as [CaseType, string][];
const categories = Object.entries(CATEGORIES) as [Category, string][];

/** The shared case schema plus the photo, which only the client holds as a `File` (AC-03). */
function createFormSchema(now: Date) {
  // An intersection keeps the shared schema's complaint-reason refinement; `safeExtend` drops it.
  return z.intersection(
    createCaseFormSchema(now),
    z.object({ image: z.custom<File>((value) => value instanceof File, { error: ERROR_CODES.REQUIRED }) }),
  );
}

type FormInput = z.input<ReturnType<typeof createFormSchema>>;
type FormOutput = z.output<ReturnType<typeof createFormSchema>>;

/** Field order of PRD §9.1, used to focus the first invalid field on submit. */
const FIELD_ORDER = ["caseType", "category", "modelName", "purchaseDate", "reason", "image"] as const;

export type CaseFormFieldName = (typeof FIELD_ORDER)[number];

/** Field codes from a 400 validation body (ADR-002 §4), shown inline like client errors. */
export type CaseFormServerErrors = Partial<Record<CaseFormFieldName, ErrorCode>>;

// "Today" depends on the clock, so it is read only on the client: the server snapshot is empty,
// which keeps the page prerenderable with Cache Components (the date `max` appears after hydration).
const noSubscription = () => () => {};
const readToday = () => todayInWarsaw(new Date());
const noToday = () => undefined;

/** Validates against a schema built at submit time, so "today" is never read during render. */
const resolver = (...args: Parameters<ReturnType<typeof zodResolver<FormInput, unknown, FormOutput>>>) =>
  zodResolver(createFormSchema(new Date()))(...args);

export type CaseFormDefaultValues = Partial<CaseFormInput> & { image?: File | null };

export type CaseFormProps = {
  defaultValues?: CaseFormDefaultValues;
  /** Disables every field and the submit button while a submission is processing (AC-11). */
  disabled: boolean;
  /** Already translated processing error shown at the top of the form (AC-34). */
  bannerError?: string;
  /** Server-side field codes (400); each new object is applied and focuses the first invalid field. */
  serverErrors?: CaseFormServerErrors;
  onSubmit: (values: CaseFormValues, file: File) => void;
};

/** Translated message for a field error whose `message` holds an error code. */
function errorText(error: FieldError | undefined): string | undefined {
  const code = error?.message;
  if (!code) return undefined;
  return code in pl.validation ? pl.validation[code as ValidationErrorCode] : pl.validation.REQUIRED;
}

const focusById = (id: string) => document.getElementById(id)?.focus();

function RequiredMark() {
  return (
    <span aria-hidden className="text-destructive">
      *
    </span>
  );
}

function FieldMessage({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {children}
    </p>
  );
}

/** Return/complaint form (PRD §9.1, AC-01–07, AC-11; ADR-004 "Case form"). */
export function CaseForm({ defaultValues, disabled, bannerError, serverErrors, onSubmit }: CaseFormProps) {
  const baseId = useId();
  const ids = (name: string) => ({ field: `${baseId}-${name}`, error: `${baseId}-${name}-error` });
  const today = useSyncExternalStore(noSubscription, readToday, noToday);

  const {
    control,
    register,
    handleSubmit,
    clearErrors,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver,
    mode: "onSubmit",
    reValidateMode: "onChange",
    // RHF focuses in registration order, which differs from the visual order; see `submit`.
    shouldFocusError: false,
    defaultValues: {
      caseType: undefined,
      category: undefined,
      modelName: "",
      purchaseDate: "",
      reason: "",
      image: null,
      ...defaultValues,
    } as FormInput,
  });

  const caseType = useWatch({ control, name: "caseType" }) as CaseType | undefined;
  const reasonLength = (useWatch({ control, name: "reason" }) ?? "").length;

  // A rejected photo selection keeps the held file (AC-10). Its error lives outside RHF's errors,
  // which the resolver replaces on every submit, and it blocks submitting: the customer tried to
  // replace the photo, so sending the old one would not be what they meant.
  const [photoRejection, setPhotoRejection] = useState<ErrorCode>();

  const focusFirstInvalid = (isInvalid: (name: (typeof FIELD_ORDER)[number]) => boolean) => {
    const first = FIELD_ORDER.find(isInvalid);
    if (first) setFocus(first);
  };

  useEffect(() => {
    if (!serverErrors) return;
    for (const name of FIELD_ORDER) {
      const code = serverErrors[name];
      if (code) setError(name, { type: "server", message: code });
    }
    const first = FIELD_ORDER.find((name) => serverErrors[name]);
    if (first) setFocus(first);
  }, [serverErrors, setError, setFocus]);

  const submit = handleSubmit(
    ({ image, ...values }) => {
      if (photoRejection) focusFirstInvalid((name) => name === "image");
      else onSubmit(values, image);
    },
    (invalid) => focusFirstInvalid((name) => Boolean(invalid[name]) || (name === "image" && Boolean(photoRejection))),
  );

  const caseTypeIds = ids("caseType");
  const categoryIds = ids("category");
  const modelIds = ids("modelName");
  const dateIds = ids("purchaseDate");
  const reasonIds = ids("reason");
  const imageIds = ids("image");
  const counterId = `${reasonIds.field}-counter`;

  const caseTypeError = errorText(errors.caseType);
  const categoryError = errorText(errors.category);
  const modelError = errorText(errors.modelName);
  const dateError = errorText(errors.purchaseDate);
  const reasonError = errorText(errors.reason);
  const imageError = photoRejection ? pl.validation[photoRejection] : errorText(errors.image);

  const describedBy = (error: string | undefined, errorId: string) => (error ? errorId : undefined);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      {bannerError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertDescription className="text-destructive">{bannerError}</AlertDescription>
        </Alert>
      ) : null}

      {/* 1. Case type: no default selection (§9.1). */}
      <fieldset className="flex flex-col gap-3">
        <legend id={caseTypeIds.field} className="mb-3 flex items-center gap-1 text-sm font-semibold">
          {pl.form.labels.caseType}
          <RequiredMark />
        </legend>
        <Controller
          control={control}
          name="caseType"
          render={({ field }) => (
            <RadioGroup
              aria-labelledby={caseTypeIds.field}
              aria-invalid={caseTypeError ? true : undefined}
              aria-describedby={describedBy(caseTypeError, caseTypeIds.error)}
              value={field.value ?? ""}
              onValueChange={(value) => field.onChange(value as CaseType)}
              disabled={disabled}
              className="flex flex-wrap gap-6"
            >
              {caseTypes.map(([value, label], index) => {
                const itemId = `${caseTypeIds.field}-${value}`;
                return (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem
                      id={itemId}
                      value={value}
                      ref={index === 0 ? field.ref : undefined}
                      onBlur={field.onBlur}
                      aria-invalid={caseTypeError ? true : undefined}
                    />
                    <Label htmlFor={itemId} className="font-normal">
                      {label}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        />
        <FieldMessage id={caseTypeIds.error}>{caseTypeError}</FieldMessage>
      </fieldset>

      {/* 2. Equipment category (AC-02). */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={categoryIds.field} className="gap-1 font-semibold">
          {pl.form.labels.category}
          <RequiredMark />
        </Label>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => field.onChange(value as Category)}
              disabled={disabled}
            >
              <SelectTrigger
                id={categoryIds.field}
                ref={field.ref}
                onBlur={field.onBlur}
                aria-invalid={categoryError ? true : undefined}
                aria-describedby={describedBy(categoryError, categoryIds.error)}
                className="w-full"
              >
                <SelectValue placeholder={pl.form.categoryPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {categories.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldMessage id={categoryIds.error}>{categoryError}</FieldMessage>
      </div>

      {/* 3. Model name. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={modelIds.field} className="gap-1 font-semibold">
          {pl.form.labels.modelName}
          <RequiredMark />
        </Label>
        <Input
          id={modelIds.field}
          type="text"
          placeholder={pl.form.modelPlaceholder}
          maxLength={LIMITS.MODEL_NAME_MAX}
          disabled={disabled}
          aria-invalid={modelError ? true : undefined}
          aria-describedby={describedBy(modelError, modelIds.error)}
          {...register("modelName")}
        />
        <FieldMessage id={modelIds.error}>{modelError}</FieldMessage>
      </div>

      {/* 4. Purchase date: max = today in Europe/Warsaw (AC-07). */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={dateIds.field} className="gap-1 font-semibold">
          {pl.form.labels.purchaseDate}
          <RequiredMark />
        </Label>
        <Input
          id={dateIds.field}
          type="date"
          max={today}
          disabled={disabled}
          aria-invalid={dateError ? true : undefined}
          aria-describedby={describedBy(dateError, dateIds.error)}
          className="w-full sm:w-56"
          {...register("purchaseDate")}
        />
        <FieldMessage id={dateIds.error}>{dateError}</FieldMessage>
      </div>

      {/* 5. Reason: label and requirement follow the case type (AC-04, AC-05, AC-06). */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={reasonIds.field} className="gap-1 font-semibold">
          {caseType ? pl.form.reasonLabel[caseType] : pl.form.reasonLabelDefault}
          {caseType === "COMPLAINT" ? <RequiredMark /> : null}
        </Label>
        <Textarea
          id={reasonIds.field}
          rows={5}
          maxLength={LIMITS.REASON_MAX}
          disabled={disabled}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={[reasonError ? reasonIds.error : null, counterId].filter(Boolean).join(" ")}
          {...register("reason")}
        />
        <div className="flex items-start justify-between gap-4">
          <FieldMessage id={reasonIds.error}>{reasonError}</FieldMessage>
          <span id={counterId} aria-live="polite" className="ml-auto text-sm text-muted-foreground tabular-nums">
            {`${reasonLength}/${LIMITS.REASON_MAX}`}
          </span>
        </div>
      </div>

      {/* 6. Photo: a single image, validated by the drop zone (AC-08–10). */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={imageIds.field} className="gap-1 font-semibold">
          {pl.form.labels.photo}
          <RequiredMark />
        </Label>
        <Controller
          control={control}
          name="image"
          render={({ field }) => (
            // The wrapper hands RHF a focus target: the drop zone's labelled file input.
            <div ref={(element) => field.ref(element ? { focus: () => focusById(imageIds.field) } : null)}>
              <ImageDropzone
                id={imageIds.field}
                value={field.value ?? null}
                disabled={disabled}
                hint={caseType ? pl.form.photoHint[caseType] : undefined}
                error={imageError}
                onChange={(file, code) => {
                  field.onChange(file);
                  setPhotoRejection(code);
                  if (!code) clearErrors("image");
                }}
              />
            </div>
          )}
        />
      </div>

      <Button type="submit" disabled={disabled} className="self-start">
        {pl.form.submit}
      </Button>
    </form>
  );
}

