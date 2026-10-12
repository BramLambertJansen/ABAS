# scanAxe: één ingang voor de axe-scan (WCAG 2.2 AA)

Status: **gebouwd**

Gebouwd in #206 (2026-10-09). 68 scans gaan via `scanAxe`, 0 overtredingen
met de strenge set, één uitzondering in de beginstand. Afwijkend van of
aanvullend op het ontwerp hieronder:

- `check:axe` telt ook geciteerde sleutels (`"uitgezet": [...]`) en weigert
  een alias (`const s = scanAxe`) en een string-index (`h["scanAxe"]`):
  `scanAxe` mag alleen direct aangeroepen worden. `typeof scanAxe` mag wel.
- `check:axe` scant onder `e2e/` alle `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`,
  `.cjs`, `.mts` en `.cts`-bestanden.
- `axe-core` staat als expliciete devDependency in `package.json`
  (`^4.13.0`), naast `@axe-core/playwright`.

Roadmap fase 3, stap 5 (`docs/ROADMAP-rails.md`): "`scanAxe(page)` met
`wcag22aa` als enige ingang (lintverbod op losse `AxeBuilder`)". ADR 0025
heeft hiervoor geen eigen R-nummer. De stap valt onder Besluit 7 (UI-lint) en
onder de werkwijze van ADR 0025: een regel die nu in elke spec opnieuw wordt
gekozen, wordt één keer vastgelegd en door lint bewaakt. Het generieke deel
volgt R9 (raamwerk vendoren).

## Doel

Elke axe-scan in de repo draait dezelfde WCAG-set en faalt met een leesbare
melding. Wie een scherm scant, kiest geen tags meer.

Nu kiest elke spec zelf. 62 van de 68 scans draaien alleen `wcag2a` +
`wcag2aa` (WCAG 2.0). Daardoor worden `target-size` (2.2 AA) en de
2.1-regels nergens gescand, behalve op `/design/systeem` en in één
frontend-reviewtest. De `check:a11y`-gate belooft "WCAG-AA", maar welk AA dat
is, hangt af van de spec.

Na deze stap:

- `scanAxe(page)` in `e2e/helpers/scanAxe.ts` is de enige plek die
  `@axe-core/playwright` importeert;
