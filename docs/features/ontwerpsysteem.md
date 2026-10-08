# Ontwerpsysteem (`/design/systeem`)

Status: **goedgekeurd**

Roadmap fase 3, stap 6 (ADR 0025). Bouwt op de tokenschaal
([tokenschaal.md](tokenschaal.md)) en de knopcomponenten ([knop.md](knop.md)).

## Doel

Eén pagina waarop je het ontwerpsysteem **ziet**: de tokens en de gedeelde
bouwstenen met al hun varianten en staten. Zo beoordeel je een wijziging
aan een token of component zonder inlog, Supabase of een bestaand scherm.
Dat ontbrak bij #197, #198 en #199: de zichtbare veranderingen waren niet te
controleren.

Drie dingen maken er een gate van:
- **Screenshots** (`toHaveScreenshot`) per onderdeel, met baselines in de repo.
  Een visuele wijziging valt dan op in de PR-diff en in CI.
- **Toegankelijkheid:** axe scant de hele pagina, dus elke variant en toon
  wordt op contrast gecontroleerd.
- **Dekking** (`check:catalogus`): een component in `src/components` dat niet
  op de pagina staat, faalt de gate, tenzij het op een uitzonderingslijst met
  reden staat. De lijst mag alleen krimpen.

## Betrokken shell(s)

Geen. Dit is gereedschap voor het bouwproces, net als `/design`: de route staat
bewust buiten `src/shells/` en `src/features/`.

## Datamodel

n.v.t. — geen data.

## RPC's

n.v.t. — geen data- of geldpad. De pagina toont componenten met voorbeeldprops.

## Rolzichtbaarheid

n.v.t. — geen ledendata of rollen. Toegang loopt via de bestaande poort van
`/design` (zie Besluiten).

## Hergebruik & UX-patronen

### Besluiten (Bram, 2026-10-08)

1. **Toegang:** `/design/systeem` valt onder de bestaande poort van `/design`
   (`designPreviewGate` in `src/middleware.ts`, Basic-auth). Die matcht al op
   `/design`; er komt geen nieuw toegangsmechanisme.
   - In een productiebuild is de pagina alleen met `DESIGN_PREVIEW_PASSWORD`
     bereikbaar en geeft anders 404 (ongewijzigd).
   - De Playwright-tests zetten een testwachtwoord in de omgeving van hun
     webserver en sturen het mee.
2. **Inhoud:** de tokens en de kernbouwstenen. `check:catalogus` dwingt de
   dekking af, met een uitzonderingslijst die alleen mag krimpen.
3. **Baselines:** een handmatige CI-workflow maakt ze op de CI-runner en commit
   ze op de gekozen branch. De gewone CI vergelijkt daarna ertegen.
4. **Raamwerk:** Bram wil ABAS' raamwerk later extraheren (ADR 0025 R9). Zijn
   woorden: "doe je beste ingeving, hou het framework in je achterhoofd". Dit
   ontwerp scheidt daarom het generieke deel (motor, gate, workflow, spec) van
   het ABAS-specifieke deel (voorbeelden, paden, teksten). Zie
   "Raamwerk-extractie". Bram heeft op 2026-10-08 de spec daarmee goedgekeurd.

### Raamwerk-extractie (ADR 0025 R9)

De regel is dezelfde als bij `rolhek.mjs` tegenover `rolhek.lokaal.json`:
**generiek in code, projectspecifiek in een `*.lokaal.json` of een
voorbeeldbestand.** Een volgend project neemt het generieke deel over en vult
alleen het lokale deel.

| Onderdeel | Generiek (naar het raamwerk) | ABAS-specifiek (blijft hier) |
|---|---|---|
| Gate | `scripts/kit/systeem.mjs`: leest paden uit de config, vergelijkt componenten met het register en de uitzonderingen; geen ABAS-namen | `scripts/kit/systeem.lokaal.json` |
| Configuratie | het formaat van `systeem.lokaal.json` | de waarden: `componentenMap`, `registerPad`, `themaPad`, `route`, `baselineSleutel`, `wachtwoordEnv`, `viewport`, `drempel` |
| Pagina-motor | `src/lib/systeem/`: `leesThema(cssPad)` (parser van het `@theme`-blok), `SysteemSectie` (zet `id` en `data-systeem`), `TokenTabel` | `src/app/design/systeem/page.tsx` (dun: roept de motor aan) |
| Voorbeelden | het type `Voorbeeldregister` | `src/app/design/systeem/voorbeelden.tsx` en `teksten.ts` (alle paginateksten) |
| Playwright | `e2e/systeem.spec.ts`: loopt over elke `[data-systeem]`-sectie, zonder componentnamen; leest route, wachtwoord, venster en drempel uit de config | de interactiegevallen (hover, focus) staan in een eigen lijst in de lokale config, niet in de spec |
| Workflow | `.github/workflows/screenshots-bijwerken.yml`: geen ABAS-paden; spec-pad en snapshotmap komen uit de config | de naam van het secret blijft `SCREENSHOTS_TOKEN` |
| Poort | de gedachte "achter bestaande poort" | `designPreviewGate` in `src/middleware.ts` |

