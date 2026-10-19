import "server-only";
import {
  convertToModelMessages,
  generateId,
  isStepCount,
  streamText,
  toUIMessageStream,
  type InferUIMessageChunk,
  type UIMessageStreamOnEndCallback,
} from "ai";
import type { HscUIMessage } from "@/lib/schemas";
import { decisionModel } from "@/server/ai/models";
import { buildChatPrompt, PROMPT_VERSION } from "@/server/ai/prompts/chat";
import { createUpdateDecisionTool } from "@/server/ai/tools/update-decision";
import type { Case } from "@/server/store/case-store";

/** Up to 3 model calls per turn: tool call → text, plus one retry after a tool input error (ADR-003 A3). */
const MAX_STEPS = 3;

export interface CreateChatStreamInput {
  /** The stored case; `messages` is the history before this turn. */
  caseRecord: Case;
  /** The new user message, not yet in `caseRecord.messages`. */
  message: HscUIMessage;
  /** Request abort signal (60 s timeout and client disconnect). */
  signal: AbortSignal;
  /** Receives the full message list (history, the new message and the reply) when the stream ends. */
  onFinish: UIMessageStreamOnEndCallback<HscUIMessage>;
}

/**
 * One chat turn (ADR-003 §3 `createChatStream`, §7): streams the decision model's reply with the
 * `updateDecision` tool and returns the UI message stream (text and `tool-updateDecision` parts).
 */
export async function createChatStream({
  caseRecord,
  message,
  signal,
  onFinish,
}: CreateChatStreamInput): Promise<ReadableStream<InferUIMessageChunk<HscUIMessage>>> {
  const originalMessages = [...caseRecord.messages, message];
  const tools = { updateDecision: createUpdateDecisionTool(caseRecord.id) };
  const instructions = await buildChatPrompt({ caseRecord, now: new Date() });
  const messages = await convertToModelMessages(originalMessages, { tools });
  const model = decisionModel();

  const started = performance.now();
  let logged = false;
  const log = () => {
    if (logged) return;
    logged = true;
    console.info({
      caseId: caseRecord.id,
      step: "chat",
      promptVersion: PROMPT_VERSION,
      modelId: model.modelId,
      latencyMs: Math.round(performance.now() - started),
    });
  };

  const result = streamText({
    model,
    instructions,
    messages,
    tools,
    stopWhen: isStepCount(MAX_STEPS),
    providerOptions: { openrouter: { reasoning: { effort: "medium" } } },
    abortSignal: signal,
    onEnd: log,
    onAbort: log,
    onError: ({ error }) => {
      log();
      console.error({ caseId: caseRecord.id, step: "chat", error });
    },
  });

  return toUIMessageStream<typeof tools, HscUIMessage>({
    stream: result.stream,
    tools,
    originalMessages,
    generateMessageId: generateId,
    onEnd: onFinish,
  });
}
