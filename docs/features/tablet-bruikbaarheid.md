# Bar en beheer bruikbaar op ondersteunde tablets

**Status: gebouwd en gemerged** (#124, PR #145, merge `c48d063`, 2026-10-02;
e2e groen in CI). Besluiten direct na die sectie ("Besluiten van Bram"); wat er afweek van
deze spec staat in "Gebouwd, afwijkingen en wat niet gedaan is". Het deel
daarna tot die sectie is de oorspronkelijke spec en blijft als besluithistorie
staan; waar de bouw afwijkt, wint de sectie "Gebouwd".

## Gebouwd, afwijkingen en wat niet gedaan is

Gemerged in PR #145. Geen datamodel-, RPC-, rol- of statewijziging; alleen
classes en layout, zoals gespecificeerd.

**Gebouwd:**

- Gedeeld `src/components/ZijPaneel.tsx` (`as` is `div` of `aside`), breedte
  `clamp(300px,36vw,372px)`, scrolt binnen zichzelf. Gebruikt door `Mandje`
  (`div`) en `DienstActief` (`aside`). Het paneel staat op elke breedte rechts;
  er is geen portretvariant onder de inhoud of uitschuifbaar (vraag 1, optie b).
- Productgrid in `Assortiment.tsx` (gridweergave): `repeat(auto-fill,
  minmax(150px,1fr))` via `MIN_KAART_PX = 150`; `shell.columns` wordt hier niet
  meer gebruikt.
- Productkaart: naam met `line-clamp-2` en `break-words`; de aantallenbadge
  staat naast de prijs (in dezelfde `flex-wrap`-regel onder de naam), niet
  naast de naam; plus-knop rechts. De `aria-label` (`addLabel`) bevat de
  volledige naam.
- Mandjerij in `Mandje.tsx` als twee-kolommengrid: naam en prijs per stuk
  linksboven, stepper (min, aantal, plus) linksonder, regeltotaal rechtsonder,
  verwijderknop rechtsboven. Reden: in één rij liet het 300px-paneel de naam
  ~26px over (review PR #145). Het mandje toont de volledige naam (geen
  afkappen, `break-words`); alleen de productkaart kapt af na twee regels. DOM-
  en tabvolgorde per rij is ongewijzigd: min, plus, verwijderen.
- Rail in `DienstTabs.tsx`: `w-[80px]`, `min-[1024px]:w-[92px]` vanaf 1024px
  viewportbreedte (viewportbreakpoint, geen container query).
- Beheerheader in `BeheerTabs.tsx`: `flex-wrap` met `gap-x-3.5 gap-y-2` en
  `min-h-[60px]`, ook de tabgroep zelf mag omslaan; Uitloggen blijft zichtbaar
  (e2e). `DienstActief`-header idem `flex-wrap`.
- E2E `e2e/tablet-bruikbaarheid.spec.ts` (Supabase gemockt) op 768×1024,
  1024×768 en 1280×800: geen horizontale paginaoverflow, Uitloggen en alle
  vijf beheertabs binnen beeld, de badge staat onder de naam (bedekt naam niet),
  naam in het mandje minstens 120px breed bij 300px-paneel, ook met extreem
  lange namen. Zoom: een verkleinde layoutviewport (683×512, 150% op 1024×768)
  en een groter lettertype (`html { font-size: 24px }`) op 1024×768.
- `check:fast` en CI (`check-all`, inclusief die e2e) zijn groen; de e2e kon
  lokaal niet draaien (geen Supabase-stack in de bouwomgeving).

**Afwijkingen en invulling:**

- **Geen `@tailwindcss/container-queries`, bewust.** `auto-fill` volgt de
  werkelijke inhoudsbreedte al vanzelf; rail en paneel gebruiken een
  viewportbreakpoint of `clamp`. Zo is er geen nieuwe dependency. Dit wijkt af
  van de aanbeveling bij vraag 3 in de oorspronkelijke spec: zie "Besluiten".
