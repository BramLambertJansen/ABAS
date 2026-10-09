import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * check:axe (docs/features/scan-axe.md → Tests): `analyseerBestand` (bron in,
 * sleutels en problemen uit) en `draai(root)` tegen een tijdelijke boom met een
 * eigen .kit/baseline.json. axe.mjs geeft het baselinepad expliciet aan de
 * ratchet, dus kopiëren van de scripts is niet nodig.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { analyseerBestand, draai, REGEL } = (await import(pathToFileURL(join(ROOT, "scripts/kit/axe.mjs")).href)) as {
  analyseerBestand: (pad: string, tekst: string) => { sleutels: string[]; problemen: string[] };
  draai: (root?: string) => string[];
  REGEL: string;
};

const PAD = "e2e/voorbeeld.spec.ts";
const LETTERLIJK = "scanAxe-opties moeten letterlijk zijn";
const scan = (opties: string) => `await scanAxe(page, ${opties});\n`;

const tmpDirs: string[] = [];
after(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

test("REGEL is axe-uitzondering", () => {
  assert.equal(REGEL, "axe-uitzondering");
});

// --- sleutels ---------------------------------------------------------------

test("sleutel: één uitgezet geeft `<pad> uitgezet:<regel>`", () => {
  const r = analyseerBestand(PAD, scan(`{ uitgezet: [{ regel: "image-alt", reden: "x" }] }`));
  assert.deepEqual(r, { sleutels: [`${PAD} uitgezet:image-alt`], problemen: [] });
});

test("sleutel: één overslaan geeft `<pad> overslaan:<selector>`", () => {
  const r = analyseerBestand(PAD, scan(`{ overslaan: [{ selector: "#kaart", reden: "x" }] }`));
  assert.deepEqual(r, { sleutels: [`${PAD} overslaan:#kaart`], problemen: [] });
});

test("sleutel: een herhaling krijgt ` #2`, ook over aanroepen heen", () => {
  const tekst =
    scan(`{ uitgezet: [{ regel: "image-alt", reden: "a" }, { regel: "image-alt", reden: "b" }] }`) +
    scan(`{ uitgezet: [{ regel: "image-alt", reden: "c" }] }`);
  const r = analyseerBestand(PAD, tekst);
  assert.deepEqual(r.sleutels, [`${PAD} uitgezet:image-alt`, `${PAD} uitgezet:image-alt #2`, `${PAD} uitgezet:image-alt #3`]);
  assert.deepEqual(r.problemen, []);
});

test("sleutel: uitgezet en overslaan in één aanroep; template zonder expressie telt als letterlijk", () => {
  const r = analyseerBestand(
    PAD,
    scan("{ uitgezet: [{ regel: `region`, reden: `x` }], overslaan: [{ selector: \"img\", reden: \"y\" }] }"),
  );
  assert.deepEqual(r, { sleutels: [`${PAD} uitgezet:region`, `${PAD} overslaan:img`], problemen: [] });
});

// --- niet letterlijk --------------------------------------------------------

const NIET_LETTERLIJK: { naam: string; opties: string }[] = [
  { naam: "opties als variabele", opties: "opties" },
  { naam: "spread in de opties", opties: "{ ...basis }" },
  { naam: "berekende sleutel", opties: `{ ["uitgezet"]: [{ regel: "image-alt", reden: "x" }] }` },
  { naam: "uitgezet is geen array", opties: "{ uitgezet: lijst }" },
  { naam: "spread in de array", opties: `{ uitgezet: [...lijst] }` },
  { naam: "item is een variabele", opties: `{ overslaan: [item] }` },
  { naam: "regel als variabele", opties: `{ uitgezet: [{ regel: r, reden: "x" }] }` },
  { naam: "lege reden", opties: `{ uitgezet: [{ regel: "image-alt", reden: "" }] }` },
  { naam: "reden met alleen spaties", opties: `{ overslaan: [{ selector: "img", reden: "   " }] }` },
  { naam: "reden ontbreekt", opties: `{ uitgezet: [{ regel: "image-alt" }] }` },
  { naam: "template-literal met expressie als reden", opties: "{ uitgezet: [{ regel: \"image-alt\", reden: `zie ${x}` }] }" },
];

for (const g of NIET_LETTERLIJK) {
  test(`niet letterlijk: ${g.naam} geeft de letterlijk-melding met pad en regelnummer`, () => {
    const r = analyseerBestand(PAD, "// regel 1\n" + scan(g.opties));
    assert.ok(r.problemen.length >= 1, `geen probleem voor ${g.naam}`);
    for (const p of r.problemen) {
      assert.ok(p.startsWith(`${PAD}:2: ${LETTERLIJK}`), `onverwachte melding: ${p}`);
    }
  });
}

test("niet letterlijk: het ongeldige item telt niet als sleutel, het geldige wel", () => {
  const r = analyseerBestand(PAD, scan(`{ uitgezet: [{ regel: "a", reden: "" }, { regel: "b", reden: "x" }] }`));
  assert.deepEqual(r.sleutels, [`${PAD} uitgezet:b`]);
  assert.equal(r.problemen.length, 1);
});

// --- telt niet mee ------------------------------------------------------------

test("binnen en bestPractice tellen niet mee", () => {
  const r = analyseerBestand(PAD, scan(`{ binnen: "main", bestPractice: true }`) + scan(`{ binnen: selector }`));
  assert.deepEqual(r, { sleutels: [], problemen: [] });
});

test("scanAxe zonder opties telt niet mee", () => {
  const r = analyseerBestand(PAD, "await scanAxe(page);\n");
  assert.deepEqual(r, { sleutels: [], problemen: [] });
});

// --- draai(root): overslaan en ratchet -------------------------------------

function boom(bestanden: Record<string, string>, baseline: string[] | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), "axe-gate-"));
  tmpDirs.push(dir);
  mkdirSync(join(dir, ".kit"), { recursive: true });
  mkdirSync(join(dir, "e2e/helpers"), { recursive: true });
  for (const [rel, tekst] of Object.entries(bestanden)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), tekst);
  }
  writeFileSync(join(dir, ".kit/baseline.json"), JSON.stringify(baseline ? { [REGEL]: baseline } : {}, null, 2) + "\n");
  return dir;
}

