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
//
// Append-only (ADR 0025): een migratie die op de basisbranch staat, is (of
// wordt) op productie toegepast. Wijzigen of verwijderen faalt; een fix is een
// nieuwe migratie. Basis: $MIGRATIONS_BASE, anders origin/main. Zonder die ref
// (verse clone zonder fetch) slaat dit deel over met een melding; CI haalt
// origin/main altijd op.
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

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

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const baseRef = process.env.MIGRATIONS_BASE || "origin/main";
let appendOnly = "append-only niet gecontroleerd: geen " + baseRef;
try {
  const base = git("merge-base", "HEAD", baseRef);
  // Vergelijk de werkboom (incl. staged en ongecommit) met de merge-base.
  const gewijzigd = git("diff", "--name-status", "--diff-filter=MDR", base, "--", "supabase/migrations")
    .split("\n")
    .filter(Boolean);
  for (const regel of gewijzigd) {
    const [status, pad] = regel.split("\t");
    problems.push(`${pad}: ${status?.startsWith("D") ? "verwijderd" : status?.startsWith("R") ? "hernoemd" : "gewijzigd"} — migraties zijn append-only; schrijf een nieuwe migratie`);
  }
  // Nieuwe migraties moeten na de hoogste op de basis komen: de huidige top
  // van de basisbranch, niet de merge-base (die mist wat daarna op main kwam).
  const opBasis = git("ls-tree", "--name-only", baseRef, "supabase/migrations/")
    .split("\n")
    .map((p) => /(\d{4})_[^/]*\.sql$/.exec(p)?.[1])
    .filter(Boolean)
    .sort();
  const hoogsteBasis = opBasis.at(-1) ?? "0000";
  const opBasisSet = new Set(opBasis);
  for (const v of versions) {
    if (!opBasisSet.has(v) && v <= hoogsteBasis) {
      problems.push(`versie ${v} is nieuw maar niet hoger dan ${hoogsteBasis} op ${baseRef} — hernummer naar ${String(Number(hoogsteBasis) + 1).padStart(4, "0")} of hoger`);
    }
  }
  appendOnly = `append-only t.o.v. ${baseRef}`;
} catch {
  // geen basisref beschikbaar
}

if (problems.length) {
  console.error("check:migrations: FAIL");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check:migrations: ok (${files.length} migrations, hoogste ${versions.at(-1)}; ${appendOnly})`);
