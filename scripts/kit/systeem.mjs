#!/usr/bin/env node
// kit: generiek
// check:catalogus — dekking van het ontwerpsysteem (docs/features/ontwerpsysteem.md).
// Elke component in `componentenMap` staat als voorbeeld in het register van de
// pagina `/design/systeem`, in een los venster (`vensters`), of is een bekende
// uitzondering (ratchet: de lijst mag alleen krimpen) mét een code uit `CODES`
// (docs/features/ontwerpsysteem-uitzonderingen.md). Geen ABAS-namen in deze
// motor: paden, sleutel, vensters en uitzonderingen komen uit
// `systeem.lokaal.json`; de interactiestappen uit het bestand op `interactiesPad`.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
 * @param {{ componenten: string[], sleutels: string[], uitzonderingen: Record<string, unknown>, tolereerbaar: Iterable<string>, vensters?: Record<string, any>, baselineSleutel?: string }} i
 * @returns {{ ontbrekend: string[], onbekend: string[], uitzonderingProblemen: string[] }}
 */
export function analyseer({ componenten, sleutels, uitzonderingen, tolereerbaar, vensters = {}, baselineSleutel = "systeem-zonder-voorbeeld" }) {
  const heeft = new Set(componenten);
  // Gedekt: een voorbeeld in het register, of genoemd door minstens één venster.
  const gedekt = new Set(sleutels);
  for (const venster of Object.values(vensters)) {
    if (Array.isArray(venster?.componenten)) for (const c of venster.componenten) gedekt.add(c);
  }
  const ontbrekend = componenten.filter((c) => !gedekt.has(c)).sort();
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

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VENSTERVELDEN = new Set(["componenten", "breedte", "hoogte", "eigenLandmark"]);

/** V1–V5: de vorm van `vensters` en of de genoemde componenten bestaan. */
export function valideerVensters(vensters, componenten, componentenMap = "de componentenmap") {
  const heeft = new Set(componenten);
  const problemen = [];
  for (const [id, venster] of Object.entries(vensters)) {
    if (!KEBAB.test(id)) {
      problemen.push(`${id}: venster-id alleen kleine letters, cijfers en streepjes`);
      continue;
    }
    const v = venster !== null && typeof venster === "object" && !Array.isArray(venster) ? venster : {};
    const vreemd = Object.keys(v).find((veld) => !VENSTERVELDEN.has(veld));
    if (vreemd !== undefined) problemen.push(`${id}: onbekend veld "${vreemd}" in systeem.lokaal.json → vensters; toegestaan: componenten, breedte, hoogte, eigenLandmark`);
    if (!Array.isArray(v.componenten) || v.componenten.length === 0) {
      problemen.push(`${id}: venster zonder componenten in systeem.lokaal.json → vensters`);
    } else {
      for (const c of v.componenten) if (!heeft.has(c)) problemen.push(`${id}: venster noemt ${c}, maar ${c} bestaat niet in ${componentenMap} — haal hem weg`);
    }
    const maat = (n) => Number.isInteger(n) && n >= 200 && n <= 2000;
    if (!maat(v.breedte) || !maat(v.hoogte)) problemen.push(`${id}: breedte en hoogte moeten gehele getallen tussen 200 en 2000 zijn`);
  }
  return problemen;
}

const ACTIES = ["klik", "typ", "toets", "verwacht"];
const STAPVELDEN = { klik: ["keer"], typ: ["in"], toets: ["keer"], verwacht: ["staat"] };

function geldigDoelwit(d) {
  if (d === null || typeof d !== "object" || Array.isArray(d)) return false;
  const sleutels = Object.keys(d);
  const tekst = (w) => typeof w === "string" && w.trim() !== "";
  if (Object.hasOwn(d, "rol")) return tekst(d.rol) && sleutels.every((k) => k === "rol" || k === "naam") && (!Object.hasOwn(d, "naam") || tekst(d.naam));
  if (Object.hasOwn(d, "label")) return sleutels.length === 1 && tekst(d.label);
  if (Object.hasOwn(d, "tekst")) return sleutels.length === 1 && tekst(d.tekst);
  return false;
}

/** I1–I7: de statische vorm van de interacties (docs/features/ontwerpsysteem-uitzonderingen.md → Interacties). */
export function valideerInteracties(interacties, vensters) {
  const problemen = [];
  const gezien = new Set();
  for (const interactie of Array.isArray(interacties) ? interacties : []) {
    const i = interactie !== null && typeof interactie === "object" ? interactie : {};
    const naam = typeof i.naam === "string" ? i.naam : "?";
    const heeftSectie = typeof i.sectie === "string" && i.sectie !== "";
    const heeftVenster = typeof i.venster === "string" && i.venster !== "";
    if (heeftSectie === heeftVenster || (Object.hasOwn(i, "sectie") && Object.hasOwn(i, "venster"))) {
      problemen.push(`interactie ${naam}: kies precies één doel: sectie of venster`);
      continue;
    }
    if (heeftVenster && !Object.hasOwn(vensters, i.venster)) problemen.push(`interactie ${naam}: venster "${i.venster}" bestaat niet in systeem.lokaal.json → vensters`);
    const doel = heeftSectie ? `sectie ${i.sectie}` : `venster ${i.venster}`;
    const sleutel = `${doel}/${naam}`;
    if (typeof i.naam !== "string" || !KEBAB.test(i.naam) || gezien.has(sleutel)) {
      problemen.push(`interactie ${naam}: naam ontbreekt, is geen kebab-case of is dubbel bij ${doel}`);
    }
    gezien.add(sleutel);
    if (!Array.isArray(i.stappen) || i.stappen.length === 0) {
      problemen.push(`interactie ${naam}, stap 1: ongeldige waarde voor stappen`);
      continue;
    }
    i.stappen.forEach((stap, index) => {
      const n = index + 1;
      const s = stap !== null && typeof stap === "object" && !Array.isArray(stap) ? stap : {};
      const acties = ACTIES.filter((a) => Object.hasOwn(s, a));
      if (acties.length !== 1) {
        problemen.push(`interactie ${naam}, stap ${n}: kies precies één actie: klik, typ, toets, verwacht`);
        return;
      }
      const actie = acties[0];
      const vreemd = Object.keys(s).find((k) => k !== actie && !STAPVELDEN[actie].includes(k));
      if (vreemd !== undefined) {
        problemen.push(`interactie ${naam}, stap ${n}: ongeldige waarde voor ${vreemd}`);
        return;
      }
      const doelwit = actie === "typ" ? s.in : actie === "toets" ? null : s[actie];
      if (actie !== "toets" && !geldigDoelwit(doelwit)) {
        problemen.push(`interactie ${naam}, stap ${n}: doelwit is precies één van rol (met optioneel naam), label of tekst`);
        return;
      }
      if (Object.hasOwn(s, "keer") && !(Number.isInteger(s.keer) && s.keer >= 1 && s.keer <= 10)) problemen.push(`interactie ${naam}, stap ${n}: ongeldige waarde voor keer`);
      else if (actie === "toets" && !(typeof s.toets === "string" && s.toets.trim() !== "")) problemen.push(`interactie ${naam}, stap ${n}: ongeldige waarde voor toets`);
      else if (actie === "typ" && typeof s.typ !== "string") problemen.push(`interactie ${naam}, stap ${n}: ongeldige waarde voor typ`);
      else if (Object.hasOwn(s, "staat") && s.staat !== "zichtbaar" && s.staat !== "uitgeschakeld") problemen.push(`interactie ${naam}, stap ${n}: ongeldige waarde voor staat`);
    });
    const laatste = i.stappen.at(-1);
    if (laatste === null || typeof laatste !== "object" || !Object.hasOwn(laatste, "verwacht")) {
      problemen.push(`interactie ${naam}: eindig met een verwacht-stap, zodat de screenshot pas volgt als de staat er is`);
    }
  }
  return problemen;
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
    vensters: cfg.vensters ?? {},
    baselineSleutel: cfg.baselineSleutel,
  });

  const problemen = [];
  // G8: de oude sleutel.
  if (Object.hasOwn(cfg, "redenen")) {
    problemen.push('systeem.lokaal.json: "redenen" is vervangen door "uitzonderingen" (docs/features/ontwerpsysteem-uitzonderingen.md)');
  }
  for (const o of onbekend) problemen.push(`${o}: staat in het register maar bestaat niet meer in ${cfg.componentenMap} — haal hem weg`);
  problemen.push(...uitzonderingProblemen);
  if (cfg.vensters) problemen.push(...valideerVensters(cfg.vensters, componenten, cfg.componentenMap));
  // Zonder `interactiesPad` worden geen interacties gecontroleerd.
  if (cfg.interactiesPad) {
    let bestand = null;
    try {
      bestand = existsSync(path.join(root, cfg.interactiesPad)) ? JSON.parse(readFileSync(path.join(root, cfg.interactiesPad), "utf8")) : null;
    } catch {
      bestand = null;
    }
    if (bestand === null || typeof bestand !== "object" || !Array.isArray(bestand.interacties)) {
      problemen.push(`${cfg.interactiesPad}: ontbreekt of is geen geldige JSON`);
    } else {
      problemen.push(...valideerInteracties(bestand.interacties, cfg.vensters ?? {}));
    }
  }
  problemen.push(
    ...ratchet(
      cfg.baselineSleutel,
      ontbrekend,
      `staat niet in ${cfg.route}: voeg een voorbeeld toe in ${cfg.registerPad}${cfg.vensters ? " of een venster in systeem.lokaal.json → vensters" : ""}, of (alleen met Brams akkoord, label gate-wijziging) een uitzondering met een code (${CODELIJST}) in ${PLEK}`,
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
