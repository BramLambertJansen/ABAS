import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

/**
 * Tokenschaal (docs/features/tokenschaal.md → Tests): het @theme in
 * src/app/globals.css begint met `--*: initial`. Deze test bewijst dat de
 * reset werkt: een niet-gedeclareerde standaardklasse is een onbekende klasse
 * voor `better-tailwindcss/no-unknown-classes`, en de gedeclareerde tokens
 * blijven bekend (controle dat de test niet altijd faalt).
 *
 * Eén ESLint-instantie met de projectconfig; het fragment krijgt een
 * bestandsnaam onder src/ zodat de Tailwind-regels gelden.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGEL = "better-tailwindcss/no-unknown-classes";
// Het fragment bestaat niet op schijf, dus de typed-linting-projectservice
// kent het niet. allowDefaultProject laat het alleen voor deze test toe,
// zonder de projectconfig of tsconfig aan te passen.
const FIXTURE = "src/components/__tokenschaal-reset-fixture.tsx";

const ONBEKEND = ["bg-red-500", "rounded-3xl", "shadow-2xl", "rounded-xl"];
const BEKEND = [
  "h-control",
  "h-control-lg",
  "rounded-sm",
  "rounded-panel",
  "rounded-sheet",
  "bg-surface",
  "bg-surface-rail",
];

async function onbekendeKlassen(): Promise<Set<string>> {
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
  const klassen = [...ONBEKEND, ...BEKEND];
  const code = [
    "export function Fragment() {",
    "  return (",
    "    <div>",
    ...klassen.map((k) => `      <span className="${k}" />`),
    "    </div>",
    "  );",
    "}",
    "",
  ].join("\n");
  const [resultaat] = await eslint.lintText(code, {
    filePath: join(ROOT, FIXTURE),
  });
  assert.ok(resultaat, "ESLint gaf geen resultaat");
  const fataal = resultaat.messages.filter((m) => m.fatal);
  assert.deepEqual(fataal, [], "het fragment moet parsen");

  const gemeld = new Set<string>();
  for (const m of resultaat.messages) {
    if (m.ruleId !== REGEL) continue;
    // Regel van de melding → klasse op die regel (één klasse per regel).
    const k = klassen[m.line - 4];
    assert.ok(k, `melding op onverwachte regel ${String(m.line)}: ${m.message}`);
    gemeld.add(k);
  }
  return gemeld;
}

test("tokenschaal-reset: standaardklassen buiten @theme zijn onbekend, tokens bekend", async () => {
  const gemeld = await onbekendeKlassen();
  for (const k of ONBEKEND) {
    assert.ok(gemeld.has(k), `${k} moet een ${REGEL}-melding geven (reset --*: initial)`);
  }
  for (const k of BEKEND) {
    assert.ok(!gemeld.has(k), `${k} is een token uit @theme en mag geen ${REGEL}-melding geven`);
  }
});
