// Shared helpers for the check:* scripts — first-pass gates per
// CLAUDE.md → Verificatie. Import recognition (importRefsOf and friends)
// walks the TypeScript AST; the other rules (check:policy, the directive
// and secret-name checks in check:arch) still match regexes over
// comment-stripped source. Tighten those with the parser too if they start
// producing false positives/negatives that matter.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, posix, relative } from "node:path";

// require(), not `import ts from "typescript"`: the ESM loader runs the
// CommonJS export lexer over the whole ~9 MB typescript.js first (about
// a third of check:arch's run time, which runs in the pre-commit hook).
const ts = createRequire(import.meta.url)("typescript");

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
// 3a + Herziening). A walk over the TypeScript AST (`typescript` is a
// devDependency), not a regex: comments and string contents can't produce
// or hide an import, and every syntax form the parser accepts is covered
// (no whitespace needed, Unicode bindings, statements without `;`).
// Recognised forms, each returned as `{ spec, typeOnly }`:
//   import x from "a" / import { y } from "a" / import * as z from "a"
//   export { y } from "a" / export * from "a" / export * as z from "a"
//   import "a"                      (bare, side-effect)
//   import x = require("a")         (TS import-equals)
//   import("a") / await import("a") (dynamic, string literal only)
//   require("a")                    (CommonJS, a call to the identifier `require`)
//   import type { T } from "a" / export type { T } from "a"   → typeOnly
//   import type x = require("a")                              → typeOnly
//   type S = import("a").S / typeof import("a")  (import type) → typeOnly
// An inline `import { type T, f } from "a"` — also when every specifier is
// inline `type` — is NOT type-only (conservative: the fix for a report is
// `import type`). `foo.import(…)`, `foo.require(…)` and `require.resolve(…)`
// are not imports. A dynamic import or `require` whose first argument is
// not a plain string literal (variable, template literal, no argument) is
// recorded as `nonLiteral` instead of a ref.
//
// `fileName` picks the parser mode (`.tsx`/`.jsx` → JSX, otherwise plain
// TS/JS: `<T>x` is a cast there, not JSX). Without it the source is parsed
// as TSX.
const scriptKindOf = (fileName) => {
  const ext = fileName.slice(fileName.lastIndexOf("."));
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
};

const analyses = new Map();

