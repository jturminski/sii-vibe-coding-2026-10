"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { DecisionBadge } from "@/components/case/decision-badge";
import { DecisionUpdatePart } from "@/components/case/decision-update-card";
import { DECISION_STATUSES, type DecisionStatus } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { HscUIMessage } from "@/lib/schemas";

const timeFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  hour: "2-digit",
  minute: "2-digit",
});

const fm = pl.firstMessage;
const FIRST_MESSAGE_HEAD = `${fm.greeting}\n\n## ${fm.headings.decision}`;

/**
 * Splits the composed first message around its status line (AC-24). The composer always starts with
 * the fixed greeting, the "Decyzja" heading and the plain status label, so only that exact prefix is
 * matched; model text further down (even with "##") is never inspected. No match → `undefined`.
 */
function splitFirstMessage(text: string, status: DecisionStatus) {
  const prefix = `${FIRST_MESSAGE_HEAD}\n\n${DECISION_STATUSES[status]}\n\n`;
  return text.startsWith(prefix) ? { head: FIRST_MESSAGE_HEAD, rest: text.slice(prefix.length) } : undefined;
}

/**
 * Renders one message's parts (ADR-004 §3): assistant text as markdown, customer text as typed,
 * `tool-updateDecision` as the decision card; `data-case` feeds the summary panel and, in the first
 * message, the initial status badge under "Decyzja" (later changes appear in update cards).
 */
export function MessageParts({ message }: { message: HscUIMessage }) {
  const initialStatus =
    message.role === "assistant" ? message.parts.find((part) => part.type === "data-case")?.data.status : undefined;

  return message.parts.map((part, index) => {
    const key = `${message.id}-${index}`;
    switch (part.type) {
      case "text": {
        if (message.role === "user") {
          return (
            <p key={key} className="whitespace-pre-wrap break-words">
              {part.text}
            </p>
          );
        }
        const split = initialStatus === undefined ? undefined : splitFirstMessage(part.text, initialStatus);
        if (split === undefined || initialStatus === undefined) {
          return <MessageResponse key={key}>{part.text}</MessageResponse>;
        }
        return (
          <div key={key} className="flex flex-col gap-3">
            <MessageResponse>{split.head}</MessageResponse>
            <div>
              <DecisionBadge status={initialStatus} />
            </div>
            <MessageResponse>{split.rest}</MessageResponse>
          </div>
        );
      }
      case "tool-updateDecision":
        return <DecisionUpdatePart key={key} part={part} />;
      default:
        return null;
    }
  });
}

/** Time the message was created, from `metadata.createdAt` (PRD §9.2). */
export function MessageTimestamp({ message }: { message: HscUIMessage }) {
  const createdAt = message.metadata?.createdAt;
  if (createdAt === undefined) return null;
  const date = new Date(createdAt);
  return (
    <time
      dateTime={date.toISOString()}
      className="text-xs text-muted-foreground group-[.is-user]:self-end"
    >
      {timeFormat.format(date)}
    </time>
  );
}