- de tagset is vast: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`;
- lint verbiedt elke andere import van `@axe-core/playwright` of `axe-core`;
- best-practice kan erbij (`bestPractice: true`), de WCAG-set kan nooit
  kleiner;
- regels uitzetten of gebieden overslaan mag alleen met een reden, en een
  nieuwe gate `check:axe` telt die uitzonderingen tegen `.kit/baseline.json`.

Let op de betekenis van "`wcag22aa`". axe-tags tellen niet op: de tag
`wcag22aa` alleen selecteert in axe-core 4.13 precies één regel
(`target-size`). "WCAG 2.2 AA" betekent dus de vijf tags samen. Zo staat het
nu al in `AXE_TAGS` in `e2e/systeem.spec.ts`.

## Betrokken shell(s)

Geen shell-code. Het gaat om testtooling in `e2e/`, `test/` en
`eslint.config.mjs`, plus een nieuwe gate in `scripts/kit/`. Indirect raakt
het beide shells: de strengere tagset kan op bestaande schermen nieuwe
violations vinden. Welke dat zijn, staat straks in "Meting"; de reparaties
liggen pas vast na Brams besluit daarover.

## Datamodel

n.v.t.: geen data.

## RPC's

n.v.t.: geen RPC en geen geld.

## Rolzichtbaarheid

n.v.t.: verandert niets aan wie wat ziet.

## Hergebruik & UX-patronen

### Inventaris (2026-10-08, `main` op `84e5b4e`)

**Aanroepen.** 68 keer `new AxeBuilder` in 19 bestanden, allemaal in `e2e/`:

| Bestand | Scans |
|---|---|
| `e2e/a11y.spec.ts` | 44 |
| `e2e/productafbeeldingen.spec.ts` | 5 |
| `e2e/systeem.spec.ts` | 2 |
| `e2e/opslaan-sluiten-pending.spec.ts` | 2 |
| 15 andere specs | 1 per bestand |

De 15 andere specs: `bar-inloggen-niet-toegestaan`, `beheer-tweede-factor`,
`beheerformulieren-catalogus`, `bestelling-terugdraaien`, `bezetting-beheren`,
`contrast-controls-bar`, `dialogen-tabs-landmarks`, `dienst-hervatten`,
`frontend-review`, `invoerfeedback-zoeken-filters`, `leesfouten-herstel`,
`logboek-chronologisch`, `login-rate-limit`, `portal-profiel` en
`portaltransacties-consistent`.

Buiten `e2e/` staat nog één gebruik:
`docs/audits/2026-10-06-componenten-tokens/tools/screen-audit.cjs`. Dat is
een bevroren audit-artefact; ESLint negeert `docs/**`.

**Tags en regels per aanroep:**

| Configuratie | Aantal | Waar |
|---|---|---|
| `withTags(["wcag2a", "wcag2aa"])` | 62 | alle overige |
| volledige set 2a/2aa/21a/21aa/22aa | 3 | `systeem.spec.ts` (2×, via `AXE_TAGS`), `frontend-review.spec.ts:295` (letterlijk) |
| `wcag2a`/`wcag2aa` + `best-practice`, `disableRules(["color-contrast"])` | 1 | `dialogen-tabs-landmarks.spec.ts:100`. De reden in het commentaar: contrast meet `a11y.spec.ts` al. |
| `withTags([...])` gevolgd door `withRules(["landmark-one-main", "region"])` | 1 | `a11y.spec.ts:1434` (#125). `withRules` overschrijft `runOnly`, dus deze scan draait alleen die twee best-practice-regels en geen enkele WCAG-regel. |
| `include('[aria-label="Eerdere geldacties"]')`, zonder tags | 1 | `opslaan-sluiten-pending.spec.ts:61`. Zonder `runOnly` draait axe al zijn niet-experimentele regels, dus ook best-practice, maar alleen binnen dat gebied. |

Geen enkele aanroep gebruikt `exclude`.

**Asserties.** Elke scan eist `violations` gelijk aan `[]`, op twee manieren:

- 60 keer met `JSON.stringify(violations, null, 2)` als melding: lang en
  ongestructureerd;
- 8 keer zonder melding: `productafbeeldingen` (5×), `opslaan-sluiten-pending`
  (2×) en `frontend-review` (1×). Faalt zo'n scan, dan toont Playwright alleen
  een diff van objecten.

Geen enkele spec filtert violations of kijkt naar `incomplete`.

**Relatie met de gate.** `check:a11y` is `playwright test`: de hele e2e-suite,
niet alleen `a11y.spec.ts`. Twee beschrijvingen lopen daardoor achter:

- de gatebeschrijving in `scripts/kit/gates.mjs` ("WCAG-AA via axe-core op
  elk shell-entrypoint");
- de WCAG-alinea in `docs/ARCHITECTURE.md` (`wcag2a` + `wcag2aa`, alleen
  `a11y.spec.ts`).

**Lint.** `e2e/` valt onder `eslint .` met de basisconfig, zonder typed
linting. `eslint-suppressions.json` heeft geen enkele regel voor `e2e/`.
`no-restricted-imports` staat nog nergens in `eslint.config.mjs`.


### Besluiten (Bram, 2026-10-08)

1. **Eerst meten.** Vóór de bouw draait de hoofdsessie de suite met de
   volledige 2.2-AA-set en vult de sectie "Meting" hieronder. Daarna beslist
   Bram of de reparaties in `src/` in dezelfde PR gaan. Tot die meting ligt
   de scope van de reparaties niet vast.
2. **Best-practice is een optie die alleen uitbreidt:**
   `scanAxe(page, { bestPractice: true })`. De WCAG-set kan nooit kleiner
   worden.
3. **Regels uitzetten en `exclude` mogen alleen met een verplichte reden.**
   Het aantal staat in `.kit/baseline.json` (ratchet, mag alleen dalen). De
   beginstand is het ene huidige geval: `color-contrast` in de dialoogtest.
4. **Scope (`binnen`) mag.**
5. **Eén PR** met helper, migratie, lintregel en de telling, met het label
   `gate-wijziging`.
6. **Het audit-script** in `docs/audits/` blijft staan als bevroren bewijs.

### Ontwerp

**De helper.** Nieuw bestand `e2e/helpers/scanAxe.ts`. De eerste regel is
`// kit: generiek`.

```ts
// kit: generiek
import type { Page } from "@playwright/test";

/** WCAG 2.2 AA: axe-tags tellen niet op, dus alle vijf. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

export type ScanAxeOpties = {
  /** Beperk de scan tot dit gebied (CSS-selector). */
  binnen?: string;
  /** Voegt de tag `best-practice` toe. Kan alleen uitbreiden. */
  bestPractice?: boolean;
  /** Regel niet uitvoeren. Telt mee in .kit/baseline.json → axe-uitzondering. */
  uitgezet?: readonly { regel: string; reden: string }[];
  /** Gebied niet scannen (exclude). Telt mee in .kit/baseline.json → axe-uitzondering. */
  overslaan?: readonly { selector: string; reden: string }[];
};