Gevolgen voor de bouw:
- Generieke bestanden krijgen bovenaan de regel `// kit: generiek` en
  verwijzen nooit naar een ABAS-pad, -tokennaam of -componentnaam. Dat is een
  afspraak voor de Reviewer; er komt geen gate op.
- Alle paden en getallen staan één keer in `systeem.lokaal.json`.
- Tokennamen (`h-control` enz.) worden uit het CSS-bestand gelezen, nooit
  vastgelegd in de motor. De conventie `--color-*`, `--height-*`,
  `--radius-*`, `--shadow-*`, `--text-*` is die van Tailwind v4 en dus
  generiek.
- `docs/ROADMAP-rails.md` fase 4 krijgt bij de extractie een lijst van deze
  bestanden. Die lijst is de tabel hierboven.

### Technische invulling (goedgekeurd, met bovenstaande scheiding)

**Route.** `src/app/design/systeem/page.tsx` (server component). Elk onderdeel
staat in een `<section>` met `id` en `data-systeem="<naam>"`, zodat een
screenshot per onderdeel kan en een verschil lokaal blijft.

**Tokens (bron = `globals.css`).** De pagina leest het `@theme`-blok uit
`src/app/globals.css` (zoals `test/accentContrast.test.ts` dat doet) en toont:
- kleuren als vlakken met naam en waarde;
- controlhoogtes (`h-control`, `h-control-lg`) en radii (`sm` t/m `sheet`,
  `full`);
- schaduwen en tekstmaten (`text-screen-title` t/m `text-detail`).

Omdat de pagina uit het thema leest, kan hij niet afwijken van de tokens.

**Bouwstenen.** `src/app/design/systeem/voorbeelden.tsx` exporteert een
register `VOORBEELDEN: Record<string, () => ReactNode>`, sleutel = de naam van
de component. Eerste versie:

| Onderdeel | Matrix |
|---|---|
| `Knop` | variant (4) × tone (2) × maat (2), elk in rust, `disabled` en `aria-disabled`; plus icoon en `href` |
| `Chip` | rust, geselecteerd, uitgeschakeld × maat (2) |
| `Segment` + `SegmentBalk` | rust, geselecteerd, uitgeschakeld |
| `TabList` | `stijl="segment"` en `stijl="eigen"` |
| `Toets` | `keypad` (licht, rail), `stap`; rust en uitgeschakeld |
| `PinToetsenbord` | licht en rail |
| `TekstVeld`, `ZoekVeld`, `Select` | rust, gevuld, fout, uitgeschakeld; licht en rail |
| `StatusFilter`, `BezettingKeuze` | rust en geselecteerd |
| `InitialsAvatar`, `MemberPill`, `RoleBadge`, `StatCard` | maten en tones |
| `LeesFout`, `VerversStatus`, `ProductAfbeelding`, `AuroraMerk`, `ZoekIcoon` | de staten die ze hebben |

Het register is voorbeeldcode: geen netwerk, geen Supabase, vaste data.

**Uitzonderingslijst.** `Overlay`, `OverlayPresence` (geen visuele uitvoer),
`LidZoeker` (leest data), `GeldActieHerstel`, `EerdereGeldActie`,
`OnbekendeUitkomstMelding`, `OpslaanSectie`, `CodeInvoer`,
`NieuwWachtwoordVelden`, `StartScherm` en `ZijPaneel` staan er in de eerste
versie op, elk met een reden. De Developer legt de exacte lijst vast en meldt
afwijkingen; hij kiest niet zelf wat erbij komt.

**`check:catalogus`** (`scripts/kit/systeem.mjs`, geregistreerd in
`scripts/kit/gates.mjs` en als `check:catalogus` in `package.json`, deel van
`check:fast`; paden uit `scripts/kit/systeem.lokaal.json`):
- leest de component-exports in de `componentenMap` uit de config
  (`src/components/*.tsx`, hoofdletternamen);
- faalt voor elke component die noch in `VOORBEELDEN` staat noch op de
  uitzonderingslijst in `.kit/baseline.json` (sleutel uit de config);
- faalt voor een uitzondering of voorbeeld zonder bestaande component;
- de namen van de uitzonderingen staan in `.kit/baseline.json` en de ratchet
  laat die lijst alleen dalen (`npm run ratchet:update` na een daling); de
  redenen staan in `systeem.lokaal.json` → `redenen`, en elke uitzondering
  moet er een hebben.

**Playwright** (`e2e/systeem.spec.ts` in het bestaande project van
`playwright.config.ts`, dus onderdeel van `check:a11y`; alle waarden uit
`systeem.lokaal.json`):
- vast venster 1280×900, `deviceScaleFactor` 1, alleen Chromium;
- `webServer.env.DESIGN_PREVIEW_PASSWORD` = een testwachtwoord, en
  `httpCredentials` voor deze spec;