const UITGEZET = scan(`{ uitgezet: [{ regel: "image-alt", reden: "x" }] }`);

test("draai: helper en e2e/scan-axe.spec.ts worden overgeslagen", () => {
  const ongeldig = scan(`{ uitgezet: [{ regel: "image-alt", reden: "" }] }`) + UITGEZET;
  const dir = boom({ "e2e/helpers/scanAxe.ts": ongeldig, "e2e/scan-axe.spec.ts": ongeldig }, undefined);
  assert.deepEqual(draai(dir), []);
});

test("draai: een geneste map onder e2e/ wordt wel gescand", () => {
  const dir = boom({ "e2e/sub/diep.spec.ts": UITGEZET }, ["e2e/sub/diep.spec.ts uitgezet:image-alt"]);
  assert.deepEqual(draai(dir), []);
});

test("draai: een nieuwe sleutel geeft de melding voor een nieuwe uitzondering", () => {
  const dir = boom({ [PAD]: UITGEZET }, []);
  const problemen = draai(dir);
  assert.equal(problemen.length, 1);
  assert.match(problemen[0] ?? "", /^e2e\/voorbeeld\.spec\.ts uitgezet:image-alt: nieuwe axe-uitzondering/);
});

test("draai: een verdwenen sleutel geeft de opgelost-melding", () => {
  const dir = boom({ [PAD]: "await scanAxe(page);\n" }, [`${PAD} uitgezet:image-alt`]);
  const problemen = draai(dir);
  assert.equal(problemen.length, 1);
  assert.match(problemen[0] ?? "", /^e2e\/voorbeeld\.spec\.ts uitgezet:image-alt: staat in \.kit\/baseline\.json → axe-uitzondering maar is opgelost/);
});

test("draai: gelijk aan de baseline geeft geen problemen", () => {
  const dir = boom({ [PAD]: UITGEZET }, [`${PAD} uitgezet:image-alt`]);
  assert.deepEqual(draai(dir), []);
});

test("draai: een niet-letterlijke optie faalt ook in de run", () => {
  const dir = boom({ [PAD]: scan("opties") }, []);
  const problemen = draai(dir);
  assert.equal(problemen.length, 1);
  assert.ok(problemen[0]?.startsWith(`${PAD}:1: ${LETTERLIJK}`));
});

// --- echte repo ---------------------------------------------------------------

