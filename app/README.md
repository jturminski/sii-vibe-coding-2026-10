# Hardware Service Decision Copilot — App

Next.js 16 (App Router, TypeScript strict) app for the MVP described in [`../docs/PRD.md`](../docs/PRD.md). Architecture: [`../docs/ADR/`](../docs/ADR/).

## Getting started

1. Node.js ≥ 20.9 (developed on Node 24) and npm 11.
2. `npm ci`
3. `cp .env.example .env.local` and set `OPENROUTER_API_KEY` (and `LLM_MODEL` if different).
4. `npm run dev` → http://localhost:3000

Scripts and agent rules: see [`AGENTS.md`](AGENTS.md).

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
- [ ] API route / endpoint for chat (ADR-002)
- [x] Model configuration — env validation and model fallback in `src/server/env.ts`

### Design
- [ ] Design tokens (`../assets/design-tokens.json`) mapped into `src/app/globals.css`
- [x] Tailwind CSS 4 + shadcn/ui + AI Elements
- [ ] Logo and favicon (`../assets/`) — logo copied to `public/`, favicon still to apply
- [x] Design system doc (`../docs/design-guidelines.md`)

### Documentation
- [x] PRD (`../docs/PRD.md`)
- [x] ADRs (`../docs/ADR/`)
- [x] AGENTS.md in `app/` with stack-specific rules

## Notes

- Don't create config files manually if the boilerplate provides them — it leads to conflicts.
- Keep this folder organized: routes in `src/app`, components in `src/components`, shared code in `src/lib`, server-only code in `src/server`, tests in `tests/`.
