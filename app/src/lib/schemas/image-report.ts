import { z } from "zod";

/** Max entries in `visibleDamage` / `signsOfUse` (ADR-003 §4.1). */
const MAX_DAMAGE_ITEMS = 10;

const damageItemSchema = z
  .object({
    type: z.string().describe("Kind of damage, e.g. scratch, crack, dent, corrosion, stain."),
    location: z.string().describe("Where on the device the damage is, e.g. screen, back, frame, port."),
    extent: z.string().describe("How large or severe the damage looks: minor, moderate or severe, with a short note."),
  })
  .describe("One visible damage item.");

/** Fields shared by both case types (ADR-000 §5, PRD AC-14). */
const commonImageReportShape = {
  imageUsable: z
    .boolean()
    .describe("True when the photo is sharp and lit well enough and the device is visible enough to assess."),
  imageIssue: z
    .string()
    .nullable()
    .describe("Why the photo is not usable (blur, darkness, device not visible, etc.); null when it is usable."),
  categoryMatch: z
    .enum(["yes", "no", "uncertain"])
    .describe("Whether the visible device matches the declared category. Use 'uncertain' when unsure."),
  observedDevice: z.string().describe("Short neutral description of the device actually visible in the photo."),
  visibleDamage: z
    .array(damageItemSchema)
    .max(MAX_DAMAGE_ITEMS)
    .describe("Visible damage, at most 10 items; empty when no damage is visible."),
};

export const returnImageReportSchema = z
  .object({
    caseType: z.literal("RETURN").describe("Case type this report was produced for."),
    ...commonImageReportShape,
    signsOfUse: z
      .array(z.string().describe("One visible sign of use."))
      .max(MAX_DAMAGE_ITEMS)
      .describe(
        "Visible signs of use (scratches, scuffs, dirt, wear on ports or buttons, marks of removed films); empty when none.",
      ),
    visibleCompleteness: z
      .string()
      .describe("What parts, accessories or packaging are visible in the photo; do not guess what is outside it."),
    resaleCondition: z
      .enum(["as_new", "signs_of_use", "damaged"])
      .describe("Overall resale condition judged only from what is visible."),
  })
  .describe("Visual inspection report for a return case.");

export const complaintImageReportSchema = z
  .object({
    caseType: z.literal("COMPLAINT").describe("Case type this report was produced for."),
    ...commonImageReportShape,
    likelyCause: z
      .enum(["manufacturing_defect", "normal_wear", "mechanical_impact", "liquid", "unknown"])
      .describe("Most likely cause of the visible fault; 'unknown' when it cannot be told from the photo."),
    causeConfidence: z
      .enum(["low", "medium", "high"])
      .describe("Confidence in likelyCause; use 'low' when unsure."),
  })
  .describe("Visual inspection report for a complaint case.");

export const imageReportSchema = z.discriminatedUnion("caseType", [
  returnImageReportSchema,
  complaintImageReportSchema,
]);

export type ReturnImageReport = z.infer<typeof returnImageReportSchema>;
export type ComplaintImageReport = z.infer<typeof complaintImageReportSchema>;
export type ImageReport = z.infer<typeof imageReportSchema>;
