# Uitrolvoorbereiding frameworkreview — 2026-10-09

Productieproject: `zlyysbywrvaolpslcbid`. Geen productiemutatie uitgevoerd.
Read-only momentopname: hoogste migratie 0040, nul open barsessies; vereiste
sessieguard en geldwrappers ontbreken. Vercel serveert de oudere READY-versie
`0cfbb56`; app en database moeten als combinatie gecontroleerd worden.

## Migraties in volgorde

| Bestand | Doel | SHA-256 |
| --- | --- | --- |
| [0041_sessie_na_afmelden.sql](../../supabase/migrations/0041_sessie_na_afmelden.sql) | Auth-sessieverificatie na afmelden | `3c51ed9d92b3b9d9b3094221761cf7d77f4a91f931292f47b890806f182f8521` |
| [0042_api_rollen_geen_rls_omzeilende_rechten.sql](../../supabase/migrations/0042_api_rollen_geen_rls_omzeilende_rechten.sql) | API-TRUNCATE/TRIGGER-rechten intrekken | `fdc59dbc2388406cf71c74d7aa7d332e174ce085e9a253343bca700a0258e79b` |
| [0043_geldverzoeken_idempotent.sql](../../supabase/migrations/0043_geldverzoeken_idempotent.sql) | Idempotente geldverzoeken en receipts | `b48017804c3149eb7528ddf75fc5c37eacc12dd32b9cd91b2568450311956ec4` |
| [0044_expliciete_grants_api_rollen.sql](../../supabase/migrations/0044_expliciete_grants_api_rollen.sql) | Expliciete API-grants voor lokale/gehoste pariteit | `6b715392b17fa67566df654a4ac5c527c30216071db3248387ac944c37243664` |

## Handelingen voor de eigenaar

1. Controleer een recente herstelbare backup volgens backup-restore.md,
   volledige CI op de definitieve commit en opnieuw nul/aanvaardbare actieve
   diensten. De eerdere momentopname is geen toestemming om een lopende dienst
   te onderbreken. Pas geen SQL buiten de versiebeheer-migraties toe.
2. Link CLI 2.118.0 aan **dit** project en controleer doel en historie:
   `supabase link --project-ref zlyysbywrvaolpslcbid`,
   `supabase migration list --linked`,
   `supabase db push --linked --dry-run`.
   Verwacht uitsluitend 0041–0044. Bij afwijkende reeds toegepaste inhoud of
   ontbrekende oudere versies: eerst vergelijken, niet historie blind repareren.
3. Herhaal de vier read-only voorwaarden uit de goedgekeurde spec
   `docs/features/tabelrechten-api-rollen.md` (Storage-grantor, postgres TRIGGER,
   default ACL public, alle Storage-tabellen met API-TRUNCATE). Bewaar veilige
   metadata. Bij afwijking volg de expliciete terugval in die spec.
4. Pas de vier bestanden in volgorde toe met `supabase db push --linked`.
   De CLI registreert de repo-versies 0041–0044. Gebruik geen MCP-
   timestampmigraties die opnieuw dezelfde SQL uitvoeren.
5. Controleer migration list en RPC's. `npm run check:deployment` moet met
   productie-env slagen, inclusief `caller_session_alive`. Verifieer dat anon
   en authenticated geen TRUNCATE/TRIGGER op public/Storage hebben en default
   grants die niet teruggeven. Controleer geldhelpers/receipt-rechten conform
   de bijbehorende migraties. Deze checks voeren geen geldverzoek uit.
6. Bram merget de gereviewde reparatie. Wacht op volledige CI van exact die
   main-SHA, controleer beschermde release-environment en start release.yml.
   Verifieer READY, SHA, login, producten en sessieafmelding. Financiële smoke
   tests alleen als afgesproken beheerhandeling.

## Rollback en blokkades

Een approllback draait SQL niet terug. De oude geld-RPC's blijven voor de
compatibele overgang bestaan; verwijder ze niet in deze reparatie. Bij een
migratiefout stop verdere uitrol en herstel met een gereviewde vooruitgaande
migratie. Bij restore spreek het dataverliesvenster expliciet af.

De gekoppelde GitHub-identiteit mag branch/environmentbescherming niet
beheren (HTTP 403). Een onafhankelijke agentidentiteit en herstelbare backup
zijn nog niet aangetoond. Productiepush en release zijn daarom geen voltooid
onderdeel van deze code-PR; de benodigde bestanden, doelproject en controles
staan hier wel concreet klaar voor uitvoering.
