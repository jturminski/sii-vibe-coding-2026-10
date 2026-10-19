"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { CaseSummaryPanel } from "@/components/case/case-summary-panel";
import { MessageParts, MessageTimestamp } from "@/components/case/message-parts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart, HscUIMessage } from "@/lib/schemas";

type ChatScreenProps = {
  caseId: string;
  caseData: CaseDataPart;
  firstMessage: HscUIMessage;
  imagePreviewUrl: string;
};

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isDesktopSnapshot = () =>
  typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches;

/** ≥1024 px the panel is always shown in its own column (ADR-004 §3). */
function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, isDesktopSnapshot, () => false);
}

/** Read-only chat screen (PRD §9.2): summary panel and the conversation; the input arrives in T4.4. */
export function ChatScreen({ caseId, caseData, firstMessage, imagePreviewUrl }: ChatScreenProps) {
  const isDesktop = useIsDesktop();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const messages = [firstMessage];

  return (
    <div
      data-case-id={caseId}
      className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:py-6"
    >
      <Collapsible
        open={isDesktop || summaryOpen}
        onOpenChange={setSummaryOpen}
        className="rounded-xl border border-border bg-card lg:self-start"
      >
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden">
          {pl.panel.title}
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <h2 className="hidden px-4 pt-4 text-base font-semibold text-foreground lg:block">{pl.panel.title}</h2>
        <CollapsibleContent className="px-4 pb-4 lg:pt-3">
          <CaseSummaryPanel caseData={caseData} imagePreviewUrl={imagePreviewUrl} />
        </CollapsibleContent>
      </Collapsible>

      <Conversation
        aria-live="polite"
        aria-label={pl.chat.conversationLabel}
        className="min-h-[60vh] rounded-xl border border-border bg-background lg:min-h-[calc(100vh-12rem)]"
      >
        <ConversationContent className="gap-6">
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent className="text-base">
                <MessageParts message={message} />
              </MessageContent>
              <MessageTimestamp message={message} />
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
