import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

/**
 * Knop-lintregel (docs/features/knop.md → Lintregel en Tests): `className` op
 * `Knop` en `OverlaySluitKnop` is alleen voor layout. De regel zit in
 * `no-restricted-syntax` voor src/features en src/shells; de fixture staat
 * daarom onder src/features/.
 *
 * Eén ESLint-instantie met de projectconfig (zoals tokenschaalReset.test.ts);
 * het fragment bestaat niet op schijf. Elke case staat op een eigen regel, zodat
 * een melding aan precies één case te koppelen is.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGEL = "no-restricted-syntax";
const KNOP_MELDING = "className op Knop is alleen voor layout";
const FIXTURE = "src/features/__knop-lint-fixture.tsx";

type Geval = { naam: string; jsx: string };

const NEGATIEF: Geval[] = [
  { naam: "bg-accent", jsx: `<Knop className="bg-accent">x</Knop>` },
  { naam: "h-control", jsx: `<Knop className="h-control">x</Knop>` },
  { naam: "rounded-card", jsx: `<Knop className="rounded-card">x</Knop>` },
  { naam: "text-sm", jsx: `<Knop className="text-sm">x</Knop>` },
  { naam: "hover:border-ink", jsx: `<Knop className="hover:border-ink">x</Knop>` },
  { naam: "px-4", jsx: `<Knop className="px-4">x</Knop>` },
  { naam: "md:px-4", jsx: `<Knop className="md:px-4">x</Knop>` },
  { naam: "ternary met shadow-lg", jsx: `<Knop className={x ? "shadow-lg" : "flex-1"}>x</Knop>` },
  { naam: "template-literal met border", jsx: "<Knop className={`flex-1 border ${x}`}>x</Knop>" },
  { naam: "OverlaySluitKnop bg-surface", jsx: `<OverlaySluitKnop className="bg-surface" />` },
  // PR 2: Chip, Segment, SegmentBalk en Toets vallen onder dezelfde regel.
  { naam: "Chip bg-accent", jsx: `<Chip className="bg-accent">x</Chip>` },
  { naam: "Segment h-control", jsx: `<Segment className="h-control">x</Segment>` },
  { naam: "SegmentBalk p-1", jsx: `<SegmentBalk className="p-1">x</SegmentBalk>` },
  { naam: "Toets text-lg", jsx: `<Toets className="text-lg" aria-label="x" soort="keypad" />` },
];

const POSITIEF: Geval[] = [
  "flex-1",
  "w-full",
  "self-end",
  "mt-2",
  "col-span-2",
  "hidden",
  "md:flex",
  "-mt-1",
  "gap-2",
  "max-w-full",
  "whitespace-nowrap",
].map((k) => ({ naam: k, jsx: `<Knop className="${k}">x</Knop>` }));

const PR2_ELEMENTEN = ["Chip", "Segment", "SegmentBalk", "Toets"];
for (const el of PR2_ELEMENTEN) {
  for (const k of ["flex-1", "w-full"]) {
    POSITIEF.push({ naam: `${el} ${k}`, jsx: `<${el} className="${k}">x</${el}>` });
  }
}

const ANDERE: Geval[] = [{ naam: "Anders bg-accent", jsx: `<Anders className="bg-accent">x</Anders>` }];

const ALLES = [...NEGATIEF, ...POSITIEF, ...ANDERE];
const EERSTE_REGEL = 4; // regel van ALLES[0] in de fixture

async function knopMeldingen(): Promise<Map<number, string[]>> {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfig: {
      files: [FIXTURE],
      languageOptions: {
        parserOptions: {
          projectService: { allowDefaultProject: [FIXTURE] },
          tsconfigRootDir: ROOT,
        },
      },
    },
  });
  const code = [
    "export function Fragment({ x }: { x: boolean }) {",
    "  return (",
    "    <div>",
    ...ALLES.map((g) => `      ${g.jsx}`),
    "    </div>",
    "  );",
    "}",
    "",
  ].join("\n");
  const [resultaat] = await eslint.lintText(code, { filePath: join(ROOT, FIXTURE) });
  assert.ok(resultaat, "ESLint gaf geen resultaat");
  assert.deepEqual(
    resultaat.messages.filter((m) => m.fatal),
    [],
    "het fragment moet parsen",
  );

  const perIndex = new Map<number, string[]>();
  for (const m of resultaat.messages) {
    if (m.ruleId !== REGEL || !m.message.includes(KNOP_MELDING)) continue;
    const i = m.line - EERSTE_REGEL;
    assert.ok(ALLES[i], `Knop-melding op onverwachte regel ${String(m.line)}: ${m.message}`);
    perIndex.set(i, [...(perIndex.get(i) ?? []), m.message]);
  }
  return perIndex;
}

const gemeld = await knopMeldingen();
const aantal = (g: Geval) => gemeld.get(ALLES.indexOf(g))?.length ?? 0;

test("Knop-lint: verboden klassen op Knop/OverlaySluitKnop geven een no-restricted-syntax-melding", () => {
  const zonderMelding = NEGATIEF.filter((g) => aantal(g) < 1).map((g) => g.naam);
  assert.deepEqual(zonderMelding, [], `deze cases missen een ${REGEL}-melding met "${KNOP_MELDING}"`);
});

test("Knop-lint: layoutklassen op Knop geven geen Knop-melding", () => {
  for (const g of POSITIEF) {
    assert.equal(aantal(g), 0, `${g.naam} is layout en mag geen Knop-melding geven`);
  }
});

test("Knop-lint: een andere component krijgt geen Knop-melding", () => {
  for (const g of ANDERE) {
    assert.equal(aantal(g), 0, `${g.naam} hoort niet onder de Knop-regel`);
  }
});
