#!/usr/bin/env node
// kit: generiek
// check:catalogus — dekking van het ontwerpsysteem (docs/features/ontwerpsysteem.md).
// Elke component in `componentenMap` staat als voorbeeld in het register van de
// pagina `/design/systeem`, of is een bekende uitzondering (ratchet: de lijst
// mag alleen krimpen) mét een code uit `CODES`
// (docs/features/ontwerpsysteem-uitzonderingen.md). Geen ABAS-namen in deze
// motor: paden, sleutel en uitzonderingen komen uit `systeem.lokaal.json`.
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
  // Het eerste `=` dat geen `=>` is (een functietype in de annotatie mag).
  const start = new RegExp(`export\\s+const\\s+${registerNaam}\\b[\\s\\S]*?(?<![=!<>])=(?![=>])\\s*\\{`).exec(tekst);
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
 * De codes voor een uitzondering (docs/features/ontwerpsysteem-uitzonderingen.md).
 * Een code zegt wáárom een component niet als voorbeeld kan, en wat de
 * standaardoplossing is; bij `toelichtingVerplicht` hoort er een zin bij.
 */
export const CODES = {
  context: { omschrijving: "heeft een provider, overlay of andere omgeving nodig", oplossing: "een los venster", toelichtingVerplicht: false },
  data: { omschrijving: "leest echte data; nepdata is bewust niet gewenst", oplossing: "geen: blijft een uitzondering", toelichtingVerplicht: true },
  schermvullend: { omschrijving: "vult het venster of brengt een eigen landmark mee", oplossing: "een los venster", toelichtingVerplicht: false },
  staten: { omschrijving: "staten komen uit eigen state of uit callbacks", oplossing: "een voorbeeld per staat (props of een mock), eventueel met interactiestappen", toelichtingVerplicht: false },
};

const CODELIJST = Object.keys(CODES).sort().join(", ");
const VELDEN = new Set(["code", "toelichting"]);
const PLEK = "systeem.lokaal.json → uitzonderingen";

/** Hooguit één probleem voor één entry in `uitzonderingen` (G2, G3, G5–G7). */
function entryProbleem(naam, entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry) || typeof entry.code !== "string") {
    return `${naam}: uitzondering zonder code in ${PLEK}; kies uit: ${CODELIJST}`;
  }
  if (!Object.hasOwn(CODES, entry.code)) return `${naam}: onbekende code "${entry.code}" in ${PLEK}; kies uit: ${CODELIJST}`;
  const vreemd = Object.keys(entry).find((veld) => !VELDEN.has(veld));
  if (vreemd !== undefined) return `${naam}: onbekend veld "${vreemd}" in ${PLEK}; toegestaan: code, toelichting`;
  if (Object.hasOwn(entry, "toelichting") && (typeof entry.toelichting !== "string" || !entry.toelichting.trim())) {
    return `${naam}: lege toelichting in ${PLEK}; laat het veld weg of vul het in`;
  }
  if (CODES[entry.code].toelichtingVerplicht && !Object.hasOwn(entry, "toelichting")) {
    return `${naam}: code "${entry.code}" vraagt een toelichting in ${PLEK}`;
  }
  return null;
}

/**
 * @param {{ componenten: string[], sleutels: string[], uitzonderingen: Record<string, unknown>, tolereerbaar: Iterable<string>, baselineSleutel?: string }} i
 * @returns {{ ontbrekend: string[], onbekend: string[], uitzonderingProblemen: string[] }}
 */
export function analyseer({ componenten, sleutels, uitzonderingen, tolereerbaar, baselineSleutel = "systeem-zonder-voorbeeld" }) {
  const heeft = new Set(componenten);
  const inRegister = new Set(sleutels);
  const ontbrekend = componenten.filter((c) => !inRegister.has(c)).sort();
  const onbekend = sleutels.filter((s) => !heeft.has(s)).sort();
  const toegestaan = new Set(tolereerbaar);
  const uitzonderingProblemen = [];
  // G3: in de baseline maar zonder entry.
  for (const naam of [...toegestaan].sort()) {
    if (!Object.hasOwn(uitzonderingen, naam)) uitzonderingProblemen.push(`${naam}: uitzondering zonder code in ${PLEK}; kies uit: ${CODELIJST}`);
  }
  for (const naam of Object.keys(uitzonderingen).sort()) {
    // G4: een entry voor iets dat geen uitzondering is (ook als het niet meer bestaat).
    if (!toegestaan.has(naam)) {
      uitzonderingProblemen.push(`${naam}: staat in ${PLEK} maar is geen uitzondering (niet in .kit/baseline.json → ${baselineSleutel}) — haal hem weg`);
      continue;
    }
    const probleem = entryProbleem(naam, uitzonderingen[naam]);
    if (probleem) uitzonderingProblemen.push(probleem);
  }
  return { ontbrekend, onbekend, uitzonderingProblemen };
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
  const { ontbrekend, onbekend, uitzonderingProblemen } = analyseer({
    componenten,
    sleutels,
    uitzonderingen: cfg.uitzonderingen ?? {},
    tolereerbaar,
    baselineSleutel: cfg.baselineSleutel,
  });

  const problemen = [];
  // G8: de oude sleutel.
  if (Object.hasOwn(cfg, "redenen")) {
    problemen.push('systeem.lokaal.json: "redenen" is vervangen door "uitzonderingen" (docs/features/ontwerpsysteem-uitzonderingen.md)');
  }
  for (const o of onbekend) problemen.push(`${o}: staat in het register maar bestaat niet meer in ${cfg.componentenMap} — haal hem weg`);
  problemen.push(...uitzonderingProblemen);
  problemen.push(
    ...ratchet(
      cfg.baselineSleutel,
      ontbrekend,
      `staat niet in ${cfg.route}: voeg een voorbeeld toe in ${cfg.registerPad}, of (alleen met Brams akkoord, label gate-wijziging) een uitzondering met een code (${CODELIJST}) in ${PLEK}`,
      path.join(root, ".kit/baseline.json"),
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
