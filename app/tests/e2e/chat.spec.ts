/**
 * Chat E2E on the real stack (ADR-004 §8 "E2E complaint" chat row, "E2E mobile", "E2E Polish UI";
 * PRD AC-28–30, AC-35, AC-38–40; TAC-004-04). No mocks: the real Next.js server and real OpenRouter calls.
 *
 * Asserts structure and rules only, never reply wording or the decision status (it depends on the photo).
 * Photos come from `assets/example-images/` and are uploaded through the real form.
 * Run with `--workers=1`: the OpenRouter account allows 20 requests per minute.
 */
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { CASE_TYPES, CATEGORIES, DECISION_STATUSES } from "../../src/lib/domain/constants";
import { pl } from "../../src/lib/i18n/pl";

const IMAGES_DIR = path.resolve(__dirname, "../../../assets/example-images");
const CHAT_TIMEOUT = 90_000;
const LLM_TEST_TIMEOUT = 240_000;
/** English UI strings that must never appear (ADR-004 §8 "E2E Polish UI", plus Retry for the chat). */
const ENGLISH_DENYLIST = /\b(Submit|Send|Loading|Error|Retry)\b/;
/** Browser line for a deliberate non-2xx response; allowed only in error-path tests. */
const RESOURCE_ERROR = /Failed to load resource: the server responded with a status of [45]\d\d/;

function warsawDateDaysAgo(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

let consoleErrors: string[] = [];
let allowResourceErrors = false;

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  allowResourceErrors = false;
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  await page.goto("/");
  await expect(page.getByRole("button", { name: pl.form.submit })).toBeVisible();
});

test.afterEach(() => {
  const unexpected = allowResourceErrors ? consoleErrors.filter((e) => !RESOURCE_ERROR.test(e)) : consoleErrors;
  expect(unexpected, "browser console errors").toEqual([]);
});

/** Complaint, Laptop, −400 days, 40-character reason, laptop-2.webp (ADR-004 §8 "E2E complaint"). */
async function submitComplaint(page: Page) {
  await page.getByRole("radio", { name: CASE_TYPES.COMPLAINT, exact: true }).check();
  await page.getByRole("combobox", { name: pl.form.labels.category }).click();
  await page.getByRole("option", { name: CATEGORIES.LAPTOP, exact: true }).click();
  await page.getByLabel(pl.form.labels.modelName).fill("Lenovo IdeaPad 5");
  await page.getByLabel(pl.form.labels.purchaseDate).fill(warsawDateDaysAgo(400));
  await page.getByLabel(pl.form.reasonLabel.COMPLAINT).fill("Laptop nie włącza się po krótkim użyciu.");
  await page.locator('input[type="file"]').setInputFiles(path.join(IMAGES_DIR, "laptop-2.webp"));
  await expect(page.getByTestId("image-dropzone").getByText("laptop-2.webp", { exact: true })).toBeVisible();

  const response = page.waitForResponse((r) => r.url().endsWith("/api/cases") && r.request().method() === "POST", {
    timeout: CHAT_TIMEOUT,
  });
  await page.getByRole("button", { name: pl.form.submit }).click();
  expect((await response).status()).toBe(200);
  const chat = page.getByTestId("chat-screen");
  await expect(chat).toBeVisible({ timeout: CHAT_TIMEOUT });
  await expect(chat.locator(".is-assistant")).toHaveCount(1);
  const caseId = await chat.getAttribute("data-case-id");
  expect(caseId).toMatch(/^HSC-\d{8}-[A-Z0-9]{4}$/);
  return caseId!;
}

async function expectPolishUi(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(ENGLISH_DENYLIST);
  expect(text).not.toMatch(/openai\/|openrouter|stack|PROCESSING_FAILED|CASE_NOT_FOUND/i);
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const sizes = await page.evaluate(() => ({
    doc: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
    body: { scroll: document.body.scrollWidth, client: document.body.clientWidth },
  }));
  expect(sizes.doc.scroll, `${label}: documentElement`).toBeLessThanOrEqual(sizes.doc.client);
  expect(sizes.body.scroll, `${label}: body`).toBeLessThanOrEqual(sizes.body.client);
}

