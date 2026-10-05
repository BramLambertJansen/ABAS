#!/usr/bin/env node
// check:rls — CLAUDE.md → Verificatie: "elke tabel RLS, elke policy een
// negatieve test, geldtabellen REVOKED, elke bucket een type- en
// groottelimiet, elke storage-policy een negatieve test" (the storage part:
// ADR 0018, see the Storage block below). Structural check only (does every
// table have an ENABLE ROW LEVEL SECURITY line, and does some test file at
// least mention it) — this does NOT replace the actual pgTAP negative
// tests in supabase/tests/, see tester.md. First pass, see
// scripts/lib/scan.mjs for the general caveat on regex-over-SQL.
//
// Twee eigenschappen bewijst dit script bewust niet zelf, omdat een scan
// over de broncode van de migraties ze niet kan zien: dat geen API-rol een
// tabelrecht heeft dat RLS omzeilt (TRUNCATE, REFERENCES, TRIGGER, en voor
// `anon` elk recht), en dat elke bucket werkzame limieten heeft. Die toetst
// de database zelf, in twee pgTAP-invarianten (ADR 0022,
// docs/features/tabelrechten-api-rollen.md → Gates). Dit script eist alleen
// dat die invarianten er zijn en hun kern nog bevatten (zie onderaan); of ze
// kloppen, bewijst `db:test`.
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
// Bewust geen eis op `truncate`/`references`/`trigger` hier (ADR 0022,
// spec → Besluit 4): de invariant in tabelrechten_api_rollen.test.sql dekt
// de geldtabellen al, net als elke andere tabel, en een lexicale eis zou na
// de projectbrede revoke van 0041 meteen voldaan zijn zonder iets te bewijzen.
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
//
// Regel 1 en 2 zijn een vroege waarschuwing, niet de gate: ze draaien in
// check:fast zonder database en vangen het gewone geval al bij het
// committen. Een `insert into "storage"."buckets"` met aanhalingstekens of
// een latere `update storage.buckets set file_size_limit = null` glipt er
// lexicaal langs. De echte gate is de invariant in
// supabase/tests/storage_bucket_limieten.test.sql, die elke rij van
// storage.buckets na alle migraties toetst (ADR 0022, spec → Besluit 3).
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

// Invarianten in de database (ADR 0022, docs/features/tabelrechten-api-
// rollen.md → Gates → check:rls). Verplicht: wie een van de twee bestanden
// weghaalt of uitkleedt, krijgt al bij de pre-commit hook een fout. Lexicaal
// en daarmee zwak, maar het doel is beperkt: of de invariant klopt, bewijst
// `db:test`. Commentaar telt niet mee.
const INVARIANTS = [
  {
    file: "tabelrechten_api_rollen.test.sql",
    what: "API-rollen hebben geen RLS-omzeilende tabelrechten",
    needles: ["'TRUNCATE'", "'TRIGGER'", "'REFERENCES'", "has_sequence_privilege", "forbid_api_role_truncate"],
  },
  {
    file: "storage_bucket_limieten.test.sql",
    what: "elke bucket heeft werkzame limieten",
    needles: ["file_size_limit", "allowed_mime_types", "product-images"],
  },
];
for (const { file, what, needles } of INVARIANTS) {
  const path = join(testsDir, file);
  if (!existsSync(path)) {
    problems.push(`supabase/tests/${file}: ontbreekt — de invariant "${what}" is verplicht (ADR 0022)`);
    continue;
  }
  const sql = readFileSync(path, "utf8").replace(/--.*$/gm, "");
  for (const needle of needles) {
    if (!sql.includes(needle)) {
      problems.push(`supabase/tests/${file}: noemt ${needle} niet meer (buiten commentaar) — de invariant "${what}" is uitgekleed (ADR 0022)`);
    }
  }
}

if (problems.length) {
  console.error(["check:rls failed:", ...problems.map((p) => `  - ${p}`)].join("\n"));
  process.exit(1);
}

console.log(
  `check:rls: ok (${tables.length} tables, ${buckets.length} storage buckets, ${storagePolicies.length} storage policies, ${INVARIANTS.length} invariants checked)`
);