export async function scanAxe(page: Page, opties?: ScanAxeOpties): Promise<void>;
```

- **Tagset.** Altijd `WCAG_TAGS`. Met `bestPractice: true` wordt het
  `[...WCAG_TAGS, "best-practice"]`. Er is geen parameter die tags of
  regels kiest (`withRules`), dus de WCAG-set kan niet kleiner worden.
  `WCAG_TAGS` wordt geëxporteerd voor de meta-test. Hij vervangt `AXE_TAGS` in
  `e2e/systeem.spec.ts`.
- **Uitvoering.** De scan draait in `test.step("axe: WCAG 2.2 AA", …)`. Met
  best-practice heet de stap `axe: WCAG 2.2 AA + best-practice`. Zo laat het
  rapport zien welke scan faalde als een test er meerdere doet.
- **Resultaat.** De functie geeft niets terug. Een geslaagde scan is stil, een
  mislukte faalt via `expect`. Wie geen resultaten krijgt, kan er ook niet
  omheen filteren.
- **Foutmelding.** De assertie is
  `expect(violations.map((v) => v.id), melding).toEqual([])`. De diff toont
  dan de regel-ids, en `melding` is leesbare tekst, per violation:

  ```
  axe (WCAG 2.2 AA): 2 regels geschonden op <page.url()>

  image-alt [critical] — Images must have alternative text
    https://dequeuniversity.com/rules/axe/4.13/image-alt
    • main > img:nth-child(2)
      Fix any of the following: Element does not have an alt attribute …
  target-size [serious] — All touch targets must be 24px large, or leave sufficient space
    https://dequeuniversity.com/rules/axe/4.13/target-size
    • .rij > button
      …
    (+3 meer)
  ```

  Per regel komen er hoogstens 5 elementen in de melding, daarna `(+N meer)`.
  Per element staan `target` (samengevoegd met ` > ` voor iframes/shadow) en
  `failureSummary`. De Engelse teksten komen ongewijzigd uit axe. De kop en de
  structuur zijn Nederlands, zoals in `e2e/systeem.spec.ts`. Zijn er
  uitzonderingen, dan volgt onder de kop een regel per uitzondering:
  `uitgezet: color-contrast — <reden>` of `overslaan: <selector> — <reden>`.
- **Scope.** `binnen` wordt `.include(binnen)`. De tagset blijft gelijk; alleen
  het gebied wordt kleiner. `binnen` telt niet als uitzondering: een scan van
  één gebied kiest bewust wat hij bekijkt. Wat erbinnen valt, wordt volledig
  gescand.
- **Uitzonderingen.**
  - `uitgezet` wordt `.disableRules([...])`, `overslaan` wordt
    `.exclude(selector)` per item.
  - Een lege of alleen-witruimte `reden`, een lege `regel` of `selector`, of
    een `regel` die axe niet kent, is een runtime-fout van de helper:
    `scanAxe: uitzondering zonder reden (<regel|selector>)` of
    `scanAxe: onbekende axe-regel "<regel>"`. Die fout valt vóór de scan.
  - De helper zet elke uitzondering ook als annotatie op de test
    (`test.info().annotations`, type `axe-uitzondering`), zodat het rapport
    hem toont.

**De telling (ratchet).** De reden staat bij de aanroep; het aantal staat in
`.kit/baseline.json` → `axe-uitzondering`. Een nieuwe gate `check:axe`
(`scripts/kit/axe.mjs`, `// kit: generiek`) telt statisch en gebruikt
`ratchet()` uit `scripts/kit/ratchet.mjs`, net als `check:rls` en
`check:catalogus`.

