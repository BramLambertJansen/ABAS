# 0011 — Client-fouten gaan via een RPC voor elke ingelogde sessie, zonder actor en zonder `anon`-uitzondering

Status: **geaccordeerd (2026-09-28)**, als onderdeel van de door Bram
goedgekeurde spec [`docs/features/foutlogging.md`](../features/foutlogging.md)
(issue #94). Amendeert niets; staat bewust tegenover
[ADR 0002](0002-beheeracties-vereisen-eigen-e-mail-sessie.md) (actor bij
elke beheerschrijfactie) en tegenover het patroon van `0023` (bar-RPC's
weigeren een lid-sessie), en past
[`0018`](../../supabase/migrations/0018_rpc_execute_alleen_authenticated.sql)
zonder uitzondering toe.

## Context

Sinds #93 toont elke hook in `src/hooks/queries/` bij een fout een korte
foutcode op het scherm, maar de ruwe fout ging alleen naar `console.error`,
en op een bar-tablet kijkt niemand in die console. Aanleiding was incident
#67: migratie 0019 ontbrak in productie, PostgREST gaf een schemafout, en
dat was alleen via een melding van een gebruiker te achterhalen.

De eerste keuze van Bram was een Route Handler die naar de Vercel-logs
schrijft. Productie draait op Vercel **Hobby**: runtime-logs blijven ongeveer
een uur staan en log drains zijn er niet. Een fout van vrijdagavond is dan
maandag weg. Daarom is de bestemming een Supabase-tabel met een insert-RPC
(spec → beslissing 1), met als geaccepteerd nadeel dat de log het
foutdomein deelt met Supabase.

Drie eigenschappen van die keuze gaan in tegen patronen die elders in deze
codebase gelden. Daarom legt dit ADR ze vast: een volgende feature kan ze
tegenspreken.

## Beslissing

**1. Een schrijf-RPC zonder geld, open voor elke `authenticated`, inclusief
een lid.** `log_client_error(...)` (`0025_client_errors.sql`) heeft geen
`caller_is_lid()`-weigering, anders dan de bar-RPC's sinds `0023`. Een
portal-lid moet zijn eigen leesfout kunnen melden. Het risico is klein: de
RPC is geen bar-RPC, raakt geen geld of saldo en geeft `void` terug, dus
lekt niets. Schrijven gaat alleen via de RPC (`security definer`), niet via
een `insert`-policy. Zo staan de grenzen op één plek, zijn ze niet te
omzeilen, en geldt hetzelfde `REVOKE`-patroon als voor de rest:
`client_errors` heeft RLS aan, géén policies en
`revoke all ... from authenticated, anon`. Lezen kan alleen in Supabase
Studio, als postgres-rol buiten RLS. Er is geen lees-RPC (spec →
beslissing 7).

**2. Bewust géén actor, met een vaste allowlist van velden.** ADR 0002 legt
voor een beheerschrijfactie vast wie hem deed. Hier gebeurt het omgekeerde:
`client_errors` heeft geen kolom voor `auth.uid()`, member-id, naam of
e-mail, en ook niet voor saldo, RPC-argumenten, `message`/`details`/`hint`,
stack, IP of user-agent. Alleen `hook`, `kind`, `code`, `path`, `occurrences`
en `build`, elk met een strak formaat dat de RPC zelf afdwingt. Er komt
bewust geen vrij tekstveld (spec → beslissing 2). Iedere ingelogde
gebruiker kan de RPC rechtstreeks aanroepen, met een nep-code als `42P01`
en daarnaast willekeurige tekst. Een door de client aangeleverde code bewijst
dus niet dat de tekst uit een echte schemafout komt. Alleen zonder vrij
tekstveld klopt "geen PII". Het doel is terugvinden wélke hook en wélke
build faalde, niet wie het zag. Een ernstige fout raakt toch iedereen. De
details reproduceer je lokaal.

Restrisico, bewust aanvaard: iemand kan letters coderen in `hook` of `path`.
Dat komt alleen terecht in een log die uitsluitend via Studio leesbaar is.

**3. Bewust géén `anon`-uitzondering op 0018.** Net als elke RPC sinds
`0018` is `log_client_error` alleen uitvoerbaar voor `authenticated`.
EXECUTE is ingetrokken voor `PUBLIC` en `anon`, en
`supabase/tests/rpc_execute_grants.test.sql` bewaakt dat. Het geaccepteerde
gevolg: fouten van vóór het inloggen worden niet gelogd. De pre-sessie-hooks
(`usePortalLogin`, `useWachtwoordHerstellen`,
`usePortalWachtwoordHerstellen`) en de `signOut`-takken gebruiken daarom
`logLocalError`, dat alleen naar de console schrijft. Bram's eerdere "ja" op
een sessieloos endpoint gold voor de Route-Handler-optie en vervalt met
die optie.

## Gevolgen

- Een sessie, ook die van een lid, kan rijen toevoegen binnen de grenzen van
  de RPC. Er is geen server-side rate-limit. Aan de clientkant geldt dedupe
  per (hook, kind, code) met een venster van 5 minuten en een telling
  (`src/lib/clientErrors.ts`). De groei van de tabel wordt begrensd door
  90 dagen retentie: `purge_client_errors()` via een dagelijkse
  `pg_cron`-job. Die functie kan alleen de eigenaar uitvoeren, geen enkele
  API-rol.
- Een totale Supabase-storing, of een ontbrekende migratie van déze tabel,
  wordt niet gelogd. Een fout zoals in #67, in een andere tabel of functie,
  wel.
- Geen gate kan zien of een hook alleen onverwachte fouten meldt en geen
  domeinuitkomsten (`insufficient_balance` en dergelijke). Dat blijft werk
  voor de Reviewer. Wat een gate wél afdwingt: `check:policy` laat geen
  kale `console.error(` meer toe in `src/hooks/queries/`.

## Wanneer dit ADR opnieuw bekijken

- Als fouten van vóór het inloggen belangrijk blijken. Dat vraagt een
  `anon`-pad en dus een bewuste uitzondering op 0018, met een eigen
  afweging over misbruik zonder sessie.
- Als er een actor nodig blijkt, bijvoorbeeld om één gebruiker te helpen.
  Dat vraagt eerst een PII-afweging in de lijn van ADR 0004.
- Als Studio in de praktijk te omslachtig blijkt als leesplek. Een
  leesscherm is dan een aparte feature met een eigen spec (spec →
  beslissing 7).
