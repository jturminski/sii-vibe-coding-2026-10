"use client";

import { useState, useSyncExternalStore } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChevronDownIcon, CircleAlertIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { CaseSummaryPanel } from "@/components/case/case-summary-panel";
import { ChatInput } from "@/components/case/chat-input";
import { currentStatus } from "@/components/case/current-status";
import { MessageParts, MessageTimestamp } from "@/components/case/message-parts";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { LIMITS } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { CaseDataPart, HscUIMessage } from "@/lib/schemas";

type ChatScreenProps = {
  caseId: string;
  caseData: CaseDataPart;
  firstMessage: HscUIMessage;
  imagePreviewUrl: string;
  /** Starts a new case without confirmation; offered when the session expired (the case is gone). */
  onNewCase?: () => void;
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

/** Chat route error codes (ADR-002 §4); anything else is `UNKNOWN`. */
export type ChatErrorCode = "CASE_NOT_FOUND" | "MESSAGE_LIMIT" | "TURN_IN_PROGRESS" | "VALIDATION" | "UNKNOWN";

const KNOWN_CODES: readonly string[] = ["CASE_NOT_FOUND", "MESSAGE_LIMIT", "TURN_IN_PROGRESS", "VALIDATION"];

/** A non-2xx chat response with its error code; the message never reaches the UI (AC-36). */
export class ChatRequestError extends Error {
  constructor(readonly code: ChatErrorCode) {
    super(code);
    this.name = "ChatRequestError";
  }
}

/** Transport `fetch`: turns non-2xx responses into typed errors so the 404/409 bodies can be read. */
async function chatFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.ok) return response;
  let code: ChatErrorCode = "UNKNOWN";
  try {
    const body: unknown = await response.json();
    const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
    if (typeof error === "string" && KNOWN_CODES.includes(error)) code = error as ChatErrorCode;
  } catch {
    // Not JSON: keep UNKNOWN.
  }
  throw new ChatRequestError(code);
}

function createTransport(caseId: string) {
  return new DefaultChatTransport<HscUIMessage>({
    api: `/api/cases/${caseId}/chat`,
    fetch: chatFetch,
    // The server holds the history (ADR-000 D3): send only the newest message.
    prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages.at(-1) } }),
  });
}

/** Chat screen (PRD §9.2, ADR-004 §3): summary panel, conversation and the message input. */
export function ChatScreen({ caseId, caseData, firstMessage, imagePreviewUrl, onNewCase }: ChatScreenProps) {
  const isDesktop = useIsDesktop();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [transport] = useState(() => createTransport(caseId));
  const { messages, sendMessage, regenerate, status, error } = useChat<HscUIMessage>({
    id: caseId,
    messages: [firstMessage],
    transport,
  });

  const busy = status === "submitted" || status === "streaming";
  const errorCode: ChatErrorCode | undefined =
    error === undefined ? undefined : error instanceof ChatRequestError ? error.code : "UNKNOWN";
  const sessionExpired = errorCode === "CASE_NOT_FOUND";
  // Any other failure keeps the message and offers Ponów (AC-35).
  const failed = errorCode !== undefined && !sessionExpired && errorCode !== "MESSAGE_LIMIT";
  const userMessageCount = messages.filter((message) => message.role === "user").length;
  const limitReached = errorCode === "MESSAGE_LIMIT" || (!failed && userMessageCount >= LIMITS.MAX_USER_MESSAGES);
  const inputLocked = limitReached || sessionExpired;
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const caseStatus = currentStatus(messages, caseData.status);

  function handleSend(text: string) {
    void sendMessage({ text, metadata: { createdAt: Date.now() } });
  }

  return (
    <div
      data-testid="chat-screen"
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
          <CaseSummaryPanel caseData={caseData} imagePreviewUrl={imagePreviewUrl} status={caseStatus} />
        </CollapsibleContent>
      </Collapsible>

      <div className="flex min-w-0 flex-col gap-3">
        <Conversation
          aria-live="polite"
          aria-label={pl.chat.conversationLabel}
          className="min-h-[60vh] flex-1 rounded-xl border border-border bg-background lg:min-h-[calc(100vh-18rem)]"
        >
          <ConversationContent className="gap-6">
            {messages.map((message, index) => (
              <div key={message.id} className="contents">
                <Message from={message.role}>
                  <MessageContent className="text-base">
                    <MessageParts message={message} />
                  </MessageContent>
                  <MessageTimestamp message={message} />
                </Message>
                {failed && index === lastUserIndex ? (
                  <div role="alert" className="flex items-center justify-end gap-2 text-sm text-destructive">
                    <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
                    <span>{pl.errors.chatFailed}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void regenerate()}>
                      {pl.errors.retry}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-label={pl.chat.typing} />
                <span aria-hidden="true">{pl.chat.typing}</span>
              </div>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {inputLocked ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
            <p>{sessionExpired ? pl.errors.sessionExpired : pl.chat.limitReached}</p>
            {sessionExpired && onNewCase ? (
              <Button type="button" size="sm" onClick={onNewCase}>
                {pl.chat.newCase}
              </Button>
            ) : null}
          </div>
        ) : null}
        <ChatInput status={status} disabled={inputLocked} onSend={handleSend} />
      </div>
    </div>
  );
}
