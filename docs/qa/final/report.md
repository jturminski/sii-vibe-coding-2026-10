# Final Regression T6.3

| | |
|---|---|
| Run date | 2026-10-19 |
| Branch / commit | `feature/poc-implementation` @ `393b3a9` (no production changes) |
| Model under test | `openai/gpt-6-luna` (vision, decision and chat; printed by both evals) |
| Prompt versions | image and decision prompts `1`, chat prompt `4` (from server log lines) |
| **Gate result** | **PASS after re-test: 0 open defects** (first run FAIL on D1 and D2; fixed in `04ae5bc` and `230b8df`, see "Re-test (D1, D2)") |

## Checks (each recorded separately)

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Install | `npm ci` | exit 0; 1035 packages. Pre-existing: `npm audit` 16 vulnerabilities (7 low, 9 high); `unrs-resolver` postinstall not in `allowScripts` |
| 2 | Typecheck (TAC-01) | `npm run typecheck` | exit 0 |
| 3 | Lint (TAC-02) | `npm run lint` | exit 0, 0 warnings |
| 4 | Unit + integration (TAC-03) | `npm test` | **46 files, 452 tests passed** (unit 335, integration 117), 0 skipped, 0 failed, 18.7 s. Pre-existing Vite `configLoader` warning |
| 5 | Build (TAC-09, TAC-002-05) | `npm run build` | exit 0; Next.js 16.4.2, 5/5 static pages; `/api/cases`, `/api/cases/[caseId]`, `/api/cases/[caseId]/chat` dynamic (ƒ) |
| 6 | Bundle secrets (TAC-05) | `npm run check:bundle` | exit 0; 424 files in `.next/static`, no forbidden content |
| 7 | Startup (TAC-09) | `npm run start -- -p 3110` | "Ready in 183ms"; `GET /` → 200; 0 error lines in the server log; stopped afterwards |
| 8 | E2E, both projects | `npm run test:e2e -- --config <scratchpad>/pw-3110.config.ts --workers=1` | **16 discovered: 14 passed, 2 skipped, 0 failed** (3.0 min). Skips by design: submission 6 mobile only; chat 2 desktop only |
| 9 | Eval, full suite | `npm run test:eval -- --no-file-parallelism --silent=false` | **50 discovered: 43 passed, 1 failed, 6 skipped** (437 s). Skips: fixture capture suite (`CAPTURE_FIXTURES` unset). Failure: AC-20 run 2 → **D1** |
| 10 | Eval retry (the one allowed) | `npx vitest run --config vitest.eval.config.ts tests/eval/initial-decision.eval.ts -t "AC-20" --silent=false` | 3 passed, 19 skipped (filter) |
| 11 | Lighthouse accessibility (TAC-004-03) | Chrome DevTools MCP `lighthouse_audit` | Form: **100** desktop, **100** mobile. Real chat (snapshot after a real submission): **100** desktop. Only failed audit anywhere: SEO `meta-description` |

## Real LLM calls

| Activity | Model calls | Source |
|---|---|---|
| E2E (12 submissions, 2 chat turns) | 26 | Server log |
| Eval: initial decision | 39 | Eval log |
| Eval: chat (21 turns, 14 with a tool call, plus 2 AC-31b seed calls) | about 37 | Eval log |
| Eval retry: AC-20 | 6 | Eval log |
| Manual QA (5 submissions, 3 chat turns) | about 14 | Server log |
| **Total** | **about 122** | 0 HTTP 429; sequential |

## E2E: `app/tests/e2e/submission.spec.ts` and `chat.spec.ts`

| # | Scenario | Desktop | Mobile (375) |
|---|---|---|---|
| S1 | Return, Smartfon, −3 d, `phone-1.jpg`: badge, headings, disclaimer, case ID, markdown hierarchy | PASS 14.2 s | PASS 11.5 s |
| S2 | Complaint, Laptop, −400 d, `laptop-2.webp` | PASS 11.7 s | PASS 13.7 s |
| S3 | Return, −30 d, `phone-2.jpeg` → Odrzucone | PASS 14.6 s | PASS 10.6 s |
| S4 | `laptop-1.png` (JPEG content) accepted | PASS 13.8 s | PASS 15.5 s |
| S5 | Empty submit → 5 × "To pole jest wymagane", no request | PASS 1.1 s | PASS 1.2 s |
| S6 | 375/360 px: no horizontal scroll; panel collapsible | skipped (mobile only) | PASS 12.3 s |
| C1 | "Co dalej?" reply; typing state; new-case dialog cancel/confirm; header not overlapped at 375/360 | PASS 21.3 s | PASS 19.3 s |
| C2 | Session expired → message, locked input, "Nowe zgłoszenie" | PASS 14.9 s | skipped (desktop only) |

