# Ontwerpsysteem: uitzonderingen met een code, en een voorbeeld per soort

Status: **voorstel**

Vervolg op [ontwerpsysteem.md](ontwerpsysteem.md) (goedgekeurd, gebouwd in
PR #200). Roadmap fase 3, stap 6 (ADR 0025). Raamwerk-extractie volgens
ADR 0025 R9 en "Raamwerk-extractie" in de vorige spec: generiek in code,
projectspecifiek in `systeem.lokaal.json` of een voorbeeldbestand.

## Doel

`check:catalogus` (`scripts/kit/systeem.mjs`) eist voor elk component in
`src/components` een voorbeeld in `VOORBEELDEN`
(`src/app/design/systeem/voorbeelden.tsx`), of een uitzondering. Er zijn nu 13
uitzonderingen, elk met een vrije-tekstreden in `scripts/kit/systeem.lokaal.json`
→ `redenen`. Dat heeft twee zwakke plekken:

1. **Een reden is proza.** De gate controleert alleen of hij niet leeg is. Hij
   zegt niet welke soort uitzondering het is, en ook niet hoe je die soort
   oplost.
2. **Een reden voor een niet-uitzondering gaat door.** Een component dat wel
   een voorbeeld heeft en niet in de baseline staat, mag toch een reden
   hebben. Een unit-test legt dat zelfs vast. De Reviewer noemde dit een zwakke
   plek.

Bram keurde op 2026-10-08 de richting goed:

1. **Vaste codes.** De reden wordt een code uit een generieke lijst in de gate:
   `context`, `data`, `staten` of `schermvullend`. Een toelichting is
   optioneel. De codes en de logica zijn generiek; welk component welke code
   heeft, staat in de lokale config.
2. **Per soort een standaardoplossing**, zodat de lijst krimpt:
   - `staten`: een voorbeeld per staat;
   - `context`: een eigen voorbeeldsoort;
   - `schermvullend`: gekaderd tonen.

   Alleen `data` (de geldflow) blijft een uitzondering.

Aan het eind van deze spec staan er nog 4 uitzonderingen, alle vier `data`. De
andere 9 staan als voorbeeld op `/design/systeem` of in een los venster.

## Betrokken shell(s)

Geen. Dit is gereedschap voor het bouwproces, net als `/design/systeem`. Er
verandert niets in `src/shells/` of `src/features/`, en niets aan de
componenten in `src/components`.

De vensters voor `Overlay` krijgen een `ShellProvider`: modal met
`barCapabilities`, sheet met `portalCapabilities`. Die waarden komen uit
`src/shells/*/capabilities.ts`, zodat een venster niet van de echte shell kan
afwijken. Faalt `check:arch` op die import, dan meldt de Developer dat. Hij
kopieert de waarden niet.

## Datamodel

n.v.t. Er is geen database. Wat hier als datamodel telt, is de configvorm
(zie "Configvorm").

## RPC's

n.v.t. Er komt geen data- of geldpad bij.

De kernbeslissing "geld beweegt alleen via RPC" raakt dit alleen zo: de
geldflow-componenten blijven bewust een `data`-uitzondering. Geen voorbeeld of
venster rendert een geldactie-herstel met nepdata, of roept een `*_once`-RPC of
`usePendingMoneyRequests` aan.

`GeldActieHerstelInhoud` neemt `herstel` als prop, maar rendert via
`BestaandLidContext` toch `useMembers()` (Supabase). Ook daarom blijft hij
`data`.

## Rolzichtbaarheid

n.v.t. Er zijn geen ledendata en geen rollen. De nieuwe vensterroute valt onder
de bestaande poort van `/design` (`designPreviewGate` in `src/middleware.ts`,
die op `/design*` matcht). Er komt geen nieuw toegangsmechanisme.

## Hergebruik & UX-patronen

### Besluiten (Bram, 2026-10-08)

1. **Venster, geen iframe (O1).** Elk `context`- en `schermvullend`-voorbeeld
   krijgt een eigen route: `/design/systeem/venster/[id]`.
   - De route staat onder dezelfde `/design`-poort en is `noindex`.
   - Het is een eigen document met precies één `main` en één `h1`.
   - Playwright fotografeert elk venster apart, met een eigen viewport uit de
     lokale config.
   - De vensters staan niet ingebed op `/design/systeem`.
2. **Interactiestappen in de lokale config (O2 = a).** Een generieke runner
   voert ze uit vóór de screenshot. De componenten blijven ongewijzigd.
3. **Toelichting (O3).** Verplicht bij code `data`, optioneel bij de andere
   codes.
4. **Sectie "Niet op deze pagina" (O4).** Die komt op `/design/systeem`, met
   de resterende uitzonderingen (naam, code, toelichting) en links naar de
   losse vensters.
5. **Drie PR's (O5):**
   1. de gate met codes, plus de sectie "Niet op deze pagina";
   2. de voorbeelden per staat;
   3. de losse vensters en de interactiestappen.

   Zie "Bouw in drie PR's".

### Configvorm (`scripts/kit/systeem.lokaal.json`)

`redenen` vervalt. Er komen drie sleutels bij. `uitzonderingen` komt in PR 1,
`vensters` en `interacties` komen in PR 3.

```json
"vensterRoute": "/design/systeem/venster",
"uitzonderingen": {
  "EerdereGeldActie":         { "code": "data", "toelichting": "leest bewaarde geldverzoeken; geldflow tonen we niet met nepdata" },
  "GeldActieHerstel":         { "code": "data", "toelichting": "leest bewaarde geldverzoeken en leden" },
  "GeldActieHerstelInhoud":   { "code": "data", "toelichting": "onderdeel van GeldActieHerstel; leest leden voor de context" },
  "OnbekendeUitkomstMelding": { "code": "data", "toelichting": "geldflow (onbekend resultaat)" }
},
"vensters": {
  "overlay-modal": { "componenten": ["Overlay", "OverlaySluitKnop"], "breedte": 768, "hoogte": 560 },
  "start-scherm":  { "componenten": ["StartScherm"], "breedte": 768, "hoogte": 560, "eigenLandmark": true }
},
"interacties": [
  { "naam": "lijst-open", "sectie": "lid-zoeker-zoeken",
    "stappen": [ { "typ": "a", "in": { "label": "Zoek lid op naam" } },
                 { "verwacht": { "rol": "listbox", "naam": "Gevonden leden" } } ] },
  { "naam": "weggooien-vraag", "venster": "overlay-onopgeslagen",
    "stappen": [ { "toets": "Escape" },
                 { "verwacht": { "rol": "button", "naam": "Weggooien" } } ] }
]
```

Het blok hierboven is een uittreksel. De volledige lijsten staan in "Vensters"
en "Interacties".

**Wat generiek is en wat lokaal:**

- **Generiek, in `systeem.mjs`:** een geëxporteerde constante `CODES` met de
  vier codes. Per code staan er een omschrijving, de standaardoplossing en of
  een toelichting verplicht is. De validatie van `uitzonderingen`, `vensters`
  en `interacties` hoort hier ook.

  | code | omschrijving | standaardoplossing | toelichting |
  |---|---|---|---|
  | `context` | heeft een provider, overlay of andere omgeving nodig | een los venster | optioneel |
  | `data` | leest echte data; nepdata is bewust niet gewenst | geen: blijft een uitzondering | **verplicht** |
  | `schermvullend` | vult het venster of brengt een eigen landmark mee | een los venster | optioneel |
  | `staten` | staten komen uit eigen state of uit callbacks | een voorbeeld per staat (props of een mock), eventueel met interactiestappen | optioneel |

- **Lokaal, in `systeem.lokaal.json`:** de koppeling component → code en
  toelichting, de vensters en de interacties.
- **Ratchet, in `.kit/baseline.json` → `systeem-zonder-voorbeeld`:** blijft de
  lijst van namen die alleen mag krimpen, en blijft de enige plek die bepaalt
  wát een uitzondering is. `uitzonderingen` moet precies dezelfde namen
  bevatten; de gate dwingt dat af (G3 en G4). Zo kan de pagina
  `uitzonderingen` lezen zonder een tweede bron.
- De `$comment` in `systeem.lokaal.json` gaat over `uitzonderingen`,
  `vensters` en `interacties` in plaats van over `redenen`.

### Gatefouten (`check:catalogus`)

De gate faalt in elk geval hieronder. Het zijn letterlijke meldingen.
`<codes>` staat voor `context, data, schermvullend, staten` (alfabetisch, uit
`CODES`).

**Uitzonderingen (PR 1)**

| # | Situatie | Melding |
|---|---|---|
| G1 | Component zonder voorbeeld, zonder venster en niet in de baseline | `X: staat niet in /design/systeem: voeg een voorbeeld toe in <registerPad> of een venster in systeem.lokaal.json → vensters, of (alleen met Brams akkoord, label gate-wijziging) een uitzondering met een code (<codes>) in systeem.lokaal.json → uitzonderingen`. In PR 1 zonder de vensterzin; die komt erbij in PR 3. |
| G2 | Onbekende code | `X: onbekende code "<code>" in systeem.lokaal.json → uitzonderingen; kies uit: <codes>` |
| G3 | Ontbrekende code: naam in de baseline zonder entry, een entry zonder `code`, of een `code` die geen string is | `X: uitzondering zonder code in systeem.lokaal.json → uitzonderingen; kies uit: <codes>` |
| G4 | Code voor een component dat geen uitzondering is: de entry staat in `uitzonderingen`, de naam niet in de baseline. Dat geldt ook als het component een voorbeeld of venster heeft of niet meer bestaat. Dit dicht de zwakke plek. | `X: staat in systeem.lokaal.json → uitzonderingen maar is geen uitzondering (niet in .kit/baseline.json → <baselineSleutel>) — haal hem weg` |
| G5 | Onbekend veld in een entry (bijvoorbeeld nog `reden`) | `X: onbekend veld "<veld>" in systeem.lokaal.json → uitzonderingen; toegestaan: code, toelichting` |
| G6 | `toelichting` aanwezig maar leeg, alleen witruimte of geen string | `X: lege toelichting in systeem.lokaal.json → uitzonderingen; laat het veld weg of vul het in` |
| G7 | Code `data` zonder `toelichting` (generiek: elke code met "toelichting verplicht" in `CODES`) | `X: code "data" vraagt een toelichting in systeem.lokaal.json → uitzonderingen` |
| G8 | De config heeft nog de sleutel `redenen` | `systeem.lokaal.json: "redenen" is vervangen door "uitzonderingen" (docs/features/ontwerpsysteem-uitzonderingen.md)` |
| G9 | Opgeloste uitzondering: staat in de baseline, maar is gedekt of bestaat niet meer | De ratchet-melding blijft ongewijzigd: `X: staat in .kit/baseline.json → <baselineSleutel> maar is opgelost — draai npm run ratchet:update en commit de daling`. Na de update geeft de achtergebleven entry G4. De naam verdwijnt dus in dezelfde PR uit beide bestanden. |
| G10 | Register-sleutel zonder component | ongewijzigd |

Per naam geeft de gate hooguit één melding uit G2, G3 en G5–G7. G5–G7 komen
pas na een geldige code.

**Vensters (PR 3).** Een component telt als gedekt als het in `VOORBEELDEN`
staat of in de `componenten` van minstens één venster.

| # | Situatie | Melding |
|---|---|---|
| V1 | Een venster noemt een component dat niet bestaat | `<id>: venster noemt X, maar X bestaat niet in <componentenMap> — haal hem weg` |
| V2 | Venster zonder componenten | `<id>: venster zonder componenten in systeem.lokaal.json → vensters` |
| V3 | `breedte` of `hoogte` is geen geheel getal tussen 200 en 2000 | `<id>: breedte en hoogte moeten gehele getallen tussen 200 en 2000 zijn` |
| V4 | Het id is geen kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) | `<id>: venster-id alleen kleine letters, cijfers en streepjes` |
| V5 | Onbekend veld | `<id>: onbekend veld "<veld>" in systeem.lokaal.json → vensters; toegestaan: componenten, breedte, hoogte, eigenLandmark` |

