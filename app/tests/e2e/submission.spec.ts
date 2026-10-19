/**
 * Submission E2E on the real stack (ADR-004 §8 E2E rows; PRD AC-01–26, AC-36, AC-39, AC-40;
 * TAC-004-04). No mocks: the real Next.js server and real OpenRouter calls.
 *
 * Asserts structure and rules only. The decision status is asserted only where a date rule makes it
 * independent of the photo (late return → "Odrzucone"). Photos come from `assets/example-images/`
 * and are uploaded through the real form (see that folder's README).
 */
import path from "node:path";
import { expect, test, type Page, type Request } from "@playwright/test";
import { CASE_ID_REGEX } from "../../src/lib/domain/case-id";
import { CASE_TYPES, CATEGORIES, DECISION_STATUSES } from "../../src/lib/domain/constants";
import { pl } from "../../src/lib/i18n/pl";

const IMAGES_DIR = path.resolve(__dirname, "../../../assets/example-images");
/** Processing has a 60 s server timeout (AC-34); the chat must appear within that plus margin. */
const CHAT_TIMEOUT = 90_000;
const LLM_TEST_TIMEOUT = 150_000;
/** English UI strings that must never appear (ADR-004 §8 "E2E Polish UI"). */
const ENGLISH_DENYLIST = /\b(Submit|Send|Loading|Error)\b/;

type CaseTypeLabel = (typeof CASE_TYPES)[keyof typeof CASE_TYPES];
type CategoryLabel = (typeof CATEGORIES)[keyof typeof CATEGORIES];

/** `YYYY-MM-DD` of today in Europe/Warsaw minus `days` calendar days. */
function warsawDateDaysAgo(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

// Every test collects console errors and uncaught page errors; zero are allowed (TAC-004-04).
let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  await page.goto("/");
  await expect(page.getByRole("button", { name: pl.form.submit })).toBeVisible();
});

test.afterEach(() => {
  expect(consoleErrors, "browser console errors").toEqual([]);
});

async function fillCaseForm(
  page: Page,
  input: { caseType: CaseTypeLabel; category: CategoryLabel; modelName: string; daysAgo: number; reason?: string; image: string },
) {
  await page.getByRole("radio", { name: input.caseType, exact: true }).check();
  await page.getByRole("combobox", { name: pl.form.labels.category }).click();
  await page.getByRole("option", { name: input.category, exact: true }).click();
  await page.getByLabel(pl.form.labels.modelName).fill(input.modelName);
  await page.getByLabel(pl.form.labels.purchaseDate).fill(warsawDateDaysAgo(input.daysAgo));
  if (input.reason !== undefined) {
    const reasonLabel = input.caseType === CASE_TYPES.COMPLAINT ? pl.form.reasonLabel.COMPLAINT : pl.form.reasonLabel.RETURN;
    await page.getByLabel(reasonLabel).fill(input.reason);
  }
  await page.locator('input[type="file"]').setInputFiles(path.join(IMAGES_DIR, input.image));
  // The preview shows the held file's name and no format/size error (AC-08, AC-10).
  await expect(page.getByTestId("image-dropzone").getByText(input.image, { exact: true })).toBeVisible();
  await expect(page.getByText(pl.validation.UNSUPPORTED_FORMAT)).toHaveCount(0);
}

/** Submits and waits for the chat screen; the processing state must appear first (AC-11). */
async function submitAndWaitForChat(page: Page) {
  const response = page.waitForResponse((r) => r.url().endsWith("/api/cases") && r.request().method() === "POST", {
    timeout: CHAT_TIMEOUT,
  });
  await page.getByRole("button", { name: pl.form.submit }).click();
  await expect(page.getByText(pl.processing.analyzingImage).or(page.getByText(pl.processing.preparingDecision))).toBeVisible();
  await expect(page.getByRole("button", { name: pl.form.submit })).toBeDisabled();
  expect((await response).status()).toBe(200);
  await expect(page.getByTestId("chat-screen")).toBeVisible({ timeout: CHAT_TIMEOUT });
  await expect(page.getByText(pl.errors.processingBanner)).toHaveCount(0);
}

/** Opens the summary panel on narrow viewports, where it is a collapsible (AC-40). */
async function openSummaryPanel(page: Page) {
  const trigger = page.getByRole("button", { name: pl.panel.title });
  if (await trigger.isVisible()) {
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  }
}

/**
 * First-message structure (AC-23–26): status badge in the panel, "Następne kroki" rendered as a
 * heading, the exact disclaimer and a case ID matching the format, equal to the panel's ID.
 * Returns the badge's status.
 */
