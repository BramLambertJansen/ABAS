// Shared helpers for the check:* scripts. Deliberately dependency-free
// (regex over source text, not a real AST) — first-pass gates per
// CLAUDE.md → Verificatie. Tighten with a real parser if these start
// producing false positives/negatives that matter.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, posix } from "node:path";

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

// Conservative source scanner, not a JavaScript parser (ADR 0021).
export function importRefsOf(source) {
  const clean = stripComments(source);
  const refs = [];
  const staticImport = /\b(import|export)\s+(type\s+)?(?:[^;"']*?\sfrom\s*)?["']([^"']+)["']/g;
  for (const match of clean.matchAll(staticImport)) {
    refs.push({ spec: match[3], typeOnly: Boolean(match[2]),
      sideEffect: /^import\s*["']/.test(match[0]) });
  }
  for (const match of clean.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    refs.push({ spec: match[1], typeOnly: false, sideEffect: false });
  }
  return refs;
}

export function importsOf(source) {
  return importRefsOf(source).map((ref) => ref.spec);
}

export function hasNonLiteralImport(source) {
  const clean = stripComments(source);
  for (const match of clean.matchAll(/\b(?:import|require)\s*\(/g)) {
    if (!/^\s*(["'])[^"'\\]*\1\s*\)/.test(clean.slice(match.index + match[0].length))) return true;
  }
  return false;
}

export function resolveSpec(fromFile, spec, files) {
  let path;
  if (spec.startsWith("@/")) path = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) path = posix.join(posix.dirname(fromFile), spec);
  else return null;
  path = posix.normalize(path).replace(/\.(ts|tsx|js|jsx|mjs)$/, "");
  if (!path.startsWith("src/")) return null;
  for (const suffix of [".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx"]) {
    if (files.has(path + suffix)) return path + suffix;
  }
  return null;
}

// Strips block and line comments so a docstring that MENTIONS a banned
// pattern (to explain the rule, like ShellProvider.tsx does) doesn't trip
// the same regex that looks for actual usage. Naive (doesn't understand
// strings containing "//"), good enough for this codebase's style.
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function fail(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}
