# Ledenbeheer (member CRUD)

Spec voor ledenbeheer — **GitHub-issuenummer nog niet toegewezen.** Er
bestaat op het moment van schrijven geen ticket voor dit onderwerp; Bram
heeft het als volgende onderwerp gekozen (zie `docs/ARCHITECTURE.md` → "Wat
het prototype deed maar hier nog niet is besloten": *"`Leden` admin screen
(member CRUD) — implied necessary since `beheerder` manages ledenbeheer per
`CLAUDE.md`, but not yet specced."*). Deze spec vervangt die placeholder-regel
zodra ze goedgekeurd is. Bram wijst bij akkoord een issuenummer toe (of dit
gebeurt als onderdeel van het akkoord zelf) — de verwijzingen hieronder naar
"dit ticket" zijn dus voorlopig zonder nummer; de Developer/Reviewer werken
dit bij zodra het nummer bekend is, geen inhoudelijke wijziging.

Volgt hetzelfde beheer-sessiepatroon als
[#14](https://github.com/BramLambertJansen/ABAS/issues/14)
(`docs/features/assortimentbeheer.md`, ADR
[0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)/
[0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)) — lees
beide ADR's eerst, deze spec past ze toe en herhaalt de motivatie niet.

## Doel

Een beheerder kan, vanaf het gedeelde bar-tablet, leden aanmaken (naam +
optioneel startsaldo), een ledenlijst doorzoeken/filteren, de naam van een
bestaand lid wijzigen, en een lid archiveren of terugzetten — vanuit een
nieuwe "Leden"-tab binnen de bestaande `/beheer`-sessie. Dit is de tweede
helft van de "Leden admin screen (member CRUD)"-regel die
`docs/ARCHITECTURE.md` als nog-niet-gespecificeerd noteerde; de eerste helft
(`Assortiment` CRUD) is al gebouwd onder #14.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen als
volgt:**

- **"Geld beweegt alleen via RPC."** `members` staat al sinds `0001_init.sql`
  in de blanket-`REVOKE insert, update, delete ... from authenticated`
  (regel 137) — een directe tabel-write is dus vandaag al technisch
  onmogelijk, niet alleen ontmoedigd. Deze spec voegt drie nieuwe,
  beheerder-only RPC's toe (`create_member`, `update_member_name`,
  `set_member_archived`, zie RPC's) die elk hun eigen schrijfactie valideren
  en uitvoeren — geen client die een berekend resultaat aanlevert. Eén van
  de drie (`create_member`) zet wél direct een `balance_cents`-waarde bij het
  aanmaken (het optionele startsaldo) — dit is **geen** geldbeweging in de
  zin die `place_order`/`top_up` bedoelen (een transactie tegen een
  *bestaand* saldo, met een tegenpartij en een controle tegen de
  negatieflimiet): er bestaat nog geen rij, dus geen "beweging", alleen een
  initiële waarde op een nieuwe rij, zoals `products.price_cents` ook een
  waarde krijgt bij `create_product` zonder dat dat "geld beweegt" heet. De
  RPC-grens (server-side validatie, geen directe tabel-write) blijft
  onverkort gelden — zie RPC's voor de exacte validatie
  (`invalid_starting_balance`, altijd `>= 0`, nooit negatief: een lid begint
  nooit al in het rood).
- **"`served_by` komt uit de bezetting, niet uit een PIN."** Niet van
  toepassing — dit is geen bestelling/opwaardering tijdens een dienst, maar
  beheerder-only ledenbeheer buiten shift-context, exact zoals
  `create_product`/`update_product_price`/`set_product_archived` en
  `update_negative_limit` dat ook al zijn (ADR 0002's `auth.uid()`-actorcheck,
  geen `served_by`, geen PIN-per-actie).

## Betrokken shell

`shells/bar` alleen, binnen de bestaande `/beheer`-route (geen nieuwe
top-level route). Er is geen ledenbeheer-concept in `shells/portal` — een lid
ziet nooit een beheerscherm (CLAUDE.md → Domein: geen los adminscherm,
beheerder werkt binnen `shells/bar`).

**Nieuwe derde tab "Leden" in de bestaande `BeheerTabs.tsx`**
(`src/features/assortimentbeheer/`, ongewijzigd van locatie — dat bestand is
al de gedeelde beheer-chrome, niet iets specifiek voor assortiment; het
huisvest sinds #11 ook al `NegatieveLimietInstellingen`, zie
`docs/features/negatieve-saldolimiet.md` → Betrokken shell). Exacte
tabvolgorde (Assortiment/Leden/Instellingen of een andere volgorde) is aan de
Developer — geen architectuurkeuze, zelfde soort vrijheid als
assortimentbeheer.md liet voor pixel-precieze chrome. Zelfde
mount/unmount-per-tab-lifecycle als de bestaande twee tabs (geen
hidden-toggle) — elke wissel naar Leden krijgt zo een verse leeshook-lezing.

**Eigen featuremap, niet ondergebracht in `assortimentbeheer/`.** In
tegenstelling tot `NegatieveLimietInstellingen.tsx` (één instelling, geen
eigen datamodel/RPC-familie, vandaar wél in `assortimentbeheer/` geplaatst)
heeft ledenbeheer een eigen datamodel (`members`, al bestaand) en een eigen
RPC-familie (drie nieuwe RPC's, zie hieronder) — precies de situatie die
assortimentbeheer.md zelf al onderscheidde: *"eigen issue, eigen spec, eigen
featuremap"*. Nieuwe map `src/features/ledenbeheer/` (`LedenLijst.tsx`,
`NieuwLidOverlay.tsx`, `LidBeherenOverlay.tsx`), naast (niet in)
`assortimentbeheer/`. `BeheerTabs.tsx` importeert `LedenLijst` van daar — een
gewoon cross-feature-import, geen `check:arch`-overtreding (dat gate
verbiedt alleen shell-interne imports vanuit `features/`, niet
feature-naar-feature, zie `scripts/check-arch.mjs`).

## Datamodel

**Geen schemawijziging aan `members` zelf.** Alle kolommen die dit ticket
nodig heeft bestaan al: `name text not null`, `role member_role not null
default 'lid'`, `balance_cents integer not null default 0`, `archived
boolean not null default false` (`0001_init.sql`). `members` staat al sinds
diezelfde migratie in de blanket-REVOKE (regel 137) — **geen nieuwe REVOKE
nodig** in de nieuwe migratie hieronder, in tegenstelling tot #14's
`products`-REVOKE (`products` moest die zelf nog krijgen; `members` had 'm
al vanaf het begin). Vermeld hier expliciet zodat de Developer 'm niet
per ongeluk dubbel toevoegt.

**`role` wordt door dit ticket niet gewijzigd — zie Openstaande vraag voor
Bram, punt 2.** `create_member` zet altijd `role = 'lid'` (de kolomdefault,
niet apart als parameter doorgegeven — zie RPC's); er is geen RPC die een
bestaand lid promoveert naar `bardienst`/`beheerder` of terugzet naar `lid`.

## RPC's

Nieuwe migratie, opeenvolgend genummerd — `0006_negatieve_saldolimiet.sql`
is op dit moment de laatste op `main`, dus vermoedelijk
`0007_ledenbeheer.sql`; de Developer verifieert dat bij het bouwen nog klopt
(zelfde voorbehoud als assortimentbeheer.md maakte over zijn eigen
migratienummer). Alle drie volgen ADR 0002's `auth.uid()`-actorcheck-vorm,
1-op-1 gekopieerd van `create_product`/`update_product_price`/
`set_product_archived`/`update_negative_limit` — inclusief het
`select * into v_actor` post-implementatie-patroon (niet een kolom-subset,
zie ADR 0002 → "Post-implementatie fix" voor waarom dat verplicht is bij een
row-typed PL/pgSQL-variabele):

```sql
select * into v_actor
from members
where auth_user_id = auth.uid() and not archived;

if v_actor.id is null then
  raise exception 'actor_not_found' using errcode = 'P0001';
end if;
if v_actor.role <> 'beheerder' then
  raise exception 'no_admin_role' using errcode = 'P0001';
end if;
```

- **`create_member(p_name text, p_starting_balance_cents integer) returns
  members`** — nieuw. Na de actor-check: `p_name` (getrimd) niet leeg →
  anders `invalid_name`; `p_starting_balance_cents` mag `null` zijn (→ `0`,
  "geen startsaldo" is het normale geval) of een niet-negatief bedrag → een
  negatieve waarde geeft `invalid_starting_balance` (een lid begint nooit al
  in het rood — dat is wat de negatieflimiet-instelling regelt voor
  *bestellen*, niet voor aanmaken). Insert met `role = 'lid'` (kolomdefault,
  geen parameter — zie Datamodel/Openstaande vraag), `pin_hash = null`,
  `auth_user_id = null`, `archived = false`. Retourneert de nieuwe rij.
- **`update_member_name(p_member_id uuid, p_name text) returns members`** —
  nieuw. Na de actor-check: lid bestaat → anders `member_not_found` (geen eis
  dat het lid niet gearchiveerd is — een gearchiveerd lid blijft
  naam-bewerkbaar, zelfde redenering als `update_product_price` op een
  gearchiveerd product, zie Randgevallen); `p_name` (getrimd) niet leeg →
  anders `invalid_name`. Update alleen `members.name`.
- **`set_member_archived(p_member_id uuid, p_archived boolean) returns
  members`** — nieuw. Client stuurt de expliciete eindstaat (geen toggle,
  zelfde stijl als `set_product_archived`). Na de actor-check: lid bestaat →
  anders `member_not_found`. **Extra guard, nieuw t.o.v. het
  assortimentbeheer-precedent: een beheerder mag de eigen `members`-rij niet
  archiveren** (`p_member_id = v_actor.id` en `p_archived = true` →
  `self_archive_forbidden`) — zie Randgevallen voor waarom. Archiveren van
  een ándere beheerder blijft wél toegestaan, ook als dat de laatst
  overgebleven andere beheerder is (geen "laatste beheerder"-telling, zie
  Randgevallen voor de afweging). Idempotent voor het overige, zelfde
  verdraagzaamheid als `set_product_archived`.
- `grant execute on function create_member, update_member_name,
  set_member_archived to authenticated;` — zelfde grant-regel als de
  bestaande beheerder-only RPC's.
- Verder geen nieuwe RPC's. "Welke leden bestaan er, wat is hun rol/saldo/
  archiefstatus" is een platte `select` op `members` (bestaande
  `members_select`-policy, `authenticated` mag alles lezen, single-tenant) en
  hoort dus in `src/hooks/queries/`, niet in een RPC.

## Leeshook

**Eigen hook, geen uitbreiding van `useMembers()`.** Zelfde afweging als
assortimentbeheer's "Contract met #8's `useProducts()`": `useMembers()`
(`src/hooks/queries/useMembers.ts`) is gebouwd voor de verkoop-ledenzoeker —
alleen niet-gearchiveerde leden, geen `role`/`archived`-veld in het type.
Ledenbeheer heeft het tegenovergestelde nodig: elk lid, archived of niet
(anders is een gearchiveerd lid niet terug te vinden om terug te zetten), mét
`role` (voor het read-only rolbadge, zie Schermflow) en `archived`. Nieuwe
hook `useAlleLeden()` in `src/hooks/queries/useAlleLeden.ts`, eigen type
`LedenbeheerLid` (`id`, `name`, `role`, `balanceCents`, `archived`),
alfabetisch op naam — `useMembers()` blijft ongewijzigd, exact dezelfde
scheiding als `useAlleProducten()`/`useProducts()`.

## Schermflow

1. **Ledenlijst** (`LedenLijst.tsx`, Leden-tab): gesorteerd alfabetisch op
   naam (`useAlleLeden()`). Elke rij toont naam, een rolbadge (**BAR** voor
   `bardienst`, **BEHEER** voor `beheerder`, geen badge voor `lid` — read-only
   weergave, zie Openstaande vraag voor Bram punt 2 voor waarom er geen
   bewerkactie bij zit) en saldo — een gearchiveerd lid blijft in de lijst
   maar visueel gedempt (zelfde `text-muted`-patroon als
   `ProductenLijst.tsx`'s gearchiveerde rijen) en met een "GEARCHIVEERD"-label,
   niet weggefilterd.
   - **Zoeken**: tekstveld, filtert client-side op naam (zelfde soort
     eenvoudige `includes()`-filter als het ontwerp's `manageQuery`, geen
     server-side full-text-search nodig voor een single-tenant ledenlijst
     van deze schaal).
   - **Statusfilters** (chips, matcht het ontwerp regel 2499): **Actief**
     (default), **Saldo laag** (`balanceCents < lowBalanceThresholdCents`,
     bestaande `useAppSettings()`-waarde, CLAUDE.md's vaste €10-drempel — geen
     nieuwe instelling), **Archief**. Elke chip toont een telling. Geen
     "Alles"-chip nodig voor deze eerste bouw — het ontwerp's eigen
     `MEMBER_FILTERS` heeft er ook geen (alleen actief/laag/archief); een
     vierde "alles"-optie kan een latere, kleine toevoeging zijn, geen
     architectuurvraag.
   - **Geen resultaten** (zoekterm of filter levert niets op) → **"geen
     leden gevonden"** (letterlijk uit het ontwerp, regel 508).
2. **"+ nieuw lid"** (header-knop, zelfde opmaak/positie als
   `ProductenLijst.tsx`'s "+ nieuw product") → opent `NieuwLidOverlay.tsx`
   (`Overlay.tsx`, ongewijzigd hergebruikt). Titel **"Nieuw lid"**. Twee
   velden: naam (tekstveld, verplicht) en startsaldo (tekstveld, `€`-prefix,
   **optioneel** — placeholder "Startsaldo (optioneel)", letterlijk uit het
   ontwerp regel 1278). "Toevoegen" pas actief bij een niet-lege naam **en**
   (leeg veld **of** een geldig bedrag `>= €0,00` via `parseEuroToCents()`).
   Tik op "Toevoegen" → direct `create_member` (leeg startsaldo-veld stuurt
   `p_starting_balance_cents = null`, niet `0` als string — de RPC behandelt
   beide gelijk, zie RPC's). Succes → overlay sluit, lijst ververst
   (`useAlleLeden().refetch()`), toast **"[Naam] toegevoegd"** (zelfde
   toastvorm als assortimentbeheer). Mislukt → Nederlandse foutmelding via
   `role="alert"`, formulier blijft open met ingevulde gegevens.
3. **Tik op een lidrij** → opent `LidBeherenOverlay.tsx`, titel **"Lid
   beheren"**, twee onafhankelijke acties (matcht het ontwerp regel
   1193–1234, min "Barrechten" — zie Openstaande vraag voor Bram punt 2 —
   en min "saldocorrectie"/"saldo opwaarderen" — zie Expliciet buiten
   scope):
   - Bovenaan een **read-only saldokaart** (huidig `balanceCents`, zelfde
     `bg-rail`-kaartstijl als `ProductBeherenOverlay.tsx`'s "Huidige prijs" —
     hier puur informatief, geen bewerkactie in deze overlay).
   - **Naam wijzigen**: huidige naam vooringevuld, "Opslaan" pas actief bij
     een niet-lege, van de huidige naam afwijkende waarde. Tik op "Opslaan"
     → direct `update_member_name`. Succes-toast: **"Naam bijgewerkt"**
     (letterlijk uit het ontwerp, regel 1866).
   - **Archiveren / terugzetten** (tekst wisselt op basis van huidige
     `archived`-staat, zelfde patroon als producten): tik → direct
     `set_member_archived` met de expliciete tegenovergestelde boolean, geen
     bevestigingsstap (de sessie zelf is al de bevestiging, zie
     Rolzichtbaarheid). Succes-toast: **"[Naam] gearchiveerd"** /
     **"[Naam] teruggezet"** (letterlijk uit het ontwerp, regel 1851).
   - Beide acties delen dezelfde overlay-instantie maar zijn onafhankelijke
     schrijfacties — elk een eigen RPC-call, geen gecombineerde aanroep
     (zelfde vorm als `ProductBeherenOverlay.tsx`).
4. **Sluiten** (knop, Escape, backdrop-tik — `Overlay.tsx`'s bestaande
   a11y-eisen) → terug naar de ledenlijst, actuele staat (refetch bij elke
   succesvolle mutatie, niet pas bij sluiten).

## Rolzichtbaarheid

Zelfde model als assortimentbeheer/negatieve-saldolimiet: **alleen
bereikbaar met een actieve beheerder-sessie** op `/beheer`. Geen sessie →
alleen het inlogformulier; de Leden-tab is nooit zichtbaar voor een
niet-beheerder (`useBeheerSession()`'s `"denied"`-staat toont, zoals vandaag
al, het bestaande foutscherm vóór de tabbalk — geen enkele tab, dus ook Leden
niet). De drie nieuwe RPC's controleren `no_admin_role` daarnaast zelf,
zelfde verdediging-in-twee-lagen-redenering als
`docs/features/assortimentbeheer.md` → Rolzichtbaarheid.

De **ledenlijst zelf (lezen)**, eenmaal ingelogd op `/beheer`, gebruikt de
bestaande `members_select`-policy — die stond al open voor elke
`authenticated`-sessie (nodig voor o.a. `useMembers()`/`useBarStaff()`), dit
verandert niet. Dit is dus geen nieuwe leestoegang, alleen een nieuw scherm
dat een bredere projectie van dezelfde, al leesbare tabel toont.

## Randgevallen

- **`self_archive_forbidden` — een beheerder kan de eigen `members`-rij niet
  archiveren.** Nieuwe guard t.o.v. het assortimentbeheer-precedent (dat
  geen zelfreferentie-risico kende: een product is nooit de aanroeper).
  Archiveren zet `not archived` op false, en ADR 0002's actor-check filtert
  expliciet op `not archived` — een beheerder die zichzelf archiveert zou
  zichzelf bij de eerstvolgende RPC-aanroep (of een nieuwe login) buiten
  `/beheer` sluiten, zonder dat er nog een RPC-pad is om dat ongedaan te
  maken (`set_member_archived` zelf zou de aanroeper immers al als
  `actor_not_found` weigeren). Dat is teruggedraaid via Supabase
  Studio/CLI, geen gebouwde herstelroute in deze spec — vandaar dat
  blokkeren aan de bron de simpelste, veiligste keuze is. Nederlandse
  melding: "je kunt jezelf niet archiveren — vraag een andere beheerder".
  **Bewust niet uitgebreid naar "laatste beheerder blokkeren"**: dat vereist
  een telling over alle niet-gearchiveerde beheerders, een stateful check die
  nergens anders in deze RPC-familie voorkomt en die in de praktijk zelden
  relevant is (single-club, doorgaans meerdere beheerders) — geaccepteerd
  risico, zelfde soort afweging als issue #34's "geen tablet-trust-check".
- **Regressietest saldo-freeze is hier niet van toepassing** (in
  tegenstelling tot assortimentbeheer's prijs-freeze) — `update_member_name`/
  `set_member_archived` raken nooit `balance_cents`, en `create_member`
  schrijft een startsaldo alleen bij het aanmaken van een nieuwe rij (zie
  Doel). Geen bestaande `order_lines`/`top_ups`-historie kan hierdoor
  wijzigen.
- **Gearchiveerd lid, naam wijzigen**: toegestaan (zie RPC's) — een
  beheerder kan een typefout corrigeren zonder eerst te moeten
  de-archiveren.
- **Lid bestaat niet meer op het moment van opslaan** (race: gearchiveerd/
  aangepast door iemand anders tussen laden en opslaan) →
  `member_not_found` — Nederlandse foutmelding, overlay blijft open, lijst
  ververst zodat de rij verdwijnt/actualiseert. Zelfde patroon als
  `product_not_found`.
- **Archiveren van een `bardienst`/`beheerder`-lid dat op dit moment op een
  open dienst's bezetting staat** — `set_member_archived` raakt
  `shift_members`/`is_shift_member()` niet. Een al-op-de-bezetting-staand,
  inmiddels gearchiveerd lid blijft dus voor de rest van die dienst gewoon
  kiesbaar als `served_by` (`is_shift_member()` checkt roster-lidmaatschap,
  niet `members.archived`) — geaccepteerd, bestaand gedrag dat deze spec niet
  wijzigt: het zou een aanpassing aan `add_shift_member`/
  `remove_shift_member`/`is_shift_member` (#6/#7's RPC's) vereisen, buiten
  deze spec's scope. Nieuw toevoegen aan een bezetting kan niet meer via de
  bestaande staff-picker zodra een lid gearchiveerd is (`useBarStaff()`
  filtert al op `archived = false`) — alleen "al vóór het archiveren
  toegevoegd, blijft de rest van de dienst staan" is het randgeval.
- **Ingelogd, maar geen beheerder** (lid met eigen portal-account, rol
  `lid`/`bardienst`) → elke schrijfactie faalt met `no_admin_role`,
  Nederlandse boodschap via `role="alert"`, zelfde formulering-patroon als
  assortimentbeheer ("dit account kan leden niet beheren — vraag een
  beheerder").
- **Ingelogd account bestaat niet (meer) als `members`-rij, of is
  gearchiveerd** → `actor_not_found`, zelfde patroon als elders.
- **Startsaldo als negatief bedrag ingevoerd** → `invalid_starting_balance`
  (server-fallback; het invoerveld heeft geen `-`-toets-blokkade nodig,
  client-side guard via `parseEuroToCents()` en de "Toevoegen"-disabled-staat
  hoort dit al te voorkomen, zelfde niveau van client-guard als elders in
  deze codebase).
- **Dubbele/gelijktijdige wijziging** (twee tikken kort na elkaar, of twee
  beheerders die tegelijk hetzelfde lid bewerken) — expliciet buiten scope,
  zelfde afweging als issue #29 en assortimentbeheer/
  negatieve-saldolimiet's eigen gelijkluidende punt.
- **Lege ledenlijst** — kan in de praktijk niet voorkomen (er is altijd
  minstens het device-/seed-account), maar de UI crasht niet en toont
  dezelfde soort lege staat als producten ("Nog geen leden — voeg het eerste
  toe") voor consistentie.
- **Kan ledenlijst niet laden** (netwerkfout) → vaste Nederlandse
  foutmelding, zelfde patroon als `useMembers`/`useAlleProducten`, geen
  crash.
- **A11y**: `/beheer`'s ingelogde staat (tabbalk + tabbladen) staat, per
  `docs/features/negatieve-saldolimiet.md` → Randgevallen, nog niet volledig
  in `e2e/a11y.spec.ts`'s scenario-lijst — dit is dus geen regressie die
  ledenbeheer introduceert, maar een al bestaand openstaand punt. Tester
  breidt hetzelfde scenario uit met de Leden-tab en beide nieuwe overlays
  ("Nieuw lid"/"Lid beheren"), net zoals assortimentbeheer's eigen twee
  overlays dat nog moesten krijgen.

## Expliciet buiten scope

- **Rollen/rechten buiten Lid/Bardienst/Beheerder, rapportages,
  boekhouder-rol.** Het ontwerp (`designs/Bar App.dc.html`) kent ook
  `barmanager`/`boekhouder`, een rechten-wijzigen-select ("Barrechten") met
  vier opties, en een `Rapportages`-tab. `docs/ARCHITECTURE.md` → "Roles"
  legt al vast dat ABAS bewust bij het vereenvoudigde 3-rollenmodel blijft
  (`lid`/`bardienst`/`beheerder`) totdat een feature-verzoek dat expliciet
  heropent — dit ticket is dat verzoek niet. Geen `barmanager`/
  `boekhouder`-enum-waarde, geen rapportagescherm.
- **Rol wijzigen tussen Lid/Bardienst/Beheerder voor een bestaand lid** — zie
  Openstaande vraag voor Bram, punt 2. Niet stilzwijgend uitgesloten: dit is
  een expliciete open vraag, geen aanname.
- **Self-service uitnodigingsflow (`inviteUserByEmail`)** — dat is een apart
  ticket (`docs/ARCHITECTURE.md` → "Lid-accounts"). Zie ook Openstaande vraag
  voor Bram, punt 1, voor de aangrenzende vraag over een handmatige
  "invite (opnieuw) versturen"-knop.
- **Negatieve-saldolimiet-instelling** — al gebouwd
  (`docs/features/negatieve-saldolimiet.md`), hoort niet bij dit ticket.
- **Audit-log/`Logboek`-scherm** — niet-besloten scope
  (`docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog niet is
  besloten"). De RPC-actorcheck hierboven dient alleen om de schrijfactie te
  autoriseren, niet om een auditspoor vast te leggen — zelfde beperking als
  assortimentbeheer/negatieve-saldolimiet al vaststelden voor hun eigen
  RPC's.
- **Saldocorrectie (handmatig bij-/afboeken buiten een bestelling/
  opwaardering om)** — het ontwerp toont dit als losse actie
  ("saldocorrectie") naast "lid beheren", maar `docs/ARCHITECTURE.md` → "Wat
  het prototype deed maar hier nog niet is besloten" noemt "Balance
  corrections and order-reversal flows" expliciet als niet-besloten scope.
  Dit ticket voegt er dus geen schrijfpad voor toe — een lid's saldo
  verandert via dit scherm alleen bij het aanmaken (startsaldo).
- **"Saldo opwaarderen"-knop vanuit de ledenbeheer-overlay** — al gebouwd als
  eigen feature vanuit het verkoopscherm
  (`docs/features/opwaarderen.md`, #10); deze spec bouwt geen tweede
  ingang naar dezelfde `top_up`-RPC vanuit `/beheer`. Een beheerder die een
  lid wil opwaarderen doet dat, zoals vandaag, via het verkoopscherm.
- **"Recente activiteit" / transactiegeschiedenis per lid in de
  beheer-overlay** — CLAUDE.md → Domein wijst dit toe aan het lid zelf
  ("Lid — ziet eigen saldo en transacties"), via de portal (niet gebouwd,
  zie #15). Dit ticket bouwt geen aparte, tweede plek waar diezelfde
  geschiedenis leesbaar is vanuit `/beheer`.
- **Totaal-florerend-saldo-statistiek (het ontwerp's `memberFloatLabel`,
  som van alle actieve saldi)** — geen acceptatiecriterium hier, geen
  wireframe-precedent binnen de aangewezen scope-omschrijving van dit
  ticket. Kleine, latere toevoeging als er behoefte aan blijkt.
- **Een "Alles"-statusfilter naast Actief/Saldo laag/Archief** — het
  ontwerp's eigen `MEMBER_FILTERS` heeft er ook geen, zie Schermflow.
- **Race-conditie-bescherming bij gelijktijdige schrijfacties** — zie
  Randgevallen, zelfde afweging als elders in deze codebase (#29).
- **Cascaderende aanpassing van `shift_members`/`is_shift_member()` bij het
  archiveren van een lid dat op een actieve bezetting staat** — zie
  Randgevallen; zou #6/#7's RPC's raken, niet in deze spec.
- **"Laatste beheerder"-bescherming** (blokkeren dat de laatst overgebleven
  ándere beheerder gearchiveerd wordt) — zie Randgevallen, alleen
  zelf-archiveren wordt geblokkeerd.

## `useShell()`-contract

Geen nieuwe invulling. De overlay(s) hergebruiken `Overlay.tsx`'s bestaande
`useShell().overlay`-gedrag, ongewijzigd sinds #7/#14. `columns`/`density`
worden hier niet nieuw ingevuld — de ledenlijst is, net als de
productenlijst, een verticale lijst, geen grid.

## Openstaande vraag voor Bram

Twee punten die deze spec zelf niet kon beantwoorden — geen aanname, geen
placeholder, expliciet voorgelegd vóór de Developer bouwt (CLAUDE.md →
Werkstraat):

1. **Hoort een "invite (opnieuw) versturen"-knop bij dít ticket?**
   `docs/ARCHITECTURE.md` → "Lid-accounts" noemt: *"Een beheerder kan vanuit
   Ledenbeheer altijd handmatig een invite (opnieuw) laten versturen"* — maar
   het onderliggende mechanisme (`supabase.auth.admin.inviteUserByEmail()`,
   server-side) bestaat nog niet in de code; dat is de self-service-
   uitnodigingsflow onder een apart, nog niet opgepakt ticket
   (`docs/ARCHITECTURE.md` → "Lid-accounts"). Twee opties:
   - (a) De knop hoort bij dít ticket, maar staat non-functioneel/disabled
     tot het uitnodigingsticket landt (met een duidelijke tekst waarom, geen
     stille no-op).
   - (b) De knop is een latere iteratie, pas gebouwd zodra het
     uitnodigingsticket zelf al klaar is — dit ticket toont 'm helemaal niet.
   Deze spec kiest geen van beide: CLAUDE.md's eigen regel ("geen
   placeholder die later 'wel even' wordt ingevuld") wijst richting (b), maar
   dat is een aanname, geen vastgestelde keuze — Bram beslist.
2. **Hoort rol wijzigen (Lid ↔ Bardienst ↔ Beheerder) bij dít ticket?** Het
   ontwerp's "Lid beheren"-overlay bevat een "Barrechten"-select; deze spec
   sluit rolwijziging tussen de drie bestaande rollen bewust uit van de
   Schermflow (zie Datamodel/Expliciet buiten scope) omdat de door Bram
   aangeleverde scope-omschrijving voor dit ticket letterlijk noemt: "een
   ledenlijst, '+ nieuw lid' (naam + optioneel startsaldo), naam wijzigen,
   archiveren/terugzetten van een lid" — geen rolwijziging. Zonder een
   RPC hiervoor blijft de enige weg om een lid `bardienst`/`beheerder`-rechten
   te geven **handmatig via Supabase Studio/CLI**, hetzelfde patroon als
   vandaag al voor beheerder-Auth-accounts geldt
   (`docs/ARCHITECTURE.md` → "Provisioning voor #14"). Dat is een reëel gat:
   zonder een rolwijzigings-RPC kan een beheerder een nieuw bardienst-lid
   niet vanuit de app zelf bar-toegang geven. Vraag aan Bram: hoort een
   `set_member_role`-achtige RPC + UI-actie (Lid ↔ Bardienst ↔ Beheerder,
   geen `barmanager`/`boekhouder`) bij dít ticket, of blijft rolwijziging
   voorlopig bewust handmatig (Studio/CLI), met een apart, nog te formuleren
   ticket zodra dat gat in de praktijk knelt?
