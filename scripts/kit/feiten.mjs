#!/usr/bin/env node
// Feiten — wat uit de repo af te leiden is, live in plaats van in proza.
// Rolprompts en skills verwijzen hierheen zodat ze niet verouderen (ADR 0025).
// Draai: `node scripts/kit/feiten.mjs [gates|rpc|adr|conventies]` (zonder
// argument: alles). Alleen lezen, geen netwerk, geen database.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { GATES } from "./gates.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const lees = (p) => readFileSync(path.join(root, p), "utf8");
const deel = process.argv[2];
const uit = [];
const kop = (t) => uit.push(`\n## ${t}\n`);

if (!deel || deel === "gates") {
  const pkg = JSON.parse(lees("package.json"));
  kop("Gates (npm run …)");
  uit.push("`check:fast` (pre-commit): " + (pkg.scripts["check:fast"].match(/npm run ([\w:]+)/g) ?? []).map((s) => s.slice(8)).join(", "));
  uit.push("`check:all` (CI, verplicht vóór merge): " + (pkg.scripts["check:all"].match(/npm run ([\w:]+)/g) ?? []).map((s) => s.slice(8)).join(", "));
  uit.push("");
  for (const g of GATES) uit.push(`- \`${g.script}\`${g.snel ? "" : " (CI)"}: ${g.bewaakt}`);
}

if (!deel || deel === "rpc") {
  kop("RPC-catalogus (supabase/tests/rpc_catalogus.test.sql)");
  const sql = lees("supabase/tests/rpc_catalogus.test.sql");
  const perKlasse = {};
  for (const m of sql.matchAll(/^\s*\('(\w+)',\s*'(client|server|intern)'/gm)) (perKlasse[m[2]] ??= []).push(m[1]);
  for (const [k, lijst] of Object.entries(perKlasse)) uit.push(`- ${k} (${lijst.length}): ${lijst.sort().join(", ")}`);
  uit.push("- Geld: alleen via de `*_once`-RPC's met een request-UUID (ADR 0024); `inspect_money_request` voor een onbekende uitkomst.");
}

if (!deel || deel === "adr") {
  kop("ADR's (docs/adr/)");
  for (const f of readdirSync(path.join(root, "docs/adr")).filter((f) => f.endsWith(".md")).sort()) {
    const tekst = lees(`docs/adr/${f}`);
    const titel = tekst.match(/^#\s+(.*)$/m)?.[1] ?? f;
    const status = tekst.match(/^Status: \*\*(\w+)\*\*/m)?.[1] ?? "?";
    uit.push(`- [${status}] ${titel}`);
  }
}

if (!deel || deel === "conventies") {
  kop("Conventies (afgedwongen)");
  const migraties = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const adrs = readdirSync(path.join(root, "docs/adr")).filter((f) => /^\d{4}-/.test(f)).sort();
  uit.push(`- Migratie: \`supabase/migrations/NNNN_naam.sql\`, append-only. Hoogste nu: ${migraties.at(-1)}.`);
  uit.push(`- ADR: \`docs/adr/NNNN-naam.md\`. Volgende vrije nummer: ${String(Number(adrs.at(-1).slice(0, 4)) + 1).padStart(4, "0")}.`);
  uit.push("- Statuswoorden voor ADR's en specs: voorstel | goedgekeurd | gebouwd | vervallen (eerste regel `Status: **woord**`).");
  uit.push("- Spec: `docs/features/<naam>.md`, sjabloon via de skill /spec.");
  uit.push("- Gate- of testwijziging: PR-label `gate-wijziging` (Bram).");
  if (existsSync(path.join(root, ".kit/baseline.json"))) uit.push("- Ratchet-baseline: `.kit/baseline.json` (alleen dalen; `npm run ratchet:update` na een daling).");
}

console.log(uit.join("\n").trim());