**Interacties (PR 3).** Dit is de statische vorm. Of het doel echt op de
pagina staat, controleert de e2e tijdens het draaien (zie "Interacties").

| # | Situatie | Melding |
|---|---|---|
| I1 | Niet precies één doel: `sectie` of `venster` | `interactie <naam>: kies precies één doel: sectie of venster` |
| I2 | Het venster bestaat niet in `vensters` | `interactie <naam>: venster "<id>" bestaat niet in systeem.lokaal.json → vensters` |
| I3 | `naam` ontbreekt, is geen kebab-case of komt twee keer voor bij hetzelfde doel | `interactie <naam>: naam ontbreekt, is geen kebab-case of is dubbel bij <doel>` |
| I4 | Een stap zonder of met meer dan één actie | `interactie <naam>, stap <n>: kies precies één actie: klik, typ, toets, verwacht` |
| I5 | Ongeldig doelwit | `interactie <naam>, stap <n>: doelwit is precies één van rol (met optioneel naam), label of tekst` |
| I6 | `keer` is geen geheel getal van 1 tot en met 10, `toets` is geen niet-lege string, `typ` is geen string, of `stappen` is leeg | `interactie <naam>, stap <n>: ongeldige waarde voor <veld>` |
| I7 | De laatste stap is geen `verwacht` | `interactie <naam>: eindig met een verwacht-stap, zodat de screenshot pas volgt als de staat er is` |

