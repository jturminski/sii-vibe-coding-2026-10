import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  complaintImageReportSchema,
  decisionSchema,
  decisionUpdateResultSchema,
  decisionUpdateSchema,
  imageReportSchema,
  returnImageReportSchema,
} from "@/lib/schemas";

const damage = { type: "rysa", location: "ekran", extent: "drobna" };
const common = {
  imageUsable: true,
  imageIssue: null,
  categoryMatch: "yes",
  observedDevice: "Smartfon z czarną obudową",
  visibleDamage: [damage],
};
const returnReport = {
  caseType: "RETURN",
  ...common,
  signsOfUse: ["odciski palców"],
  visibleCompleteness: "Widoczne tylko urządzenie",
  resaleCondition: "signs_of_use",
};
const complaintReport = {
  caseType: "COMPLAINT",
  ...common,
  likelyCause: "mechanical_impact",
  causeConfidence: "high",
};

const rule = { ref: "§2 ust. 3", explanation: "Wyjaśnienie." };
const decision = {
  status: "NEEDS_INFO",
  summary: "Potrzebujemy więcej informacji.",
  photoFindings: "Zdjęcie jest nieostre.",
  appliedRules: [rule],
  nextSteps: ["Odpowiedz na pytania."],
  questions: ["Pytanie 1?", "Pytanie 2?", "Pytanie 3?"],
};

type JsonNode = {
  description?: string;
  properties?: Record<string, JsonNode>;
  items?: JsonNode;
  anyOf?: JsonNode[];
  oneOf?: JsonNode[];
};

const toJson = (schema: z.ZodType) => z.toJSONSchema(schema) as JsonNode;

/** Lists every object property (at any depth) that has no description. */
function undescribedPaths(schema: z.ZodType): string[] {
  const missing: string[] = [];
  const walk = (node: JsonNode, path: string) => {
    [...(node.anyOf ?? []), ...(node.oneOf ?? [])].forEach((variant, i) => walk(variant, `${path}|${i}`));
    for (const [name, child] of Object.entries(node.properties ?? {})) {
      if (!child.description) missing.push(`${path}.${name}`);
      walk(child, `${path}.${name}`);
    }
    if (node.items) walk(node.items, `${path}[]`);
  };
  walk(toJson(schema), "$");
  return missing;
}

const POLISH = /Polish, plain language/;

describe("image report schemas", () => {
  it("accept valid return and complaint reports", () => {
    expect(returnImageReportSchema.parse(returnReport)).toEqual(returnReport);
    expect(complaintImageReportSchema.parse(complaintReport)).toEqual(complaintReport);
  });

  it("discriminate by caseType", () => {
    expect(imageReportSchema.parse(returnReport).caseType).toBe("RETURN");
    expect(imageReportSchema.parse(complaintReport).caseType).toBe("COMPLAINT");
    expect(imageReportSchema.safeParse({ ...returnReport, caseType: "COMPLAINT" }).success).toBe(false);
  });

  it("AC-14: reject values outside the enums", () => {
    expect(returnImageReportSchema.safeParse({ ...returnReport, categoryMatch: "maybe" }).success).toBe(false);
    expect(returnImageReportSchema.safeParse({ ...returnReport, resaleCondition: "new" }).success).toBe(false);
    expect(complaintImageReportSchema.safeParse({ ...complaintReport, likelyCause: "fire" }).success).toBe(false);
    expect(
      complaintImageReportSchema.safeParse({ ...complaintReport, causeConfidence: "certain" }).success,
    ).toBe(false);
  });

  it("AC-14: accept a usability issue text when the image is unusable", () => {
    const unusable = { ...returnReport, imageUsable: false, imageIssue: "Zdjęcie jest nieostre" };
    expect(returnImageReportSchema.safeParse(unusable).success).toBe(true);
  });

  it("accept an empty damage list and reject more than 10 entries", () => {
    expect(returnImageReportSchema.safeParse({ ...returnReport, visibleDamage: [] }).success).toBe(true);
    expect(
      returnImageReportSchema.safeParse({ ...returnReport, visibleDamage: Array(11).fill(damage) }).success,
    ).toBe(false);
    expect(
      complaintImageReportSchema.safeParse({ ...complaintReport, visibleDamage: Array(10).fill(damage) }).success,
    ).toBe(true);
    expect(
      complaintImageReportSchema.safeParse({ ...complaintReport, visibleDamage: Array(11).fill(damage) }).success,
    ).toBe(false);
  });

  it("describe every field", () => {
    expect(undescribedPaths(returnImageReportSchema)).toEqual([]);
    expect(undescribedPaths(complaintImageReportSchema)).toEqual([]);
  });
});

