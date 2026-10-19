// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { pl } from "@/lib/i18n/pl";

// TAC-004-01: component files hold no Polish text; every UI string comes from `lib/i18n/pl`.
const COMPONENTS_DIR = join(__dirname, "../../../src/components/case");
const POLISH_DIACRITIC = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/u;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function plStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(plStrings);
  return [];
}

/** Text of every string literal, template chunk and JSX text in the file; comments are not included. */
function literalsOf(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push(node.text);
    } else if (ts.isJsxText(node) && node.text.trim()) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Literals that contain a Polish diacritic or equal a `pl` string. */
function polishLiterals(fileName: string, source: string): string[] {
  const known = new Set(plStrings(pl).map((text) => text.trim()));
  return literalsOf(fileName, source).filter((text) => POLISH_DIACRITIC.test(text) || known.has(text.trim()));
}

const files = tsxFiles(COMPONENTS_DIR);

describe("i18n literals in src/components/case (TAC-004-01)", () => {
  it("scans every component file", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("finds Polish text in string literals, templates and JSX text, but not in comments", () => {
    const sample = [
      "// Usuń: a comment may name the Polish label",
      'const a = "Zdjęcie";',
      "const b = `Liczba ${1} znaków`;",
      `const c = ${JSON.stringify(pl.chat.send)};`,
      "const d = <p>Rozmowa</p>;",
      'const e = "Status code";',
    ].join("\n");
    expect(polishLiterals("sample.tsx", sample)).toEqual(["Zdjęcie", " znaków", pl.chat.send, "Rozmowa"]);
  });

  it.each(files.map((path) => [relative(COMPONENTS_DIR, path), path]))("%s has no Polish literals", (_name, path) => {
    expect(polishLiterals(path, readFileSync(path, "utf8"))).toEqual([]);
  });
});
