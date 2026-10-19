# Hardware Service Decision Copilot — App

Next.js 16 (App Router, TypeScript strict) app for the MVP described in [`../docs/PRD.md`](../docs/PRD.md). Architecture: [`../docs/ADR/`](../docs/ADR/).

## Getting started

1. Node.js ≥ 20.9 (developed on Node 24) and npm 11.
2. `npm ci`
3. `cp .env.example .env.local` and set `OPENROUTER_API_KEY` (and `LLM_MODEL` if different).
4. `npm run dev` → http://localhost:3000

Scripts and agent rules: see [`AGENTS.md`](AGENTS.md).

## Running and testing

| Command | What it does | Network / cost |
|---|---|---|
| `npm run dev` | Dev server on http://localhost:3000 | Real OpenRouter calls when you submit a case or chat |
| `npm run build` then `npm run start` | Production build and server | As above |
| `npm run typecheck` | TypeScript, strict | None |
| `npm run lint` | ESLint | None |
| `npm test` | Unit + integration tests (Vitest); a network guard blocks real calls, LLM responses come from `tests/fixtures/llm/` | None |
| `npm run check:bundle` | After `build`: fails if `.next/static` contains the API key, `sk-or-` or server code | None |
| `npm run test:e2e` | Playwright E2E (desktop + mobile) against the real stack; starts the app on port 3000 | **Real LLM calls** (2 per submission, 1–2 per chat turn) |
| `npm run test:eval` | Real-model evals (`tests/eval/*.eval.ts`), each scenario must pass 3/3 | **Real LLM calls** (about 100 for the full suite) |
| `CAPTURE_FIXTURES=1 npx vitest run --config vitest.eval.config.ts tests/eval/capture-llm-fixtures.eval.ts` | Re-captures the LLM fixtures used by the mocks | **Real LLM calls** |

Notes:

- The E2E and eval suites need `.env.local` with a valid key. New OpenRouter accounts are limited to 20 requests per minute, so run them sequentially: `npm run test:e2e -- --workers=1` and `npm run test:eval -- --no-file-parallelism`.
- QA reports with screenshots and AC/TAC traceability: [`../docs/qa/phase-4/`](../docs/qa/phase-4/report.md), [`../docs/qa/phase-5/`](../docs/qa/phase-5/report.md), [`../docs/qa/final/`](../docs/qa/final/report.md).

## Course scaffolding checklist

Some items are provided by the boilerplate (`create-next-app` ships `tsconfig.json`, ESLint config). Others were added explicitly.

### Project setup
- [x] Choose framework — Next.js 16 App Router (ADR-000)
- [x] Initialize project — `create-next-app@16.4.2` (ADR-001)
- [x] TypeScript config (`tsconfig.json`, strict + `noUncheckedIndexedAccess`)
- [x] Package manager chosen — npm

### Code quality
- [x] ESLint config (`eslint.config.mjs`)
- [ ] Prettier config (`.prettierrc`, `.prettierignore`)
- [ ] `.editorconfig` (optional but recommended)

### Testing
- [x] Unit/integration test runner — Vitest (`vitest.config.ts`)
- [x] E2E test runner — Playwright (`playwright.config.ts`)
- [x] Test setup file (`tests/setup.ts` with Testing Library matchers and an OpenRouter network guard)

### Environment
- [x] `.env.example` with required env vars
- [ ] `.env.local` created locally (gitignored) — each developer adds their own OpenRouter key
- [x] `.gitignore` (node_modules, .env*, build output)

### AI integration
- [x] Vercel AI SDK (`ai` 7, `@ai-sdk/react` 4) + `@openrouter/ai-sdk-provider`
- [x] API routes: `POST /api/cases`, `POST /api/cases/[caseId]/chat`, `DELETE /api/cases/[caseId]` (ADR-002)
- [x] Model configuration — env validation and model fallback in `src/server/env.ts`

### Design
- [x] Design tokens mapped into `src/app/globals.css` (code10-design skill values, see `../docs/design-guidelines.md`)
- [x] Tailwind CSS 4 + shadcn/ui + AI Elements
- [x] Logo (`public/logo.png`) and favicon (`src/app/icon.png`)
- [x] Design system doc (`../docs/design-guidelines.md`)

### Documentation
- [x] PRD (`../docs/PRD.md`)
- [x] ADRs (`../docs/ADR/`)
- [x] AGENTS.md in `app/` with stack-specific rules

## Notes

- Don't create config files manually if the boilerplate provides them — it leads to conflicts.
- Keep this folder organized: routes in `src/app`, components in `src/components`, shared code in `src/lib`, server-only code in `src/server`, tests in `tests/`.
