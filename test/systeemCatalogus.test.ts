import { test, after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


/**
 * check:catalogus (docs/features/ontwerpsysteem.md en
 * ontwerpsysteem-uitzonderingen.md → Tests, G1–G9): de pure functies, `CODES`,
 * end-to-end runs van `draai(root)` tegen een minimale tijdelijke boom.
 * systeem.mjs en ratchet.mjs worden naar die boom gekopieerd: de ratchet leest
 * .kit/baseline.json relatief aan zichzelf, dus alleen zo gebruikt de run de
 * baseline van de tijdelijke boom en niet die van de echte repo.
 */
const KIT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "kit");
const { analyseer, componentNamen, registerSleutels, CODES, draai: draaiEcht } = await import(pathToFileURL(join(KIT, "systeem.mjs")).href);
const tmpDirs: string[] = [];
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// --- componentNamen ---------------------------------------------------------

test("componentNamen: functie-, const- en class-componenten, ook default en async", () => {
  const tekst = [
    "export function Knop() {}",
    "export const Chip = () => null;",
    "export class Segment {}",
    "export default function Overzicht() {}",
    "export async function Laden() {}",
  ].join("\n");
  assert.deepEqual(componentNamen(tekst), ["Knop", "Chip", "Segment", "Overzicht", "Laden"]);
});

test("componentNamen: constanten, hooks, helpers en types zijn geen component", () => {
  const tekst = [
    "export const PIN_LENGTH = 4;",
    "export function useX() {}",
    "export const useY = () => 1;",
    "export function acquireOverlay() {}",
    "export type Props = { a: 1 };",
    "export interface KnopProps {}",
    "export type { Foo } from './foo';",
    "export function OverlayPresenceProvider() {}",
    "export function Knop() {}",
    "const Intern = () => null;",
    "  export function Ingesprongen() {}",
  ].join("\n");
  assert.deepEqual(componentNamen(tekst), ["OverlayPresenceProvider", "Knop"]);
});

// --- registerSleutels -------------------------------------------------------

test("registerSleutels: sleutels op diepte 1, ook met geneste objecten, JSX en strings", () => {
  const tekst = `
    export const VOORBEELDEN: Voorbeeldregister = {
      Knop: () => (
        <div className="a" data-x={{ b: 1 }}>
          {[1, 2].map((n) => ({ sleutel: n }))}
        </div>
      ),
      "Chip": () => <Chip />,
      'Segment': () => null,
      Toets() { return null; },
    };
    export const ANDER = { Nep: 1 };
  `;
  const sleutels = registerSleutels(tekst, "VOORBEELDEN");
  assert.ok(sleutels);
  assert.ok(sleutels.includes("Knop"));
  assert.ok(sleutels.includes("Chip"));
  assert.ok(sleutels.includes("Segment"));
  for (const geneste of ["sleutel", "b", "Nep", "ANDER"]) assert.ok(!sleutels.includes(geneste), geneste);
});

test("registerSleutels: leeg register geeft [], ontbrekend register geeft null", () => {
  assert.deepEqual(registerSleutels("export const VOORBEELDEN = {};", "VOORBEELDEN"), []);
  assert.equal(registerSleutels("export const ANDERS = { A: 1 };", "VOORBEELDEN"), null);
});

// --- CODES -----------------------------------------------------------------

test("CODES: precies context, data, schermvullend en staten; alleen data vraagt een toelichting", () => {
  assert.deepEqual(Object.keys(CODES).sort(), ["context", "data", "schermvullend", "staten"]);
  for (const [code, def] of Object.entries(CODES) as [string, Record<string, unknown>][]) {
    assert.equal(typeof def.omschrijving, "string", code);
    assert.ok((def.omschrijving as string).trim(), code);
    assert.equal(typeof def.oplossing, "string", code);
    assert.ok((def.oplossing as string).trim(), code);
    assert.equal(def.toelichtingVerplicht, code === "data", code);
  }
});

// --- analyseer --------------------------------------------------------------

const CODELIJST = "context, data, schermvullend, staten";
const PLEK = "systeem.lokaal.json → uitzonderingen";
const G2 = (x: string, code: string) => `${x}: onbekende code "${code}" in ${PLEK}; kies uit: ${CODELIJST}`;
const G3 = (x: string) => `${x}: uitzondering zonder code in ${PLEK}; kies uit: ${CODELIJST}`;
const G4 = (x: string, sleutel = "systeem-zonder-voorbeeld") =>
  `${x}: staat in ${PLEK} maar is geen uitzondering (niet in .kit/baseline.json → ${sleutel}) — haal hem weg`;
