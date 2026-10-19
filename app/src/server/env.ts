import "server-only";
import { z } from "zod";

// Empty strings in .env files mean "not set".
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  VISION_MODEL: optionalString,
  DECISION_MODEL: optionalString,
  POLICIES_DIR: optionalString.transform((v) => v ?? "../docs/policies"),
  CASE_TTL_MINUTES: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}. See app/.env.example.`);
  }
  return result.data;
}

export function resolveModelIds(env: Env): { vision: string; decision: string } {
  return {
    vision: env.VISION_MODEL ?? env.LLM_MODEL,
    decision: env.DECISION_MODEL ?? env.LLM_MODEL,
  };
}

let cached: Env | undefined;

/** Validated process env; throws on first use when required variables are missing. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
