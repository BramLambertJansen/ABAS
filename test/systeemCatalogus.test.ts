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
const { analyseer, componentNamen, registerSleutels, CODES, valideerVensters, valideerInteracties, draai: draaiEcht } = await import(pathToFileURL(join(KIT, "systeem.mjs")).href);
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
  /** Extra bestanden in de boom (pad relatief aan de root → inhoud), bijvoorbeeld het interactiebestand. */
  bestanden?: Record<string, string>;
};

async function draaiIn({ componenten, register, baseline, uitzonderingen, extra = {}, bestanden = {} }: Boom): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), "systeem-catalogus-"));
  tmpDirs.push(dir);
  const schrijf = (rel: string, inhoud: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), inhoud);
  };
  for (const [naam, inhoud] of Object.entries(componenten)) schrijf(`src/components/${naam}`, inhoud);
  schrijf("src/voorbeelden.tsx", register);
  schrijf(".kit/baseline.json", JSON.stringify(baseline));
  for (const [rel, inhoud] of Object.entries(bestanden)) schrijf(rel, inhoud);
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

// --- vensters (PR 3): dekking en V1–V5 ------------------------------------------

const V1 = (id: string, x: string, map = "src/components") => `${id}: venster noemt ${x}, maar ${x} bestaat niet in ${map} — haal hem weg`;
const V2 = (id: string) => `${id}: venster zonder componenten in systeem.lokaal.json → vensters`;
const V3 = (id: string) => `${id}: breedte en hoogte moeten gehele getallen tussen 200 en 2000 zijn`;
const V4 = (id: string) => `${id}: venster-id alleen kleine letters, cijfers en streepjes`;
const V5 = (id: string, veld: string) =>
  `${id}: onbekend veld "${veld}" in systeem.lokaal.json → vensters; toegestaan: componenten, breedte, hoogte, eigenLandmark`;

const venster = (extra: Record<string, unknown> = {}) => ({ componenten: ["Overlay"], breedte: 768, hoogte: 560, ...extra });
const eenVenster = (id: string, v: unknown, componenten = ["Overlay", "Knop"]) =>
  valideerVensters({ [id]: v }, componenten, "src/components");

test("analyseer: een component dat alleen in een venster staat is gedekt (geen G1)", () => {
  const r = analyseer({
    componenten: ["Knop", "Overlay", "StartScherm"],
    sleutels: ["Knop"],
    uitzonderingen: {},
    tolereerbaar: [],
    vensters: { "overlay-modal": venster(), "start-scherm": venster({ componenten: ["StartScherm"], eigenLandmark: true }) },
  });
  assert.deepEqual(r, { ontbrekend: [], onbekend: [], uitzonderingProblemen: [] });
});

test("analyseer: een venster dekt alleen de componenten die het noemt", () => {
  const r = analyseer({
    componenten: ["Overlay", "ZijPaneel"],
    sleutels: [],
    uitzonderingen: {},
    tolereerbaar: [],
    vensters: { "overlay-modal": venster() },
  });
  assert.deepEqual(r.ontbrekend, ["ZijPaneel"]);
});

test("analyseer: G4 ook voor een component dat een venster heeft maar nog een uitzondering-entry", () => {
  const r = analyseer({
    componenten: ["Overlay"],
    sleutels: [],
    uitzonderingen: { Overlay: { code: "context" } },
    tolereerbaar: [],
    vensters: { "overlay-modal": venster() },
  });
  assert.deepEqual(r.uitzonderingProblemen, [G4("Overlay")]);
});

test("valideerVensters: geldige vensters, met en zonder eigenLandmark, en de grenzen 200 en 2000", () => {
  assert.deepEqual(
    valideerVensters(
      {
        "overlay-modal": venster({ componenten: ["Overlay", "Knop"] }),
        "start-scherm": venster({ eigenLandmark: true }),
        a1: venster({ breedte: 200, hoogte: 2000 }),
      },
      ["Overlay", "Knop"],
      "src/components",
    ),
    [],
  );
  assert.deepEqual(valideerVensters({}, ["Overlay"], "src/components"), []);
});

