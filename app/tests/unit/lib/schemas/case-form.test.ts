import { describe, expect, it } from "vitest";
import { pl, type ValidationErrorCode } from "@/lib/i18n/pl";
import { createCaseFormSchema, ERROR_CODES } from "@/lib/schemas";
import { fieldCodes } from "./helpers";

// 2026-10-18 10:00 UTC = 12:00 in Warsaw.
const NOW = new Date("2026-10-18T10:00:00Z");
const schema = createCaseFormSchema(NOW);

const validComplaint = {
  caseType: "COMPLAINT",
  category: "SMARTPHONE",
  modelName: "Samsung Galaxy S24",
  purchaseDate: "2026-01-10",
  reason: "Ekran przestał działać po tygodniu.",
};
const { reason: _unused, ...withoutReason } = validComplaint;

describe("ERROR_CODES", () => {
  it("lists exactly the codes that have Polish messages, each mapped to itself", () => {
    expect(Object.keys(ERROR_CODES).sort()).toEqual(Object.keys(pl.validation).sort());
    for (const [key, value] of Object.entries(ERROR_CODES)) expect(value).toBe(key);
    const typed: ValidationErrorCode = ERROR_CODES.REQUIRED;
    expect(typed).toBe("REQUIRED");
  });
});

describe("createCaseFormSchema", () => {
  it("accepts a valid complaint and trims strings", () => {
    const result = schema.safeParse({ ...validComplaint, modelName: "  iPhone 15  " });
    expect(result.success).toBe(true);
    expect(result.data?.modelName).toBe("iPhone 15");
  });

  it("AC-03: missing required fields give REQUIRED", () => {
    expect(fieldCodes(schema.safeParse({}))).toMatchObject({
      caseType: "REQUIRED",
      category: "REQUIRED",
      modelName: "REQUIRED",
      purchaseDate: "REQUIRED",
    });
  });

  it("AC-03: empty or whitespace-only strings give REQUIRED", () => {
    const codes = fieldCodes(
      schema.safeParse({ caseType: "", category: "", modelName: "   ", purchaseDate: "", reason: "" }),
    );
    expect(codes).toMatchObject({
      caseType: "REQUIRED",
      category: "REQUIRED",
      modelName: "REQUIRED",
      purchaseDate: "REQUIRED",
    });
  });

  it("unknown enum values give INVALID_ENUM", () => {
    const codes = fieldCodes(schema.safeParse({ ...validComplaint, caseType: "EXCHANGE", category: "FRIDGE" }));
    expect(codes).toEqual({ caseType: "INVALID_ENUM", category: "INVALID_ENUM" });
  });

  it("AC-04: complaint reason of 20 chars passes, 19 fails with TOO_SHORT", () => {
    expect(schema.safeParse({ ...validComplaint, reason: "a".repeat(20) }).success).toBe(true);
    expect(fieldCodes(schema.safeParse({ ...validComplaint, reason: "a".repeat(19) }))).toEqual({
      reason: "TOO_SHORT",
    });
  });

  it("AC-04: complaint reason length is counted after trimming", () => {
    expect(fieldCodes(schema.safeParse({ ...validComplaint, reason: `  ${"a".repeat(19)}   ` }))).toEqual({
      reason: "TOO_SHORT",
    });
  });

  it("AC-04: empty or missing complaint reason gives REQUIRED", () => {
    expect(fieldCodes(schema.safeParse({ ...validComplaint, reason: "  " }))).toEqual({ reason: "REQUIRED" });
    expect(fieldCodes(schema.safeParse(withoutReason))).toEqual({ reason: "REQUIRED" });
  });

  it("AC-04: the complaint reason check is reported together with other field errors", () => {
    const codes = fieldCodes(schema.safeParse({ ...validComplaint, modelName: "", reason: "krótko" }));
    expect(codes).toEqual({ modelName: "REQUIRED", reason: "TOO_SHORT" });
  });

  it("AC-05: return reason is optional and defaults to an empty string", () => {
    const result = schema.safeParse({ ...withoutReason, caseType: "RETURN" });
    expect(result.success).toBe(true);
    expect(result.data?.reason).toBe("");
    expect(schema.safeParse({ ...validComplaint, caseType: "RETURN", reason: "x" }).success).toBe(true);
  });

  it("AC-06: model name over 100 chars and reason over 2000 chars give TOO_LONG", () => {
    expect(schema.safeParse({ ...validComplaint, modelName: "m".repeat(100) }).success).toBe(true);
    expect(schema.safeParse({ ...validComplaint, reason: "r".repeat(2000) }).success).toBe(true);
    expect(
      fieldCodes(schema.safeParse({ ...validComplaint, modelName: "m".repeat(101), reason: "r".repeat(2001) })),
    ).toEqual({ modelName: "TOO_LONG", reason: "TOO_LONG" });
    expect(
      fieldCodes(schema.safeParse({ ...validComplaint, caseType: "RETURN", reason: "r".repeat(2001) })),
    ).toEqual({ reason: "TOO_LONG" });
  });

  it("AC-07: today in Warsaw passes, tomorrow in Warsaw gives FUTURE_DATE", () => {
    expect(schema.safeParse({ ...validComplaint, purchaseDate: "2026-10-18" }).success).toBe(true);
    expect(fieldCodes(schema.safeParse({ ...validComplaint, purchaseDate: "2026-10-19" }))).toEqual({
      purchaseDate: "FUTURE_DATE",
    });
  });

  it("AC-07: uses the Warsaw calendar day, not UTC", () => {
    // 22:30 UTC on 18 Oct is already 19 Oct (00:30) in Warsaw.
    const lateUtc = createCaseFormSchema(new Date("2026-10-18T22:30:00Z"));
    expect(lateUtc.safeParse({ ...validComplaint, purchaseDate: "2026-10-19" }).success).toBe(true);
    expect(fieldCodes(lateUtc.safeParse({ ...validComplaint, purchaseDate: "2026-10-20" }))).toEqual({
      purchaseDate: "FUTURE_DATE",
    });
  });

  it("rejects malformed or impossible dates", () => {
    for (const purchaseDate of ["18.10.2026", "2026-1-5", "2026-02-30", "abc"]) {
      expect(schema.safeParse({ ...validComplaint, purchaseDate }).success, purchaseDate).toBe(false);
    }
  });

  it("does not include the image file", () => {
    const result = schema.safeParse({ ...validComplaint, image: "file" });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("image");
  });

  it("every issue message is a known error code", () => {
    const result = schema.safeParse({ caseType: 1, category: null, modelName: 5, purchaseDate: 7, reason: 9 });
    expect(result.success).toBe(false);
    for (const issue of result.error?.issues ?? []) expect(Object.keys(ERROR_CODES)).toContain(issue.message);
  });
});