- wacht op `document.fonts.ready`; animaties staan al uit
  (`reducedMotion: "reduce"`), plus `animations: "disabled"`;
- per `data-systeem`-sectie één `toHaveScreenshot` met een kleine drempel
  (`maxDiffPixelRatio: 0.001`);
- interactietests voor de staten die niet statisch kunnen: hover (primair,
  secundair, geselecteerde chip), `focus-visible` (knop, chip, toets);
- een axe-scan van de hele pagina (`wcag22aa`; de bestaande
  `AxeBuilder`-aanroep, `scanAxe` zelf is stap 5).

**Baselines-workflow** (`.github/workflows/screenshots-bijwerken.yml`):
- start via het label `screenshots-bijwerken` op de PR, of via
  `workflow_dispatch` met de branch (dat laatste kan pas als de workflow op de
  standaardbranch staat);
- `contents: write`; checkout, `npm ci`, `npx playwright install --with-deps
  chromium`, `npx playwright test e2e/systeem.spec.ts --update-snapshots`;
- commit de PNG's uit `e2e/systeem.spec.ts-snapshots/` op de branch als
  `github-actions[bot]`.
- Beperking: een push met de standaardtoken start geen nieuwe CI-run. Daarom
  gebruikt de workflow `secrets.SCREENSHOTS_TOKEN` (een fijnmazige
  toegangstoken met alleen `contents: write` op deze repo) als die bestaat,
  anders de standaardtoken. Bram zet die token (open punt in
  `docs/operations/rails-checklist.md`).

### Staten, copy, toon, toegankelijkheid

- **Staten:** de pagina toont per bouwsteen de staten die hij heeft (rust,
  geselecteerd, uitgeschakeld, fout, hover en focus via de tests). Er is geen
  laden/pending/succes, want de pagina doet niets.
- **Copy:** de pagina is Nederlands, met korte kopjes per sectie en voor elke
  bouwsteen de naam en de props. Geen product- of ledendata.
- **Toon en shell:** secties met `tone="rail"` staan op een donkere strook
  (`bg-rail`), zodat de railvarianten echt op een rail staan. `useShell()`
  wordt niet gelezen.
- **Toegankelijkheid:** de pagina heeft één `main`, kopniveaus in volgorde en
  alle voorbeeldknoppen een toegankelijke naam. Axe moet groen zijn, ook met
  alle varianten op de pagina.

### Wie schrijft wat

Dit is een gate-wijziging. De Developer is read-only voor `scripts/kit/`,
`playwright.config.ts`, `.github/` en `.kit/`; de hoofdsessie schrijft die. De
Developer bouwt de pagina, de motor in `src/lib/systeem/`, de voorbeelden en de
teksten. De Tester schrijft `e2e/systeem.spec.ts` en `test/systeemCatalogus.test.ts`.

## Randgevallen

| Situatie | Gedrag | Foutcode/tekst |
|---|---|---|
| Component in `src/components` zonder voorbeeld en zonder uitzondering | `check:catalogus` faalt | "`X` staat niet in `/design/systeem`: voeg een voorbeeld toe of een uitzondering met reden" |
| Uitzondering of voorbeeld voor een component die niet meer bestaat | `check:catalogus` faalt | "`X` bestaat niet meer" |
| Nieuw onderdeel, nog geen baseline | De screenshot-test faalt in CI | "missing snapshot": draai de workflow `screenshots-bijwerken` |
| Bewuste visuele wijziging | De test faalt; workflow opnieuw draaien; de PNG-diff staat in de PR | — |
| Productie zonder `DESIGN_PREVIEW_PASSWORD` | 404 | ongewijzigd |
| Font laadt niet voor de screenshot | Test wacht op `document.fonts.ready`; faalt na de time-out | — |
| Lokale baselines wijken af van CI | Genereer baselines alleen via de workflow | — |

## Tests

- Unit (`test/`): de logica van `check:catalogus` (geen voorbeeld, verouderde
  uitzondering, geslaagd) als `test/systeemCatalogus.test.ts`, in de stijl van
  de andere kit-tests; en dat de tokenparser van de pagina elk `--color-*`-,
  `--height-*`- en `--radius-*`-token uit `globals.css` vindt.
- e2e: `e2e/systeem.spec.ts` (screenshots, interactie, axe) zoals hierboven.
- Ratchet: de uitzonderingslijst in `.kit/baseline.json` start op zijn
  huidige lengte en daalt alleen.
- Dit is een gate-wijziging (`playwright.config.ts`, `.github/`,
  `scripts/kit/`, `.kit/baseline.json`): de PR krijgt het label
  `gate-wijziging`.

## Expliciet buiten scope

- De samengestelde componenten uit de uitzonderingslijst (nepdata en alle
  staten daarvoor). Die gaan er per component af, in latere PR's.
- Volledige schermen van de bar en het portal (vragen om een Supabase-mock).
- `scanAxe(page)` als enige axe-ingang met een lintverbod (stap 5).
- `Tegel` en optierijen (nog geen componenten).
- Een donkere modus of density-varianten (bestaan niet).
