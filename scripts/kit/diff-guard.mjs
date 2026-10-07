#!/usr/bin/env node
// Diff-guard — doener en rechter gescheiden (ADR 0025). Een PR die een gate
// wijzigt, heeft het label `gate-wijziging` nodig; alleen Bram zet dat, ook
// voor PR's uit de hoofdsessie.
//
// Gate = elk pad uit .claude/hooks/rolhek.lokaal.json → gates (één bron met
// het rolhek). Voor testmappen telt alleen wijzigen, hernoemen of
// verwijderen van een bestaand bestand: een nieuwe test toevoegen is gewoon
// werk, een bestaande test aanpassen is "de test fixen in plaats van de bron".
//
// CI draait de versie van dit script en van de gatelijst van de basisbranch,
// zodat een PR zijn eigen bewaker niet kan afzwakken.
// Gebruik: node diff-guard.mjs <base-sha> <head-sha> <gates.json>
// Env: PR_LABELS = JSON-array met labelnamen.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [base, head, gatesBestand] = process.argv.slice(2);
const labels = JSON.parse(process.env.PR_LABELS || "[]");
const LABEL = "gate-wijziging";
const TESTMAPPEN = /^(supabase\/tests|e2e|test|integration)\//;

const gates = JSON.parse(readFileSync(gatesBestand, "utf8")).gates.map((r) => new RegExp(r));
const diff = execFileSync("git", ["diff", "--name-status", "-M", `${base}...${head}`], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .map((r) => r.split("\t"));

const geraakt = [];
for (const [status, ...paden] of diff) {
  for (const pad of paden) {
    if (TESTMAPPEN.test(pad)) {
      if (!status.startsWith("A")) geraakt.push(`${status[0]} ${pad}`);
    } else if (gates.some((g) => g.test(pad))) {
      geraakt.push(`${status[0]} ${pad}`);
    }
  }
}

if (geraakt.length === 0) {
  console.log("diff-guard: ok (geen gate-wijzigingen)");
  process.exit(0);
}
if (labels.includes(LABEL)) {
  console.log(`diff-guard: ok — label ${LABEL} aanwezig voor:\n  ${[...new Set(geraakt)].join("\n  ")}`);
  process.exit(0);
}
console.error(
  `diff-guard: FAIL — deze PR wijzigt gates of bestaande tests zonder label ${LABEL}:\n  ${[...new Set(geraakt)].join("\n  ")}\n` +
    `Fix de bron in plaats van de gate/test, of vraag Bram het label te zetten.`,
);
process.exit(1);