- **Wat hij leest:** elk `*.ts`-bestand onder `e2e/`, behalve
  `e2e/helpers/scanAxe.ts` en de meta-test `e2e/scan-axe.spec.ts`. Hij parset met de TypeScript-compiler-API
  (`typescript` staat al in de devDependencies), dus niet met een regex.
- **Wat hij zoekt:** elke aanroep `scanAxe(…)`. Is er een tweede argument,
  dan moet dat een object-literal zijn. Voor `uitgezet` en `overslaan` geldt:
  - de waarde is een array-literal;
  - elk element is een object-literal;
  - `regel` of `selector` is een string-literal en `reden` een niet-lege
    string-literal.

  Een variabele, spread of berekende waarde faalt, zodat de gate niets mist:
  `<pad>:<regel>: scanAxe-opties moeten letterlijk zijn (object, array en strings), zodat check:axe uitzonderingen kan tellen`.
- **Sleutels.** Per uitzondering één stabiele sleutel:
  - `<pad> uitgezet:<regel>`;
  - `<pad> overslaan:<selector>`.

  Komt dezelfde sleutel in één bestand vaker voor, dan krijgt de tweede
  ` #2`, de derde ` #3`, enzovoort. Zo telt ook een herhaling. Regelnummers
  zitten bewust niet in de sleutel: die verschuiven bij elke wijziging.
- **Meldingen**, de standaardvormen van `ratchet()` met deze uitleg:
  - nieuw: `<sleutel>: nieuwe axe-uitzondering — los de violation op in src/ in plaats van de regel uit te zetten; alleen Bram kan hem toevoegen aan .kit/baseline.json → axe-uitzondering (label gate-wijziging)`;
  - opgelost: `<sleutel>: staat in .kit/baseline.json → axe-uitzondering maar is opgelost — draai `npm run ratchet:update` en commit de daling`.
- **Beginstand** van `.kit/baseline.json`:
  ```json
  "axe-uitzondering": ["e2e/dialogen-tabs-landmarks.spec.ts uitgezet:color-contrast"]
  ```
- **Aansluiting:**
  - `check:axe` komt in `check:fast` (het telt statisch, zonder browser);
  - de gate komt in het register `scripts/kit/gates.mjs` met de beschrijving
    "axe-uitzonderingen (`uitgezet`/`overslaan` in `scanAxe`) letterlijk, met
    reden, en niet meer dan `.kit/baseline.json` → axe-uitzondering";
  - `ratchet:update` krijgt `RATCHET_UPDATE=1 npm run check:axe` erbij.

Een gate en geen lintregel, want lint kan niet tellen tegen een baseline.
`eslint-suppressions.json` zou het aantal wel bijhouden, maar dan per regel en
bestand, zonder de naam van de uitgezette axe-regel. Een tweede uitgezette
regel in hetzelfde bestand zou zo onzichtbaar blijven.

**De lintregel.** Nieuw blok in `eslint.config.mjs`, na de bestaande blokken:

```js
const AXE_MELDING =
  "Scan toegankelijkheid alleen met scanAxe(page) uit e2e/helpers/scanAxe.ts: vaste WCAG 2.2 AA-tagset en een leesbare foutmelding (docs/features/scan-axe.md). Geen losse AxeBuilder of axe-core.";

{
  files: ["**/*.{ts,tsx,js,mjs,cjs}"],
  ignores: ["e2e/helpers/scanAxe.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        { name: "@axe-core/playwright", message: AXE_MELDING },
        { name: "axe-core", message: AXE_MELDING },
      ],
      patterns: [{ group: ["@axe-core/*", "axe-core/*"], message: AXE_MELDING }],
    }],
  },
},
{
  // no-restricted-imports ziet import() en require() niet.
  files: ["e2e/**", "test/**", "integration/**", "scripts/**"],
  ignores: ["e2e/helpers/scanAxe.ts"],
  rules: {
    "no-restricted-syntax": ["error",
      { selector: "ImportExpression[source.value=/^(@axe-core\\/|axe-core)/]", message: AXE_MELDING },
      { selector: "CallExpression[callee.name='require'][arguments.0.value=/^(@axe-core\\/|axe-core)/]", message: AXE_MELDING },
    ],
  },
},
```

