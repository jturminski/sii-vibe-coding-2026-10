import { createUIMessageStreamResponse, type InferUIMessageChunk } from "ai";
import { LIMITS } from "@/lib/domain";
import { chatRequestSchema, type HscUIMessage } from "@/lib/schemas";
import { createChatStream } from "@/server/ai/create-chat-stream";
import { jsonError, logServerError, PROCESSING_FAILED } from "@/server/http/errors";
import { caseStore, type Case } from "@/server/store/case-store";

// No `export const runtime = 'nodejs'`: with `cacheComponents` enabled Next 16 rejects the `runtime`
// segment config and always uses Node.js (node_modules/next/dist/docs/.../route-segment-config/runtime.md).
export const maxDuration = 60;

type HscUIChunk = InferUIMessageChunk<HscUIMessage>;

/** What `onFinish` received; persisted only when the stream also ended without an error chunk. */
type TurnEnd = { messages: HscUIMessage[]; completed: boolean };

async function readChatRequest(request: Request): Promise<HscUIMessage | undefined> {
  try {
    const parsed = chatRequestSchema.safeParse(await request.json());
    return parsed.success ? (parsed.data.message as HscUIMessage) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Passes the chat chunks through and calls `settle` exactly once, after the stream has ended
 * (closed, errored or cancelled by the client), i.e. after `onFinish` has run. Every error chunk
 * is rewritten to `PROCESSING_FAILED` so no upstream message reaches the client (TAC-002-01).
 */
function settleAfterEnd(
  source: ReadableStream<HscUIChunk>,
  settle: (failed: boolean) => void,
): ReadableStream<HscUIChunk> {
  const reader = source.getReader();
  let failed = false;
  let settled = false;
  const end = () => {
    if (settled) return;
    settled = true;
    settle(failed);
  };

  return new ReadableStream<HscUIChunk>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          end();
          controller.close();
          return;
        }
        if (value.type === "error") {
          failed = true;
          controller.enqueue({ type: "error", errorText: PROCESSING_FAILED });
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        failed = true;
        end();
        logServerError({ code: PROCESSING_FAILED, cause: error });
        controller.enqueue({ type: "error", errorText: PROCESSING_FAILED });
        controller.close();
      }
    },
    async cancel(reason) {
      failed = true;
      end();
      await reader.cancel(reason);
    },
  });
}

/** A stream with only the `PROCESSING_FAILED` error chunk (the turn failed before streaming). */
function failedStream(): ReadableStream<HscUIChunk> {
  return new ReadableStream<HscUIChunk>({
    start(controller) {
      controller.enqueue({ type: "error", errorText: PROCESSING_FAILED });
      controller.close();
    },
  });
}

/**
 * `POST /api/cases/{caseId}/chat` (ADR-002 §5, §7, B3): one chat turn with turn bookkeeping.
 *
 * A message whose ID is already stored is a retry: the history is cut before it, and it is neither
 * appended twice nor counted again. `userMessageCount` is incremented in the store only when the turn
 * completes, but the prompt is built from a copy whose count already includes the new message, so
 * `userMessagesRemaining` tells the model how many messages the customer can still send after this one.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }): Promise<Response> {
  const { caseId } = await params;
  const signal = AbortSignal.any([AbortSignal.timeout(LIMITS.REQUEST_TIMEOUT_MS), request.signal]);

  const message = await readChatRequest(request);
  if (!message) return jsonError(400, { error: "VALIDATION" });

  const caseRecord = caseStore.get(caseId);
  if (!caseRecord) return jsonError(404, { error: "CASE_NOT_FOUND" });
  if (caseRecord.turnInProgress) return jsonError(409, { error: "TURN_IN_PROGRESS" });

  const retryIndex = caseRecord.messages.findIndex((stored) => stored.id === message.id);
  const isRetry = retryIndex !== -1;
  if (!isRetry && caseRecord.userMessageCount >= LIMITS.MAX_USER_MESSAGES) {
    return jsonError(409, { error: "MESSAGE_LIMIT" });
  }

  const snapshot = caseStore.snapshotStatus(caseId)!;
  caseRecord.turnInProgress = true;

  const turnCase: Case = {
    ...caseRecord,
    messages: isRetry ? caseRecord.messages.slice(0, retryIndex) : caseRecord.messages,
    userMessageCount: caseRecord.userMessageCount + (isRetry ? 0 : 1),
  };

  let turnEnd: TurnEnd | undefined;
  const settle = (failed: boolean) => {
    try {
      if (!failed && turnEnd?.completed) {
        const { messages } = turnEnd;
        caseStore.update(caseId, (c) => {
          c.messages = messages;
          if (isRetry) return;
          c.userMessageCount += 1;
          // AC-32 round count: every completed new turn whose reply leaves the case in NEEDS_INFO is one more
          // round, also when the model only asked again in text (it may not call updateDecision to repeat a
          // status). A turn where updateDecision changed the status was already counted by the tool
          // (NEEDS_INFO → +1, other status → 0), so it is not counted again here.
          const statusChangedThisTurn = c.statusHistory.length !== snapshot.statusHistory.length;
          if (!statusChangedThisTurn && c.currentStatus === "NEEDS_INFO") c.needsInfoRounds += 1;
        });
      } else {
        caseStore.restoreStatus(caseId, snapshot);
      }
    } finally {
      caseStore.update(caseId, (c) => {
        c.turnInProgress = false;
      });
    }
  };

  let stream: ReadableStream<HscUIChunk>;
  try {
    stream = await createChatStream({
      caseRecord: turnCase,
      message,
      signal,
      onFinish: ({ messages, outcome, isAborted }) => {
        turnEnd = { messages, completed: outcome.status === "completed" && !isAborted };
      },
    });
  } catch (error) {
    logServerError({ caseId, code: PROCESSING_FAILED, cause: error });
    settle(true);
    return createUIMessageStreamResponse({ stream: failedStream() });
  }

  return createUIMessageStreamResponse({ stream: settleAfterEnd(stream, settle) });
}