**API van `systeem.mjs`:**
- `analyseer()` krijgt `uitzonderingen` (en in PR 3 `vensters`) in plaats van
  `redenen`. Hij geeft `uitzonderingProblemen` terug in plaats van
  `redenProblemen`, en blijft puur.
- In PR 3 komt er een pure functie `valideerInteracties(interacties,
  vensters)` bij.
- `CODES` wordt geëxporteerd.
- De beschrijving van `check:catalogus` in `scripts/kit/gates.mjs` (de bron
  van `feiten.mjs`) wordt: "elke component staat als voorbeeld in
  /design/systeem, in een los venster, of is een uitzondering met een code
  (context, data, schermvullend, staten); de uitzonderingslijst staat in de
  ratchet en mag alleen krimpen".

### `staten`: een voorbeeld per staat (PR 2)

Dit worden gewone `Sectie`s in `voorbeelden.tsx`, zonder netwerk. Callbacks
zijn `noop` of een mock. Namen komen uit de vaste voorbeeldnamen die al in
`teksten.ts` staan (Anna de Vries, Bas Jansen, Carla Smit).

| Component | Sectie(s) en statische staten (props) | Interactie (PR 3) |
|---|---|---|
| `OpslaanSectie` | `opslaan-sectie`, met per staat een groep: zonder statusregel; `status={null}`; `onopgeslagen`; `opgeslagen`; `opgeslagen` met `statusTekst`; `pending`; `wachtOpAnder`; `fout`; `chrome={false}`; met `label` (groep) en `kop` | — |
| `NieuwWachtwoordVelden` | `nieuw-wachtwoord-velden`: leeg; deels voldaan; alle regels voldaan en gelijk; mismatch; `readOnly`. Steeds in het witte `Dialoogvlak`. | — |
| `LidZoeker` | `lid-zoeker`: leeg; `loading` met zoekterm; `error` met `errorMessage` (toont `LeesFout`); `ready` met een zoekterm zonder treffer. Daarnaast `lid-zoeker-zoeken`: één lege zoeker voor de interactie. | `lijst-open` in `lid-zoeker-zoeken`: treffers, waaronder één lid onder de laag-saldogrens (€10, `lowBalanceThresholdCents={1000}`) |
| `CodeInvoer` | `code-invoer`: leeg (`tone="light"`) en met `submitLabel` (knop `aria-disabled`). `code-invoer-rail`: leeg (`tone="rail"`). Voor de interacties komen er losse secties bij: `code-invoer-fout` (mock geeft `"invalid_code"`), `code-invoer-bezig` (mock rondt nooit af) en `code-invoer-bevestigen` (`submitLabel`, mock geeft `"invalid_code"`). | `fout`, `bezig`, `klaar` (zie "Interacties") |