const G5 = (x: string, veld: string) => `${x}: onbekend veld "${veld}" in ${PLEK}; toegestaan: code, toelichting`;
const G6 = (x: string) => `${x}: lege toelichting in ${PLEK}; laat het veld weg of vul het in`;
const G7 = (x: string, code: string) => `${x}: code "${code}" vraagt een toelichting in ${PLEK}`;

/** Eén uitzondering `A` (in de baseline, zonder voorbeeld) met de gegeven entry. */
const eenUitzondering = (entry: unknown) =>
  analyseer({ componenten: ["A"], sleutels: [], uitzonderingen: { A: entry }, tolereerbaar: ["A"] }).uitzonderingProblemen;

test("analyseer: alles gedekt geeft niets", () => {
  const r = analyseer({ componenten: ["Knop", "Chip"], sleutels: ["Knop", "Chip"], uitzonderingen: {}, tolereerbaar: [] });
  assert.deepEqual(r, { ontbrekend: [], onbekend: [], uitzonderingProblemen: [] });
});

test("analyseer: component zonder voorbeeld is ontbrekend (gesorteerd)", () => {
  const r = analyseer({ componenten: ["Zeta", "Alfa", "Knop"], sleutels: ["Knop"], uitzonderingen: {}, tolereerbaar: [] });
  assert.deepEqual(r.ontbrekend, ["Alfa", "Zeta"]);
});

test("analyseer: register-sleutel zonder component is onbekend", () => {
  const r = analyseer({ componenten: ["Knop"], sleutels: ["Knop", "Weg"], uitzonderingen: {}, tolereerbaar: [] });
  assert.deepEqual(r.onbekend, ["Weg"]);
});

test("analyseer: geldige code, met en zonder toelichting (niet-data), en data met toelichting geven geen probleem", () => {
  for (const code of ["context", "schermvullend", "staten"]) {
    assert.deepEqual(eenUitzondering({ code }), [], code);
    assert.deepEqual(eenUitzondering({ code, toelichting: "waarom" }), [], code);
  }
  assert.deepEqual(eenUitzondering({ code: "data", toelichting: "leest echte data" }), []);
});

test("analyseer: G2 onbekende code", () => {
  assert.deepEqual(eenUitzondering({ code: "anders" }), [G2("A", "anders")]);
  assert.deepEqual(eenUitzondering({ code: "" }), [G2("A", "")]);
});

test("analyseer: G3 naam in de baseline zonder entry", () => {
  const r = analyseer({ componenten: ["A", "B"], sleutels: [], uitzonderingen: {}, tolereerbaar: ["A"] });
  assert.deepEqual(r.uitzonderingProblemen, [G3("A")]);
});

test("analyseer: G3 entry zonder code, code geen string, entry geen object", () => {
  assert.deepEqual(eenUitzondering({ toelichting: "waarom" }), [G3("A")]);
  assert.deepEqual(eenUitzondering({}), [G3("A")]);
  assert.deepEqual(eenUitzondering({ code: 1 }), [G3("A")]);
  assert.deepEqual(eenUitzondering({ code: null }), [G3("A")]);
  assert.deepEqual(eenUitzondering({ code: ["data"] }), [G3("A")]);
  for (const geenObject of ["staten", null, 3, true, ["staten"]]) {
    assert.deepEqual(eenUitzondering(geenObject), [G3("A")], JSON.stringify(geenObject));
  }
});

test("analyseer: G4 voor een component met voorbeeld (omgekeerd: was geen probleem onder redenen)", () => {
  const r = analyseer({ componenten: ["Knop"], sleutels: ["Knop"], uitzonderingen: { Knop: { code: "staten" } }, tolereerbaar: [] });
  assert.deepEqual(r.uitzonderingProblemen, [G4("Knop")]);
});

test("analyseer: G4 voor een niet-bestaande naam buiten de baseline", () => {
  const r = analyseer({ componenten: ["Knop"], sleutels: ["Knop"], uitzonderingen: { Spook: { code: "context" } }, tolereerbaar: [] });
  assert.deepEqual(r.uitzonderingProblemen, [G4("Spook")]);
});

test("analyseer: G4 voor een component zonder voorbeeld dat niet in de baseline staat; noemt de baselineSleutel", () => {
  const r = analyseer({
    componenten: ["A"],
    sleutels: [],
    uitzonderingen: { A: { code: "staten" } },
    tolereerbaar: [],
    baselineSleutel: "andere-sleutel",
  });
  assert.deepEqual(r.uitzonderingProblemen, [G4("A", "andere-sleutel")]);
});

