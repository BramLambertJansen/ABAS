# Logboek chronologisch en eerlijk over de reikwijdte

**Status: gebouwd en gemerged (PR #166, merge 47b645d).** Alle aanbevelingen
uit de vragen 1-10 zijn door Bram overgenomen ("Overnemen"); zie "Besluiten
van Bram" onderaan. Waar de bouw van de spec afwijkt staat dat in "Zoals
gebouwd" hieronder; die sectie wint van de tekst erboven (de spec is
bewaard als het ontwerp zoals het was goedgekeurd).

Spec voor [issue #130](https://github.com/BramLambertJansen/ABAS/issues/130)
(frontend T10 · P2, epic #121, findings F19, F20, F21, F22, productbesluit
D4). Gevalideerd tegen `main` op `ad20d32`. Bouwt voort op
[`logboek.md`](logboek.md) (#19) en
[`bestelling-terugdraaien.md`](bestelling-terugdraaien.md).

## Doel

Een beheerder ziet in het Logboek wanneer iets gebeurde (datum en tijd), wie
het deed, en welke historie er werkelijk is doorzocht. Een terugdraaiing is
een eigen gebeurtenis op het moment van terugdraaien, met de terugdraaier als
actor. Alleen leeslogica en presentatie: geen RPC, geen migratie, geen
schema, geen RLS-wijziging.

## Gelezen bronnen

- **Ticket #130** en epic #121 (D4: "Tijdlijn van boekingen én
  terugdraaiingen").
- **Wireframe** `designs/Bar App.dc.html` (Logboek, regel ~449-486, 2679,
  3110-3118): kent geen daggroepen en geen 200-melding. Per CLAUDE.md →
  Designbestanden is het in-app design system daarna de waarheid; afwijken is
  normale evolutie.
- **Code**: `src/features/logboek/{LogboekLijst.tsx,logboek.ts}`,
  `src/hooks/queries/useLogboek.ts`, `test/logboek.test.ts`,
  `src/hooks/queries/useMemberOrders.ts`,
  `src/features/bestelling-terugdraaien/LidBestellingenOverlay.tsx`,
  `src/lib/date.ts`, `src/lib/verversen.ts` (`PORTAL_TIME_ZONE`),
  `src/features/portal-dashboard/transacties.ts` (`methodLabel`,
  `groupByMonth`), `src/features/dienst-overzicht/{ledger.ts,Transactielijst.tsx}`,
  `supabase/migrations/0020_bestelling_terugdraaien.sql`, `0039_leespolicies_allowlist.sql`,
  `e2e/a11y.spec.ts`, `e2e/leesfouten-herstel.spec.ts`, `e2e/helpers/supabaseMock.ts`,
  `e2e/portaltransacties-consistent.spec.ts` (mockpatroon).
- **Kaders**: `CLAUDE.md`, ADR 0007 (leesrechten, nu 0039-allowlist), `logboek.md`
  (Logboek alleen beheerder; Assortiment/Leden bewust zichtbaar maar leeg,
  Bram 2026-09-25), `portaltransacties-consistent.md` (vaste tijdzone,
  uitlegtekst en "Teruggedraaid"-label in de portal).

## Validatie van de bevindingen op actuele main

### F19: tijd zonder datum. Bevestigd.

`clockLabel` (`logboek.ts`) geeft alleen `HH:MM`, de lijst is een platte
`<ul>` zonder groepen. `clockLabel` gebruikt `getHours/getMinutes`
(apparaattijd). Geen enkel bar-scherm groepeert per dag
(`dienst-overzicht` groepeert per uur binnen één dienst). Portal en
`LidBestellingenOverlay` verschillen onderling in tijdzone: de portal rekent
vast in `Europe/Amsterdam` (`PORTAL_TIME_ZONE`, T09/T08), de overlay en
`src/lib/date.ts` in apparaattijd. Zie vraag 2.

### F20: terugdraaien op tijdstip en actor van de oorspronkelijke verkoop. Bevestigd.

`useLogboek` leest `order_reversals(reason, via, reverser)` alleen als embed
op `orders` en niet `order_reversals.created_at`. De rij krijgt daardoor
`createdAt` en `servedByName` van de verkoop, terwijl de tekst "Bestelling
teruggedraaid" zegt en de reden de terugdraaier noemt. Daarnaast bepaalt
`orders ... limit(200)` welke reversals zichtbaar zijn: een reversal van een
order die buiten de nieuwste 200 orders valt verschijnt niet. Dit is een echte leesbug, geen alleen-presentatie.

### F21: limieten onzichtbaar. Bevestigd.

- Logboek: `LOGBOEK_LIMIT = 200`, stille cap (`logboek.md` noemt dat
  letterlijk "een stille cap"; dit ticket draait die beslissing bewust om).
  De kop zegt "{n} handelingen", zoeken en filteren zijn client-side over die
  200.
- Beheer terugdraaien: `MEMBER_ORDERS_LIMIT = 50` (`useMemberOrders`), de
  overlay zegt nergens dat oudere bestellingen ontbreken.

### F22: lege filters beloven registratie. Bevestigd.

`logboekEmptyState` geeft voor Assortiment en Leden (en voor een lege
installatie) "elke handeling in de app komt hier te staan, met naam en tijd
erbij". Er is geen databron en geen auditlogging. Alles en Geld zijn
bewust identiek (Bram, #19); dat blijft.

### Extra bevindingen die het issue niet noemt

1. **Betaalmethode toont rauw `cash`.** `describeRow` zet
   `entry.method` onvertaald in de detailtekst ("+€25,00 · cash ·
   Jan"). De portal heeft een privé `methodLabel` ("cash" naar "contant");
   daarom noemt het issue "Nederlandse betaalmethode". Zelfde fout staat in
   `dienst-overzicht/Transactielijst.tsx` (regel 179, "opgewaardeerd · cash").
   Zie vraag 7.
2. **Rij-id botst straks.** `LogboekRow` gebruikt `entry.id` als key. Een
   reversal-gebeurtenis en zijn verkoop delen het order-id; keys moeten het
   soort bevatten.
3. **Sortering van de samengevoegde lijst** is `Date.parse` zonder
   tiebreaker. Bij gelijke timestamps is de volgorde niet deterministisch;
   nodig voor stabiele tests en lijst.
4. **Dienst-overzicht `clockLabel`** (`ledger.ts`) is apparaattijd en blijft
   buiten deze ticketscope (zie "Buiten scope").

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC.** Alleen lezen. Er komt geen berekening bij:
  het Logboek toont `total_cents`/`refunded_cents`/`amount_cents` zoals de
  database ze levert, telt niets op en toont geen omzet. Een reversal is een
  eigen gebeurtenis met een eigen rij; die wordt nergens bij de verkoop
  opgeteld of ervan afgetrokken ("geen dubbeltelling alsof een reversal nieuwe
  omzet is": er is geen omzetgetal in het Logboek, en een reversal krijgt geen
  plusbedrag).
- **`served_by` uit de bezetting.** Niet geraakt. De verkoop toont `served_by`
  (bezetting, zoals de RPC destijds valideerde), de reversal toont
  `reversed_by` (bezetting op de bar, beheerder via beheer). Het wordt
  uitdrukkelijk niet meer door elkaar gehaald: de actor van een reversal-rij is
  de terugdraaier.
- **Rolzichtbaarheid.** Ongewijzigd: de Logboek-tab alleen voor
  `beheerder` (`logboek.md` punt 5; `BeheerTabs.tsx`). Het leescontract
  verandert niet: `order_reversals` wordt nu ook rechtstreeks geselecteerd
  (policy `order_reversals_select` uit 0039: `caller_has_bar_role()` of
  eigenaar van de order), dezelfde rechten als de bestaande `orders`-embed.
  Geen policy- of grantwijziging, dus geen `check:rls`/`db:test`-werk.
- **Portal/bar-isolatie, auth, PIN.** Niet geraakt.

## Betrokken shell

`shells/bar` (binnen `/beheer`) alleen: `LogboekLijst`, `logboek.ts`,
`useLogboek`, en `LidBestellingenOverlay` + `useMemberOrders`. Gedeelde
helpers in `src/lib/`. Geen portalwijziging, behalve (vraag 7) het
verplaatsen van `methodLabel` naar een gedeelde helper.

## Besluiten (conventioneel of door het issue vastgelegd)

Deze neem ik zelf, ze vragen geen akkoord van Bram:

1. **Gebeurtenissentijdlijn**, in de vorm van D4's aanbevolen richting (let
   op: D4 is een productbesluit, zie vraag 1 voor het akkoord). Technisch:
   `LogboekEntry.kind` wordt `"verkoop" | "opwaardering" | "terugdraaiing"`.
2. **Eén tijdlijn, drie bronnen.** `useLogboek` doet drie platte selects,
   elk op eigen tijdstip aflopend en met eigen cap, samengevoegd en
   gesorteerd op gebeurtenistijdstip:
   - `orders` op `orders.created_at` (zoals nu, incl. embed
     `order_reversals(order_id)` om te weten dat een verkoop later is
     teruggedraaid);
   - `top_ups` op `top_ups.created_at` (zoals nu);
   - **nieuw** `order_reversals` op `order_reversals.created_at`, met
     `reason, via, refunded_cents, created_at, reverser:members!reversed_by(name)`
     en een embed op de oorspronkelijke bestelling (`orders`: `id`,
     `created_at`, lid, aantal items, productnamen voor zoeken). De Developer
     controleert de exacte PostgREST-embedsyntax (de twee FK's
     `member_id`/`served_by` naar `members` moeten per kolom benoemd, zoals
     `useShiftLedger` dat al doet) tegen de lokale database; zie testplan.
3. **De cap werkt op gebeurtenissen, per bron.** Elke bron haalt de
   `LOGBOEK_LIMIT + 1` nieuwste rijen op; samenvoegen; sorteren; de
   nieuwste 200 tonen. Dat is aantoonbaar correct: elk element van de
   gemeenschappelijke top 200 staat ook in de top 200 van zijn eigen bron
   (zou het er niet in staan, dan zijn er 200 nieuwere in dezelfde bron). Een
   reversal van een zeer oude order staat op zijn eigen `created_at` bovenaan,
   ook als de order zelf buiten de 200 valt, omdat de reversalbron niet via de
   orders loopt.
4. **"Beperkt"-vlag exact.** Omdat elke bron 201 ophaalt, weet de hook
   precies of er meer bestaat: `beperkt = samengevoegd.length > 200`. Dan
   toont het scherm de reikwijdtemelding (zie hieronder); is de hele
   administratie geladen (200 of minder), dan staat er geen melding. De hook
   levert `beperkt: boolean` en de constante `LOGBOEK_LIMIT` hergebruikt de
   UI (geen getal in de tekst dat los van de constante leeft).
5. **Tiebreaker.** Gelijke tijdstip: nieuwste id eerst, en een reversal
   altijd boven zijn eigen verkoop. Deterministisch voor tests.
6. **Keys**: `${kind}:${id}` (reversal: order-id), nooit het kale id.
7. **Dagen en tijd** in één vaste zone (vraag 2, aanbeveling
   `Europe/Amsterdam`), via nieuwe pure helpers in `src/lib/date.ts`
   (bestaand bestand, eerst hergebruiken): dagsleutel (`yyyy-mm-dd` uit
   `Intl.DateTimeFormat(...).formatToParts` met `timeZone`), dagkop, en
   `HH:mm` met `hourCycle: "h23"`. De zone-constante komt op één plek; de
   portal verwijst er desgewenst naar (`PORTAL_TIME_ZONE` in `verversen.ts`
   niet dupliceren). Dag-/jaargrenzen en zomertijd volgen daardoor de zone,
   niet het apparaat of de CI-runner.
8. **Groepering**: aaneengesloten gebeurtenissen met dezelfde dagsleutel (de
   lijst is al gesorteerd; geen tweede sortering in de UI). Per dag een
   `<section aria-labelledby>` met een `h2`-dagkop en daaronder de `ul`
   (patroon van `TransactiesTab`: `section aria-label` per groep). Het
   **jaar** staat in de dagkop wanneer het jaar niet het huidige jaar (in
   dezelfde zone) is. "Huidig jaar" is een invoerparameter van de pure
   functie (`nu`), zodat tests deterministisch zijn.
9. **Gebeurtenisrijen** (hergebruik `InitialsAvatar`, geen nieuw component):
   - **Verkoop** (ongewijzigd): tag SALDO, "Bestelling op saldo", detail
     "{n} item(s) · {lid | Losse verkoop}", avatar en `sr-only` "door" =
     `served_by`. Is de verkoop later teruggedraaid: de actie
     doorgehaald en een zichtbare tekst "Teruggedraaid" (zelfde woord als in
     de portal; niet alleen kleur of doorhaling). Dit is een status, geen
     nieuwe gebeurtenis en geen bedrag.
   - **Opwaardering** (ongewijzigd, behalve de betaalmethode): tag SALDO,
     "Saldo opgewaardeerd", detail "+€{bedrag} · contant · {lid}".
   - **Terugdraaiing** (nieuw): tag LET OP, de bestaande nadruk
     (linkerrand, tint), tijd = `order_reversals.created_at`, avatar en
     `sr-only` "door" = **terugdraaier**, actie "Bestelling teruggedraaid",
     detail: reden, "door {terugdraaier} via bar|beheer", en een verwijzing
     naar de oorspronkelijke bestelling: "Bestelling van {dagdatum} {tijd}
     · {lid | Losse verkoop}" (de datum van de verkoop volgt dezelfde
     dagkopafspraak, jaar erbij als niet huidig jaar). Of het bedrag
     getoond wordt: vraag 4.
10. **Filters**: Alles en Geld blijven identiek (alle gebeurtenissen, incl.
    reversals; Bram, #19). **Aandacht** toont de terugdraai-gebeurtenissen
    (voorheen: de verkopen die een reversal hadden; gedragswijziging, zie
    vraag 6). Assortiment en Leden blijven zichtbaar en leeg, maar met
    eerlijke tekst (vraag 5). Chips blijven `aria-pressed`-knoppen in een
    `role="group"`.
11. **Zoeken** blijft client-side over de geladen gebeurtenissen en matcht op
    lidnaam, actor, productnamen en de actietekst; voor een reversal ook
    reden en de naam van de terugdraaier. De naam van de oorspronkelijke
    verkoper wordt niet getoond en niet doorzocht (voorkomt verwarring met de
    actor).
12. **Telling in de kop** blijft "{n} handelingen" / "{x} van {n}
    handelingen", waarbij een reversal als eigen handeling meetelt. Is het
    resultaat beperkt dan staat er "meest recente" bij (zie teksten).
13. **Herbruikbaar, niet opnieuw bouwen**: `LeesFout`, `useLeesHerstel`,
    `loadErrorMessage`/`reportClientError`, `InitialsAvatar`. De hook houdt de
    bestaande foutafhandeling: één mislukte bron is één leesfout voor het hele
    scherm (er wordt nooit een gedeeltelijke tijdlijn getoond zonder dat te
    zeggen). `useOpslaanBlokkade`, `TekstVeld`/`VeldFout`, `Overlay` en
    `verversen.ts` zijn hier niet van toepassing (geen formulier, geen nieuw
    dialoog; `verversen.ts` alleen de zone-constante, zie besluit 7).
14. **Beheer terugdraaien (F21b)**: `useMemberOrders` haalt
    `MEMBER_ORDERS_LIMIT + 1` op, toont er 50 en levert `beperkt`. De overlay
    toont bij `beperkt` een zichtbare regel boven of onder de lijst (tekst:
    vraag 5). Bij 50 of minder orders geen melding. Zoeken bestaat daar niet.
    De tijd in `OrderRow` gebruikt dezelfde dag-/tijdhelper als het Logboek
    (vraag 2); de overlay toont nu `formatDate` + `clockLabel`.

## Teksten

Cursief = voorstel, zie vragen 3, 5 en 7 voor bevestiging. Ontbrekende
waarden volgen de bestaande conventies (geen "onbekend" waar het schema
`null` toestaat).

| Plek | Tekst |
|---|---|
| Reikwijdte, altijd (onder de kop) | *"Verkopen, opwaarderingen en terugdraaiingen van alle diensten."* |
| Reikwijdte, alleen bij `beperkt` (zelfde regel, zichtbaar, geen `sr-only`) | *"Alleen de meest recente 200 handelingen. Zoeken en filteren werkt alleen binnen die 200."* |
| Kop-telling | "{n} handelingen" / "{x} van {n} handelingen"; bij `beperkt` *"meest recente 200 handelingen"* / *"{x} van de meest recente 200"* |
| Lege staat, niets in de database | *"Nog niets vastgelegd"* / *"Verkopen, opwaarderingen en terugdraaiingen komen hier te staan, met naam en tijd erbij."* |
| Zoeken/filter geeft niets | "Niets gevonden" / bij niet-beperkt "Andere filter of zoekterm probeert het opnieuw" (ongewijzigd); bij `beperkt` *"Niets gevonden in de meest recente 200 handelingen. Oudere staan niet in dit overzicht."* |
| Chip Assortiment | *"Nog niet geregistreerd"* / *"Wijzigingen aan het assortiment worden nog niet in het logboek vastgelegd."* |
| Chip Leden | *"Nog niet geregistreerd"* / *"Wijzigingen aan leden worden nog niet in het logboek vastgelegd."* |
| Dagkop, huidig jaar | *"dinsdag 29 september"* |
| Dagkop, ander jaar | *"dinsdag 29 september 2025"* |
| Beheer-overlay, bij `beperkt` | *"Alleen de laatste 50 bestellingen van {naam} staan hier. Oudere bestellingen zijn niet te zien in beheer."* |
| Betaalmethode | "contant" (`cash` wordt nooit rauw getoond; onbekende methode: de waarde zelf, zoals de portal) |

De regel voor Assortiment/Leden volgt de afspraak uit het issue (filters
blijven, eerlijke uitleg). De tekst "Nog niets vastgelegd" met "elke
handeling in de app komt hier te staan" verdwijnt overal, ook voor
Assortiment/Leden.

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Orders van verschillende dagen en jaren | Aparte dagkoppen; jaar in de kop als het niet het huidige jaar (zone) is. |
| 31 dec 23:30 UTC / 1 jan 00:30 Amsterdam | Onder 1 januari van het nieuwe jaar. |
| 30 sep 22:30 UTC / 1 okt 00:30 Amsterdam (zomertijd) | Onder 1 oktober. |
| Overgang zomer-wintertijd (25 okt 2026, 25-uursdag; 29 mrt 2026) | Gebeurtenissen om 02:30 (twee keer) staan onder dezelfde dag, correct gesorteerd op echt tijdstip; geen verdwenen of dubbele dag. |
| Reversal van een order die buiten de 200 recente orders valt | Verschijnt op de reversaltijd, met verwijzing naar de oorspronkelijke bestelling (de order-embed levert de gegevens). De verkooprij zelf staat er niet. |
| Reversal én verkoop beide binnen de 200 | Twee rijen: de verkoop (met "Teruggedraaid") op zijn tijd, de reversal op zijn tijd. Beide tellen als handeling. |
| Reverser is een ander dan de verkoper | Avatar en "door" van de reversal-rij = terugdraaier; de verkoper komt niet voor in de reversalrij. |
| Reversal op dezelfde minuut als de verkoop | Reversal boven de verkoop (besluit 5). |
| Losse verkoop (`member_id` null) | "Losse verkoop", zoals nu. |
| Reden leeg/null (kan volgens 0020 niet) | Geen hangende " · "; regel valt weg. |
| Exact 200 gebeurtenissen in totaal | Niet beperkt, geen melding (limit +1-aanpak). |
| 201 of meer | `beperkt`, melding zichtbaar, de oudste valt weg. |
| Filter + zoekterm + beperkt | Resultaat is "binnen de meest recente 200"; lege staat noemt dat. |
| Eén van de drie bronnen faalt | Hele scherm in leesfoutstaat met herstelknop (bestaand patroon); nooit een stil onvolledige lijst. |
| Bardienst | Ziet de Logboek-tab niet (ongewijzigd, `BeheerTabs`). |
| Teruggedraaide verkoop, bedrag | Geen berekening; het Logboek telt nergens op. |
| Veel records (200+ per bron, 600 opgehaald, 200 getoond) | Alleen de nieuwste 200 gerenderd; geen virtualisatie nodig. |
| Langs een dagwissel met geopend scherm | De dagkop volgt de rijen, niet de klok; "huidig jaar" wordt bij render bepaald. Geen live herberekening nodig. |

## Datamodel, RPC's, ADR

- **Geen datamodelwijziging, geen RPC, geen migratie, geen RLS-wijziging.**
  Het scherm leest drie tabellen die elke `bardienst`/`beheerder` al mag
  lezen (0039), de UI beperkt het tot de beheerder (`logboek.md`). `check:rls`,
  `db:test`, `rpc_catalogus` blijven onaangeroerd.
- **Geen ADR.** D4 is een product- en presentatiebesluit binnen bestaande
  beslissingen; de vaste tijdzone is een helperkeuze (zelfde afweging als
  `portaltransacties-consistent.md`). De spec werkt `logboek.md` bij zodra
  gebouwd: de passages "stille cap", "Nog niets vastgelegd" en "Aandacht =
  verkoop met reversal" worden vervangen door verwijzing naar dit document
  (Docs-rol).
- **Gate-signaal.** Datum-/tijdweergave via één zone-helper is een
  testbare eis; `portaltransacties-consistent.md` noemde dit al als
  gate-kandidaat zodra meer dan drie schermen datums tonen. Met Logboek,
  beheeroverlay en de bestaande portal-schermen zijn dat er nu meer dan
  drie. Voorstel (niet in deze ticket): een `check:policy`-regel die
  `getHours`/`getFullYear`/`toLocale*String` zonder `timeZone` buiten
  `src/lib/date.ts` verbiedt. Aan Bram of de Architect-rol dit apart oppakt.

## Afstemming met andere tickets

- **T08 (#128, gebouwd)**: `useLeesHerstel`/`LeesFout` blijven; de hook
  houdt de stale-/foutstaten. De drie bronnen worden binnen dezelfde
  `load()` opgehaald zodat het gedrag "laatste request wint" gelijk blijft.
- **T07 (#127, gebouwd)**: zoekveld en chips behouden hun a11y; het Logboek-
  zoekveld valt buiten dat ticket (`invoerfeedback-zoeken-filters.md`:
  "Zoeken in LogboekLijst" is buiten scope). Niet aanraken behalve de
  lege-staatteksten.
- **T09 (#129, gebouwd)**: de tijdzone (`PORTAL_TIME_ZONE`), "Teruggedraaid"
  als woord en `methodLabel` worden gedeeld in plaats van gedupliceerd.
- **T11 (#131)**: raakt beheerformulieren en catalogus, niet het Logboek;
  geen conflict. **T12 (#132)**: contrast van de LET OP-tint en pill; deze
  spec voegt geen nieuwe kleuren toe.

## Teststrategie

- **Unit** (`test/logboek.test.ts`, `npm run test`, deterministisch ongeacht
  `TZ` van de machine): bestaande tests omzetten (de fixtures met `reversal`
  op een verkoop worden een reversal-gebeurtenis), niet schrappen. Nieuw:
  `groepeerPerDag` met jaar-/maand-/daggrens (31 dec 23:30Z naar 1 jan;
  30 sep 22:30Z naar 1 okt), zomer-/wintertijdovergang (24/25/26 oktober 2026,
  28/29 maart 2026), jaar in de kop alleen bij ander jaar (met vaste `nu`),
  tiebreaker (zelfde timestamp: reversal boven verkoop, id-volgorde),
  samenvoegen van drie bronnen met cap (late reversal van zeer oude order
  staat op reversaltijd, ook als `orders` die order niet bevat),
  `beperkt` bij 200 (onwaar) en 201 (waar), actor van de reversal is de
  terugdraaier en niet de verkoper, Aandacht = alleen reversals, Geld = Alles,
  Assortiment/Leden altijd leeg met hun eigen tekst, zoeken op reden en
  terugdraaier, geen "cash" in de uitvoer, geen hangend scheidingsteken bij
  lege reden. Een eigen kleine test voor de dagsleutel/-kop in
  `test/date.test.ts` (nieuw of bestaand).
- **Gemockte e2e** (nieuw: `e2e/logboek-chronologisch.spec.ts`, patroon van
  `e2e/portaltransacties-consistent.spec.ts` en `helpers/supabaseMock.ts`,
  `page.route()` op `/rest/v1/orders`, `top_ups`, `order_reversals`; beheerder-
  sessie met aal2): (1) gebeurtenissen van meerdere dagen en jaren geven
  `h2`-dagkoppen met de juiste jaarweergave en tijd per rij; (2) een
  reversal van een zeer oude order (order niet in de mock van `orders`)
  staat op de reversaldatum met reden, terugdraaier en verwijzing; (3) een
  andere terugdraaier dan verkoper (avatar-naam via `title` en "door" voor
  screenreaders); (4) 201 gebeurtenissen: melding "meest recente 200"
  zichtbaar en 200 rijen gerenderd; 200: geen melding; (5) filter Aandacht +
  zoekterm; Assortiment/Leden tonen "Nog niet geregistreerd" en niet
  "elke handeling in de app"; (6) "contant" in plaats van "cash"; (7) een
  mislukte `order_reversals`-bron geeft de leesfout met herstel; (8) in de
  beheer-overlay (`LidBestellingenOverlay`) met 51 orders: melding "laatste
  50" en 50 rijen; bij 50 geen melding; (9) a11y-axe op de Logboek-tab met
  dagkoppen en reversalrij (bestaande test in `e2e/a11y.spec.ts` uitbreiden,
  geen nieuw scenario-type).
- **Echte database (Tester, handmatig of bestaande integratielaag)**: de
  geneste embeds van de nieuwe `order_reversals`-select (reverser, order,
  lid) tegen lokale Supabase met de seed: een mock bewijst PostgREST-syntax
  niet. Met een beheerder-sessie: reversal van een oude order komt boven
  recente verkopen; bardienst ziet geen Logboek-tab; geen RLS-fout bij
  `order_reversals` met embed op `orders`. Zie vraag 9 voor wie dit doet.
- **Handmatig** (Tester): ma-zo met echte lokale seed, tablet 768px en
  1024px (dagkoppen en reversalrij breken af, geen horizontale overflow,
  reikwijdtemelding zichtbaar zonder scrollen), toetsenbord door de chips en
  koppen, schermlezer leest "door {terugdraaier}" bij een reversal.
- **Reviewwerk**: dat het Logboek nergens een bedrag berekent of optelt en dat
  reversal-rijen geen plusbedrag tonen.

## Expliciet buiten scope

- Paginering, periodekeuze of datumfilter ("laad oudere"): vervolgbesluit
  als 200/50 in de praktijk te krap blijkt.
- Echte auditlogging voor assortiment/leden en het verwijderen van die
  filters: apart productbesluit (`logboek.md`).
- Alles en Geld onderscheiden: bewust identiek.
- Het tonen van omzet, saldo of nettosommen in het Logboek.
- Aanpassen van `useShiftLedger`, de dienst-overzicht-weergave van
  reversals en `ledger.ts`'s `clockLabel` (apparaattijd): blijft zoals het is;
  op een tablet in NL geeft dat dezelfde klok. Eventueel later door de
  gate uit "Gate-signaal" afgedwongen.
- Reden en terugdraaier tonen in `LidBestellingenOverlay`-rijen die al zijn
  teruggedraaid: niet gevraagd.
- Nieuwe RPC's, nieuwe indexen (zie vraag 8) of RLS-aanpassingen.
- Server-side zoeken.

## Bestanden (indicatie, geen code)

- `src/hooks/queries/useLogboek.ts`: derde bron `order_reversals`, limit +1,
  `beperkt`, nieuw `kind`, tiebreaker, keys.
- `src/features/logboek/logboek.ts`: `describeRow` per kind, daggroepering,
  filter-/zoeklogica, lege staten, tellingtekst, exports voor teksten en
  `LOGBOEK_LIMIT`; `clockLabel` vervalt of wordt de zone-helper.
- `src/features/logboek/LogboekLijst.tsx`: `section`/`h2` per dag, reikwijdte-
  regel, reversalrij, statuslabel "Teruggedraaid" op de verkoop.
- `src/lib/date.ts`: zone-helpers (dagsleutel, dagkop, tijd); zone-constante
  gedeeld met `src/lib/verversen.ts`.
- `src/lib/betaalmethode.ts` (nieuw, vraag 7) met `methodLabel`;
  `portal-dashboard/transacties.ts` (en eventueel `Transactielijst.tsx`)
  gebruiken die.
- `src/hooks/queries/useMemberOrders.ts` en
  `src/features/bestelling-terugdraaien/LidBestellingenOverlay.tsx`: `beperkt`,
  melding, tijdhelper.
- Tests: `test/logboek.test.ts`, `test/date.test.ts`, `e2e/logboek-chronologisch.spec.ts`,
  aanvulling `e2e/a11y.spec.ts`; `test/transacties.test.ts` bij verplaatsen van
  `methodLabel`.
- Docs (Docs-rol, na bouw): `docs/features/logboek.md` bijwerken.

## Besluiten van Bram

Bram heeft bij alle tien vragen de aanbeveling overgenomen ("Overnemen").
De vraagtekst en motivatie staan hieronder ingekort; de tekstvoorstellen
in de tabel "Teksten" zijn hiermee vastgesteld.

1. **D4: gebeurtenissentijdlijn.** Aanbeveling overgenomen: een
   terugdraaiing is een eigen regel op het moment van terugdraaien, de
   verkoop blijft staan met "Teruggedraaid".
2. **Tijdzone.** Aanbeveling overgenomen: vast `Europe/Amsterdam` voor het
   Logboek en `LidBestellingenOverlay`, in `src/lib/date.ts`; `ledger.ts` en
   `formatDate`/`formatTime` elders blijven ongewijzigd.
3. **Dagkop.** Aanbeveling overgenomen: "dinsdag 29 september", jaar erbij
   als het niet het huidige jaar is, geen "Vandaag/Gisteren".
4. **Reversalrij toont bedrag.** Aanbeveling overgenomen: "€ X
   teruggeboekt" (`refunded_cents` ongewijzigd, geen teken, niet opgeteld).
5. **Teksten reikwijdte en lege filters.** Aanbeveling overgenomen: zoals in
   de tabel "Teksten".
6. **Aandacht-filter.** Aanbeveling overgenomen: toont de
   terugdraai-gebeurtenissen.
7. **Betaalmethode.** Aanbeveling overgenomen: gedeelde helper
   `src/lib/betaalmethode.ts`, ook in de portal en
   `dienst-overzicht/Transactielijst.tsx`.
8. **Index op `order_reversals.created_at`.** Aanbeveling overgenomen: nu
   geen index; bij groei een apart backendticket.
9. **Echte leescheck.** Aanbeveling overgenomen: de Tester draait de echte
   select handmatig tegen de lokale seed, geen nieuwe integratietest.
10. **Gate voor datum-/tijdzone.** Aanbeveling overgenomen: een
    `check:policy`-ticket volgt apart, buiten deze PR.

## Zoals gebouwd

Gebouwd in PR #166 (issue #130, T10, epic #121), merge `47b645d`. Geen
RPC, migratie, schema- of RLS-wijziging, zoals gespecificeerd. Verschillen
met de spec hierboven, gecontroleerd tegen de code op `main`:

### Modules en grenzen

- **Samenvoeglogica staat in `src/hooks/queries/logboekSamenvoegen.ts`**, niet
  in `features/logboek/logboek.ts`. Inhoud: `logboekKey` (`${kind}:${id}`),
  `vergelijkLogboek` en `voegLogboekSamen(bronnen, limit)` die `{ entries,
  beperkt }` geeft (`beperkt = samengevoegd.length > limit`). Het bestand
  importeert alleen het type `LogboekEntry` uit `useLogboek` en geen
  Supabase, zodat Node's testrunner het kan laden.
- **`src/hooks/queries/` importeert niets uit `src/features/`** (nagelopen:
  geen enkele import van `@/features` of `../features` in `src/hooks`). De
  richting is `features/logboek` naar `hooks/queries`, nooit andersom; daarom
  woont de samenvoeging in de hook-laag en niet in `logboek.ts`, dat de hook
  anders zou moeten importeren.
- **`src/lib/betaalmethode.ts`** (nieuw): `methodLabel` ("cash" wordt
  "contant", onbekende waarde ongewijzigd, `null` wordt `""`). Verplaatst uit
  `portal-dashboard/transacties.ts`; ook gebruikt door `logboek.ts` en
  `dienst-overzicht/Transactielijst.tsx` (was: "opgewaardeerd · cash").
- **`src/lib/date.ts`**: nieuwe helpers `dagSleutel(iso)` ("yyyy-mm-dd"),
  `dagKop(iso, nu)` ("dinsdag 29 september", jaar erbij als het niet het jaar
  van `nu` is) en `klokTijd(iso)` ("HH:mm", `hourCycle: "h23"`), alle in
  `Europe/Amsterdam`. De zone-constante is `PORTAL_TIME_ZONE` uit
  `src/lib/verversen.ts` (niet gedupliceerd); `date.ts` importeert die met een
  relatief pad en `.ts`-extensie voor Node's testrunner. `formatDate` en
  `formatTime` bleven apparaatzone en ongewijzigd, net als `ledger.ts`.
- `useMemberOrders` exporteert `MEMBER_ORDERS_LIMIT` (al zo) en levert nu
  `beperkt`; hij haalt `MEMBER_ORDERS_LIMIT + 1` op en toont er 50.

### Typen en functies (andere vorm dan geschetst)

- **`LogboekEntry`** (`useLogboek.ts`) heeft `actorId` en `actorName` (de
  `served_by` bij verkoop/opwaardering, de terugdraaier `reversed_by` bij een
  terugdraaiing) in plaats van `servedById/servedByName`, plus
  `reversed: boolean` (alleen verkoop: later teruggedraaid) naast
  `reversal: LogboekReversal | null` (`reason`, `via`, `refundedCents`,
  `originalCreatedAt`). `kind` is `"verkoop" | "opwaardering" |
  "terugdraaiing"`.
- **`describeRow(entry, nu)`** neemt `nu: Date` mee (voor het jaar in de
  verwijzing naar de oorspronkelijke bestelling) en geeft `{ tag, action,
  detail, statusLabel }`. `statusLabel` is "Teruggedraaid" bij een verkoop met
  `reversed` (doorgehaalde actie plus zichtbare tekst in de detailregel).
- **Reversal-detail**: `{reden} · door {terugdraaier} via bar|beheer · {bedrag}
  teruggeboekt · Bestelling van {dagkop} {tijd} · {lid | Losse verkoop}`;
  lege delen vallen weg (`joinDelen`).
- **Zoeken** gebruikt `describeRow(entry, new Date(entry.createdAt))`
  alleen voor de actietekst; zoekt op lid, actor, productnamen, actie en
  reden.
- **`clockLabel` is een overbodige alias** (`export const clockLabel =
  klokTijd` in `logboek.ts`), die `LogboekLijst` nog gebruikt. De spec liet
  hem vervallen of de zone-helper worden; opruimen naar `klokTijd` is een
  kleine, niet-urgente nasleep.
- **`countLabel`, `logboekEmptyState` en `reikwijdteTekst`** nemen
  `{ beperkt, limit }` (`LogboekReikwijdte`); `LOGBOEK_LIMIT` komt uit
  `useLogboek.ts` en de UI noemt het getal nergens los.

### UI

- **Reikwijdtemelding in één `<p>`**: `reikwijdteTekst` plakt bij `beperkt`
  de tekst "Alleen de meest recente 200 handelingen. Zoeken en filteren werkt
  alleen binnen die 200." achter "Verkopen, opwaarderingen en terugdraaiingen
  van alle diensten." (spec: één regel; gebouwd: één alinea, geen aparte
  element of `role`).
- **Dagen**: `groepeerPerDag(entries, nu)` levert groepen; `LogboekLijst`
  rendert per dag `<section aria-labelledby>` met `h2` en `ul`, met
  `useId` in de heading-id. Rijen met `key={logboekKey(entry)}`.
- **Reversalrij toont "door {terugdraaier}" twee keer voor een schermlezer**:
  zichtbaar in de detailtekst en daarnaast een `sr-only` ", door
  {actorName}" achter elke rij (ook bij verkoop en opwaardering, waar het
  alleen sr-only was). Bij een reversal hoort een schermlezer dus "door X"
  tweemaal. Bekende, bewust niet opgeschoonde dubbeling; de avatar heeft
  daarnaast een `title`.
- **Overlay `LidBestellingenOverlay`**: datum en tijd in de rij komen uit
  `${dagKop(createdAt, new Date())} ${klokTijd(createdAt)}`, dus "dinsdag 29
  september 14:05" (jaar alleen bij een ander jaar), niet het eerdere korte
  `formatDate` ("29 sep 2026"). De melding bij `beperkt` staat in één `<p>`
  boven de lijst: "Alleen de laatste 50 bestellingen van {naam} staan hier.
  Oudere bestellingen zijn niet te zien in beheer."

### Hook en leeslogica

- **Drie platte selects** met elk `LOGBOEK_LIMIT + 1` rijen, zoals
  gespecificeerd: `orders` (embed `order_reversals(order_id)` voor
  `reversed`), `top_ups`, en `order_reversals` met `reverser:members!reversed_by(name)`
  en `order:orders!order_id(id, created_at, member:members!member_id(name),
  order_lines(qty, products(name)))`. De embedvorm wordt met `firstOrNull`
  tolerant gelezen (object of array).
- **Secundaire `.order()` vóór de limit** (Codex-review): elke bron sorteert
  op tijd en daarna op id (`order_id` voor reversals), zodat de afkapgrens
  bij gelijke tijdstippen deterministisch is en met `vergelijkLogboek`
  overeenkomt. Dit stond niet in de spec.
- **µs-precisie in de vergelijker** (Codex-review): `Date.parse` kapt op de
  milliseconde af, dus `vergelijkLogboek` vergelijkt daarna de cijfers achter de
  milliseconde (`subMilliseconden`, 6 cijfers) voordat de tiebreaker uit
  besluit 5 (reversal boven eigen verkoop, dan id aflopend, dan kind) geldt.
- **Geen "laatste request wint"** in `useLogboek`: er is geen request-teller.
  Dit was ook voor T10 zo (de spec zei "gelijk gebleven"); de drie bronnen
  zitten wel in één `Promise.all` binnen één `load()`. Een snelle
  herhaalde `refetch` kan dus in theorie een oudere respons laten winnen.
  `useMemberOrders` heeft die bescherming wel.
- Eén mislukte bron geeft één leesfout voor het hele scherm
  (`reportClientError`, `loadErrorMessage`), zoals gespecificeerd.

### Tests

`test/logboek.test.ts` (omgezet en uitgebreid), `test/logboek-adversarieel.test.ts`
(samenvoegen, DST, embedvormen), `test/date.test.ts`, `test/betaalmethode.test.ts`;
gemockte e2e in `e2e/logboek-chronologisch.spec.ts` en
`e2e/logboek-embedvormen.spec.ts`; `e2e/a11y.spec.ts` uitgebreid met de
Logboek-tab.

### Niet gedaan / niet aangetoond

Eerlijk over wat in deze PR niet is uitgevoerd:

- **De echte `order_reversals`-embed-select** is niet tegen de lokale seed
  of een echte database gedraaid (spec-teststrategie "Echte database",
  vraag 9). Alleen statisch gecontroleerd tegen migraties 0020 en 0039
  (kolommen, FK's en de leespolicy). De e2e's mocken PostgREST en bewijzen de
  syntaxis niet. Tot een Tester dit draait is de embed ongeverifieerd tegen
  PostgREST.
- **Live a11y (axe) en `db:test`** zijn niet lokaal gedraaid; CI doet dat
  (CLAUDE.md → Verificatie).
- **Handmatig niet gedaan**: tablet 768px en 1024px (afbreken, overflow,
  melding zonder scrollen), schermlezer, toetsenbord door chips en koppen.

### Vervolg

- **Gate voor datumweergave zonder `timeZone`** (besluit 10, een
  `check:policy`-regel die `getHours`/`getFullYear`/`toLocale*String` zonder
  `timeZone` buiten `src/lib/date.ts` weert): apart ticket, niet in deze PR.
  `formatDate`, `formatTime` en `ledger.ts`'s `clockLabel` blijven tot dan
  apparaatzone.
- **Index op `order_reversals.created_at`** (vraag 8): bewust niet nu; bij
  groei een apart backendticket.
- `clockLabel`-alias opruimen (zie boven).
- Epic #121: #130 sluit via de PR; #121 zelf blijft open (T11 #131 en
  T12 #132 resteren).