test("echte repo: groen, met precies de beginstand in de baseline", () => {
  assert.deepEqual(draai(), []);
  const baseline = JSON.parse(readFileSync(join(ROOT, ".kit/baseline.json"), "utf8")) as Record<string, string[]>;
  assert.deepEqual(baseline[REGEL], ["e2e/dialogen-tabs-landmarks.spec.ts uitgezet:color-contrast"]);
});

// --- regressie: gaten 1–5 uit de eerste testronde ---------------------------

const REGRESSIE_LETTERLIJK: { naam: string; tekst: string }[] = [
  { naam: "(1) shorthand `{ uitgezet }`", tekst: `const uitgezet = [{ regel: "image-alt", reden: "x" }];\n` + scan("{ uitgezet }") },
  { naam: "(1) shorthand `{ overslaan }`", tekst: `const overslaan = [{ selector: "img", reden: "x" }];\n` + scan("{ overslaan }") },
  { naam: "(2) getter `get uitgezet()`", tekst: "\n" + scan(`{ get uitgezet() { return [{ regel: "image-alt", reden: "x" }]; } }`) },
  { naam: "(2) methode `uitgezet()`", tekst: "\n" + scan(`{ uitgezet() { return []; } }`) },
];

for (const g of REGRESSIE_LETTERLIJK) {
  test(`regressie: ${g.naam} in de opties geeft de letterlijk-melding`, () => {
    const r = analyseerBestand(PAD, g.tekst);
    assert.deepEqual(r.sleutels, []);
    assert.equal(r.problemen.length, 1, JSON.stringify(r.problemen));
    assert.ok(r.problemen[0]?.startsWith(`${PAD}:2: ${LETTERLIJK}`), r.problemen[0]);
  });
}

test("regressie (3): een hernoemde named import van scanAxe wordt herkend", () => {
  const tekst =
    `import { scanAxe as scan } from "./helpers/scanAxe";\n` +
    `await scan(page, { uitgezet: [{ regel: "image-alt", reden: "x" }] });\n` +
    `await scan(page, opties);\n`;
  const r = analyseerBestand(PAD, tekst);
  assert.deepEqual(r.sleutels, [`${PAD} uitgezet:image-alt`]);
  assert.equal(r.problemen.length, 1);
  assert.ok(r.problemen[0]?.startsWith(`${PAD}:3: ${LETTERLIJK}`));
});

test("regressie (3): een andere hernoemde import telt niet als scanAxe", () => {
  const tekst =
    `import { iets as scan } from "./helpers/iets";\n` +
    `await scan(page, { uitgezet: [{ regel: "image-alt", reden: "x" }] });\n`;
  assert.deepEqual(analyseerBestand(PAD, tekst), { sleutels: [], problemen: [] });
});

test("regressie (4): `x.scanAxe(…)` wordt herkend", () => {
  const tekst =
    `await helpers.scanAxe(page, { overslaan: [{ selector: "#kaart", reden: "x" }] });\n` +
    `await helpers.scanAxe(page, opties);\n`;
  const r = analyseerBestand(PAD, tekst);
  assert.deepEqual(r.sleutels, [`${PAD} overslaan:#kaart`]);
  assert.equal(r.problemen.length, 1);
  assert.ok(r.problemen[0]?.startsWith(`${PAD}:2: ${LETTERLIJK}`));
});

test("regressie (5): e2e-bestanden met elke JS/TS-extensie worden gescand, andere niet", () => {
  const extensies = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"];
  const bestanden: Record<string, string> = { "e2e/notities.md": UITGEZET, "e2e/data.json": UITGEZET };
  for (const ext of extensies) bestanden[`e2e/voorbeeld-${ext}.${ext}`] = UITGEZET;
  const dir = boom(bestanden, []);
  const nieuw = draai(dir)
    .map((p) => p.split(" ")[0])
    .sort();
  assert.deepEqual(nieuw, extensies.map((ext) => `e2e/voorbeeld-${ext}.${ext}`).sort());
});

test("regressie (5): JSX in een .tsx-bestand verhindert het tellen niet", () => {
  const tekst = `const el = <div className="x">hoi</div>;\n` + UITGEZET;
  assert.deepEqual(analyseerBestand("e2e/x.spec.tsx", tekst), { sleutels: ["e2e/x.spec.tsx uitgezet:image-alt"], problemen: [] });
});