test("analyseer: een uitzondering in de baseline die niet meer bestaat mag een entry hebben (de ratchet meldt hem)", () => {
  const r = analyseer({ componenten: [], sleutels: [], uitzonderingen: { X: { code: "staten" } }, tolereerbaar: ["X"] });
  assert.deepEqual(r.uitzonderingProblemen, []);
});

test("analyseer: G5 onbekend veld, ook de oude `reden`", () => {
  assert.deepEqual(eenUitzondering({ code: "staten", reden: "oud" }), [G5("A", "reden")]);
  assert.deepEqual(eenUitzondering({ code: "staten", toelichting: "ok", extra: 1 }), [G5("A", "extra")]);
});

test("analyseer: G6 lege, witruimte- of niet-string toelichting", () => {
  for (const toelichting of ["", "   ", "\n\t", 5, null, ["x"], {}]) {
    assert.deepEqual(eenUitzondering({ code: "staten", toelichting }), [G6("A")], JSON.stringify(toelichting));
  }
  assert.deepEqual(eenUitzondering({ code: "data", toelichting: "  " }), [G6("A")]);
});

test("analyseer: G7 data zonder toelichting", () => {
  assert.deepEqual(eenUitzondering({ code: "data" }), [G7("A", "data")]);
});

test("analyseer: hooguit één melding per naam; G5–G7 pas na een geldige code", () => {
  // Onbekende code én onbekend veld én lege toelichting: alleen G2.
  assert.deepEqual(eenUitzondering({ code: "anders", reden: "x", toelichting: "" }), [G2("A", "anders")]);
  // Geen code én onbekend veld: alleen G3.
  assert.deepEqual(eenUitzondering({ reden: "x" }), [G3("A")]);
  // data, onbekend veld én geen toelichting: alleen G5.
  assert.deepEqual(eenUitzondering({ code: "data", reden: "x" }), [G5("A", "reden")]);
  // Geen uitzondering én een kapotte entry: alleen G4.
  const r = analyseer({ componenten: ["B"], sleutels: ["B"], uitzonderingen: { B: { code: "x", reden: "y" } }, tolereerbaar: [] });
  assert.deepEqual(r.uitzonderingProblemen, [G4("B")]);
  // Meerdere namen: één melding per naam.
  const m = analyseer({
    componenten: ["A", "B", "C"],
    sleutels: [],
    uitzonderingen: { A: { code: "data", toelichting: "" }, B: { code: 1, extra: 2 } },
    tolereerbaar: ["A", "B", "C"],
  });
  assert.deepEqual([...m.uitzonderingProblemen].sort(), [G3("B"), G3("C"), G6("A")].sort());
});

// --- draai(root), end-to-end -----------------------------------------------

type Boom = {
  componenten: Record<string, string>;
  register: string;
  baseline: Record<string, string[]>;
  uitzonderingen: Record<string, unknown>;
  /** Extra sleutels in systeem.lokaal.json (bijvoorbeeld de oude `redenen`). */
  extra?: Record<string, unknown>;
};

async function draaiIn({ componenten, register, baseline, uitzonderingen, extra = {} }: Boom): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), "systeem-catalogus-"));
  tmpDirs.push(dir);
  const schrijf = (rel: string, inhoud: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), inhoud);
  };
  for (const [naam, inhoud] of Object.entries(componenten)) schrijf(`src/components/${naam}`, inhoud);
  schrijf("src/voorbeelden.tsx", register);
  schrijf(".kit/baseline.json", JSON.stringify(baseline));
  schrijf(
    "scripts/kit/systeem.lokaal.json",
    JSON.stringify({
      componentenMap: "src/components",
      registerPad: "src/voorbeelden.tsx",
      registerNaam: "VOORBEELDEN",
      baselineSleutel: "systeem-zonder-voorbeeld",
      route: "/design/systeem",
      uitzonderingen,
      ...extra,
    }),
  );
  mkdirSync(join(dir, "scripts/kit"), { recursive: true });
  copyFileSync(join(KIT, "systeem.mjs"), join(dir, "scripts/kit/systeem.mjs"));
  copyFileSync(join(KIT, "ratchet.mjs"), join(dir, "scripts/kit/ratchet.mjs"));
  const mod = (await import(pathToFileURL(join(dir, "scripts/kit/systeem.mjs")).href)) as {
    draai: (root: string) => string[];
  };
  return mod.draai(dir);
}

