# Eerste herstelronde platformreview — 2026-10-05

## Live uitgevoerd

Supabase `zlyysbywrvaolpslcbid`: de bestaande main-migraties 0038, 0039 en
0040 toegepast. Vooraf: nul actieve barsessies en nul openstaande invites.
De migratiehistorie is gecontroleerd op overeenkomst met de viercijferige
repositoryversies. Na afloop: hoogste versie 0040; beide nieuwe kolommen,
beide RPC-signaturen, productbucket en caller_has_bar_role aanwezig; oude
caller_is_lid-helper en denylist-leespolicies verdwenen; anonieme EXECUTE op
public-RPC's nul. Geen financiële transacties uitgevoerd.

Vercel: frameworkinstelling van `vite` naar `nextjs` gecorrigeerd.
De functionregio `dub1` is een repositorywijziging, actief na deployment.

## Gebouwd in deze branch

Server-only-markeringen en transitieve importgate volgens de bestaande
Architect-spec/ADR 0021. Read-only deployment-contractcheck vóór Vercel-build,
ook in CI tegen de lokale database. Node 24 gelijk voor CI en productie.
Next.js 15.5.27, Sharp exact 0.35.5, PostCSS-override 8.5.29 en compatibele
transitieve patches. README en platformrunbook bijgewerkt.

## Lokaal bewijs

- check:fast groen: lint, typecheck, 642 tests en alle architectuur/policy/
  RLS/migratie/ADR-gates.
- Productiebuild met lokale placeholder-configuratie groen (geen live login).
- Tijdelijke import van sendMemberInvite in de clientcomponent
  Assortimentbeheer liet Next.js falen op server-only. Importtrace:
  admin.ts → inviteMember.ts → Assortimentbeheer.tsx. check:arch faalde met
  dezelfde keten voor admin.ts en server.ts. Tijdelijke wijziging hersteld.
- npm audit --omit=dev: nul bekende kwetsbaarheden. Volledige audit: zeven
  hoge meldingen in ontwikkeltools via braces; geen compatibele patch
  beschikbaar. Grote Tailwind-upgrade apart beoordelen.

De volledige CI moet het contract tegen echte PostgREST en de browser-,
pgTAP- en GoTrue-tests nog bewijzen. De live REST-probe met de door MCP
geleverde publieke key antwoordde HTTP 401; dit bewijst de HTTP-contractcheck
op productie niet. De live database is wel rechtstreeks via SQL gecontroleerd.

## Nog open

Zie docs/operations/platform-runbook.md: aparte previewdatabase, afdwingbare
CI-gate, externe backups + restoreproef, PR #150 (grants, rebase/nummers),
issue #143 (idempotentie), Postgres-versies gelijkzetten. Geen nieuw betaald
project, planwijziging of backupopslag aangemaakt.

## Vervolgronde

Rechten uit #150 uitsluitend overgenomen en op main afgestemd als migratie
0041/ADR 0022; catalogus en negatieve tests behouden en uitgebreid. Geen merge
van de oude branch met andere verkoopwijzigingen. Lokale/CI Postgres-major naar 17.

Bram keurde het financiële voorstel goed met behoud van startsaldo. Nieuwe
0042/ADR 0023 bevat transactiereceipts en additieve wrappers; browseropslag,
herstelknop, pgTAP-tests en echte concurrentie-HTTP-tests toegevoegd. De
Supabase CLI heeft de migratie aangemaakt; vervolgens hernummerd naar 0042.
Nieuwe previewguard verbiedt productie-URL; productieguard verbiedt staging.
Backupexportcode en herstelrunbook voorbereid, zonder automatische opslag of
werkelijke export (keuze Bram). Releaseworkflow met actuele-main-CI-check klaar;
native Git-auto-deploy blijft actief tot een bewezen alternatief is ingesteld.

ABAS Preview-aanmaak in PANGU tegen $0/Free geprobeerd na kostenbevestiging.
Supabase weigerde wegens de limiet van twee actieve Free-projecten. Geen
bestaand project gepauzeerd, verwijderd of opgewaardeerd. Nieuwe projectchecks
kunnen niet via de beschikbare Vercel MCP-tools worden aangemaakt.

De eerdere automatische goedkeuringsfout (`Selected model is at capacity`)
is in deze vervolgronde hersteld: CLI-download en tests konden weer draaien.
GitHub-publicatie en volledige CI moeten de aanvullende SQL/browserflow bewijzen.
0041 en 0042 zijn op dit moment niet op productie toegepast.