Waarom zo:

- Het tweede blok mist bewust `src/**`. Daar staat al een
  `no-restricted-syntax`-blok voor `src/features` en `src/shells`, en in flat
  config vervangt een later blok de opties van die regel. Productiecode laadt
  Playwright of axe niet; het eerste blok dekt statische imports in `src`
  wel.
- Het verbod zit op de import en niet op de identifier `AxeBuilder`. Zonder
  import bestaat de klasse niet. Een hernoemde import
  (`import X from "@axe-core/playwright"`) wordt ook gevangen.
- `scripts/kit/axe.mjs` importeert `typescript`, niet `axe-core`. Het tweede
  blok raakt het dus niet.

**Migratie.** Alle 68 aanroepen worden `await scanAxe(page)` (of
`scanAxe(tom)` of `scanAxe(femke)` waar de spec een eigen `Page` heeft), samen
met de bijbehorende `expect(…violations…)`:

| Huidige aanroep | Wordt |
|---|---|
| 62× `wcag2a`/`wcag2aa`, 3× volledige set | `scanAxe(page)` |
| `dialogen-tabs-landmarks.spec.ts:100` (`axeScan`) | `scanAxe(page, { bestPractice: true, uitgezet: [{ regel: "color-contrast", reden: "contrast meet e2e/a11y.spec.ts al op dezelfde schermen" }] })` |
| `a11y.spec.ts:1434` (#125, `withRules`) | `scanAxe(page, { bestPractice: true })`. Dit is breder dan nu: de volledige WCAG-set plus alle best-practice-regels in plaats van twee regels. |
| `opslaan-sluiten-pending.spec.ts:61` (`include`, zonder tags) | `scanAxe(page, { binnen: '[aria-label="Eerdere geldacties"]', bestPractice: true })`. Zo blijft de best-practice-dekking binnen dat gebied. |

Verder:

- `AXE_TAGS` in `e2e/systeem.spec.ts` vervalt;
- de lokale wrappers `axeScan()` (dialoogtest) en `scan()`
  (`a11y.spec.ts:1433`) blijven bestaan of verdwijnen naar keuze van de
  Tester, zolang de opties letterlijk in de `scanAxe`-aanroep staan;
- testtitels die de tagset noemen (`has no WCAG2A/AA violations`) worden
  `has no WCAG 2.2 AA violations`.

Screenshot-baselines raakt de migratie niet: de namen staan expliciet in
`toHaveScreenshot`.

### Meting

**Werkwijze.** In alle 64 `.withTags([...])`-aanroepen in `e2e/` die nog niet
de volledige set hadden, stonden de tags tijdelijk op `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa`, `wcag22aa` (`best-practice` bleef waar het stond;
`color-contrast` bleef in de dialoogtest uitgezet). Gemeten in twee rondes:

- lokaal zonder Supabase: 96 axe-scans uitgevoerd, 0 overtredingen (zelfde
  als de nulmeting); de ingelogde portal-, beheer- en bar-scenario's konden
  daar niet draaien;
- in CI met een lokale Supabase (draft-PR #205, commit `ff1e371`, gesloten en
  teruggedraaid): `check-all` groen, **509 van 509 e2e-tests geslaagd**, dus
  ook alle 39 scans die lokaal niet draaiden.

| Spec en test | Geschonden regel(s) | Elementen (selector) | Nieuw door 2.1/2.2 of door best-practice? |
|---|---|---|---|
| — | geen | — | — |

**Datum, commit, axe-core-versie:** 2026-10-09, `ff1e371`, axe-core 4.13.0.

**Gevolg:** de strengere set vraagt geen reparaties in `src/`. De bouw raakt
alleen `e2e/`, de lint, de gate en de tests.

### Generiek en ABAS (ADR 0025 R9)

| Onderdeel | Generiek (`// kit: generiek`) | ABAS (lokaal) |
|---|---|---|
| Helper | `e2e/helpers/scanAxe.ts`: tagset, best-practice, scope, uitzonderingen met reden, foutmelding; geen ABAS-pad, -route of -selector | — |
| Telling | `scripts/kit/axe.mjs`: parset `scanAxe`-aanroepen, maakt sleutels, roept `ratchet()` aan | de baseline `.kit/baseline.json` → `axe-uitzondering` |
| Meta-test | `e2e/scan-axe.spec.ts`: werkt met `page.setContent`, zonder app-routes | — |
| Lintregel | de vorm (twee blokken, melding) | de blokken in `eslint.config.mjs`, met het helperpad |
| Lint- en teltest | — | `test/scanAxeLint.test.ts`, `test/axeUitzonderingen.test.ts` |
| Gatebeschrijving | — | `scripts/kit/gates.mjs` → `check:a11y`, `check:axe` |

De tagset staat als constante in de generieke helper, niet in een
`*.lokaal.json`. Eén vaste set is juist het doel. Een project dat een andere
set wil, past de kit aan en doet dat niet per project. De map `e2e/` en de
functienaam `scanAxe` zijn kitconventies; ze staan als constante bovenaan
`scripts/kit/axe.mjs`.

### Wie schrijft wat

Eén PR (besluit 5), na de meting en Brams besluit over de reparaties. De
volgorde houdt `check:fast` na elke stap groen, wat de
groen-voor-klaar-hook van de Tester eist:

1. **Tester:**
   - `e2e/helpers/scanAxe.ts`;
   - `e2e/scan-axe.spec.ts`;
   - de migratie van de 19 bestaande e2e-bestanden.

   `check:fast` blijft groen, want de lintregel en `check:axe` bestaan nog
   niet.
2. **Developer**, alleen als Bram na de meting besluit dat reparaties in
   deze PR gaan: de reparatie in `src/`.
3. **Hoofdsessie** (gatepaden):
   - het lintblok in `eslint.config.mjs`;
   - `scripts/kit/axe.mjs`;
   - de beginstand in `.kit/baseline.json`;
   - in `package.json` → `scripts`: `check:axe`, de opname in `check:fast` en
     de uitbreiding van `ratchet:update`;
   - het register in `scripts/kit/gates.mjs`: `check:axe` erbij, en voor
     `check:a11y` de beschrijving "WCAG 2.2 AA via `scanAxe` (axe-core,
     Playwright) op elk gescand scherm; lint verbiedt losse `AxeBuilder`";
   - een conventieregel in `scripts/kit/feiten.mjs`: "A11y-scan: alleen
     `scanAxe(page)` uit `e2e/helpers/scanAxe.ts` (lint); uitzonderingen met
     reden, geteld door `check:axe`".

   Er komen geen ESLint-suppressies bij: na stap 1 staat er geen losse import
   meer.