Eisen:
- **Eén exemplaar per interactieve sectie.** Een sectie waarop een interactie
  draait, bevat één exemplaar van het component. Anders zijn doelwitten als
  "Cijfer 1" niet uniek.
- **`LidZoeker`:**
  - Elk exemplaar krijgt een eigen `inputId`. De standaard
    `verkoop-member-search` mag maar één keer op de pagina staan, anders meldt
    axe dubbele id's.
  - `lid-zoeker-zoeken` houdt onder het veld ruimte vrij (ongeveer 300px, de
    `max-h` van de lijst). De lijst is `absolute`, en zo valt een open lijst
    binnen de sectie-screenshot.
- **Mocks:** de mock-`onVerifieer` staat in `voorbeelden.tsx`. Er is geen
  Supabase-client en er is geen MFA-API.
- **Koppen:** elke staat staat in een `Groep` met een `h3` uit `teksten.ts`.
- **Zonder runner (PR 2):** de interactiesecties tonen hun ruststaat, met een
  eigen screenshot. Hun interactie-screenshot komt in PR 3.

### Vensters: `context` en `schermvullend` (PR 3)

Elk venster is een eigen document. Daardoor gelden `fixed inset-0`, `inert`,
scrolllock en de focusval van `Overlay` alleen voor dat document. Ook gelden
`min-h-screen`, `100dvh` en het breekpunt `min-[700px]` van `ZijPaneel` voor
de viewport van het venster. Er staat niets van op `/design/systeem`, dus de
pagina houdt één `main`, één `h1` en een bedienbare focusvolgorde.

| Venster-id | `componenten` | Inhoud | Viewport (b×h) | `eigenLandmark` |
|---|---|---|---|---|
| `overlay-modal` | `Overlay`, `OverlaySluitKnop` | bar-shell (modal): titel, beschrijving, inhoud, `OverlaySluitKnop` "Annuleren" + `Knop variant="primair"` | 768×560 | — |
| `overlay-modal-detail` | `Overlay` | `variant="detail"` met `meta` | 768×640 | — |
| `overlay-sheet` | `Overlay` | portal-shell (sheet) | 390×720 | — |
| `overlay-sheet-detail` | `Overlay` | `variant="detail"` in de sheet (de kop scrollt mee) | 390×720 | — |
| `overlay-bezig` | `Overlay` | `closeBlocked`: `aria-busy`, eigen knoppen `disabled` | 768×560 | — |
| `overlay-onopgeslagen` | `Overlay`, `OverlaySluitKnop` | `onopgeslagen` | 768×560 | — |
| `overlay-sluit-knop` | `OverlaySluitKnop` | `OverlaySluitKnop` in `secundair` (standaard), `tekst` en `maat="groot"` | 768×560 | — |
| `overlay-presence-provider` | `OverlayPresenceProvider` | provider om een `Overlay`. In de dialoog staat de teller (`useOpenOverlayCount()`): "Open overlays onder deze provider: 1" | 768×560 | — |
| `start-scherm` | `StartScherm` | `StartScherm` met `AuroraMerk tone="dark"` en een `h1` | 768×560 | ja |
| `zij-paneel` | `ZijPaneel` | een rij met een inhoudsvlak en `ZijPaneel as="aside"`; vanaf 700px is het paneel 300 tot 372px breed | 900×560 | — |
| `zij-paneel-smal` | `ZijPaneel` | dezelfde inhoud onder 700px: volle breedte, hoogte `max(32rem, 100dvh)` | 600×640 | — |

**Eén `main` en één `h1` per venster:**
- **Zonder `eigenLandmark`:** de vensterpagina rendert
  `<main><h1 class="sr-only">…</h1>{inhoud}</main>`.
  - De `h1` is visueel verborgen, met de vensternaam uit `teksten.ts`.
  - Achter de backdrop van een overlay staat dus geen zichtbare, gedimde tekst
    die axe op contrast kan meten.
  - De overlay rendert in de `main`. `acquireOverlay` maakt de `h1` als
    sibling `inert`; dat is bedoeld.
- **Met `eigenLandmark: true`** (`StartScherm`): de pagina rendert alleen de
  inhoud. Het voorbeeld levert zelf de ene `main` (van `StartScherm`) en de
  ene `h1` (onder `AuroraMerk`).

Verder:
- **De teller van de provider** staat ín de dialoog, niet erachter.
- **`onClose` is een noop**, dus Escape en de backdrop sluiten het voorbeeld
  niet.

**Generiek en lokaal:**

