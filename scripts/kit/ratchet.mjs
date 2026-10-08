// Ratchet — bekende schuld die alleen mag dalen (ADR 0025).
//
// Voor gates die geen ingebouwde suppressie hebben (ESLint heeft die wél:
// eslint-suppressions.json). Een gate geeft per regel de lijst van gevonden
// overtredingen (stabiele sleutels: bestandsnaam, policynaam); de baseline in
// .kit/baseline.json is de lijst die nog mag.
//   - nieuw (niet in de baseline)          → fout: los het op
//   - opgelost (in baseline, niet gevonden) → fout: haal hem uit de baseline
//     (`npm run ratchet:update`), zodat hij niet terug kan komen
// Een baseline groeien kan alleen met de hand, in een PR met het label
// gate-wijziging.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const BESTAND = path.join(root, ".kit/baseline.json");
const UPDATE = process.env.RATCHET_UPDATE === "1";

function lees(bestand) {
  return existsSync(bestand) ? JSON.parse(readFileSync(bestand, "utf8")) : {};
}

/** @returns {string[]} problemen voor deze regel */
export function ratchet(regel, gevonden, uitleg, bestand = BESTAND) {
  const baseline = lees(bestand);
  const toegestaan = new Set(baseline[regel] ?? []);
  const nu = new Set(gevonden);
  const problemen = [];
  for (const g of nu) if (!toegestaan.has(g)) problemen.push(`${g}: ${uitleg}`);
  const opgelost = [...toegestaan].filter((t) => !nu.has(t));
  if (UPDATE) {
    if (opgelost.length) {
      baseline[regel] = [...toegestaan].filter((t) => nu.has(t)).sort();
      if (baseline[regel].length === 0) delete baseline[regel];
      writeFileSync(bestand, JSON.stringify(baseline, null, 2) + "\n");
    }
  } else {
    for (const o of opgelost) {
      problemen.push(`${o}: staat in .kit/baseline.json → ${regel} maar is opgelost — draai \`npm run ratchet:update\` en commit de daling`);
    }
  }
  return problemen;
}
