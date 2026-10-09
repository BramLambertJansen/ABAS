import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

/**
 * scanAxe-lintregel (docs/features/scan-axe.md → Tests): axe komt alleen binnen
 * via e2e/helpers/scanAxe.ts. Statische imports van `@axe-core/playwright` en
 * `axe-core` (ook subpaden) vallen onder `no-restricted-imports`; `import()` en
 * `require()` onder `no-restricted-syntax` in e2e/test/integration/scripts.
 *
 * Eén ESLint-instantie met de projectconfig, `lintText` met een fictief
 * `filePath`; de fragmenten bestaan niet op schijf.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Begin van AXE_MELDING in eslint.config.mjs.
const AXE_MELDING = "Scan toegankelijkheid alleen met scanAxe(page) uit e2e/helpers/scanAxe.ts";
const E2E = "e2e/__axe-lint-fixture.spec.ts";
const TEST = "test/__axe-lint-fixture.test.ts";
const SCRIPTS = "scripts/__axe-lint-fixture.mjs";
const SRC = "src/lib/__axe-lint-fixture.ts";
const HELPER = "e2e/helpers/scanAxe.ts";

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: {
    files: [SRC],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: [SRC] },
        tsconfigRootDir: ROOT,
      },
    },
  },
});

async function axeMeldingen(code: string, pad: string) {
  const [resultaat] = await eslint.lintText(code, { filePath: join(ROOT, pad) });
  assert.ok(resultaat, "ESLint gaf geen resultaat");
  assert.deepEqual(
    resultaat.messages.filter((m) => m.fatal),
    [],
    `het fragment moet parsen (${pad})`,
  );
  return resultaat.messages.filter((m) => m.message.includes(AXE_MELDING));
}

type Geval = { naam: string; code: string; pad: string; regel: string };

const DEFAULT_IMPORT = `import AxeBuilder from "@axe-core/playwright";\nexport const x = AxeBuilder;\n`;

const NEGATIEF: Geval[] = [
  { naam: "default-import", pad: E2E, regel: "no-restricted-imports", code: DEFAULT_IMPORT },
  {
    naam: "named import { AxeBuilder }",
    pad: E2E,
    regel: "no-restricted-imports",
    code: `import { AxeBuilder } from "@axe-core/playwright";\nexport const x = AxeBuilder;\n`,
  },
  {
    naam: "hernoemde import",
    pad: E2E,
    regel: "no-restricted-imports",
    code: `import { AxeBuilder as Bouwer } from "@axe-core/playwright";\nexport const x = Bouwer;\n`,
  },
  {
    naam: "import axe from axe-core",
    pad: E2E,
    regel: "no-restricted-imports",
    code: `import axe from "axe-core";\nexport const x = axe;\n`,
  },
  {
    naam: "subpad van axe-core",
    pad: E2E,
    regel: "no-restricted-imports",
    code: `import axe from "axe-core/axe.min.js";\nexport const x = axe;\n`,
  },
  {
    naam: "subpad van @axe-core/playwright",
    pad: E2E,
    regel: "no-restricted-imports",
    code: `import x from "@axe-core/playwright/dist/index.js";\nexport const y = x;\n`,
  },
  {
    naam: "import(\"@axe-core/playwright\")",
    pad: E2E,
    regel: "no-restricted-syntax",
    code: `export const m = import("@axe-core/playwright");\n`,
  },
  {
    naam: "import(\"axe-core\")",
    pad: E2E,
    regel: "no-restricted-syntax",
    code: `export const m = import("axe-core");\n`,
  },
  {
    naam: "require(\"@axe-core/playwright\")",
    pad: E2E,
    regel: "no-restricted-syntax",
    code: `// eslint-disable-next-line @typescript-eslint/no-require-imports\nexport const m = require("@axe-core/playwright");\n`,
  },
  { naam: "default-import in test/", pad: TEST, regel: "no-restricted-imports", code: DEFAULT_IMPORT },
  {
    naam: "import() in test/",
    pad: TEST,
    regel: "no-restricted-syntax",
    code: `export const m = import("@axe-core/playwright");\n`,
  },
  {
    naam: "require() in scripts/",
    pad: SCRIPTS,
    regel: "no-restricted-syntax",
    code: `export const m = require("axe-core");\n`,
  },
  { naam: "statische import in src/", pad: SRC, regel: "no-restricted-imports", code: DEFAULT_IMPORT },
];

for (const g of NEGATIEF) {
  test(`scanAxe-lint: ${g.naam} (${g.pad}) faalt met AXE_MELDING`, async () => {
    const meldingen = await axeMeldingen(g.code, g.pad);
    assert.ok(
      meldingen.some((m) => m.ruleId === g.regel),
      `verwacht een ${g.regel}-melding met "${AXE_MELDING}", kreeg: ${JSON.stringify(meldingen.map((m) => [m.ruleId, m.message]))}`,
    );
  });
}

test("scanAxe-lint: e2e/helpers/scanAxe.ts mag @axe-core/playwright importeren", async () => {
  const meldingen = await axeMeldingen(DEFAULT_IMPORT, HELPER);
  assert.deepEqual(meldingen, [], "de helper is de enige toegestane ingang");
});

test("scanAxe-lint: een import van de helper in e2e/ geeft geen melding", async () => {
  const code = `import { scanAxe } from "./helpers/scanAxe";\nexport const x = scanAxe;\n`;
  assert.deepEqual(await axeMeldingen(code, E2E), []);
});
