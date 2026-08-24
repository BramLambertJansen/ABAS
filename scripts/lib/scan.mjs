// Shared helpers for the check:* scripts. Deliberately dependency-free
// (regex over source text, not a real AST) — first-pass gates per
// CLAUDE.md → Verificatie. Tighten with a real parser if these start
// producing false positives/negatives that matter.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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
      out.push(relative(root, full));
    }
  }
  return out;
}

export function read(root, relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

// Matches `import ... from "x"` and `export ... from "x"` (single or
// double quotes), returning the module specifiers referenced by a file.
const IMPORT_RE = /(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;

export function importsOf(source) {
  const specs = [];
  let m;
  while ((m = IMPORT_RE.exec(source))) specs.push(m[1]);
  return specs;
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
