#!/usr/bin/env node
// check:policy — CLAUDE.md → Verificatie: "geen queries of storage-aanroepen
// buiten de datalaag,
// geen device-sniffing, geen kale console.error in src/hooks/queries/".
// What source scanning can't see (client never computes an amount,
// served_by validated against the roster) is review work or a database
// property — see CLAUDE.md → Verificatie and supabase/tests/. First pass,
// see scripts/lib/scan.mjs.
//
// The console.error rule (docs/features/foutlogging.md, #94): a hook in
// src/hooks/queries/ reports an unexpected error via reportClientError()
// (or logLocalError() for pre-session hooks and signOut branches) from
// src/lib/clientErrors.ts, which logs to the console itself. A bare
// console.error there is an error that never reaches client_errors. The
// helper lives in src/lib/ and falls outside this rule.
import { walk, read, stripComments, fail, analyzeModule } from "./lib/scan.mjs";

const root = process.cwd();
const files = walk(`${root}/src`, root);
const problems = [];

const ALLOWED_QUERY_DIRS = ["src/hooks/queries/", "src/lib/"];
const NO_BARE_CONSOLE_ERROR_DIR = "src/hooks/queries/";

for (const file of files) {
  const raw = read(root, file);
  const source = stripComments(raw);
  const { calls } = analyzeModule(raw, file);

  // Any receiver, not only a variable named `supabase` (ADR 0025): `db.rpc(`,
  // `admin.rpc(`, `client.from(table)` en bracketnotatie. Standaard
  // Array/Buffer-conversies zijn op receivernaam uitgezonderd.
  const queriesOutsideDataLayer =
    calls.some((call) => call.name === "rpc" || call.name === "from" && !["Array", "Buffer", "Uint8Array", "Object"].includes(call.receiver)) &&
    !ALLOWED_QUERY_DIRS.some((d) => file.startsWith(d));
  if (queriesOutsideDataLayer) {
    problems.push(`${file}: calls .from("…")/.rpc() outside src/hooks/queries/ or src/lib/ — use a hook from src/hooks/queries/`);
  }

  // Storage (ADR 0018 → punt 6): `<client>.storage.from(` whatever the
  // variable is called — `supabase.storage.from(` doesn't match the rule
  // above, because `storage` sits between `supabase.` and `from`.
  const storageOutsideDataLayer =
    calls.some((call) => call.name === "from" && /(?:\.storage|\[['"]storage['"]\])$/.test(call.receiver ?? "")) &&
    !ALLOWED_QUERY_DIRS.some((d) => file.startsWith(d));
  if (storageOutsideDataLayer) {
    problems.push(`${file}: calls .storage.from() outside src/hooks/queries/ or src/lib/`);
  }

  if (file.startsWith(NO_BARE_CONSOLE_ERROR_DIR) && /\bconsole\s*\.\s*error\s*\(/.test(source)) {
    problems.push(`${file}: bare console.error() in src/hooks/queries/ — use reportClientError() or logLocalError() from src/lib/clientErrors.ts`);
  }

  if (/\bisMobile\b|\bmatchMedia\s*\(|\bnavigator\.userAgent\b/.test(source)) {
    problems.push(`${file}: device-sniffing (isMobile/matchMedia/userAgent) — use useShell() instead`);
  }
}

if (problems.length) {
  fail(["check:policy failed:", ...problems.map((p) => `  - ${p}`)]);
}

console.log(`check:policy: ok (${files.length} files scanned)`);
