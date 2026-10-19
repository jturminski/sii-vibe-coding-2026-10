"use client";

import { useState } from "react";
import type { ChatStatus } from "ai";
import { SendHorizontalIcon } from "lucide-react";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { LIMITS } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";

type ChatInputProps = {
  status: ChatStatus;
  /** Limit reached or session expired: nothing can be typed or sent. */
  disabled?: boolean;
  onSend: (text: string) => void;
};

/**
 * Message input (AC-28, AC-29): up to 2000 characters with a counter, Enter sends,
 * Shift+Enter adds a newline, whitespace-only is blocked, send is disabled while the agent replies.
 */
export function ChatInput({ status, disabled = false, onSend }: ChatInputProps) {
  const [text, setText] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const canSend = !disabled && !busy && text.trim().length > 0;

  function handleSubmit({ text: submitted }: PromptInputMessage) {
    const trimmed = submitted.trim();
    if (!canSend || !trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <PromptInput
      onSubmit={handleSubmit}
      data-locked={disabled}
      // InputGroup greys out when any child is disabled; only the locked input (limit, expired) should.
      className="bg-background [&_[data-slot=input-group]]:has-disabled:bg-transparent [&_[data-slot=input-group]]:has-disabled:opacity-100 data-[locked=true]:[&_[data-slot=input-group]]:bg-input/50! data-[locked=true]:[&_[data-slot=input-group]]:opacity-50!"
    >
      <PromptInputTextarea
        aria-label={pl.chat.inputLabel}
        placeholder={pl.chat.inputPlaceholder}
        maxLength={LIMITS.CHAT_MESSAGE_MAX}
        disabled={disabled}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        className="text-base"
      />
      <PromptInputFooter>
        <output aria-label={pl.chat.charCount} className="px-1 text-xs text-muted-foreground tabular-nums">
          {text.length}/{LIMITS.CHAT_MESSAGE_MAX}
        </output>
        <PromptInputSubmit status={status} aria-label={pl.chat.send} disabled={!canSend}>
          <SendHorizontalIcon aria-hidden="true" className="size-4" />
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
  );
}