test("valideerVensters: V1 een venster noemt een component dat niet bestaat; noemt de componentenMap", () => {
  assert.deepEqual(eenVenster("overlay-modal", venster({ componenten: ["Overlay", "Weg"] })), [V1("overlay-modal", "Weg")]);
  assert.deepEqual(valideerVensters({ x: venster({ componenten: ["Weg"] }) }, [], "lib/ui"), [V1("x", "Weg", "lib/ui")]);
});

test("valideerVensters: V2 venster zonder componenten (ontbrekend, leeg, geen lijst)", () => {
  for (const componenten of [undefined, [], "Overlay", null, { Overlay: true }]) {
    const v = venster({ componenten });
    if (componenten === undefined) delete (v as Record<string, unknown>).componenten;
    assert.deepEqual(eenVenster("leeg", v), [V2("leeg")], JSON.stringify(componenten));
  }
});

test("valideerVensters: V3 breedte of hoogte geen geheel getal tussen 200 en 2000", () => {
  const fout: Record<string, unknown>[] = [
    { breedte: 199 },
    { breedte: 2001 },
    { hoogte: 199 },
    { hoogte: 2001 },
    { breedte: 768.5 },
    { breedte: "768" },
    { hoogte: null },
    { breedte: -768 },
  ];
  for (const extra of fout) assert.deepEqual(eenVenster("maat", venster(extra)), [V3("maat")], JSON.stringify(extra));
  const zonderHoogte = venster();
  delete (zonderHoogte as Record<string, unknown>).hoogte;
  assert.deepEqual(eenVenster("maat", zonderHoogte), [V3("maat")]);
});

test("valideerVensters: V4 venster-id geen kebab-case", () => {
  for (const id of ["Overlay-Modal", "overlay_modal", "overlay modal", "-overlay", "overlay-", "overlay--modal", "overlay.modal", "é"]) {
    assert.deepEqual(eenVenster(id, venster()), [V4(id)], id);
  }
});

test("valideerVensters: V5 onbekend veld", () => {
  assert.deepEqual(eenVenster("veld", venster({ viewport: { width: 768 } })), [V5("veld", "viewport")]);
  assert.deepEqual(eenVenster("veld", venster({ width: 768 })), [V5("veld", "width")]);
});

// --- interacties (PR 3): I1–I7 --------------------------------------------------

const I1 = (n: string) => `interactie ${n}: kies precies één doel: sectie of venster`;
const I2 = (n: string, id: string) => `interactie ${n}: venster "${id}" bestaat niet in systeem.lokaal.json → vensters`;
const I3 = (n: string, doel: string) => `interactie ${n}: naam ontbreekt, is geen kebab-case of is dubbel bij ${doel}`;
const I4 = (n: string, stap: number) => `interactie ${n}, stap ${stap}: kies precies één actie: klik, typ, toets, verwacht`;
const I5 = (n: string, stap: number) => `interactie ${n}, stap ${stap}: doelwit is precies één van rol (met optioneel naam), label of tekst`;
const I6 = (n: string, stap: number, veld: string) => `interactie ${n}, stap ${stap}: ongeldige waarde voor ${veld}`;
const I7 = (n: string) => `interactie ${n}: eindig met een verwacht-stap, zodat de screenshot pas volgt als de staat er is`;

const VENSTERS = { "overlay-bezig": venster() };
const VERWACHT = { verwacht: { tekst: "klaar" } };
/** Eén interactie `x` op sectie `s` met de gegeven stappen. */
const stappen = (...s: unknown[]) => valideerInteracties([{ naam: "x", sectie: "s", stappen: s }], VENSTERS);

test("valideerInteracties: geldige interacties met elke actie, elk doelwit en beide doelen", () => {
  const interacties = [
    {
      naam: "alles",
      sectie: "code-invoer",
      stappen: [
        { klik: { rol: "button", naam: "Cijfer 1" }, keer: 6 },
        { klik: { rol: "button" } },
        { klik: { label: "Zoek" }, keer: 1 },
        { klik: { tekst: "Anna" }, keer: 10 },
        { typ: "a", in: { label: "Zoek lid op naam" } },
        { typ: "", in: { rol: "combobox", naam: "Zoek lid op naam" } },
        { toets: "Escape" },
        { toets: "Tab", keer: 2 },
        { verwacht: { rol: "listbox", naam: "Gevonden leden" }, staat: "zichtbaar" },
        { verwacht: { rol: "button", naam: "Cijfer 2" }, staat: "uitgeschakeld" },
        { verwacht: { tekst: "klaar" } },
      ],
    },
    { naam: "melding", venster: "overlay-bezig", stappen: [{ toets: "Escape" }, VERWACHT] },
    // Dezelfde naam bij een ander doel mag.
    { naam: "melding", sectie: "code-invoer", stappen: [VERWACHT] },
  ];
  assert.deepEqual(valideerInteracties(interacties, VENSTERS), []);
  assert.deepEqual(valideerInteracties([], VENSTERS), []);
});

