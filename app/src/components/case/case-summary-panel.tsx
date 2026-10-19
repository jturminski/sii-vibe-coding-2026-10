"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "cn";
import { DecisionBadge } from "@/components/case/decision-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CASE_TYPES, CATEGORIES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart } from "@/lib/schemas";

type CaseSummaryPanelProps = {
  caseData: CaseDataPart;
  imagePreviewUrl: string;
  className?: string;
};

/** `YYYY-MM-DD` → `dd.MM.yyyy`. */
function formatDate(dateYYYYMMDD: string): string {
  const [year, month, day] = dateYYYYMMDD.split("-");
  return year && month && day ? `${day}.${month}.${year}` : dateYYYYMMDD;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

/** Reason clamped to 3 lines; the toggle appears only when the text overflows. */
function Reason({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, expanded]);

  if (!text.trim()) return <span aria-hidden="true">—</span>;

  return (
    <>
      <p ref={ref} className={cn("whitespace-pre-line", !expanded && "line-clamp-3")}>
        {text}
      </p>
      {overflows || expanded ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? pl.panel.showLess : pl.panel.showMore}
        </Button>
      ) : null}
    </>
  );
}

/** Case summary (PRD §9.2, ADR-004 §3): case data, thumbnail with a full-size dialog and the decision badge. */
export function CaseSummaryPanel({ caseData, imagePreviewUrl, className }: CaseSummaryPanelProps) {
  return (
    <section aria-label={pl.panel.title} className={cn("flex flex-col gap-4", className)}>
      <dl className="flex flex-col gap-3">
        <Field label={pl.panel.status}>
          <DecisionBadge status={caseData.status} className="h-auto whitespace-normal" />
        </Field>
        <Field label={pl.panel.caseId}>
          <span className="font-mono">{caseData.caseId}</span>
        </Field>
        <Field label={pl.panel.caseType}>{CASE_TYPES[caseData.caseType]}</Field>
        <Field label={pl.panel.category}>{CATEGORIES[caseData.category]}</Field>
        <Field label={pl.panel.model}>{caseData.modelName}</Field>
        <Field label={pl.panel.purchaseDate}>{formatDate(caseData.purchaseDate)}</Field>
        <Field label={pl.panel.reason}>
          <Reason text={caseData.reason} />
        </Field>
        <Field label={pl.panel.photo}>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={pl.panel.openPhoto}
                className="block overflow-hidden rounded-lg border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- client object URL */}
                <img src={imagePreviewUrl} alt={pl.panel.photoAlt} className="h-24 w-32 object-cover" />
              </button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="sm:max-w-3xl">
              <DialogTitle>{pl.panel.photoDialogTitle}</DialogTitle>
              {/* eslint-disable-next-line @next/next/no-img-element -- client object URL */}
              <img
                src={imagePreviewUrl}
                alt={pl.panel.photoAlt}
                className="max-h-[75vh] w-full rounded-lg object-contain"
              />
              <DialogClose asChild>
                <Button type="button" variant="outline" className="justify-self-end">
                  {pl.panel.close}
                </Button>
              </DialogClose>
            </DialogContent>
          </Dialog>
        </Field>
      </dl>
    </section>
  );
}