async function expectFirstMessageStructure(page: Page): Promise<string> {
  const conversation = page.getByRole("log").or(page.locator(`[aria-label="${pl.chat.conversationLabel}"]`)).first();
  await expect(conversation.getByRole("heading", { name: pl.firstMessage.headings.nextSteps })).toBeVisible();
  await expect(conversation.getByText(pl.firstMessage.disclaimer, { exact: true })).toBeVisible();
  // Markdown is rendered, not raw (AC-26).
  await expect(conversation.getByText(/^##\s/)).toHaveCount(0);

  const conversationText = (await conversation.innerText()).replace(/\s+/g, " ");
  const idMatch = new RegExp(`${pl.firstMessage.caseIdPrefix}\\s*(HSC-\\S+)`).exec(conversationText);
  expect(idMatch, "case ID line in the first message").not.toBeNull();
  const caseId = idMatch![1]!.replace(/[.,;]$/, "");
  expect(caseId).toMatch(CASE_ID_REGEX);

  await openSummaryPanel(page);
  const panel = page.getByRole("region", { name: pl.panel.title });
  const badge = panel.locator("[data-status]");
  await expect(badge).toBeVisible();
  const status = (await badge.getAttribute("data-status")) as keyof typeof DECISION_STATUSES;
  expect(Object.keys(DECISION_STATUSES)).toContain(status);
  await expect(badge).toHaveText(DECISION_STATUSES[status]);
  await expect(panel.getByText(caseId, { exact: true })).toBeVisible();

  // The first message shows the same colored badge under "Decyzja", not bold text (AC-24, defect D2).
  const messageBadge = conversation.locator("[data-status]");
  await expect(messageBadge).toHaveCount(1);
  await expect(messageBadge).toBeVisible();
  await expect(messageBadge).toHaveAttribute("data-status", status);
  await expect(messageBadge).toHaveText(DECISION_STATUSES[status]);
  await expect(conversation.locator("strong", { hasText: new RegExp(`^${DECISION_STATUSES[status]}$`) })).toHaveCount(0);

  // Polish UI only and no technical details (AC-36, AC-39).
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(ENGLISH_DENYLIST);
  expect(bodyText).not.toMatch(/openai\/|openrouter|stack|PROCESSING_FAILED/i);
  return status;
}

/**
 * Markdown is visibly formatted, not only present as HTML (AC-26, regression for QA defect D1):
 * an `h2` is larger than body paragraphs, and list items show markers.
 */
async function expectFormattedMarkdown(page: Page) {
  const conversation = page.locator(`[aria-label="${pl.chat.conversationLabel}"]`).first();
  const styles = await conversation.evaluate((root) => {
    const size = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
    const marker = (el: Element | null) => (el ? getComputedStyle(el).listStyleType : null);
    return {
      h2: size(root.querySelector("h2")),
      p: size(root.querySelector("p")),
      ulLi: marker(root.querySelector("ul > li")),
      olLi: marker(root.querySelector("ol > li")),
    };
  });
  expect(styles.h2, "h2 in the first message").not.toBeNull();
  expect(styles.p, "p in the first message").not.toBeNull();
  expect(styles.h2!, "h2 font-size > p font-size").toBeGreaterThan(styles.p!);
  expect(styles.ulLi, "li inside ul").not.toBeNull();
  expect(styles.ulLi, "ul > li list-style-type").not.toBe("none");
  if (styles.olLi !== null) expect(styles.olLi, "ol > li list-style-type").not.toBe("none");
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const sizes = await page.evaluate(() => ({
    doc: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
    body: { scroll: document.body.scrollWidth, client: document.body.clientWidth },
  }));
  expect(sizes.doc.scroll, `${label}: documentElement scrollWidth ≤ clientWidth`).toBeLessThanOrEqual(sizes.doc.client);
  expect(sizes.body.scroll, `${label}: body scrollWidth ≤ clientWidth`).toBeLessThanOrEqual(sizes.body.client);
}

test.describe("submission", () => {
  test("1. return, Smartfon, −3 days, phone-1.jpg → chat with first-message structure", async ({ page }, testInfo) => {
    test.setTimeout(LLM_TEST_TIMEOUT);
    await fillCaseForm(page, {
      caseType: CASE_TYPES.RETURN,
      category: CATEGORIES.SMARTPHONE,
      modelName: "Samsung Galaxy A54",
      daysAgo: 3,
      image: "phone-1.jpg",
    });
    await submitAndWaitForChat(page);
    await expectFirstMessageStructure(page);
    await expectFormattedMarkdown(page);
    // Optional QA evidence: set QA_SCREENSHOT_DIR to save the chat per project (no extra submission).
    const shotsDir = process.env.QA_SCREENSHOT_DIR;
    if (shotsDir) {
      const name = testInfo.project.name === "mobile" ? "case1-chat-375-after-d1.png" : "case1-chat-desktop-after-d1.png";
      await page.screenshot({ path: path.join(shotsDir, name), fullPage: true });
    }
  });

  test("2. complaint, Laptop, −400 days, 40-char reason, laptop-2.webp → same structure", async ({ page }) => {
    test.setTimeout(LLM_TEST_TIMEOUT);
    const reason = "Laptop nie włącza się po krótkim użyciu.";
    expect(reason).toHaveLength(40);
    await fillCaseForm(page, {
      caseType: CASE_TYPES.COMPLAINT,
      category: CATEGORIES.LAPTOP,
      modelName: "Lenovo IdeaPad 5",
      daysAgo: 400,
      reason,
      image: "laptop-2.webp",
    });
    await submitAndWaitForChat(page);
    await expectFirstMessageStructure(page);
  });

  test("3. return, −30 days, phone-2.jpeg → badge Odrzucone (date rule)", async ({ page }) => {
    test.setTimeout(LLM_TEST_TIMEOUT);
    await fillCaseForm(page, {
      caseType: CASE_TYPES.RETURN,
      category: CATEGORIES.SMARTPHONE,
      modelName: "Apple iPhone 13",
      daysAgo: 30,
      image: "phone-2.jpeg",
    });
    await submitAndWaitForChat(page);
    const status = await expectFirstMessageStructure(page);
    expect(status).toBe("REJECTED");
    await expect(page.getByRole("region", { name: pl.panel.title }).locator("[data-status]")).toHaveText(
      DECISION_STATUSES.REJECTED,
    );
  });

  test("4. laptop-1.png (JPEG content, .png name) is accepted and processed", async ({ page }) => {
    test.setTimeout(LLM_TEST_TIMEOUT);
    await fillCaseForm(page, {
      caseType: CASE_TYPES.RETURN,
      category: CATEGORIES.LAPTOP,
      modelName: "Dell XPS 13",
      daysAgo: 3,
      image: "laptop-1.png",
    });
    await submitAndWaitForChat(page);
    await expectFirstMessageStructure(page);
  });

  test("5. empty submit → 5 required messages and no request to /api/cases", async ({ page }) => {
    const caseRequests: Request[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/cases")) caseRequests.push(request);
    });
    await page.getByRole("button", { name: pl.form.submit }).click();
    await expect(page.getByText(pl.validation.REQUIRED, { exact: true })).toHaveCount(5);
    // Focus moves to the first invalid field (case type).
    await expect(page.getByRole("radio", { name: CASE_TYPES.RETURN, exact: true })).toBeFocused();
    await page.waitForTimeout(500);
    expect(caseRequests).toEqual([]);
    expect(await page.locator("body").innerText()).not.toMatch(ENGLISH_DENYLIST);
  });

  test("6. mobile 375 px and 360 px: no horizontal scroll on the form and the chat; panel collapsible", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile viewport scenario (AC-40)");
    test.setTimeout(LLM_TEST_TIMEOUT);

    for (const width of [375, 360]) {
      await page.setViewportSize({ width, height: 812 });
      await expectNoHorizontalScroll(page, `form ${width}px (empty)`);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await fillCaseForm(page, {
      caseType: CASE_TYPES.COMPLAINT,
      category: CATEGORIES.SMARTPHONE,
      modelName: "Samsung Galaxy A54",
      daysAgo: 30,
      reason: "Ekran telefonu przestał reagować na dotyk w dolnej części.",
      image: "phone-1.jpg",
    });
    for (const width of [375, 360]) {
      await page.setViewportSize({ width, height: 812 });
      await expectNoHorizontalScroll(page, `form ${width}px (filled)`);
    }

    await submitAndWaitForChat(page);
    const trigger = page.getByRole("button", { name: pl.panel.title });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    for (const width of [375, 360]) {
      await page.setViewportSize({ width, height: 812 });
      await expectNoHorizontalScroll(page, `chat ${width}px (panel closed)`);
    }
    await expectFirstMessageStructure(page); // opens the collapsible
    for (const width of [375, 360]) {
      await page.setViewportSize({ width, height: 812 });
      await expectNoHorizontalScroll(page, `chat ${width}px (panel open)`);
    }
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("region", { name: pl.panel.title })).toBeHidden();
  });
});
