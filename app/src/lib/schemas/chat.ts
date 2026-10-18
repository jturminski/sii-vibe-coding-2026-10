import { z } from "zod";
import { LIMITS } from "@/lib/domain";
import { ERROR_CODES } from "./error-codes";

const chatTextPartSchema = z.object({
  type: z.literal("text"),
  text: z
    .string({ error: ERROR_CODES.REQUIRED })
    .trim()
    .min(1, ERROR_CODES.REQUIRED)
    .max(LIMITS.CHAT_MESSAGE_MAX, ERROR_CODES.TOO_LONG),
});

/** Body of `POST /api/cases/{caseId}/chat`: only the newest user message (ADR-002 §4, PRD AC-28). */
export const chatRequestSchema = z.object({
  message: z.object({
    id: z.string().min(1),
    role: z.literal("user"),
    parts: z.tuple([chatTextPartSchema]),
    metadata: z.unknown().optional(),
  }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
