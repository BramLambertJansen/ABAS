# Logboek (filterbare audit-log)

Spec voor [issue #19](https://github.com/BramLambertJansen/ABAS/issues/19).
Bouwt op de constatering die al in `docs/ARCHITECTURE.md` →
"Wat het prototype deed maar hier nog niet is besloten" stond ("de
ledger/transactietabel bestaat sowieso — dat volgt automatisch uit
`place_order`/`top_up` — alleen een filterbare UI ervoor niet") en op
`docs/ARCHITECTURE.md` → "Activiteittypes per dienst" (#18), dat
"Rapportage/filtering per activiteittype en elke koppeling met het
toekomstige Logboek-scherm" expliciet naar dit ticket doorschoof.

## Besloten door Bram (2026-09-25)

Drie punten, direct aan Bram gevraagd bij het oppakken van dit ticket — geen
aanname, geen heropening door de Developer:

1. **Bouwen: ja.**
2. **Rolzichtbaarheid: uitsluitend beheerder, niet bardienst.** Dit wijkt af
   van het ontwerp, dat Logboek toont aan elke `isAdminRole`-sessie (het
   ontwerp kent geen apart bardienst/beheerder-onderscheid op dit scherm).
   Zie Rolzichtbaarheid hieronder voor hoe dat concreet wordt afgedwongen.
3. **Filters: alle vier — Aandacht, Geld, Assortiment, Leden** (het ontwerp
   se `auditFilters`, `designs/Bar App.dc.html` regel 2679).
4. **Assortiment/Leden zonder databron: bouw nu, lege staat voor die twee**
   (2026-09-25, na het schrijven van deze spec — zie Openstaande vragen voor
   Bram hieronder voor de drie voorgelegde opties). Optie 1 daar is dus geen
   default meer bij het uitblijven van een antwoord, maar Bram's
   daadwerkelijke keuze: een aparte audit-tabel + RPC-instrumentatie
   (optie 2) blijft een apart, later ticket, niet iets wat de Developer hier
   erbij bouwt.

**Punt 3 heeft een gevolg dat Bram op het moment van deze beslissing nog niet
voorgelegd had gekregen**: twee van de vier filters hebben vandaag geen
databron om uit te filteren — er bestaat geen wijzigingslogboek voor
assortiment- of ledenmutaties, alleen voor geldbewegingen. Dat is geen
implementatiedetail maar een echt gat tussen wat het ontwerp toont en wat de
database vastlegt. Zie Datamodel en Openstaande vragen voor Bram hieronder;
dat gat is bewust **niet** zelf ingevuld met een nieuwe tabel — dat zou een
architectuurbeslissing zijn die deze spec niet namens Bram maakt.

5. **Echte rolcheck, niet alleen "sessie bestaat"** (2026-09-25, na
   Reviewer-bevinding op PR #85). De Reviewer blokkeerde PR #85 op een reële
   bevinding: deze spec's oorspronkelijke Rolzichtbaarheid-tekst beweerde dat
   Logboek zichtbaar is "uitsluitend binnen een actieve beheerder-sessie...
   niet bardienst", maar dat was feitelijk onjuist — `useBeheerSession()`
   behandelt `bardienst` én `beheerder` allebei als `"signed-in"` (bewuste
   generalisatie, ADR 0005/#42), en `BeheerTabs.tsx` kreeg tot nu toe geen
   `role`-prop, dus kon structureel niet filteren. Voor de drie bestaande
   tabs (Assortiment/Leden/Instellingen) is dat onschadelijk omdat hun
   schrijf-RPC's `no_admin_role` serverside afdwingen ondanks de zichtbare
   UI. Logboek heeft **geen RPC** — een platte `select` zonder serverside
   rolcheck — dus was voor dit scherm specifiek "zichtbaar in de UI" exact
   hetzelfde als "leesbaar door bardienst", wat Bram's expliciete
   "uitsluitend beheerder"-besluit (punt 2 hierboven) rechtstreeks
   tegensprak. Bram heeft besloten: een echte rolcheck toevoegen — `role`
   van `useBeheerSession()` doorgeven aan `BeheerTabs`, en de Logboek-tab
   alleen conditioneel renderen voor `role === "beheerder"`. Dit geldt
   **alleen voor Logboek**, niet voor de andere drie tabs (die blijven
   bardienst-zichtbaar zoals vandaag) — dit is geen aanscherping van ADR
   0003 Beslissing 4, maar een punt-oplossing voor dit ene scherm, omdat dit
   scherm org-brede geldhistorie toont zonder RPC-laag als vangnet. Zie
   Rolzichtbaarheid hieronder voor het exacte mechanisme.

## Doel

Een beheerder kan, binnen de bestaande `/beheer`-sessie, alle geldbewegingen
van de vereniging doorzoeken en filteren — wie deed wat, wanneer, voor welk
bedrag — in plaats van dit per dienst te moeten opzoeken
(`docs/features/dienst-overzicht.md`'s per-dienst ledger) of per lid
(`useMemberOrders()`). Dit is een **leesscherm**: er verandert nergens een
rij door dit scherm te openen, er wordt geen bedrag berekend, en er is geen
nieuwe schrijfactie. De twee kernbeslissingen uit CLAUDE.md →
Architectuurbeslissingen zijn dus niet in het geding op de manier die een
schrijvende feature zou raken: "geld beweegt alleen via RPC" blijft exact
zoals het is — dit scherm voegt geen schrijfpad toe, het leest alleen wat
`place_order`/`top_up`/`reverse_order_at_bar`/`reverse_order_as_admin` al
hebben vastgelegd. "`served_by` komt uit de bezetting" is hier van
toepassing als **leesresultaat**, niet als nieuwe regel: elke rij in dit
scherm toont de `served_by`/`reversed_by` die de RPC destijds al
valideerde, dit scherm voegt daar niets aan toe of af.

## Betrokken shell

`shells/bar` alleen, binnen de bestaande `/beheer`-route — vierde tab in
`BeheerTabs.tsx` (`src/features/assortimentbeheer/BeheerTabs.tsx`), naast
Assortiment/Leden/Instellingen. Geen Logboek-concept in `shells/portal`: een
lid ziet nooit deze schermklasse (CLAUDE.md → Domein: "Lid — ziet eigen
saldo en transacties. Verder niets."; een lid heeft via ADR 0007 sowieso
alleen leestoegang tot de eigen rijen, dus zelfs een rechtstreekse query zou
hier niets extra's opleveren).

Eigen featuremap `src/features/logboek/` (niet in `assortimentbeheer/`) —
zelfde afweging als `docs/features/ledenbeheer.md` maakte voor
`src/features/ledenbeheer/`: een eigen onderwerp met een eigen leeshook,
geïmporteerd door `BeheerTabs.tsx` als gewone cross-feature-import
(`check:arch` staat dit toe — het gaat om shell-isolatie, niet om
feature-isolatie).

## Datamodel

**Geen schemawijziging, geen migratie.** Dit is het kernpunt van deze spec:
niet alle vier de door Bram goedgekeurde filters hebben vandaag een tabel om
uit te lezen.

| Filter | Databron | Bestaat vandaag? |
|---|---|---|
| **Geld** | `orders` + `order_lines` + `top_ups` (`0001_init.sql`) | **Ja** — elke rij heeft `created_at`, `served_by`, bedrag, en (voor `orders`) de bestelregels. Precies de databron die `useShiftLedger()` (`src/hooks/queries/useShiftLedger.ts`, gebouwd voor #12) al per dienst leest. |
| **Aandacht** | `order_reversals` (`0020_bestelling_terugdraaien.sql`) als deelverzameling van Geld | **Deels.** Een teruggedraaide bestelling (`reason`, `reversed_by`, `via`, `created_at`) is de enige gebeurtenis in de hele database die vandaag al "dit verdient een tweede blik" betekent met een echte rij erachter. Het ontwerp se eigen `flag:true`-gebeurtenissen zijn breder (zie hieronder) — dat bredere deel bestaat niet. |
| **Assortiment** | — | **Nee.** `products` (`0001_init.sql`) en `activity_types` (`0019_activiteittypes.sql`) bevatten alleen de huidige staat (`name`, `category`, `price_cents`, `archived`). `create_product`/`update_product_price`/`set_product_archived`/`create_activity_type`/`update_activity_type_name`/`set_activity_type_archived` schrijven geen enkele logregel — wie een prijs wanneer wijzigde, of wanneer een product gearchiveerd werd, is na het feit niet meer te achterhalen. |
| **Leden** | — | **Nee.** `members` (`0001_init.sql`) bevat evenmin geschiedenis. `create_member`/`update_member_name`/`set_member_archived`/`set_member_role`/`update_negative_limit` schrijven geen logregel. (Curieus genoeg groepeert het ontwerp zelf "negatieflimiet gewijzigd" onder zijn `leden`-categorie, regel 2223 — niet onder `geld`, ook al is `app_settings.negative_limit_cents` qua tabel geen ledentabel. Overgenomen als aanwijzing voor de indeling áls dit ooit gebouwd wordt, verder niet relevant zolang er geen databron is.) |

Dit is precies het soort bevinding dat CLAUDE.md's Werkstraat-regel bedoelt
met "geen aanname, geen placeholder die later 'wel even' wordt ingevuld":
een Assortiment- of Leden-filter bouwen zonder een tabel om uit te filteren
zou betekenen dat de Developer zelf een audit-tabel plus schrijf-
instrumentatie in **acht bestaande RPC's** verzint — een architectuurkeuze,
niet een implementatiedetail van een leesscherm. Zie Openstaande vragen voor
Bram.

## RPC's / leeshook

**Geen nieuwe RPC, geen nieuwe migratie voor het Geld-/Aandacht-deel.**
Lezen van `orders`/`order_lines`/`top_ups`/`order_reversals` is vandaag al
volledig open voor elke niet-`lid`-sessie (ADR
[0007](../adr/0007-rol-lid-leest-alleen-eigen-rijen.md): de brede
`for select to authenticated using (true)`-policies gelden onverkort voor de
gedeelde bar-tablet-sessie én een beheerder-sessie — alleen een sessie die
naar een `members`-rij met rol `lid` herleidt wordt beperkt). Dat een
bardienst-sessie dit al zou kunnen lezen als er een UI voor bestond is geen
nieuw gegeven van deze spec — het is dezelfde constatering als
`docs/features/negatieve-saldolimiet.md` → Rolzichtbaarheid al maakte voor
`app_settings`: lezen is systeembreed open, alleen het **scherm** is
beheerder-gated (zie Rolzichtbaarheid hieronder). Er is dus ook geen
ADR-0004-achtig RPC-gated-leespatroon nodig — dat patroon is voor PII die
zelfs een bardienst-sessie niet mag zien (`members.email`); bedragen, namen
en tijdstippen van bestellingen/opwaarderingen zijn dat niet (CLAUDE.md →
Domein kent bardienst al saldo-inzage toe).

Nieuwe leeshook **`useLogboek()`** in `src/hooks/queries/useLogboek.ts`,
org-breed (alle diensten, niet één `shiftId`) — bewust een **nieuwe** hook,
niet een parameter op `useShiftLedger(shiftId)`: hetzelfde
"twee-echt-verschillende-leesbehoeften-op-dezelfde-tabellen"-argument als
`docs/features/assortimentbeheer.md` → "Contract met #8's `useProducts()`"
al vastlegde voor `useProducts()`/`useAlleProducten()`. `useShiftLedger(null)`
betekent vandaag expliciet "geen open dienst, dus lege lijst"
(`dienst-overzicht`'s gebruik) — die betekenis hergebruiken voor "alle
diensten" zou een bestaande, geteste hook een tweede, tegenstrijdige
betekenis geven voor dezelfde parameterwaarde.

- Twee platte `select`s (zelfde vorm als `useShiftLedger`, zonder
  `.eq("shift_id", …)`), plus een derde voor `order_reversals` (embed op
  `orders`, zelfde `order_reversals(reason, via, reverser:members!reversed_by(name))`
  als `useShiftLedger` al gebruikt).
- **Cap: de meest recente 200 boekingen, nieuwste eerst** — rechtstreeks uit
  het ontwerp overgenomen (`this.state.auditLog...slice(0,200)`, regel 1795:
  het ontwerp houdt zijn eigen in-memory logboek zelf al op 200 entries).
  Geen paginering in deze eerste bouw — zelfde soort "een recente
  vergissing, geen archiefonderzoek"-afweging als `useMemberOrders()`'s
  `MEMBER_ORDERS_LIMIT = 50`. Als 200 in de praktijk te weinig blijkt (een
  drukke vereniging, een beheerder die verder terug wil), is dat een latere,
  losse uitbreiding (paginering/datumfilter), geen blokkerende vraag voor
  déze spec — vergelijkbaar met hoe `MEMBER_ORDERS_LIMIT` ook zonder
  Bram-consultatie gekozen is.
- Type `LogboekEntry`: zelfde velden als `LedgerEntry`
  (`src/hooks/queries/useShiftLedger.ts`) — `id`, `kind` (`"verkoop" |
  "opwaardering"`), `createdAt`, `memberName`, `servedById`, `servedByName`,
  `amountCents`, `itemCount`, `productNames`, `method`, `reversal` — geen
  nieuw domeintype nodig, de rij-vorm is al precies wat dit scherm nodig
  heeft. Niet geïmporteerd van `useShiftLedger.ts` (dat zou de twee hooks
  aan elkaar koppelen voor een toevallige gelijkenis, zelfde
  "geen vroegtijdige extractie"-afweging als elders in deze codebase) — een
  eigen, identiek gevormd type in `useLogboek.ts`.
- Zoeken (`auditQuery` in het ontwerp) en de vier filterchips zijn
  **client-side** over de opgehaalde 200 rijen — geen nieuwe server-side
  filterparameter. Consistent met hoe `ProductenLijst`/`LedenLijst` hun
  zoekvelden al client-side filteren over een al-opgehaalde lijst.

## Rolzichtbaarheid

**Niet** hetzelfde patroon als de drie bestaande `/beheer`-tabs
(`docs/features/negatieve-saldolimiet.md` → Rolzichtbaarheid,
`docs/features/ledenbeheer.md` → Rolzichtbaarheid) — dat patroon ("zichtbaar
zodra `useBeheerSession()` op `"signed-in"` staat, dus voor zowel
`bardienst` als `beheerder`") is precies wat de Reviewer op PR #85 terecht
blokkeerde voor dit scherm specifiek (zie Besloten door Bram, punt 5): omdat
Logboek geen RPC heeft, is "zichtbaar in de UI" hier gelijk aan "leesbaar
door bardienst". Voor Logboek geldt daarom een **echte rolcheck**, boven op
de bestaande sessie-check — de Developer bouwt exact dit, geen variant:

1. **`role` komt uit `useBeheerSession()`'s bestaande sessie-data, niet uit
   een nieuwe query.** De hook selecteert in `resolve()` al
   `.select("name, role, has_pin")` tegen `members` (`useBeheerSession.ts`,
   huidige regel ~75) en gebruikt `data.role` al om `"denied"` van
   `"signed-in"` te onderscheiden (regel ~93: alleen `"bardienst"` of
   `"beheerder"` bereikt `"signed-in"` — elke andere rol, of geen gekoppeld
   lid, wordt `"denied"`). Op het punt waar de hook vandaag `setState({
   status: "signed-in", email, name: data.name, hasPin: data.has_pin })`
   zet (regel ~104–109), is `data.role` dus al gegarandeerd `"bardienst"` of
   `"beheerder"`. De `"signed-in"`-variant van `BeheerSessionState`
   (`useBeheerSession.ts`, huidige regel 43) krijgt een nieuw veld:
   `role: "bardienst" | "beheerder"`, gevuld met exact die al-opgehaalde
   waarde. Geen nieuwe kolom, geen nieuwe select, geen nieuwe roundtrip.
2. **`role` stroomt door naar `BeheerTabs` als nieuwe, verplichte prop.**
   `Assortimentbeheer.tsx` is de enige aanroeper van `<BeheerTabs>` (huidige
   regel ~51: `<BeheerTabs name={session.name} onSignOut={session.signOut}
   />`, bereikt alleen na `session.status === "signed-in"`, dus `session.role`
   ligt daar al klaar). Wordt: `<BeheerTabs name={session.name}
   role={session.role} onSignOut={session.signOut} />`. `BeheerTabs.tsx`
   krijgt de propsignatuur `{ name: string; role: "bardienst" |
   "beheerder"; onSignOut: () => void }`.
3. **De conditionele render zit uitsluitend in `BeheerTabs.tsx`, en raakt
   alleen Logboek.** Zowel de tabknop ("Logboek", huidige regel ~135–149 in
   `role="tablist"`) als het bijbehorende tabpanel/de mount van
   `LogboekLijst` (huidige regel ~237–246) renderen alleen wanneer
   `role === "beheerder"`. Voor een `bardienst`-sessie bestaat de Logboek-tab
   dus niet in de DOM — geen `display:none`, geen disabled-knop, het element
   wordt niet gemount. Assortiment, Leden en Instellingen blijven ongewijzigd
   zichtbaar voor beide rollen — dit is geen bredere aanscherping van ADR
   0003 Beslissing 4, alleen dit ene scherm verandert.
4. **Dit is een UI-laag-conditie, geen nieuwe RPC-laag.** Er is nog steeds
   geen RPC voor Logboek — dit blijft een platte `select` op
   `orders`/`order_lines`/`top_ups`/`order_reversals`, nog steeds leesbaar
   voor elke niet-`lid`-sessie op databaseniveau (ADR 0007, ongewijzigd, zie
   RPC's/leeshook hierboven). Het punt van deze aanscherping is uitsluitend
   dat een `bardienst`-sessie de Logboek-UI niet meer te zien krijgt — niet
   dat de onderliggende tabellen nu strenger zijn. Een `bardienst`-medewerker
   met directe databasetoegang (buiten deze UI om) kan nog steeds dezelfde
   rijen lezen; dat is, zoals hieronder toegelicht, geen nieuw gat en geen
   scope van deze wijziging.

**Resterend, bewust ongewijzigd punt**: er is nog steeds geen RPC-actorcheck
die een `bardienst`-sessie op databaseniveau tegenhoudt, zoals `no_admin_role`
dat wel doet voor `create_product`/`update_member_name`/etc. — want er is nog
steeds geen RPC, dit is een platte `select`. Vóór punt 5 (Besloten door Bram)
was dat gat zichtbaar via de UI zélf; ná deze wijziging bestaat het gat alleen
nog bij **directe** databasetoegang (buiten de app om), niet meer via het
scherm — precies de reductie die Bram met de rolcheck bedoelde. Dat een
`bardienst`-sessie met directe toegang nog altijd dezelfde
`orders`/`top_ups`/`order_reversals`-rijen kan lezen is **geen nieuw gat** —
diezelfde sessie kon dat al vóór deze spec (bijvoorbeeld via
`useShiftLedger()` voor een dienst naar keuze, of rechtstreeks). Als Bram ook
dát onvoldoende vindt (bijvoorbeeld: een bardienst-medewerker mag de
geldhistorie helemaal niet org-breed kunnen doorzoeken, zelfs niet met
directe toegang), is dat een aanscherping van ADR 0007's reikwijdte — buiten
scope van dit leesscherm, zie Expliciet buiten scope.

## Schermflow

Volgt het ontwerp (`designs/Bar App.dc.html` regel 449–486, 2679, 3110–3118)
letterlijk voor de eerste bouw (CLAUDE.md → Designbestanden), voor het deel
dat een databron heeft:

1. **Kop**: "Logboek" + telling, letterlijk **"{n} handelingen"** of, bij een
   actief filter/zoekterm, **"{gefilterd} van {totaal} handelingen"**
   (ontwerp regel 3116–3118, enkelvoud "1 handeling" bij precies één rij).
2. **Zoekveld**: placeholder **"Zoek op naam, product of handeling"**
   (regel 460), client-side filter over `memberName`, `servedByName`,
   `productNames`, en de getoonde actie-tekst (bv. "Bestelling op saldo",
   "Saldo opgewaardeerd").
3. **Vijf filterchips** (regel 2679): **Alles, Aandacht, Geld, Assortiment,
   Leden** — alle vijf zichtbaar, zoals Bram besliste. Alleen **Alles**,
   **Geld** en **Aandacht** leveren resultaten op (zie Datamodel); zie
   Randgevallen voor hoe **Assortiment**/**Leden** zich gedragen zolang
   daar geen databron voor bestaat.
   - **Geld**: elke `LogboekEntry` (verkoop + opwaardering), nieuwste eerst.
   - **Aandacht**: alleen entries met `reversal !== null` — de enige
     "vraagt om een blik"-gebeurtenis met een echte databron (zie
     Datamodel). Rij krijgt dezelfde visuele nadruk als het ontwerp voor een
     geflagde rij geeft (regel 2674–2676: linkerrand + achtergrondtint in
     accentkleur, tag **"LET OP"** i.p.v. de categorietag) — kleur is hier
     niet het enige onderscheid, de tekst "LET OP" zelf is het (a11y, zelfde
     soort niet-kleur-only-eis als `docs/features/
     negatieve-saldolimiet.md`'s statuspil).
   - **Alles**: geen filter, alle opgehaalde entries.
4. **Rijenlijst** (regel 475–485): tijd (`HH:MM`), categorietag (**"SALDO"**
   voor een verkoop/opwaardering, **"LET OP"** voor een teruggedraaide
   bestelling — ontwerp se `tagColors`/`flowLabels`, regel 2684), initialen-
   avatar van wie de boeking deed (`servedByName`, hergebruik
   `InitialsAvatar`/`MemberPill`-stijl uit `src/components/` zoals andere
   lijsten al doen — niet opnieuw uitvinden), actie + detailregel (bv.
   "Bestelling op saldo" / "3 items · Jan de Vries", "Saldo opgewaardeerd" /
   "+€25,00 · contant · Jan de Vries"), en bij een teruggedraaide bestelling
   de reden + wie terugdraaide + via bar/beheer (dezelfde velden als
   `LedgerEntry.reversal` al draagt).
5. **Lege staat** (regel 3113–3114): **"Niets gevonden"** / **"Andere filter
   of zoekterm probeert het opnieuw"** wanneer er wél entries zijn maar de
   huidige filter/zoekterm niets oplevert; **"Nog niets vastgelegd"** /
   **"elke handeling in de app komt hier te staan, met naam en tijd erbij"**
   wanneer er organisatiebreed nog geen enkele boeking bestaat (nieuwe/lege
   installatie).

### Navigatie

`BeheerTabs.tsx` krijgt een vierde tab **"Logboek"**, zelfde
`role="tablist"`-/mount-per-tab-patroon als de bestaande drie (elke
tabwissel naar Logboek geeft een verse `useLogboek()`-lezing, geen
hidden-toggle). Tabvolgorde (waar Logboek in de balk komt) is aan de
Developer, geen architectuurkeuze — zelfde afweging als
`docs/features/ledenbeheer.md` → Betrokken shell al maakte voor de
Leden-tab.

## Randgevallen

| Situatie | Gedrag |
|---|---|
| **Assortiment-/Leden-filter aangetikt** | Toont de "Nog niets vastgelegd"-lege-staat (regel 3113–3114 hierboven), **niet** een foutmelding — er is geen fout, er is domweg geen databron. Voegt geen aparte uitlegtekst toe die niet uit het ontwerp komt (geen "deze functie bestaat nog niet"-banner verzinnen) totdat Bram beslist hoe dit gat wordt opgelost (zie Openstaande vragen); dit is een bewust minimale, niet-misleidende leegte, geen belofte van functionaliteit die er niet is. |
| **Organisatie heeft nog geen enkele boeking** (verse installatie) | "Nog niets vastgelegd"-lege-staat, org-breed i.p.v. per dienst. |
| **Zoekterm/filter levert niets op, terwijl er wél data bestaat** | "Niets gevonden"-lege-staat. |
| **Gastverkoop** (`orders.member_id is null`) | `memberName: null`, getoond zoals `useShiftLedger` dat al doet — geen crash, geen "onbekend lid"-verzinsel waar het schema `null` als geldige waarde kent (0001_init.sql commentaar: "guest/pin sale"). |
| **> 200 boekingen totaal** | Alleen de meest recente 200 worden opgehaald/getoond (zie RPC's/leeshook) — geen paginering in deze eerste bouw, geen foutmelding, gewoon een stille cap. |
| **Kan het logboek niet laden** (netwerkfout) | Vaste Nederlandse foutmelding, zelfde patroon als `useShiftLedger`/`useMemberOrders` ("Kan het logboek niet laden. Controleer de verbinding."), geen crash. |
| **A11y** | `/beheer`'s ingelogde staat wordt vandaag al gescand voor Assortiment/Leden/Instellingen (zie `docs/features/negatieve-saldolimiet.md` → Randgevallen voor die geschiedenis). Tester moet het bestaande scenario uitbreiden met de Logboek-tab — dezelfde soort toevoeging als bij Instellingen destijds, geen nieuw scenario-type. |

## Expliciet buiten scope

- **Assortiment- en Leden-filters die daadwerkelijk resultaten tonen** — er
  bestaat geen databron (zie Datamodel). Bouwen zonder eerst een
  audit-tabel + schrijf-instrumentatie te specificeren zou een verzonnen
  architectuur zijn; zie Openstaande vragen voor Bram.
- **Een audit-log-tabel/trigger-mechanisme voor assortiment-/
  ledenmutaties** — dit zou zelf een aparte architectuurbeslissing (en
  vermoedelijk een eigen ADR) zijn, geen detail van dit leesscherm; raakt elf
  bestaande RPC's die vandaag niets loggen (zie Openstaande vragen voor
  Bram voor de volledige lijst). Niet hier gespecificeerd.
- **Datumfilter/periode-selectie** — het ontwerp toont dit niet voor
  Logboek (in tegenstelling tot `Rapportages`, dat wél periodekeuzes toont,
  regel 3081); niet in deze spec.
- **Paginering voorbij de 200-rij-cap** — zie Randgevallen; latere,
  losstaande uitbreiding als 200 in de praktijk te krap blijkt.
- **Export (CSV/Excel/PDF)** — dat is `Rapportages`/`boekhouder`-scope,
  expliciet apart genoemd in `docs/ARCHITECTURE.md` → "Wat het prototype
  deed maar hier nog niet is besloten" en niet dit ticket (#19 ging
  specifiek over Logboek, niet Rapportages).
- **RPC-gated lezen (ADR 0004-patroon) voor het Geld-/Aandacht-deel** — niet
  nodig, zie RPC's/leeshook: dit is geen PII in de zin van dat ADR.
- **Aanscherpen van ADR 0007 zodat een bardienst-sessie de onderliggende
  tabellen ook met directe toegang niet meer org-breed kan lezen** — zie
  Rolzichtbaarheid; een reële, maar aparte vraag, niet iets wat dit
  leesscherm zelf oplost of verergert.
- **Elke koppeling met activiteittypes/rapportage per activiteittype**
  (`docs/ARCHITECTURE.md` → "Activiteittypes per dienst" schoof dit expliciet
  naar #19 door) — activiteittypes hebben, net als producten en leden, geen
  wijzigingslogboek; valt dus onder dezelfde Assortiment/Leden-gat-conclusie
  hierboven, geen apart punt.

## `useShell()`-contract

Geen nieuwe invulling. De Logboek-tab is, net als Assortiment/Leden/
Instellingen, inline lijst-content binnen `BeheerTabs.tsx` — geen overlay,
geen grid dat `columns` nodig heeft.

## Openstaande vragen voor Bram

**Beantwoord (2026-09-25): optie 1.** Zie Besloten door Bram, punt 4. De
onderstaande uitleg blijft staan als toelichting op de drie voorgelegde
opties en waarom optie 1 gekozen is, niet als open vraag.

De vier filters die Bram goedkeurde bestaan in het ontwerp als gelijkwaardige
knoppen, maar de database legt vandaag alleen geldbewegingen vast, geen
assortiments- of ledenmutaties. Drie manieren om verder te gaan, geen ervan
hier gekozen:

1. **Bouw nu alleen wat een databron heeft** (deze spec: Alles/Geld/Aandacht
   werken, Assortiment/Leden tonen een lege staat) **en behandel een
   audit-tabel voor assortiment/leden als een apart, later ticket** — pas
   op te pakken als Bram besluit dat "wie wijzigde welke prijs, wanneer"
   daadwerkelijk nodig is. Dit is wat deze spec vandaag oplevert als Bram
   niets anders aangeeft; **niet stilzwijgend gekozen, expliciet hier
   voorgelegd.**
2. **Vraag deze spec uit te breiden met een audit-log-tabel + schrijf-
   instrumentatie** in de acht RPC's die vandaag niets loggen
   (`create_product`, `update_product_price`, `set_product_archived`,
   `create_activity_type`, `update_activity_type_name`,
   `set_activity_type_archived`, `create_member`, `update_member_name`,
   `set_member_archived`, `set_member_role`, `update_negative_limit` — elf,
   niet acht, zie Datamodel) — een aanzienlijk grotere, eigen
   architectuurbeslissing (schema, welke RPC's schrijven, of dit een
   generieke tabel is of per-domein, retentie) die een eigen ADR verdient,
   niet iets wat deze leesscherm-spec erbij mag aannemen.
3. **Laat de Assortiment-/Leden-chips helemaal weg** tot er een databron is,
   in plaats van chips te tonen die altijd leeg blijven — een kleinere
   afwijking van het ontwerp (dat vijf chips toont) dan optie 1, maar
   wijkt af van Bram's expliciete "alle vier"-besluit hierboven, dus niet
   gekozen zonder het terug te leggen.

**Antwoord van Bram: optie 1** — bouwen zoals in deze spec, alle vijf chips
zichtbaar, Assortiment/Leden tonen de "Nog niets vastgelegd"-lege-staat tot
een eventueel vervolgticket voor een audit-tabel (optie 2) apart wordt
aangevraagd. Geen extra architectuurbeslissing nodig voor déze spec; de
Developer bouwt op basis hiervan.
