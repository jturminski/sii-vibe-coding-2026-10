import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** Absolute path of `app/`, resolved from this file so the checks work from any cwd. */
export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const SRC_DIR = path.join(APP_DIR, "src");

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Recursively lists source files under `dir` (absolute paths), sorted for stable output. */
export function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
  };
  walk(dir);
  return files.sort();
}

/** Path relative to `app/` with forward slashes, for readable failure messages on every OS. */
export function rel(file: string): string {
  return path.relative(APP_DIR, file).split(path.sep).join("/");
}

export function readSource(file: string): string {
  return readFileSync(file, "utf8");
}

export function parse(file: string): ts.SourceFile {
  const kind = file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, readSource(file), ts.ScriptTarget.Latest, true, kind);
}

/** Visits every node of `source` depth-first. */
export function visit(source: ts.SourceFile, fn: (node: ts.Node) => void): void {
  const walk = (node: ts.Node) => {
    fn(node);
    ts.forEachChild(node, walk);
  };
  walk(source);
}

/** Line number (1-based) of `node`, for failure messages. */
export function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}
