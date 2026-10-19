import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  caseDataPartSchema,
  hscDataPartSchemas,
  hscMetadataSchema,
  stageDataPartSchema,
  type DecisionUpdate,
  type DecisionUpdateResult,
  type HscUIMessage,
} from "@/lib/schemas";

const caseData = {
  caseId: "HSC-20261018-AB12",
  caseType: "COMPLAINT",
  category: "LAPTOP",
  modelName: "ThinkPad X1",
  purchaseDate: "2026-01-10",
  reason: "Zawias pękł bez uderzenia.",
  status: "MANUAL_REVIEW",
};

describe("UI message data parts", () => {
  it("validate the case data part", () => {
    expect(caseDataPartSchema.parse(caseData)).toEqual(caseData);
    expect(caseDataPartSchema.safeParse({ ...caseData, caseId: "HSC-1" }).success).toBe(false);
    expect(caseDataPartSchema.safeParse({ ...caseData, status: "OPEN" }).success).toBe(false);
  });

  it("validate the stage data part", () => {
    expect(stageDataPartSchema.parse({ stage: "analyzing" })).toEqual({ stage: "analyzing" });
    expect(stageDataPartSchema.parse({ stage: "deciding" })).toEqual({ stage: "deciding" });
    expect(stageDataPartSchema.safeParse({ stage: "done" }).success).toBe(false);
  });

  it("expose the data part schemas by name for useChat", () => {
    expect(hscDataPartSchemas.case).toBe(caseDataPartSchema);
    expect(hscDataPartSchemas.stage).toBe(stageDataPartSchema);
  });

  it("validate metadata", () => {
    expect(hscMetadataSchema.parse({ createdAt: 1 })).toEqual({ createdAt: 1 });
    expect(hscMetadataSchema.safeParse({ createdAt: "now" }).success).toBe(false);
  });
});

describe("HscUIMessage type", () => {
  it("types metadata, data parts and the updateDecision tool", () => {
    type Part = HscUIMessage["parts"][number];
    expectTypeOf<HscUIMessage["metadata"]>().toEqualTypeOf<{ createdAt: number } | undefined>();
    expectTypeOf<Extract<Part, { type: "data-stage" }>["data"]>().toEqualTypeOf<{
      stage: "analyzing" | "deciding";
    }>();
    expectTypeOf<Extract<Part, { type: "data-case" }>["data"]["caseId"]>().toEqualTypeOf<string>();
    type ToolPart = Extract<Part, { type: "tool-updateDecision"; state: "output-available" }>;
    expectTypeOf<ToolPart["input"]>().toEqualTypeOf<DecisionUpdate>();
    expectTypeOf<ToolPart["output"]>().toEqualTypeOf<DecisionUpdateResult>();
  });

  it("schema modules never import server code", () => {
    const dir = join(process.cwd(), "src/lib/schemas");
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/from\s+["'](@\/server|(\.\.?\/)+server)/);
      expect(source, file).not.toMatch(/server-only/);
    }
  });
});
