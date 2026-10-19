import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CASE_ID_REGEX, LIMITS } from "@/lib/domain";
import type { CaseForm, Decision, ImageReport } from "@/lib/schemas";
import { createCaseStore, type CaseDraft, type CaseStore } from "@/server/store/case-store";

const MINUTE = 60_000;
const T0 = new Date("2026-10-18T10:00:00Z").getTime();

const form = {
  caseType: "RETURN",
  category: "LAPTOP",
  modelName: "Test Laptop 13",
  purchaseDate: "2026-10-10",
  reason: "Nie spełnia oczekiwań.",
} as unknown as CaseForm;

const imageReport = { caseType: "RETURN" } as unknown as ImageReport;

const initialDecision = {
  status: "NEEDS_INFO",
  summary: "Potrzebujemy więcej informacji.",
  photoFindings: "Brak widocznych uszkodzeń.",
  appliedRules: [],
  nextSteps: ["Odpowiedz na pytania."],
  questions: ["Czy zestaw jest kompletny?"],
} as unknown as Decision;

const draft = (): CaseDraft => ({ form, imageReport, initialDecision, messages: [] });

describe("createCaseStore", () => {
  let nowMs: number;
  let store: CaseStore;
  const advance = (minutes: number) => {
    nowMs += minutes * MINUTE;
  };

  beforeEach(() => {
    nowMs = T0;
    store = createCaseStore({ now: () => new Date(nowMs), ttlMinutes: () => 120 });
  });

  it("create assigns a case ID, timestamps and defaults", () => {
    const created = store.create(draft());
    expect(created.id).toMatch(CASE_ID_REGEX);
    expect(created.createdAt).toEqual(new Date(T0));
    expect(created.lastActivityAt).toEqual(new Date(T0));
    expect(created.currentStatus).toBe("NEEDS_INFO");
    expect(created.statusHistory).toEqual([]);
    expect(created.needsInfoRounds).toBe(0);
    expect(created.userMessageCount).toBe(0);
    expect(created.turnInProgress).toBe(false);
    expect(store.get(created.id)).toBe(created);
  });

  it("create accepts a builder that receives the new ID", () => {
    let seenId = "";
    const created = store.create((id) => {
      seenId = id;
      return draft();
    });
    expect(created.id).toBe(seenId);
  });

  it("create stores the case under a preset ID and passes it to the builder", () => {
    let seenId = "";
    const created = store.create(
      (id) => {
        seenId = id;
        return draft();
      },
      { id: "HSC-20261018-AB12" },
    );
    expect(created.id).toBe("HSC-20261018-AB12");
    expect(seenId).toBe("HSC-20261018-AB12");
    expect(store.get("HSC-20261018-AB12")).toBe(created);
  });

  it("create rejects a preset ID that is already stored, keeping the existing case", () => {
    const first = store.create(draft(), { id: "HSC-20261018-AB12" });
    expect(() => store.create(draft(), { id: "HSC-20261018-AB12" })).toThrow(/already exists/);
    expect(store.get("HSC-20261018-AB12")).toBe(first);
    expect(store.size()).toBe(1);
  });

  it("create rejects a preset ID that does not match the case ID format", () => {
    expect(() => store.create(draft(), { id: "HSC-2026-x" })).toThrow(/Invalid case id/);
    expect(store.size()).toBe(0);
  });

  it("get returns undefined for an unknown ID", () => {
    expect(store.get("HSC-20261018-ZZZZ")).toBeUndefined();
  });

  it("expires a case idle for 121 minutes", () => {
    const { id } = store.create(draft());
    advance(121);
    expect(store.get(id)).toBeUndefined();
    advance(-121);
    expect(store.get(id)).toBeUndefined();
  });

  it("a get at 119 minutes extends the TTL", () => {
    const { id } = store.create(draft());
    advance(119);
    expect(store.get(id)?.lastActivityAt).toEqual(new Date(nowMs));
    advance(119);
    expect(store.get(id)).toBeDefined();
  });

  it("reads the TTL lazily from the injected getter", () => {
    let ttl = 120;
    store = createCaseStore({ now: () => new Date(nowMs), ttlMinutes: () => ttl });
    const { id } = store.create(draft());
    ttl = 10;
    advance(11);
    expect(store.get(id)).toBeUndefined();
  });

  it("update applies the mutator, refreshes activity and returns the case", () => {
    const { id } = store.create(draft());
    advance(5);
    const updated = store.update(id, (c) => {
      c.userMessageCount += 1;
      c.turnInProgress = true;
    });
    expect(updated?.userMessageCount).toBe(1);
    expect(updated?.turnInProgress).toBe(true);
    expect(updated?.lastActivityAt).toEqual(new Date(nowMs));
    expect(store.get(id)?.userMessageCount).toBe(1);
  });

  it("update returns undefined for a missing or expired case without calling the mutator", () => {
    const { id } = store.create(draft());
    advance(121);
    const mutator = vi.fn();
    expect(store.update(id, mutator)).toBeUndefined();
    expect(store.update("HSC-20261018-ZZZZ", mutator)).toBeUndefined();
    expect(mutator).not.toHaveBeenCalled();
  });

  it("delete removes the case", () => {
    const { id } = store.create(draft());
    expect(store.delete(id)).toBe(true);
    expect(store.get(id)).toBeUndefined();
    expect(store.delete(id)).toBe(false);
  });

  it("sweep removes expired cases and keeps active ones", () => {
    const old = store.create(draft());
    advance(60);
    const fresh = store.create(draft());
    advance(61);
    expect(store.sweep()).toBe(1);
    expect(store.size()).toBe(1);
    expect(store.get(old.id)).toBeUndefined();
    expect(store.get(fresh.id)).toBeDefined();
  });

  it(`caps at ${LIMITS.MAX_CASES}: 501 creates keep 500 and evict the oldest lastActivityAt`, () => {
    const ids: string[] = [];
    for (let i = 0; i < LIMITS.MAX_CASES + 1; i++) {
      ids.push(store.create(draft()).id);
      nowMs += 1000;
    }
    expect(store.size()).toBe(LIMITS.MAX_CASES);
    expect(store.get(ids[0]!)).toBeUndefined();
    expect(store.get(ids[1]!)).toBeDefined();
    expect(store.get(ids[LIMITS.MAX_CASES]!)).toBeDefined();
  });

  it("evicts by lastActivityAt, not creation order", () => {
    store = createCaseStore({ now: () => new Date(nowMs), ttlMinutes: () => 120, maxCases: 2 });
    const a = store.create(draft());
    advance(1);
    const b = store.create(draft());
    advance(1);
    store.get(a.id);
    advance(1);
    store.create(draft());
    expect(store.get(a.id)).toBeDefined();
    expect(store.get(b.id)).toBeUndefined();
  });

  it("snapshotStatus / restoreStatus round-trip status, history and needsInfoRounds", () => {
    const { id } = store.create(draft());
    store.update(id, (c) => {
      c.statusHistory.push({ status: "NEEDS_INFO", reason: "Start", appliedRules: [], at: new Date(nowMs) });
      c.needsInfoRounds = 1;
    });
    const snap = store.snapshotStatus(id);
    expect(snap).toBeDefined();

    store.update(id, (c) => {
      c.currentStatus = "ACCEPTED";
      c.statusHistory.push({ status: "ACCEPTED", reason: "OK", appliedRules: [], at: new Date(nowMs) });
      c.needsInfoRounds = 2;
      c.userMessageCount = 3;
    });

    expect(store.restoreStatus(id, snap!)).toBe(true);
    const restored = store.get(id)!;
    expect(restored.currentStatus).toBe("NEEDS_INFO");
    expect(restored.statusHistory).toEqual([
      { status: "NEEDS_INFO", reason: "Start", appliedRules: [], at: new Date(T0) },
    ]);
    expect(restored.needsInfoRounds).toBe(1);
    expect(restored.userMessageCount).toBe(3);
  });

  it("snapshotStatus is isolated from later mutations of the history", () => {
    const { id } = store.create(draft());
    const snap = store.snapshotStatus(id)!;
    store.update(id, (c) => {
      c.statusHistory.push({ status: "ACCEPTED", reason: "OK", appliedRules: [], at: new Date(nowMs) });
    });
    expect(snap.statusHistory).toEqual([]);
  });

  it("snapshotStatus / restoreStatus handle a missing case", () => {
    expect(store.snapshotStatus("HSC-20261018-ZZZZ")).toBeUndefined();
    expect(
      store.restoreStatus("HSC-20261018-ZZZZ", {
        currentStatus: "ACCEPTED",
        statusHistory: [],
        needsInfoRounds: 0,
      }),
    ).toBe(false);
  });

  describe("interval sweep", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("sweeps expired cases every sweepIntervalMs and stops on dispose", () => {
      // The TTL getter is read once per case checked, so its calls reveal sweeps that no accessor triggered.
      const ttlMinutes = vi.fn(() => 120);
      store = createCaseStore({ now: () => new Date(nowMs), ttlMinutes, sweepIntervalMs: 5 * MINUTE });
      store.create(draft());
      advance(121);
      ttlMinutes.mockClear();
      vi.advanceTimersByTime(5 * MINUTE);
      expect(ttlMinutes).toHaveBeenCalledTimes(1);
      expect(store.size()).toBe(0);

      store.create(draft());
      store.dispose();
      expect(vi.getTimerCount()).toBe(0);
      ttlMinutes.mockClear();
      vi.advanceTimersByTime(5 * MINUTE);
      expect(ttlMinutes).not.toHaveBeenCalled();
    });
  });
});

describe("caseStore singleton", () => {
  afterEach(() => {
    delete (globalThis as { __hscCaseStore?: unknown }).__hscCaseStore;
    vi.resetModules();
  });

  it("lives on globalThis.__hscCaseStore and survives module reloads", async () => {
    const first = (await import("@/server/store/case-store")).caseStore;
    expect((globalThis as { __hscCaseStore?: unknown }).__hscCaseStore).toBe(first);
    vi.resetModules();
    const second = (await import("@/server/store/case-store")).caseStore;
    expect(second).toBe(first);
    first.dispose();
  });
});
