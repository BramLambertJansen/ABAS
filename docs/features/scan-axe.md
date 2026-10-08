# scanAxe: één ingang voor de axe-scan (WCAG 2.2 AA)

Status: **voorstel**

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
- lint verbiedt elke andere import van `@axe-core/playwright` of `axe-core`.

Let op de betekenis van "`wcag22aa`". axe-tags tellen niet op: de tag
`wcag22aa` alleen selecteert in axe-core 4.13 precies één regel
(`target-size`). "WCAG 2.2 AA" betekent dus de vijf tags samen. Zo staat het
nu al in `AXE_TAGS` in `e2e/systeem.spec.ts`.

## Betrokken shell(s)

Geen shell-code. Het gaat om testtooling in `e2e/`, `test/` en
`eslint.config.mjs`. Indirect raakt het beide shells: de strengere tagset kan
op bestaande schermen nieuwe violations vinden (zie open vraag V1).

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

### Ontwerp

**De helper.** Nieuw bestand `e2e/helpers/scanAxe.ts`. De eerste regel is
`// kit: generiek`.

```ts
// kit: generiek
import type { Page } from "@playwright/test";

/** WCAG 2.2 AA: axe-tags tellen niet op, dus alle vijf. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

export type ScanAxeOpties = {
  /** Beperk de scan tot dit gebied (CSS-selector). Zie open vraag V4. */
  binnen?: string;
  // Verdere opties alleen na Brams besluit over V2 en V3; zie daar.
};

export async function scanAxe(page: Page, opties?: ScanAxeOpties): Promise<void>;
```

- **Tagset.** Altijd `withTags(WCAG_TAGS)`. Er is geen parameter voor tags of
  regels. `WCAG_TAGS` wordt geëxporteerd voor de meta-test en voor
  documentatie. Hij vervangt `AXE_TAGS` in `e2e/systeem.spec.ts`.
- **Uitvoering.** De scan draait in
  `test.step("axe: WCAG 2.2 AA", …)`, zodat het rapport laat zien welke scan
  faalde als een test er meerdere doet.
- **Resultaat.** De functie geeft niets terug. Een geslaagde scan is stil, een
  mislukte faalt via `expect`. Geen spec gebruikt nu iets anders dan
  `violations`, dus de functie geeft geen `AxeResults` terug. Daardoor kan ook
  niemand eromheen filteren.
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
  structuur zijn Nederlands, zoals in `e2e/systeem.spec.ts`.
- **Scope.** `binnen` wordt `.include(binnen)`. De tagset blijft gelijk; alleen
  het gebied wordt kleiner. Eén aanroep gebruikt dit nu
  (`opslaan-sluiten-pending.spec.ts:61`). Of scope mag, staat in V4.
- **Uitzonderingen.** Regels uitzetten (`disableRules`), extra tags
  (`best-practice`), losse regels (`withRules`) en `exclude` biedt de helper
  in dit voorstel niet aan. Zie V2 en V3. Valt het besluit op "toegestaan",
  dan komt er een optie die een reden eist (type `{ regel: string; reden:
  string }`, met een lege reden als runtime-fout). Over een telling in
  `.kit/baseline.json` beslist Bram (V3).

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

**Migratie.** Alle 68 aanroepen worden `await scanAxe(page)` (of
`scanAxe(tom)` of `scanAxe(femke)` waar de spec een eigen `Page` heeft), samen
met de bijbehorende `expect(…violations…)`. Gevolgen:

- de 62 scans met `wcag2a`/`wcag2aa` krijgen de volledige set (V1);
- `AXE_TAGS` in `e2e/systeem.spec.ts` vervalt;
- `axeScan()` in `e2e/dialogen-tabs-landmarks.spec.ts` en `scan()` in
  `e2e/a11y.spec.ts:1433` worden `scanAxe`. Wat er met hun best-practice-deel
  gebeurt, hangt af van V2;
- testtitels die de tagset noemen (`has no WCAG2A/AA violations`) worden
  `has no WCAG 2.2 AA violations`.

Screenshot-baselines raakt de migratie niet: de namen staan expliciet in
`toHaveScreenshot`.

### Generiek en ABAS (ADR 0025 R9)