const shot = async (page: Page, name: string, fullPage = true) => {
  const dir = process.env.QA_SCREENSHOT_DIR;
  if (dir) await page.screenshot({ path: path.join(dir, name), fullPage });
};

/** Regression for QA D2: the header title and "Nowe zgłoszenie" must not overlap, and both stay inside the viewport. */
async function expectHeaderClear(page: Page, width: number) {
  const header = page.locator("header");
  const title = await header.locator("h1").boundingBox();
  const button = await header.getByRole("button", { name: pl.chat.newCase }).boundingBox();
  expect(title, "header h1").not.toBeNull();
  expect(button, "header Nowe zgłoszenie").not.toBeNull();
  const intersects =
    title!.x < button!.x + button!.width &&
    button!.x < title!.x + title!.width &&
    title!.y < button!.y + button!.height &&
    button!.y < title!.y + title!.height;
  expect(intersects, `${width}px: h1 ${JSON.stringify(title)} vs button ${JSON.stringify(button)}`).toBe(false);
  // The pre-fix bug was a word overflowing the h1 box under the button, so the content must fit its box too.
  const overflow = await header.locator("h1").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, `${width}px: h1 content overflow (scrollWidth - clientWidth)`).toBeLessThanOrEqual(0);
  for (const [name, box] of [["h1", title!], ["button", button!]] as const) {
    expect(box.x, `${width}px: ${name} left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${width}px: ${name} right edge`).toBeLessThanOrEqual(width);
  }
}

