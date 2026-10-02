#!/usr/bin/env node
// check:rls — CLAUDE.md → Verificatie: "elke tabel RLS, elke policy een
// negatieve test, geldtabellen REVOKED, elke bucket een type- en
// groottelimiet, elke storage-policy een negatieve test" (the storage part:
// ADR 0018, see the Storage block below). Structural check only (does every
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

// Storage (ADR 0018 → punt 6, docs/features/productafbeeldingen.md → Gates).
// storage.buckets and storage.objects are created by Supabase itself, so the
// `create table` scan above never sees them. Three rules:
//   1. every `insert into storage.buckets` in a migration names both
//      `file_size_limit` and `allowed_mime_types` (ADR 0018 → punt 3);
//   2. every bucket id created that way appears in supabase/tests/;
//   3. every `create policy <name> on storage.objects` appears in
//      supabase/tests/ by its name — the table name says nothing here, since
//      storage.objects is always mentioned in some test.
// SQL line comments are stripped first, so prose about a bucket in a
// migration header doesn't count as (or hide) a real statement.
const migrationSqlNoComments = migrationSql.replace(/--.*$/gm, "");
const bucketInsertRe = /insert\s+into\s+storage\.buckets\b([^;]*);/gi;
const buckets = [];
for (const m of migrationSqlNoComments.matchAll(bucketInsertRe)) {
  const statement = m[1];
  const snippet = m[0].replace(/\s+/g, " ").slice(0, 80);
  if (!/\bfile_size_limit\b/i.test(statement) || !/\ballowed_mime_types\b/i.test(statement)) {
    problems.push(`storage.buckets: "${snippet}…" must set both file_size_limit and allowed_mime_types (ADR 0018)`);
  }
  const valuesPart = statement.split(/\bvalues\b/i)[1] ?? "";
  const ids = [...valuesPart.matchAll(/\(\s*'([^']+)'/g)].map((v) => v[1]);
  if (ids.length === 0) {
    problems.push(`storage.buckets: could not read a bucket id from "${snippet}…" — use insert ... values ('<id>', ...)`);
  }
  buckets.push(...ids);
}
for (const bucket of buckets) {
  if (!testSql.includes(bucket)) {
    problems.push(`storage bucket ${bucket}: not mentioned in supabase/tests/ — needs a test for its limits and write protection (ADR 0018)`);
  }
}

const storagePolicyRe = /create\s+policy\s+("[^"]+"|\w+)\s+on\s+storage\.objects\b/gi;
const storagePolicies = [...migrationSqlNoComments.matchAll(storagePolicyRe)].map((m) =>
  m[1].replace(/^"|"$/g, "")
);
for (const policy of storagePolicies) {
  if (!testSql.includes(policy)) {
    problems.push(`storage.objects policy ${policy}: not mentioned by name in supabase/tests/ — needs a negative test (ADR 0018)`);
  }
}

if (problems.length) {
  console.error(["check:rls failed:", ...problems.map((p) => `  - ${p}`)].join("\n"));
  process.exit(1);
}

console.log(
  `check:rls: ok (${tables.length} tables, ${buckets.length} storage buckets, ${storagePolicies.length} storage policies checked)`
);
