# Portaltransacties inhoudelijk consistent

**Status: gebouwd (PR [#155](https://github.com/BramLambertJansen/ABAS/pull/155),
`85311012`, gemerged in main).** Goedgekeurd door Bram op 2026-10-05; alle
tien vragen waren beslist, zie "Besluiten Bram" en "Zoals gebouwd" onderaan.
Het stuk hieronder tot "Besluiten Bram" is de spec zoals goedgekeurd; waar
de bouw afwijkt of iets toevoegt, staat dat in "Zoals gebouwd".

Spec voor [issue #129](https://github.com/BramLambertJansen/ABAS/issues/129)
(frontend T09 · P1/P2, epic #121, findings F07 en F18, labels `bug`,
`shell:portal`). Gevalideerd tegen `main` op `373cab5`. Bouwt voort op
[`portal-dashboard.md`](portal-dashboard.md) (#16) en
[`bestelling-terugdraaien.md`](bestelling-terugdraaien.md).

## Doel

Dezelfde boeking betekent hetzelfde op Saldo en op Transacties, en de kop
boven de saldolijst zegt wat de lijst werkelijk is. Alleen presentatie in
`shells/portal`: geen schema, geen RPC, geen nieuwe query.

## Gelezen bronnen

- **Ticket #129**, plus #128 (T08, leesfouten en verversing portal) en #132
  (T12, contrast en portalbreedte) voor de afstemming. Geen van beide is
  gebouwd.
- **Wireframe** `designs/Lid App.dc.html`, `isSaldo`-blok ("DEZE MAAND") en
  `isTxns`-blok. Zie [`portal-dashboard.md`](portal-dashboard.md) → Onderzocht
  in /designs/. Die spec week al bewust af van de wireframe voor
  teruggedraaide bestellingen (geen "Correctie"-regel, maar de bestelling
  zelf doorgestreept). Dat blijft staan; de wireframe is hier niet leidend.
- **Code**: `src/features/portal-dashboard/` (`SaldoTab.tsx`,
  `TransactieRij.tsx`, `TransactiesTab.tsx`, `transacties.ts`,
  `PortalDashboard.tsx`), `src/hooks/queries/usePortalTransactions.ts`,
  `supabase/migrations/0024_portal_eigen_transacties.sql`,
  `src/components/Tabs.tsx`, `test/transacties.test.ts`, `e2e/a11y.spec.ts`,
  `e2e/portal-login.spec.ts`, `src/features/dienst-overzicht/Transactielijst.tsx`
  (de bar-weergave van "teruggedraaid").
- **Kaders**: `CLAUDE.md` (client berekent nooit een bedrag, teruggedraaid
  telt niet als omzet, saldo is server-bepaald), ADR 0010 en ADR 0012
  (portal-leesroute, eigen data voor elke rol), `portal-dashboard.md`.

## Validatie van de bevindingen op actuele main

### F07: teruggedraaide bestelling oogt op Saldo als gewone uitgave. Bevestigd.

- `SaldoTab.tsx` geeft `showReversal={false}` mee aan `TransactieRij`;
  `TransactiesTab.tsx` geeft `showReversal`. Bij `false` valt in
  `TransactieRij` zowel het doorhalen als de `sr-only`-tekst weg, en
  `transactionDetail(t, false)` laat "teruggedraaid · reden" weg.
- Dit was geen vergissing maar vastgelegd gedrag: `portal-dashboard.md`
  Schermflow §1 noemt voor het voorproefje alleen "label, subtitel, bedrag",
  en `test/transacties.test.ts` test `showReversal=false` expliciet
  (`transactionDetail: teruggedraaid-toevoeging alleen met showReversal=true`).
  Dat contract wordt hier bewust gewijzigd, niet alleen de CSS.
- **Extra bevinding die het issue niet noemt (belangrijk voor de tekst):** de
  server schrijft bij terugdraaien `orders.total_cents` terug op
  `members.balance_cents` (`0020`, `reverse_order_*`), en `refunded_cents`
  wordt in dezelfde transactie vastgelegd. Het getoonde saldo bevat die
  terugboeking dus al. Een teruggedraaide bestelling die als gewone
  "− € X" in de lijst staat, laat het lid dus een uitgave zien die niet meer
  in het saldo zit. Er bestaat geen aparte compensatieregel in de data en
  die komt er niet (geen frontendcompensatie, ticket-randvoorwaarde). De
  lijst is overigens nooit een sluitende optelsom van het saldo: er is geen
  startsaldo of correctiepost. De spec belooft die sluiting ook niet.
- **Reden afgekapt (acceptatiecriterium 2, bevestigd):** in `TransactieRij`
  staat de subtitel op `truncate`, en de status zit als laatste deel van die
  ene regel (`{datum} · {items} · teruggedraaid · {reden}`). Op 320px valt
  precies dat deel af. De reden is 1 tot 200 tekens (`0020`), dus ook op
  breder scherm kan ze niet altijd op één regel.
- Beschikbare data: de hook levert al `reversed`, `reversalReason`,
  `reversedVia` (`bar` of `beheer`) en `reversedByName`. Er is geen
  datavraag, alleen een weergavevraag. Dat geldt ook voor "wie terugdraaide"
  (besluit 3), zie "Wie terugdraaide: gecontroleerd op de echte code".
- Lege reden: de RPC kan geen lege reden teruggeven (`reason` is verplicht,
  1 tot 200 tekens), maar `transactionDetail` rendert bij `null` een
  hangende "· teruggedraaid · ". De nieuwe weergave behandelt dat veilig.

### F18: "Deze maand" is "laatste vijf transacties". Bevestigd.

- `SaldoTab.tsx`: `RECENT_TRANSACTIONS_LIMIT = 5`, `slice(0, 5)`, geen
  datumfilter. De kop is hard "DEZE MAAND". Op 1 oktober staan er dus
  septembertransacties onder. De bijbehorende docstring en
  `portal-dashboard.md` noemen het zelf een "korte voorproefje"-lijst, de kop
  is dus de fout, niet de selectie.
- De RPC levert alles, nieuwste eerst (`order by created_at desc`). Er is
  geen server-side maandfilter en dat is niet nodig voor de simpele variant.

### Wie terugdraaide: gecontroleerd op de echte code

Besluit 3 vraagt de naam van de terugdraaier te tonen, niet het kanaal.
Gecontroleerd op `main`, geen backendwijziging nodig:

- `supabase/migrations/0024_portal_eigen_transacties.sql`
  (`list_own_transactions()`) levert `reversed_by_name` al: `left join members
  reverser on reverser.id = r.reversed_by`, als `SECURITY DEFINER` met
  `set search_path = public`, `grant execute ... to authenticated`, revoke van
  `public`/`anon`. De functie is sinds 0024 niet meer gewijzigd (geen latere
  migratie noemt hem). Filter blijft `o.member_id = caller_member_id()`: alleen
  eigen bestellingen.
- `order_reversals.reversed_by` is `uuid not null references members(id)`
  (`0020`) en `members.name` is `text not null` (`0001`). Voor een
  teruggedraaide bestelling is de naam dus altijd aanwezig; `null` komt alleen
  voor bij een niet-teruggedraaide bestelling of een opwaardering.
- Het veld is bedoeld voor het lid: ADR 0010 (geaccordeerd 2026-09-26)
  motiveert de RPC juist om "wie `reversed_by` was op een terugdraaiing" als
  platte `name text` aan een lid-sessie te geven, zonder de rest van de
  `members`-rij (saldo, e-mail, `archived`) open te zetten. `portal-dashboard.md`
  noemt `reversed_by_name` in de RPC-tabel. De RPC lekt dus niet meer dan ADR
  0010 al accepteert, en het lid ziet nog steeds alleen eigen transacties
  (CLAUDE.md Domein). Geen privacy- of rolprobleem.
- `src/hooks/queries/usePortalTransactions.ts` mapt `reversed_by_name` al naar
  `reversedByName: string | null` (`RpcRow`, regel 46 en 116). Geen
  hookwijziging.
- `supabase/tests/list_own_transactions.test.sql` bewijst de juiste
  `reversed_by_name` voor een bar-terugdraaiing ("LOT Server") en een
  beheer-terugdraaiing ("LOT Admin"), en `null` voor niet-teruggedraaid en
  opwaardering. Bestaande negatieve tests (lid A ziet nooit rijen van lid B)
  blijven gelden. Geen nieuwe test nodig.
- Het kanaal (`reversed_via`) wordt niet getoond (besluit 3). Het veld blijft in
  RPC en hook, en wordt nergens gerenderd, ook niet in `sr-only`, `title`,
  `aria-label` of een `data-`attribuut.

### Wat het issue niet claimt maar wel gecontroleerd is

- **Maand- en jaargrens op Transacties werkt al.** `groupByMonth` sleutelt op
  `jaar-maandindex` (`monthKey`), dus december 2026 en januari 2027 zijn
  aparte groepen, en januari 2026 en januari 2027 vallen niet samen
  (`test/transacties.test.ts` dekt dit). Geen fout, wel een
  verificatiescenario (september naar oktober, december naar januari).
- **Tijdzone: er is geen tijdzonelogica.** `dateLabel`, `monthKey` en
  `monthLabel` gebruiken de lokale tijdzone van het apparaat
  (`Intl.DateTimeFormat` zonder `timeZone`, `Date#getFullYear/getMonth`).
  De database bewaart `timestamptz`. Een transactie om 00:30 op 1 oktober
  Nederlandse tijd staat op een apparaat in een andere tijdzone (of een
  CI-runner in UTC) onder 30 september. Er staat nergens een `TZ` in
  `package.json` of testconfig en er is geen `Europe/Amsterdam` in `src/`.
  `test/transacties.test.ts` is daardoor tijdzoneafhankelijk. Besluit 4 lost dit op.
- **Sortering**: de client sorteert niet; `groupByMonth` rekent op de
  volgorde van de RPC en groepeert alleen aaneengesloten rijen. De RPC heeft
  geen tiebreaker op `id` bij gelijke `created_at`. Praktisch zelden een
  probleem. Besluit 7: niets aan doen.
- **Tab, focus en refetch**: `PortalDashboard` bezit `tab`; `SaldoTab` kan
  hem nu niet zetten. Een tab-panel is alleen gemount terwijl het actief is
  (`PortalDashboard.tsx`). Een knop in `SaldoTab` die naar Transacties gaat,
  verdwijnt dus mee met de eigen unmount en de focus valt op `body` als er
  niets gebeurt. `TabList` (T05) heeft geen imperatieve focus-API, maar
  exporteert `tabElementId(idBase, key)`. `SaldoTab` en `TransactiesTab`
  roepen elk `usePortalTransactions()` aan, dus wisselen van tab geeft altijd
  een verse lezing (en kort "Transacties laden…"). Dat gedrag is bewust uit
  #16 en wordt door T08 (#128) mogelijk herzien.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC.** Alleen lezen. De client toont `amount_cents` en
  `balance_cents` zoals de server ze levert. Er komt geen berekening bij: geen
  som van de lijst, geen "netto na terugdraaien", geen compensatieregel, geen
  saldocontrole. Of een teruggedraaid bedrag doorgestreept of weggelaten
  wordt is presentatie van een bestaand getal.
- **`served_by` uit de bezetting.** Niet geraakt. Alleen lezen: `reversedByName`
  wordt getoond zoals de server hem levert (besluit 3); `serverName` en
  `reversedVia` blijven ongetoond. De attributie zelf wijzigt niet.
- **Omzet.** Een teruggedraaide bestelling telt niet als omzet. Dat is
  bar-/beheerlogica (`dienst-overzicht`); het lid ziet geen omzet. De spec
  mag de lidtekst niet laten klinken alsof de bestelling nooit bestond: ze is
  er wel geweest, maar is teruggedraaid en terugbetaald in het saldo.
- **Portal-cookie-isolatie (ADR 0009).** Ongewijzigd: alleen
  `usePortalTransactions` en andere `usePortal*`-hooks.
- **Hergebruik.** Eén `TransactieRij` blijft de enige rij voor beide
  tabbladen. De bar-`Transactielijst.tsx` heeft eigen markup en andere
  woorden ("TERUG", "SALDO"); die wordt niet aangeraakt en niet gedeeld
  (andere shell, andere doelgroep, zie `portal-dashboard.md`).

## Betrokken shell

`shells/portal` uitsluitend, binnen `src/features/portal-dashboard/`. Geen
wijziging in `shells/bar`, `src/components/` (voorlopig, zie hieronder) of de
datalaag.

## Gekozen aanpak

Alle tekst en drempels in deze sectie volgen de besluiten onder "Besluiten
Bram" (2026-10-05). Formuleringen zijn daarmee vastgelegd; afwijken vraagt
nieuw akkoord.

### 1. Eén reversalweergave, op beide plekken

- Het `showReversal`-argument verdwijnt uit `TransactieRij` en
  `transactionDetail`. De weergave van een teruggedraaide bestelling is
  voortaan niet meer een optie. (Waarom verwijderen en niet default `true`:
  een vlag die nooit meer `false` is, nodigt uit tot opnieuw uitschakelen en
  is precies de oorzaak van F07.)
- Een teruggedraaide bestelling toont, in dezelfde `TransactieRij`:
  - dezelfde label en het bedrag doorgestreept, zoals nu;
  - **een zichtbaar tekstlabel "Teruggedraaid"** (geen kleur-only, geen
    doorhaling-only, ook niet uitsluitend `sr-only`). Voorstel: een
    badge naast of onder het label, tekst in `text-ink` of `text-muted-strong`
    op een achtergrond die in de contrastronde van T12 mee kan;
  - **wie en waarom op eigen regels die mogen afbreken**, niet in de
    `truncate`-subtitel. Kopie: "Door: {naam}" en "Reden: {reden}", in die
    volgorde, elk op een eigen regel (zie "Wie terugdraaide" hieronder). Op
    320px wordt de rij hoger; dat is beter dan een afgekapte status
    (besluit 6).
  - de datum en itemomschrijving blijven in de subtitel zoals nu; de
    subtitel breekt af in plaats van `truncate` (besluit 6).
- **Toegankelijke naam**: de `sr-only`-aanvulling bij het bedrag blijft
  ("(teruggedraaid)"); de badge zelf is al voorleesbare tekst. Voorkom dubbel
  voorlezen: laat de badge leidend zijn en de `sr-only`-tekst bij het bedrag
  alleen bestaan als dat leesvolgorde-technisch nodig is (Developer toetst
  met de a11y-gate; geen eigen oordeel in de spec).
- Het bedrag van een teruggedraaide bestelling: "€ X" doorgestreept in
  `text-muted`, **zonder teken** (besluit 2). Geen "−" en geen "+", geen
  "€ 0,00"; het bedrag is `amount_cents` zoals de server levert.
- **Uitlegregel** (besluit 1): alleen als er minstens één teruggedraaide
  bestelling zichtbaar is in de getoonde rijen, één regel onder de lijst op
  Saldo en onder de lijst op Transacties (onder de maandkoppen, niet per
  groep): "Een teruggedraaide bestelling is niet meer afgeschreven; het bedrag
  staat al terug op je saldo." Zichtbaar bedoeld als gewone tekst
  (`text-muted-strong` of `text-ink`, geen nieuwe kleur), niet `sr-only`.
  Op Transacties telt "zichtbaar" na het filter: bij filter "Opwaarderingen"
  staat de regel er niet.

#### Wie terugdraaide (besluit 3)

- **Tekst**: "Door: {naam}", dezelfde stijl als "Reden: {reden}" (`text-xs
  font-medium text-muted`, afbrekend, `break-words`). `{naam}` is
  `transaction.reversedByName` onaangepast: geen afkorting, geen opmaak, geen
  rol of functie erbij (bardienst/beheerder), geen "via bar/beheer", geen
  bewerking van de naam.
- **Terugdraaier is het lid zelf**, of een bardienst of beheerder: dezelfde
  weergave, geen aparte tekst, geen "jij". Reden: de RPC levert geen id van
  de terugdraaier, alleen een naam, en twee leden kunnen dezelfde naam
  hebben. Vergelijken van naam met de eigen naam kan dus onjuist "jij"
  tonen. Eigen naam tonen is feitelijk juist en onschadelijk. Het kanaal
  (bar of beheer) is nergens in de tekst terug te lezen, ook niet indirect
  (geen verschillende tekst per rol).
- **Ontbrekende naam** (`null` of lege/whitespace-tekst, volgens de database
  niet mogelijk voor een teruggedraaide bestelling: `reversed_by` is `not
  null`, `members.name` is `not null`): de regel "Door: …" wordt weggelaten.
  Niet "onbekend", niet een streepje, geen hangende dubbele punt. De rest van
  de rij (badge, reden) blijft.
- **Ontbrekende reden** (`null` of lege/whitespace): de regel "Reden: …" wordt
  weggelaten, onafhankelijk van de naam.
- Beide regels zitten alleen bij een teruggedraaide bestelling; bij een gewone
  bestelling of opwaardering staan ze er nooit.
- Een naam van een bardienst is door ADR 0010 voor het lid bedoeld; dit raakt
  geen kolom of recht dat niet al aan de lid-sessie is gegeven.

### 2. "Recente transacties" in plaats van "Deze maand"

- Kop "RECENTE TRANSACTIES" (zelfde stijl als de bestaande kop). De selectie
  blijft de laatste N uit de al geladen lijst, over maand- en jaargrenzen
  heen. Geen nieuwe query, geen maandfilter.
- N = 5 (besluit 5). Teruggedraaide
  bestellingen tellen mee in die N, zodat Saldo en Transacties dezelfde
  rijen in dezelfde volgorde tonen.
- Onder of naast de kop een knop "Alle transacties" (besluit 8, `button`,
  geen link). Zichtbaar wanneer er minstens één transactie is; bij een lege
  historie verschijnt de actie niet (er is niets om te openen). Wanneer de
  lijst precies N of minder rijen heeft, blijft de actie staan: de
  Transacties-tab is de enige plek met filters en maandkoppen.
- Lege historie: de bestaande tekst "Nog geen transacties" / "Elke bestelling
  en opwaardering komt hier te staan" blijft, ongewijzigd en juist.
- "Een maand zonder transacties" (acceptatiecriterium 3): bestaat in de
  gekozen variant niet meer op Saldo (er is geen maandblok). Op Transacties
  bestaat geen lege maandgroep: `groupByMonth` maakt een groep alleen voor een
  aanwezige transactie. De enige lege staat naast "geen historie" is
  "Geen transacties voor dit filter", die al klopt. Geen nieuwe tekst nodig,
  (besluit 5: geen maandblok).

### 3. "Alle transacties" opent de Transacties-tab met logische focus

- `PortalDashboard` blijft eigenaar van `tab`. `SaldoTab` krijgt een prop
  (bijvoorbeeld `onShowAll`) die `PortalDashboard` omzet in
  `setTab("transacties")`. Geen globale state, geen routing.
- **Focus** (besluit 8): na het wisselen verdwijnt de bedienende knop uit de
  DOM. De focus mag niet op `body` vallen. Voorstel: de focus gaat naar de
  tab "Transacties" (`document.getElementById(tabElementId(idBase,
  "transacties"))` in een effect na de statuswissel), omdat dat de
  logische plek is in het tabpatroon uit T05 en het panel eronder direct
  de volgende Tab-stop is. Geen wijziging in `Tabs.tsx` nodig. De
  aankondiging van de nieuwe tab loopt via `aria-selected`; geen extra
  `aria-live`.
- Terugkeer naar Saldo (via de tab) werkt zoals nu.

### 4. Tekstfuncties (`transacties.ts`)

- `transactionDetail` wordt de enige plek met de subtitel (datum is al in de
  rij). De reden en de status komen niet meer uit deze functie maar uit de
  rij, zodat ze niet in een afgekapte string zitten. Pure functies blijven
  zonder React en zonder berekening; `test/transacties.test.ts` wordt gericht
  aangepast (de bestaande `showReversal`-tests gaan om naar de nieuwe
  contracten, niet verwijderen).
- Tijdzone en datumformattering (besluit 4): `dateLabel`, `monthKey` en
  `monthLabel` gebruiken vast `Europe/Amsterdam` via `Intl.DateTimeFormat`
  met `timeZone`; `monthKey` leidt jaar en maand uit dezelfde zone af (geen
  `Date#getFullYear/getMonth` in apparaattijd meer). Eén helper, binnen
  `src/features/portal-dashboard/transacties.ts` of `src/lib/date.ts` als
  die al bestaat of door meer dan dit feature gebruikt wordt (Developer
  zoekt eerst, hergebruik gaat voor). De client sorteert nooit (besluit 7).

## Datamodel, RPC's, ADR

- **Geen datamodelwijziging. Geen nieuwe of gewijzigde RPC. Geen
  migratie. Geen backendtest nodig, ook niet voor "wie".**
  `list_own_transactions()` levert al alles (`reversed`, `reversal_reason`,
  `reversed_via`, `reversed_by_name`). `check:rls`, `db:test` en
  `rpc_catalogus` blijven onaangeroerd (geen nieuwe functie, rechten
  ongewijzigd).
- **Geen ADR.** Dit is presentatie binnen bestaande beslissingen
  (ADR 0010/0012, `portal-dashboard.md`). Het tonen van `reversed_by_name`
  aan het lid valt onder ADR 0010. De vaste tijdzone (besluit 4) is een
  helperkeuze binnen `shells/portal`, geen architectuurbeslissing; zie
  Gate-signaal.
- **Gate-signaal.** De `showReversal`-vlag is geen gate-onderwerp. Een
  tijdzone-regel (alle datumweergave via één helper in `src/lib/date.ts` met
  een vaste zone) zou wel een testbare eis zijn; wordt pas een gate-kandidaat
  nu besluit 4 "vaste zone" is en meer dan drie schermen datums tonen. Op dit
  moment alleen portal-datums: geen gate, wel een unittest.

## Rolzichtbaarheid

Ongewijzigd: uitsluitend de ingelogde portal-sessie en uitsluitend eigen
transacties (ADR 0010/0012). Het lid ziet geen ⤺-knop en geen
bardienst-/beheerdersdetail meer dan nu behalve de naam van de terugdraaier op een eigen teruggedraaide bestelling
(besluit 3; ADR 0010). Het kanaal, de naam van de bediende (`serverName`) en
elk ander `members`-veld blijven onzichtbaar.

## Afstemming met andere tickets

- **T08 (#128)** (volgorde: T09 mag eerst, besluit 10) raakt `usePortalTransactions`, `usePortalBalance` en
  `SaldoTab`: refetch, foutstaten, "verouderd"-status, stale data. Deze spec
  verandert alleen de rijweergave, de kop en de actie, en niet de hook, de
  load-/foutstaten of het refetch-gedrag. Conflictkans zit in `SaldoTab.tsx`
  (beide wijzigen dat bestand) en in de a11y-/e2e-tests. Aanbeveling: T09
  eerst bouwen (kleiner, geen hookwijziging); T08 integreert daarna. Als T08
  eerst gaat, moet de Developer van T09 `SaldoTab` opnieuw valideren. Beide
  tickets laten de gedeelde `usePortalTransactions()`-aanroep in elk tabblad
  zoals hij is, tot T08 beslist.
- **T12 (#132)** raakt contrast (o.a. `text-muted` voor doorgestreepte rijen
  en de reversalbadge) en portalbreedte. T09 gebruikt bestaande tokens en
  introduceert geen nieuwe kleuren; de badge-kleur wordt in T12 getoetst.
  Een rij die op 320px hoger wordt, moet ook bij de T12-breedte kloppen. Geen
  afhankelijkheid in volgorde, wel één aandachtspunt voor de Reviewer.
- **T05 (#125, gebouwd)**: `TabList`/`TabPanel`/`tabElementId` uit
  `src/components/Tabs.tsx` worden hergebruikt voor de focus; geen wijziging.
- **T06/T07**: `opslaan.ts`, `TekstVeld` en `VeldFout` zijn hier niet van
  toepassing (geen formulier, geen invoer). Geen hergebruik nodig en geen
  duplicatie.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Normale bestelling | Ongewijzigd: label "Bestelling", "− € X", items in de subtitel. |
| Teruggedraaide bestelling | Op Saldo en Transacties identiek: doorgestreept, zichtbaar "Teruggedraaid", "Door: {naam}" en "Reden: {reden}" zichtbaar en afbrekend; bedrag "€ X" doorgestreept zonder teken; uitlegregel onder de lijst. |
| Opwaardering | Ongewijzigd: "Opgewaardeerd", "+ € X", "contant". Een opwaardering is nooit teruggedraaid (er bestaat geen RPC). |
| Geen historie | Beide tabs: bestaande lege-staattekst; geen "Alle transacties"-actie. |
| Teruggedraaide bestelling is de enige | Actie "Alle transacties" zichtbaar, rij toont reversalstatus. |
| Gefilterd op "Opwaarderingen" en geen enkele | "Geen transacties voor dit filter" (bestaat al). |
| 31 dec naar 1 jan, 30 sep naar 1 okt | Transacties: aparte maandkoppen met jaar. Saldo: kop zegt niets over een maand. Maandgroep en datum in `Europe/Amsterdam` (besluit 4). |
| Reden `null` of leeg | Geen hangende "· teruggedraaid · "; geen "Reden:"-regel, badge blijft. (Komt volgens de database niet voor.) |
| Naam terugdraaier `null` of leeg | Geen "Door:"-regel; geen "onbekend". (Komt volgens de database niet voor.) |
| Terugdraaier is het lid zelf, bardienst of beheerder | Identieke weergave: "Door: {naam}". Kanaal (bar/beheer) nergens zichtbaar of voorleesbaar. |
| Gewone bestelling of opwaardering | Geen "Door:"- en geen "Reden:"-regel, geen uitlegregel. |
| Lange naam van de terugdraaier, 320px | Breekt af; geen horizontale overflow. |
| Reden van 200 tekens, 320px | Breekt af over meerdere regels; ook zonder spaties geen horizontale overflow (Developer verifieert). |
| Hoog saldo of lange bedragen op 320px | Bedrag blijft `whitespace-nowrap`; label en status breken af, niet het bedrag. |
| Saldo en lijst verschillen | Het saldo komt van `usePortalBalance`, de lijst van `usePortalTransactions`; ze worden nooit gesommeerd of vergeleken (verversing: T08). |
| Gastverkoop | Komt hier niet voor (`orders.member_id` is dan null). |

## Teststrategie

- **Unit** (`test/transacties.test.ts`, `npm run test`): gericht aangepast
  naar het nieuwe contract. Bestaande tests voor `showReversal` worden
  omgezet, niet geschrapt. Nieuw: reversalstatus identiek ongeacht de plek,
  geen hangend scheidingsteken bij lege reden, geen berekening op bedragen,
  en maand-/jaargrens met een vaste tijdzone: 30 sep 22:30 UTC wordt 1 okt
  00:30 Amsterdam (zomertijd) en 31 dec 23:30 UTC wordt 1 jan 00:30
  Amsterdam; test draait deterministisch ongeacht `TZ` van de machine.
  Voor "wie": naam wordt letterlijk getoond (bar- en beheerfixture, zelfde
  weergave), `null`/lege naam geeft geen "Door:"-regel, de tekst bevat
  nergens "bar" of "beheer" als kanaal (`reversedVia` komt niet in de
  uitvoer), een gewone bestelling en een opwaardering hebben nooit een
  "Door:"-regel. Uitlegregel: alleen zichtbaar met minstens één zichtbare
  teruggedraaide bestelling, ook na een filter. Bedrag van een
  teruggedraaide bestelling heeft geen teken.
- **a11y e2e** (`e2e/a11y.spec.ts`): Saldo en Transacties met de
  teruggedraaide fixture van Anna de Vries (die bestaat al: een bestelling,
  een opwaardering, een teruggedraaide bestelling). Controleer de
  zichtbare "Teruggedraaid"-tekst, "Door: {naam}" en "Reden: {reden}" op
  beide tabs, en dat de uitlegregel bij de teruggedraaide rij verschijnt en
  bij Piet Bakker ontbreekt. Geen tekst "via bar"/"via beheer". Nieuw: viewport 320px en
  390px zonder afgekapte status of horizontale scroll; "Alle transacties"
  naar de Transacties-tab met de focus op de afgesproken plek; de
  lege-staat (Piet Bakker) zonder actie.
- **Handmatig of Tester**: scenario's uit het issue (normale bestelling,
  reversal, opwaardering, geen historie, 30 sep naar 1 okt, 31 dec naar 1 jan,
  320/390px). Echte backend/geld is niet bewezen door het fixture van de
  audit; de lokale seed met `order_reversals` wel.
- **Reviewwerk**: de client berekent nergens een bedrag (CLAUDE.md,
  geen gate).

## Expliciet buiten scope

- Een compensatie-/correctieregel in de lijst, een eigen saldoberekening of
  "netto"-bedrag (ticket-randvoorwaarde, CLAUDE.md).
- Verversen, retry en verouderingsstatus (T08), contrast en portalbreedte
  (T12).
- Paginering of een maandfilter op de server; een nieuwe query.
- Wijzigingen in `list_own_transactions()` (tiebreaker, extra velden).
- Het terugdraaien zelf, `shells/bar`, bar-`Transactielijst`.
- Een echt maandblok op Saldo (besluit 5: gekozen is optie A).

## Besluiten Bram

Beslist op 2026-10-05. Besluit 3 wijkt af van mijn aanbeveling; de overige
negen volgen haar.

1. **Uitlegregel bij teruggedraaide bestelling: ja.** "Een teruggedraaide
   bestelling is niet meer afgeschreven; het bedrag staat al terug op je
   saldo." Alleen zichtbaar als er een teruggedraaide bestelling in beeld is.
2. **Bedrag teruggedraaide bestelling: "€ X" doorgestreept, zonder teken.**
3. **Toon WIE de bestelling terugdraaide, NIET via welk kanaal.** Afwijking
   van de aanbeveling (die was: niets tonen). Uitgewerkt hierboven ("Wie
   terugdraaide"): "Door: {naam}", `reversedByName` letterlijk, geen kanaal,
   geen aparte weergave voor lid/bardienst/beheerder, regel weg bij ontbrekende
   naam. Geen backendwijziging: het veld levert `list_own_transactions()` al
   (0024) en ADR 0010 dekt de zichtbaarheid voor het lid.
4. **Vast `Europe/Amsterdam`** voor datum en maandgroep.
5. **Kop "Recente transacties", N = 5**, teruggedraaide bestellingen tellen
   mee (optie A, geen maandblok).
6. **Rij mag hoger worden op smal scherm**; status nooit afgekapt, bedrag op
   één regel (`whitespace-nowrap`).
7. **Geen tiebreaker; de client hersorteert nooit.** Geen RPC-wijziging.
8. **"Alle transacties" als knop**, daarna focus op de tab "Transacties".
9. **Zichtbare badge "Teruggedraaid" en "Reden: …"** in plaats van "TERUG".
10. **T09 mag vóór T08.**

## Open vragen

Beantwoord: geen open vragen meer. Alle vragen zijn beslist; "wie" is bouwklaar omdat het veld al beschikbaar
en toegestaan is. Een eventuele latere wens om bijvoorbeeld "jij" te tonen als
het lid zelf terugdraaide, of het kanaal alsnog te tonen, zou dit wél
veranderen: eerste vraagt dan een `reversed_by_is_self boolean` of
`reversed_by_member_id` in `list_own_transactions()` (migratie,
`list_own_transactions.test.sql` uitbreiden, `rpc_catalogus` ongewijzigd
omdat de functie al een client-RPC is, ADR-aanvulling op 0010 omdat een id van
een ander lid dan de naam lekt). Dat is expliciet buiten deze spec.

## Wat de Developer niet hoeft te doen

Geen RPC, geen migratie, geen nieuwe hooks, geen wijziging in
`usePortalTransactions`, `usePortalBalance` of `Tabs.tsx`, geen
`scripts/check-arch.mjs`-wijziging (de map staat al in `PORTAL_ONLY_DIRS`).

## Zoals gebouwd

Gebouwd in [PR #155](https://github.com/BramLambertJansen/ABAS/pull/155)
(`85311012`), alleen in `src/features/portal-dashboard/`. Geen backend- of
RPC-wijziging, geen migratie, geen ADR, `usePortalTransactions` en
`Tabs.tsx` ongewijzigd. De spec is gevolgd; er zijn geen inhoudelijke
afwijkingen.

### Onderdelen en hun plek

- **`TransactieRij.tsx`**: de enige rij voor Saldo en Transacties, zonder
  `showReversal`. Teruggedraaid: label en bedrag `text-muted line-through`,
  badge "Teruggedraaid" (zichtbare tekst), de regels uit `reversalLines` op
  eigen, afbrekende regels (`break-words`), bedrag `whitespace-nowrap`. Een
  aparte `sr-only`-toevoeging bij het bedrag is er niet meer; de badge is de
  voorleesbare status. In hetzelfde bestand staat **`TerugdraaiUitleg`**
  (gewone tekst, `text-muted-strong`).
- **`transacties.ts`** (pure functies): `reversalLines`, `amountSign`,
  `showReversalExplanation(visible)`, `recentTransactions` (N =
  `RECENT_TRANSACTIONS_LIMIT` = 5), `REVERSAL_EXPLANATION`;
  `transactionDetail` geeft alleen nog itemomschrijving of "contant".
- **Vaste tijdzone**: `PORTAL_TIME_ZONE = "Europe/Amsterdam"` in
  `transacties.ts`; `dateLabel` en `monthKey` (en `monthLabel`) gebruiken
  `Intl.DateTimeFormat` met `timeZone`. De spec liet `src/lib/date.ts` als
  mogelijke plek open; de helper staat in `transacties.ts` en `src/lib/date.ts`
  is niet gewijzigd.
- **`SaldoTab.tsx`**: kop "RECENTE TRANSACTIES", knop "Alle transacties"
  (alleen bij minstens één transactie), `TerugdraaiUitleg` onder de lijst.
  **`TransactiesTab.tsx`**: één uitlegregel onder alle maandgroepen, op
  basis van de gefilterde rijen.
- **Focus na "Alle transacties"**: `PortalDashboard.tsx` krijgt `onShowAll`
  van `SaldoTab` en zet via een ref plus effect de focus op het element met
  `tabElementId(idBase, "transacties")`. `Tabs.tsx` is niet gewijzigd.

### Besluiten 1-10

Alle tien zijn zo gebouwd als beslist: (1) uitlegregel alleen bij een
zichtbare teruggedraaide bestelling, ook na filter; (2) bedrag zonder teken;
(3) "Door: {naam}", geen kanaal; (4) vast `Europe/Amsterdam`; (5) N = 5,
teruggedraaide tellen mee, geen maandblok; (6) rij mag hoger worden, status
nooit afgekapt; (7) geen tiebreaker, de client sorteert nooit; (8) knop plus
focus op de tab; (9) badge "Teruggedraaid" en "Reden: …" in plaats van
"TERUG"; (10) T09 vóór T08.

### Wie terugdraaide

`reversed_by_name` uit `list_own_transactions()` (0024), letterlijk getoond.
Geen kanaal (`reversedVia` wordt nergens gerenderd, ook niet in attributen),
geen "jij", geen "TERUG". Een lege of ontbrekende naam laat alleen de regel
"Door: …" vervallen; hetzelfde voor een lege reden. Geen backend- of
RPC-wijziging.

### Tester-bevindingen

Geen bugs. Extra tests voor grensgevallen: tijdzonegrens 31 dec 22:59Z (nog
31 dec) en 23:00Z (1 jan Amsterdam), de grens bij N = 5, whitespace-reden en -naam, servervolgorde behouden, bedragen
zonder berekening, en het kanaal nergens in de uitvoer of in attributen.
Tests: `test/transacties.test.ts` en `e2e/portaltransacties-consistent.spec.ts`
(gemockt, 320 en 390px, focus, tijdzone).

### Reviewer-oordeel

Goedgekeurd. De live-assertions in `e2e/a11y.spec.ts` zijn geverifieerd
tegen de seed: Anna heeft één teruggedraaide bestelling (Chips, reden
"verkeerd product getikt", teruggedraaid door Sanne Bakker) en drie
transacties, dus binnen N = 5.

### Niet gedekt

- Handmatig testen op iOS Safari en Android.
- De zomertijdwissel zelf (alleen de grenzen 22:59Z/23:00Z zijn getest).
- De live e2e (tegen de seed) is lokaal niet draaibaar; die loopt in CI.

### Backlog

- `e2e/a11y.spec.ts`: `getByText("Bestelling")` is een substring-match en
  fragiel; `{ exact: true }` overwegen.
- De kop "RECENTE TRANSACTIES" staat als uppercase-literal in `SaldoTab.tsx`
  (de maandkoppen gebruiken `toUpperCase()`).
- "jij" tonen als het lid zelf terugdraaide, of het kanaal alsnog tonen,
  vraagt een RPC-wijziging en een aanvulling op ADR 0010 (zie "Open vragen").
- T08 (#128) en T12 (#132) raken dezelfde schermen (`SaldoTab.tsx`, contrast
  van badge en doorgestreepte rijen, portalbreedte).