// --- regressie: geciteerde sleutels en aliassen (review) --------------------

const ALIAS = "roep scanAxe alleen direct aan (geen alias of string-index)";

test("regressie (a): geciteerde sleutels `\"uitgezet\"` en `'overslaan'` worden geteld", () => {
  const tekst =
    scan(`{ "uitgezet": [{ regel: "image-alt", reden: "x" }] }`) +
    scan(`{ 'overslaan': [{ selector: "img", reden: "x" }] }`) +
    scan(`{ uitgezet: [{ "regel": "region", "reden": "x" }] }`);
  assert.deepEqual(analyseerBestand(PAD, tekst), {
    sleutels: [`${PAD} uitgezet:image-alt`, `${PAD} overslaan:img`, `${PAD} uitgezet:region`],
    problemen: [],
  });
});

test("regressie (a): een geciteerde sleutel met een niet-letterlijke waarde faalt", () => {
  const r = analyseerBestand(PAD, scan(`{ "uitgezet": lijst }`));
  assert.deepEqual(r.sleutels, []);
  assert.equal(r.problemen.length, 1);
  assert.ok(r.problemen[0]?.startsWith(`${PAD}:1: ${LETTERLIJK}`));
});

test("regressie (a): geciteerde `\"binnen\"` en `\"bestPractice\"` tellen niet", () => {
  assert.deepEqual(analyseerBestand(PAD, scan(`{ "binnen": "main", "bestPractice": true }`)), { sleutels: [], problemen: [] });
});

const ALIASSEN: { naam: string; tekst: string }[] = [
  { naam: "alias `const s = scanAxe; s(…)`", tekst: `const s = scanAxe;\nawait s(page, { uitgezet: [{ regel: "image-alt", reden: "x" }] });\n` },
  { naam: "string-index `h[\"scanAxe\"](…)`", tekst: `await h["scanAxe"](page, { uitgezet: [{ regel: "image-alt", reden: "x" }] });\n` },
  { naam: "string-index met template `h[`scanAxe`](…)`", tekst: "await h[`scanAxe`](page, opties);\n" },
  { naam: "alias van `h.scanAxe`", tekst: `const s = h.scanAxe;\n` },
  { naam: "scanAxe als argument", tekst: `await herhaal(scanAxe, page);\n` },
  { naam: "scanAxe in een object (shorthand)", tekst: `const helpers = { scanAxe };\n` },
  { naam: "scanAxe in een object (waarde)", tekst: `const helpers = { scan: scanAxe };\n` },
  {
    naam: "alias van een hernoemde import",
    tekst: `import { scanAxe as scan } from "./helpers/scanAxe";\nconst s = scan;\n`,
  },
];

for (const g of ALIASSEN) {
  test(`regressie (b): ${g.naam} geeft de alias-melding`, () => {
    const r = analyseerBestand(PAD, g.tekst);
    assert.ok(
      r.problemen.some((p) => /^e2e\/voorbeeld\.spec\.ts:\d+: /.test(p) && p.includes(ALIAS)),
      `geen alias-melding: ${JSON.stringify(r.problemen)}`,
    );
  });
}

test("regressie (b): de alias-melding draagt pad en regelnummer", () => {
  const r = analyseerBestand(PAD, `// regel 1\nconst s = scanAxe;\n`);
  assert.deepEqual(r.problemen, [`${PAD}:2: ${ALIAS}, zodat check:axe uitzonderingen kan tellen`]);
});

test("regressie (b): directe aanroep, import, hernoemde import en `x.scanAxe(…)` geven geen alias-melding", () => {
  const tekst =
    `import { scanAxe } from "./helpers/scanAxe";\n` +
    `import { scanAxe as scan } from "./helpers/scanAxe";\n` +
    `await scanAxe(page);\n` +
    `await scan(page);\n` +
    `await helpers.scanAxe(page);\n`;
  assert.deepEqual(analyseerBestand(PAD, tekst), { sleutels: [], problemen: [] });
});

test("regressie (b): een alias in een run faalt ook via draai()", () => {
  const dir = boom({ [PAD]: `const s = scanAxe;\n` }, []);
  const problemen = draai(dir);
  assert.equal(problemen.length, 1);
  assert.ok(problemen[0]?.includes(ALIAS));
});
