import { describe, expect, it } from "vitest";
import { currentStatus } from "@/components/case/current-status";
import type { DecisionUpdateResult, HscUIMessage } from "@/lib/schemas";

const result = (status: DecisionUpdateResult["status"]): DecisionUpdateResult => ({
  status,
  label: status,
  reason: "Powód zmiany.",
  appliedRules: [{ ref: "§4 ust. 2", explanation: "Wyjaśnienie." }],
  disclaimer: "Zastrzeżenie.",
});

const input = { status: "MANUAL_REVIEW" as const, reason: "Powód.", appliedRules: [{ ref: "§4 ust. 2", explanation: "x" }] };

function assistant(id: string, parts: HscUIMessage["parts"]): HscUIMessage {
  return { id, role: "assistant", parts };
}

describe("currentStatus (ADR-004 §3 Case summary panel)", () => {
  it("falls back to the initial status without any update", () => {
    const messages = [assistant("a1", [{ type: "text", text: "Dzień dobry" }])];
    expect(currentStatus(messages, "ACCEPTED")).toBe("ACCEPTED");
  });

  it("uses the output status of the last tool-updateDecision part", () => {
    const messages: HscUIMessage[] = [
      assistant("a1", [{ type: "text", text: "Dzień dobry" }]),
      { id: "u1", role: "user", parts: [{ type: "text", text: "Pytanie" }] },
      assistant("a2", [
        { type: "tool-updateDecision", toolCallId: "c1", state: "output-available", input, output: result("NEEDS_INFO") },
      ]),
      { id: "u2", role: "user", parts: [{ type: "text", text: "Odpowiedź" }] },
      assistant("a3", [
        { type: "text", text: "Zmieniam" },
        { type: "tool-updateDecision", toolCallId: "c2", state: "output-available", input, output: result("MANUAL_REVIEW") },
      ]),
    ];
    expect(currentStatus(messages, "REJECTED")).toBe("MANUAL_REVIEW");
  });

  it("ignores tool parts that have no output yet or failed", () => {
    const messages: HscUIMessage[] = [
      assistant("a1", [
        { type: "tool-updateDecision", toolCallId: "c1", state: "output-available", input, output: result("NEEDS_INFO") },
      ]),
      assistant("a2", [
        { type: "tool-updateDecision", toolCallId: "c2", state: "input-available", input },
        { type: "tool-updateDecision", toolCallId: "c3", state: "output-error", input, errorText: "x" },
      ]),
    ];
    expect(currentStatus(messages, "REJECTED")).toBe("NEEDS_INFO");
  });
});
