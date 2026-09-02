# Ledenbeheer (member CRUD)

Spec voor [issue #13](https://github.com/BramLambertJansen/ABAS/issues/13).

**Gebouwd en gemerged** ([issue #13](https://github.com/BramLambertJansen/ABAS/issues/13),
[PR #55](https://github.com/BramLambertJansen/ABAS/pull/55), 2026-09-02,
merge-commit `8a3cb412`). De rest van dit document beschrijft wat er
daadwerkelijk op `main` staat.

**Spec-correctie (Docs, 2026-09-02):** onderstaande alinea beweerde bij het
schrijven van deze spec (2026-09-01) dat er "op het moment van schrijven
geen ticket" voor dit onderwerp bestond. Dat was onjuist — issue #13
("Ledenbeheer-scherm (CRUD, saldo inzien, archiveren)", Fase 2) stond al
sinds 2026-08-25 open, vóór deze spec geschreven werd; de Architect heeft er
bij het scopen niet naar gezocht. De rest van de alinea (waarom Bram dit als
volgende onderwerp koos, de placeholder-regel in `docs/ARCHITECTURE.md`)
klopt inhoudelijk nog steeds en staat ongewijzigd hieronder — alleen de
"geen ticket bestaat"-claim was fout.

**Acceptatiecriterium bewust niet meegenomen, vervolgticket
[#57](https://github.com/BramLambertJansen/ABAS/issues/57) (Docs,
2026-09-02, review-vondst PR #56, besloten door Bram):** issue #13's
criterium "een e-mailadres is optioneel, geen verplicht veld" doelde op een
e-mailveld bij het aanmaken van een lid zelf — dat veld bestaat hier niet
(`NieuwLidOverlay.tsx` heeft alleen naam + startsaldo). #13's eigen "Let
op"-sectie belegt bij #24 alléén het gedrag dát een ingevuld e-mailadres
triggert (de uitnodiging via `inviteUserByEmail`), niet het veld zelf —
deze spec had dat onderscheid niet gemaakt en verklaarde het criterium ten
onrechte "consistent" met wat gebouwd is. Bram heeft besloten: klein,
apart vervolgticket (#57) — geen heropening van dit ticket of #24. #57
bouwt alleen het veld + de `members.email`-kolom, expliciet zonder
`inviteUserByEmail`-uitnodigingsgedrag (dat blijft #24).

Bram heeft ledenbeheer als volgende onderwerp gekozen (zie
`docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog niet is
besloten": *"`Leden` admin screen (member CRUD) — implied necessary since
`beheerder` manages ledenbeheer per `CLAUDE.md`, but not yet specced."*).
Deze spec verving die placeholder-regel bij goedkeuring; de opmerking die
hier eerder stond ("de verwijzingen hieronder naar 'dit ticket' zijn
voorlopig zonder nummer") is achterhaald door de Spec-correctie hierboven —
elke verwijzing naar "dit ticket" in de rest van dit document betekent
gewoon #13.

Volgt hetzelfde beheer-sessiepatroon als
[#14](https://github.com/BramLambertJansen/ABAS/issues/14)
(`docs/features/assortimentbeheer.md`, ADR
[0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)/
[0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)) — lees
beide ADR's eerst, deze spec past ze toe en herhaalt de motivatie niet.

## Doel

Een beheerder kan, vanaf het gedeelde bar-tablet, leden aanmaken (naam +
optioneel startsaldo), een ledenlijst doorzoeken/filteren, de naam van een
bestaand lid wijzigen, de rol van een bestaand lid wijzigen (Lid ↔ Bardienst
↔ Beheerder — besloten door Bram, zie "Besloten door Bram"), en een lid
archiveren of terugzetten — vanuit een nieuwe "Leden"-tab binnen de
bestaande `/beheer`-sessie. Dit is de tweede
helft van de "Leden admin screen (member CRUD)"-regel die
`docs/ARCHITECTURE.md` als nog-niet-gespecificeerd noteerde; de eerste helft
(`Assortiment` CRUD) is al gebouwd onder #14.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen als
volgt:**

- **"Geld beweegt alleen via RPC."** `members` staat al sinds `0001_init.sql`
  in de blanket-`REVOKE insert, update, delete ... from authenticated`
  (regel 137) — een directe tabel-write is dus vandaag al technisch
  onmogelijk, niet alleen ontmoedigd. Deze spec voegt vier nieuwe,
  beheerder-only RPC's toe (`create_member`, `update_member_name`,
  `set_member_archived`, `set_member_role`, zie RPC's) die elk hun eigen
  schrijfactie valideren en uitvoeren — geen client die een berekend
  resultaat aanlevert. Eén van de vier (`create_member`) zet wél direct een
  `balance_cents`-waarde bij het
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
RPC-familie (vier nieuwe RPC's, zie hieronder) — precies de situatie die
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

**`role` wordt door dit ticket wél gewijzigd — besloten door Bram, zie
"Besloten door Bram" hieronder.** `create_member` zet nog steeds altijd
`role = 'lid'` bij het aanmaken (de kolomdefault, niet apart als parameter
doorgegeven — zie RPC's); een bestaand lid promoveren naar `bardienst`/
`beheerder`, degraderen, of tussen die drie rollen wisselen loopt via een
nieuwe RPC, `set_member_role` (zie RPC's) — geen directe `update` op
`members.role`, zelfde RPC-only-schrijfpatroon als de andere drie
kolom-wijzigingen in deze spec.

## RPC's

Nieuwe migratie: `supabase/migrations/0007_ledenbeheer.sql` (opeenvolgend
genummerd na `0006_negatieve_saldolimiet.sql`, bevestigd op `main`). Alle
vier volgen ADR 0002's `auth.uid()`-actorcheck-vorm,
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
  geen parameter — zie Datamodel), `pin_hash = null`,
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
- **`set_member_role(p_member_id uuid, p_role text) returns members`** —
  nieuw. Client stuurt de expliciete gewenste rol als tekst, niet als
  `member_role` — zelfde reden als `create_product`'s voorvalidatie op
  `p_price_cents` (zie assortimentbeheer.md → RPC's): een ongeldige waarde
  moet een nette Nederlandse boodschap opleveren, niet een rauwe
  Postgres-enum-castfout die de client niet kan mappen. Na de actor-check:
  lid bestaat → anders `member_not_found`; `p_role` (getrimd) is één van
  `'lid'`, `'bardienst'`, `'beheerder'` → anders `invalid_role` (de
  bestaande `member_role`-enum kent geen andere waarden, en dit ticket voegt
  er ook geen toe — zie Expliciet buiten scope; dit pad is bedoeld als
  server-fallback, de UI-select in Schermflow biedt zelf al alleen deze drie
  opties aan). **Extra guard, zelfde soort zelfreferentie-risico als
  `set_member_archived`'s `self_archive_forbidden`: een beheerder mag de
  eigen rol niet verlagen** (`p_member_id = v_actor.id` en `p_role <>
  'beheerder'` → `self_demote_forbidden`) — zie Randgevallen voor waarom.
  Een beheerder die zichzelf naar `'beheerder'` "wijzigt" (dezelfde rol
  opnieuw versturen) is geen degradatie en wordt niet geblokkeerd — dat valt
  samen met de idempotentie hieronder. Rolwijziging van een ándere
  beheerder naar `lid`/`bardienst` blijft wél toegestaan, ook als dat de
  laatst overgebleven andere beheerder is (geen "laatste beheerder"-telling
  — zie Randgevallen voor dezelfde afweging als bij `self_archive_forbidden`
  hierboven). Idempotent: `p_role` gelijk aan de huidige rol sturen slaagt
  gewoon (geen foutmelding, geen wijziging), zelfde verdraagzaamheid als
  `set_member_archived`/`set_product_archived`. Update alleen `members.role`
  — raakt nooit `pin_hash`, `balance_cents`, `archived` of
  `shift_members`/`is_shift_member()` (zie Randgevallen).
- `grant execute on function create_member, update_member_name,
  set_member_archived, set_member_role to authenticated;` — zelfde
  grant-regel als de bestaande beheerder-only RPC's.
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
`role` (voor het rolbadge in de lijst én het vooringevulde
"Barrechten"-veld in `LidBeherenOverlay.tsx`, zie Schermflow) en `archived`. Nieuwe
hook `useAlleLeden()` in `src/hooks/queries/useAlleLeden.ts`, eigen type
`LedenbeheerLid` (`id`, `name`, `role`, `balanceCents`, `archived`),
alfabetisch op naam — `useMembers()` blijft ongewijzigd, exact dezelfde
scheiding als `useAlleProducten()`/`useProducts()`.

## Schermflow

1. **Ledenlijst** (`LedenLijst.tsx`, Leden-tab): gesorteerd alfabetisch op
   naam (`useAlleLeden()`). Elke rij toont naam, een rolbadge (**BAR** voor
   `bardienst`, **BEHEER** voor `beheerder`, geen badge voor `lid` — de
   badge in de lijst zelf blijft read-only weergave; de bijbehorende
   bewerkactie ("Barrechten", zie punt 3 hieronder) zit in
   `LidBeherenOverlay.tsx`, niet in de lijstrij zelf, zelfde scheiding als
   naam/archiefstatus daar al hadden) en saldo — een gearchiveerd lid blijft
   in de lijst
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
   beheren"**, drie onafhankelijke acties (matcht het ontwerp regel
   1193–1234, min "saldocorrectie"/"saldo opwaarderen" — zie Expliciet
   buiten scope):
   - Bovenaan een **read-only saldokaart** (huidig `balanceCents`, zelfde
     `bg-rail`-kaartstijl als `ProductBeherenOverlay.tsx`'s "Huidige prijs" —
     hier puur informatief, geen bewerkactie in deze overlay).
   - **Naam wijzigen**: huidige naam vooringevuld, "Opslaan" pas actief bij
     een niet-lege, van de huidige naam afwijkende waarde. Tik op "Opslaan"
     → direct `update_member_name`. Succes-toast: **"Naam bijgewerkt"**
     (letterlijk uit het ontwerp, regel 1866).
   - **Barrechten** (matcht het ontwerp regel 1215–1222, letterlijke
     ondertekst "bardienst staat achter de bar, beheerder beheert de
     vereniging"): een select met de drie rolwaarden (**Lid**, **Bardienst**,
     **Beheerder**), vooringevuld op de huidige `role` van het lid.
     "Opslaan" pas actief bij een gekozen waarde die afwijkt van de huidige
     rol — zelfde "afwijkt van huidige waarde"-patroon als "Naam wijzigen"
     hierboven. Tik op "Opslaan" → direct `set_member_role` (geen
     bevestigingsstap, zelfde redenering als de andere twee acties in deze
     overlay). Succes-toast: **"Rechten bijgewerkt"**. Blokkeert de
     `self_demote_forbidden`-guard uit RPC's (een beheerder die de eigen rol
     probeert te verlagen) → Nederlandse foutmelding via `role="alert"`
     **binnen deze actie** ("je kunt je eigen rechten niet verlagen — vraag
     een andere beheerder"), de rest van de overlay (saldokaart, naam,
     archiveren) blijft bruikbaar — het formulier sluit niet, de select
     springt terug naar de huidige rol.
   - **Archiveren / terugzetten** (tekst wisselt op basis van huidige
     `archived`-staat, zelfde patroon als producten): tik → direct
     `set_member_archived` met de expliciete tegenovergestelde boolean, geen
     bevestigingsstap (de sessie zelf is al de bevestiging, zie
     Rolzichtbaarheid). Succes-toast: **"[Naam] gearchiveerd"** /
     **"[Naam] teruggezet"** (letterlijk uit het ontwerp, regel 1851).
   - Alle drie acties delen dezelfde overlay-instantie maar zijn
     onafhankelijke schrijfacties — elk een eigen RPC-call, geen
     gecombineerde aanroep (zelfde vorm als `ProductBeherenOverlay.tsx`).
4. **Sluiten** (knop, Escape, backdrop-tik — `Overlay.tsx`'s bestaande
   a11y-eisen) → terug naar de ledenlijst, actuele staat (refetch bij elke
   succesvolle mutatie, niet pas bij sluiten).

## Rolzichtbaarheid

Zelfde model als assortimentbeheer/negatieve-saldolimiet: **alleen
bereikbaar met een actieve beheerder-sessie** op `/beheer`. Geen sessie →
alleen het inlogformulier; de Leden-tab is nooit zichtbaar voor een
niet-beheerder (`useBeheerSession()`'s `"denied"`-staat toont, zoals vandaag
al, het bestaande foutscherm vóór de tabbalk — geen enkele tab, dus ook Leden
niet). De vier nieuwe RPC's controleren `no_admin_role` daarnaast zelf,
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
- **`self_demote_forbidden` — een beheerder kan de eigen rol niet verlagen.**
  Zelfde zelfreferentie-risico als `self_archive_forbidden` hierboven, en
  dezelfde afweging: een beheerder die zichzelf naar `lid`/`bardienst`
  degradeert zou zichzelf bij de eerstvolgende RPC-aanroep (of een nieuwe
  login op `/beheer`) als `no_admin_role` zien afgewezen, zonder dat er nog
  een RPC-pad is om dat ongedaan te maken (`set_member_role` zelf zou de
  aanroeper na de degradatie immers al op de rolcheck weigeren, niet meer op
  `actor_not_found` zoals bij zelf-archiveren, maar het effect — geen
  ingebouwd herstelpad binnen de RPC-familie zelf — is identiek). Ook dit is
  teruggedraaid via Supabase Studio/CLI, geen gebouwde herstelroute hier —
  vandaar blokkeren aan de bron. Nederlandse melding: "je kunt je eigen
  rechten niet verlagen — vraag een andere beheerder". Zichzelf opnieuw
  `beheerder` laten zijn (dezelfde rol) is geen degradatie en dus niet
  geblokkeerd — valt samen met de idempotentie die RPC's al beschrijft.
  **Zelfde "laatste beheerder"-afweging als bij `self_archive_forbidden`,
  bewust consistent toegepast**: een ándere beheerder degraderen blijft
  toegestaan, ook als dat de laatst overgebleven ándere beheerder is — een
  losstaande telling zou hier evenveel stateful overhead toevoegen als bij
  archiveren, voor hetzelfde zelden-relevante scenario (single-club,
  doorgaans meerdere beheerders); consistent geaccepteerd risico, geen apart
  besluit nodig voor deze RPC.
- **`invalid_role`** — `p_role` is geen `lid`/`bardienst`/`beheerder`. In de
  praktijk niet bereikbaar via de UI (de select in Schermflow biedt alleen
  deze drie waarden aan), dus dit is een server-fallback, zelfde soort
  verdediging als `invalid_starting_balance` hieronder.
- **Rolwijziging van een lid dat op dit moment op een open dienst's
  bezetting staat** — `set_member_role` raakt `shift_members`/
  `is_shift_member()` niet, zelfde redenering als de
  archiveer-op-actieve-bezetting-randgeval hieronder: `is_shift_member()`
  checkt alleen roster-lidmaatschap (`shift_members`), niet `members.role`.
  Een `bardienst`-lid dat halverwege een dienst gedegradeerd wordt naar
  `lid` blijft dus voor de rest van die dienst gewoon kiesbaar als
  `served_by` — geaccepteerd, bestaand gedrag dat deze spec niet wijzigt
  (zelfde reden als bij archiveren: zou #6/#7's RPC's raken, buiten scope).
  Nieuw toevoegen aan een bezetting kan niet meer via de bestaande
  staff-picker zodra een lid naar `lid` gedegradeerd is (`useBarStaff()`
  filtert al op `role in ('bardienst', 'beheerder')`) — alleen "al vóór de
  rolwijziging toegevoegd, blijft de rest van de dienst staan" is het
  randgeval.
- **Regressietest saldo-freeze is hier niet van toepassing** (in
  tegenstelling tot assortimentbeheer's prijs-freeze) — `update_member_name`/
  `set_member_archived`/`set_member_role` raken nooit `balance_cents`, en
  `create_member`
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
- **A11y**: `/beheer`'s ingelogde staat (tabbalk + tabbladen) stond, per
  `docs/features/negatieve-saldolimiet.md` → Randgevallen, nog niet volledig
  in `e2e/a11y.spec.ts`'s scenario-lijst — geen regressie die ledenbeheer
  introduceerde, maar een al bestaand openstaand punt. De Tester heeft dat
  scenario uitgebreid met drie nieuwe gevallen (`e2e/a11y.spec.ts`):
  de Leden-tab en beide nieuwe overlays ("Nieuw lid"/"Lid beheren"), net
  zoals assortimentbeheer's eigen twee overlays dat al eerder kregen.

## Expliciet buiten scope

- **Rollen/rechten buiten Lid/Bardienst/Beheerder, rapportages,
  boekhouder-rol.** Het ontwerp (`designs/Bar App.dc.html`) kent ook
  `barmanager`/`boekhouder` als rolwaarden — de "Barrechten"-select die dit
  ticket wél bouwt (zie Schermflow, besloten door Bram) heeft in het ontwerp
  vijf opties (`Geen`/`Barmedewerker`/`Barmanager`/`Beheerder`/`Boekhouder`);
  deze spec beperkt de select tot de drie bestaande `member_role`-waarden
  (`lid`/`bardienst`/`beheerder`), en bouwt ook geen `Rapportages`-tab.
  `docs/ARCHITECTURE.md` → "Roles" legt al vast dat ABAS bewust bij het
  vereenvoudigde 3-rollenmodel blijft totdat een feature-verzoek dat
  expliciet heropent — Bram's akkoord op dit ticket is dat verzoek niet.
  Geen `barmanager`/`boekhouder`-enum-waarde, geen rapportagescherm.
- **Self-service uitnodigingsflow (`inviteUserByEmail`)** — dat is een apart
  ticket (`docs/ARCHITECTURE.md` → "Lid-accounts"). Zie ook "Besloten door
  Bram" hieronder voor de aangrenzende vraag over een handmatige
  "invite (opnieuw) versturen"-knop, die net als deze flow buiten dit ticket
  blijft.
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
  archiveren of degraderen van een lid dat op een actieve bezetting staat**
  — zie Randgevallen (beide gevallen); zou #6/#7's RPC's raken, niet in deze
  spec.
- **"Laatste beheerder"-bescherming** (blokkeren dat de laatst overgebleven
  ándere beheerder gearchiveerd of gedegradeerd wordt) — zie Randgevallen,
  bij beide RPC's (`set_member_archived`/`set_member_role`) wordt alleen
  zelf-archiveren/zelf-degraderen geblokkeerd, niet een actie tegen een
  ándere beheerder.

## `useShell()`-contract

Geen nieuwe invulling. De overlay(s) hergebruiken `Overlay.tsx`'s bestaande
`useShell().overlay`-gedrag, ongewijzigd sinds #7/#14. `columns`/`density`
worden hier niet nieuw ingevuld — de ledenlijst is, net als de
productenlijst, een verticale lijst, geen grid.

## Besloten door Bram

Deze spec legde twee punten voor vóór de Developer bouwt (CLAUDE.md →
Werkstraat) — geen aanname, geen placeholder. Bram heeft beide beantwoord;
de rest van deze spec is al bijgewerkt om die antwoorden toe te passen, dit
is de vindplaats van de beslissing zelf.

1. **Een "invite (opnieuw) versturen"-knop: nee, niet in dit ticket.** Blijft
   bij het aparte, nog niet opgepakte uitnodigingsticket
   (`docs/ARCHITECTURE.md` → "Lid-accounts", issue #24) zodra dat zelf
   `inviteUserByEmail` bouwt — dit ticket toont geen (disabled of anderszins
   niet-functionele) knop ervoor. Dat spoort met CLAUDE.md's eigen regel
   ("geen placeholder die later 'wel even' wordt ingevuld"), optie (b) uit de
   oorspronkelijke vraag. Zie Expliciet buiten scope.
2. **Rolwijziging (Lid ↔ Bardienst ↔ Beheerder): ja, hoort bij dit ticket.**
   Een nieuwe `set_member_role`-RPC + UI-actie ("Barrechten", in
   `LidBeherenOverlay.tsx`) — geen `barmanager`/`boekhouder`, die blijven
   buiten het bestaande 3-rollenmodel (`docs/ARCHITECTURE.md` → "Roles"). Dit
   is verwerkt in Datamodel, RPC's, Schermflow, Randgevallen en Expliciet
   buiten scope hierboven/hieronder — inclusief de nieuwe
   `self_demote_forbidden`-guard (zelfde zelfreferentie-redenering als
   `self_archive_forbidden`) en dezelfde bewuste "geen laatste-beheerder-
   telling"-afweging als bij archiveren.
