# 0002 — Beheeracties gebeuren in een eigen e-mail-sessie, niet via de gedeelde tablet-sessie

Status: geaccepteerd (Bram, vastgesteld). **Aangevuld door
[ADR 0003](0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)** — het
mechanisme hieronder (eigen e-mail-sessie, vervangt de gedeelde
device-sessie, `auth.uid()`-check in de RPC) blijft ongewijzigd geldend;
ADR 0003 verbreedt alleen de *reden*: e-mail-login is geen beheer-specifiek
mechanisme maar één van twee methodes die een lid zelf kiest (PIN of
e-mail/wachtwoord), hier toegepast op het geval waarin het gekozen doel
"beheer" is. Lees ADR 0003 voor die bredere context; dit document blijft de
geldende beschrijving van het sessie-mechanisme zelf. Het overgebleven
scope-vraagstuk dat hieronder nog als open stond
("Genuine open vraag — niet hier beslist") is inmiddels beslist — zie ADR
0003 → scope-splitsing en `docs/features/assortimentbeheer.md`.
**Vervangt [ADR 0001](0001-beheerder-only-writes-require-actor-pin-per-rpc.md)**
— dat ADR blijft leesbaar als de eerdere afweging, maar het patroon
("`p_actor_member_id`/`p_actor_pin` per RPC-call") is niet meer het geldende
mechanisme voor beheerder-only writes.

## Context

ADR 0001 loste "hoe verifieer je dat de aanroeper een beheerder is, zonder
per-operator sessie" op binnen de aanname dat er sowieso geen per-operator
sessie zou komen — elke beheerder-only RPC nam een PIN als parameter en
verifieerde die opnieuw, per aanroep, tegen de gedeelde tablet-sessie.

Bram heeft die aanname zelf gecorrigeerd: een beheerder-identiteit is niet
gedeeld. De bar-sessie (het gedeelde tablet, PIN om een dienst te starten,
bezetting samenstellen) blijft gedeeld — dat verandert niet, en `start_shift`/
`add_shift_member`/`remove_shift_member`/`place_order`/`top_up` blijven exact
zoals ze zijn (zie Gevolgen). Maar beheeracties (assortiment nu, ledenbeheer
later) horen in een **eigen, losse sessie** die een specifiek lid
identificeert — niet in een PIN die tegen de gedeelde sessie wordt
gecontroleerd.

Hóe die sessie tot stand komt is door Bram expliciet gekozen, geen open vraag:
**e-mail — magic link of wachtwoord, hetzelfde mechanisme als de
portal-login** (CLAUDE.md → Auth noemt dit al voor `shells/portal`). Een
beheerder krijgt dus een eigen Supabase Auth-account, gekoppeld aan het eigen
`members`-record — precies het `members.auth_user_id`-veld dat
`docs/ARCHITECTURE.md` → "Lid-accounts (settled, 2026-08-25)" al beschrijft
voor leden met een portal-account, hier toegepast op een beheerder.

## Beslissing

**Eén browser-sessie per keer, niet twee gelijktijdig.** De huidige
sessie-opslag (`@supabase/ssr`, cookie-based, zie
`docs/ARCHITECTURE.md` → "Device sign-in mechanism") houdt precies één
actieve Supabase Auth-sessie per browser bij. Een beheerder-sessie kan dus
niet *naast* de gedeelde device-sessie bestaan in dezelfde tablet-browser —
hij *vervangt* 'm, tijdelijk:

1. Een beheerder opent een nieuwe, eigen inlogroute binnen `shells/bar`
   (werktitel `/beheer/inloggen` — exacte route/navigatie-ingang is aan de
   Developer/spec, niet aan dit ADR) en logt in met het eigen e-mailadres
   (magic link of wachtwoord). Dit **vervangt** de gedeelde device-sessie in
   de cookie van die browser — de tablet is voor de duur van dat inloggen
   "ingelogd als [naam]", niet meer "ingelogd als het apparaat".
2. Zolang die sessie actief is, identificeert `auth.uid()` een specifiek lid
   (via `members.auth_user_id`). Beheerder-only RPC's verifiëren de
   aanroeper via die identiteit, niet via een PIN-parameter (zie hieronder).
3. Een expliciete "uitloggen"/"terug naar bardienst"-actie
   (`supabase.auth.signOut()`) sluit die sessie weer af. De eerstvolgende
   bar-shell-request zonder sessie triggert `src/middleware.ts`'s bestaande
   device-inlogstap opnieuw (`if (!session)`, ongewijzigd) — de tablet is dan
   weer "het apparaat", geen aparte stap nodig om dat te herstellen.

**Gewone bardienst-acties blijven functioneren tijdens een actieve
beheerder-sessie.** `start_shift`/`add_shift_member`/`remove_shift_member`/
`place_order`/`top_up` zijn nooit afhankelijk van *welke* `authenticated`-
identiteit de aanroep doet — ze verifiëren zelf een PIN-parameter
(bardienst/beheerder-attributie) resp. de actieve bezetting (`served_by`).
Een beheerder die op de eigen sessie een rondje voor iemand anders aanslaat
werkt dus gewoon door; dat is geen regressie, alleen niet het scenario waar
dit ADR over gaat.