4. **Tester:** `test/scanAxeLint.test.ts` en `test/axeUitzonderingen.test.ts`.
   Die kunnen pas groen worden nadat de regel en de gate bestaan.
5. **Docs**, na de bouw: de WCAG-alinea in `docs/ARCHITECTURE.md` en de status
   van deze spec en van de roadmapstap.

**Label `gate-wijziging`: ja** (besluit 5). De PR wijzigt `eslint.config.mjs`,
`scripts/kit/`, `.kit/baseline.json` en `package.json` → `scripts`, en past 19
bestaande e2e-bestanden aan (de diff-guard telt een wijziging in `e2e/`).
Alleen Bram zet het label.

De roadmap zegt "elke stap verlaagt `eslint-suppressions.json`". Deze stap
verlaagt niets en voegt niets toe: `e2e/` heeft geen suppressies.

### Staten, copy, toon, toegankelijkheid

- **Staten:** n.v.t., geen scherm. De twee uitkomsten van de helper zijn
  "stil geslaagd" of "faalt met de melding hierboven".
- **Copy:**
  - de lintmelding `AXE_MELDING` letterlijk zoals hierboven;
  - de kop van de foutmelding: `axe (WCAG 2.2 AA): <n> regel(s) geschonden op
    <url>`;
  - de staplabels: `axe: WCAG 2.2 AA` en `axe: WCAG 2.2 AA + best-practice`;
  - de runtime-fouten: `scanAxe: uitzondering zonder reden (<regel|selector>)`
    en `scanAxe: onbekende axe-regel "<regel>"`;
  - de `check:axe`-meldingen letterlijk zoals onder "De telling";
  - de reden bij de beginstand: `contrast meet e2e/a11y.spec.ts al op dezelfde
    schermen`.