| Onderdeel | Generiek (`// kit: generiek`) | ABAS (lokaal) |
|---|---|---|
| Vensterschil | `src/lib/systeem/SysteemVenster.tsx`: rendert `main` met een `sr-only` `h1`, of, bij `eigenLandmark`, alleen de inhoud | — |
| Ids, viewport, dekking | het formaat van `vensters` en de validatie (V1–V5) in `systeem.mjs` | `systeem.lokaal.json` → `vensters`, `vensterRoute` |
| Route | — | `src/app/design/systeem/venster/[id]/page.tsx`: `force-static`, `generateStaticParams` uit de sleutels van `vensters` (de pagina leest `systeem.lokaal.json` al), `dynamicParams = false` (een onbekend id geeft 404), `robots: noindex`, een `<title>` per venster |
| Inhoud | type `Vensterregister` in `src/lib/systeem/types.ts` | `src/app/design/systeem/vensters.tsx` (client): `VENSTERS`, getypt als `Record<keyof typeof systeem.vensters, () => ReactNode>`. Een ontbrekend of extra id faalt in `typecheck`. |
| Teksten | — | `teksten.ts`: `VENSTER_TEKSTEN`, getypt op dezelfde sleutels (vensternaam voor `h1` en `<title>`, plus de voorbeeldinhoud) |

De vensterlijst (ids, viewport, welke componenten) staat dus maar één keer in
`systeem.lokaal.json`. De gate, de route, de e2e en de sectie "Niet op deze
pagina" lezen haar daar.

### Interacties (PR 3)

**Vorm van een interactie:**

```
{ "naam": "<kebab>", "sectie": "<data-systeem-id>" | "venster": "<venster-id>",
  "stappen": [ <stap>, … ] }
```

**Stappen.** Elke stap heeft precies één actie:

| Actie | Vorm | Uitvoering (Playwright) |
|---|---|---|
| `klik` | `{ "klik": <doelwit>, "keer"?: 1–10 }` | `locator.click()`, `keer` maal |
| `typ` | `{ "typ": "<tekst>", "in": <doelwit> }` | `locator.fill(tekst)` |
| `toets` | `{ "toets": "<Playwright-toetsnaam>", "keer"?: 1–10 }` | `page.keyboard.press()`, op het element dat nu de focus heeft |
| `verwacht` | `{ "verwacht": <doelwit>, "staat"?: "zichtbaar" \| "uitgeschakeld" }` (standaard `zichtbaar`) | `expect(locator).toBeVisible()` of `toBeDisabled()` |

**Doelwit:** precies één van de volgende.
- `{ "rol": "<ARIA-rol>", "naam"?: "<toegankelijke naam>" }` →
  `getByRole(rol, { name, exact: true })`
- `{ "label": "<tekst>" }` → `getByLabel(tekst, { exact: true })`
- `{ "tekst": "<tekst>" }` → `getByText(tekst, { exact: true })`

Er zijn bewust geen CSS-selectors. Doelwitten lopen via rol, naam en label,
zoals een gebruiker of een schermlezer ze vindt. Daardoor blijft de runner
generiek en botst hij niet op klassen.

**Bereik:**
- Bij `sectie` zoekt de runner binnen `[data-systeem="<id>"]`.
- Bij `venster` zoekt hij in het hele document.

**Uitvoering (generiek, in `e2e/systeem.spec.ts`):**
- **Eén test per interactie**, met de titel `interactie <doel>/<naam>`. Elke
  test laadt de pagina of het venster vers. Een falende interactie laat de
  andere dus doorlopen.
- **Voorbereiding:** de runner zet de viewport van het venster (bij een
  venster) en wacht op `document.fonts.ready`. Daarna voert hij de stappen in
  volgorde uit, elke stap met een time-out van 5 s.
- **Screenshot na de laatste stap** (altijd een `verwacht`, I7):
  - bij een sectie de sectie zelf, als `<sectie>-<naam>.png`;
  - bij een venster de viewport, als `venster-<id>-<naam>.png`.

**Foutgedrag:**
- **Statisch:** een ongeldige vorm faalt al in `check:catalogus` (I1–I7),
  dus al in de pre-commit.
- **Tijdens het draaien faalt de test met een melding die de interactie en de
  stap noemt:**
  - de sectie bestaat niet op de pagina: `interactie <naam>: sectie "<id>"
    staat niet op <route>`;
  - een doelwit vindt 0 of meer dan 1 element (Playwright strict mode): de
    melding begint met `interactie <naam>, stap <n> (<actie>):`;
  - `verwacht` wordt niet waar binnen 5 s: zelfde voorvoegsel.
- **Geen soft-asserts en geen retries in de runner.** De `retries` van
  `playwright.config.ts` (1 in CI) blijven gelden.

**Interacties in PR 3:**

| Doel | Naam | Stappen |
|---|---|---|
| sectie `lid-zoeker-zoeken` | `lijst-open` | `typ "a"` in label "Zoek lid op naam"; `verwacht` rol `listbox`, naam "Gevonden leden" |
| sectie `code-invoer-fout` | `fout` | `klik` rol `button`, naam "Cijfer 1", `keer: 6`; `verwacht` de foutmelding (rol en naam volgens de markup van `PinToetsenbord`) |
| sectie `code-invoer-bezig` | `bezig` | `klik` "Cijfer 1" ×6; `verwacht` "Cijfer 2" met staat `uitgeschakeld` |
| sectie `code-invoer-bevestigen` | `klaar` | `klik` "Cijfer 1" ×6; `verwacht` de bevestigknop zichtbaar. Bruikbaar is niet te toetsen, want hij gebruikt `aria-disabled`; het verschil zit in de screenshot. |
| venster `overlay-bezig` | `melding` | `toets "Escape"`; `verwacht` tekst "Even wachten, de actie wordt nog verwerkt." |
| venster `overlay-onopgeslagen` | `weggooien-vraag` | `toets "Escape"`; `verwacht` rol `button`, naam "Weggooien" |

