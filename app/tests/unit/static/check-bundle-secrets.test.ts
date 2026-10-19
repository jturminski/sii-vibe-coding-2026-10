// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APP_DIR } from "./source-files";

// TAC-04/TAC-05: `npm run check:bundle` scans the client bundle in `<appDir>/.next/static`.
// These tests run the real script against throwaway app directories.

const SCRIPT = path.join(APP_DIR, "scripts", "check-bundle-secrets.mjs");
const tempDirs: string[] = [];

function fakeApp(files: Record<string, string> | null): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bundle-check-"));
  tempDirs.push(dir);
  if (files) {
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(dir, ".next", "static", ...name.split("/"));
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }
  return dir;
}

function runCheck(appDir: string) {
  const res = spawnSync(process.execPath, [SCRIPT, appDir], { encoding: "utf8" });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("scripts/check-bundle-secrets.mjs", () => {
  it("passes and reports the file count on a clean bundle", () => {
    const res = runCheck(fakeApp({ "chunks/a.js": "console.log('ok')", "css/b.css": "body{}" }));
    expect(res.output).toMatch(/2 files/);
    expect(res.status).toBe(0);
  });

  it.each([
    ["OPENROUTER_API_KEY", "process.env.OPENROUTER_API_KEY"],
    ["sk-or-", 'const k="sk-or-test"'],
    ["src/server", '"./src/server/env.ts"'],
    ["src/server", '"C:\\\\app\\\\src\\\\server\\\\env.ts"'],
  ])("fails naming the file when the bundle contains %s", (needle, content) => {
    const res = runCheck(fakeApp({ "chunks/ok.js": "1", "chunks/nested/leak.js": content }));
    expect(res.status).not.toBe(0);
    expect(res.output).toContain(needle);
    expect(res.output).toContain("chunks/nested/leak.js");
    expect(res.output).not.toContain("chunks/ok.js");
  });

  it("fails clearly when .next/static does not exist", () => {
    const res = runCheck(fakeApp(null));
    expect(res.status).not.toBe(0);
    expect(res.output).toMatch(/\.next[\\/]static.*not found.*npm run build/i);
  });
});
