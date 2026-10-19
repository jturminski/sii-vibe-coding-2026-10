"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import type { HscUIMessage } from "@/lib/schemas";

const timeFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  hour: "2-digit",
  minute: "2-digit",
});

/** Renders one message's parts (ADR-004 §3): markdown text; `data-case` only feeds the summary panel. */
export function MessageParts({ message }: { message: HscUIMessage }) {
  return message.parts.map((part, index) => {
    switch (part.type) {
      case "text":
        return <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>;
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
