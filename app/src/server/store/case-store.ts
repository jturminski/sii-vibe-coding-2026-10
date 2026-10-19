import "server-only";
import { CASE_ID_REGEX, LIMITS, type DecisionStatus } from "@/lib/domain";
import type { CaseForm, Decision, DecisionUpdate, HscUIMessage, ImageReport } from "@/lib/schemas";
import { getEnv } from "@/server/env";
import { createCaseId } from "./case-id";

/** One `updateDecision` status change (ADR-000 §5, DecisionUpdate appended to Case.statusHistory). */
export type StatusHistoryEntry = DecisionUpdate & { at: Date };

/** Server-owned case state (ADR-000 §5, D3). */
export type Case = {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  form: CaseForm;
  imageReport: ImageReport;
  initialDecision: Decision;
  currentStatus: DecisionStatus;
  statusHistory: StatusHistoryEntry[];
  needsInfoRounds: number;
  userMessageCount: number;
  messages: HscUIMessage[];
  turnInProgress: boolean;
};

type CaseDefaults = "currentStatus" | "statusHistory" | "needsInfoRounds" | "userMessageCount" | "turnInProgress";

/** Input for `create`: required content plus optional overrides of the defaults. */
export type CaseDraft = Omit<Case, "id" | "createdAt" | "lastActivityAt" | CaseDefaults> &
  Partial<Pick<Case, CaseDefaults>>;

/** Status fields restored when a chat turn fails (`snapshotStatus` / `restoreStatus`). */
export type StatusSnapshot = Pick<Case, "currentStatus" | "statusHistory" | "needsInfoRounds">;

export type CaseStore = {
  /**
   * Stores a new case; a function draft receives its ID (e.g. for the `data-case` part).
   * `options.id` presets the ID (created earlier with `createCaseId`); a duplicate or malformed one throws.
   */
  create(draft: CaseDraft | ((id: string) => CaseDraft), options?: { id?: string }): Case;
  /** Returns the case and refreshes `lastActivityAt`; undefined when missing or expired. */
  get(id: string): Case | undefined;
  /** Mutates the case in place and refreshes `lastActivityAt`; undefined when missing or expired. */
  update(id: string, mutator: (c: Case) => void): Case | undefined;
  delete(id: string): boolean;
  /** Removes expired cases and returns how many were removed. */
  sweep(): number;
  size(): number;
  snapshotStatus(id: string): StatusSnapshot | undefined;
  restoreStatus(id: string, snapshot: StatusSnapshot): boolean;
  /** Stops the interval sweep. */
  dispose(): void;
};

export type CaseStoreOptions = {
  now?: () => Date;
  ttlMinutes?: () => number;
  maxCases?: number;
  /** Interval sweep period; omitted means no interval sweep. */
  sweepIntervalMs?: number;
};

const MS_PER_MINUTE = 60_000;

export function createCaseStore(options: CaseStoreOptions = {}): CaseStore {
  const now = options.now ?? (() => new Date());
  const ttlMinutes = options.ttlMinutes ?? (() => getEnv().CASE_TTL_MINUTES);
  const maxCases = options.maxCases ?? LIMITS.MAX_CASES;
  const cases = new Map<string, Case>();

  const isExpired = (c: Case, at: Date) =>
    at.getTime() - c.lastActivityAt.getTime() > ttlMinutes() * MS_PER_MINUTE;

  function sweep(): number {
    const at = now();
    let removed = 0;
    for (const [id, c] of cases) {
      if (isExpired(c, at)) {
        cases.delete(id);
        removed++;
      }
    }
    return removed;
  }

  function evictOldest(): void {
    let oldest: Case | undefined;
    for (const c of cases.values()) {
      if (!oldest || c.lastActivityAt < oldest.lastActivityAt) oldest = c;
    }
    if (oldest) cases.delete(oldest.id);
  }

  /** Lazy sweep, then the live case with refreshed activity. */
  function touch(id: string): Case | undefined {
    sweep();
    const c = cases.get(id);
    if (c) c.lastActivityAt = now();
    return c;
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  if (options.sweepIntervalMs) {
    timer = setInterval(sweep, options.sweepIntervalMs);
    (timer as { unref?: () => void }).unref?.();
  }

  return {
    create(draftOrBuilder, options = {}) {
      sweep();
      const preset = options.id;
      if (preset !== undefined) {
        if (!CASE_ID_REGEX.test(preset)) throw new Error(`Invalid case id: ${preset}`);
        if (cases.has(preset)) throw new Error(`Case ${preset} already exists`);
      }
      while (cases.size >= maxCases) evictOldest();
      const at = now();
      const id = preset ?? createCaseId(at, (candidate) => cases.has(candidate));
      const draft = typeof draftOrBuilder === "function" ? draftOrBuilder(id) : draftOrBuilder;
      const created: Case = {
        currentStatus: draft.initialDecision.status,
        statusHistory: [],
        needsInfoRounds: 0,
        userMessageCount: 0,
        turnInProgress: false,
        ...draft,
        id,
        createdAt: at,
        lastActivityAt: at,
      };
      cases.set(id, created);
      return created;
    },
    get: touch,
    update(id, mutator) {
      const c = touch(id);
      if (c) mutator(c);
      return c;
    },
    delete(id) {
      sweep();
      return cases.delete(id);
    },
    sweep,
    size() {
      sweep();
      return cases.size;
    },
    snapshotStatus(id) {
      const c = touch(id);
      if (!c) return undefined;
      return structuredClone({
        currentStatus: c.currentStatus,
        statusHistory: c.statusHistory,
        needsInfoRounds: c.needsInfoRounds,
      });
    },
    restoreStatus(id, snapshot) {
      const c = touch(id);
      if (!c) return false;
      const copy = structuredClone(snapshot);
      c.currentStatus = copy.currentStatus;
      c.statusHistory = copy.statusHistory;
      c.needsInfoRounds = copy.needsInfoRounds;
      return true;
    },
    dispose() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}

const SWEEP_INTERVAL_MS = 5 * MS_PER_MINUTE;

const globalForStore = globalThis as typeof globalThis & { __hscCaseStore?: CaseStore };

/** Process-wide store kept on `globalThis` so it survives dev hot reloads (ADR-000 D3). */
export const caseStore: CaseStore = (globalForStore.__hscCaseStore ??= createCaseStore({
  sweepIntervalMs: SWEEP_INTERVAL_MS,
}));
