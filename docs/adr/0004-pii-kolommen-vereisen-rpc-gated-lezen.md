# 0004 — PII-kolommen op een gedeelde-rol-tabel vereisen RPC-gated lezen, niet de brede row-level select-policy

Status: **goedgekeurd**

Toelichting: **geaccepteerd** (Bram, via geautomatiseerde P1-bevinding op PR #59,
issue #57, 2026-09-02).

## Context

`members_select` (`0001_init.sql`, regel 124) is een brede row-level policy:
`create policy members_select on members for select to authenticated using
(true)`. Elke `authenticated`-sessie mag elke rij en, omdat RLS row-level is
en geen column-level granulariteit kent, **elke kolom** van `members` lezen —
dat was tot nu toe onschuldig, want elke bestaande kolom (`name`, `role`,
`balance_cents`, `archived`) is precies wat CLAUDE.md → Domein aan bardienst
toekent ("Bardienst … ziet saldi om te kunnen waarschuwen bij een laag
tegoed").

`0008_ledenbeheer_email.sql` (#57) voegt `members.email` toe zonder de
policy aan te passen — de aanname in `docs/features/ledenbeheer-email.md` →
Rolzichtbaarheid was: "geen nieuwe leestoegang, geen nieuwe policy nodig,
`useAlleLeden()` is toch al alleen bereikbaar binnen een beheerder-gated
`/beheer`-scherm". Die aanname klopt voor de **UI**, niet voor de
**database**: RLS beoordeelt de Postgres-rol van de sessie
(`authenticated`), niet welk scherm de client toont.

Er bestaat geen aparte Postgres-rol per app-rol. `lid`/`bardienst`/
`beheerder` is uitsluitend een kolomwaarde die RPC's zelf controleren
(`v_actor.role`, ADR 0002) — zowel de gedeelde bar-tablet-sessie
(`SUPABASE_DEVICE_EMAIL`/`SUPABASE_DEVICE_PASSWORD`, `src/middleware.ts`,
gebruikt door bardienst zonder eigen PIN-attributie op leesniveau) als een
ingelogde beheerder-sessie (ADR 0002) authenticeren als **dezelfde**
Postgres-rol `authenticated`. Gevolg: `members_select` geeft elke
bardienst-medewerker op het gedeelde tablet — via een rechtstreekse
Supabase-query, los van welke UI de app toont — leesrecht op `members.email`.
Dat is PII die CLAUDE.md's domeinmodel niet aan bardienst toekent.

## Beslissing

**Een kolom die persoonsgegevens bevat en niet voor elke `authenticated`-
sessie zichtbaar mag zijn, wordt uit de kolommenlijst gehaald die
`authenticated` mag lezen, en uitsluitend via een `SECURITY DEFINER`-RPC
met een actorcheck (ADR 0002-vorm) gelezen — dezelfde structuur als het
bestaande "geld alleen via RPC"-patroon (CLAUDE.md → Architectuurbeslissingen),
hier toegepast op een leesrecht in plaats van een schrijfrecht.**

**Correctie (Bram, na een echte `db:test`-run in CI, PR #59):** de eerste
versie van deze beslissing beschreef een kale
`revoke select (email) on members from authenticated`. Dat bleek in de
praktijk geen effect te hebben — de nieuwe negatieve test faalde ("caught:
no exception, wanted: 42501") op een echte Postgres. Oorzaak:
`authenticated` heeft via Supabase's platform-brede default-privileges al
een **tabel-niveau** SELECT-grant op `members` (noodzakelijk — zonder die
grant zou `members_select` sowieso nooit iets kunnen filteren, RLS filtert
rijen, geen tabeltoegang). Postgres' privilegemodel laat een column-level
`REVOKE` geen effect hebben zolang een bredere table-level `GRANT` dezelfde
toegang al dekt: je kunt met een column-level REVOKE alleen intrekken wat
ooit expliciet op column-niveau gegeven is, niet wat via een tabel-brede
grant al bestaat. Concreet betekent dit patroon dus:

1. `revoke select on members from authenticated;` gevolgd door
   `grant select (<alle kolommen behalve email>) on members to
   authenticated;` — de tabel-brede grant intrekken en de overgebleven
   kolommen stuk voor stuk expliciet teruggeven is de enige manier waarop
   een column-level afscherming in Postgres daadwerkelijk werkt. Dit
   blokkeert élke directe tabel-select van de afgeschermde kolom, voor
   **iedereen** die als `authenticated` inlogt: gedeelde device-sessie én
   beheerder-sessie allebei. Dit is bewust ongenuanceerd op
   database-niveau — de Postgres-rol kan het onderscheid bardienst/
   beheerder niet maken, alleen een RPC kan dat.
2. Een nieuwe `SECURITY DEFINER`-RPC (zie
   `docs/features/ledenbeheer-email.md` → RPC's → "Nieuw precedent" voor de
   exacte naam/signatuur) doet de ADR-0002-actorcheck
   (`v_actor.role = 'beheerder'`) en retourneert dan alsnog alle kolommen,
   inclusief `email` — de functie draait met verhoogde rechten
   (`security definer`) en is dus zelf niet onderhevig aan de REVOKE die op
   de aanroepende rol van toepassing is. `grant execute … to authenticated`
   blijft normaal — elke ingelogde sessie mag de RPC *aanroepen*, de
   actorcheck bepaalt of het lukt, exact zoals elke andere beheerder-only
   RPC in deze codebase.
3. De client-lezende hook roept voortaan die RPC aan in plaats van een
   directe `.from("members").select(...)`.

**Niet gekozen: een aparte Postgres-rol per app-rol.** Zou het onderscheid
ook op RLS-niveau afdwingbaar maken, maar is een fundamentele wijziging van
hoe sessies vandaag werken (één gedeeld device-account, ADR 0002's
`auth.uid()`-koppeling) — een veel grotere ingreep dan nodig voor dit
probleem, en zou nog steeds niet oplossen dat de gedeelde device-sessie en
een individuele bardienst-medewerker niet van elkaar te onderscheiden zijn
(dat is al zo geaccepteerd voor `served_by`, CLAUDE.md →
Architectuurbeslissingen).

## Reikwijdte van deze beslissing

Dit ADR beslist het patroon, niet met terugwerkende kracht elke bestaande
kolom. `name`/`role`/`balance_cents`/`archived` blijven leesbaar via de
brede `members_select`-policy — dat is precies wat CLAUDE.md → Domein aan
bardienst toekent, geen PII in de zin van dit ADR. Alleen kolommen die (a)
persoonsgegevens zijn en (b) niet aan elke `authenticated`-sessie toebehoren
volgens CLAUDE.md → Domein, vallen hieronder. `members.email` is de eerste;
een toekomstige kolom als telefoonnummer of adres zou hetzelfde patroon
volgen zonder dat dit ADR opnieuw geschreven hoeft te worden.

## Gevolgen

- `docs/features/ledenbeheer-email.md` → Rolzichtbaarheid is gecorrigeerd:
  de eerdere aanname ("geen nieuwe leestoegang nodig") was onjuist voor de
  database-laag, zie de bijgewerkte sectie daar voor de precieze RPC-naam en
  het contract.
- `useAlleLeden()` (`src/hooks/queries/useAlleLeden.ts`) roept voortaan een
  RPC aan in plaats van een directe `select`. `useMembers()` (verkoop-
  ledenzoeker) en `useBarStaff()` blijven ongewijzigd — die selecteren nooit
  `email` en blijven op de bestaande brede policy draaien.
- Nieuwe negatieve test nodig (`check:rls`/`db:test`): een directe
  `select email from members` als gewone `authenticated`-sessie moet falen —
  dat is het bewijs dat de REVOKE werkt, niet alleen dat de RPC bestaat.
- **Signaal voor een mogelijke toekomstige gate** (CLAUDE.md → "Regel over
  regels"): `check:policy` controleert vandaag "geen queries buiten de
  datalaag" voor geld, niet specifiek "een nieuwe kolom op een tabel met een
  brede select-policy is gecontroleerd tegen dit patroon". Nog niet als gate
  voorgesteld — één precedent is te vroeg om een script op te baseren — maar
  als een tweede PII-kolom dit patroon ooit mist, is dát het moment om
  `check:policy` uit te breiden in plaats van opnieuw op een geautomatiseerde
  review te vertrouwen.