- **Toon en shell:** n.v.t.
- **Toegankelijkheid:** dit is de gate zelf. Focusvolgorde en toetsenbord
  blijven buiten axe (reviewwerk, `.claude/agents/reviewer.md` punt 6).

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Spec importeert `@axe-core/playwright` (default, named of hernoemd) | `no-restricted-imports` met `AXE_MELDING`; lint faalt |
| `await import("@axe-core/playwright")` of `require(…)` in `e2e/`, `test/`, `integration/`, `scripts/` | `no-restricted-syntax` met `AXE_MELDING` |
| `import axe from "axe-core"` plus `page.addScriptTag` + `axe.run` | De import wordt gevangen. `addScriptTag({ path: "node_modules/axe-core/axe.min.js" })` zonder import wordt niet gevangen. Dat blijft een restrisico voor de Reviewer, zoals ADR 0025 dat ook voor het rolhek noemt. |
| Nieuwe `uitgezet` of `overslaan` zonder baseline-regel | `check:axe` faalt met de melding voor een nieuwe uitzondering |
| Uitzondering verwijderd, baseline nog niet bijgewerkt | `check:axe` faalt tot `npm run ratchet:update` |
| Dezelfde uitzondering twee keer in één bestand | Sleutels `… uitgezet:<regel>` en `… uitgezet:<regel> #2`; de tweede is nieuw en faalt |
| Opties via een variabele of spread (`scanAxe(page, opts)`) | `check:axe` faalt: de opties moeten letterlijk zijn |
| `reden: ""` of alleen witruimte | De statische check faalt al in `check:axe`; de helper gooit ook een runtime-fout |
| `uitgezet: [{ regel: "bestaat-niet", … }]` | Runtime-fout `scanAxe: onbekende axe-regel "bestaat-niet"` |
| `bestPractice: false` of weggelaten | Alleen de WCAG-set; nooit minder |
| Bestand in `docs/**` | ESLint negeert `docs/**`; het audit-script blijft staan (besluit 6) |
| Helper-bestand zelf | Uitgezonderd via `ignores` en door `check:axe` overgeslagen, op het exacte pad |
| `e2e/scan-axe.spec.ts` | Wel gelint (scanAxe-import mag), niet geteld door `check:axe` |
| Een update van axe-core voegt een regel toe aan een van de tags | De scan wordt strenger en CI kan rood worden. Dat is bedoeld: de update-PR (Dependabot) toont het. |
| Scan zonder violations maar met `incomplete` | Slaagt, zoals nu. `incomplete` wordt niet gemeld. |
| `binnen` matcht geen element | axe gooit een fout ("No elements found for include"). De helper vangt die niet af: een scope die niets raakt, is een testfout. |
| Meer dan 5 elementen per regel | De melding toont er 5, plus `(+N meer)`. De id-diff blijft volledig. |

## Tests

**`e2e/scan-axe.spec.ts` (Tester, generiek, draait in `check:a11y`).**
Gebruikt `page.setContent` met een minimaal geldig document (`lang`,
`<title>`, `<main>`), zonder app-route. De gevallen:

1. Een schoon document slaagt.
2. Een `<img>` zonder `alt` faalt. De fout bevat `image-alt`, de selector en
   de helpUrl.
3. Tekst met te laag contrast faalt met `color-contrast`. Dat bewijst dat
   `wcag2aa` aan staat.