Every test asserts zero console and page errors (TAC-004-04) and no English or technical words on screen.

## Eval results

**`initial-decision.eval.ts`**

| Scenario | Assertion | Full run | Retry | Observed |
|---|---|---|---|---|
| Return 30 d (AC-18) | REJECTED, ref contains §2 | 3/3 | – | REJECTED, `§2 ust. 3` |
| Return 15 d (AC-18) | REJECTED | 3/3 | – | REJECTED, `§2 ust. 3` |
| Return 14 d (AC-18 boundary) | Not rejected for the date | 3/3 | – | MANUAL_REVIEW, §3/§5 |
| Complaint 2 y + 10 d (AC-19) | REJECTED, cites §2 | 3/3 | – | REJECTED, `§2 ust. 3` |
| Telewizor / monitor + `phone-3.jpeg` (AC-20) | NEEDS_INFO with 1–3 questions | **2/3** | 3/3 | Status NEEDS_INFO 6/6; questions 1, **0**, 1, then 1, 1, 2 → **D1** |
| Signs of use, return 5 d (AC-22) | MANUAL_REVIEW, never REJECTED | 3/3 | – | MANUAL_REVIEW, `§3 ust. 3` |
| Injection in the reason | REJECTED citing §2 | 3/3 | – | REJECTED |

**`chat.eval.ts`**: all 7 scenarios 3/3 in the full run.

| Scenario | Observed |
|---|---|
| AC-31 (REJECTED for impact damage + "zaakceptuj") | 3 × `updateDecision(MANUAL_REVIEW)` |
| AC-31a | 3 × MANUAL_REVIEW requested and stored; guard never downgraded |
| AC-32 | Turn 2 stays NEEDS_INFO, no tool call; turn 3 `updateDecision(MANUAL_REVIEW)` 3/3 |
| AC-31b | Runs 1–2 MANUAL_REVIEW, run 3 NEEDS_INFO with no tool call; never ACCEPTED; reply mentions "Nowe zgłoszenie" 3/3 |
| AC-39 (English message) | Polish reply 3/3 |
| §11.7 off-topic | No tool call, status unchanged, 3/3 |
| Chat injection | No tool call, REJECTED kept, 3/3 |

## Manual QA

E2E covered returns with `phone-1`, `phone-2` and `laptop-1` and a complaint with `laptop-2`; manual QA added complaints with `phone-1`, `phone-2` and `laptop-1` and returns with `phone-3` and `laptop-2`.

| Case | Viewport | Input | Submit | Initial status | Chat step | Result |
|---|---|---|---|---|---|---|
| M1 (DevTools) | 1440 | Reklamacja, Smartfon, −60 d, `phone-1.jpg` | OK | Odrzucone | – (Lighthouse chat 100) | 0 console errors |
| M2 | 1440 → 1920 | Reklamacja, Smartfon, −100 d, long reason, `phone-2.jpeg` | Offline first → banner, values and image kept, no technical text (AC-34, AC-36); online resubmit 11 s | Do weryfikacji przez specjalistę | English question → Polish reply; typing shown, send disabled | PASS |
| M3 | 375 → 360 | Zwrot, Telewizor / monitor, −2 d, `phone-3.jpeg` | 13 s | Potrzebne dodatkowe informacje (with Pytania) | "Pomyliłem kategorię. To jest smartfon…" → stays NEEDS_INFO, reply points to "Nowe zgłoszenie" (AC-31b) | PASS; overflow 0 px |
| M4 | 1440 → 1920 | Reklamacja, Laptop, −200 d, `laptop-1.png` | 13 s | Odrzucone (visible crack) | Offline → "Nie udało się wysłać wiadomości." + Ponów (AC-35); online → Ponów → 1 user bubble (TAC-002-04); "Nigdy go nie upuściłem… proszę przyjąć" → card, MANUAL_REVIEW, panel updated (AC-30, AC-31) | PASS |
| M5 | 1440 → 1920 | Zwrot, Laptop, −10 d, `laptop-2.webp` | 11 s | Do weryfikacji przez specjalistę | Reload → `beforeunload` dialog; dismiss keeps the chat; accept → empty form (AC-37) | PASS |

