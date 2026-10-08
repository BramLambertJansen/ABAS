# Ontwerpsysteem: uitzonderingen met een code, en een voorbeeld per soort

Status: **voorstel**

Vervolg op [ontwerpsysteem.md](ontwerpsysteem.md) (goedgekeurd, gebouwd in
PR #200). Roadmap fase 3, stap 6 (ADR 0025). Raamwerk-extractie volgens
ADR 0025 R9 en "Raamwerk-extractie" in de vorige spec.

## Doel

`check:catalogus` (`scripts/kit/systeem.mjs`) eist voor elk component in
`src/components` een voorbeeld in `VOORBEELDEN`
(`src/app/design/systeem/voorbeelden.tsx`), of een uitzondering. Er zijn nu 13
uitzonderingen. Elke uitzondering heeft een vrije-tekstreden in
`scripts/kit/systeem.lokaal.json` → `redenen`. Dat heeft twee zwakke plekken:

1. Een reden is proza. De gate controleert alleen of hij niet leeg is. Er is
   geen vaste plek voor de vraag welke soort uitzondering het is en hoe die
   soort wordt opgelost.
2. Een reden voor een component dat géén uitzondering is (wel een voorbeeld,
   niet in de baseline), laat de gate door. Een unit-test legt dat nu zelfs
   vast. De Reviewer noemde dit een zwakke plek.

Bram keurde op 2026-10-08 de richting goed:

1. **Vaste codes.** De reden wordt een code uit een generieke lijst in de gate:
   `context`, `data`, `staten`, `schermvullend`. Een toelichting mag erbij,
   maar hoeft niet. De codes en de logica zijn generiek (`// kit: generiek`).
   Welk component welke code heeft, staat in de lokale config.
2. **Per soort een standaardoplossing**, zodat de lijst krimpt:
   - `staten`: een voorbeeld per staat (props of een mock);
   - `context`: een eigen voorbeeldsoort, modal of sheet in een kader;
   - `schermvullend`: gekaderd tonen.

   Alleen `data` (geldflow) blijft een uitzondering.

Na deze spec staan er nog 4 uitzonderingen, allemaal `data`. De andere 9
staan als voorbeeld op `/design/systeem`.

## Betrokken shell(s)

Geen. Dit is gereedschap voor het bouwproces, net als `/design/systeem`. Er
verandert niets in `src/shells/` of `src/features/`, en ook niets aan de 13
componenten in `src/components`. De kaders voor `Overlay` krijgen een
`ShellProvider` met `barCapabilities` (modal) of `portalCapabilities` (sheet).
Die waarden importeren we uit `src/shells/*/capabilities.ts`, zodat een kader
niet kan afwijken van de echte shell. Faalt `check:arch` op die import, dan
meldt de Developer dat. Hij kopieert de waarden niet.

## Datamodel

n.v.t. Geen database. De "datamodellen" van deze spec zijn de configvorm
(onder "Configvorm") en de registers (onder "Kaders").

## RPC's

n.v.t. Er komt geen data- of geldpad bij. Dit raakt de kernbeslissing "geld
beweegt alleen via RPC" alleen zo: de geldflow-componenten blijven bewust een
`data`-uitzondering. De ontwerpsysteempagina rendert dus nooit een
geldactie-herstel met nepdata. Er staat geen component op de pagina dat een
`*_once`-RPC of `usePendingMoneyRequests` aanroept. `GeldActieHerstelInhoud`
neemt `herstel` als prop, maar rendert via `BestaandLidContext` toch
`useMembers()` (Supabase). Ook om die reden blijft hij `data`.

## Rolzichtbaarheid

n.v.t. Geen ledendata en geen rollen. De nieuwe kaderroute valt onder de
bestaande poort van `/design` (`designPreviewGate` in `src/middleware.ts`,
matcht op `/design*`). Er komt geen nieuw toegangsmechanisme.

## Hergebruik & UX-patronen

### Configvorm (`scripts/kit/systeem.lokaal.json`)

`redenen` vervalt. Daarvoor in de plaats komt `uitzonderingen`: een object van
componentnaam naar `{ code, toelichting? }`.

```json
"uitzonderingen": {
  "EerdereGeldActie":         { "code": "data", "toelichting": "leest bewaarde geldverzoeken; geldflow tonen we niet met nepdata" },
  "GeldActieHerstel":         { "code": "data", "toelichting": "leest bewaarde geldverzoeken en leden" },
  "GeldActieHerstelInhoud":   { "code": "data", "toelichting": "onderdeel van GeldActieHerstel; leest leden voor de context" },
  "OnbekendeUitkomstMelding": { "code": "data", "toelichting": "geldflow (onbekend resultaat)" }
}
```

- **Generiek (in `systeem.mjs`):** een geëxporteerde constante `CODES` met de
  vier codes. Per code staan er een korte omschrijving en de standaardoplossing
  bij. De gate gebruikt die in de foutmeldingen.

  | code | omschrijving | standaardoplossing |
  |---|---|---|
  | `context` | heeft een provider, overlay of andere omgeving nodig | eigen voorbeeldsoort in een kader |
  | `data` | leest echte data; nepdata is bewust niet gewenst | geen: blijft een uitzondering |
  | `schermvullend` | vult het venster of heeft een eigen landmark | gekaderd tonen |
  | `staten` | staten komen uit eigen state of uit callbacks | een voorbeeld per staat (props, mock) |

- **Lokaal (in `systeem.lokaal.json`):** alleen de koppeling component → code
  (+ toelichting).
- **Ratchet (`.kit/baseline.json` → `systeem-zonder-voorbeeld`):** blijft de
  lijst van namen die mag krimpen. Het is ongewijzigd de enige plek die bepaalt
  wát een uitzondering is. `uitzonderingen` moet precies dezelfde namen hebben.
- De `$comment` in `systeem.lokaal.json` gaat over `uitzonderingen` in plaats
  van `redenen`.

### Gatefouten (`check:catalogus`)

De gate faalt op elk geval hieronder. De teksten zijn letterlijk, `X` is de
componentnaam en `<codes>` is `context, data, schermvullend, staten`
(alfabetisch, uit `CODES`).

| # | Situatie | Melding |
|---|---|---|
| G1 | Component zonder voorbeeld en niet in de baseline | `X: staat niet in /design/systeem: voeg een voorbeeld toe in <registerPad>, of (alleen met Brams akkoord, label gate-wijziging) een uitzondering met een code (<codes>) in systeem.lokaal.json → uitzonderingen` |
| G2 | Onbekende code | `X: onbekende code "<code>" in systeem.lokaal.json → uitzonderingen; kies uit: <codes>` |
| G3 | Ontbrekende code: naam in de baseline zonder entry, entry zonder `code`, of `code` geen string | `X: uitzondering zonder code in systeem.lokaal.json → uitzonderingen; kies uit: <codes>` |
| G4 | Code voor een component dat geen uitzondering is (entry in `uitzonderingen`, naam niet in de baseline). Geldt ook als het component een voorbeeld heeft of niet meer bestaat. **Dit dicht de zwakke plek.** | `X: staat in systeem.lokaal.json → uitzonderingen maar is geen uitzondering (niet in .kit/baseline.json → <baselineSleutel>) — haal hem weg` |
| G5 | Onbekend veld in een entry (bv. nog `reden`) | `X: onbekend veld "<veld>" in systeem.lokaal.json → uitzonderingen; toegestaan: code, toelichting` |
| G6 | `toelichting` aanwezig maar leeg of alleen witruimte | `X: lege toelichting in systeem.lokaal.json → uitzonderingen; laat het veld weg of vul het in` |
| G7 | De config heeft nog de sleutel `redenen` | `systeem.lokaal.json: "redenen" is vervangen door "uitzonderingen" (docs/features/ontwerpsysteem-uitzonderingen.md)` |
| G8 | Uitzondering is opgelost (in de baseline, maar wel een voorbeeld of geen component meer) | ongewijzigd (ratchet): `X: staat in .kit/baseline.json → <baselineSleutel> maar is opgelost — draai npm run ratchet:update en commit de daling`. Na de update geeft de achtergebleven entry G4, dus beide bestanden gaan in dezelfde PR omlaag. |
| G9 | Register-sleutel zonder component | ongewijzigd |

G4 en G3 samen eisen dat de namen in `uitzonderingen` en in de baseline
precies gelijk zijn. De gate geeft per naam hooguit één melding uit G2, G3,
G5 en G6. G5 en G6 komen pas na een geldige code.

`analyseer()` krijgt `uitzonderingen` in plaats van `redenen` en geeft
`uitzonderingProblemen` terug in plaats van `redenProblemen`. De functie blijft
puur. `CODES` wordt geëxporteerd voor de tests. De beschrijving van
`check:catalogus` in `scripts/kit/gates.mjs` (bron van `feiten.mjs`) verandert
van "uitzondering met reden" naar "uitzondering met een code (`context`,
`data`, `schermvullend`, `staten`)".