describe("decisionSchema", () => {
  it("accepts a valid decision with 3 questions", () => {
    expect(decisionSchema.parse(decision)).toEqual(decision);
  });

  it("rejects 4 questions", () => {
    expect(decisionSchema.safeParse({ ...decision, questions: ["1?", "2?", "3?", "4?"] }).success).toBe(false);
  });

  it("AC-16: accepts only the four statuses", () => {
    for (const status of ["ACCEPTED", "REJECTED", "MANUAL_REVIEW", "NEEDS_INFO"]) {
      expect(decisionSchema.safeParse({ ...decision, status }).success, status).toBe(true);
    }
    expect(decisionSchema.safeParse({ ...decision, status: "PENDING" }).success).toBe(false);
  });

  it("requires 1–5 applied rules and 1–5 next steps", () => {
    expect(decisionSchema.safeParse({ ...decision, appliedRules: [] }).success).toBe(false);
    expect(decisionSchema.safeParse({ ...decision, appliedRules: Array(6).fill(rule) }).success).toBe(false);
    expect(decisionSchema.safeParse({ ...decision, appliedRules: Array(5).fill(rule) }).success).toBe(true);
    expect(decisionSchema.safeParse({ ...decision, nextSteps: [] }).success).toBe(false);
    expect(decisionSchema.safeParse({ ...decision, nextSteps: Array(6).fill("krok") }).success).toBe(false);
    expect(decisionSchema.safeParse({ ...decision, nextSteps: Array(5).fill("krok") }).success).toBe(true);
  });

  it("AC-21: requires rule refs in the form '§N ust. M'", () => {
    const withRef = (ref: string) => ({ ...decision, appliedRules: [{ ref, explanation: "x" }] });
    for (const ref of ["§2 ust. 3", "§10 ust. 12", "§2 ust. 1–2"]) {
      expect(decisionSchema.safeParse(withRef(ref)).success, ref).toBe(true);
    }
    for (const ref of ["2 ust. 3", "§2", "§2 ust 3", "art. 5", "§2 ust. 3 i dalej"]) {
      expect(decisionSchema.safeParse(withRef(ref)).success, ref).toBe(false);
    }
  });

  it("describes every field and marks customer-facing strings as Polish, plain language", () => {
    expect(undescribedPaths(decisionSchema)).toEqual([]);
    const props = toJson(decisionSchema).properties ?? {};
    for (const key of ["summary", "photoFindings", "nextSteps", "questions"]) {
      expect(props[key]?.description, key).toMatch(POLISH);
    }
    expect(props.appliedRules?.items?.properties?.explanation?.description).toMatch(POLISH);
  });
});

describe("decisionUpdateSchema (updateDecision tool input)", () => {
  const update = { status: "MANUAL_REVIEW", reason: "Klient podał nowe informacje.", appliedRules: [rule] };

  it("accepts a valid update", () => {
    expect(decisionUpdateSchema.parse(update)).toEqual(update);
  });

  it("rejects an unknown status, an empty reason and a bad rule ref", () => {
    expect(decisionUpdateSchema.safeParse({ ...update, status: "DONE" }).success).toBe(false);
    expect(decisionUpdateSchema.safeParse({ ...update, reason: "" }).success).toBe(false);
    expect(
      decisionUpdateSchema.safeParse({ ...update, appliedRules: [{ ref: "§4", explanation: "x" }] }).success,
    ).toBe(false);
  });

  it("describes every field and marks reason as Polish, plain language", () => {
    expect(undescribedPaths(decisionUpdateSchema)).toEqual([]);
    expect(toJson(decisionUpdateSchema).properties?.reason?.description).toMatch(POLISH);
  });
});

describe("decisionUpdateResultSchema (updateDecision tool output)", () => {
  const result = {
    status: "ACCEPTED",
    label: "Przyjęte",
    reason: "Powód.",
    appliedRules: [rule],
    disclaimer: "Ta decyzja jest wstępna.",
  };

  it("accepts the card payload", () => {
    expect(decisionUpdateResultSchema.parse(result)).toEqual(result);
  });

  it("requires the disclaimer", () => {
    const { disclaimer: _unused, ...withoutDisclaimer } = result;
    expect(decisionUpdateResultSchema.safeParse(withoutDisclaimer).success).toBe(false);
  });
});
