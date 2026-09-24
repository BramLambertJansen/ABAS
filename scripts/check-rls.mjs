#!/usr/bin/env node
// check:rls — CLAUDE.md → Verificatie: "elke tabel RLS, elke policy een
// negatieve test, geldtabellen REVOKED". Structural check only (does every
// table have an ENABLE ROW LEVEL SECURITY line, and does some test file at
// least mention it) — this does NOT replace the actual pgTAP negative
// tests in supabase/tests/, see tester.md. First pass, see
// scripts/lib/scan.mjs for the general caveat on regex-over-SQL.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "supabase/migrations");
const testsDir = join(root, "supabase/tests");

if (!existsSync(migrationsDir)) {
  console.log("check:rls: no supabase/migrations/ yet — nothing to check");
  process.exit(0);
}

const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
const migrationSql = migrationFiles
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

const testSql = existsSync(testsDir)
  ? readdirSync(testsDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(testsDir, f), "utf8"))
      .join("\n")
  : "";

const tableRe = /create table\s+(?:if not exists\s+)?(\w+)/gi;
const tables = [...migrationSql.matchAll(tableRe)].map((m) => m[1]);

const problems = [];

for (const table of tables) {
  const rlsRe = new RegExp(`alter table\\s+${table}\\s+enable row level security`, "i");
  if (!rlsRe.test(migrationSql)) {
    problems.push(`${table}: no "alter table ${table} enable row level security" found in migrations`);
  }

  const mentionedInTests = new RegExp(`\\b${table}\\b`, "i").test(testSql);
  if (!mentionedInTests) {
    problems.push(`${table}: not mentioned in supabase/tests/ — needs at least one negative test (see tester.md)`);
  }
}

// Money tables: REVOKE must be explicit somewhere in migrations, per
// CLAUDE.md → Architectuurbeslissingen. Names hardcoded because "which
// tables are money tables" is a judgment call a script can't infer.
const MONEY_TABLES = ["orders", "order_lines", "top_ups", "members", "order_reversals"];
for (const table of MONEY_TABLES) {
  if (tables.includes(table)) {
    const revokeRe = new RegExp(`revoke[^;]*\\b${table}\\b[^;]*from\\s+authenticated`, "i");
    if (!revokeRe.test(migrationSql)) {
      problems.push(`${table}: is a money table but no REVOKE ... FROM authenticated found for it`);
    }
  }
}

if (problems.length) {
  console.error(["check:rls failed:", ...problems.map((p) => `  - ${p}`)].join("\n"));
  process.exit(1);
}

console.log(`check:rls: ok (${tables.length} tables checked)`);