- `useShell().columns` blijft bestaan: `StaffPicker` gebruikt het nog. Alleen
  `Assortiment` stopte ermee.
- Mandjerij op twee regels, niet de één-regel-rij uit de spec (zie boven).

**Niet gedaan of niet bewezen (OPEN):**

- (a) Screenshots voor/na op de matrix zijn niet gemaakt.
- (b) Controle op een fysiek tablet is niet gedaan; vraag 5 is niet
  beantwoord (merk/maat onbekend). Deze feature claimt geen werking op een echt
  toestel, alleen op de Playwright-viewports.
- (c) Vraag 4, volgorde met T03 ([#43](https://github.com/BramLambertJansen/ABAS/issues/43))
  en T07 ([#127](https://github.com/BramLambertJansen/ABAS/issues/127)), is
  onbeantwoord. T04 is gebouwd en gemerged omdat het alleen classes/layout
  raakt; wie later mergt, lost eventuele conflicten in `Mandje`, `Assortiment`
  en `DienstTabs` zelf op.
- (d) De verwijderknop in het mandje is 30px (`h-[30px] w-[30px]`): klein
  aanraakdoel (Reviewer-opmerking), buiten scope van dit ticket.
- (e) De lijstweergave in `Assortiment` gebruikt nog `truncate` (één regel,
  `flex-1`) voor de naam; alleen de gridweergave kreeg `line-clamp-2`. De
  `aria-label` bevat de volledige naam.

## Besluiten van Bram

- **D1:** 768px portret en 1024px landschap zijn ondersteund; geen
  toestelmelding of minimummaat (zie "Besluit D1").
- **Vraag 1 (zijpaneel op portret):** aanbeveling gevolgd, optie (b): smaller
  paneel rechts, fluïde `clamp(300px,36vw,372px)` met compactere regels.
- **Vraag 2 (lange namen):** aanbeveling gevolgd: twee regels in de kaart, de
  volledige naam in het mandje en in de `aria-label`.
- **Vraag 3 (container queries):** aanbeveling gevolgd, de plugin zou erbij
  mogen. De Developer bouwde het zonder de plugin omdat `auto-fill` en
  viewportbreakpoints volstonden; dat is als bewuste keuze in "Gebouwd"
  vastgelegd. Ontbreekt ooit een situatie die de plugin vereist, dan is dat een
  nieuw besluit.
- **Vraag 4 en 5:** niet beantwoord, zie OPEN (b) en (c).

Spec voor [issue #124](https://github.com/BramLambertJansen/ABAS/issues/124)
(frontend T04 · P1, epic #121, finding F04). Stemt af met
[#43](https://github.com/BramLambertJansen/ABAS/issues/43) (T03, verkoopdraft)
en [#127](https://github.com/BramLambertJansen/ABAS/issues/127) (T07,
ledenzoeker en productfilters), die dezelfde verkoopschermen raken.

## Doel

De bardienst en de beheerder herkennen producten en bedragen en bereiken alle
primaire acties op 768×1024 (portret), 1024×768 (landschap) en 1280×800.
Een bartelefoon blijft buiten scope (CLAUDE.md: supportuitspraak, geen grens
die de app afdwingt).

## Besluit D1

768px portret en 1024px landschap zijn ondersteund. Gevolg: de layout mag niet
uitgaan van een vaste breedte, en de app voegt **geen** toestelmelding of
minimummaat toe. Een minimumbreedte onder 768px is niet gegarandeerd.

## Oorzaken (uit het issue, te hervalideren op actuele main)

| Plek | Nu | Effect |
|---|---|---|
| `DienstTabs.tsx` rail | `w-[92px]` | 92px weg op 768px |
| `Mandje.tsx` en `DienstActief.tsx` zijpaneel | `w-[372px]` | op 768px blijft ~252px inhoud over |
| `Assortiment.tsx` grid | `shell.columns` = 4 (`src/shells/bar/capabilities.ts`) | op 1024px ~130px per kaart: namen afgekort, badge bedekt naam |
| `BeheerTabs.tsx` header | tabs (vijf voor een beheerder) + badge + Uitloggen op één rij, `whitespace-nowrap` | Uitloggen valt buiten beeld, paginabreedte 840px bij 768px |

## Gekozen aanpak

Geen nieuw breakpointsysteem per scherm; de layout volgt de **beschikbare
inhoudsbreedte**.

1. **Productgrid** (`Assortiment.tsx`): vervang vaste `shell.columns` door
   `repeat(auto-fill, minmax(<min kaartbreedte>, 1fr))`. De minimumbreedte volgt
   uit "Rode wijn" en "Spa rood" volledig leesbaar. `shell.columns` blijft voor
   andere gebruikers bestaan; alleen dit grid stopt ermee. Is het alleen nog
   een hint zonder consument, dan wordt dat in Docs-stap opgeruimd.
2. **Aantallenbadge**: de badge bedekt geen naam of prijs meer. Plaats hem op
   een eigen plek in de kaart (niet naast de tekst in dezelfde flexrij met
   `truncate`), zodat naam en prijs eerst hun ruimte krijgen.
3. **Lange namen**: naam mag tot twee regels (`line-clamp-2`) in de kaart, in
   plaats van één regel `truncate`. Een naam die dan nog wordt afgekapt is
   volledig bereikbaar zonder hover: de `aria-label` bevat hem al
   (`addLabel`), en het mandje toont de volledige naam. Zie vraag 2.
4. **Rail**: smaller op portret (iconen met label, geen 92px) via
   `@container`/viewportbreakpoint op de rail zelf. De rail behoudt zijn
   tabcontract uit #125 (`TabList`, roving tabindex).
5. **Zijpaneel (Mandje en DienstActief)**: fluïde breedte
   (`clamp`, ruwweg 300–372px) op landschap. Op portret staat het onder de
   inhoud of als uitschuifbaar paneel; totaal en afrekenknop blijven in beeld
   (sticky onderrand). Zie vraag 1. `Mandje` en `DienstActief` delen dit
   zijpaneel-gedrag: één gedeeld component in `src/components`, geen twee
   kopieën (CLAUDE.md: duplicatie is een reviewfout).
6. **Beheerheader**: tabs en rechtergroep mogen op twee rijen of de tabs
   scrollen binnen hun eigen balk, maar **Uitloggen blijft altijd zichtbaar**
   en er is geen paginabrede horizontale overflow. "Ingelogd als" blijft
   `lg:`-only.
7. **Zoom en fontvergroting**: geen vaste `h-screen`/pixelhoogtes die primaire
   acties wegdrukken; scroll binnen het paneel is toegestaan, overlappende
   controls niet.

Container queries: Tailwind 3.4 heeft ze niet standaard. Opties zijn
`@tailwindcss/container-queries` (nieuwe dependency, vraag 3) of
viewportbreakpoints op het paneel. Het issue vraagt "werkelijke
inhoudsbreedte, niet alleen globale breakpoints", dus de aanbeveling is de
plugin.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

Nee. Alleen presentatie: geen RPC, geen schema, geen bedragberekening in de
client, geen `served_by`, geen auth. Geld blijft via RPC; het totaal in het
mandje blijft wat de server en bestaande logica opleveren, alleen de plaats
verandert.

## Betrokken shells

`shells/bar` (verkoop, dienst, beheer). Portal ongewijzigd.

## Datamodel, RPC's, rolzichtbaarheid

Geen wijzigingen. Rollen en zichtbaarheid blijven zoals ze zijn.

## ADR nodig?

**Nee, bevestigd.** Er kwam geen nieuwe dependency (zie "Gebouwd") en
`useShell().columns` bleef bestaan. De oorspronkelijke voorwaarde (vraag 3,
`columns` verwijderen) is dus niet getriggerd.

## Afstemming met afhankelijke tickets

- **T03 (#43)** en **T07 (#127)** raken `Assortiment`, `Mandje` en
  `DienstTabs`. Volgorde: T04 mergt na T03 (draft-state in `DienstTabs`), of
  T03/T04 raken disjuncte stukken. T04 verandert alleen classes/layout, geen
  state. Bram bepaalt de volgorde (vraag 4).
- **T05 (#125)** is gemerged; het tab- en overlaycontract blijft intact.

## Randgevallen

- Productnaam van 60+ tekens zonder spaties.
- Lid- en medewerkernamen lang in het zijpaneel en de dienstregels.
- Groot bedrag (bijv. €1.234,50) in totaal en dienstregel naast de badge.
- Drie crewleden in `DienstActief` op 768px.
- Volle bestelling: mandje scrolt, totaal en Afrekenen blijven bereikbaar.
- Browserzoom 150% en groter lettertype op 1024×768.
- Beheerder (vijf tabs) en bardienst (drie tabs) in de beheerheader.
- Overlays (#125) blijven passen en scrollen op 768px.

## Teststrategie

- **Playwright (`e2e/`)**: nieuwe spec `tablet-bruikbaarheid.spec.ts` met
  viewports 768×1024, 1024×768 en 1280×800. Per viewport: geen horizontale
  paginascroll (`scrollWidth <= clientWidth`), Uitloggen en Afrekenen
  zichtbaar en klikbaar, badge-bounding-box overlapt de naam niet.
  Negatief: zelfde asserts met extreem lange namen en 150% zoom.
- **Axe (`check:a11y`)**: bestaande entrypoints op de nieuwe viewports
  draaien; bestaande tests blijven groen.
- **Unit (`test`)**: alleen als er pure logica ontstaat; verwacht van niet.
- **Handmatig, door Bram**: screenshots voor/na op de matrix en een fysieke
  tablet. Dat is niet te automatiseren en wordt in de PR als open punt
  vermeld.
- `db:test` en `check:rls`: niet van toepassing, geen databasewijziging.

## Gate-signaal

Voorstel: één e2e-test met viewportmatrix (zie boven) is de gate voor "geen
paginabrede overflow en Uitloggen zichtbaar". Dat vervangt handmatig
herinspecteren. Naam-overlap blijft deels reviewwerk.

## Expliciet buiten scope

- Bartelefoon (<768px) en portal-layout.
- Offline/PWA-uitbreiding.
- Contrastwerk (T12) en dialoograndjes (T05, T06, T11).
- Nieuwe functionaliteit in het mandje of de verkoopdraft (T03).
- Zoek- en categoriegedrag (T07, D3).

## Oorspronkelijke open vragen aan Bram (historie)

1. **Zijpaneel op portret (768px).** (a) Mandje onder de productgrid, vast
   onderaan met totaal en Afrekenen. (b) Smaller paneel rechts (~300px).
   (c) Uitschuifbaar paneel met een mandjeknop. *Aanbeveling: (b) tot
   ~900px breed met compactere regels, omdat de medewerker het mandje dan
   altijd ziet en er geen extra tik nodig is. Is 768px te krap voor (b), dan
   (a).*
2. **Lange namen.** Twee regels in de kaart, daarna afkappen met volledige
   naam in het mandje en de aria-label? Of altijd de volledige naam tonen
   (kaarten van wisselende hoogte)? *Aanbeveling: twee regels.*
3. **Container queries.** Mag `@tailwindcss/container-queries` als
   dependency erbij, of alleen viewportbreakpoints? *Aanbeveling: de
   plugin.*
4. **Volgorde met T03/T07.** Eerst T03 mergen en dan T04, of T04 nu en T03
   daarna?
5. **Matrix.** Is 1280×800 als derde meetpunt goed, en is er een fysiek
   tablet beschikbaar (merk/maat) voor de eindcontrole?