### De oplossing per soort

#### `staten`: een voorbeeld per staat (gewone sectie, props en mocks)

Gewone `Sectie`s in `voorbeelden.tsx`, zoals de bestaande. Er is geen netwerk;
callbacks zijn `noop` of een mock. De namen komen uit de vaste voorbeeldnamen
die al in `teksten.ts` staan (Anna de Vries, Bas Jansen, Carla Smit).

| Component | Statische voorbeelden (props) | Alleen via interactie (zie open vraag O2) |
|---|---|---|
| `OpslaanSectie` | zonder statusregel; `status={null}`; `onopgeslagen`; `opgeslagen`; `opgeslagen` met `statusTekst`; `pending`; `wachtOpAnder`; `fout`; `chrome={false}`; met `label` (groep) en `kop` | — |
| `NieuwWachtwoordVelden` | leeg; deels voldaan; alle regels voldaan en gelijk; mismatch (herhaling wijkt af); `readOnly`. Steeds in het witte `Dialoogvlak` (de component is `tone="light"`). | — |
| `LidZoeker` | leeg; `status="loading"` met zoekterm ("Leden laden…"); `status="error"` met `errorMessage` (toont `LeesFout`); `ready` met zoekterm zonder treffer ("geen leden gevonden") | lijst open met treffers, waaronder één lid onder de laag-saldogrens (€10, `lowBalanceThresholdCents={1000}`, met de ⚠-markering) |
| `CodeInvoer` | leeg, `tone="light"` en `tone="rail"` (rail-sectie); met `submitLabel` (knop `aria-disabled`) | fout (mock `onVerifieer` geeft `"invalid_code"`); bezig (mock die nooit afrondt); met `submitLabel` na zes cijfers (knop bruikbaar) |

