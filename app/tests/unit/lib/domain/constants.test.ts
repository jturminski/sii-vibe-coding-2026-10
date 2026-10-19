import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CASE_TYPES,
  CATEGORIES,
  DECISION_STATUSES,
  LIMITS,
  type CaseType,
  type Category,
  type DecisionStatus,
} from "@/lib/domain";

describe("CASE_TYPES", () => {
  it("maps keys to Polish labels", () => {
    expect(CASE_TYPES).toEqual({ RETURN: "Zwrot", COMPLAINT: "Reklamacja" });
    expectTypeOf<CaseType>().toEqualTypeOf<"RETURN" | "COMPLAINT">();
  });
});

describe("CATEGORIES (AC-02)", () => {
  it("contains exactly the AC-02 labels in order", () => {
    expect(Object.values(CATEGORIES)).toEqual([
      "Smartfon",
      "Laptop",
      "Tablet",
      "Słuchawki",
      "Smartwatch / opaska",
      "Telewizor / monitor",
      "Konsola do gier",
      "Aparat fotograficzny",
      "Inne",
    ]);
  });

  it("uses stable ASCII keys", () => {
    expect(CATEGORIES.SMARTPHONE).toBe("Smartfon");
    expect(CATEGORIES.HEADPHONES).toBe("Słuchawki");
    expect(CATEGORIES.OTHER).toBe("Inne");
    for (const key of Object.keys(CATEGORIES)) expect(key).toMatch(/^[A-Z_]+$/);
    expectTypeOf<Category>().toEqualTypeOf<keyof typeof CATEGORIES>();
  });
});

describe("DECISION_STATUSES (AC-16)", () => {
  it("maps each status to its Polish label", () => {
    expect(DECISION_STATUSES).toEqual({
      ACCEPTED: "Przyjęte",
      REJECTED: "Odrzucone",
      MANUAL_REVIEW: "Do weryfikacji przez specjalistę",
      NEEDS_INFO: "Potrzebne dodatkowe informacje",
    });
    expectTypeOf<DecisionStatus>().toEqualTypeOf<
      "ACCEPTED" | "REJECTED" | "MANUAL_REVIEW" | "NEEDS_INFO"
    >();
  });
});

describe("LIMITS", () => {
  it("has the agreed values", () => {
    expect(LIMITS).toEqual({
      MAX_IMAGE_BYTES: 10_485_760,
      MODEL_NAME_MAX: 100,
      REASON_MAX: 2000,
      COMPLAINT_REASON_MIN: 20,
      CHAT_MESSAGE_MAX: 2000,
      MAX_USER_MESSAGES: 20,
      REQUEST_TIMEOUT_MS: 60_000,
      IMAGE_MAX_EDGE: 1568,
      JPEG_QUALITY: 80,
      MAX_CASES: 500,
      MAX_QUESTIONS: 3,
      ALLOWED_IMAGE_MIME: ["image/jpeg", "image/png", "image/webp"],
    });
  });
});