Teksten die uit een component of `src/lib` komen ("Gevonden leden",
"Weggooien", de `closeBlocked`-melding) staan letterlijk in de config. Wijzigt
zo'n tekst, dan faalt de e2e. Dat is bedoeld: de config is testinvoer.

### Sectie "Niet op deze pagina" (PR 1; links in PR 3)

Dit is een sectie op `/design/systeem` met `data-systeem="niet-op-deze-pagina"`.
Ze staat als laatste, na de voorbeelden.

**Bron, zonder tweede bron:**
- `page.tsx` leest `systeem.lokaal.json`, wat het al doet voor `themaPad`.
  Daaruit komen `uitzonderingen` en (vanaf PR 3) `vensters` en `vensterRoute`.
- Dat `uitzonderingen` gelijk is aan de baseline, dwingt de gate af (G3/G4).
  De pagina hoeft `.kit/baseline.json` dus niet te lezen.
- Codes worden als code getoond. De omschrijving uit `CODES` staat niet op de
  pagina, want de pagina importeert geen `scripts/kit/*.mjs`.

**Generiek:** `src/lib/systeem/NietOpDezePagina.tsx` (`// kit: generiek`)
krijgt via props:
- de uitzonderingen;
- de vensters met hun href (`<vensterRoute>/<id>`);
- de teksten.

Het component rendert:
- **een tabel** (`caption` sr-only) met de kolommen Component, Code en
  Toelichting, alfabetisch op naam. Een lege toelichting wordt "—".
- **een lijst "Losse vensters"**: per venster een gewone link (`<a>`, de
  vensternaam) met de componenten erachter, in de volgorde van de config. Het
  generieke component kent `Knop` niet; de link heeft een onderstreping en een
  zichtbare focus.

**Copy (`teksten.ts`, letterlijk):**
- Titel: "Niet op deze pagina"
- Uitleg: "Deze componenten staan hier niet. Uitzonderingen hebben een code en
  zijn bewust niet getoond; de componenten met een los venster staan elk in een
  eigen document."
- Kolommen: "Component", "Code", "Toelichting"
- Kop van de vensterlijst: "Losse vensters"
- Geen uitzonderingen: "Er zijn geen uitzonderingen: elke component staat
  hier of in een los venster."
- Geen vensters (PR 1 en PR 2): de lijst en haar kop worden niet gerenderd.

### Screenshots

- **Bestaande PNG's veranderen niet.** De screenshots zijn per element, en de
  nieuwe secties komen erna.
- **PR 1:** `niet-op-deze-pagina.png` (13 rijen).
- **PR 2:**
  - nieuw: `opslaan-sectie`, `nieuw-wachtwoord-velden`, `lid-zoeker`,
    `lid-zoeker-zoeken`, `code-invoer`, `code-invoer-rail`,
    `code-invoer-fout`, `code-invoer-bezig` en `code-invoer-bevestigen`.
    Waar de sectie een bruikbare knop of een focusbaar element heeft, komen
    `-hover`/`-focus` erbij; dat bepaalt de generieke test.
  - `niet-op-deze-pagina.png` verandert (9 rijen).
- **PR 3:**
  - per venster `venster-<id>.png` (11);
  - per interactie de PNG van de runner (6);
  - `niet-op-deze-pagina.png` verandert (4 rijen plus de vensterlijst), en
    krijgt `niet-op-deze-pagina-focus.png` (de eerste link).
- **Geen hover- of focus-screenshots per venster.** Dat valt buiten scope.
- **Baselines** komen alleen uit de workflow `screenshots-bijwerken`. Die
  draait `e2e/systeem.spec.ts`; omdat de venstertests in dat bestand staan,
  verandert de workflow niet. De time-outs van 180 s mogen omhoog als het
  aantal secties dat vraagt.

### Staten, copy, toon, toegankelijkheid

- **Staten:** zie de tabellen hierboven. De pagina en de vensters laden
  statisch; er zijn geen laad- of pending-staten van de pagina zelf.