Eisen:
- **`LidZoeker`:** elk exemplaar krijgt een eigen `inputId`. De standaard
  `verkoop-member-search` mag maar één keer op de pagina staan, anders geeft
  axe dubbele id's. De lijst is `absolute`. De sectie houdt daarom ruimte vrij
  onder het veld (ongeveer 300px, de `max-h` van de lijst), zodat een open
  lijst binnen de sectie-screenshot valt.
- **`CodeInvoer`:** de mock `onVerifieer` staat in `voorbeelden.tsx`, niet in
  `src/lib/mfa`. Er is geen Supabase-client of MFA-API.
- Elke staat staat in een `Groep` met een `h3` uit `teksten.ts`.

#### `context`: eigen voorbeeldsoort "kader" (iframe)

`Overlay` is `fixed inset-0`. Bij het openen zet hij `inert` op alle siblings
tot `body`, legt hij de scroll van het document vast, trekt hij de focus naar
zich toe (`focusin`) en vangt hij Tab en Escape op het hele document af. Op
een gewone sectie kan dat niet: één open overlay maakt de rest van de pagina
onbedienbaar voor axe en voor de hover- en focustests. Twee overlays tegelijk
zijn verboden (ADR 0014). Een `transform`-container lost alleen de positie op,
niet `inert`, de focus of de scrolllock.

Daarom komt er een **kader**: een `iframe` met een eigen document. Daarin
gelden `fixed`, `inert`, scrolllock en focusval alleen voor dat document. Zie
hieronder onder "Kaders" voor de mechaniek. Kaders:

| Kader-id | Inhoud | Venster (b×h) |
|---|---|---|
| `overlay-modal` | `Overlay` (bar-shell, modal) met titel, beschrijving, wat inhoud en `OverlaySluitKnop` "Annuleren" + `Knop variant="primair"` | 768×560 |
| `overlay-modal-detail` | `variant="detail"` met `meta` | 768×640 |
| `overlay-sheet` | `Overlay` (portal-shell, sheet) | 390×720 |
| `overlay-sheet-detail` | `variant="detail"` in de sheet (meescrollende kop) | 390×720 |
| `overlay-bezig` | `closeBlocked`: `aria-busy`, eigen knoppen `disabled` | 768×560 |
| `overlay-onopgeslagen` | `onopgeslagen`. De weggooien-vraag verschijnt pas na een sluitpoging (O2). | 768×560 |
| `overlay-sluit-knop` | `Overlay` met `OverlaySluitKnop` in `secundair` (standaard), `tekst` en `maat="groot"` | 768×560 |
| `overlay-presence-provider` | `OverlayPresenceProvider` om een `Overlay`. In de dialoog staat de teller (`useOpenOverlayCount()`): "Open overlays onder deze provider: 1". | 768×560 |

