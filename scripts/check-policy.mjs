#!/usr/bin/env node
// check:policy — CLAUDE.md → Verificatie: "geen queries buiten de datalaag,
// geen client-side geld, geen device-sniffing, geen ongevalideerde
// attributie". The attributie half of that (served_by validated against
// the roster) is a database/RPC property — see supabase/tests/, not
// checkable by scanning frontend source. This script covers what source
// scanning actually can. First pass, see scripts/lib/scan.mjs.
import { walk, read, stripComments, fail } from "./lib/scan.mjs";

const root = process.cwd();
const files = walk(`${root}/src`, root);
const problems = [];

const ALLOWED_QUERY_DIRS = ["src/hooks/queries/", "src/lib/"];

for (const file of files) {
  const source = stripComments(read(root, file));

  const queriesOutsideDataLayer =
    /\bsupabase\s*\.\s*(from|rpc)\s*\(/.test(source) &&
    !ALLOWED_QUERY_DIRS.some((d) => file.startsWith(d));
  if (queriesOutsideDataLayer) {
    problems.push(`${file}: calls supabase.from()/.rpc() outside src/hooks/queries/ or src/lib/`);
  }

  if (/\bisMobile\b|\bmatchMedia\s*\(|\bnavigator\.userAgent\b/.test(source)) {
    problems.push(`${file}: device-sniffing (isMobile/matchMedia/userAgent) — use useShell() instead`);
  }
}

if (problems.length) {
  fail(["check:policy failed:", ...problems.map((p) => `  - ${p}`)]);
}

console.log(`check:policy: ok (${files.length} files scanned)`);
