#!/usr/bin/env node
// TAC-04 / TAC-05 (ADR-000): the client bundle must not contain the OpenRouter key name, an
// OpenRouter key value, or any reference to server-only source under src/server.
//
// Usage: node scripts/check-bundle-secrets.mjs [appDir]   (default: the app directory)
// Run after `npm run build`. Exits 1 with a list of offending files, or 0 when clean.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORBIDDEN = [
  { label: "OPENROUTER_API_KEY", pattern: /OPENROUTER_API_KEY/ },
  { label: "sk-or-", pattern: /sk-or-/ },
  // Matches POSIX and (escaped) Windows separators: src/server, src\server, src\\server.
  { label: "src/server", pattern: /src[\\/]+server/ },
];

const appDir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const staticDir = path.join(appDir, ".next", "static");

if (!existsSync(staticDir) || !statSync(staticDir).isDirectory()) {
  console.error(`check:bundle FAILED: ${staticDir} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

/** Recursively lists files under `dir` using fs APIs only (no shell globs; Windows-safe). */
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.isFile() ? [full] : [];
  });
}

const files = listFiles(staticDir);
const findings = [];
for (const file of files) {
  const content = readFileSync(file, "latin1");
  for (const { label, pattern } of FORBIDDEN) {
    if (pattern.test(content)) {
      findings.push(`  ${path.relative(staticDir, file).split(path.sep).join("/")}: contains ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error(`check:bundle FAILED: forbidden content in ${staticDir}:`);
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`check:bundle OK: scanned ${files.length} files in ${staticDir}; no forbidden content.`);