| Onderdeel | Generiek (`// kit: generiek`) | ABAS (lokaal) |
|---|---|---|
| Helper | `e2e/helpers/scanAxe.ts`: tagset, scope, foutmelding; geen ABAS-pad, -route of -selector | — |
| Meta-test | `e2e/scan-axe.spec.ts`: werkt met `page.setContent`, zonder app-routes | — |
| Lintregel | de vorm (twee blokken, melding) | de blokken in `eslint.config.mjs`, met het helperpad |
| Lint-test | — | `test/scanAxeLint.test.ts`: leest de projectconfig |
| Gatebeschrijving | — | `scripts/kit/gates.mjs` → `check:a11y` |

De tagset staat als constante in de generieke helper, niet in een
`*.lokaal.json`. Eén vaste set is juist het doel. Een project dat een andere
set wil, past de kit aan en doet dat niet per project.

### Wie schrijft wat

Volgorde binnen één PR. Zo blijft `check:fast` na elke stap groen, wat de
groen-voor-klaar-hook van de Tester eist:

1. **Tester:**
   - `e2e/helpers/scanAxe.ts`;
   - `e2e/scan-axe.spec.ts`;
   - de migratie van de 19 bestaande e2e-bestanden.

   `check:fast` blijft groen, want de lintregel bestaat nog niet.
2. **Developer**, alleen als de strengere tagset violations vindt in
   `check:a11y`: de reparatie in `src/`. Dit hangt af van V1.
3. **Hoofdsessie** (gatepaden):
   - het lintblok in `eslint.config.mjs`;
   - de beschrijving van `check:a11y` in `scripts/kit/gates.mjs`, voorstel:
     "WCAG 2.2 AA via `scanAxe` (axe-core, Playwright) op elk gescand scherm;
     lint verbiedt losse `AxeBuilder`";
   - een conventieregel in `scripts/kit/feiten.mjs`: "A11y-scan: alleen
     `scanAxe(page)` uit `e2e/helpers/scanAxe.ts` (lint)".

   Er komen geen suppressies bij: na stap 1 staat er geen losse import meer.
4. **Tester:** `test/scanAxeLint.test.ts`. Die test kan pas groen worden nadat
   de regel bestaat.
5. **Docs**, na de bouw: de WCAG-alinea in `docs/ARCHITECTURE.md` en de status
   van deze spec en van de roadmapstap.

**Label `gate-wijziging`: ja.** De PR wijzigt `eslint.config.mjs` en
`scripts/kit/`, en past 19 bestaande e2e-bestanden aan (de diff-guard telt
een wijziging in `e2e/`). Alleen Bram zet het label.

De roadmap zegt "elke stap verlaagt `eslint-suppressions.json`". Deze stap
verlaagt niets en voegt niets toe: `e2e/` heeft geen suppressies.

### Staten, copy, toon, toegankelijkheid

- **Staten:** n.v.t., geen scherm. De twee uitkomsten van de helper zijn
  "stil geslaagd" of "faalt met de melding hierboven".
- **Copy:**
  - de lintmelding `AXE_MELDING` letterlijk zoals hierboven;
  - de kop van de foutmelding: `axe (WCAG 2.2 AA): <n> regel(s) geschonden op
    <url>`;
  - de staplabel: `axe: WCAG 2.2 AA`.
- **Toon en shell:** n.v.t.
- **Toegankelijkheid:** dit is de gate zelf. Focusvolgorde en toetsenbord
  blijven buiten axe (reviewwerk, `.claude/agents/reviewer.md` punt 6).

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Spec importeert `@axe-core/playwright` (default, named of hernoemd) | `no-restricted-imports` met `AXE_MELDING`; lint faalt |
| `await import("@axe-core/playwright")` of `require(…)` in `e2e/`, `test/`, `integration/`, `scripts/` | `no-restricted-syntax` met `AXE_MELDING` |
| `import axe from "axe-core"` plus `page.addScriptTag` + `axe.run` | De import wordt gevangen. `addScriptTag({ path: "node_modules/axe-core/axe.min.js" })` zonder import wordt niet gevangen. Dat blijft een restrisico voor de Reviewer, zoals ADR 0025 dat ook voor het rolhek noemt. |
| Bestand in `docs/**` | ESLint negeert `docs/**`; het audit-script blijft staan (V6) |
| Helper-bestand zelf | Uitgezonderd via `ignores` op het exacte pad |
| Een update van axe-core voegt een regel toe aan een van de vijf tags | De scan wordt strenger en CI kan rood worden. Dat is bedoeld: de update-PR (Dependabot) toont het. |
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
5. Een violation buiten `binnen` slaagt, dezelfde violation binnen `binnen`
   faalt. Dit geval vervalt als V4 "geen scope" wordt.