test("valideerInteracties: I1 niet precies één doel", () => {
  assert.deepEqual(valideerInteracties([{ naam: "x", stappen: [VERWACHT] }], VENSTERS), [I1("x")]);
  assert.deepEqual(valideerInteracties([{ naam: "x", sectie: "s", venster: "overlay-bezig", stappen: [VERWACHT] }], VENSTERS), [I1("x")]);
  assert.deepEqual(valideerInteracties([{ naam: "x", sectie: "", stappen: [VERWACHT] }], VENSTERS), [I1("x")]);
  assert.deepEqual(valideerInteracties([{ naam: "x", sectie: 3, stappen: [VERWACHT] }], VENSTERS), [I1("x")]);
});

test("valideerInteracties: I2 het venster bestaat niet in vensters", () => {
  assert.deepEqual(valideerInteracties([{ naam: "x", venster: "overlay-weg", stappen: [VERWACHT] }], VENSTERS), [I2("x", "overlay-weg")]);
  assert.deepEqual(valideerInteracties([{ naam: "x", venster: "overlay-bezig", stappen: [VERWACHT] }], {}), [I2("x", "overlay-bezig")]);
});

test("valideerInteracties: I3 naam geen kebab-case of dubbel bij hetzelfde doel", () => {
  for (const naam of ["Lijst-Open", "lijst_open", "lijst open", ""]) {
    assert.deepEqual(valideerInteracties([{ naam, sectie: "s", stappen: [VERWACHT] }], VENSTERS), [I3(naam, "sectie s")], naam);
  }
  const dubbel = [
    { naam: "fout", sectie: "s", stappen: [VERWACHT] },
    { naam: "fout", sectie: "s", stappen: [VERWACHT] },
  ];
  assert.deepEqual(valideerInteracties(dubbel, VENSTERS), [I3("fout", "sectie s")]);
  const dubbelVenster = [
    { naam: "melding", venster: "overlay-bezig", stappen: [VERWACHT] },
    { naam: "melding", venster: "overlay-bezig", stappen: [VERWACHT] },
  ];
  assert.deepEqual(valideerInteracties(dubbelVenster, VENSTERS), [I3("melding", "venster overlay-bezig")]);
});

test("valideerInteracties: I3 naam ontbreekt (de melding noemt het doel)", () => {
  const p = valideerInteracties([{ sectie: "s", stappen: [VERWACHT] }], VENSTERS);
  assert.equal(p.length, 1);
  assert.match(p[0], /^interactie .*: naam ontbreekt, is geen kebab-case of is dubbel bij sectie s$/);
});

test("valideerInteracties: I4 een stap zonder of met meer dan één actie", () => {
  assert.deepEqual(stappen({}, VERWACHT), [I4("x", 1)]);
  assert.deepEqual(stappen({ keer: 2 }, VERWACHT), [I4("x", 1)]);
  assert.deepEqual(stappen({ klik: { tekst: "a" }, toets: "Enter" }, VERWACHT), [I4("x", 1)]);
  assert.deepEqual(stappen(VERWACHT, { typ: "a", in: { label: "b" }, verwacht: { tekst: "c" } }, VERWACHT), [I4("x", 2)]);
  assert.deepEqual(stappen(null, VERWACHT), [I4("x", 1)]);
  assert.deepEqual(stappen("klik", VERWACHT), [I4("x", 1)]);
});