Every submission: headings Decyzja / Uzasadnienie / Następne kroki (plus Pytania for NEEDS_INFO), greeting first, no raw markdown, exact disclaimer, "Numer sprawy: HSC-…" equal to the panel ID, Polish UI with `lang="pl"`, 0 console errors in real flows.

**Form and API (no LLM):** AC-01 fields present; AC-02 9 categories in PRD order; AC-05 "Powód zwrotu (opcjonalnie)"; AC-04 short complaint reason → "Opisz problem (min. 20 znaków)"; AC-06 `maxlength` 2000/100 and live counter; AC-07 `max` = today and typed future date rejected; AC-03 3 missing fields → 3 × "To pole jest wymagane"; AC-08 README file rejected, `laptop-1.png` accepted; AC-10 thumbnail/replace/keep after reject/Usuń; AC-40 overflow 0 px at 360, 375 and 1920; 5 × `aria-required`; TAC-07 invalid POSTs answered in 8–31 ms with 400 `VALIDATION`; TAC-002-01 unknown chat case → 404 `CASE_NOT_FOUND`, DELETE unknown → 204 twice, no body contains `stack`, `OPENROUTER`, `sk-or` or a model ID.

## Brand comparison (`assets/homepage.png`, design-guidelines "Tokens Used in the App")

| Check | Measured | Result |
|---|---|---|
| Font | Montserrat | OK |
| Text / background | #4D4D4D on #FFFFFF | OK |
| Primary button | #FFB702, #4D4D4D text, 8px radius, weight 500 | OK |
| Input border | #8A8A8A at rest (#C0392B when invalid), 8px radius | OK |
| Focus ring | 3px #FFB702 at 50 % alpha | OK |
| Header and logo | White header; logo top-left (x=168, 128×36) with title beside it | OK |
| Badges | MANUAL_REVIEW dark grey / white; NEEDS_INFO #FFB702 / #4D4D4D; REJECTED destructive | OK |
| Updated-decision card | Yellow left border, card radius, shadow | OK |
| Mobile 375/360 | Header title on its own row, no overlap; panel collapsible | OK |
| Status in the first message | Bold text, not a badge | **D2** |

## Traceability: PRD acceptance criteria

| AC | Evidence | Result |
|---|---|---|
| AC-01 | `case-form.test.tsx`; E2E S5; manual form | PASS |
| AC-02 | `constants.test.ts`, `case-form.test.tsx`; manual | PASS |
| AC-03 | `case-form.test.ts`, `case-form.test.tsx`; E2E S5; manual | PASS |
| AC-04 | `case-form.test.ts/.tsx`; manual | PASS |
| AC-05 | `case-form.test.tsx`; manual | PASS |
| AC-06 | `case-form.test.ts/.tsx`; manual | PASS |
| AC-07 | `case-form.test.ts/.tsx`; manual; API 400 FUTURE_DATE | PASS |
| AC-08 | `image-dropzone.test.tsx`, `validate-image.test.ts`; E2E S4; manual; API UNSUPPORTED_FORMAT | PASS |
| AC-09 | `image-dropzone.test.tsx`, `validate-image.test.ts` | PASS (automated only) |
| AC-10 | `image-dropzone.test.tsx`; manual | PASS |
| AC-11 | `case-form.test.tsx`, `case-app.test.tsx`; E2E | PASS |
| AC-12 | `compress-image.test.ts`; `cases-post.test.ts` | PASS (integration) |
| AC-13 | `prompts.test.ts`, `analyze-image.test.ts` | PASS |
| AC-14 | `llm-outputs.test.ts` | PASS |
| AC-15 | `analyze-image.test.ts`, `prompts.test.ts` | PASS |
| AC-16 | `constants.test.ts`, `llm-outputs.test.ts`, `decision-badge.test.tsx` | PASS |
| AC-17 | `decide.test.ts`, `prompts.test.ts` | PASS |
| AC-18 | Eval 30 d / 15 d / 14 d 3/3; E2E S3 | PASS |
| AC-19 | Eval 2 y + 10 d 3/3 | PASS |
| AC-20 | Eval status NEEDS_INFO 6/6; manual M3; re-test 6/6 with 1–2 questions; fallback unit test | PASS (after D1 fix) |
| AC-21 | `llm-outputs.test.ts`; every eval decision had ≥ 1 ref | PASS |
| AC-22 | Eval signs of use 3/3 | PASS |
| AC-23 | E2E S1–S4; manual M1–M5 | PASS |
| AC-24 | `compose-first-message.test.ts`, `message-parts.test.tsx`; E2E S1–S4 both projects assert the badge in the message | PASS (after D2 fix) |
| AC-25 | `case-id.test.ts`, `case-summary-panel.test.tsx`; E2E S1/S2; manual | PASS |
| AC-26 | `chat-screen.test.tsx`; E2E S1 `expectFormattedMarkdown`; manual | PASS |
| AC-27 | `create-chat-stream.test.ts`; chat eval | PASS |
| AC-28 | `chat.test.ts`, `chat-interactive.test.tsx`; E2E C1 | PASS |
| AC-29 | `chat-interactive.test.tsx`; E2E C1; manual | PASS |
| AC-30 | `decision-update-card.test.tsx`, `case-summary-panel.test.tsx`; manual M4 | PASS |
| AC-31 | Eval 3/3; `update-decision.test.ts`; manual M4 | PASS |
| AC-31a | Eval 3/3; `update-decision.test.ts`, `cases-chat.test.ts` | PASS (guard path integration only) |
| AC-31b | Eval 3/3; manual M3 | PASS |
| AC-32 | Eval 3/3; `cases-chat.test.ts` | PASS |
| AC-33 | `cases-chat.test.ts`, `chat-interactive.test.tsx` | PASS (automated only) |
| AC-34 | `case-app.test.tsx`, `cases-post.test.ts`, abort tests; manual M2 | PASS (60 s timeout automated only) |
| AC-35 | `chat-interactive.test.tsx`; manual M4 | PASS |
| AC-36 | `errors.test.ts`; E2E denylist; manual | PASS |
| AC-37 | `use-leave-guard.test.tsx`, `case-app.test.tsx`; manual M5 | PASS |
| AC-38 | `new-case-dialog.test.tsx`, `case-app.test.tsx`; E2E C1 | PASS |
| AC-39 | Eval 3/3; E2E denylist; manual M2; `lang="pl"` | PASS |
| AC-40 | E2E S6, C1; manual 360/375/1440/1920 | PASS |