// Parses once per (fileName, source); importRefsOf, hasNonLiteralImport and
// startsWithServerOnly share the result.
export function analyzeModule(source, fileName = "module.tsx") {
  const key = `${fileName}\0${source}`;
  const cached = analyses.get(key);
  if (cached) return cached;

  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, scriptKindOf(fileName));
  const refs = [];
  const exports = [];
  const importBindings = new Map();
  const localExports = new Set();
  const calls = [];
  let nonLiteral = false;

  const literal = (node) => (node && ts.isStringLiteral(node) ? node.text : null);

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const spec = literal(node.moduleSpecifier);
      if (spec !== null) refs.push({ spec, typeOnly: Boolean(node.importClause?.isTypeOnly) });
      const clause = node.importClause;
      if (spec !== null && clause && !clause.isTypeOnly) {
        if (clause.name) importBindings.set(clause.name.text, spec);
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) importBindings.set(clause.namedBindings.name.text, spec);
        else for (const binding of clause.namedBindings?.elements ?? []) {
          if (!binding.isTypeOnly) importBindings.set(binding.name.text, spec);
        }
      }
    } else if (ts.isExportDeclaration(node)) {
      const spec = literal(node.moduleSpecifier);
      if (spec !== null) refs.push({ spec, typeOnly: node.isTypeOnly });
      if (!node.isTypeOnly) {
        if (spec !== null && (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.some((e) => !e.isTypeOnly))) exports.push(spec);
        else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const e of node.exportClause.elements) if (!e.isTypeOnly) localExports.add((e.propertyName ?? e.name).text);
        }
      }
    } else if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      localExports.add(node.expression.text);
    } else if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) if (decl.initializer && ts.isIdentifier(decl.initializer)) localExports.add(decl.initializer.text);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const spec = literal(node.moduleReference.expression);
        if (spec !== null) {
          refs.push({ spec, typeOnly: node.isTypeOnly });
          if (!node.isTypeOnly) importBindings.set(node.name.text, spec);
        } else nonLiteral = true;
      }
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      const spec = ts.isLiteralTypeNode(arg) ? literal(arg.literal) : null;
      if (spec !== null) refs.push({ spec, typeOnly: true });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const spec = literal(node.arguments[0]);
      if (spec !== null) refs.push({ spec, typeOnly: false });
      else nonLiteral = true;
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const receiver = ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) ? expression.expression : null;
      const name = ts.isPropertyAccessExpression(expression) ? expression.name.text :
        ts.isElementAccessExpression(expression) && expression.argumentExpression &&
        (ts.isStringLiteral(expression.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(expression.argumentExpression)) ? expression.argumentExpression.text : null;
      if (name !== null) calls.push({ name, receiver: receiver?.getText(sf) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // The marker as the module's first statement: only directives
  // (`"use strict";`) before it; comments are trivia.
  let first = 0;
  const stmts = sf.statements;
  while (
    first < stmts.length &&
    ts.isExpressionStatement(stmts[first]) &&
    ts.isStringLiteral(stmts[first].expression)
  ) {
    first++;
  }
  const head = stmts[first];
  const markedFirst = Boolean(
    head && ts.isImportDeclaration(head) && !head.importClause && literal(head.moduleSpecifier) === "server-only"
  );

  for (const name of localExports) if (importBindings.has(name)) exports.push(importBindings.get(name));
  const result = { refs, exports, calls, nonLiteral, markedFirst };
  analyses.set(key, result);
  return result;
}

export function importRefsOf(source, fileName) {
  return analyzeModule(source, fileName).refs;
}

export function importsOf(source, fileName) {
  return importRefsOf(source, fileName).map((r) => r.spec);
}

// True when the file has an `import(…)`/`require(…)` whose argument is not
// a single string literal (variable, template literal, expression) — a
// dependency check:arch can't follow (ADR 0021).
export function hasNonLiteralImport(source, fileName) {
  return analyzeModule(source, fileName).nonLiteral;
}

// True when the first statement after the directive prologue is
// `import "server-only"` (ADR 0021, REQUIRED_SERVER_ONLY).
export function startsWithServerOnly(source, fileName) {
  return analyzeModule(source, fileName).markedFirst;
}

// Resolves an import specifier to a file in `files` (a Set of root-relative
// POSIX paths as returned by walk()). `@/x` → `src/x`; a relative path is
// resolved against `fromFile`'s directory. Packages (no `@/`, no `.`) and
// unknown targets → null. Order:
//   - trailing slash (or `.`/`..`): a directory, only <dir>/index.* —
//     never a sibling file with the same name;
//   - otherwise the exact path first, so an explicit `dual.tsx` resolves to
//     dual.tsx even when dual.ts exists (that's what Next loads);
//   - then <path>.<ext> and <path>/index.<ext>;
//   - an explicit source extension without an exact match is substituted:
//     stripped and the same list tried (covers `./x.js` → x.ts).
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const INDEX_SUFFIXES = RESOLVE_EXTS.map((e) => `/index${e}`);
const RESOLVE_SUFFIXES = [...RESOLVE_EXTS, ...INDEX_SUFFIXES];
const SOURCE_EXT_RE = /\.(tsx?|jsx?|mjs)$/;

export function resolveSpec(fromFile, spec, files) {
  let base;
  if (spec.startsWith("@/")) {
    base = posix.join("src", spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = posix.join(posix.dirname(fromFile), spec);
  } else {
    return null;
  }
  const firstOf = (stem, suffixes) => {
    for (const suffix of suffixes) {
      if (files.has(stem + suffix)) return stem + suffix;
    }
    return null;
  };
  if (/(^|\/)\.{0,2}$/.test(spec)) {
    return firstOf(base.replace(/\/+$/, ""), INDEX_SUFFIXES);
  }
  if (files.has(base)) return base;
  const direct = firstOf(base, RESOLVE_SUFFIXES);
  if (direct) return direct;
  if (SOURCE_EXT_RE.test(base)) return firstOf(base.replace(SOURCE_EXT_RE, ""), RESOLVE_SUFFIXES);
  return null;
}

// Strips block and line comments so a docstring that MENTIONS a banned
// pattern (to explain the rule, like ShellProvider.tsx does) doesn't trip
// the same regex that looks for actual usage. Naive (doesn't understand
// strings containing "//"), good enough for this codebase's style — and
// no longer used for import recognition (see importRefsOf).
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
