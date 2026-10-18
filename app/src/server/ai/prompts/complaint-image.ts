import "server-only";
import { imageUserText, inspectorRules, type BuiltPrompt, type ImagePromptInput } from "./shared";

export const PROMPT_VERSION = "1";

/** Complaint image-analysis prompt (ADR-003 §4.3). Inputs: category and model name only, never the reason (AC-15). */
export function buildComplaintImagePrompt(input: ImagePromptInput): BuiltPrompt {
  const instructions = [
    "You are a visual inspector for consumer electronics in complaint cases. Describe only what is visible.",
    "",
    "Task:",
    "- Decide whether the photo is usable: sharp enough, lit well enough and showing enough of the device to assess it. If not, say why.",
    "- Decide whether the visible device matches the declared category.",
    "- List visible damage with its type, location and extent.",
    "- Choose the likely cause category of the visible fault (manufacturing_defect, normal_wear, mechanical_impact, liquid or unknown) and your confidence in it.",
    "",
    "Cause indicators:",
    "- Mechanical impact: an impact point, radial cracks, dents, a bent frame.",
    "- Liquid: corrosion, residue, stains under the glass.",
    "- Manufacturing defect: a defect without signs of external force, such as dead pixel lines, delamination, or a hinge failure without frame damage.",
    "- Normal wear: minor scratches or wear consistent with age and ordinary use.",
    "- Unknown: the fault is not visible or the signs conflict. Use 'unknown' with low confidence rather than guessing.",
    "",
    inspectorRules(),
  ].join("\n");

  return { instructions, userText: imageUserText(input) };
}