4. Twee knoppen van 10×10 px vlak naast elkaar falen met `target-size`. Dat
   bewijst dat `wcag22aa` aan staat. Dit geval ving geen van de 62
   2.0-scans.
5. Een document met twee `<main>`-elementen slaagt zonder opties en faalt met
   `bestPractice: true` (`landmark-no-duplicate-main`).
6. Een violation buiten `binnen` slaagt, dezelfde violation binnen `binnen`
   faalt.
7. `uitgezet: [{ regel: "image-alt", reden: "test" }]` laat geval 2 slagen;
   `overslaan: [{ selector: "img", reden: "test" }]` ook. Beide zetten een
   annotatie van het type `axe-uitzondering`.
8. Een lege `reden` en een onbekende `regel` geven de runtime-fouten, nog vóór
   de scan.
9. Zes elementen met dezelfde violation geven `(+1 meer)` in de melding.

De gevallen gebruiken `await expect(scanAxe(page)).rejects.toThrow(/…/)`.

`check:axe` slaat `e2e/scan-axe.spec.ts` over, als tweede vast pad naast de
helper. De uitzonderingen in geval 7 en 8 testen de helper zelf, niet een
scherm. Zo blijft de beginstand gelijk aan het ene echte geval (besluit 3).
Een ander bestand overslaan vraagt een wijziging van de gate (label).

**`test/scanAxeLint.test.ts` (Tester, draait in `check:fast`).** Zelfde
patroon als `test/knopLint.test.ts`: één `ESLint`-instantie met de
projectconfig en `lintText` met een fictief `filePath`. Zonder typed linting,
want `e2e/` heeft die niet.

- Negatief, met `filePath` `e2e/__axe-lint-fixture.spec.ts`; elk geval faalt
  met `AXE_MELDING`:
  - een default-import;
  - een named import `{ AxeBuilder }`;
  - een hernoemde import;
  - `import("@axe-core/playwright")`;
  - `require("@axe-core/playwright")`;
  - `import axe from "axe-core"`.
- Negatief, met `filePath` `test/__axe-lint-fixture.test.ts`: een
  default-import faalt.
- Positief: dezelfde default-import met `filePath` `e2e/helpers/scanAxe.ts`
  geeft geen melding.

**`test/axeUitzonderingen.test.ts` (Tester, draait in `check:fast`).** Test
de analysefunctie die `scripts/kit/axe.mjs` exporteert (bronnen in, sleutels
en problemen uit, met een tijdelijke baseline). Zelfde aanpak als
`test/systeemCatalogus.test.ts`.

- Sleutels:
  - één `uitgezet` geeft `<pad> uitgezet:<regel>`;
  - één `overslaan` geeft `<pad> overslaan:<selector>`;
  - een herhaling geeft ` #2`.
- Niet letterlijk faalt: opties als variabele, een spread in de array, een
  template-literal met expressie als `reden`, of een lege `reden`.
- `binnen` en `bestPractice` tellen niet mee.
- Ratchet:
  - een nieuwe sleutel geeft de melding voor een nieuwe uitzondering;
  - een sleutel die verdwenen is, geeft de opgelost-melding;
  - gelijk aan de baseline geeft geen problemen.
- Het helperbestand en `e2e/scan-axe.spec.ts` worden overgeslagen.

**Bestaande e2e.** De 68 gemigreerde scans zijn zelf het bewijs dat de
strengere set op de huidige schermen slaagt. Wat ze na de migratie vinden,
staat eerst in "Meting".

## Expliciet buiten scope

- Focusvolgorde, toetsenbord en screenreadergedrag: blijft reviewwerk.
- `incomplete`-resultaten melden of laten falen.
- Een gate die eist dat elke route of elk scherm een `scanAxe` heeft.
- Het audit-script
  `docs/audits/2026-10-06-componenten-tokens/tools/screen-audit.cjs`: blijft
  staan als bevroren bewijs (besluit 6).
- Andere axe-integraties (jest-axe, Storybook): bestaan niet.
- De focusgate (roadmap fase 3, stap 7).
- Reparaties in `src/`: de scope volgt pas na "Meting" en Brams besluit.
