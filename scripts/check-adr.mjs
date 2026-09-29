#!/usr/bin/env node
// check:adr — elke ADR in docs/adr/ heeft de vorm `NNNN-naam.md` en een uniek
// nummer (#107). Parallelle branches claimden twee keer hetzelfde nummer
// (0011 in #94/#95, daarna 0012 in #94/#17), en een kale
// verwijzing als "ADR 0012" wees daarna naar twee besluiten. Zelfde idee als
// check:migrations, voor ADR's.
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "docs/adr");
if (!existsSync(dir)) {
  console.log("check:adr: no docs/adr/ yet — nothing to check");
  process.exit(0);
}

const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
const problems = [];
const byNumber = new Map();

for (const f of files) {
  const m = /^(\d{4})-[a-z0-9-]+\.md$/.exec(f);
  if (!m) {
    problems.push(`${f}: naam moet de vorm NNNN-naam.md hebben (vier cijfers, kleine letters/cijfers/streepjes)`);
    continue;
  }
  const list = byNumber.get(m[1]) ?? [];
  list.push(f);
  byNumber.set(m[1], list);
}

for (const [number, list] of byNumber) {
  if (list.length > 1) {
    problems.push(`nummer ${number} komt ${list.length}× voor: ${list.join(", ")} — hernummer de nieuwste en werk de verwijzingen bij`);
  }
}

if (problems.length) {
  console.error("check:adr: FAIL");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const numbers = [...byNumber.keys()].sort();
console.log(`check:adr: ok (${files.length} ADR's, hoogste ${numbers.at(-1)})`);
