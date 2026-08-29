# Dienst afsluiten (overzicht + omzet)

Spec voor [issue #12](https://github.com/BramLambertJansen/ABAS/issues/12).
Volgt op #6–#10 (dienst starten, bezetting beheren, verkoopscherm,
laag-saldo-signalering, opwaarderen) — het genoemde "logische sluitstuk van
de bardienst-kernflow". Het ontwerp noemt "logt dit als auditgebeurtenis"
(`this.audit('Dienst afgesloten', ...)`, `designs/Bar App.dc.html` regel
2009) — dat is **geen scope hier**, zie Expliciet buiten scope: er bestaat
geen logboek/audit-trail in deze codebase
(`docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog niet is
besloten": *"Een dedicated audit-log screen (`Logboek`)"*), exact dezelfde
constatering die `docs/features/assortimentbeheer.md` en
`docs/features/negatieve-saldolimiet.md` al eerder maakten voor hun eigen
schrijfacties.

## Doel

Een bardienst/beheerder kan de actieve dienst afsluiten vanaf het gedeelde
bar-tablet, met vooraf een overzicht van wat er tijdens de dienst omging
(omzet, opwaarderingen, bezetting). Na bevestigen kan er zonder een nieuwe
dienst te starten niets meer verkocht of opgewaardeerd worden — dat laatste
staat al, ongewijzigd, in `place_order`/`top_up` sinds `0001_init.sql` (beide
weigeren met `shift_not_open` zodra `shifts.ended_at` niet meer `null` is).
Deze spec voegt uitsluitend de **trigger** toe (UI + het aanroepen van de
al bestaande `end_shift`-RPC) en het **overzicht** ervoor — geen nieuwe
handhavingslogica.

**Raakt de kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen als
volgt**: "geld beweegt alleen via RPC" is hier niet in het geding — `end_shift`
verplaatst geen geld, het zet alleen `shifts.ended_at`. De eigenlijke
geldhandhaving (geen `place_order`/`top_up` meer mogelijk) bestond al vóór
dit ticket en wordt door deze spec niet gewijzigd, alleen voor het eerst
daadwerkelijk bereikbaar via een UI-actie. "`served_by` komt uit de
bezetting" is hier evenmin van toepassing — afsluiten kent geen attributie
aan een specifiek lid (zie Rolzichtbaarheid voor waarom, en waarom dat
bewust consistent is met hoe `add_shift_member`/`remove_shift_member` al
werken).

## Betrokken shell

`shells/bar` alleen — zelfde reden als #6/#7/#8: er is geen dienst-concept in
`shells/portal` (CLAUDE.md → Domein). Het nieuwe component staat
shell-agnostic in een eigen map, `src/features/dienst-afsluiten/`, naast de
bestaande `src/features/dienst-starten/`, `src/features/bezetting-beheren/`
en `src/features/verkoop/` — zelfde "elke spec/issue zijn eigen featuremap"-
precedent als die drie (`docs/features/bezetting-beheren.md` → Betrokken
shell legt dit precedent al vast).

Concreet, in bestaande bestanden:

- **`src/features/bezetting-beheren/DienstActief.tsx`** (de "Dienst"-tab-
  inhoud) krijgt een tweede knop naast "Bezetting wijzigen":
  **"Dienst afsluiten"**. Opent het nieuwe overlay-component. Dit is
  bovendien waar de placeholder-restzin **"Verkoop en dienst afsluiten
  volgen in latere schermen."** verdwijnt — er is na dit ticket niets meer
  dat "volgt"; #8 had 'm bij het bouwen van Verkoop al voor de helft moeten
  bijwerken maar liet 'm ongewijzigd staan (geen bug om nu apart te melden,
  gewoon de laatste update van deze ene zin).
- **`src/features/verkoop/DienstTabs.tsx`** en **`DienstActief.tsx`** krijgen
  een nieuwe prop om het sluiten omhoog te melden (zie Schermflow §4 voor
  waarom dit prop-drilling nodig is, niet een gedeelde cache).
- **`src/features/dienst-starten/DienstStarten.tsx`** geeft zijn eigen
  `openShift.refetch` door als die nieuwe prop.

## Datamodel

**Geen schemawijziging, geen nieuwe migratie.** `shifts.ended_at` bestaat al
sinds `0001_init.sql`; `place_order`/`top_up` lezen 'm al (`shift_not_open`).
Er is niets te bevriezen of te berekenen bij het afsluiten zelf — de omzet
wordt gelezen uit de al bestaande `orders`/`top_ups`-rijen, niet apart
opgeslagen op de `shifts`-rij.

## RPC's

**`end_shift(p_shift_id uuid) returns void`** — bestaand, ongewijzigd,
sinds `0001_init.sql` (regel 181–188), vandaag nog zonder enige UI-trigger en
zonder eigen testdekking. Deze spec is de eerste consument:

```sql
create or replace function end_shift(p_shift_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update shifts set ended_at = now() where id = p_shift_id and ended_at is null;
$$;
```

- **Geen actorcheck** — bewust, consistent met de rest van de dienst-/
  bezetting-RPC's (`add_shift_member`/`remove_shift_member` controleren ook
  alleen het object, nooit wie de aanroep doet), niet met de ADR-0002-
  actorcheck-vorm van de beheerder-only RPC's (`update_negative_limit`,
  `create_product`, …) — dat patroon geldt voor de aparte e-mail-
  beheersessie, niet voor gewone dienstacties op de gedeelde tablet-sessie.
  Zie Rolzichtbaarheid voor de volledige redenering.
- **Idempotent/stil bij een al-gesloten dienst** — de `where ... ended_at is
  null`-guard zorgt dat een dubbele aanroep (bv. een dubbele tik tijdens een
  trage respons) geen fout geeft, gewoon nul rijen raakt. Dit is bestaand
  gedrag, geen wijziging; de UI voorkomt een dubbele aanroep sowieso door de
  knoppen tijdens `pending` te disablen (zelfde patroon als
  `AfrekenenOverlay.tsx`).
- **Geen wijziging nodig aan `place_order`/`top_up`** — hun `shift_not_open`-
  check bestaat al en is al pgTAP-getest (met een direct-gefabriceerde
  al-gesloten dienst-rij, niet via `end_shift` zelf — zie Testgevallen voor
  de aanvulling die dit ticket daarop doet, zelfde soort aanvulling als
  `docs/features/negatieve-saldolimiet.md`'s testgeval #2).
- **Geen nieuwe RPC voor het omzet-overzicht.** "Wat ging er om tijdens deze
  dienst?" is een leesvraag tegen al bestaande, `select`-toegestane tabellen
  (`orders`, `top_ups`, `shift_members`) — zelfde argumentatie als
  `docs/features/dienst-starten.md`/`bezetting-beheren.md` → RPC's:
  `authenticated` mag alles lezen (single-tenant), dus dit hoort in
  `src/hooks/queries/`, niet in een RPC. Dit raakt geen geld-*schrijf*pad
  (CLAUDE.md → Architectuurbeslissingen gaat over schrijven, niet lezen) —
  de bedragen die getoond worden zijn al door `place_order`/`top_up`
  server-side vastgelegd (`orders.total_cents`, `top_ups.amount_cents`); dit
  scherm telt ze alleen op voor weergave.

## Nieuwe leeshook: `useShiftSummary`

`src/hooks/queries/useShiftSummary.ts`, zelfde vorm/status-machine als
`useShiftMembers`/`useOpenShift` (`loading`/`error`/`ready` + `refetch`):

```ts
export type ShiftSummary = {
  salesTotalCents: number;   // sum(orders.total_cents) voor deze shift_id
  orderCount: number;        // count(orders) voor deze shift_id
  topUpsTotalCents: number;  // sum(top_ups.amount_cents) voor deze shift_id
};
```

Twee plat `select`s (`orders`, `top_ups`, beide `.eq("shift_id", shiftId)`),
opgeteld client-side na het ophalen — geen Postgres-aggregatie nodig gezien
de single-club-schaal (dezelfde "gewoon alles ophalen, geen paginering"-
afweging als `useMembers()`/`useProducts()`). Geen nieuwe RPC, zie hierboven.

**Wat hier bewust niet in zit** (en waarom "omzet" hier één cijfer is, niet
het ontwerp se opsplitsing in "op rekening"/"pin"): het ontwerp splitst
`shiftSummaryRows`/`shiftStatCards` in "Omzet op rekening" vs. "Omzet pin"
en "Opgewaardeerd pin" vs. "Opgewaardeerd Tikkie/bank" — die splitsing komt
uit een betaalwijze-concept (contant/pin-verkoop zonder lid, "Activiteiten")
dat expliciet nog niet gebouwd is (`docs/features/verkoop.md` → "Besloten:
contant/pin-verkoop zonder lid", issue #39 — niet in #12's
afhankelijkheden). Alle verkoop in deze codebase gaat vandaag via een
lid-saldo (`place_order` met verplichte `p_member_id`); er is dus maar één
soort omzet om te tonen. `top_ups` heeft vandaag ook maar één methode
(`"cash"`, hardcoded — `docs/ARCHITECTURE.md` → "Saldo opwaarderen"), dus
ook daar geen opsplitsing.

## Rolzichtbaarheid

Zelfde model als #6/#7 (dienst starten, bezetting beheren): **iedereen die
de gedeelde bar-tablet-sessie gebruikt tijdens een open dienst** kan de
dienst afsluiten — geen aparte weergave of extra restrictie per rol, en geen
restrictie tot de dienst-starter. Dit is een bewuste, met precedent
onderbouwde keuze, geen aanname:

- `docs/features/bezetting-beheren.md` → "Besloten: zelf-verwijdering" koos
  al expliciet **optie B (geen restrictie)** voor wie de bezetting mag
  wijzigen, met als motivatie dat dit past bij het gedeelde-tablet
  vertrouwensmodel (`docs/ARCHITECTURE.md` → "Shared bar-tablet session
  mechanism") — er is nergens in CLAUDE.md, ARCHITECTURE.md of een eerdere
  spec een "alleen de starter mag …"-regel vastgelegd voor welke
  dienstactie dan ook.
- `end_shift` zelf heeft, al sinds de oorspronkelijke schema-migratie (dus
  vóór dit ticket), geen actorcheck — exact hetzelfde patroon as
  `add_shift_member`/`remove_shift_member`. Dit ticket volgt dat bestaande
  patroon, het introduceert het niet.
- Er is geen "wie is nu aan het tablet"-identiteitsconcept in dit systeem
  buiten de bezetting zelf (geen PIN-per-actie na dienst-start, CLAUDE.md →
  Dienst & bezetting) — een "alleen starter mag afsluiten"-regel zou dus
  hoe dan ook niet hard afdwingbaar zijn zonder een nieuw
  identiteitsmechanisme te introduceren, wat buiten de scope van dit ticket
  valt.

Het omzet-overzicht zelf is even breed leesbaar: dezelfde `orders_select`/
`top_ups_select`/`shift_members_select`-policies die vandaag al gelden
(`to authenticated using (true)`, single-tenant) blijven ongewijzigd.

## Schermflow

### 1. Trigger — "Dienst afsluiten"-knop

In `DienstActief.tsx` ("Dienst"-tab), direct onder de bestaande
"Bezetting wijzigen"-knop, zelfde visuele vorm (min-h-11, volle breedte,
`border-rail-border`/`hover:border-accent`). Tik → opent
`DienstAfsluitenOverlay` (nieuw, `src/features/dienst-afsluiten/`).

### 2. Overzicht (overlay, `Overlay.tsx` — vierde consument)

Titel: **"Dienst afsluiten"**. Toelichting: **"Gestart door {shift.
startedByName} om {starttijd} — een overzicht van deze dienst voordat je
'm afsluit."** (Architect-geformuleerd, geen letterlijk ontwerp-citaat dat
1-op-1 past — zie "Nog te beslissen" onderaan voor waarom en wat dit voor
Bram betekent.)

Inhoud, in volgorde:

1. **Omzet-kaart** (grootste getal, zelfde visuele nadruk als het ontwerp se
   "OMZET DEZE DIENST"): `formatCents(salesTotalCents)`, onderschrift
   "{orderCount} bestelling(en)".
2. **Opgewaardeerd (contant)**: `formatCents(topUpsTotalCents)` — apart van
   omzet, want dit is geen verkoop maar contant ontvangen geld tegen
   saldo-opbouw (zie useShiftSummary hierboven voor de begripsafbakening);
   nuttig voor het tellen van de kassa aan het eind van de dienst, aangezien
   *alle* opwaarderingen vandaag contant zijn (#10).
3. **Bezetting**: dezelfde namenlijst als `DienstActief.tsx` al toont
   (`useShiftMembers(shift.id)`, hergebruikt, geen nieuwe leeshook) — dit
   vult AC "wie er meewerkte" in zonder duplicatie.
4. **Laadstaten**: `useShiftSummary`/`useShiftMembers` op `"loading"` tonen
   "Overzicht laden…" (`role="status"`, zelfde patroon als elders); op
   `"error"` een vaste NL-melding (`role="alert"`) — de "afsluiten"-knop
   blijft in dat geval bruikbaar (zie Randgevallen: het overzicht mag
   nooit een blokkade zijn voor de daadwerkelijke actie).

### 3. Bevestigen

Twee knoppen, zelfde paar-patroon als `AfrekenenOverlay.tsx`:

- **"annuleren"** — sluit de overlay, geen wijziging (`onClose`, disabled
  tijdens `pending` — zelfde reden als `AfrekenenOverlay.tsx`: niet
  unmounten terwijl de RPC nog loopt).
- **"dienst afsluiten"** (bewust *niet* het ontwerp se "afsluiten en
  afmelden" — er is geen los "afmelden"-concept in dit systeem: sluiten
  stuurt terug naar de stafkeuze van #6, niet naar een uitlogscherm voor een
  specifiek individu, want er is nooit een individu ingelogd geweest op de
  gedeelde sessie) — roept `end_shift(shift.id)` aan via de nieuwe
  `useEndShift()`-mutatiehook.

### 4. Na bevestigen

`end_shift` retourneert `void` — geen resultaat om te tonen. Bij succes:

- Overlay sluit (`onClose()`-equivalent, via het component zelf).
- **`onShiftEnded()`** wordt aangeroepen — een nieuwe prop die van
  `DienstStarten.tsx` naar beneden doorgegeven wordt
  (`DienstStarten` → `DienstTabs` → `DienstActief` →
  `DienstAfsluitenOverlay`). Dit is nodig, geen keuze: er bestaat geen
  gedeelde query-cache in deze codebase (`useOpenShift()` houdt zijn eigen
  lokale `tick`-state bij, zie `src/hooks/queries/useOpenShift.ts`) — een
  `refetch()` op een andere hook-instantie dan die van `DienstStarten` zou
  daar niets bijwerken. `DienstStarten` geeft z'n eigen
  `openShift.refetch` door als `onShiftEnded`; zodra die aangeroepen wordt,
  ziet `useOpenShift()` geen open dienst meer en rendert `DienstStarten`
  automatisch de stafkeuze van #6 — geen aparte navigatielogica nodig, dit
  is precies het bestaande "geen open dienst"-pad.
- Geen bevestigingstoast op het scherm waar je op landt (de stafkeuze) — het
  ontwerp toont dat wel (`justCompleted`/`toastLabel`), maar dat zou het
  sluiten-resultaat over de navigatiegrens heen moeten optillen naar
  `DienstStarten` (vergelijkbaar met issue #43's al-geaccepteerde
  state-verlies-over-tabgrenzen-afweging). Niet nodig om aan de
  acceptatiecriteria te voldoen — zie Expliciet buiten scope.

Bij fout (enkel `unknown` realistisch bereikbaar, zie Randgevallen):
overlay blijft open, foutmelding via `role="alert"`, knoppen weer
bruikbaar.

## Nieuwe mutatiehook: `useEndShift`

`src/hooks/queries/useEndShift.ts`, zelfde vorm als
`useAddShiftMember`/`useRemoveShiftMember` (booleaanse `Promise<boolean>`,
geen resultaatdata nodig — `end_shift` retourneert `void`):

```ts
export type EndShiftErrorCode = "unknown";
```

Geen andere foutcode dan `unknown` — `end_shift` zelf gooit nooit een
`raise exception` (zie RPC's), dus elke fout die hier terechtkomt is een
netwerk-/onverwachte fout. Zelfde `toErrorCode`-fallback-vorm als de andere
hooks, voor consistentie, ook al is de union hier triviaal klein.

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Dubbele tik op "dienst afsluiten" tijdens een trage respons | `useEndShift()`'s `pending`-status disabled beide knoppen, zelfde patroon als `AfrekenenOverlay`. Mocht de RPC toch twee keer aankomen: `end_shift` is idempotent (zie RPC's), geen dubbel effect. |
| Overlay geopend, dienst wordt in een andere sessie/tab tegelijk al gesloten (races met zichzelf; single-tablet dus zeldzaam) | `end_shift`'s `where ended_at is null`-guard raakt dan nul rijen — geen foutmelding vanuit de RPC zelf (`void`, geen check dat er iets veranderd is). De UI merkt dit pas bij de eerstvolgende `useOpenShift()`-refetch (na `onShiftEnded()`), niet eerder — geaccepteerd, zelfde soort race-afweging als issue #29 voor `start_shift`, niet apart afgedekt. |
| `useShiftSummary`/`useShiftMembers` kunnen niet laden (netwerkfout) terwijl de overlay al open is | Foutmelding in de overlay (`role="alert"`), maar **de "dienst afsluiten"-knop blijft bruikbaar** — een operator moet een dienst altijd kunnen afsluiten, ook als het overzicht zelf niet laadt; het overzicht is informatief, geen blokkade. Zelfde soort ontkoppeling als `AfrekenenOverlay.tsx`'s knoppen, die ook niet afhangen van elk leesgegeven. |
| Bezetting is leeg op het moment van afsluiten (zie `bezetting-beheren.md` → "Besloten: zelf-verwijdering") | Overzicht toont "Nog niemand" voor bezetting (zelfde tekst/patroon als `DienstActief.tsx` al gebruikt) — afsluiten blijft mogelijk, er is geen minimale-bezetting-eis. |
| Onafgerekend mandje open op de Verkoop-tab op het moment van afsluiten | **Geen waarschuwing hiervoor** — zie Expliciet buiten scope: het mandje leeft lokaal in `VerkoopScherm.tsx`'s eigen state, niet zichtbaar voor de Dienst-tab/dit overlay (`docs/ARCHITECTURE.md` → "First multi-screen bar navigation", issue #43). Een tik op "afsluiten" op de Dienst-tab terwijl er een mandje openstaat op de Verkoop-tab verliest dat mandje stilzwijgend zodra de stafkeuze terugkomt — exact hetzelfde gedrag als vandaag al bestaat bij het simpelweg wisselen van tab (geaccepteerd afweging, #43), dit ticket maakt dat gedrag niet erger. |
| `place_order`/`top_up` falen met `shift_not_open` **nadat** deze spec een echte sluit-trigger geeft | Bestaande foutafhandeling/-tekst ("de dienst is niet meer actief — herlaad het scherm", `messages.ts`) blijft ongewijzigd en volstaat — maar wordt door dit ticket voor het eerst **praktisch bereikbaar** in plaats van alleen theoretisch. `docs/features/verkoop.md` → Randgevallen en `docs/features/opwaarderen.md` → Randgevallen noemen deze foutcode nu nog "praktisch onbereikbaar vandaag — `end_shift` heeft nog geen UI-trigger (#12 niet gebouwd)"; die aantekening klopt na dit ticket niet meer. Geen wijziging aan die specs nodig voor de tekst/het gedrag zelf, wel een kleine correctie van die ene aantekening — noteren voor Docs/Tester, geen herziening van #8/#10's eigen scope. |
| `e2e/a11y.spec.ts`'s bestaande `ensureShiftStarted()`-helper (Randgevallen-comment: *"there's no end_shift UI"*) | Wordt met dit ticket feitelijk onjuist — er is nu wel een `end_shift`-UI. De helper zelf hoeft niet te wijzigen (hij *start* alleen een dienst, roept nooit zelf afsluiten aan), maar de a11y-scan voor dit nieuwe overlay-scherm bestaat nog niet. **Tester moet** een scenario toevoegen dat de "Dienst afsluiten"-overlay opent vóór het scannen (zelfde soort aanvulling als bij #7/#8's eigen overlays) én de code-comment bijwerken zodra dat scenario bestaat. |
| A11y van de nieuwe overlay in het algemeen | Zelfde eisen als elke `Overlay.tsx`-consument: `role="dialog"`, `aria-modal`, focus-trap, Escape/backdrop-tik sluit (tenzij `pending`, zie boven) — niets nieuws, `Overlay.tsx` regelt dit al generiek. |

## Expliciet buiten scope

- **Auditgebeurtenis/logboek** (`this.audit('Dienst afgesloten', ...)` uit
  het ontwerp) — niet-besloten scope, zie de inleiding hierboven en
  `docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog niet is
  besloten": *"Een dedicated audit-log screen (`Logboek`)"*. Dit ticket
  logt niets, nergens — geen nieuwe tabel, geen `console.log`-vervanger die
  later als audit-trail zou kunnen doorgaan.
- **"Vorige dienst afgesloten door X, om HH:MM"-banner** op de volgende
  stafkeuze (`lastClose`/`showLastClose` in het ontwerp,
  `docs/features/dienst-starten.md` → Expliciet buiten scope noemde dit al
  met de aantekening "hoort eerder bij #12") — bewust **niet** meegenomen in
  déze versie van #12. Dit zou een "wie sloot af"-identiteit vereisen die
  nergens anders in dit systeem bestaat: er is geen PIN-per-actie na
  dienst-start (CLAUDE.md → Dienst & bezetting) en, per Rolzichtbaarheid
  hierboven, bewust geen restrictie op wie mag afsluiten — er is dus niemand
  specifiek om als "afgesloten door" te crediteren zonder een nieuw
  identiteitsmechanisme te verzinnen dat deze spec niet motiveert. Een losse
  vervolgvraag voor Bram, geen impliciete aanname — zie "Nog te beslissen".
- **Contant/pin-verkoop zonder lid ("Omzet pin")** — #39, niet in #12's
  afhankelijkheden, zie `useShiftSummary` hierboven.
- **Activiteitstypes** (`currentActivityName`/`shiftActivityId` in het
  ontwerp) — niet-besloten scope, `docs/ARCHITECTURE.md` → "Wat het
  prototype deed maar hier nog niet is besloten".
- **Correcties/terugdraaien** (`correctionCount`, ↺ in het ontwerp) —
  niet-besloten scope, zelfde lijst: "Balance corrections and
  order-reversal flows".
- **Top-producten/`crewStatRows`/bonnen-per-bediener** uit het ontwerp se
  uitgebreidere dienstoverzicht — niet gevraagd door #12's
  acceptatiecriteria (die noemen uitsluitend omzet + bezetting), geen
  toevoeging zonder een reden.
- **Waarschuwing voor een onafgerekend mandje bij het afsluiten**
  (`openOrderWarning` in het ontwerp) — zie Randgevallen, gekoppeld aan
  issue #43 (mandje-state boven de tabgrens tillen), niet aan dit ticket.
- **Bevestigingstoast op de stafkeuze na het afsluiten** — zie Schermflow
  §4, geen acceptatiecriterium dat dit vereist.
- **Server-side afdwingen dat alleen de dienst-starter mag afsluiten** — zie
  Rolzichtbaarheid, bewust consistent met het al bestaande "geen
  restrictie"-precedent van #7.
- **Race-conditie-bescherming** (twee gelijktijdige sluit-pogingen,
  gelijktijdig starten van een nieuwe dienst vlak na het sluiten) — zelfde
  "geen scope"-afweging als issue #29 elders in deze codebase.

## `useShell()`-contract

Geen nieuwe invulling. `DienstAfsluitenOverlay` is de vierde consument van
`Overlay.tsx` (na bezetting-beheren, verkoop se afrekenbevestiging, en
opwaarderen) en gebruikt dezelfde, al bestaande `"modal"`-tak — nog steeds
geen `shells/portal`-consument om de `"sheet"`-tak tegen te bouwen.
`density`/`columns` worden hier niet nieuw ingevuld: het overzicht is een
verticale lijst kaarten, geen grid.

## Nog te beslissen

Geen van de open vragen hieronder blokkeert de rest van deze spec — de kern
(trigger, overzicht, handhaving) is met bestaande code/RPC's/precedenten
volledig te specificeren. Twee punten zijn het waard om aan Bram voor te
leggen vóór de Developer bouwt, zodat een latere correctie niet nodig is:

1. **Exacte teksten voor titel/toelichting van de overlay en de
   omzet-/opwaardeer-kaart-labels** zijn hierboven door de Architect zelf
   geformuleerd (net als `docs/features/negatieve-saldolimiet.md`'s
   `invalid_negative_limit`-melding dat eerder al was) — het ontwerp levert
   hier geen 1-op-1 bruikbare tekst omdat het ontwerp se versie leunt op
   concepten die niet gebouwd zijn (activiteit, pin-omzet, "afmelden" als
   individu). Als Bram een andere formulering wil, is dat een tekstwijziging
   in `DienstAfsluitenOverlay.tsx`, geen herziening van de rest van deze
   spec.
2. **De "vorige dienst afgesloten door X"-banner** (zie Expliciet buiten
   scope) is bewust weggelaten omdat er geen "wie sloot af"-identiteit
   bestaat gegeven de "geen restrictie op wie mag afsluiten"-keuze uit
   Rolzichtbaarheid. Mocht Bram dit tóch belangrijk vinden voor een latere
   iteratie, dan impliceert dat een van twee dingen die allebei een eigen
   beslissing (en mogelijk een ADR) verdienen: óf een nieuwe
   "wie bevestigde dit"-registratie los van de bezetting (een uitbreiding
   van het vertrouwensmodel), óf het simpelweg tonen van "afgesloten om
   HH:MM" zonder naam. Geen van beide is voor déze spec nodig — de
   acceptatiecriteria van #12 vragen niet om deze banner.

## Testgevallen (`db:test`)

Nieuw testbestand `supabase/tests/end_shift.test.sql` — eerste dekking voor
`end_shift`, dat sinds `0001_init.sql` geen eigen test had:

1. **Happy path**: een open dienst, `end_shift(shift_id)` aanroepen →
   `shifts.ended_at` is daarna niet meer `null`.
2. **Idempotent**: `end_shift(shift_id)` twee keer achter elkaar aanroepen
   op dezelfde dienst → geen fout bij de tweede aanroep, `ended_at` blijft
   het tijdstip van de eerste aanroep (niet overschreven door de tweede).
3. **Onbestaande dienst-id**: `end_shift(random_uuid())` → geen fout (0 rijen
   geraakt, bestaand `void`-gedrag), ter documentatie van dit randgeval.
4. **Sluit de lus met `place_order`/`top_up` (aanvulling op bestaande
   dekking, zelfde soort aanvulling als
   `docs/features/negatieve-saldolimiet.md`'s testgeval #2)**: een open
   dienst met een lid met voldoende saldo; roep `end_shift(shift_id)` aan;
   daarna `place_order`/`top_up` op diezelfde `shift_id` →
   `throws_ok(..., 'shift_not_open', ...)` voor beide. Dit bewijst AC #3
   ("geen nieuwe verkopen/opwaarderingen meer mogelijk na afsluiten") nu via
   het echte sluitpad, niet alleen (zoals `place_order.test.sql`/
   `top_up.test.sql` vandaag al doen) via een direct-gefabriceerde
   al-gesloten dienst-rij.
5. **Belt-and-braces**: directe `update shifts set ended_at = ...` als
   `authenticated` blijft geweigerd door het bestaande `REVOKE`
   (`0001_init.sql`, regel 137) — al gedekt door
   `rls_write_protection.test.sql`, alleen ter bevestiging dat dit
   ongewijzigd blijft, geen dubbele test.