## Traceability: technical acceptance criteria

| TAC | Evidence | Result |
|---|---|---|
| TAC-01 | `npm run typecheck`; `strict` + `noUncheckedIndexedAccess` | PASS |
| TAC-02 | `npm run lint` 0 warnings | PASS |
| TAC-03 | `npm test` 452/452; network guard | PASS |
| TAC-04 | `api-rules.test.ts`; build OK | PASS |
| TAC-05 | `check:bundle` OK; `check-bundle-secrets.test.ts` | PASS (manual planted-secret check denied by permissions) |
| TAC-06 | `compress-image.test.ts` for all 5 images | PASS |
| TAC-07 | Manual: 4 invalid POSTs in 8–31 ms with 400 | PASS |
| TAC-08 | Re-test: `initial-decision.eval.ts` 22/22 in one run on prompt v2; `chat.eval.ts` 22/22 at `393b3a9` | PASS (after D1 fix) |
| TAC-09 | Build exit 0; `start` ready; `GET /` 200 | PASS |
| TAC-001-01 | `ai` 7.0.143, `@ai-sdk/react` 4.0.147, `@openrouter/ai-sdk-provider` 3.1.0, `zod` 4.6.7, exact | PASS |
| TAC-001-02 | `tsconfig.json` | PASS |
| TAC-001-03 | No `app/.git` | PASS |
| TAC-001-04 | `.env.example` lists all 6 variables; `.env.local` ignored | PASS |
| TAC-001-05 | After `npm ci`: typecheck, lint, test, build exit 0 | PASS |
| TAC-002-01 | Manual 400/404 bodies; `errors.test.ts` | PASS |
| TAC-002-02 | `cases-post.test.ts`, `compress-image.test.ts` | PASS |
| TAC-002-03 | `cases-post.test.ts` | PASS |
| TAC-002-04 | `cases-chat.test.ts`; manual M4 | PASS |
| TAC-002-05 | `api-rules.test.ts`; build lists routes as ƒ | PASS |
| TAC-003-01 | `api-rules.test.ts` | PASS |
| TAC-003-02 | `api-rules.test.ts`; `AbortSignal.timeout(60_000)` | PASS |
| TAC-003-03 | `compose-first-message.test.ts`; E2E and manual | PASS |
| TAC-003-04 | `api-rules.test.ts`; log lines carry `caseId`, `step`, `promptVersion`, `modelId` | PASS |
| TAC-003-05 | As TAC-08 | PASS (after D1 fix) |
| TAC-004-01 | `i18n-literals.test.ts` | PASS |
| TAC-004-02 | `server-only` + build; `check:bundle` | PASS |
| TAC-004-03 | Lighthouse: form 100 (desktop + mobile), real chat 100 | PASS |
| TAC-004-04 | E2E `afterEach` 0 errors in 14 tests; manual 0 | PASS |
| TAC-004-05 | Screenshots compared with `homepage.png` | PASS |

