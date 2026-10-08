#!/usr/bin/env node
// kit: generiek
// check:catalogus — dekking van het ontwerpsysteem (docs/features/ontwerpsysteem.md).
// Elke component in `componentenMap` staat als voorbeeld in het register van de
// pagina `/design/systeem`, of is een bekende uitzondering (ratchet: de lijst
// mag alleen krimpen) mét reden. Geen ABAS-namen in deze motor: paden, sleutel
// en redenen komen uit `systeem.lokaal.json`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ratchet } from "./ratchet.mjs";

/** Namen van componenten: PascalCase met een kleine letter (niet PIN_LENGTH, niet useX). */
export function componentNamen(tekst) {
  return [
    ...tekst.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Z][a-z]\w*)/gm),
  ].map((m) => m[1]);
}

/** Sleutels (op diepte 1) van `export const <registerNaam> … = { … }`. */
export function registerSleutels(tekst, registerNaam) {
  const start = new RegExp(`export\\s+const\\s+${registerNaam}\\b[^=]*=\\s*\\{`).exec(tekst);
  if (!start) return null;
  const sleutels = [];
  let diepte = 1;
  let i = start.index + start[0].length;
  let regelStart = i;
  for (; i < tekst.length && diepte > 0; i++) {
    const c = tekst[i];
    if (c === "{" || c === "(" || c === "[") diepte++;
    else if (c === "}" || c === ")" || c === "]") diepte--;
    else if (c === "\n") regelStart = i + 1;
    if (diepte === 1 && (c === ":" || c === ",")) {
      const m = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/.exec(tekst.slice(regelStart, i + 1));
      if (c === ":" && m) {
        sleutels.push(m[1] ?? m[2] ?? m[3]);
        regelStart = i + 1;
      }
    }
  }
  return sleutels;
}

/**
 * @param {{ componenten: string[], sleutels: string[], redenen: Record<string,string>, tolereerbaar: Iterable<string> }} i
 * @returns {{ ontbrekend: string[], onbekend: string[], redenProblemen: string[] }}
 */
export function analyseer({ componenten, sleutels, redenen, tolereerbaar }) {
  const heeft = new Set(componenten);
  const inRegister = new Set(sleutels);
  const ontbrekend = componenten.filter((c) => !inRegister.has(c)).sort();
  const onbekend = sleutels.filter((s) => !heeft.has(s)).sort();
  const redenProblemen = [];
  for (const naam of tolereerbaar) {
    if (!redenen[naam]?.trim()) redenProblemen.push(`${naam}: uitzondering zonder reden in systeem.lokaal.json → redenen`);
  }
  for (const naam of Object.keys(redenen)) {
    if (![...tolereerbaar].includes(naam) && !heeft.has(naam)) {
      redenProblemen.push(`${naam}: staat in systeem.lokaal.json → redenen maar bestaat niet meer — haal hem weg`);
    }
  }
  return { ontbrekend, onbekend, redenProblemen };
}

function bestanden(root, dir) {
  return readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    return statSync(path.join(root, rel)).isDirectory() ? bestanden(root, rel) : /\.tsx$/.test(f) ? [rel] : [];
  });
}

export function draai(root = path.resolve(import.meta.dirname, "../..")) {
  const cfg = JSON.parse(readFileSync(path.join(root, "scripts/kit/systeem.lokaal.json"), "utf8"));
  const componenten = bestanden(root, cfg.componentenMap).flatMap((rel) => componentNamen(readFileSync(path.join(root, rel), "utf8")));
  const registerTekst = readFileSync(path.join(root, cfg.registerPad), "utf8");
  const sleutels = registerSleutels(registerTekst, cfg.registerNaam);
  if (!sleutels) return [`${cfg.registerPad}: register \`${cfg.registerNaam}\` niet gevonden`];

  const baseline = JSON.parse(readFileSync(path.join(root, ".kit/baseline.json"), "utf8"));
  const tolereerbaar = baseline[cfg.baselineSleutel] ?? [];
  const { ontbrekend, onbekend, redenProblemen } = analyseer({ componenten, sleutels, redenen: cfg.redenen ?? {}, tolereerbaar });

  const problemen = [];
  for (const o of onbekend) problemen.push(`${o}: staat in het register maar bestaat niet meer in ${cfg.componentenMap} — haal hem weg`);
  problemen.push(...redenProblemen);
  problemen.push(
    ...ratchet(
      cfg.baselineSleutel,
      ontbrekend,
      `staat niet in ${cfg.route}: voeg een voorbeeld toe in ${cfg.registerPad}, of (alleen met Brams akkoord, label gate-wijziging) een uitzondering met reden in systeem.lokaal.json`,
    ),
  );
  return problemen;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const problemen = draai();
  if (problemen.length) {
    console.error(`check:catalogus: ${problemen.length} ${problemen.length === 1 ? "probleem" : "problemen"}\n- ${problemen.join("\n- ")}`);
    process.exit(1);
  }
  console.log("check:catalogus: ok");
}