6. Zes elementen met dezelfde violation geven `(+1 meer)` in de melding.

De gevallen gebruiken `await expect(scanAxe(page)).rejects.toThrow(/…/)`.

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

**Bestaande e2e.** De 68 gemigreerde scans zijn zelf het bewijs dat de
strengere set op de huidige schermen slaagt (of niet, zie V1).

## Open vragen voor Bram

- **V1 — Strengere set op 62 bestaande scans.**
  - **Wat er verandert:** de migratie zet daar `wcag21a`, `wcag21aa` en
    `wcag22aa` aan. In axe-core 4.13 zijn dat `autocomplete-valid`,
    `avoid-inline-spacing`, `css-orientation-lock` en `target-size` (24 px).
    `label-content-name-mismatch` is experimenteel en draait niet.
  - **Wat onbekend is:** hoeveel schermen daarop falen. De suite is niet
    gedraaid voor deze spec; dat vraagt build en Supabase.
  - **De vraag:** mag de PR wachten tot de Developer de gevonden violations in
    `src/` heeft opgelost (stap 2)? Of eerst een meet-PR met alleen de
    helper en de meta-test, waarna de Tester lokaal meet en rapporteert,
    gevolgd door de migratie met de reparaties?
  - **Uitgesloten:** een tijdelijk lagere tagset per scan. Die maakt de stap
    ongedaan.
- **V2 — Best-practice-regels.** Twee scans controleren nu meer dan WCAG:
  - `dialogen-tabs-landmarks` draait alle best-practice-regels;
  - `a11y.spec.ts:1434` (#125) draait `landmark-one-main` en `region`.

  Opties:
  - (a) de helper krijgt een optie die best-practice erbij zet; de WCAG-set
    blijft altijd aan, de optie kan alleen uitbreiden;
  - (b) best-practice staat altijd aan voor elke scan (strenger; V1 wordt
    groter);
  - (c) geen best-practice: de #125-controle wordt een DOM-assertie (één
    `main`, staat er al) en de dialoogtest verliest de best-practice-regels.
- **V3 — Regels uitzetten en `exclude`.**
  - **Nu:** het enige gebruik is `disableRules(["color-contrast"])` in
    `dialogen-tabs-landmarks`. De reden is dat contrast elders al gemeten
    wordt; het is geen uitzondering op het scherm. Na migratie zonder
    uitzetten meet die test contrast gewoon mee.
  - **Opties:**
    - (a) verboden, de helper biedt het niet aan;
    - (b) toegestaan met een verplichte reden per regel;
    - (c) als (b), plus een teller in `.kit/baseline.json` die alleen mag
      dalen.
  - **`exclude`:** wordt nu nergens gebruikt. Hoort het bij dezelfde keuze?
- **V4 — Scope (`binnen`).** Eén scan beperkt zich tot het gebied "Eerdere
  geldacties". Mag de helper `binnen` aanbieden? Scope verkleint de scan wel,
  maar de tagset blijft vast. Of wordt dat één scan van de hele pagina?
- **V5 — Eén PR of twee.** Dit voorstel is één PR met het label, in de
  volgorde hierboven. Wil je de lintregel liever in een aparte PR na de
  migratie?
- **V6 — Audit-script.**
  `docs/audits/2026-10-06-componenten-tokens/tools/screen-audit.cjs` gebruikt
  `AxeBuilder` met de volledige set. Voorstel: laten staan als bevroren
  bewijs; `docs/**` valt buiten lint. Akkoord?

## Expliciet buiten scope

- Focusvolgorde, toetsenbord en screenreadergedrag: blijft reviewwerk.
- `incomplete`-resultaten melden of laten falen.
- Een gate die eist dat elke route of elk scherm een `scanAxe` heeft.
- Het audit-script in `docs/audits/` (tenzij V6 anders uitvalt).
- Andere axe-integraties (jest-axe, Storybook): bestaan niet.
- De focusgate (roadmap fase 3, stap 7).
