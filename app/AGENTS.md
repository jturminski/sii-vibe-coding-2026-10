<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# App agent rules — Hardware Service Decision Copilot

Specification: `../docs/PRD.md` and `../docs/ADR/` (start with `000-main-architecture.md`). Repo-wide workflow (TDD, manual QA, commits) is in `../AGENTS.md`.

## Commands (run from `app/`)

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 (needs `.env.local`) |
| `npm run typecheck` | `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint |
| `npm test` | Unit (jsdom) + integration (node) tests; no network — calls to openrouter.ai fail |
| `npm run test:eval` | Real-model eval suite (`tests/eval/**/*.eval.ts`), needs `OPENROUTER_API_KEY` |
| `npm run test:e2e` | Playwright against `npm run build && npm run start`, real OpenRouter |
| `npm run build` | Production build |

## Rules

- `src/server/**` is server-only: every entry module imports `server-only`; never import it from client components.
- Use AI SDK 7 APIs only: `generateText`/`streamText` with `output: Output.object(...)`, `instructions`, `stopWhen: isStepCount(n)`, `toUIMessageStream` + `createUIMessageStreamResponse`. Do not use `generateObject`, `streamObject`, `stepCountIs`, `toDataStreamResponse`. Check `/vercel/ai` in Context7 before using an API.
- Models come from `@openrouter/ai-sdk-provider` via the factory in `src/server/ai`; tests inject `MockLanguageModelV4` from `ai/test` through that factory, never by mocking modules.
- Derive LLM mocks from real captured responses stored in `tests/fixtures/llm/` (see `../AGENTS.md`).
- All UI text is Polish and lives in `src/lib/i18n/pl`; no Polish string literals in components.
- Shared Zod schemas live in `src/lib/schemas` and are used by both the form and the route handlers.
- UI: AI Elements in `src/components/ai-elements`, shadcn primitives in `src/components/ui` (Radix base, `cn` from the `cn` package). Add components with `npx shadcn@latest add @ai-elements/<name>` or `npx shadcn@latest add <name>`; the standalone `ai-elements` CLI is being deprecated.
- E2E image uploads use only `../assets/example-images/*` and follow that folder's README.
