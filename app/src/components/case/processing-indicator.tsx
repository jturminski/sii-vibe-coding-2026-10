import { Spinner } from "@/components/ui/spinner";
import { pl } from "@/lib/i18n/pl";
import type { StageDataPart } from "@/lib/schemas";

const STAGE_TEXT: Record<StageDataPart["stage"], string> = {
  analyzing: pl.processing.analyzingImage,
  deciding: pl.processing.preparingDecision,
};

/** Submission progress driven by the real `data-stage` parts (ADR-004 §3 "Processing indicator"). */
export function ProcessingIndicator({ stage }: { stage: StageDataPart["stage"] }) {
  return (
    <div aria-live="polite" className="flex items-center gap-3 text-sm font-medium text-foreground">
      {/* The text carries the meaning; the spinner's default English label and status role are dropped. */}
      <Spinner aria-hidden="true" role={undefined} aria-label={undefined} className="size-5 text-primary" />
      <span>{STAGE_TEXT[stage]}</span>
    </div>
  );
}