**Beheerder-only RPC's verifiëren `auth.uid()`, niet meer een PIN-parameter.**
`create_product`/`update_product_price`/`set_product_archived` (en elke
toekomstige beheerder-only schrijf-RPC) doen, binnen dezelfde
`SECURITY DEFINER`-functie:

1. `select id, role into v_actor from members where auth_user_id = auth.uid()
   and not archived` → geen rij: `actor_not_found`.
2. `v_actor.role = 'beheerder'` → anders `no_admin_role`.

Geen PIN-parameter meer: Supabase Auth heeft de identiteit al geverifieerd op
het moment van inloggen (stap 1 hierboven); een RPC die daarna nóg een PIN
zou vragen zou een sessie die net echt geauthenticeerd is opnieuw wantrouwen
zonder reden. Dit is dezelfde soort redenering als waarom `start_shift` wél
een PIN vraagt: daar bestond nog geen sessie die de aanroeper identificeerde.
Hier bestaat die sessie nu wel, dus is de PIN overbodig geworden — niet
"vervangen door een zwakkere check", maar door een sterkere die niet meer
door de client te vervalsen is (`auth.uid()` komt uit een door Supabase
geverifieerd JWT, geen client-parameter).

## Verworpen alternatief: twee gelijktijdige sessies in één browser

Technisch is een tweede, gelijktijdige sessie (naast de device-sessie) te
bouwen — een los `localStorage`-key/eigen `SupabaseClient`-instantie met een
eigen `storageKey` voor de beheerder-sessie, los van de cookie die
`src/middleware.ts` beheert. Verworpen voor nu: dat is een substantieel
nieuw sessie-mechanisme (twee actieve Supabase-clients per browser, met eigen
verval/ververs-logica) voor een voordeel dat niemand vroeg — Bram's
formulering was "een eigen, losse sessie", niet "tegelijk met de gedeelde
sessie zichtbaar". Vervang-dan-herstel (hierboven) is het eenvoudigste
mechanisme dat aan de eis voldoet; heroverwegen als in de praktijk blijkt dat
bardienst-werk en beheerwerk op hetzelfde tablet vaak door elkaar lopen
(tegelijk nodig, niet na elkaar).

## Eerder genoteerde open vraag — inmiddels beslist (zie ADR 0003)

Dit ADR legde het mechanisme vast, niet de bouwvolgorde. `members.auth_user_id`
bestaat nog niet in `0001_init.sql`/latere migraties — het was tot nu toe
alleen een plan in `docs/ARCHITECTURE.md` → "Lid-accounts", gekoppeld aan
issue #24, en de bijbehorende e-mail-inlogflow zelf (magic
link/wachtwoord-formulier, callback-route) is issue #15, ook nog niet
gebouwd. Of Assortimentbeheer (#14) nu zelf een minimale versie van die
koppeling + inlogflow bouwt, of wacht tot #15/#24 landen, stond hier open —
**beslist: #14 bouwt het zelf, minimaal** (zie
[ADR 0003](0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md) →
scope-splitsing en `docs/features/assortimentbeheer.md`), niet de volledige
portal-inlogflow van #15 en niet de self-service-uitnodigingsflow van #24.

## Gevolgen

- **ADR 0001 is vervangen**, niet verwijderd — de afweging daarin (waarom
  niet client-side cachen, waarom niet een tijdgebonden "beheermodus") blijft
  relevant lees-materiaal voor waarom een PIN-per-actie destijds de keuze
  was, ook al is het niet meer het patroon.
- `docs/features/assortimentbeheer.md` is bijgewerkt: geen
  `StaffPicker`/`PinPad`-hergebruik meer voor actor-verificatie, nieuwe
  navigatie-ingang (niet langer een knop op `DienstActief`).
- `docs/ARCHITECTURE.md` → "Shared bar-tablet session mechanism" en
  "Lid-accounts" zijn uitgebreid met dit mechanisme; CLAUDE.md → Auth is
  bijgewerkt zodat het niet meer suggereert dat beheeracties op de gedeelde
  tablet-sessie draaien.
- Lost issue #22 ("Alternatieve inlogmethoden bar-shell naast PIN")
  **gedeeltelijk** op: er komt een echte e-mail-login op `shells/bar`, maar
  alleen voor beheeracties — #22 gaat letterlijk over de bar-shell zelf
  (de PIN-flow uit #6), die dit ADR niet aanraakt. **Zie ADR 0003** voor de
  correctie: #22's volledige scope wordt pas gedekt door het daar
  aangekondigde nieuwe issue.
- Maakt #14 (Assortimentbeheer, en later ledenbeheer) inhoudelijk afhankelijk
  van #24 (`members.auth_user_id`) en #15 (e-mail-inlogmechanisme) — tenzij
  Bram kiest voor de "bouw het minimaal binnen #14"-route, zie hierboven.
