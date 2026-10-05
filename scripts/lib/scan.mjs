// Shared helpers for the check:* scripts. Deliberately dependency-free
// (regex over source text, not a real AST) — first-pass gates per
// CLAUDE.md → Verificatie. Tighten with a real parser if these start
// producing false positives/negatives that matter.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";

const SRC_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

export function walk(dir, root = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, root));
    } else if (SRC_EXT.has(entry.slice(entry.lastIndexOf(".")))) {
      // De regels matchen POSIX-paden; normaliseer ook op Windows. Anders
      // missen shell-/cookiegrenzen en worden toegestane imports afgekeurd.
      out.push(relative(root, full).replaceAll("\\", "/"));
    }
  }
  return out;
}

export function read(root, relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

// Import recognition (ADR 0021, docs/features/server-only-afscherming.md →
// 3a). Runs on comment-stripped source, so example code in a docstring
// doesn't count as an import. Recognised forms, each returned as
// `{ spec, typeOnly }`:
//   import x from "a" / import { y } from "a" / import * as z from "a"
//   export { y } from "a" / export * from "a" / export * as z from "a"
//   import "a"                     (bare, side-effect)
//   import("a") / await import("a") (dynamic, string literal only)
//   require("a")                   (CommonJS, string literal only)
//   import type { T } from "a" / export type { T } from "a"  → typeOnly
// An inline `import { type T, f } from "a"` is NOT type-only (conservative:
// the fix for a report is `import type`). The lookbehind keeps `foo.import(`
// and `myrequire(` out (`import.meta` never matches: no `(`, string or `from`).
// Bindings are Unicode identifiers (`import Ä from "a"`), and no whitespace
// is needed before `{`, `*` or a string (`import{x}from"a"`).
//
// The clause between the keyword and `from` follows the import/export
// grammar instead of a free character class: an optional default binding
// (never the keyword `import`/`export`), then `* [as x]` or one `{ … }`
// (closed by its first `}`). That way a match can't run across a statement
// boundary without a semicolon — e.g. `export type { Q }` followed by
// `import { f } from "a"` on the next line must yield a runtime import of
// "a", not a type-only one.
const ID = String.raw`[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*`;
const NOT_AFTER = String.raw`(?<![\p{ID_Continue}$\u200C\u200D.])`;
// After a keyword: whitespace, or none when the next token is `{`, `*` or a
// string (`import{x}from"a"`); `importx from "a"` stays an identifier.
const GAP = String.raw`(?:\s+|\s*(?=[{*"']))`;
const FROM_RE = new RegExp(
  String.raw`${NOT_AFTER}(?:import|export)${GAP}(type${GAP}(?!from(?![\p{ID_Continue}$])))?(?:(?!(?:import|export)(?![\p{ID_Continue}$]))${ID}\s*,?\s*)?(?:\*\s*(?:as\s+${ID}\s*)?|\{[^{}]*\}\s*)?from\s*["']([^"']+)["']`,
  "gu"
);
const BARE_IMPORT_RE = new RegExp(String.raw`${NOT_AFTER}import\s*["']([^"']+)["']`, "gu");
const CALL_IMPORT_RE = new RegExp(
  String.raw`${NOT_AFTER}(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)`,
  "gu"
);
const ANY_CALL_RE = new RegExp(String.raw`${NOT_AFTER}(?:import|require)\s*\(`, "gu");
const LITERAL_ARG_RE = /^\s*["'][^"'`]*["']\s*\)/;

export function importRefsOf(source) {
  const code = stripComments(source);
  const refs = [];
  let m;
  FROM_RE.lastIndex = 0;
  while ((m = FROM_RE.exec(code))) refs.push({ spec: m[2], typeOnly: Boolean(m[1]) });
  BARE_IMPORT_RE.lastIndex = 0;
  while ((m = BARE_IMPORT_RE.exec(code))) refs.push({ spec: m[1], typeOnly: false });
  CALL_IMPORT_RE.lastIndex = 0;
  while ((m = CALL_IMPORT_RE.exec(code))) refs.push({ spec: m[1], typeOnly: false });
  return refs;
}

export function importsOf(source) {
  return importRefsOf(source).map((r) => r.spec);
}

// True when the file has an `import(…)`/`require(…)` whose argument is not
// a single string literal (variable, template literal, expression) — a
// dependency check:arch can't follow (ADR 0021).
export function hasNonLiteralImport(source) {
  const code = stripComments(source);
  let m;
  ANY_CALL_RE.lastIndex = 0;
  while ((m = ANY_CALL_RE.exec(code))) {
    if (!LITERAL_ARG_RE.test(code.slice(m.index + m[0].length))) return true;
  }
  return false;
}

// Resolves an import specifier to a file in `files` (a Set of root-relative
// POSIX paths as returned by walk()). `@/x` → `src/x`; a relative path is
// resolved against `fromFile`'s directory. An explicit source extension is
// stripped first (as is a trailing slash), then the extensions walk()
// collects and the same set as /index.* are tried in that order. Packages
// (no `@/`, no `.`) and unknown targets → null.
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const RESOLVE_SUFFIXES = [...RESOLVE_EXTS, ...RESOLVE_EXTS.map((e) => `/index${e}`)];

export function resolveSpec(fromFile, spec, files) {
  let base;
  if (spec.startsWith("@/")) {
    base = posix.join("src", spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = posix.join(posix.dirname(fromFile), spec);
  } else {
    return null;
  }
  base = base.replace(/\/+$/, "").replace(/\.(tsx?|jsx?|mjs)$/, "");
  for (const suffix of RESOLVE_SUFFIXES) {
    if (files.has(base + suffix)) return base + suffix;
  }
  return null;
}

// Strips block and line comments so a docstring that MENTIONS a banned
// pattern (to explain the rule, like ShellProvider.tsx does) doesn't trip
// the same regex that looks for actual usage. Naive (doesn't understand
// strings containing "//"), good enough for this codebase's style.
export function stripComments(source) {
  return source
    // A space, not "": `import/**/x from "a"` must stay two tokens. No
    // caller relies on offsets or line numbers in the stripped text.
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function fail(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}