- **Copy:**
  - Alle paginateksten staan in `teksten.ts`: titels, uitleg, de `h3` per
    staat, vensternamen, voorbeeldinhoud en "Niet op deze pagina".
  - Componentteksten komen uit de component of `src/lib` en worden niet
    herhaald.
  - De Developer schrijft de sectieteksten in de stijl van de bestaande:
    Nederlands en kort, met de props bij naam (bijvoorbeeld "Props: pending,
    wachtOpAnder, fout, status, chrome").
  - Een vensternaam noemt het component en de staat, bijvoorbeeld "Overlay
    als modal".
- **Toon en shell:**
  - `CodeInvoer tone="rail"` staat in een rail-sectie.
  - `NieuwWachtwoordVelden` en `OpslaanSectie` staan in `Dialoogvlak`.
  - De overlay-vensters zetten een `ShellProvider`. `/design/systeem` zelf
    leest `useShell()` niet.
- **Toegankelijkheid:**
  - De pagina houdt één `main` en één `h1`, en elk venster ook (de e2e toetst
    dat).
  - Elk venster heeft `lang="nl"` (root-layout) en een eigen `<title>`.
  - Per venster draait een axe-scan met dezelfde tags als op de pagina.
  - De links in "Niet op deze pagina" hebben een zichtbare focus.

### Bouw in drie PR's

Elke PR raakt `scripts/kit/` en/of `.kit/` en/of bestaande tests, dus elke PR
krijgt het label `gate-wijziging`. Alleen Bram zet dat.

**PR 1: gate met codes, plus "Niet op deze pagina"**

| Rol | Bestanden |
|---|---|
| Hoofdsessie | `scripts/kit/systeem.mjs`: `CODES` en G1–G8 voor `uitzonderingen`. `scripts/kit/systeem.lokaal.json`: `redenen` → `uitzonderingen` voor alle 13. De codes zijn `staten` voor `CodeInvoer`, `LidZoeker`, `NieuwWachtwoordVelden` en `OpslaanSectie`; `context` voor `Overlay`, `OverlayPresenceProvider` en `OverlaySluitKnop`; `schermvullend` voor `StartScherm` en `ZijPaneel`; `data` met toelichting voor de vier geldcomponenten. De bestaande redenen worden de toelichting. `scripts/kit/gates.mjs`: de beschrijving. |
| Developer | `src/lib/systeem/NietOpDezePagina.tsx`, de aanroep in `page.tsx`, de teksten in `teksten.ts` |
| Tester | `test/systeemCatalogus.test.ts` (zie Tests) |

Na PR 1 houdt de ratchet `systeem-zonder-voorbeeld` 13 namen, en
`uitzonderingen` ook 13.

**PR 2: voorbeelden per staat**

| Rol | Bestanden |
|---|---|
| Developer | `voorbeelden.tsx` en `teksten.ts`: de vier componenten met hun secties, inclusief de vier interactiesecties in ruststaat |
| Hoofdsessie | `.kit/baseline.json` (`npm run ratchet:update`); in `systeem.lokaal.json` gaan de vier `staten`-entries weg uit `uitzonderingen` |
| Tester | niets verplicht; de generieke e2e dekt de nieuwe secties |

Na PR 2 staan er 9 namen in de ratchet.

**PR 3: losse vensters en interactiestappen**

| Rol | Bestanden |
|---|---|
| Hoofdsessie | `scripts/kit/systeem.mjs`: dekking via `vensters`, V1–V5, `valideerInteracties` met I1–I7, en de vensterzin in G1. `systeem.lokaal.json`: `vensterRoute`, `vensters`, `interacties`. Daarnaast gaan de vijf `context`/`schermvullend`-entries weg uit `uitzonderingen`. `.kit/baseline.json` (`ratchet:update`). |
| Developer | `src/lib/systeem/SysteemVenster.tsx`, `types.ts` (`Vensterregister`), `src/app/design/systeem/venster/[id]/page.tsx`, `vensters.tsx`, `teksten.ts` (`VENSTER_TEKSTEN`). In `NietOpDezePagina` komen de vensterlinks erbij. Lukt een staat niet zonder componentwijziging, dan meldt hij dat en kiest hij niet zelf. |
| Tester | `e2e/systeem.spec.ts` (de venstertests en de runner); `test/systeemCatalogus.test.ts` (V- en I-tests). De Tester stelt de exacte doelwitten van de interacties voor (zie O-nieuw-1); de hoofdsessie zet ze in de config. |

Na PR 3 staan er 4 namen in de ratchet, alle vier `data`.

## Randgevallen

| Situatie | Gedrag | Foutcode/tekst |
|---|---|---|
| Nieuw component zonder voorbeeld of venster | gate faalt | G1 |
| Uitzondering met een verzonnen code (`geld`) | gate faalt | G2 |
| Naam toegevoegd aan de baseline, niet aan `uitzonderingen` | gate faalt | G3 |
| `uitzonderingen` noemt een component met voorbeeld of venster, of een verdwenen component buiten de baseline | gate faalt | G4 |
| Oude vorm `{ "reden": "…" }` of de sleutel `redenen` | gate faalt | G5 / G8 |
| `"toelichting": "  "` | gate faalt | G6 |
| `{ "code": "data" }` zonder toelichting | gate faalt | G7 |
| Voorbeeld toegevoegd, baseline nog niet bijgewerkt | gate faalt via de ratchet; na `ratchet:update` geeft hij G4 tot de entry weg is | G9, daarna G4 |
| Venster noemt een hernoemd of verwijderd component | gate faalt | V1 |
| Venster-id in de config zonder inhoud in `VENSTERS`, of andersom | `typecheck` faalt | — |
| Vensterroute met een onbekend id | 404 (`dynamicParams = false`) | — |
| Vensterroute zonder Basic-auth | 401 (dezelfde poort als `/design`) | — |
| Venster zonder `eigenLandmark` waarvan de inhoud toch een `main` of `h1` heeft | e2e faalt op "één main en één h1" | — |
| Interactie met een doelwit dat 2 elementen vindt | e2e faalt (strict) | `interactie <naam>, stap <n> (klik): …` |
| Interactie op een sectie die niet (meer) bestaat | e2e faalt | `interactie <naam>: sectie "<id>" staat niet op /design/systeem` |
| Een componenttekst in een `verwacht` is gewijzigd | e2e faalt; de hoofdsessie werkt de config bij | `interactie <naam>, stap <n> (verwacht): …` |
| Interactie zonder afsluitende `verwacht` | gate faalt | I7 |
| Twee `LidZoeker`s met de standaard-`inputId` | axe faalt op dubbele id's | voorkomen met een eigen `inputId` per exemplaar |
| De open lijst van `LidZoeker` valt buiten de sectie | de screenshot mist de lijst | voorkomen met vrije ruimte onder het veld |
| Geen uitzonderingen meer over | "Niet op deze pagina" toont de lege tekst | "Er zijn geen uitzonderingen: …" |

## Tests

**Unit (`test/systeemCatalogus.test.ts`, Tester)**

PR 1:
- `CODES` bevat precies `context`, `data`, `schermvullend` en `staten`, elk
  met een niet-lege omschrijving en oplossing. Alleen bij `data` is de
  toelichting verplicht.
- `analyseer`:
  - een geldige code, met en zonder toelichting (niet-`data`), geeft geen
    probleem;
  - G2;
  - G3 in drie vormen (geen entry, geen `code`, `code` geen string);
  - G4 voor een component met voorbeeld;
  - G4 voor een niet-bestaande naam buiten de baseline;
  - G5, G6 en G7;
  - hooguit één melding per naam.
- **Omkeren en vervangen:** de test "reden voor een bestaande component (geen
  uitzondering) is geen probleem" draait om naar G4. De tests op `redenen`
  gaan naar `uitzonderingen`.
