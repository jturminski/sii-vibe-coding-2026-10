"use client";

import { useEffect, useReducer } from "react";
import { CaseForm } from "@/components/case/case-form";
import { ProcessingIndicator } from "@/components/case/processing-indicator";
import { ProcessingFailed, submitCase, type SubmissionFieldErrors } from "@/components/case/submit-case";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart, CaseForm as CaseFormValues, HscUIMessage, StageDataPart } from "@/lib/schemas";

/** Form values plus the photo, kept across FAIL so nothing has to be re-entered (AC-34). */
export type CaseDraft = { values: CaseFormValues; file: File };

type Stage = StageDataPart["stage"];

export type CaseAppState =
  | { status: "form"; draft?: CaseDraft; bannerError?: string; serverErrors?: SubmissionFieldErrors }
  | { status: "submitting"; draft: CaseDraft; stage: Stage }
  | {
      status: "chat";
      caseId: string;
      caseData: CaseDataPart;
      firstMessage: HscUIMessage;
      imagePreviewUrl: string;
    };

export type CaseAppAction =
  | { type: "SUBMIT"; draft: CaseDraft }
  | { type: "STAGE"; stage: Stage }
  | {
      type: "SUCCESS";
      caseId: string;
      caseData: CaseDataPart;
      firstMessage: HscUIMessage;
      imagePreviewUrl: string;
    }
  /** Back to the form: a processing failure sets the banner, a 400 sets the inline field codes. */
  | { type: "FAIL"; bannerError?: string; serverErrors?: SubmissionFieldErrors }
  | { type: "NEW_CASE" };

/** ADR-004 §7 state machine: form → submitting → chat, FAIL back to form with the draft, NEW_CASE resets. */
export function caseAppReducer(state: CaseAppState, action: CaseAppAction): CaseAppState {
  switch (action.type) {
    case "SUBMIT":
      return state.status === "form" ? { status: "submitting", draft: action.draft, stage: "analyzing" } : state;
    case "STAGE":
      return state.status === "submitting" ? { ...state, stage: action.stage } : state;
    case "SUCCESS": {
      if (state.status !== "submitting") return state;
      const { type: _type, ...chat } = action;
      return { status: "chat", ...chat };
    }
    case "FAIL":
      return state.status === "submitting"
        ? { status: "form", draft: state.draft, bannerError: action.bannerError, serverErrors: action.serverErrors }
        : state;
    case "NEW_CASE":
      return { status: "form" };
  }
}

/** The single page: case form, processing, then chat (ADR-004 §3, F3). */
export function CaseApp() {
  const [state, dispatch] = useReducer(caseAppReducer, { status: "form" });

  // Revoke the preview URL once the chat it belongs to is left (NEW_CASE).
  const imagePreviewUrl = state.status === "chat" ? state.imagePreviewUrl : undefined;
  useEffect(() => {
    if (!imagePreviewUrl) return;
    return () => URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  async function handleSubmit(values: CaseFormValues, file: File) {
    dispatch({ type: "SUBMIT", draft: { values, file } });
    try {
      const result = await submitCase(values, file, { onStage: (stage) => dispatch({ type: "STAGE", stage }) });
      if (result.kind === "validation") {
        dispatch({ type: "FAIL", serverErrors: result.fields });
        return;
      }
      dispatch({
        type: "SUCCESS",
        caseId: result.caseId,
        caseData: result.caseData,
        firstMessage: result.message,
        imagePreviewUrl: URL.createObjectURL(file),
      });
    } catch (error) {
      if (!(error instanceof ProcessingFailed)) console.error(error);
      dispatch({ type: "FAIL", bannerError: pl.errors.processingBanner });
    }
  }

  if (state.status === "chat") {
    // Temporary: T4.3 replaces this with ChatScreen.
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
        <div data-testid="chat-placeholder" />
      </main>
    );
  }

  const submitting = state.status === "submitting";
  const draft = state.draft;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <p className="text-base text-muted-foreground">{pl.form.intro}</p>
      <CaseForm
        defaultValues={draft ? { ...draft.values, image: draft.file } : undefined}
        disabled={submitting}
        bannerError={state.status === "form" ? state.bannerError : undefined}
        serverErrors={state.status === "form" ? state.serverErrors : undefined}
        onSubmit={handleSubmit}
      />
      {submitting ? <ProcessingIndicator stage={state.stage} /> : null}
    </main>
  );
}
