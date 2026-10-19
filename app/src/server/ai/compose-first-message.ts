import "server-only";
import { DECISION_STATUSES } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { Decision } from "@/lib/schemas";

const fm = pl.firstMessage;

/**
 * Deterministic first agent message (PRD AC-24, §11.6, §11.8; ADR-003 §3, A2).
 * Order: greeting → decision → summary → justification → next steps → questions (NEEDS_INFO only) → disclaimer → case ID.
 */
export function composeFirstMessage(caseId: string, decision: Decision): string {
  const justification = [
    decision.photoFindings.trim(),
    decision.appliedRules.map((rule) => `- **${rule.ref}** — ${rule.explanation}`).join("\n"),
  ].filter(Boolean);

  const blocks = [
    fm.greeting,
    `## ${fm.headings.decision}`,
    // Plain label: the model reads it as history; the UI swaps this exact line for the status badge (AC-24).
    DECISION_STATUSES[decision.status],
    decision.summary,
    `## ${fm.headings.justification}`,
    ...justification,
    `## ${fm.headings.nextSteps}`,
    decision.nextSteps.map((step) => `- ${step}`).join("\n"),
  ];

  if (decision.status === "NEEDS_INFO" && decision.questions.length > 0) {
    blocks.push(
      `## ${fm.headings.questions}`,
      decision.questions.map((question, index) => `${index + 1}. ${question}`).join("\n"),
    );
  }

  blocks.push(fm.disclaimer, `${fm.caseIdPrefix} ${caseId}`);
  return blocks.join("\n\n");
}