- `draai(root)` end-to-end:
  - geslaagd;
  - G8 bij `redenen`;
  - de ratchet-melding bij een opgeloste uitzondering, en daarna G4 met een
    bijgewerkte baseline.

PR 3:
- dekking via een venster (geen G1);
- V1–V5;
- `valideerInteracties`: een geldige interactie, en I1–I7 elk apart;
- `draai` met een component dat alleen in een venster staat.

**e2e (`e2e/systeem.spec.ts`, Tester, generiek, zonder componentnamen)**

- **PR 1:** geen nieuwe test. De nieuwe sectie valt onder de bestaande
  screenshot-, focus- en axe-tests.
- **PR 3:** de config wordt bij het laden gelezen, zoals nu.
  - Per venster één test: viewport uit de config, `goto(<vensterRoute>/<id>)`,
    `document.fonts.ready`, één `main` en één `h1`, de axe-scan (dezelfde
    tags) en de screenshot `venster-<id>.png`.
  - Per interactie één test, volgens "Interacties".
  - De vensterroute geeft zonder inloggegevens 401, en een onbekend id geeft
    404.
- De bestaande tests blijven ongewijzigd.

**Ratchet:** `systeem-zonder-voorbeeld` daalt van 13 (PR 1) naar 9 (PR 2) en
naar 4 (PR 3).

## Open vragen voor Bram

- **O-nieuw-1. Wie schrijft de interacties?** `interacties` staat in
  `systeem.lokaal.json`, een gatebestand; alleen de hoofdsessie schrijft
  daar. Inhoudelijk zijn het testgevallen, het domein van de Tester. Dit
  voorstel: de Tester levert ze aan in de PR-beschrijving en de hoofdsessie
  zet ze in de config. De andere optie is een eigen bestand
  `e2e/systeem.interacties.json`, dat de Tester mag schrijven. Dan leest de
  gate dat bestand voor I1–I7, en staat het buiten de gatepaden; elke
  wijziging zonder label is dan mogelijk.
- **O-nieuw-2. Mag een interactie het venster sluiten?** Nu is `onClose` een
  noop, dus een interactie kan de "na sluiten"-staat (focusherstel) niet tonen.
  Dit voorstel: nee, buiten scope. Bevestigen.

## Expliciet buiten scope / vervolg

- De vier `data`-uitzonderingen (`EerdereGeldActie`, `GeldActieHerstel`,
  `GeldActieHerstelInhoud`, `OnbekendeUitkomstMelding`). Die blijven, bewust.
- Wijzigingen aan componenten in `src/components`.
- Hover- en focus-screenshots per venster, en acties buiten `klik`, `typ`,
  `toets` en `verwacht` (slepen, hover-stappen, CSS-selectors).
- De extractie zelf naar een los raamwerk (roadmap fase 4). Deze spec houdt
  alleen de scheiding generiek/lokaal aan. Daarbij komen
  `SysteemVenster.tsx`, `NietOpDezePagina.tsx` en de runner op de
  extractielijst uit de tabel in ontwerpsysteem.md.
- **Vervolg, gesignaleerd:**
  - **Gate voor `// kit: generiek`.** "Een bestand met `// kit: generiek`
    noemt geen ABAS-component of ABAS-pad" is nu een afspraak voor de
    Reviewer. Een script kan het controleren: de namen uit `componentNamen()`
    over de `componentenMap`, plus `src/app/`-paden, mogen niet voorkomen in
    die bestanden. Deze spec voegt generieke bestanden toe en breidt er een
    paar uit. Dat verdient een gate, geen zin in CLAUDE.md.
  - **`.claude/rules/ui.md`** noemt `/design/systeem` met screenshots nog als
    "besloten maar nog niet gebouwd". De hoofdsessie werkt dat bij
    (`.claude/` is een gatepad).
  - **`docs/features/ontwerpsysteem.md`** staat op `goedgekeurd`, maar is
    gebouwd in PR #200. Docs zet `gebouwd` en verwijst bij
    "Uitzonderingslijst" naar deze spec.
