# Portal-dashboard: eigen saldo + transacties

**Geaccordeerd door Bram (2026-09-26).** Introduceert een nieuwe
architectuurbeslissing (RPC-gated naamresolutie i.p.v. RLS-verruiming) — zie
[ADR 0010](../adr/0010-portal-transacties-naam-via-rpc-niet-rls-verruiming.md),
mee geaccordeerd.

Spec voor [issue #16](https://github.com/BramLambertJansen/ABAS/issues/16).
Volgt op [#15](https://github.com/BramLambertJansen/ABAS/issues/15)
(portal-login, gemerged) — zie `docs/features/portal-login.md` en
[ADR 0009](../adr/0009-portal-sessie-eigen-cookienaam.md) voor de
cookie-isolatie waar dit ticket op voortbouwt. Sluit ook direct aan op
`docs/features/bestelling-terugdraaien.md` → Expliciet buiten scope: *"Het
transactieoverzicht voor leden in het portaal. Het leesrecht staat al klaar
(RLS hierboven), het scherm bestaat nog niet."* — dit is dat scherm.

## Onderzocht in /designs/

- `designs/Lid App.dc.html`, `isSaldo`-blok (regel 218–255): het "Saldo"-tabblad
  — donkere hero-kaart met "HUIDIG SALDO", bedrag, een hint-regel, een
  laag-saldo-kaart (`lowBalance`, regel 237–244) en een "DEZE MAAND"-lijst van
  de laatste transacties.
- `designs/Lid App.dc.html`, `isTxns`-blok (regel 262–283): het
  "Transacties"-tabblad — filterrij (Alles/Uitgaven/Opwaarderingen,
  `txnFilters` regel 658), per-maand-groepen (`txnGroups`, regel 661), een
  "Einde van de lijst"-voettekst.
- `designs/Lid App.dc.html`, `TXNS`-fixture (regel 436–443) en `row()` (regel
  498–505): het exacte rijformaat — label ("Bestelling"/"Opgewaardeerd"/
  "Correctie"), subtitel (datum · detail, waarbij een opwaardering
  "contant · bardienst Sanne" toont), bedrag met `+`/`−`-teken en groene kleur
  voor een bijboeking.
- `designs/Lid App.dc.html`, topup-sheet (regel 349–360): de letterlijke
  iDEAL-nog-niet-tekst staat ook al in de issue zelf (Context) — hieronder
  letterlijk hergenomen, niet herschreven.
- **Drie bewuste afwijkingen van de wireframe**, elk met een reden die zwaarder
  weegt dan "eerste bouw volgt het ontwerp" (CLAUDE.md → Designbestanden staat
  afwijking toe als de reden goed is, niet alleen achteraf):
  1. **Een teruggedraaide bestelling krijgt geen eigen "Correctie"-regel**
     (zoals `TXNS`-fixture regel 442 doet), maar wordt — net als op de bar —
     getoond als de oorspronkelijke bestelling zelf, doorgestreept, met een
     "TERUG"-badge en de reden. Dat is letterlijk hoe
     `bestelling-terugdraaien.md` → "Besloten" het al vastlegde ("De
     bestelling zelf blijft zichtbaar, doorgestreept, met 'TERUG' en de
     reden") en hoe `src/features/dienst-overzicht/Transactielijst.tsx` het al
     bouwt (`reversed ? "text-muted line-through" : ...`, `"TERUG"`-badge). De
     wireframe voor de portal is ouder dan die beslissing en kende
     `order_reversals` als apart concept nog niet. Eén weergave-conventie
     voor "een teruggedraaide bestelling", niet twee, weegt hier zwaarder dan
     de portal-wireframe volgen.
  2. **Geen "Tikkie of bank" in de opwaardeer-melding.** De wireframe se
     topup-sheet (regel 359) noemt "Contant, Tikkie of bank" als
     betaalmethodes bij de bar. `docs/features/opwaarderen.md` → Besloten
     (2026-08-29) legt vast dat MVP **uitsluitend contant** is — de
     `top_ups.method`-waarde is hardcoded `"cash"`/"contant", er is geen
     methode-toggle, en die spec noemt "Tikkie"/"bank" expliciet als
     prototype-tekst die niet de vastgelegde MVP-scope is. Deze spec neemt dus
     alleen "contant" over, niet de rest van die zin.
  3. **Geen werkende bottom-sheet.** De wireframe opent de iDEAL-melding via
     een tik op een "Opwaarderen"-knop. `src/components/Overlay.tsx`'s
     `overlay: "sheet"`-tak is vandaag een niet-geïmplementeerde stub ("Renders
     the same centered-dialog markup as 'modal' for now... this branch exists
     so overlay's type keeps both variants honest for whichever screen builds
     the real one") — er bestaat nog geen portal-scherm dat 'm echt gebruikt.
     Omdat de melding hier statisch is (geen invoer, geen keuze, geen actie
     die iets doet) is er geen inhoudelijke reden om dít ticket de eerste
     bouwer van een echte bottom sheet te maken voor een blok tekst dat net zo
     goed altijd zichtbaar kan staan. Zie Schermflow → Saldo-tabblad.
- **Laag-saldo-kaart, feitelijke correctie op de wireframe-tekst.** Regel 240
  van de wireframe: "Onder {drempel} kan de bar bestellingen weigeren." Dat
  klopt niet met ons domeinmodel: een bestelling wordt pas geweigerd onder de
  door de beheerder ingestelde **negatieflimiet**
  (`app_settings.negative_limit_cents`, CLAUDE.md → Domein), een aparte,
  instelbare waarde die los staat van de vaste €10-waarschuwingsdrempel. Een
  lid met bijvoorbeeld €8 saldo en een negatieflimiet van €5 kan nog gewoon
  bestellen. Deze spec neemt de titel ("Saldo bijna op") over maar niet de
  suggestieve tweede zin — zie Schermflow → Saldo-tabblad voor de vervangende
  tekst.
- `designs/chats/chat30.md` is al door `docs/features/portal-login.md`
  doorzocht voor de Lid-App-flow; het bevat geen passage over saldo/
  transacties specifiek (alleen entry/login-flow), dus niets aanvullends hier.

## Doel

Een lid (rol `lid`, ingelogd via `/portal`, zie `portal-login.md`) ziet het
eigen saldo en de eigen transacties — CLAUDE.md → Domein: "Lid — ziet eigen
saldo en transacties. Verder niets." Dit scherm is de eerste echte inhoud
achter een portal-login; `PortalShellHome.tsx`'s huidige "ingelogd
als {naam}"-placeholder (`portal-login.md` → Betrokken shell, "Gewijzigd")
wordt hierdoor vervangen.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen als
volgt:**

- **"Geld beweegt alleen via RPC."** Niet van toepassing in de schrijf-zin —
  dit scherm muteert nergens een bedrag, het is uitsluitend lezen
  (acceptatiecriterium "Read-only: geen enkele actie hier muteert saldo
  direct"). Het raakt de geldlaag wél lezend: `members.balance_cents`,
  `orders`/`order_lines`/`top_ups`/`order_reversals`, stuk voor stuk al
  bestaande, door `place_order`/`top_up`/`reverse_order_*` berekende/
  geschreven waarden. Er wordt hier niets client-side berekend — elk bedrag
  komt ongewijzigd uit de database, zelfde regel als `useShiftLedger.ts`/
  `useMemberOrders.ts` al volgen.
- **"`served_by` komt uit de bezetting, niet uit een PIN."** Niet van
  toepassing — dit scherm *toont* een reeds vastgelegde `served_by`/
  `reversed_by`-toeschrijving (als naam, ter informatie), het *schrijft* er
  geen. Zie ADR 0010 voor de nieuwe vraag die dit wél oproept: hoe een lid-
  sessie, die verder alleen de eigen rijen leest (ADR 0007), toch de naam van
  de bediende medewerker mag zien.

## Betrokken shell

**`shells/portal` uitsluitend** — er is geen saldo-/transactieconcept in
`shells/bar` dat dit scherm zou delen; het is het "lid ziet eigen data"-
scherm dat `bestelling-terugdraaien.md` en `laag-saldo-signalering.md` allebei
al als toekomstig, portal-only stuk aanmerkten.

- **Nieuw:** `src/features/portal-dashboard/` — shell-onwetend in naam, maar
  in de praktijk (zoals `portal-login/`) een portal-only featuremap: er is
  geen bar-tegenhanger om generiek voor te bouwen. Bevat minimaal
  `PortalDashboard.tsx` (container: header met naam/uitloggen + de
  tab-omschakeling Saldo/Transacties), `SaldoTab.tsx`, `TransactiesTab.tsx`.
  Geen `useShell()`-contract nodig — deze feature bestaat uitsluitend binnen
  `shells/portal`, er is geen tweede shell om capabilities voor te
  onderscheiden (zelfde constatering als `portal-login.md`, dat om dezelfde
  reden geen `useShell()`-sectie heeft).
- **Gewijzigd:** `src/shells/portal/PortalShellHome.tsx` — de `"signed-in"`-tak
  rendert voortaan `<PortalDashboard name={...} email={...}
  onSignOut={...} />` in plaats van de "Welkom, {naam}"-placeholder. De
  `"loading"`/`"denied"`/`"signed-out"`-takken blijven ongewijzigd.
- **Nieuw, drie hooks in `src/hooks/queries/`** — alle drie met de
  `usePortal`-naamprefix, bewust (zie hieronder):
  - `usePortalBalance.ts` — eigen naam + `balance_cents`, platte `select` via
    `portalClient.ts`.
  - `usePortalAppSettings.ts` — `low_balance_threshold_cents`, platte
    `select` via `portalClient.ts`. **Geen hergebruik van de bestaande
    `useAppSettings.ts`**: die importeert `@/lib/supabase/client` (de
    bar/device-cookie), wat voor een portal-sessie het verkeerde — of geheel
    afwezige — device-cookie zou lezen (ADR 0009, cookie-isolatie). Dit is
    dezelfde, in `portal-login.md` → "Herbruik" al vastgelegde reden waarom
    `usePortalLogin.ts`/`usePortalSession.ts` ook geen import zijn van hun
    bar-tegenhangers: "de reden dat het niet dezelfde bestanden kunnen zijn is
    de cookie-isolatie zelf, niet een stijlvoorkeur." De data zelf is
    identiek toegankelijk (`app_settings` is ongeclausuleerd leesbaar voor
    elke `authenticated`-sessie, ADR 0007 → Reikwijdte) — alleen de cliënt
    die 'm ophaalt moet de portal-cookie gebruiken.
  - `usePortalTransactions.ts` — combineert de nieuwe RPC (`list_own_
    transactions()`, zie RPC's) met een platte, portal-cliënt `select` op
    `order_lines`/`products` (voor de itemomschrijving per bestelling) op de
    order-id's die de RPC teruggaf.
- **Gewijzigd:** `scripts/check-arch.mjs` — `PORTAL_ONLY_DIRS` krijgt een
  vierde entry, `"src/features/portal-dashboard/"`, naast de bestaande drie
  (`src/app/portal/`, `src/shells/portal/`, `src/features/portal-login/`).
  Zonder deze toevoeging valt de nieuwe featuremap buiten `isPortalOnlyFile()`
  en zou `check:arch` een import van `@/lib/supabase/client`/`server` daar
  niet tegenhouden — precies de fout die ADR 0009's gate juist moet vangen.
  De drie nieuwe hooks hebben deze toevoeging niet nodig: `isPortalOnlyFile()`
  herkent ze al aan de `usePortal`-bestandsnaamprefix (zelfde mechanisme als
  `usePortalLogin.ts`/`usePortalSession.ts`/
  `usePortalWachtwoordHerstellen.ts` vandaag al gebruiken, zie
  `scripts/check-arch.mjs` regel 51–66) — vandaar dat alle drie nieuwe hooks
  hierboven met de `usePortal`-prefix genoemd staan, niet toevallig.

## Datamodel

**Geen schemawijziging.** Alle gelezen tabellen (`members`, `orders`,
`order_lines`, `top_ups`, `order_reversals`, `app_settings`, `products`)
bestaan al; de RLS die een `lid`-sessie tot de eigen rijen beperkt bestaat ook
al (ADR 0007, `bestelling-terugdraaien.md` voor `order_reversals`). Dit ticket
voegt precies één nieuwe RPC toe (zie hieronder) en verandert geen bestaande
policy.

## RPC's

**Nieuwe RPC: `list_own_transactions()`**, nieuwe migratie
`supabase/migrations/0023_portal_eigen_transacties.sql`. Zie
[ADR 0010](../adr/0010-portal-transacties-naam-via-rpc-niet-rls-verruiming.md)
voor waarom dit een RPC is en geen verruiming van `members_select`.

- **Geen parameters.** Bepaalt de aanroeper via `caller_member_id()`
  (bestaande helper, `0015_lid_leest_alleen_eigen_rijen.sql`) — geeft nooit
  transacties van iemand anders terug, ongeacht wie aanroept. Een sessie
  zonder gekoppeld lid (`caller_member_id()` is `null` — o.a. de gedeelde
  bar-tablet-device-sessie of een bardienst/beheerder-sessie zonder eigen
  `lid`-rij) krijgt een lege resultset, geen fout — stille no-op, zelfde
  eigenschap als `link_invited_member_account`/`link_lid_member_account`.
- **`SECURITY DEFINER STABLE`** — nodig om de naam van `served_by`/
  `reversed_by` te kunnen lezen ondanks de aanroeper-eigen RLS-beperking op
  `members` (ADR 0007), exact zoals `caller_is_lid()` dat al doet voor een
  ander doel.
- **Combineert `orders` en `top_ups`**, nieuwste eerst, **geen paginering in
  v1** — zie Expliciet buiten scope.
- **Retourneert, per transactie:**

  | Kolom | Type | Betekenis |
  |---|---|---|
  | `id` | `uuid` | `orders.id` of `top_ups.id` |
  | `kind` | `text` | `'bestelling'` of `'opwaardering'` |
  | `created_at` | `timestamptz` | ongewijzigd uit de bronrij |
  | `amount_cents` | `integer` | `orders.total_cents` of `top_ups.amount_cents`, altijd positief — richting volgt uit `kind`, zelfde conventie als `useShiftLedger.ts`'s `LedgerEntry.amountCents` |
  | `method` | `text \| null` | `top_ups.method` (vandaag altijd `"cash"`); `null` bij `kind = 'bestelling'` |
  | `server_name` | `text` | naam van `served_by` — dit is het veld waar de RPC voor bestaat, zie ADR 0010 |
  | `reversed` | `boolean` | alleen relevant bij `kind = 'bestelling'`; `false` voor een opwaardering (die kent geen `order_reversals`-rij) |
  | `reversal_reason` | `text \| null` | `order_reversals.reason`, `null` tenzij `reversed` |
  | `reversed_via` | `text \| null` | `'bar'` of `'beheer'`, `null` tenzij `reversed` |
  | `reversed_by_name` | `text \| null` | naam van `reversed_by`, `null` tenzij `reversed` |

  Exacte SQL (joins, `security definer`-body) is aan de Developer — deze tabel
  is het contract, geen implementatie.
- **Geen item-/productdetail in deze RPC.** `order_lines`/`products` hebben
  het RLS-probleem van ADR 0010 niet (`order_lines_select` staat een lid al
  toe de eigen bestelregels te lezen via `caller_owns_order()`, `products` is
  ongeclausuleerd leesbaar) — `usePortalTransactions.ts` haalt die met een
  gewone, tweede `portalClient.ts`-`select` op (`order_lines`
  gefilterd op de order-id's die de RPC teruggaf, embed naar `products(name)`
  voor de naam), zelfde tweetraps-aanpak als `useShiftLedger.ts` al voor de
  bar volgt, alleen hier over twee losse calls in plaats van één embed —
  precies omdat het embed-probleem hier niet bestaat en een losse RPC-kolom
  ervoor dus overbodig zou zijn (zie ADR 0010 → "Niet gekozen: alles ... via
  dezelfde RPC").
- **Grants**, zelfde patroon als elke RPC sinds 0018: `grant execute on
  function list_own_transactions() to authenticated;` gevolgd door een
  expliciete `revoke ... from public` / `revoke ... from anon` — bewaakt
  door het al bestaande, generieke `supabase/tests/
  rpc_execute_grants.test.sql` (dat elke functie in `public` controleert,
  geen aparte toevoeging nodig).
- **Nieuwe negatieve tests**, `supabase/tests/list_own_transactions.test.sql`:
  - een `lid`-sessie ziet nooit een transactie van een ander lid;
  - een sessie zonder gekoppeld lid (device-sessie, of een
    bardienst/beheerder-sessie) krijgt een lege set, geen fout;
  - een teruggedraaide bestelling komt terug met `reversed = true` en de
    juiste `reversal_reason`/`reversed_via`/`reversed_by_name`;
  - een opwaardering heeft altijd `reversed = false`, nooit een
    reversal-veld gevuld.

## Schermflow

Twee tabbladen binnen `PortalDashboard.tsx`, zelfde `role="tablist"`-patroon
als `DienstTabs.tsx`/`BeheerTabs.tsx` (elk feature-eigen, geen gedeeld
`Tabs`-component vandaag — zie CLAUDE.md → "Componenten zijn herbruikbaar
totdat bewezen anders": twee bestaande, niet-gedeelde precedenten zijn nog
geen reden om er hier een derde kopie zonder gedeeld component van te maken
te verbieden, maar een Reviewer mag met drie exemplaren gerust de vraag
stellen of extractie nu wél de moeite waard is — geen blokkade voor dit
ticket). Een kleine header (naam + "Uitloggen"-knop, het enige dat overblijft
van `PortalShellHome.tsx`'s huidige placeholder) staat boven beide
tabbladen, geen apart "Account"-tabblad — zie Expliciet buiten scope.

### 1. Saldo-tabblad (standaard bij het openen)

- **Hero-kaart**: "HUIDIG SALDO", `formatCents(balanceCents)`, en een
  hint-regel — "onder de grens van {drempel}" bij een laag saldo, anders een
  neutrale regel (geen "bijgewerkt vandaag HH:MM" uit de wireframe: er is geen
  live-klok-requirement in deze spec en een verzonnen tijdstip zou onjuist
  zijn zodra het niet ververst is).
- **Laag-saldo-kaart**, alleen als `balanceCents < lowBalanceThresholdCents`
  (strikt `<`, zelfde grens als `Mandje.tsx`/`laag-saldo-signalering.md` —
  twee plekken die al dezelfde conventie delen, deze wordt de derde, mag
  nooit afwijken): titel "Saldo bijna op" (wireframe, letterlijk), tekst
  **"Onder {drempel} vraagt de bardienst je mogelijk om je saldo aan te
  vullen. Waardeer op bij de bar."** — vervangt de wireframe se feitelijk
  onjuiste zin, zie "Onderzocht in /designs/" hierboven. Niet
  kleur-only (WCAG AA, zelfde eis als `Mandje.tsx` al volgt): titel + tekst,
  geen los icoon nodig zolang de kaart zelf al tekst-gedragen is.
- **Opwaardeer-melding**, **altijd zichtbaar** (geen knop, geen sheet — zie
  "Onderzocht in /designs/" punt 3): een statisch blok met, letterlijk uit de
  issue-tekst (Context): **"Zelf opwaarderen via iDEAL komt in een volgende
  versie. Voor nu waardeer je op bij de bar."**, aangevuld met
  **"Contant — de bardienst boekt het direct bij op je saldo."** (wireframe se
  zin, met "Tikkie of bank" verwijderd, zie "Onderzocht in /designs/" punt 2).
- **"Deze maand"-lijst**: de meest recente transacties uit
  `usePortalTransactions()`, client-side afgekapt tot bijvoorbeeld de laatste
  5 — een korte "voorproefje"-lijst, niet de volledige geschiedenis (die staat
  op het Transacties-tabblad). Elke rij: label (zie hieronder), subtitel
  (datum · detail), bedrag met `+`/`−`-teken. Een lege lijst (nieuw lid, nog
  nooit een transactie): "Nog geen transacties" / "Elke bestelling en
  opwaardering komt hier te staan" (zelfde soort lege-staat-tekst als
  `Transactielijst.tsx` al voor de bar gebruikt).

### 2. Transacties-tabblad

- **Filters**: "Alles" / "Uitgaven" / "Opwaarderingen" (wireframe,
  `txnFilters`), client-side op de al geladen lijst — geen nieuwe query per
  filter, zelfde soort client-side afleiding als `laag-saldo-signalering.md`
  → RPC's/leeshooks al beargumenteerde ("een `useMemo`-derivatie... geen
  extra RPC of query-parameter"). Een teruggedraaide bestelling telt voor dit
  filter als "Uitgaven" (het is en blijft een bestelling, zie hieronder) —
  niet als een aparte categorie.
- **Groepering per maand** (wireframe, `txnGroups`), nieuwste maand eerst,
  binnen een maand nieuwste eerst.
- **Per rij**, zelfde velden als de "Deze maand"-lijst hierboven, plus bij een
  teruggedraaide bestelling:
  - label/bedrag doorgestreept (`text-muted line-through`, zelfde klasse-
    conventie als `Transactielijst.tsx`);
  - subtitel aangevuld met `· teruggedraaid · {reversal_reason}` (zelfde
    vorm als `Transactielijst.tsx` regel 160);
  - een `sr-only`-toevoeging "(teruggedraaid)" bij het bedrag, zelfde reden
    als `Transactielijst.tsx` (WCAG AA: niet uitsluitend doorstrepen als
    signaal).
  - **geen ⤺-knop** — een lid kan hier nooit iets terugdraaien, alleen bar
    (tijdens de eigen dienst) en beheer kunnen dat
    (`bestelling-terugdraaien.md`).
- **Labels per `kind`**: "Bestelling" (`kind = 'bestelling'`, niet
  teruggedraaid), "Opgewaardeerd" (`kind = 'opwaardering'`) — wireframe-
  woorden, lid-gericht (bewust anders dan de bar-tablet se eigen "verkoop"-
  badge in `Transactielijst.tsx`: andere doelgroep, geen inconsistentie).
- **Detail-subtitel**: voor een bestelling de itemomschrijving (bv. "2× pils,
  1× chips", uit `order_lines`/`products`, zie RPC's); voor een opwaardering
  "contant" (`method`, vandaag altijd die ene waarde — geen methode-toggle,
  `opwaarderen.md` → Besloten).
- **"Einde van de lijst"**-voettekst (wireframe, letterlijk) — hier waar,
  want er is (v1) geen paginering; zie Expliciet buiten scope.
- **Lege staat** (geen enkele transactie): zelfde tekst als de "Deze
  maand"-lege-staat hierboven.
- **Laad-/foutstaten**: vaste Nederlandse boodschap, geen ruwe
  Postgres-foutmelding, zelfde patroon als elke andere hook in deze codebase
  (`useMemberOrders.ts`/`useAppSettings.ts`).

## Rolzichtbaarheid

- Uitsluitend zichtbaar in `usePortalSession()`'s `"signed-in"`-staat — dat is
  al gated tot rol `lid` (`usePortalSession.ts`: `if (!data || data.role !==
  "lid") { ... "denied" ... }`). Geen aparte rolcheck nodig binnen
  `PortalDashboard.tsx` zelf.
- `list_own_transactions()` is zelf-scopend (`caller_member_id()`) ongeacht
  wie aanroept — een bardienst/beheerder-sessie die 'm zou aanroepen (kan
  niet via deze UI, die route bestaat niet in `shells/bar`) zou hooguit de
  eigen transacties als lid-van-de-vereniging terugkrijgen, nooit die van een
  ander lid. Geen extra rolcheck in de RPC nodig — "alleen je eigen data"
  is per definitie veilig voor elke rol, zie ADR 0010.
- Geen enkele bardienst/beheerder-functionaliteit hier (geen ledenzoeker,
  geen "alle leden"-lijst) — dit scherm bestaat uitsluitend binnen
  `shells/portal`.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Saldo exact op de drempel (`balanceCents === lowBalanceThresholdCents`) | Geen laag-saldo-kaart — strikt `<`, zelfde grens als `Mandje.tsx`. |
| Negatief saldo | Telt vanzelf mee als "laag" (`< drempel`); `formatCents` toont het negatieve bedrag correct (zie `src/lib/money.ts`'s docstring-correctie). |
| Nieuw lid, nog geen enkele transactie | Lege staat op beide tabbladen, geen crash — zie Schermflow. |
| `usePortalAppSettings()` nog in `"loading"` | Toon geen laag-saldo-kaart totdat de drempel echt geladen is (zelfde guard als `laag-saldo-signalering.md` → Randgevallen: een `threshold = 0`-placeholder zou ten onrechte "niet laag" concluderen). |
| Teruggedraaide bestelling | Doorgestreept, "TERUG"-achtige subtitel-toevoeging, geen ⤺-knop — zie Schermflow. |
| Gastverkoop (`orders.member_id is null`) | Kan hier nooit voorkomen — zo'n bestelling hoort bij niemand (ADR 0007 → "vier eigenschappen" §4) en `list_own_transactions()` filtert altijd op de aanroeper se eigen `member_id`. |
| Saldo/transacties wijzigen live terwijl het scherm open staat (bv. de bardienst rondt op de bar-tablet net een bestelling voor dit lid af) | Geen live-subscriptie in v1 — refetch bij opnieuw binnenkomen (focus/mount), zelfde "geen race-conditie-bescherming nodig"-afweging als `laag-saldo-signalering.md`/#29. |
| Sessie verloopt terwijl het scherm open staat | Bestaand gedrag van `usePortalSession()` (terug naar `PortalLogin`) — dit ticket voegt daar niets aan toe. |
| Seed-/CI-data | `supabase/seed.sql`'s bestaande `lid`-fixture (Anna de Vries, `anna.de.vries@aurora.local`, saldo €12,40) heeft nog geen `orders`/`order_lines`/`top_ups`/`order_reversals`-rijen. Developer/Tester voegen fixtures toe (minstens: één bestelling, één opwaardering, één teruggedraaide bestelling) — nodig om zowel de gevulde als de lege staat te kunnen testen, zelfde bootstrap-verantwoordelijkheid als `portal-login.md` → Randgevallen "Seed-/CI-data" bij zich nam. |
| **a11y** | `e2e/a11y.spec.ts`'s bestaande scenario "portal (/portal) ingelogde staat (Anna de Vries)" scant vandaag de oude "Welkom, {naam}"-placeholder — die tekst bestaat na dit ticket niet meer, dus dat scenario moet worden bijgewerkt naar het nieuwe Saldo-tabblad. Nieuw toe te voegen: Transacties-tabblad, de laag-saldo-variant (een tweede fixture-lid met saldo onder de drempel, of `demoLowBalance`-achtige toggle in de test-seed), en de lege-transacties-staat. |

## Expliciet buiten scope

- **Online opwaarderen (iDEAL)** — CLAUDE.md → Domein noemt dit expliciet als
  latere fase; issue #23 volgt dit apart op.
- **Een "Account"-tabblad** (naam wijzigen, wachtwoord wijzigen, pincode,
  e-mailmelding-toggle bij laag saldo — wireframe se `isSettings`-scherm) —
  niet gevraagd door issue #16 ("eigen saldo en transacties. Verder niets."),
  eigen ticket zodra dat er is. Alleen een "Uitloggen"-knop blijft, zie
  Schermflow.
- **Een echte, werkende bottom sheet** (`Overlay.tsx`'s `overlay: "sheet"`-
  tak) — de opwaardeer-melding is hier statisch, geen sheet nodig, zie
  "Onderzocht in /designs/" punt 3. De eerste échte portal-sheet-consument is
  een ander ticket.
- **Paginering van de transactielijst** — v1 toont alles wat
  `list_own_transactions()` teruggeeft, zonder limiet of "laad meer". Bij een
  vereniging van deze schaal is dat naar verwachting geen probleem; een latere
  iteratie kan paginering toevoegen zonder het RPC-contract te breken (een
  `limit`/`before`-parameter zou een backward-compatible toevoeging zijn).
- **E-mailmelding bij laag saldo** (wireframe se `notify`-toggle) —
  Account-tabblad-functionaliteit, hierboven al buiten scope, en er bestaat
  vandaag geen mail-infrastructuur voor zo'n melding.
- **Verruiming van `members_select`** — expliciet vermeden, zie ADR 0010.
- **Live/real-time bijwerken van saldo of lijst** — zie Randgevallen, refetch
  bij hernieuwd bezoek volstaat voor v1.
