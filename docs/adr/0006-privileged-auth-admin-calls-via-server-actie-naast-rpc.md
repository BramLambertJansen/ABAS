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
0002 en ADR 0004 aan, geen van beide vervangen.

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
`admin.ts` mag **nooit** importeren in een `"use client"`-bestand — er is
vandaag geen gate die dat specifiek afdwingt (`check:arch` verbiedt alleen
*welk* bestand de SDK importeert, niet *vanuit welk ander bestand* het
geïmporteerd wordt), dus dit is een discipline-eis voor de Developer/
Reviewer, geen script-garantie. Zie "Signaal voor een mogelijke toekomstige
gate" hieronder.

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

## Gevolgen

- `docs/ARCHITECTURE.md` → "Lid-accounts" moet de zin "Dit gebeurt
  server-side vanuit `src/lib/supabase/server.ts` … per de bestaande regel
  dat alleen die twee bestanden de Supabase SDK mogen importeren" bijwerken
  naar drie bestanden zodra `admin.ts` bestaat.
- `.env.example`'s `SUPABASE_SECRET_KEY`-regel gaat van "niet gebruikt door
  de app zelf" naar daadwerkelijk gebruikt — de begeleidende comment moet
  mee-veranderen (zie `docs/features/lid-account-invite.md` → Datamodel).
- **Signaal voor een mogelijke toekomstige gate** (CLAUDE.md → "Regel over
  regels"): er bestaat geen geautomatiseerde controle die verbiedt dat een
  `"use client"`-bestand `src/lib/supabase/admin.ts` importeert — vandaag is
  er precies één plek die dit nodig heeft (deze feature), dus nog te vroeg
  voor een gate op basis van één precedent, zelfde afweging als ADR 0004 zelf
  al maakte voor PII-kolommen. Als een toekomstige feature dit patroon
  herhaalt, is dát het moment om `check:arch` uit te breiden met een
  specifieke regel ("`admin.ts` mag alleen geïmporteerd worden vanuit een
  server-only bestand"), in plaats van opnieuw op reviewdiscipline te
  vertrouwen.
- `db:test` (pgTAP) kan de RPC-kant van elke toekomstige actie die dit
  patroon volgt blijven dekken (actorcheck, guards), maar niet de
  `auth.admin.*`-aanroep zelf — dat blijft een gat dat alleen handmatige
  verificatie / een e2e-achtige check kan dekken, geen pgTAP-scenario. Zie
  `docs/features/lid-account-invite.md` → Randgevallen voor hoe dat ticket
  concreet met die beperking omgaat.