Eisen:
- **Achter de backdrop staat niets.** De teller van `OverlayPresenceProvider`
  staat ín de dialoog. Zo komt er geen inerte, gedimde tekst bij die axe op
  contrast kan meten.
- `onClose` is een noop. Escape of een tik op de backdrop sluit het voorbeeld
  dus niet.
- `VOORBEELDEN` krijgt de sleutels `Overlay`, `OverlaySluitKnop` en
  `OverlayPresenceProvider`. Elk rendert eigen kadersecties, met unieke
  `data-systeem`-id's.

#### `schermvullend`: hetzelfde kader

| Kader-id | Inhoud | Venster (b×h) |
|---|---|---|
| `start-scherm` | `StartScherm` met `AuroraMerk tone="dark"` en een `h1` | 768×560 |
| `zij-paneel` | een rij met een vlak inhoudsgebied en `ZijPaneel as="aside"`; vanaf 700px breed is het paneel 300 tot 372px | 900×560 |
| `zij-paneel-smal` | dezelfde inhoud onder 700px: volle breedte, hoogte `max(32rem, 100dvh)` | 600×640 |

Het venster van het kader is de viewport van zijn document. Daardoor gelden
`min-h-screen`, `100dvh` en het breekpunt `min-[700px]` binnen het kader, en
zie je beide kanten van het breekpunt van `ZijPaneel` op één pagina. De eigen
`<main>` van `StartScherm` staat in het document van het kader. De pagina
houdt zo één `main` en één `h1`.

### Kaders: mechaniek en scheiding generiek/lokaal

| Onderdeel | Generiek (`// kit: generiek`) | ABAS (lokaal) |
|---|---|---|
| Sectie met iframe | `src/lib/systeem/SysteemKader.tsx`: rendert een `SysteemSectie` met `data-systeem-soort="kader"` en daarin een `<iframe>`. Het iframe heeft een vaste `width`/`height`, een `title` (verplicht prop), `loading="eager"` en geen `tabindex`. | — |
| `SysteemSectie` | krijgt een optionele prop `soort` (`"gewoon"` als standaard, `"kader"`). Die zet `data-systeem-soort`. | — |
| Type | `Kaderregister` in `src/lib/systeem/types.ts`: id → `{ titel, frameTitel, breedte, hoogte, render }` | — |
| Kaderroute | — | `src/app/design/systeem/kader/[id]/page.tsx`: `force-static`, `generateStaticParams` uit de kader-id's, `dynamicParams = false` (onbekend id: 404), `robots: noindex`, een eigen `<title>` per kader. Het document heeft zelf geen landmark en geen kop: alleen de inhoud van het kader. |
| Register | — | `src/app/design/systeem/kaders.tsx` (client) met `KADERS`. De id's staan in een server-leesbare constante, zodat de route ze zonder functies kan lezen. `SysteemKader` neemt een id van dat type: een verkeerd id faalt in `typecheck`. |
| Pad | — | `systeem.lokaal.json` → `kaderRoute: "/design/systeem/kader"` |
| Teksten | — | `teksten.ts`: titel, uitleg, `frameTitel` en voorbeeldinhoud per kader |

**Volgorde:** alle kadersecties komen ná alle gewone secties. De sleutels
`Overlay`, `OverlayPresenceProvider`, `OverlaySluitKnop`, `StartScherm` en
`ZijPaneel` staan dus achteraan in `VOORBEELDEN`. De reden: een kader met een
focusval (Overlay) houdt Tab vast. De focustest doet Shift+Tab en daarna Tab
vanaf het eerste element van een sectie. Na een kader zou die test in het
iframe blijven hangen. De e2e bewaakt deze volgorde (zie Tests).

### Screenshots

- **Bestaande PNG's veranderen niet.** De screenshots zijn per element. Nieuwe
  secties onderaan veranderen de bestaande secties niet. Het generieke wachten
  op kaders verandert niets aan gewone secties.