test("valideerInteracties: I5 ongeldig doelwit", () => {
  const fout: unknown[] = [
    {},
    null,
    "Cijfer 1",
    { naam: "Cijfer 1" },
    { rol: "button", label: "Cijfer 1" },
    { label: "a", tekst: "b" },
    { rol: "button", tekst: "b" },
    { label: "" },
    { tekst: "  " },
    { rol: "" },
    { rol: "button", naam: "" },
    { label: "a", naam: "b" },
    { css: ".knop" },
  ];
  for (const doelwit of fout) {
    assert.deepEqual(stappen({ klik: doelwit }, VERWACHT), [I5("x", 1)], `klik ${JSON.stringify(doelwit)}`);
    assert.deepEqual(stappen(VERWACHT, { verwacht: doelwit }), [I5("x", 2)], `verwacht ${JSON.stringify(doelwit)}`);
    assert.deepEqual(stappen({ typ: "a", in: doelwit }, VERWACHT), [I5("x", 1)], `typ ${JSON.stringify(doelwit)}`);
  }
  // typ zonder `in`.
  assert.deepEqual(stappen({ typ: "a" }, VERWACHT), [I5("x", 1)]);
});

test("valideerInteracties: I6 ongeldige keer, toets, typ, staat of lege stappen", () => {
  for (const keer of [0, 11, 1.5, "2", null, -1]) {
    assert.deepEqual(stappen({ klik: { tekst: "a" }, keer }, VERWACHT), [I6("x", 1, "keer")], `klik keer ${JSON.stringify(keer)}`);
    assert.deepEqual(stappen({ toets: "Tab", keer }, VERWACHT), [I6("x", 1, "keer")], `toets keer ${JSON.stringify(keer)}`);
  }
  for (const toets of ["", "  ", 5, null, ["Escape"]]) {
    assert.deepEqual(stappen({ toets }, VERWACHT), [I6("x", 1, "toets")], `toets ${JSON.stringify(toets)}`);
  }
  for (const typ of [5, null, ["a"], { a: 1 }]) {
    assert.deepEqual(stappen({ typ, in: { label: "b" } }, VERWACHT), [I6("x", 1, "typ")], `typ ${JSON.stringify(typ)}`);
  }
  assert.deepEqual(stappen(VERWACHT, { verwacht: { tekst: "a" }, staat: "verborgen" }), [I6("x", 2, "staat")]);
  // Een veld dat niet bij de actie hoort.
  assert.deepEqual(stappen({ toets: "Escape", in: { label: "a" } }, VERWACHT), [I6("x", 1, "in")]);
  assert.deepEqual(stappen({ verwacht: { tekst: "a" }, keer: 2 }), [I6("x", 1, "keer")]);
  // Lege of ontbrekende stappen.
  assert.deepEqual(valideerInteracties([{ naam: "x", sectie: "s", stappen: [] }], VENSTERS), [I6("x", 1, "stappen")]);
  assert.deepEqual(valideerInteracties([{ naam: "x", sectie: "s" }], VENSTERS), [I6("x", 1, "stappen")]);
});

test("valideerInteracties: I7 de laatste stap is geen verwacht", () => {
  assert.deepEqual(stappen({ klik: { tekst: "a" } }), [I7("x")]);
  assert.deepEqual(stappen(VERWACHT, { toets: "Escape" }), [I7("x")]);
  assert.deepEqual(stappen(VERWACHT, { typ: "a", in: { label: "b" } }), [I7("x")]);
});

test("valideerInteracties: meldingen per interactie lopen door; de volgende interactie wordt ook gecontroleerd", () => {
  const p = valideerInteracties(
    [
      { naam: "a", stappen: [VERWACHT] },
      { naam: "b", venster: "weg", stappen: [VERWACHT] },
      { naam: "c", sectie: "s", stappen: [{ toets: "Escape" }] },
    ],
    VENSTERS,
  );
  assert.deepEqual(p, [I1("a"), I2("b", "weg"), I7("c")]);
});

// --- draai(root) met vensters en interacties (PR 3) ---------------------------

const G1venster = (x: string) =>
  `${x}: staat niet in /design/systeem: voeg een voorbeeld toe in src/voorbeelden.tsx of een venster in systeem.lokaal.json → vensters, of (alleen met Brams akkoord, label gate-wijziging) een uitzondering met een code (${CODELIJST}) in ${PLEK}`;
const PAD = "e2e/systeem.interacties.json";
const ONGELDIG_BESTAND = `${PAD}: ontbreekt of is geen geldige JSON`;
const GELDIGE_INTERACTIES = JSON.stringify({
  interacties: [
    { naam: "melding", venster: "chip-venster", stappen: [{ toets: "Escape" }, { verwacht: { tekst: "klaar" } }] },
    { naam: "open", sectie: "knop", stappen: [{ klik: { rol: "button", naam: "Knop" } }, { verwacht: { rol: "dialog" } }] },
  ],
});
const CHIP_VENSTER = { "chip-venster": { componenten: ["Chip"], breedte: 768, hoogte: 560 } };

