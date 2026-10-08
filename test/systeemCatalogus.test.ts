import { test, after } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


/**
 * check:catalogus (docs/features/ontwerpsysteem.md → Tests): de pure functies
 * en één end-to-end run van `draai(root)` tegen een minimale tijdelijke boom.
 * systeem.mjs en ratchet.mjs worden naar die boom gekopieerd: de ratchet leest
 * .kit/baseline.json relatief aan zichzelf, dus alleen zo gebruikt de run de
 * baseline van de tijdelijke boom en niet die van de echte repo.
 */
const KIT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "kit");
const { analyseer, componentNamen, registerSleutels } = await import(pathToFileURL(join(KIT, "systeem.mjs")).href);
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

// --- analyseer --------------------------------------------------------------

test("analyseer: alles gedekt geeft niets", () => {
  const r = analyseer({ componenten: ["Knop", "Chip"], sleutels: ["Knop", "Chip"], redenen: {}, tolereerbaar: [] });
  assert.deepEqual(r, { ontbrekend: [], onbekend: [], redenProblemen: [] });
});

test("analyseer: component zonder voorbeeld is ontbrekend (gesorteerd)", () => {
  const r = analyseer({ componenten: ["Zeta", "Alfa", "Knop"], sleutels: ["Knop"], redenen: {}, tolereerbaar: [] });
  assert.deepEqual(r.ontbrekend, ["Alfa", "Zeta"]);
});

test("analyseer: register-sleutel zonder component is onbekend", () => {
  const r = analyseer({ componenten: ["Knop"], sleutels: ["Knop", "Weg"], redenen: {}, tolereerbaar: [] });
  assert.deepEqual(r.onbekend, ["Weg"]);
});

test("analyseer: uitzondering zonder reden, ook met een lege of witruimte-reden", () => {
  const zonder = analyseer({ componenten: ["A", "B"], sleutels: [], redenen: {}, tolereerbaar: ["A"] });
  assert.equal(zonder.redenProblemen.length, 1);
  assert.match(zonder.redenProblemen[0] ?? "", /^A: uitzondering zonder reden/);
  const leeg = analyseer({ componenten: ["A"], sleutels: [], redenen: { A: "   " }, tolereerbaar: ["A"] });
  assert.equal(leeg.redenProblemen.length, 1);
});

test("analyseer: reden voor een niet-uitzondering die ook geen component is", () => {
  const r = analyseer({ componenten: ["Knop"], sleutels: ["Knop"], redenen: { Spook: "weg" }, tolereerbaar: [] });
  assert.equal(r.redenProblemen.length, 1);
  assert.match(r.redenProblemen[0] ?? "", /^Spook: .*bestaat niet meer/);
});

test("analyseer: reden voor een bestaande component (geen uitzondering) is geen probleem; uitzondering mag ontbreken als component", () => {
  const a = analyseer({ componenten: ["Knop"], sleutels: ["Knop"], redenen: { Knop: "waarom" }, tolereerbaar: [] });
  assert.deepEqual(a.redenProblemen, []);
  const b = analyseer({ componenten: [], sleutels: [], redenen: { X: "r" }, tolereerbaar: ["X"] });
  assert.deepEqual(b.redenProblemen, []);
});

// --- draai(root), end-to-end -----------------------------------------------

type Boom = {
  componenten: Record<string, string>;
  register: string;
  baseline: Record<string, string[]>;
  redenen: Record<string, string>;
};

async function draaiIn({ componenten, register, baseline, redenen }: Boom): Promise<string[]> {
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
      redenen,
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

test("draai: alles gedekt, geen problemen", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop", "Chip"),
    baseline: {},
    redenen: {},
  });
  assert.deepEqual(p, []);
});

test("draai: een bekende uitzondering met reden slaagt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: { "systeem-zonder-voorbeeld": ["Chip"] },
    redenen: { Chip: "leest data" },
  });
  assert.deepEqual(p, []);
});

test("draai: component zonder voorbeeld en zonder uitzondering faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: {},
    redenen: {},
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^Chip: staat niet in \/design\/systeem/);
});

test("draai: componenten in submappen tellen mee, niet-tsx niet", async () => {
  const p = await draaiIn({
    componenten: { "sub/Diep.tsx": "export function Diep() {}\n", "Helper.ts": "export function Helper() {}\n" },
    register: REGISTER(),
    baseline: {},
    redenen: {},
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^Diep: /);
});

test("draai: register-sleutel zonder component faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP },
    register: REGISTER("Knop", "Verdwenen"),
    baseline: {},
    redenen: {},
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^Verdwenen: staat in het register maar bestaat niet meer/);
});

test("draai: uitzondering zonder reden faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop"),
    baseline: { "systeem-zonder-voorbeeld": ["Chip"] },
    redenen: {},
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^Chip: uitzondering zonder reden/);
});

test("draai: reden zonder uitzondering en zonder component faalt", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP },
    register: REGISTER("Knop"),
    baseline: {},
    redenen: { Spook: "bestond ooit" },
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^Spook: .*bestaat niet meer/);
});

test("draai: opgeloste uitzondering (in baseline, nu in register) faalt met de ratchet-melding", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP, "Chip.tsx": CHIP },
    register: REGISTER("Knop", "Chip"),
    baseline: { "systeem-zonder-voorbeeld": ["Chip"] },
    redenen: { Chip: "was uitzondering" },
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^Chip: staat in \.kit\/baseline\.json .* opgelost .* ratchet:update/);
});

test("draai: ontbrekend register geeft een melding", async () => {
  const p = await draaiIn({
    componenten: { "Knop.tsx": KNOP },
    register: "export const ANDERS = { A: 1 };\n",
    baseline: {},
    redenen: {},
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /register `VOORBEELDEN` niet gevonden/);
});
