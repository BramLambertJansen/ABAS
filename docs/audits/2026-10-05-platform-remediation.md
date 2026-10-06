# Platformherstel ABAS — bijgewerkt 2026-10-06

## Productie en uitgevoerde wijzigingen

Het bestaande Supabase-project `zlyysbywrvaolpslcbid` is productie. Hier zijn
uitsluitend de bestaande main-migraties 0038–0040 toegepast en gecontroleerd.
De Vercel-frameworkinstelling is gecorrigeerd naar Next.js. Er zijn geen
financiële testboekingen op productie gedaan.

Read-only preflight op 2026-10-06: Postgres 17.6, hoogste migratie 0040, nul
actieve barsessies en geen money_requests-tabel. De drie Storage-tabellen
waarop API-rollen TRUNCATE hebben, geven postgres het benodigde TRIGGER-recht.
Dit bewijst de voorwaarden voor 0041; het voert die migratie niet uit.

## Reparatiebranch

[PR #162](https://github.com/BramLambertJansen/ABAS/pull/162) bevat:

- Read-only PostgREST-schema- en omgevingscontrole vóór deployment;
  productie en preview mogen niet dezelfde database gebruiken.
- Node 24, Postgres 17 in CI, Next.js 15.5.27, Sharp 0.35.5 en PostCSS 8.5.29.
  Server-only-grenzen en de AST-importcontrole uit main blijven behouden.
- Rechten uit #150 als migratie 0041/ADR 0022, inclusief negatieve tests.
- Goedgekeurde financiële idempotentie (#143), migratie 0042/ADR 0023:
  transactiereceipts, behouden startsaldo, UUID bij retries, expliciet herstel
  na sessiewissel en definitieve annulering die late boekingen blokkeert.
- Versleutelde backupexportcode en herstelprocedure; handmatige releaseworkflow
  die alleen de actuele main-SHA met succesvolle volledige CI accepteert.

Wijzigingen voor portal-herstel, chronologisch logboek en beheerformulieren
uit main `17792ede` zijn samengevoegd; de oorspronkelijke werkcheckout is niet
overschreven. Nieuwe database-RPC's zijn additief voor de overgang.

## Verificatie

Lokale lint-, type- en unitcontroles plus architectuur-, policy-, RLS-,
migratie- en ADR-gates slagen. De productiebuild met lokale placeholderconfig
slaagde vóór de laatste main-samenvoeging; CI moet de actuele combinatie toetsen.

CI vond eerst drie verouderde browsermocks en daarna twee databaseproblemen:
een herstelguard vroeg onbedoeld beheerdersrechten; een oude test verwachtte
nog anonieme SELECT-rechten. De mocks, guard en tests zijn aangepast. Geen
volledige CI-goedkeuring of productie-uitrol claimen voordat de actuele head
ook pgTAP, GoTrue, concurrency en Playwright heeft doorlopen.

De GPG/tar-exportketen is getest met tijdelijke sleutels en fictieve bestanden;
CLI-dumpopties zijn gecontroleerd met een dry-run. Dit is geen productiebackup
of herstelproef. Runtime-audit: nul bekende kwetsbaarheden bij de laatste
controle; zeven hoge dev-toolmeldingen via braces vragen een afzonderlijk
gevalideerde Tailwind-upgrade.

## Open activering

- Free-projectaanmaak voor ABAS Preview is geweigerd op het quotum. Geen ander
  project is gepauzeerd, verwijderd of opgewaardeerd. Bestaande previews delen
  nog productie; nieuwe previewbuilds worden daarom door de guard geweigerd.
- Vercel Deployment Checks zijn niet geactiveerd; releaseworkflowcredentials
  ontbreken. Native Git-auto-deploy blijft actief.
- 0041 en 0042 zijn niet op productie toegepast. Uitrol vereist de volledige
  groene CI, review en een recente herstelbare backup volgens het runbook.
- Op verzoek zijn alleen backupcode en procedure voorbereid. Geen echte
  productie-export, externe opslag, scheduler of restoreproef uitgevoerd.

Zie [platformrunbook](../operations/platform-runbook.md) en
[backup en herstel](../operations/backup-restore.md) voor de concrete procedures.
