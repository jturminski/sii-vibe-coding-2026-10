"use client";

import { useId } from "react";
import { DecisionBadge } from "@/components/case/decision-badge";
import { Spinner } from "@/components/ui/spinner";
import { pl } from "@/lib/i18n/pl";
import type { DecisionUpdateResult, HscUIMessage } from "@/lib/schemas";

type DecisionUpdateToolPart = Extract<HscUIMessage["parts"][number], { type: "tool-updateDecision" }>;

/** "Zaktualizowana decyzja" block (AC-30): new status, reason, applied clauses and the disclaimer. */
export function DecisionUpdateCard({ result }: { result: DecisionUpdateResult }) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border-l-4 border-primary bg-card p-4 text-card-foreground shadow-[0_0_10px_rgba(0,0,0,0.13)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-base font-semibold text-foreground">
          {pl.chat.updatedDecisionTitle}
        </h3>
        <DecisionBadge status={result.status} className="h-auto whitespace-normal" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">{pl.chat.decisionReason}</p>
        <p className="text-sm whitespace-pre-line text-foreground">{result.reason}</p>
      </div>
      {result.appliedRules.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{pl.chat.decisionRules}</p>
          <ul className="flex flex-col gap-1 text-sm text-foreground">
            {result.appliedRules.map((rule) => (
              <li key={rule.ref}>
                <span className="font-semibold">{rule.ref}</span> — <span>{rule.explanation}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
    </article>
  );
}

/** Renders a `tool-updateDecision` part by state (ADR-004 §3); `output-error` shows nothing. */
export function DecisionUpdatePart({ part }: { part: DecisionUpdateToolPart }) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" aria-label={undefined} role={undefined} />
          {pl.chat.updatingDecision}
        </p>
      );
    case "output-available":
      return <DecisionUpdateCard result={part.output} />;
    default:
      return null;
  }
}