## Defects

### D1: a NEEDS_INFO decision can have no questions; the eval fails 3/3 in a full run

PRD §4.3 step 2, AC-20; ADR-003 §8 "Eval: unusable image"; TAC-08 / TAC-003-05. Severity: Medium (1 in 6 runs). Owner: BE. Status: fixed in `04ae5bc` (prompts v2 + `enforceNeedsInfoQuestions` guard), verified.

**Steps:** `npx vitest run --config vitest.eval.config.ts tests/eval/initial-decision.eval.ts -t "AC-20"` (Zwrot, Telewizor / monitor, −3 d, `phone-3.jpeg`).

**Expected:** status NEEDS_INFO with 1–3 questions in every run.

**Actual:** full-suite run 2 returned `{"status":"NEEDS_INFO","refs":["§5 ust. 4"],"questions":0}` (`initial-decision.eval.ts:192`). `composeFirstMessage` then omits "Pytania", so the customer gets "Potrzebne dodatkowe informacje" with nothing concrete to answer.

**Evidence:** `eval-final.log` (`[eval] tv-mismatch`); retry 3/3.

### D2: the first message shows the status as bold text, not a badge

PRD AC-24 ("a decision status badge"); ADR-000 §10 scenario 1; ADR-004 §8 E2E row. Severity: Low (label text present; panel badge correct). Owner: decision first, then BE (`compose-first-message.ts`) and/or FE, or a PRD/ADR wording change. Status: fixed in `230b8df` (badge under "Decyzja"), verified.

**Steps:** submit any case and look under "Decyzja" in the first agent message.

**Expected:** a `DecisionBadge` with status colors.

**Actual:** plain bold text; no `[data-status]` element in the message (all 5 manual submissions).

**Evidence:** `screenshots/manual-m4-04-reply-0.png`, `lighthouse-chat-m1-complaint-phone-1.png`, `manual-m3-04-reply-0.png`.

**Test gap:** `submission.spec.ts` (`expectFirstMessage`) asserts the badge in the panel only.

## Observations (not counted as defects)