test.describe("chat", () => {
  test("1. 'Co dalej?' streams a reply and re-enables the input; new case cancel/confirm; mobile layout", async ({
    page,
  }, testInfo) => {
    test.setTimeout(LLM_TEST_TIMEOUT);
    const mobile = testInfo.project.name === "mobile";
    const caseId = await submitComplaint(page);
    const chat = page.getByTestId("chat-screen");
    const input = page.getByRole("textbox", { name: pl.chat.inputLabel });
    const send = page.getByRole("button", { name: pl.chat.send });

    // Whitespace-only cannot be sent (AC-28).
    await input.fill("   ");
    await expect(send).toBeDisabled();

    // Send "Co dalej?" (AC-27, AC-29).
    const chatResponse = page.waitForResponse(
      (r) => r.url().endsWith(`/api/cases/${caseId}/chat`) && r.request().method() === "POST",
      { timeout: CHAT_TIMEOUT },
    );
    await input.fill("Co dalej?");
    await expect(send).toBeEnabled();
    await input.press("Enter");
    await expect(chat.locator(".is-user")).toHaveCount(1);
    await expect(chat.locator(".is-user")).toContainText("Co dalej?");
    await expect(input).toHaveValue("");
    // Typing indicator while the agent replies, and send disabled (AC-29).
    const typing = page.getByText(pl.chat.typing).first();
    await expect(typing).toBeVisible();
    await input.fill("x");
    if (await typing.isVisible()) await expect(send).toBeDisabled();
    await input.fill("");
    expect((await chatResponse).status()).toBe(200);

    // The streamed reply arrives and the typing state ends.
    await expect(chat.locator(".is-assistant")).toHaveCount(2, { timeout: CHAT_TIMEOUT });
    await expect(page.getByText(pl.chat.typing)).toHaveCount(0, { timeout: CHAT_TIMEOUT });
    await expect(chat.locator(".is-assistant").nth(1)).not.toHaveText("");
    await expect(page.getByText(pl.errors.chatFailed)).toHaveCount(0);
    // Input re-enabled: typing enables send again.
    await expect(input).toBeEnabled();
    await input.fill("Dziękuję");
    await expect(send).toBeEnabled();
    await input.fill("");
    // Panel badge is a valid status label (status itself is photo-dependent).
    if (mobile) {
      const trigger = page.getByRole("button", { name: pl.panel.title });
      if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    }
    const badge = page.getByRole("region", { name: pl.panel.title }).locator("[data-status]");
    const status = (await badge.getAttribute("data-status")) as keyof typeof DECISION_STATUSES;
    await expect(badge).toHaveText(DECISION_STATUSES[status]);
    await expectPolishUi(page);
    await shot(page, `e2e-chat-reply-${testInfo.project.name}.png`);

    if (mobile) {
      // AC-40: no horizontal scroll with the reply, panel open and closed; panel collapses.
      const trigger = page.getByRole("button", { name: pl.panel.title });
      for (const width of [375, 360]) {
        await page.setViewportSize({ width, height: 812 });
        await expectNoHorizontalScroll(page, `chat ${width}px (panel open)`);
      }
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("region", { name: pl.panel.title })).toBeHidden();
      for (const width of [375, 360]) {
        await page.setViewportSize({ width, height: 812 });
        await expectNoHorizontalScroll(page, `chat ${width}px (panel closed)`);
        await expectHeaderClear(page, width);
        await shot(page, `e2e-chat-${width}-after-d2.png`, false);
      }
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.setViewportSize({ width: 375, height: 812 });
    }

    // AC-38: cancel keeps the chat unchanged.
    const newCase = page.getByRole("button", { name: pl.chat.newCase });
    await newCase.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(pl.dialog.newCaseMessage);
    await expectPolishUi(page);
    await shot(page, `e2e-new-case-dialog-${testInfo.project.name}.png`);
    await dialog.getByRole("button", { name: pl.dialog.cancel }).click();
    await expect(dialog).toBeHidden();
    await expect(chat).toBeVisible();
    await expect(chat).toHaveAttribute("data-case-id", caseId);
    await expect(chat.locator(".is-assistant")).toHaveCount(2);
    await expect(chat.locator(".is-user")).toHaveCount(1);

    // AC-38: confirm shows an empty form and deletes the case on the server.
    const deleteRequest = page.waitForRequest(
      (r) => r.url().endsWith(`/api/cases/${caseId}`) && r.method() === "DELETE",
    );
    await newCase.click();
    await page.getByRole("alertdialog").getByRole("button", { name: pl.dialog.confirm }).click();
    await deleteRequest;
    await expect(page.getByTestId("chat-screen")).toHaveCount(0);
    await expect(page.getByRole("button", { name: pl.form.submit })).toBeEnabled();
    await expect(page.getByRole("radio", { name: CASE_TYPES.COMPLAINT, exact: true })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: CASE_TYPES.RETURN, exact: true })).not.toBeChecked();
    await expect(page.getByLabel(pl.form.labels.modelName)).toHaveValue("");
    await expect(page.getByLabel(pl.form.labels.purchaseDate)).toHaveValue("");
    await expect(page.getByTestId("image-dropzone").getByText("laptop-2.webp")).toHaveCount(0);
    await expectPolishUi(page);
    if (mobile) await expectNoHorizontalScroll(page, "form after new case");
  });

  test("2. session expired: case deleted on the server → message, locked input, Nowe zgłoszenie", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "error path, one viewport is enough (saves LLM calls)");
    test.setTimeout(LLM_TEST_TIMEOUT);
    allowResourceErrors = true;
    const caseId = await submitComplaint(page);

    const deleted = await page.request.delete(`/api/cases/${caseId}`);
    expect(deleted.status()).toBe(204);

    const input = page.getByRole("textbox", { name: pl.chat.inputLabel });
    const chatResponse = page.waitForResponse((r) => r.url().endsWith(`/api/cases/${caseId}/chat`));
    await input.fill("Co dalej?");
    await input.press("Enter");
    expect((await chatResponse).status()).toBe(404);

    await expect(page.getByText(pl.errors.sessionExpired)).toBeVisible();
    await expect(input).toBeDisabled();
    await expect(page.getByText(pl.errors.chatFailed)).toHaveCount(0);
    await expectPolishUi(page);
    await shot(page, "e2e-session-expired-desktop.png");

    // The banner's "Nowe zgłoszenie" starts a new case without a dialog.
    const chat = page.getByTestId("chat-screen");
    await chat.getByRole("button", { name: pl.chat.newCase }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: pl.form.submit })).toBeEnabled();
    await expect(page.getByLabel(pl.form.labels.modelName)).toHaveValue("");
  });
});