test("draai: een component dat alleen in een venster staat slaagt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: {},
    extra: { vensterRoute: "/design/systeem/venster", vensters: CHIP_VENSTER },
  });
  assert.deepEqual(p, []);
});

test("draai: G1 met de vensterzin zodra de config vensters heeft", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP, "Segment.tsx": "export function Segment() {}\n" },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: {},
    extra: { vensters: CHIP_VENSTER },
  });
  assert.deepEqual(p, [G1venster("Segment")]);
});

test("draai: V1 via de config, met de componentenMap uit de config", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: {},
    extra: { vensters: { "spook-venster": { componenten: ["Spook"], breedte: 768, hoogte: 560 } } },
  });
  assert.deepEqual(p, [V1("spook-venster", "Spook")]);
});

test("draai: een geldig interactiebestand slaagt; een leeg bestand ook", async () => {
  for (const inhoud of [GELDIGE_INTERACTIES, '{ "interacties": [] }']) {
    const p = await draaiIn({
      componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
      register: REGISTER("Knop"),
      baseline: {},
      uitzonderingen: {},
      extra: { vensters: CHIP_VENSTER, interactiesPad: PAD },
      bestanden: { [PAD]: inhoud },
    });
    assert.deepEqual(p, [], inhoud);
  }
});

test("draai: een ontbrekend interactiebestand faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: {},
    extra: { vensters: CHIP_VENSTER, interactiesPad: PAD },
  });
  assert.deepEqual(p, [ONGELDIG_BESTAND]);
});

test("draai: een interactiebestand dat geen geldige JSON is faalt", async () => {
  for (const inhoud of ["", "{", "{ interacties: [] }", '{ "interacties": [ ] , }']) {
    const p = await draaiIn({
      componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
      register: REGISTER("Knop"),
      baseline: {},
      uitzonderingen: {},
      extra: { vensters: CHIP_VENSTER, interactiesPad: PAD },
      bestanden: { [PAD]: inhoud },
    });
    assert.deepEqual(p, [ONGELDIG_BESTAND], JSON.stringify(inhoud));
  }
});

test("draai: I-meldingen uit het interactiebestand komen in de gate", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: {},
    extra: { vensters: CHIP_VENSTER, interactiesPad: PAD },
    bestanden: {
      [PAD]: JSON.stringify({ interacties: [{ naam: "melding", venster: "weg", stappen: [{ toets: "Escape" }] }] }),
    },
  });
  assert.deepEqual(p, [I2("melding", "weg"), I7("melding")]);
});

test("draai: zonder interactiesPad worden geen interacties gecontroleerd", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: {},
    uitzonderingen: {},
    extra: { vensters: CHIP_VENSTER },
    // Een kapot bestand op de gebruikelijke plek telt niet zonder interactiesPad.
    bestanden: { [PAD]: "{" },
  });
  assert.deepEqual(p, []);
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

test("echte config: de ratchet houdt 4 uitzonderingen, alle vier met code data", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "scripts/kit/systeem.lokaal.json"), "utf8"));
  const baseline = JSON.parse(readFileSync(join(ROOT, ".kit/baseline.json"), "utf8"));
  assert.equal((baseline[cfg.baselineSleutel] ?? []).length, 4);
  for (const [naam, entry] of Object.entries(cfg.uitzonderingen) as [string, { code: string }][]) {
    assert.equal(entry.code, "data", naam);
  }
});

test("echte config: vensters, vensterRoute en interactiesPad staan erin; het interactiebestand is geldig", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "scripts/kit/systeem.lokaal.json"), "utf8"));
  assert.equal(typeof cfg.vensterRoute, "string");
  assert.ok(Object.keys(cfg.vensters ?? {}).length > 0);
  const bestand = JSON.parse(readFileSync(join(ROOT, cfg.interactiesPad), "utf8"));
  assert.ok(Array.isArray(bestand.interacties));
  assert.deepEqual(valideerInteracties(bestand.interacties, cfg.vensters), []);
});
