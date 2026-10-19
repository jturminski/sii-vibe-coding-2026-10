import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ POLICIES_DIR: "../docs/policies" }));
vi.mock("@/server/env", () => ({ getEnv: () => env }));

import { getPolicy, resetPolicyCache } from "@/server/policies";

describe("getPolicy", () => {
  beforeEach(() => {
    env.POLICIES_DIR = "../docs/policies";
    resetPolicyCache();
  });

  afterEach(() => {
    resetPolicyCache();
  });

  it("loads the real return policy from POLICIES_DIR", async () => {
    const text = await getPolicy("RETURN");
    expect(text).toContain("§2");
    expect(text).toMatch(/withdrawal/i);
  });

  it("loads the real complaint policy from POLICIES_DIR", async () => {
    const text = await getPolicy("COMPLAINT");
    expect(text).toContain("§2");
    expect(text).toMatch(/liability/i);
  });

  it("throws a clear error naming the file when the directory is missing", async () => {
    env.POLICIES_DIR = "./no-such-policies-dir";
    await expect(getPolicy("RETURN")).rejects.toThrow(/return-policy\.md/);
    await expect(getPolicy("COMPLAINT")).rejects.toThrow(/complaint-policy\.md/);
  });

  it("reads once and serves later calls from the cache", async () => {
    const first = await getPolicy("RETURN");
    env.POLICIES_DIR = "./no-such-policies-dir";
    await expect(getPolicy("RETURN")).resolves.toBe(first);
  });

  it("re-reads from disk after resetPolicyCache", async () => {
    await getPolicy("RETURN");
    env.POLICIES_DIR = "./no-such-policies-dir";
    resetPolicyCache();
    await expect(getPolicy("RETURN")).rejects.toThrow(/return-policy\.md/);
  });
});
