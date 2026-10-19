// @vitest-environment node
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SRC_DIR, lineOf, listSourceFiles, parse, readSource, rel, visit } from "./source-files";

// Static architecture checks over `src/**` (ADR-000 TAC-04, ADR-002 TAC-002-05,
// ADR-003 TAC-003-01/02/04, and the src/lib import boundary). Each describe block reports how many
// files or call sites it inspected in its test title, and asserts that number is non-zero, so a
// rule can never pass vacuously because its file selection matched nothing.

const SERVER_DIR = path.join(SRC_DIR, "server");
const COMPONENTS_DIR = path.join(SRC_DIR, "components");
const LIB_DIR = path.join(SRC_DIR, "lib");
const API_DIR = path.join(SRC_DIR, "app", "api");
const PROMPTS_DIR = path.join(SERVER_DIR, "ai", "prompts");
/** Helpers and selectors shared by the prompt modules; it holds no prompt text of its own. */
const PROMPT_HELPER_FILES = new Set(["shared.ts"]);

const allSrcFiles = listSourceFiles(SRC_DIR);
const serverFiles = listSourceFiles(SERVER_DIR);
const libFiles = listSourceFiles(LIB_DIR);
const routeFiles = listSourceFiles(API_DIR).filter((f) => /^route\.[cm]?[jt]sx?$/.test(path.basename(f)));
const promptFiles = listSourceFiles(PROMPTS_DIR).filter((f) => !PROMPT_HELPER_FILES.has(path.basename(f)));

const isInside = (file: string, dir: string) => {
  const r = path.relative(dir, file);
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
};

const hasExportModifier = (node: ts.Node) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** Names a module exports at top level (declarations and `export { a as b }` lists). */
function exportedNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const stmt of source.statements) {
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      hasExportModifier(stmt) &&
      stmt.name
    ) {
      names.add(stmt.name.text);
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) names.add(el.name.text);
    }
  }
  return names;
}

describe("TAC-003-01: forbidden AI SDK APIs", () => {
  const FORBIDDEN = /\b(generateObject|streamObject|stepCountIs|toDataStreamResponse)\b/;

  it(`no file under src/ mentions generateObject, streamObject, stepCountIs or toDataStreamResponse (${allSrcFiles.length} files)`, () => {
    expect(allSrcFiles.length).toBeGreaterThan(0);
    const offenders = allSrcFiles.flatMap((file) =>
      readSource(file)
        .split(/\r?\n/)
        .flatMap((line, i) => {
          const match = FORBIDDEN.exec(line);
          return match ? [`${rel(file)}:${i + 1} uses ${match[1]}`] : [];
        }),
    );
    expect(offenders).toEqual([]);
  });
});

describe("TAC-04: server-only guard", () => {
  it(`every src/server module starts with import "server-only" (${serverFiles.length} files)`, () => {
    expect(serverFiles.length).toBeGreaterThan(0);
    const offenders = serverFiles.filter((file) => {
      const first = parse(file).statements[0];
      return !(
        first &&
        ts.isImportDeclaration(first) &&
        !first.importClause &&
        ts.isStringLiteral(first.moduleSpecifier) &&
        first.moduleSpecifier.text === "server-only"
      );
    });
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("TAC-003-02: model calls are abortable", () => {
  const MODEL_CALLS = new Set(["generateText", "streamText"]);
  const callSites: { where: string; ok: boolean }[] = [];
  for (const file of allSrcFiles) {
    const source = parse(file);
    visit(source, (node) => {
      if (!ts.isCallExpression(node)) return;
      const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
      if (!ts.isIdentifier(callee) || !MODEL_CALLS.has(callee.text)) return;
      const options = node.arguments[0];
      const ok =
        options !== undefined &&
        ts.isObjectLiteralExpression(options) &&
        options.properties.some(
          (p) =>
            (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
            ts.isIdentifier(p.name) &&
            p.name.text === "abortSignal",
        );
      callSites.push({ where: `${rel(file)}:${lineOf(source, node)} ${callee.text}`, ok });
    });
  }

  it(`every generateText/streamText call passes abortSignal in its options literal (${callSites.length} call sites)`, () => {
    expect(callSites.length).toBeGreaterThan(0);
    expect(callSites.filter((c) => !c.ok).map((c) => c.where)).toEqual([]);
  });
});

describe("TAC-003-04: prompt versions", () => {
  it(`every prompt module exports PROMPT_VERSION (${promptFiles.length} files)`, () => {
    expect(promptFiles.length).toBeGreaterThan(0);
    const offenders = promptFiles.filter((file) => !exportedNames(parse(file)).has("PROMPT_VERSION"));
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("TAC-002-05: route handlers use the default runtime", () => {
  it(`no src/app/api route.ts exports runtime (${routeFiles.length} files)`, () => {
    expect(routeFiles.length).toBeGreaterThan(0);
    const offenders = routeFiles.filter((file) => exportedNames(parse(file)).has("runtime"));
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("Import boundaries: src/lib is shared and stays framework-light", () => {
  /** Every module specifier in a file: static imports, re-exports, dynamic import() and require(). */
  function specifiers(source: ts.SourceFile): ts.StringLiteralLike[] {
    const found: ts.StringLiteralLike[] = [];
    visit(source, (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (ts.isStringLiteralLike(node.moduleSpecifier)) found.push(node.moduleSpecifier);
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) found.push(arg);
      }
    });
    return found;
  }

  function isForbidden(file: string, spec: string): boolean {
    if (/^@\/(server|components)(\/|$)/.test(spec)) return true;
    if (spec.startsWith(".")) {
      const target = path.resolve(path.dirname(file), spec);
      return isInside(target, SERVER_DIR) || isInside(target, COMPONENTS_DIR);
    }
    return false;
  }

  const imports = libFiles.flatMap((file) => {
    const source = parse(file);
    return specifiers(source).map((s) => ({
      where: `${rel(file)}:${lineOf(source, s)} imports ${s.text}`,
      forbidden: isForbidden(file, s.text),
    }));
  });

  it(`src/lib imports nothing from @/server or @/components (${libFiles.length} files, ${imports.length} imports)`, () => {
    expect(libFiles.length).toBeGreaterThan(0);
    expect(imports.filter((i) => i.forbidden).map((i) => i.where)).toEqual([]);
  });
});
