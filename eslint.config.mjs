import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
import betterTailwind from "eslint-plugin-better-tailwindcss";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Bestaande overtredingen staan in eslint-suppressions.json (ESLint
// bulk-suppressies, ADR 0025): een teller per bestand en regel die alleen mag
// dalen. Meer overtredingen dan onderdrukt → lint faalt; minder → lint faalt
// ook, tot `npm run lint:prune` de daling vastlegt. Nieuwe code is dus vanaf
// de eerste dag aan elke regel gebonden. Meldingen noemen de oplossing: lint is
// ook de reparatie-instructie voor een agent.
const ARBITRARY = "Geen arbitrary Tailwind-waarde: kies een token uit @theme in src/app/globals.css (zie src/components/README.md). Ontbreekt het token, vraag het aan Bram.";

// Knop is een variantcomponent (docs/features/knop.md): className is alleen voor
// layout. Kleur, rand, vorm, hoogte, tekst en toestanden komen uit variant/tone/maat.
const KNOP_VERBODEN =
  "(?:^|\\s)(?:[a-z0-9-]+:)*(?:bg-|text-|border|rounded|shadow|font-|h-|min-h-|max-h-|p-|px-|py-|pt-|pb-|pl-|pr-|ring|outline|hover:|active:|disabled:|aria-|focus)";
const KNOP_ELEMENT = "/^(Knop|OverlaySluitKnop)$/";
const KNOP_MELDING =
  "className op Knop is alleen voor layout (flex-1, w-full, marges): gebruik variant, tone en maat voor kleur, rand, vorm, hoogte en tekst (docs/features/knop.md).";
const KNOP_CLASSNAME_REGELS = [
  {
    selector: `JSXOpeningElement[name.name=${KNOP_ELEMENT}] > JSXAttribute[name.name='className'] Literal[value=/${KNOP_VERBODEN}/]`,
    message: KNOP_MELDING,
  },
  {
    selector: `JSXOpeningElement[name.name=${KNOP_ELEMENT}] > JSXAttribute[name.name='className'] TemplateElement[value.raw=/${KNOP_VERBODEN}/]`,
    message: KNOP_MELDING,
  },
];

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/.temp/**",
      "designs/**",
      "docs/**",
      "next-env.d.ts",
      "public/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // `eslint-config-next` (above) already wires in a handful of jsx-a11y
  // rules as warnings. `plugin:jsx-a11y/recommended` replaces that subset
  // with the full recommended ruleset, and lint fails on warnings — so this
  // is the "script, not review duty" gate CLAUDE.md calls for.
  ...compat.extends("plugin:jsx-a11y/recommended"),

  // Typed linting voor productiecode. typescript-eslint is exact gepind: de
  // strict-configs zijn niet semver-stabiel.
  ...tseslint.configs.strictTypeChecked.map((c) => ({ ...c, files: ["src/**/*.{ts,tsx}"] })),
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // Getallen en booleans in een template literal zijn in UI-tekst normaal.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
    },
  },

  // Tailwind: alleen bekende klassen, geen arbitrary values, geen `!`.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: {
      // Tailwind v4: de tokens staan in het @theme-blok van de CSS-entry.
      "better-tailwindcss": { entryPoint: "src/app/globals.css" },
    },
    rules: {
      "better-tailwindcss/no-unknown-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            { pattern: "\\[[^\\]]+\\]", message: ARBITRARY },
            { pattern: "^!|!$", message: "Geen `!important` in klassen: los de specificiteit op in het component." },
          ],
        },
      ],
    },
  },

  // Features en shells bouwen met componenten uit src/components.
  {
    files: ["src/features/**/*.tsx", "src/shells/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: "Geen rauwe <button> in features/shells: gebruik een knop uit src/components (zie node scripts/kit/catalogus.mjs).",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message: "Geen rauwe <input> in features/shells: gebruik TekstVeld, ZoekVeld of CodeInvoer uit src/components.",
        },
        {
          selector: "Literal[value=/laden…$/]",
          message: "Losse laadtekst: gebruik het gedeelde laad-/leeg-/foutpatroon (LeesFout, VerversStatus) en tekst uit één plek.",
        },
        ...KNOP_CLASSNAME_REGELS,
      ],
    },
  },
];

export default eslintConfig;