const KNOP = "export function Knop() { return null; }\nexport const PIN_LENGTH = 4;\nexport function useX() {}\n";
const CHIP = "export const Chip = () => null;\n";
const REGISTER = (...namen: string[]) =>
  `export const VOORBEELDEN: Voorbeeldregister = {\n${namen.map((n) => `  ${n}: () => null,`).join("\n")}\n};\n`;
const G8 = 'systeem.lokaal.json: "redenen" is vervangen door "uitzonderingen" (docs/features/ontwerpsysteem-uitzonderingen.md)';
const G1 = (x: string) =>
  `${x}: staat niet in /design/systeem: voeg een voorbeeld toe in src/voorbeelden.tsx, of (alleen met Brams akkoord, label gate-wijziging) een uitzondering met een code (${CODELIJST}) in ${PLEK}`;

test("draai: alles gedekt, geen problemen", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop", "Chip"),
    baseline: {},
    uitzonderingen: {},
  });
  assert.deepEqual(p, []);
});

test("draai: een bekende uitzondering met een geldige code slaagt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: { "systeem-zonder-voorbeeld": ["Chip"] },
    uitzonderingen: { Chip: { code: "data", toelichting: "leest data" } },
  });
  assert.deepEqual(p, []);
});

test("draai: G1 component zonder voorbeeld en zonder uitzondering faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: {},
  });
  assert.deepEqual(p, [G1("Chip")]);
});

test("draai: componenten in submappen tellen mee, niet-tsx niet", async () => {
  const p = await draaiIn({
    componenten: { "sub/Diep.tsx": "export function Diep() {}\n", "Helper.ts": "export function Helper() {}\n" },
    register: REGISTER(),
    baseline: {},
    uitzonderingen: {},
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^Diep: /);
});

test("draai: register-sleutel zonder component faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP },
    register: REGISTER("Knop", "Verdwenen"),
    baseline: {},
    uitzonderingen: {},
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^Verdwenen: staat in het register maar bestaat niet meer/);
});

test("draai: G3 uitzondering zonder code faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: { "systeem-zonder-voorbeeld": ["Chip"] },
    uitzonderingen: {},
  });
  assert.deepEqual(p, [G3("Chip")]);
});

test("draai: G4 uitzondering-entry zonder baseline en zonder component faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: { Spook: { code: "context" } },
  });
  assert.deepEqual(p, [G4("Spook")]);
});

test("draai: G8 de oude sleutel `redenen` faalt, ook naast geldige uitzonderingen", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: { "systeem-zonder-voorbeeld": ["Chip"] },
    uitzonderingen: { Chip: { code: "staten" } },
    extra: { redenen: { Chip: "oud" } },
  });
  assert.deepEqual(p, [G8]);
  const leeg = await draaiIn({
    componenten: { "Knop.tsx": KNOP },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: {},
    extra: { redenen: {} },
  });
  assert.deepEqual(leeg, [G8]);
});

test("draai: G9 opgeloste uitzondering geeft de ratchet-melding; na de baseline-update G4", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop", "Chip"),
    baseline: { "systeem-zonder-voorbeeld": ["Chip"] },
    uitzonderingen: { Chip: { code: "staten" } },
  });
  assert.equal(p.length, 1);
  assert.match(
    p[0] ?? "",
    /^Chip: staat in \.kit\/baseline\.json → systeem-zonder-voorbeeld maar is opgelost — draai `?npm run ratchet:update`? en commit de daling$/,
  );
  const na = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop", "Chip"),
    baseline: {},
    uitzonderingen: { Chip: { code: "staten" } },
  });
  assert.deepEqual(na, [G4("Chip")]);
});

test("draai: ontbrekend register geeft een melding", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP },
    register: "export const ANDERS = { A: 1 };\n",
    baseline: {},
    uitzonderingen: {},
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /register `VOORBEELDEN` niet gevonden/);
});

// --- de echte config ----------------------------------------------------------

const ROOT = join(KIT, "..", "..");

test("echte config: draai() geeft geen problemen", () => {
  assert.deepEqual(draaiEcht(), []);
});

test("echte config: de namen in uitzonderingen zijn precies die in .kit/baseline.json", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "scripts/kit/systeem.lokaal.json"), "utf8"));
  const baseline = JSON.parse(readFileSync(join(ROOT, ".kit/baseline.json"), "utf8"));
  assert.ok(!Object.hasOwn(cfg, "redenen"));
  assert.ok(cfg.uitzonderingen && typeof cfg.uitzonderingen === "object");
  const namen = Object.keys(cfg.uitzonderingen).sort();
  const inBaseline = [...(baseline[cfg.baselineSleutel] ?? [])].sort();
  assert.deepEqual(namen, inBaseline);
});
