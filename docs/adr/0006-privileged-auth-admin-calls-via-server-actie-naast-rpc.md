# 0006 — Privileged Supabase Auth Admin-calls lopen via een server-side actie met een eigen service-role-bestand, niet via een SQL-RPC

Status: **geïmplementeerd** (issue #24, commits `699480a`/`f00540b`,
2026-09-21 — `src/lib/supabase/admin.ts`, `src/lib/inviteMember.ts`,
`src/app/(bar)/beheer/invite/route.ts`, migratie
`0012_lid_account_uitnodigen.sql`, zie
`docs/features/lid-account-invite.md`). Oorspronkelijk geaccepteerd (Bram,
2026-09-21, samen met `docs/features/lid-account-invite.md`). Bram's
antwoorden op de spec (rolreikwijdte beperkt tot `bardienst`/`beheerder`,
uitsluitend een handmatige trigger, geen automatische invite bij opslaan)
raakten de scope van de feature, niet het patroon dat dit ADR vastlegt — het
patroon hieronder bleef ongewijzigd van kracht tot en met de bouw. Vult ADR
0002 en ADR 0004 aan, geen van beide vervangen. **Aangevuld (2026-09-21,
geautomatiseerde PR #62-review, Bug 1-fix)** — zie "Aanvulling" hieronder
voor een nieuw actor-identificatie-sub-patroon (`link_invited_member_
account`, geen admin-call); het kernpatroon van dit ADR (service-role-call
via een eigen server-only entrypoint, database-schrijvingen terug via een
gewone RPC met de sessie-gebonden client) blijft ongewijzigd.
**Aangevuld door
[ADR 0016](0016-dienst-hoort-bij-geregistreerde-app-sessies.md) (Beslissing 6,
gemerged in PR #120, 2026-10-01):** de login vanaf de namenlijst
(`src/lib/barLogin.ts`) is een tweede server-only gebruiker van de
service-role-client, voor een aanroeper die nog géén sessie heeft. De
databasekant loopt daar via functies die alleen `service_role` mag uitvoeren
(`verify_bar_pin`, `bar_login_options`, `record_bar_password_login`,
`register_bar_session_server`, `login_throttle_reserve`/`_release`). Het
kernpatroon van dit ADR verandert niet.

## Context

Twee bestaande patronen regelen alles wat dit ADR *niet* over gaat:

- **"Geld beweegt alleen via RPC"** (CLAUDE.md → Architectuurbeslissingen):
  een `SECURITY DEFINER`-SQL-functie berekent, valideert en schrijft in één
  statement. `authenticated` heeft geen directe tabeltoegang (blanket
  `REVOKE`).
- **ADR 0004 — PII-kolommen alleen via RPC-gated lezen**: dezelfde vorm,
  toegepast op een leesrecht: een kolom wordt column-level `REVOKE`d en
  alleen een `SECURITY DEFINER`-RPC met een ADR-0002-actorcheck geeft 'm nog
  terug.

Beide patronen delen één eigenschap: de bevoegdheid zit **in de database**
(een Postgres-functie/-grant), en de actorcheck gebruikt `auth.uid()` — de
identiteit die Supabase Auth al aan de sessie hing.

Issue #24 introduceert een derde soort bevoegde actie die geen van beide
patronen kan uitvoeren: **`supabase.auth.admin.inviteUserByEmail()`** (en
elke andere `auth.admin.*`-call) is geen SQL — het is een aanroep naar
Supabase's eigen Auth-API, die alleen werkt met de **service-role/secret
key** (`SUPABASE_SECRET_KEY`, al gereserveerd maar ongebruikt in
`.env.example`), nooit vanuit PL/pgSQL bereikbaar en nooit vanuit een
publishable-key-client. Twee gevolgen die de bestaande twee patronen niet
dekken:

1. Er bestaat geen `SECURITY DEFINER`-functie die dit kan uitvoeren — een
   RPC kan de database-kant van dit ticket doen (een kolom schrijven), maar
   nooit de e-mail versturen of het `auth.users`-record aanmaken. De
   uitvoering moet in applicatiecode, niet in SQL.
2. Een service-role-client **omzeilt RLS volledig** — dat is precies waarom
   hij bestaat (`auth.admin.*` werkt per definitie buiten een gebruikers-
   sessie om), maar het betekent ook dat geen enkele `REVOKE`/policy die
   verder aan alles in deze codebase bescherming geeft, hier van toepassing
   is. Een service-role-client die per ongeluk client-side terechtkomt is
   een volledige RLS-bypass voor de hele database, niet alleen voor
   `members`.

## Beslissing

**Een derde, eigen bestand in `src/lib/supabase/` voor de service-role-
client — geen uitbreiding van `client.ts`/`server.ts`.**
`src/lib/supabase/admin.ts` is het enige bestand dat
`SUPABASE_SECRET_KEY` leest en een Supabase-client met die sleutel
aanmaakt. Dit blijft binnen de bestaande `check:arch`-regel zonder dat het
script hoeft te wijzigen: die regel staat elk bestand onder
`src/lib/supabase/` al toe de SDK te importeren (het scant op
mapprefix, niet op een vaste lijst van twee bestandsnamen) — alleen de
proza in `docs/ARCHITECTURE.md` → "Lid-accounts" ("alleen die twee
bestanden") moet bijgewerkt worden zodra dit bestand er is, zie Gevolgen.
`admin.ts` mag **nooit** in de clientgraaf terechtkomen. Sinds
[ADR 0021](0021-server-only-markering-is-de-grens-client-server.md) dwingt
`import "server-only"` dit af tijdens de Next.js-build; `check:arch` volgt
ook indirecte imports en bewaakt dat alleen `admin.ts` de secret leest.


**De uitvoering (de daadwerkelijke `inviteUserByEmail`-aanroep, plus alles
eromheen) is een server-only entrypoint — Server Action of Route Handler,
de keuze is aan de Developer — nooit een client-side aanroep.** Deze
entrypoint:

1. **Verifieert de aanroeper zelf, onafhankelijk van elke eerdere RPC-call
   in dezelfde request-flow.** Dezelfde ADR-0002-vorm (`auth.uid()` →
   `members`-rij → `role = 'beheerder'`), maar hier uitgevoerd als een
   gewone, RLS-onderworpen lezing via de sessie-gebonden client
   (`src/lib/supabase/server.ts`) — **niet** via de service-role-client. Dit
   is geen herhaling voor de vorm: zodra de rest van de actie de service-
   role-client gebruikt (die RLS volledig omzeilt), is een sessie-gebonden
   herverificatie de enige laag die nog daadwerkelijk "is deze aanroeper een
   beheerder" afdwingt voor déze specifieke actie.
2. Gebruikt de service-role-client (`admin.ts`) uitsluitend voor de
   `auth.admin.*`-aanroep zelf, met de kleinst mogelijke reikwijdte — geen
   generieke "doe alsof je service-role bent voor de rest van deze
   request"-gewoonte.
3. Elke database-schrijving die uit de uitkomst volgt (bv. `members.
   auth_user_id` koppelen na een geslaagde `inviteUserByEmail`) gaat **terug
   via een gewone `SECURITY DEFINER`-RPC, aangeroepen met de sessie-gebonden
   client, niet de service-role-client.** Reden: `auth.uid()` binnen die RPC
   moet de daadwerkelijke beheerder-sessie zijn om de ADR-0002-actorcheck te
   laten werken — een RPC-aanroep via de service-role-client heeft geen
   sessie, dus geen `auth.uid()`, en zou de actorcheck altijd laten falen
   (`actor_not_found`) in plaats van 'm zinloos te laten slagen. Dit is dus
   geen stijlkeuze maar een technisch gevolg van hoe `auth.uid()` werkt.
4. Alle `supabase.from()/.rpc()`-aanroepen binnen deze actie leven, exact
   als vandaag, onder `src/lib/` (`check:policy`'s bestaande
   `ALLOWED_QUERY_DIRS`) — een Route Handler onder `src/app/` mag zelf geen
   rechtstreekse `.from()/.rpc()`-aanroep bevatten, de daadwerkelijke calls
   moeten in een `src/lib/`-module zitten die de route/actie aanroept.

**Reikwijdte van dit patroon.** Dit ADR beslist het patroon voor élke
toekomstige actie die een Supabase Auth Admin-call nodig heeft (bv. een
account intrekken, een e-mailadres op het `auth.users`-niveau wijzigen) —
niet alleen voor `inviteUserByEmail`. Een volgende feature die zoiets nodig
heeft, hoeft dit ADR niet opnieuw te schrijven, alleen dit patroon toe te
passen.

**Uitgebreid naar Supabase Storage (2026-10-02).**
[ADR 0018](0018-bestandsopslag-alleen-server-side-schrijven.md) past
hetzelfde patroon toe op schrijfacties in Storage: een server-only
entrypoint, verificatie met de sessie-gebonden client, de service-role-client
alleen voor het uploaden of verwijderen van het object, en de verwijzing in
de database terug via een gewone RPC. ADR 0018 voegt daar regels aan toe die
hier niet staan: geen schrijfpolicies op `storage.objects`, en wanneer een
bucket publiek mag zijn. Eerste toepassing:
`docs/features/productafbeeldingen.md`.

## Verworpen alternatieven

- **De service-role-key ook laten lezen door `server.ts`** (geen apart
  `admin.ts`-bestand): verworpen — `server.ts` wordt vandaag overal
  aangeroepen waar een gewone, sessie-gebonden, RLS-onderworpen client nodig
  is (elke Server Component, `/beheer/callback`, straks deze actie's eigen
  actorcheck-stap). Eén functie die soms de publishable key en soms de
  secret key gebruikt (op basis van een parameter) is een makkelijke plek
  voor een toekomstige fout ("ik dacht dat dit de gewone client was"). Een
  apart bestand met een evident andere naam (`admin.ts`) maakt "dit bestand
  omzeilt RLS" een leesbare eigenschap van de import zelf, niet van een
  argument.
- **Een SQL `SECURITY DEFINER`-RPC die zelf een `http`/`pg_net`-extensie
  gebruikt om de Auth Admin-API vanuit Postgres aan te roepen**: technisch
  mogelijk (Supabase ondersteunt `pg_net`), maar verworpen — dit zou een
  compleet nieuw soort afhankelijkheid (uitgaande HTTP vanuit de database)
  introduceren voor precies één use case, terwijl Next.js al een server-
  laag heeft die dit zonder extra Postgres-extensie kan. Geen bestaand
  precedent in deze codebase gebruikt `pg_net`; dit zou het eerste zijn
  zonder dat er een reden is die "gewoon server-side in de Next.js-laag"
  niet ook oplost.
- **Service-role-client ook laten schrijven naar `members` (stap 3
  overslaan)**: verworpen, zie Beslissing punt 3 — technisch werkt het
  (service-role omzeilt RLS toch al), maar het zou de ADR-0002-actorcheck-
  laag voor deze ene schrijfactie stilletjes buiten werking stellen, met
  precies het soort "werkt toevallig, maar de bedoelde beveiligingslaag doet
  niets" dat ADR 0002's eigen "Post-implementatie fix"-sectie al eerder
  beschreef voor een andere fout.

## Aanvulling (2026-09-21) — zelfbediening-koppeling op basis van e-mail, geen admin-call

> **Matchregel vervangen door [ADR 0020](0020-koppelen-eist-bewijs-van-mailbezit.md)
> (2026-10-05):** matchen op `auth.email()` is geen bewijs van mailbezit.
> Koppelen eist nu een `amr`-methode uit de mailbox, binding aan het
> invite-auth-user-id, een bevestigd adres en een niet-gearchiveerd lid;
> bij het koppelen worden wachtwoord, MFA-factoren en andere sessies
> gewist. "Geen foutcodes, stille no-op bij 0 of meer dan 1
> match" hieronder blijft staan.

Gevonden bij een herziening van `docs/features/lid-account-invite.md` naar
aanleiding van een geautomatiseerde PR-review (Bug 1, P1): de oorspronkelijke
`mark_member_invited(p_member_id, p_auth_user_id)` zette `auth_user_id` al
bij het *versturen* van een invite (`inviteUserByEmail()` maakt de
`auth.users`-rij meteen aan), niet bij het daadwerkelijk *aanklikken* ervan
door het lid — waardoor de door de spec zelf beschreven tussenstaat
("uitgenodigd, nog geen account") nooit bereikbaar was. De fix splitst die
ene RPC in twee: `mark_member_invite_sent` (ongewijzigd patroon, beheerder
als actor) en een nieuwe `link_invited_member_account` (aangeroepen door
`/beheer/callback` met de sessie van **het lid zelf**, ná
`exchangeCodeForSession()`).

**Deze aanvulling gaat niet over het kernonderwerp van dit ADR.**
`link_invited_member_account` is een gewone `SECURITY DEFINER`-RPC,
aangeroepen met de sessie-gebonden client — geen service-role-call, geen
`admin.ts` betrokken. Reden om 'm toch hier te documenteren, niet in een
nieuw ADR-nummer: hij is onlosmakelijk onderdeel van dezelfde RPC-splitsing
die dit ADR al beschrijft (Beslissing punt 3: "elke database-schrijving die
uit de uitkomst volgt gaat terug via een gewone RPC, aangeroepen met de
sessie-gebonden client"), en verdient geen eigen ADR voor precies één RPC
binnen één feature.

**Wat wél nieuw is: het actorcheck-patroon zelf.** Elke bestaande `SECURITY
DEFINER`-RPC in deze codebase (ADR 0002) identificeert de aanroeper via
`auth.uid()` → een **al bestaande** `members`-rij met dat `auth_user_id`.
`link_invited_member_account` kan dat per definitie niet: op het moment van
aanroepen bestaat die koppeling nog niet — dat is precies wat de RPC gaat
leggen. In plaats daarvan identificeert de RPC de aanroeper via het
e-mailadres van de sessie (`auth.email()`, Supabase's ingebouwde
GUC-gebaseerde tegenhanger van `auth.uid()`, zelfde onderliggende mechanisme
— geen nieuwe infrastructuur), gematcht tegen `members.email`, met
`auth_user_id is null` en `invited_at is not null` als guards. Zie
`docs/features/lid-account-invite.md` → RPC's punt 2 voor de volledige
implementatie en de guards tegen e-mailcollisions/dubbele matches.

**Karakter van deze RPC wijkt ook af op een tweede punt: geen rolcheck, geen
foutcodes.** Dit is niet een beheerder die over een ander lid beslist — het
is een lid dat zijn eigen, net-geaccepteerde uitnodiging afrondt. Er is dus
geen `no_admin_role`-concept. En omdat deze RPC op *elke* geslaagde
`/beheer/callback`-aanroep draait (ook gewone her-logins van een al
gekoppeld lid, ADR 0002/0003), moet elke onzekere of mislukte match een
stille no-op zijn (`return null`), nooit een `raise exception` — een fout
hier zou de bestaande, ongerelateerde login-flow breken.

**Reikwijdte van deze aanvulling.** Net als het kernpatroon hierboven is dit
generiek bruikbaar: elke toekomstige feature die een self-service
"eerste-koppeling-op-basis-van-e-mail"-stap nodig heeft (de meest
waarschijnlijke kandidaat: issue #15's portal-invite-acceptatie, dezelfde
vorm als hier maar voor `lid`-rol members) kan dit sub-patroon citeren in
plaats van de afweging opnieuw te voeren — met dezelfde drie eisen: matchen
op `auth.email()` (case-insensitief, zie de spec voor de motivatie), stille
no-op bij 0 of >1 matches, geen foutcode-kanaal nodig omdat de aanroepende
route toch altijd naar hetzelfde vervolgscherm redirect.

## Gevolgen

- `docs/ARCHITECTURE.md` → "Lid-accounts" moet de zin "Dit gebeurt
  server-side vanuit `src/lib/supabase/server.ts` … per de bestaande regel
  dat alleen die twee bestanden de Supabase SDK mogen importeren" bijwerken
  naar drie bestanden zodra `admin.ts` bestaat.
- `.env.example`'s `SUPABASE_SECRET_KEY`-regel gaat van "niet gebruikt door
  de app zelf" naar daadwerkelijk gebruikt — de begeleidende comment moet
  mee-veranderen (zie `docs/features/lid-account-invite.md` → Datamodel).
- **Server/client-gate gerealiseerd:** de eerdere wens voor een gate is
  ingevuld door [ADR 0021](0021-server-only-markering-is-de-grens-client-server.md).
  `check:arch` volgt de importgraaf transitief; de build bewaakt de markering.
- `db:test` (pgTAP) kan de RPC-kant van elke toekomstige actie die dit
  patroon volgt blijven dekken (actorcheck, guards), maar niet de
  `auth.admin.*`-aanroep zelf — dat blijft een gat dat alleen handmatige
  verificatie / een e2e-achtige check kan dekken, geen pgTAP-scenario. Zie
  `docs/features/lid-account-invite.md` → Randgevallen voor hoe dat ticket
  concreet met die beperking omgaat.
- **(2026-09-21 aanvulling)** `link_invited_member_account` (zie
  "Aanvulling" hierboven) is, in tegenstelling tot de rest van wat dit ADR
  behandelt, wél volledig pgTAP-testbaar — geen Auth-Admin-API-afhankelijkheid
  binnen de RPC zelf. Zie `docs/features/lid-account-invite.md` →
  Randgevallen voor de concrete testgevallen.
