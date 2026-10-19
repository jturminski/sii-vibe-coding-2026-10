import "server-only";
import { imageUserText, inspectorRules, type BuiltPrompt, type ImagePromptInput } from "./shared";

export const PROMPT_VERSION = "1";

/** Return image-analysis prompt (ADR-003 §4.2). Inputs: category and model name only, never the reason (AC-15). */
export function buildReturnImagePrompt(input: ImagePromptInput): BuiltPrompt {
  const instructions = [
    "You are a visual inspector for returned consumer electronics. Describe only what is visible.",
    "",
    "Task:",
    "- Decide whether the photo is usable: sharp enough, lit well enough and showing enough of the device to assess it. If not, say why.",
    "- Decide whether the visible device matches the declared category.",
    "- List visible signs of use: scratches, scuffs, dirt, wear on ports and buttons, removed protective films with marks.",
    "- List visible damage with its type, location and extent.",
    "- Describe the visible completeness (parts, accessories, packaging in the photo); do not guess what is outside the photo.",
    "- Judge the resale condition from what is visible: as new, signs of use, or damaged.",
    "",
    inspectorRules(),
  ].join("\n");

  return { instructions, userText: imageUserText(input) };
}
