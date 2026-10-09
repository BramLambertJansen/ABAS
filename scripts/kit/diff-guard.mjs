#!/usr/bin/env node
// Diff-guard — doener en rechter gescheiden (ADR 0025). Een PR die een gate
// wijzigt, vraagt label én onafhankelijke review op de exacte head-SHA.
// De goedkeurders staan in de vertrouwde repo-config (ADR 0027).
//
// Gate = elk pad uit .claude/hooks/rolhek.lokaal.json → gates (één bron met
// het rolhek). Voor testmappen telt alleen wijzigen, hernoemen of
// verwijderen van een bestaand bestand: een nieuwe test toevoegen is gewoon
// werk, een bestaande test aanpassen is "de test fixen in plaats van de bron".
//
// CI draait de versie van dit script en van de gatelijst van de basisbranch,
// zodat een PR zijn eigen bewaker niet kan afzwakken.
// Gebruik: node diff-guard.mjs <base-sha> <head-sha> <gates.json> <reviews.json>
// Env: PR_LABELS = JSON-array met labelnamen; PR_AUTHOR = GitHub-login.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { heeftGoedkeuring } from "./goedkeuring.mjs";

const [base, head, gatesBestand, reviewsBestand] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(base ?? "") || !/^[a-f0-9]{40}$/.test(head ?? "")) {
  console.error("diff-guard: basis en head moeten volledige commit-SHA's zijn");
  process.exit(1);
}
const labels = JSON.parse(process.env.PR_LABELS || "[]");
const LABEL = "gate-wijziging";

const config = JSON.parse(readFileSync(gatesBestand, "utf8"));
const gates = config.gates.map((r) => new RegExp(r));
const testpaden = config.testpaden.map((r) => new RegExp(r));
// JSON-gates (bv. package.json → scripts): alleen een wijziging in die sleutels telt.
const jsonGates = config.jsonGates ?? {};
const toonBestand = (ref, pad) => {
  try {
    return JSON.parse(execFileSync("git", ["show", `${ref}:${pad}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return {};
  }
};
// NUL-scheiding: git quoteert anders Unicode/newline-paden, waarna een
// tekstsplit een beschermd bestand voor een onbeschermd pad kan aanzien.
const records = execFileSync("git", ["diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z", "-M", `${base}...${head}`], { encoding: "utf8" }).split("\0");
const diff = [];
for (let i = 0; i < records.length && records[i];) {
  const status = records[i++];
  const count = /^[RC]/.test(status) ? 2 : 1;
  diff.push([status, ...records.slice(i, i + count)]);
  i += count;
}

const geraakt = [];
for (const [status, ...paden] of diff) {
  for (const pad of paden) {
    if (testpaden.some((r) => r.test(pad))) {
      if (!status.startsWith("A")) geraakt.push(`${status[0]} ${pad}`);
    } else if (gates.some((g) => g.test(pad))) {
      geraakt.push(`${status[0]} ${pad}`);
    } else if (jsonGates[pad]) {
      const voor = toonBestand(base, pad);
      const na = toonBestand(head, pad);
      for (const sleutel of jsonGates[pad]) {
        if (JSON.stringify(voor[sleutel] ?? null) !== JSON.stringify(na[sleutel] ?? null)) geraakt.push(`${status[0]} ${pad} → ${sleutel}`);
      }
    }
  }
}

if (geraakt.length === 0) {
  console.log("diff-guard: ok (geen gate-wijzigingen)");
  process.exit(0);
}
const reviews = reviewsBestand ? JSON.parse(readFileSync(reviewsBestand, "utf8")) : [];
if (labels.includes(LABEL) && heeftGoedkeuring(reviews, head, process.env.PR_AUTHOR, config.goedkeurders)) {
  console.log(`diff-guard: ok — label en onafhankelijke review op ${head} aanwezig voor:\n  ${[...new Set(geraakt)].join("\n  ")}`);
  process.exit(0);
}
console.error(
  `diff-guard: FAIL — deze PR wijzigt gates of bestaande tests zonder label ${LABEL} en onafhankelijke goedkeuring op de actuele commit:\n  ${[...new Set(geraakt)].join("\n  ")}\n` +
    `Vraag een aangewezen reviewer (niet de PR-auteur) om review op ${head}, en laat daarna het label zetten of de vertrouwde workflow opnieuw starten.`,
);
process.exit(1);
