#!/usr/bin/env node
// check:migrations — elke migratie in supabase/migrations/ heeft de vorm
// `NNNN_naam.sql` en een uniek versienummer (#67). De Supabase CLI leidt de
// versie af uit alles vóór de eerste underscore; twee bestanden met hetzelfde
// nummer laten `supabase db push` naar productie falen, terwijl de lokale
// `supabase start` in CI ze nog braaf achter elkaar draait. Twee keer
// voorgekomen bij het samenvoegen van parallelle branches (7c943d7, 5888a7e).
//
// Bewust geen check op aansluitende nummers: 0013 bestaat niet en kan niet
// meer worden ingevuld zonder de geschiedenis op productie te herschrijven.
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase/migrations");
if (!existsSync(dir)) {
  console.log("check:migrations: no supabase/migrations/ yet — nothing to check");
  process.exit(0);
}

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const problems = [];
const byVersion = new Map();

for (const f of files) {
  const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(f);
  if (!m) {
    problems.push(`${f}: naam moet de vorm NNNN_naam.sql hebben (vier cijfers, kleine letters/cijfers/underscores)`);
    continue;
  }
  const list = byVersion.get(m[1]) ?? [];
  list.push(f);
  byVersion.set(m[1], list);
}

for (const [version, list] of byVersion) {
  if (list.length > 1) {
    problems.push(`versie ${version} komt ${list.length}× voor: ${list.join(", ")} — hernummer de nieuwste`);
  }
}

const versions = [...byVersion.keys()].sort();

if (problems.length) {
  console.error("check:migrations: FAIL");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check:migrations: ok (${files.length} migrations, hoogste ${versions.at(-1)})`);