- **Nieuw, gewone secties:** `opslaan-sectie`, `nieuw-wachtwoord-velden`,
  `lid-zoeker` en `code-invoer` (+ `code-invoer-rail`). Daarbij komen
  `-hover`/`-focus` waar de sectie een bruikbare knop of een focusbaar element
  heeft. Dat bepaalt de generieke test zelf.
- **Nieuw, kadersecties:** alleen `<id>.png`. De hover- en focustests slaan
  kadersecties over: hun selectors gaan niet door een iframe heen, en `iframe`
  komt niet in `FOCUSBAAR`. Hover en focus binnen een kader vallen buiten
  scope.
- **Interactiestaten (alleen bij O2 = a):** `<sectie>-<naam>.png` per
  interactie.
- Alle nieuwe baselines komen uit de workflow `screenshots-bijwerken`, zoals
  bij de vorige spec. De time-outs van 180 s in de screenshot-, hover- en
  focustests mogen omhoog als het aantal secties dat vraagt.

### Staten, copy, toon, toegankelijkheid

- **Staten:** zie de tabellen hierboven. De pagina zelf heeft geen laden,
  pending of succes. Een kader laadt een statische pagina.
- **Copy:** alle teksten staan in `teksten.ts`: titel, uitleg, `h3` per staat,
  `frameTitel`, voorbeeldnamen, foutmelding en zoektermen. Componentteksten
  (bijv. "Leden laden…", de wachtwoordregels, "de wachtwoorden zijn niet
  gelijk", de weggooien-vraag) komen uit de component of `src/lib` zelf en
  worden niet herhaald. De Developer schrijft de paginateksten in de stijl van
  de bestaande secties: Nederlands, kort, met de props bij naam ("Props:
  pending, wachtOpAnder, fout, status, chrome"). Een `frameTitel` noemt het
  component en de staat, bijv. "Voorbeeld: Overlay als modal".
- **Toon en shell:** `CodeInvoer tone="rail"` komt in een rail-sectie
  (`code-invoer-rail`), de rest op licht. `NieuwWachtwoordVelden` en
  `OpslaanSectie` staan in `Dialoogvlak`, de plek waar ze in de app staan.
  Overlay-kaders zetten een `ShellProvider` (bar: modal, portal: sheet). De
  ontwerpsysteempagina zelf leest `useShell()` niet.
- **Toegankelijkheid:**
  - De pagina houdt één `main` en één `h1`. `StartScherm` staat met zijn
    `main` en `h1` in een eigen document.
  - Elk iframe heeft een unieke, niet-lege `title` (axe `frame-title`) en geen
    `tabindex="-1"` (axe `frame-focusable-content`).
  - Elk kaderdocument heeft `lang="nl"` (root-layout) en een eigen `<title>`.
  - AxeBuilder scant iframes standaard mee. De axe-test van de pagina dekt dus
    ook de kaders.
  - Landmark- en kopregels van axe zijn `best-practice` en vallen buiten de
    `wcag*`-tags van de bestaande scan. Daarom staat "één main per
    kaderdocument" als eigen e2e-check.
  - Een overlay in een kader zet bij het laden de focus in zijn document. De
    screenshottest scrollt per element zelf. De focustest zet de focus eerst
    zelf op een element van de buitenpagina.

### Wie schrijft wat

Dit is een gate-wijziging (`scripts/kit/`, `.kit/`, bestaande tests). De PR
krijgt het label `gate-wijziging`. Alleen Bram zet dat.

| Wie | Bestanden |
|---|---|
| Hoofdsessie | `scripts/kit/systeem.mjs` (`CODES`, `uitzonderingen`, G2–G7); `scripts/kit/systeem.lokaal.json` (`redenen` → `uitzonderingen`, `kaderRoute`, eventueel `interacties` bij O2 = a); `.kit/baseline.json` (via `npm run ratchet:update`); `scripts/kit/gates.mjs` (beschrijving van `check:catalogus`) |
| Developer | `src/lib/systeem/SysteemKader.tsx` (nieuw, generiek); `src/lib/systeem/SysteemSectie.tsx` (`soort`); `src/lib/systeem/types.ts` (`Kaderregister`); `src/app/design/systeem/kader/[id]/page.tsx`; `src/app/design/systeem/kaders.tsx`; `voorbeelden.tsx`; `teksten.ts`. Geen wijziging in `src/components`. Lukt een staat niet zonder componentwijziging, dan meldt hij dat en kiest hij niet zelf. |
| Tester | `test/systeemCatalogus.test.ts` (bestaande tests aangepast: label); `e2e/systeem.spec.ts` (generiek: kaders, volgorde, eventueel interacties) |
| Docs | `docs/features/ontwerpsysteem.md` → verwijzing bij "Uitzonderingslijst" naar deze spec; `src/components/README.md` alleen als een rij verandert (niet verwacht) |

**Volgorde van bouw (voorstel, zie O5):**
1. Gate: codes voor alle 13 uitzonderingen (`staten` ×4, `context` ×3,
   `schermvullend` ×2, `data` ×4), plus de unit-tests. Er komt nog geen
   voorbeeld bij.
2. `staten`: vier voorbeelden. De baseline en `uitzonderingen` dalen naar 9.
3. Kaders: `context` en `schermvullend`. Ze dalen naar 4 (alleen `data`).

## Randgevallen

| Situatie | Gedrag | Foutcode/tekst |
|---|---|---|
| Nieuw component zonder voorbeeld | gate faalt | G1 |
| Uitzondering met code `geld` (typfout of verzonnen) | gate faalt | G2 |
| Naam toegevoegd aan de baseline, niet aan `uitzonderingen` | gate faalt | G3 |
| `uitzonderingen` noemt een component met voorbeeld | gate faalt | G4 |
| `uitzonderingen` noemt een verdwenen component dat niet in de baseline staat | gate faalt | G4 |
| Oude vorm `{ "reden": "…" }` of de sleutel `redenen` | gate faalt | G5 / G7 |
| `"toelichting": "  "` | gate faalt | G6 |
| Voorbeeld toegevoegd, baseline nog niet bijgewerkt | gate faalt (ratchet); na `ratchet:update` G4 tot de entry weg is | G8, daarna G4 |
| Kader-id in `VOORBEELDEN` bestaat niet in `KADERS` | `typecheck` faalt | — |
| Kaderroute met een onbekend id | 404 (`dynamicParams = false`) | — |
| Kaderroute zonder Basic-auth | 401 (zelfde poort als `/design`) | — |
| Kader nog niet geladen bij de screenshot | e2e wacht op het laden van elk kader en op `document.fonts.ready` in het kader | — |
| Gewone sectie na een kadersectie | e2e faalt (focusval kan Tab vasthouden) | "gewone sectie `<id>` staat na kadersectie `<id>`" |
| Twee `LidZoeker`s met de standaard-`inputId` | axe faalt op dubbele id's | voorkomen: eigen `inputId` per exemplaar |
| Open lijst van `LidZoeker` valt buiten de sectie | screenshot mist de lijst | voorkomen: vrije ruimte onder het veld |
| Overlay in een kader zet bij het laden de focus | de buitenpagina kan scrollen; screenshots scrollen per element zelf | — |

## Tests

**Unit (`test/systeemCatalogus.test.ts`, Tester):**
- `CODES` bevat precies `context`, `data`, `schermvullend`, `staten`, elk met
  een niet-lege omschrijving en oplossing.
- `analyseer`:
  - uitzondering met geldige code, met en zonder toelichting: geen probleem;
  - G2 onbekende code;
  - G3 in drie vormen (geen entry, geen `code`, `code` geen string);
  - G4 voor een component met voorbeeld;
  - G4 voor een niet-bestaande naam buiten de baseline;
  - G5 en G6;
  - één melding per naam.
- **Vervangen:** de test "reden voor een bestaande component (geen
  uitzondering) is geen probleem" wordt omgekeerd naar G4. De tests op
  `redenen` gaan naar `uitzonderingen`. Dit is het aanpassen van bestaande
  tests, dus label `gate-wijziging`.
- `draai(root)` end-to-end in de tijdelijke boom:
  - geslaagd met `uitzonderingen`;
  - G7 bij `redenen`;
  - de ratchet-melding bij een opgeloste uitzondering, en daarna G4 met een
    bijgewerkte baseline.

**e2e (`e2e/systeem.spec.ts`, Tester, generiek, zonder componentnamen):**
- `openPagina` wacht op het laden van elk `iframe` in
  `[data-systeem-soort="kader"]` en op `document.fonts.ready` in elk
  frame-document.
- Elk kader-iframe heeft een unieke, niet-lege `title`.
- Geen `[data-systeem]` zonder `data-systeem-soort="kader"` na een
  kadersectie.
- Elk kaderdocument heeft hooguit één `main`.
- De bestaande checks (één `main`/`h1` op de pagina, screenshot per sectie,
  hover/focus, axe inclusief frames, 401 zonder of met een fout wachtwoord)
  blijven en dekken de nieuwe secties vanzelf.
- De kaderroute geeft zonder inloggegevens 401.
- Bij O2 = a: een generieke runner die `interacties` uit de lokale config
  uitvoert en per interactie een screenshot maakt.

**Ratchet:** `systeem-zonder-voorbeeld` daalt van 13 naar 4.

## Open vragen voor Bram

- **O1. Kader = iframe, ook voor `schermvullend`?** Bram schreef "iframe of
  venster". Dit voorstel kiest het iframe voor `context` én `schermvullend`.
  Het is één mechanisme, alles staat op één pagina en wordt in één axe-scan
  gedekt, en het breekpunt van `ZijPaneel` is aan beide kanten te zien.
  - Alternatief "venster": een losse route per voorbeeld, met een eigen
    Playwright-test op een eigen viewport. Dat kost een tweede screenshot- en
    axe-pad.

  Bevestigen of kiezen.
- **O2. Staten die alleen via interactie bestaan:**
  - Overlay: de weggooien-vraag en de melding bij `closeBlocked`;
  - `CodeInvoer`: fout en bezig;
  - `LidZoeker`: lijst open.

  Hoe tonen we die?
  - **a.** Interactiestappen in de lokale config (`interacties`: sectie-id,
    naam en stappen als `toets`, `klik` op een toegankelijke naam of `typ` in
    een label). Een generieke runner in `e2e/systeem.spec.ts` voert ze uit,
    ook binnen een kader, en maakt `<sectie>-<naam>.png`. De pagina zelf toont
    dan alleen de ruststaat. Dit is de aanbeveling, en het past bij wat de
    vorige spec al over interactiegevallen in de lokale config zei.
  - **b.** Buiten scope: alleen de statische staten.
  - **c.** Startstaat-props op de componenten (bijv. `beginOpen`,
    `beginFout`). Dat is een API-wijziging alleen voor de pagina.
- **O3. Toelichting verplicht voor `data`?** Bram zei "optionele
  toelichting". Bij `data` is dat de enige uitleg waarom iets nooit op de
  pagina komt. Optioneel laten (zoals nu gespecificeerd), of voor `data`
  verplicht?
- **O4. De resterende uitzonderingen op de pagina tonen?** Bijvoorbeeld een
  sectie "Niet op deze pagina" met naam, code en toelichting, gelezen uit
  `systeem.lokaal.json`. Dat is één screenshot extra. Nu buiten scope.
- **O5. PR-indeling:** de drie stappen onder "Volgorde van bouw" als drie
  PR's (elk een kleine ratchetdaling), of in één PR?

## Signalen (geen onderdeel van de bouw)

- **Gate-kandidaat:** "een bestand met `// kit: generiek` noemt geen
  ABAS-component of ABAS-pad" is nu een afspraak voor de Reviewer. Een script
  kan dat controleren: de namen uit `componentNamen()` over de
  `componentenMap`, plus `src/app/`-paden, mogen niet voorkomen in die
  bestanden. Deze spec maakt twee nieuwe generieke bestanden en wijzigt er
  drie, dus de kans op een lek groeit.
- `.claude/rules/ui.md` noemt `/design/systeem` met screenshots nog als
  "besloten maar nog niet gebouwd". De hoofdsessie werkt dat bij
  (`.claude/` is een gatepad).

## Expliciet buiten scope

- De vier `data`-uitzonderingen (`EerdereGeldActie`, `GeldActieHerstel`,
  `GeldActieHerstelInhoud`, `OnbekendeUitkomstMelding`). Die blijven, bewust.
- Wijzigingen aan componenten in `src/components`.
- Hover- en focus-screenshots binnen een kader.
- Interactiestaten, als O2 = b.
- Een lijst van uitzonderingen op de pagina, tenzij O4 = ja.
- Een gate op "generiek bevat geen ABAS-namen" (zie Signalen).
- De extractie zelf naar een los raamwerk (roadmap fase 4). Deze spec houdt
  alleen de scheiding generiek/lokaal aan.
- Een donkere modus, density-varianten en extra viewportmaten per kader
  bovenop de tabellen hierboven.