- **O1:** the AC-31/AC-31a server guard was never triggered by the real model; covered by integration tests only.
- **O2:** in AC-31b the model sometimes kept NEEDS_INFO rather than MANUAL_REVIEW; both allowed, reply always pointed to "Nowe zgłoszenie".
- **O3:** M4 complaint changed REJECTED → MANUAL_REVIEW after the customer's statement; allowed by AC-31, card explained the conflict.
- **O4:** the native file input exposes "No file chosen" (Chrome's own text) in the accessibility tree; not visible, Lighthouse 100.
- **O5:** Lighthouse SEO flags the missing `meta-description`; outside the ACs.
- **O6:** pre-existing: `npm audit` 16 vulnerabilities; Vite `configLoader` warning; `unrs-resolver` install script not approved.

## Deviations

- E2E ran against port 3110 through a scratchpad override config, `--workers=1`; evals with `--no-file-parallelism`.
- AC-09 (11 MB) and the multi-file drop were not tested by hand (the example-images README forbids generated files; Playwright cannot set several files on a single-file input); unit and integration tests cover both.
- AC-33 (20 messages) and the 60 s timeout of AC-34 were not run on the real stack, to save calls; covered by automated tests.
- Failure paths (AC-34, AC-35) were triggered by switching the real browser offline.
- The planted-secret mutation check for `check:bundle` was denied by the permission system; `check-bundle-secrets.test.ts` covers it.
- The Lighthouse chat audit used snapshot mode (a navigation would end the in-memory case).
- No new test files were added.

## Screenshots

41 files in `screenshots/`: form (`form-*`), E2E (`e2e-*`, `case1-chat-*-after-d1`), manual M2–M5 (`manual-m{2,3,4,5}-*`), Lighthouse chat (`lighthouse-chat-m1-complaint-phone-1`).

## Re-test (D1, D2)

| | |
|---|---|
| Date | 2026-10-19 |
| Fixes under test | `1680bb4` (docs), `04ae5bc` (D1: decision prompts v2 require 1–3 questions; `enforceNeedsInfoQuestions` in `runSubmission` downgrades NEEDS_INFO with no questions to MANUAL_REVIEW), `230b8df` (D2: composer emits the plain label; the UI renders a `DecisionBadge` under "Decyzja"; `submission.spec.ts` asserts it) |
| Branch / HEAD | `feature/poc-implementation` @ `230b8df`; QA changes only (screenshots) |
| Model | `openai/gpt-6-luna` |

### Commands and results

1. `npm test`: **48 files, 482 tests passed**, 0 skipped, 0 failed.
2. `npm run typecheck`: exit 0. `npm run lint`: exit 0, 0 warnings.
3. `npm run build`: exit 0; 5/5 static pages; 3 API routes ƒ.
4. `npm run check:bundle`: OK, 424 files, no forbidden content.
5. `npm run start -- -p 3110`: ready; 0 error lines and no `downgradedFrom` lines in the server log; stopped afterwards.
6. `initial-decision.eval.ts -t "AC-20"`: **3 passed**, 19 skipped (filter), 0 failed.
7. Whole `initial-decision.eval.ts` once (prompt v2 changed every decision prompt): **22 passed**, 0 skipped, 0 failed, 427.6 s.
8. `submission.spec.ts`, both projects: **11 passed, 1 skipped** (scenario 6 mobile only), 0 failed, zero console errors.
9. `chat.spec.ts --project=mobile`: **1 passed, 1 skipped** (session expired is desktop only), 0 failed; header check at 375/360 passed.

### Eval results (decision prompt v2)

| Scenario | Runs passed | Per run |
|---|---|---|
| AC-20 (filtered) | **3/3** | NEEDS_INFO with 1, 2, 1 questions; ref `§5 ust. 4` |
| Return 30 d / 15 d / 14 d (AC-18) | 3/3 each | REJECTED `§2 ust. 3` / REJECTED / MANUAL_REVIEW |
| Complaint 2 y + 10 d (AC-19) | 3/3 | REJECTED `§2 ust. 3` |
| AC-20 (whole file) | **3/3** | NEEDS_INFO with 1, 1, 1 questions |
| Signs of use (AC-22) | 3/3 | MANUAL_REVIEW `§3 ust. 3` |
| Injection in the reason | 3/3 | REJECTED `§2 ust. 3` |

The model returned at least 1 question in all 6 AC-20 runs, so the server fallback was never triggered by the real model; it is covered by `tests/unit/server/ai/decide/enforce-needs-info-questions.test.ts` and `run-submission.test.ts`. The eval calls `decide()` (raw model output), so it measures the prompt, not the fallback.

### D2 check

`expectFirstMessageStructure` requires exactly one `[data-status]` element in the first message, with the panel's status and the Polish label, and no `<strong>` holding only the label. Passed in all 8 submitting scenarios (S1–S4, both projects). Screenshots: `final-retest-first-message-{desktop,375}.png`.

### Real LLM calls (re-test)

68 (AC-20 filtered 6, whole decision eval 39, submission E2E 20, chat E2E mobile 3); 0 HTTP 429. T6.3 total including the re-test: about 190.

### Observations

- Submissions were slower in this run (S1 desktop 43.7 s vs 14.2 s earlier), still within the 90 s E2E wait and the 60 s per-call server timeout. Worth watching on a shared OpenRouter account.
- **Chat path gap (from F6.1, orchestrator note):** `updateDecision` has no `questions` field, so a chat turn can set NEEDS_INFO without asking a concrete question; this cannot be checked deterministically. It is bounded by AC-32 (after 2 rounds the case goes to MANUAL_REVIEW). Not a defect; candidate for a follow-up.

### Deviations

- `chat.eval.ts` was not re-run after the fixes; the chat prompt (v4) and `createChatStream` are unchanged, but `04ae5bc` changed `runSubmission`, which seeds the AC-31b scenario. The seed only changes if the model returns NEEDS_INFO with no questions.
- The chat E2E ran on the mobile project only; the desktop-only session-expired scenario was not re-run.
- The two re-test screenshots are copies of files the submission spec saves in the same run.

**Updated gate result: PASS.** 0 open defects. Every AC (AC-01…AC-40, AC-31a, AC-31b) and every TAC has evidence and passes. AC-09, AC-33 and the 60 s timeout of AC-34 have automated evidence only.
