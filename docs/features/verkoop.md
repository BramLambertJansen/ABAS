# Verkoopscherm: mandje + afrekenen

Spec voor [issue #8](https://github.com/BramLambertJansen/ABAS/issues/8).
Volgt op [#7](https://github.com/BramLambertJansen/ABAS/issues/7) (bezetting
beheren, gemerged) — dat scherm noemde dit ticket al met naam voor twee dingen
die het bewust niet bouwde: "'Wie geeft uit?'-keuze bij afrekenen... hoort bij
het verkoopscherm, #8, niet hier" en "een schermbrede header-chip... volgt
vanzelf zodra #8 een tweede bar-scherm toevoegt" (`docs/features/bezetting-
beheren.md` → Expliciet buiten scope). Dit is dat tweede bar-scherm.

**Contant/pin-verkoop zonder lid is bewust buiten scope** — zie "Besloten"
onderaan. Deze spec dekt uitsluitend lid-gebonden verkoop.

## Doel

Het kernscherm van de bar: het assortiment doorzoeken/aantikken, een mandje
opbouwen, en afrekenen op het saldo van een gekozen lid via de bestaande
`place_order`-RPC — inclusief de "wie rekent af"-attributie uit de bezetting.
Geen nieuwe geldlogica: `place_order` (`0001_init.sql`, al pgTAP-getest in
`supabase/tests/place_order.test.sql`) bepaalt het bedrag en controleert het
saldo server-side precies zoals CLAUDE.md → Architectuurbeslissingen
voorschrijft; dit scherm stuurt uitsluitend product-ids/aantallen, het
gekozen lid en `served_by` mee — nooit een berekend totaal.

## Betrokken shell

`shells/bar` alleen. Geen verkoopconcept in `shells/portal` (een lid ziet
daar straks alleen het resultaat: eigen saldo/transacties). Het scherm zelf
komt in een nieuwe map `src/features/verkoop/` (shell-agnostic per CLAUDE.md
→ Shells), naast het bestaande `src/features/bezetting-beheren/` en
`src/features/dienst-starten/`.

## Datamodel

**Geen schemawijziging.** `products`, `orders`, `order_lines`, `members`,
`app_settings.negative_limit_cents`/`low_balance_threshold_cents` bestaan al
in `0001_init.sql` precies zoals dit scherm ze nodig heeft.

## RPC's

- **`place_order(p_shift_id, p_member_id, p_lines, p_served_by)`** —
  bestaand, ongewijzigd. `p_lines` is een jsonb-array van
  `{"product_id": uuid, "qty": int}`; de client bouwt dit rechtstreeks uit de
  mandje-state, zonder prijs of totaal. Retourneert de nieuwe `orders`-rij
  (incl. server-berekende `total_cents`, bruikbaar voor de
  succesbevestiging) of gooit een van de foutcodes in "Randgevallen"
  hieronder.
- Geen nieuwe RPC. Vier nieuwe **leesacties** (platte `select`s via
  bestaande `_select`-policies, zelfde argumentatie als eerdere specs:
  `authenticated` mag alles lezen, single-tenant) horen in
  `src/hooks/queries/`:
  - `useProducts()` — niet-gearchiveerde `products` (id, name, category,
    price_cents), voor het assortiment.
  - `useMembers()` — niet-gearchiveerde `members` (id, name, balance_cents),
    voor de ledenzoeker in het mandje-paneel. Ongefilterd op rol (in
    tegenstelling tot `useBarStaff()`, dat alleen `bardienst`/`beheerder`
    teruggeeft): elk niet-gearchiveerd lid kan afrekenen, ook een
    bardienst/beheerder die zelf iets koopt.
  - `useAppSettings()` — de enige rij in `app_settings`
    (`negative_limit_cents`, `low_balance_threshold_cents`). Eén hook voor
    beide velden, geen duplicatie: dit scherm heeft alleen
    `negative_limit_cents` nodig (saldo-check bij afrekenen), maar #9
    (laag-saldo-signalering) heeft straks `low_balance_threshold_cents`
    nodig uit dezelfde rij — geen reden voor twee hooks op één single-row
    tabel.
  - `usePlaceOrder()` — mutatiehook, zelfde vorm als `useAddShiftMember`/
    `useStartShift` (`status`/`errorCode`/reset), maar geeft bij succes ook
    `total_cents` van de aangemaakte order terug (voor de
    afrekenbevestiging — zie Schermflow). Typed error-code union:
    `shift_not_open | served_by_not_on_shift | empty_order | invalid_qty |
    product_not_available | member_not_found | insufficient_balance |
    unknown` — zie Randgevallen voor de UI-afhandeling per code.

## Rolzichtbaarheid

Zelfde vertrouwensmodel als #7: iedereen die de gedeelde bar-tablet-sessie
gebruikt tijdens een open dienst ziet dit scherm en kan afrekenen — geen
aparte weergave of restrictie per rol. `place_order` controleert zelf alleen
dat `served_by` op de actieve bezetting staat, nooit welke rol de aanroeper
heeft (`docs/ARCHITECTURE.md` → "Shared bar-tablet session mechanism").

## Navigatie (nieuw — eerste tweede bar-scherm)

Vandaag toont `DienstStarten.tsx` na een geslaagde/bestaande dienst-start
altijd direct `DienstActief` (bezetting-info). Dat wordt een keuze tussen
twee tabs zodra er een open dienst is:

- **Verkoop** (nieuw, dit ticket) — **standaard/actieve tab** na dienst-start
  of bij binnenkomst met een al-open dienst (matcht het ontwerp se
  `data.screen = 'sales'`-default, `designs/Bar App.dc.html` regel 1711).
- **Dienst** — de bestaande `DienstActief`-inhoud (bezetting, "gestart door
  X om HH:MM"), ongewijzigd.

Beide tabs lezen dezelfde `useOpenShift()`-shift; welke van de twee gemount
is, is lokale UI-state in `DienstStarten.tsx` (of een dun wrapper-component
eromheen — implementatiedetail). De exacte chrome (het ontwerp se donkere
icon-rail met Verkoop/Dienst-iconen, regel 39–57, versus een eenvoudiger
tabbar) is aan Developer: deze spec legt vast dát er navigatie moet zijn
tussen de twee met Verkoop als standaard, niet de pixels. Een
schermbrede/persistente header-bezetting-chip (zoals het ontwerp op meerdere
schermen toont) is nadrukkelijk **niet** vereist door deze spec — zie
Expliciet buiten scope.

## Schermflow

### 1. Assortiment (linkerkant/hoofdgebied)

- Zoekveld ("Zoek product") filtert alle niet-gearchiveerde producten op
  naam (case-insensitive substring), ongeacht categorie.
- Categoriechips: **dynamisch afgeleid** van de distincte `category`-waarden
  onder niet-gearchiveerde producten (alfabetisch), plus een vaste "Alle"-
  chip als standaard. Geen hardcoded categorielijst en geen "Favorieten"-
  chip — het ontwerp se `CATEGORIES`/`QUICK_IDS` (regel 1472, 1499) zijn
  prototype-only constanten zonder tegenhanger in ons schema (`category` is
  vrije tekst per product, geen "favoriet"/"quick"-concept bestaat). Zolang
  er een zoekopdracht actief is, overschrijft die de categoriefilter (zelfde
  gedrag als het ontwerp); leeg zoekveld → categoriefilter geldt weer.
- Elk product: naam, prijs, en een tik-doel dat de hoeveelheid in het mandje
  met 1 verhoogt (zelfde interactie als het ontwerp — `changeQty(id, +1)`
  op elke tik, geen apart "toevoegen"-scherm). Producten al in het mandje
  tonen hun huidige aantal (badge/aantal-indicator).
- Exacte visuele vorm (galerij-kaarten vs. lijst, met/zonder view-toggle) is
  een implementatiedetail — volgt het ontwerp als eerste bouw per CLAUDE.md
  → Designbestanden, geen harde eis van deze spec.

### 2. Mandje-paneel (rechterkant, permanent zichtbaar)

- **Ledenkeuze**: zoekveld ("Zoek lid op naam") met dropdown van
  overeenkomende niet-gearchiveerde leden (naam + saldo). Saldo van een lid
  onder `app_settings.low_balance_threshold_cents` visueel gemarkeerd
  (kleur, zelfde signaal als het ontwerp) — dit is de "bardienst ziet saldi
  om te kunnen waarschuwen"-eis uit CLAUDE.md → Domein, hier alleen als
  passieve kleurcode in de bestaande zoeker; een proactieve
  waarschuwingsflow/"aandacht"-lijst is #9, niet dit ticket.
- Na kiezen: ledenkaart (naam, saldo) i.p.v. het zoekveld, met een
  "wissel"-knop die teruggaat naar de zoeker (en het mandje leegt — zelfde
  gedrag als het ontwerp se `clearMember`, om te voorkomen dat een mandje
  per ongeluk op het verkeerde lid wordt afgerekend). Wisselen naar
  **hetzelfde** lid opnieuw laat het mandje intact (zelfde `keep`-logica als
  het ontwerp).
- **Mandje**: regel per product (naam, stukprijs, +/− stepper, regeltotaal,
  verwijderen). Leeg mandje: neutrale lege staat, geen crash.
- **Totaal**: server-onafhankelijk client-subtotaal (som van
  `price_cents × qty` uit de al-geladen productlijst) — puur voor weergave,
  nooit meegestuurd aan `place_order`. Bij een gekozen lid ook "saldo na
  afrekenen" (`balance_cents − subtotaal`) als preview.
- **Onvoldoende-saldo-banner**: zichtbaar zodra `subtotaal > balance_cents +
  negative_limit_cents` voor het gekozen lid. Tekst: "Onvoldoende saldo — {
  tekort } tekort." (tekort = subtotaal − (balance_cents +
  negative_limit_cents), in euro's). Dit is de "duidelijke melding"-eis uit
  AC #6 — bij €0 saldo en `negative_limit_cents = 0` triggert dit meteen
  zodra er iets in het mandje zit. Geen "opwaarderen"-snelkoppeling vanuit
  deze banner (zie Expliciet buiten scope: er bestaat nog geen
  opwaardeer-scherm om naartoe te linken).
- **Afrekenen-knop** ("Tik afrekenen"): disabled tenzij een lid gekozen is
  **en** het mandje niet leeg is **en** de onvoldoende-saldo-banner niet
  actief is. Bij tik: opent de afrekenbevestiging (§3) — **altijd**, ook bij
  een bezetting van 1 (zie §3, de "wie geeft uit"-picker is wat conditioneel
  is, niet de bevestiging zelf).

  **Let op voor Developer**: het ontwerp se eigen `openCheckout`/
  `confirmCheckout`-handlers (regel 1958–1987) gebruiken voor de
  klik-guard `total() > member.balance` — **zonder** de negatieflimiet, in
  tegenspraak met de banner/knopstijl elders in hetzelfde bestand (regel
  2569: `subtotal > memberObj.balance + s.negativeLimit`). Dat is een
  inconsistentie in het prototype zelf, geen bewuste architectuurkeuze: volg
  overal de negatieflimiet-bewuste variant (zoals CLAUDE.md → Domein die
  voorschrijft), niet de kale click-handler.

### 3. Afrekenbevestiging (modal, `src/components/Overlay.tsx`)

Hergebruikt de bestaande `Overlay`-primitive (`useShell().overlay`, op
`shells/bar` vandaag altijd `"modal"` — settled sinds #7, zie
`docs/ARCHITECTURE.md`-wijziging bij deze spec). Geen nieuwe
architectuurbeslissing, wel de tweede echte consument.

Inhoud (uit het ontwerp, regel 983–1032, "Afrekenen bij {lid}"):
- Titel: **"Afrekenen bij {ledennaam}"**.
- Toelichting: **"Het bedrag gaat van het saldo af en de kassa staat daarna
  klaar voor de volgende."**
- Mini-ledenkaart (naam + huidig saldo), regelitems (aantal× naam +
  regeltotaal), totaal.
- Onvoldoende-saldo-banner (zelfde tekst/logica als §2) indien van
  toepassing — kan hier opnieuw triggeren als het saldo tussen het openen
  van de bevestiging en nu is veranderd (race, zie Randgevallen).
- **"Wie geeft uit?"-picker** — **alleen zichtbaar als de bezetting 2+
  leden telt** (AC #3). Rijen = huidige bezetting (`useShiftMembers`,
  bestaande hook, ongewijzigd), single-select, tik = keuze. Hint-tekst
  "verplicht" (niets gekozen) / "gekozen" (wel), zoals het ontwerp
  (`serverHint`, regel 3205–3206). Bij een bezetting van exact 1 lid: **geen
  picker**, `served_by` wordt automatisch dat ene lid (AC #4) — dit gedrag
  ligt al vast in `docs/ARCHITECTURE.md` → "Dienst & bezetting" (settled
  2026-08-24), dit scherm implementeert het alleen.
- Knoppen: "annuleren" (sluit, mandje blijft intact) en "ja, afrekenen"
  (disabled zolang: onvoldoende saldo, **of** bezetting 2+ zonder gekozen
  `served_by`, **of** een `place_order`-aanroep al onderweg is — één
  aanroep tegelijk, zelfde eenvoudige guard als `BezettingOverlay`'s
  `pendingId`).
- Bij tik op "ja, afrekenen": `usePlaceOrder().placeOrder(shiftId,
  selectedMemberId, lines, servedBy)`. Bij succes: mandje leegt, gekozen lid
  wist (terug naar ledenzoeker), dialoog sluit, korte bevestiging (bv.
  toast) met het server-teruggegeven `total_cents`, en `useMembers().
  refetch()` zodat een volgende zoekactie het bijgewerkte saldo toont. Bij
  fout: zie Randgevallen — dialoog blijft in de regel open zodat de
  operator kan corrigeren, behalve waar hieronder anders vermeld.

## Randgevallen

**Bezetting**
- **Bezetting = 0** (mogelijk sinds #7's "zelfverwijdering"-besluit — de
  starter kan zichzelf als laatste verwijderen): afrekenen moet geblokkeerd
  blijven, niet crashen. `place_order` zou hoe dan ook `served_by_not_on_
  shift` gooien voor elke waarde (er is niemand op de bezetting om aan toe
  te schrijven). Client-side al blokkeren vóór de RPC-aanroep: "Afrekenen
  bij een lege bezetting is nog niet zinvol" — Ontwerp gaat hier niet expliciet
  op in de sales-flow, maar dit scherm moet een duidelijke melding tonen en
  verwijzen naar de Dienst-tab ("voeg jezelf of een collega toe aan de
  bezetting") in plaats van een lege/verwarrende picker te tonen.
- **Bezetting = 1** → automatische toewijzing, geen picker (AC #4, settled
  gedrag).
- **Bezetting 2+** → picker verplicht, afrekenen geblokkeerd zonder keuze
  (AC #3, settled gedrag).
- **`served_by` valt weg tussen kiezen en bevestigen** (bv. iemand anders
  verwijdert die persoon via de Dienst-tab's bezettingsoverlay terwijl de
  afrekenbevestiging openstaat — enige tablet-sessie, dus zeldzaam maar niet
  onmogelijk): RPC gooit `served_by_not_on_shift`. UI: melding "degene die
  je koos staat niet meer in de bezetting — kies opnieuw", `served_by`-keuze
  wordt gereset (picker opnieuw "verplicht"), dialoog blijft open.

**RPC-foutcodes van `place_order`** (client → Nederlandse melding):
| Code | Wanneer bereikbaar via deze UI | Melding |
|---|---|---|
| `insufficient_balance` | Vooral proactief afgevangen door de banner (§2/§3); als fallback bij een race (saldo wijzigt tussen banner-berekening en server-check) | "Onvoldoende saldo — { tekort } tekort." (zelfde tekst als de banner) |
| `served_by_not_on_shift` | Race, zie hierboven | "degene die je koos staat niet meer in de bezetting — kies opnieuw" |
| `member_not_found` | Lid wordt gearchiveerd tussen kiezen en bevestigen (bv. door een beheerder in een toekomstig Ledenbeheer-scherm — dat scherm bestaat nog niet, dus praktisch onbereikbaar vandaag, maar wel cheap om af te vangen) | "dit lid bestaat niet meer of is gearchiveerd — kies een ander lid"; sluit terug naar de ledenzoeker, mandje blijft intact |
| `product_not_available` | Product wordt gearchiveerd tussen aantikken en afrekenen (zelfde soort race, ook praktisch onbereikbaar zolang er geen Assortimentsbeheer-scherm is) | "een product in je mandje is niet meer beschikbaar — controleer je mandje"; mandje blijft ongewijzigd (RPC meldt niet welke regel het was), assortiment wordt opnieuw opgehaald zodat het gearchiveerde product niet meer aantikbaar is |
| `shift_not_open` | Bereikbaar sinds #12 (docs/features/dienst-afsluiten.md): "Dienst afsluiten" op de Dienst-tab roept `end_shift` aan, waarna een nog open mandje op de Verkoop-tab hierop stuit bij afrekenen | "de dienst is niet meer actief — herlaad het scherm" |
| `empty_order` / `invalid_qty` | Onbereikbaar via deze UI (mandje-guards voorkomen een lege/negatieve regel) | generieke `unknown`-melding, verder geen speciale UI nodig |
| `unknown` (netwerk/onverwacht) | Altijd mogelijk | "er ging iets mis, probeer het opnieuw" (zelfde vaste patroon als alle bestaande hooks — nooit de ruwe Postgres-melding tonen) |

**Overig**
- **Geen leden gevonden** bij zoeken → "geen leden gevonden" (bestaande
  ontwerp-tekst, regel 267), geen crash.
- **Dubbele indiening** (dubbeltik op "ja, afrekenen") → de mutatiehook se
  `pending`-status disabled de knop tijdens de aanroep, zelfde patroon als
  `BezettingOverlay`'s `pendingId`-guard.
- **Netwerkfout tijdens `place_order`** → mandje en gekozen lid blijven
  intact zodat de operator zonder opnieuw te tikken kan herproberen.
- **A11y van de afrekenbevestiging**: net als bij #7's bezettings-overlay
  (`e2e/a11y.spec.ts`'s laatste test) moet Tester de axe-scan uitbreiden met
  een scenario dat de bevestiging opent (met én — als de seed-data een
  bezetting van 2+ oplevert — zonder de "wie geeft uit"-picker zichtbaar)
  vóór het scannen, anders blijft dit scherms belangrijkste nieuwe
  interactieve element buiten de WCAG-AA-gate.

## Expliciet buiten scope

- **Contant/pin-verkoop zonder lid** ("guestMode"/"Pin afrekenen" in het
  ontwerp) — zie "Besloten" hieronder. Niet gebouwd in deze versie van de
  spec; apart ticket, [#39](https://github.com/BramLambertJansen/ABAS/issues/39).
- **Assortiment-/Ledenbeheer (CRUD)**: nieuw product/lid aanmaken, prijzen
  wijzigen, archiveren. Staat al genoemd in `docs/ARCHITECTURE.md` → "Wat
  het prototype deed maar hier nog niet is besloten" als niet-specced. Dit
  scherm *leest* alleen `products`/`members`.
- **"Favorieten"/quick-pick-chip** — geen tegenhanger in ons schema (zie
  §1).
- **"Saldo opwaarderen"-knoppen/snelkoppelingen** (bij de onvoldoende-
  saldo-banner, bij de ledenkaart) — er bestaat nog geen opwaardeer-scherm
  of -hook in de codebase (`top_up`-RPC bestaat, UI niet). Een knop die
  nergens naartoe leidt hoort niet in dit scherm; opwaarderen krijgt zijn
  eigen ticket/spec.
- **Proactieve laag-saldo-signalering** ("aandacht"-lijst, notificaties) —
  #9. Dit scherm doet alleen de passieve kleurcode in de ledenzoeker (zie
  §2).
- **Negatieflimiet zelf instellen/wijzigen** — #11. Dit scherm *leest*
  `negative_limit_cents` alleen.
- **Dienstoverzicht/omzettegel, "dienst afsluiten"** (`drawerLabel`,
  `crewStatRows` in het ontwerp) — #12.
- **"Ongedaan maken laatste tik"** (↺-knop in het ontwerp) — niet vereist
  door de acceptatiecriteria van #8; Developer mag 'm toevoegen als
  triviale UX-toevoeging, maar het is geen onderdeel van de acceptatie van
  deze spec.
- **Sheet-variant van `Overlay`** (voor `shells/portal`) — geen consument,
  zelfde reden als #7.
- **Schermbrede/persistente bezetting-chip op meerdere bar-schermen** —
  optioneel voor Developer, niet vereist (zie Navigatie).

## `useShell()`-contract

Geen nieuwe beslissing. `overlay` is al `"modal"` op `shells/bar`
(`barCapabilities.overlay`, settled sinds #7) — dit scherm is de **tweede**
consument van de bestaande `Overlay`-primitive (afrekenbevestiging), geen
reden om de sheet-tak alsnog uit te bouwen (nog steeds geen
`shells/portal`-consument). `docs/ARCHITECTURE.md` → Shells "Open" wordt met
deze spec bijgewerkt: het overlay-punt stond daar nog als "nog geen echt
gebruik", wat sinds #7 niet meer klopt.

`columns`/`density` worden door dit scherm niet nieuw ingevuld — het
productassortiment kan een grid zijn (zoals `columns` al bij de
staff-picker doet), maar de exacte lay-out is implementatiedetail, geen
architectuurkeuze die deze spec vastlegt.

## Besloten: contant/pin-verkoop zonder lid (2026-08-26)

Bram heeft gekozen: **apart ticket, later** —
[#39](https://github.com/BramLambertJansen/ABAS/issues/39). Deze spec
(member-only, volledig hierboven gespecificeerd) is daarmee compleet en niet
van dat vervolgticket afhankelijk.

Bevindingen die tot de vraag leidden (voor context, geen actie meer nodig):
het **ontwerp** (`designs/Bar App.dc.html`) bouwt "Pin afrekenen" uitgebreid
uit als onderdeel van hetzelfde verkoopscherm (betaalwijze-toggle, eigen
bevestigingsdialoog, gecombineerde omzet-boekhouding), en het **schema**
(`0001_init.sql`) is er al op voorbereid (`orders.member_id` nullable,
`place_order` slaat de saldo-check over bij `p_member_id is null`) — maar
issue #8 zelf vroeg er in geen van zijn acceptatiecriteria om, en dit raakt
nog niet-besloten scope (dienstoverzicht/omzetrapportage, #12). #39 pakt dit
op zodra #8 staat, idealiter samen met #12 zodat de omzet-boekhouding in één
keer goed staat.

## Gebouwd (2026-08-26): status na PR #41

Gemerged via PR #41 (en de losstaande CI-fix-PR #40 ervoor). Deze spec klopt
op alle inhoudelijke punten (RPC-gebruik, schermflow, randgevallen-tabel,
scope-afbakening) zoals gebouwd — geen van de hierboven vastgelegde
acceptatiecriteria is losgelaten. Wel zijn er tijdens de Codex-reviewronde op
PR #41 vier state-patronen toegevoegd die deze spec niet voorzag, omdat ze pas
zichtbaar werden bij het combineren van React-state met live refetches — voor
een toekomstige spec die eenzelfde soort "gekozen item + achtergrond-refetch"
combinatie bouwt, zijn dit de patronen om naar te kijken:

- **`selectedMemberSnapshot`** (`VerkoopScherm.tsx`) — het gekozen lid wordt
  niet live afgeleid uit `useMembers()`'s array, maar in een losse snapshot
  bijgehouden. Reden: `useMembers().refetch()` (na `insufficient_balance` of
  een geslaagde afrekening) zet `members.status` eerst terug naar `"loading"`
  en leegt de array — een live afleiding zou het gekozen lid dan even `null`
  maken en de open afrekenbevestiging (die op een niet-`null` lid rendert)
  middenin de flow laten unmounten. De snapshot wordt pas ververst zodra een
  verse `"ready"`-lijst het lid opnieuw bevat, en alleen expliciet leeggemaakt
  bij een echte clear (wissel/succes/`member_not_found`).
- **`lastMemberId`**, los van `selectedMemberId` — nodig zodat `clearMember()`
  ("wissel") de vergelijkingsbasis voor de keep-mandje-logica (§2: opnieuw
  hetzelfde lid kiezen laat het mandje intact) niet zelf wegneemt.
  `selectedMemberId` wordt bij "wissel" `null`; `lastMemberId` overleeft dat
  bewust.
- **`productInfoCache`** (`VerkoopScherm.tsx`) — een alleen-aanvullende cache
  van productnaam/-prijs per id, los van de live productlijst. Zonder dit
  toonde een bestaande mandjeregel na een productrefetch (bv. na
  `product_not_available`, dat het gearchiveerde product uit de lijst
  filtert) ineens "onbekend product" à €0 in plaats van de laatst bekende
  naam/prijs — de spec-tekst bij die foutcode ("mandje blijft ongewijzigd")
  klopte dus niet zonder deze cache.
- **`rosterUnavailable`** naast `rosterEmpty` — de afrekenbevestiging/knop
  blokkeert niet alleen als de bezetting `"ready"` en leeg is, maar ook zolang
  de bezetting nog laadt of een foutstatus heeft. Zonder dit kon de
  afrekenbevestiging heel even opengaan zonder enige bekende bezetting (dus
  zonder picker én zonder automatische toewijzing).

Twee kleinere, niet-architecturale correcties op wat er letterlijk staat:
- De laag-saldo-markering in §2 ("visueel gemarkeerd, kleur") is in de bouw
  nooit kleur-only: de ledenkaart krijgt een tekstsuffix (" — laag saldo") en
  de zoekresultatenlijst een zichtbaar ⚠-icoon + sr-only-tekst naast de
  kleur — nodig om niet puur op kleur te leunen (WCAG AA, `check:a11y`).
  Geen gedragswijziging t.o.v. de spec-intentie, wel een concretere
  invulling dan "kleur" alleen.
- `AfrekenenOverlay.tsx` gebruikte in een tussentijdse versie per ongeluk het
  lichte canvas-thema in de donkere `Overlay`-context (nagenoeg onleesbare
  tekst); hersteld naar het gevestigde donkere-thema-patroon vóór merge. Geen
  spec-afwijking, gemeld voor de volledigheid van de PR-geschiedenis.

Zie `docs/ARCHITECTURE.md` → "Shells" voor de bijgewerkte navigatie- en
design-token-notities die uit dit ticket volgen.
