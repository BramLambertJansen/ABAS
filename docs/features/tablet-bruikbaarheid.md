# Bar en beheer bruikbaar op ondersteunde tablets

**Status: concept, wacht op akkoord van Bram.** Besluit D1 is genomen
(aanbeveling): 768px portret én 1024px landschap worden ondersteund. De open
vragen onderaan zijn aan Bram; tot hij ze beantwoordt kiest de Developer niets.

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

Nee, tenzij vraag 3 (nieuwe dependency) of een wijziging aan `useShell()`
(`columns` verwijderen) als architectuurkeuze telt; dat beslist Bram.

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

## Open vragen aan Bram (de Developer wacht hierop)

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
