import { describe, expect, it } from "vitest";
import { CASE_ID_REGEX, DECISION_STATUSES, type DecisionStatus } from "@/lib/domain";
import { pl } from "@/lib/i18n/pl";
import type { Decision } from "@/lib/schemas";
import { composeFirstMessage } from "@/server/ai/compose-first-message";

const CASE_ID = "HSC-20261018-AB12";
const fm = pl.firstMessage;

function decisionFor(status: DecisionStatus, overrides: Partial<Decision> = {}): Decision {
  return {
    status,
    summary: "Krótkie podsumowanie decyzji.",
    photoFindings: "Na zdjęciu widać urządzenie bez uszkodzeń.",
    appliedRules: [
      { ref: "§2 ust. 1", explanation: "Zwrot w ciągu 14 dni od dostawy." },
      { ref: "§3 ust. 2–4", explanation: "Urządzenie nie nosi śladów użytkowania." },
    ],
    nextSteps: ["Zapakuj urządzenie.", "Wyślij paczkę na adres sklepu."],
    questions: status === "NEEDS_INFO" ? ["Kiedy pojawiła się usterka?", "Czy urządzenie było zalane?"] : [],
    ...overrides,
  };
}

const STATUSES = Object.keys(DECISION_STATUSES) as DecisionStatus[];

describe("composeFirstMessage", () => {
  it.each(STATUSES)("places every %s section in the AC-24 order", (status) => {
    const decision = decisionFor(status);
    const md = composeFirstMessage(CASE_ID, decision);

    const positions = [
      md.indexOf(fm.greeting),
      md.indexOf(`## ${fm.headings.decision}`),
      md.indexOf(`**${DECISION_STATUSES[status]}**`),
      md.indexOf(decision.summary),
      md.indexOf(`## ${fm.headings.justification}`),
      md.indexOf(decision.photoFindings),
      md.indexOf("- **§2 ust. 1** — Zwrot w ciągu 14 dni od dostawy."),
      md.indexOf("- **§3 ust. 2–4** — Urządzenie nie nosi śladów użytkowania."),
      md.indexOf(`## ${fm.headings.nextSteps}`),
      md.indexOf("- Zapakuj urządzenie."),
      md.indexOf("- Wyślij paczkę na adres sklepu."),
      ...(status === "NEEDS_INFO"
        ? [
            md.indexOf(`## ${fm.headings.questions}`),
            md.indexOf("1. Kiedy pojawiła się usterka?"),
            md.indexOf("2. Czy urządzenie było zalane?"),
          ]
        : []),
      md.indexOf(fm.disclaimer),
      md.indexOf(`${fm.caseIdPrefix} ${CASE_ID}`),
    ];

    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0);
    expect(positions).toStrictEqual([...positions].sort((a, b) => a - b));
    expect(md.startsWith(fm.greeting)).toBe(true);
  });

  it.each(STATUSES)("includes the verbatim disclaimer exactly once for %s", (status) => {
    const md = composeFirstMessage(CASE_ID, decisionFor(status));
    expect(md.split(fm.disclaimer)).toHaveLength(2);
  });

  it.each(STATUSES)("ends with the case ID line for %s", (status) => {
    const lines = composeFirstMessage(CASE_ID, decisionFor(status)).trimEnd().split("\n");
    const last = lines.at(-1) ?? "";
    expect(last.startsWith(`${fm.caseIdPrefix} `)).toBe(true);
    expect(last.slice(fm.caseIdPrefix.length + 1)).toMatch(CASE_ID_REGEX);
    expect(lines.at(-3)).toBe(fm.disclaimer);
  });

  it.each(STATUSES.filter((s) => s !== "NEEDS_INFO"))(
    "omits the questions section for %s even when questions are present",
    (status) => {
      const md = composeFirstMessage(CASE_ID, decisionFor(status, { questions: ["Czy to pytanie?"] }));
      expect(md).not.toContain(`## ${fm.headings.questions}`);
      expect(md).not.toContain("Czy to pytanie?");
    },
  );

  it("omits the questions section for NEEDS_INFO without questions", () => {
    const md = composeFirstMessage(CASE_ID, decisionFor("NEEDS_INFO", { questions: [] }));
    expect(md).not.toContain(`## ${fm.headings.questions}`);
  });

  it("is deterministic and renders sections as separate markdown blocks", () => {
    const decision = decisionFor("ACCEPTED");
    const md = composeFirstMessage(CASE_ID, decision);
    expect(composeFirstMessage(CASE_ID, decision)).toBe(md);
    expect(md).toContain(`\n\n## ${fm.headings.decision}\n\n**${DECISION_STATUSES.ACCEPTED}**\n\n`);
    expect(md).toContain(`\n\n## ${fm.headings.justification}\n\n`);
    expect(md).toContain(`\n\n## ${fm.headings.nextSteps}\n\n`);
  });

  it("skips a blank photo findings paragraph", () => {
    const md = composeFirstMessage(CASE_ID, decisionFor("REJECTED", { photoFindings: "  " }));
    expect(md).toContain(`## ${fm.headings.justification}\n\n- **§2 ust. 1**`);
  });
});
