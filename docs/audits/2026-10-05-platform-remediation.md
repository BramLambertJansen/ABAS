# Platformherstel ABAS — bijgewerkt 2026-10-06

## Productie en uitgevoerde wijzigingen

Het bestaande Supabase-project `zlyysbywrvaolpslcbid` is productie. Hier zijn
uitsluitend de bestaande main-migraties 0038–0040 toegepast en gecontroleerd.
De Vercel-frameworkinstelling is gecorrigeerd naar Next.js. Er zijn geen
financiële testboekingen op productie gedaan.

Read-only preflight op 2026-10-06: Postgres 17.6, hoogste migratie 0040, nul
actieve barsessies en geen money_requests-tabel. De drie Storage-tabellen
waarop API-rollen TRUNCATE hebben, geven postgres het benodigde TRIGGER-recht.
Dit bewijst de voorwaarden voor 0042; het voert die migratie niet uit.

## Reparatiebranch

[PR #162](https://github.com/BramLambertJansen/ABAS/pull/162) bevat:

- Read-only PostgREST-schema- en omgevingscontrole vóór deployment;
  productie en preview mogen niet dezelfde database gebruiken.
- Node 24, Postgres 17 in CI, Next.js 15.5.27, Sharp 0.35.5 en PostCSS 8.5.29.
  Server-only-grenzen en de AST-importcontrole uit main blijven behouden.
- Rechten uit #150 als migratie 0042/ADR 0023, inclusief negatieve tests.
- Goedgekeurde financiële idempotentie (#143), migratie 0043/ADR 0024:
  transactiereceipts, behouden startsaldo, UUID bij retries, expliciet herstel
  na sessiewissel en definitieve annulering die late boekingen blokkeert.
- Versleutelde backupexportcode en herstelprocedure; handmatige releaseworkflow
  die alleen de actuele main-SHA met succesvolle volledige CI accepteert.

Wijzigingen voor portal-herstel, chronologisch logboek en beheerformulieren
uit main `74737e41` zijn samengevoegd; de oorspronkelijke werkcheckout is niet
overschreven. Nieuwe database-RPC's zijn additief voor de overgang.

## Verificatie

[Volledige CI](https://github.com/BramLambertJansen/ABAS/actions/runs/37431699793)
voor head `7bd37194e921b8dbc5b2b34145f5d83188dc1c3d` is groen:
804 unittests, 1.688 pgTAP-asserties in 41 bestanden, 7 GoTrue/HTTP-
integratietests en 442 browsertests. Eén bestaande test voor tekstgrootte
200% staat expliciet op skip en is niet als geslaagd meegeteld. De build,
lint, typecheck en architectuur-, policy-, RLS-, migratie- en ADR-gates slagen.

Lokaal slagen daarnaast 25 financiële browsertests, inclusief verloren
antwoorden, herstel na reload, annulering, vrije navigatie, axe en Enter.
De concurrencytest gebruikt twee afzonderlijke Auth-/barsessies: een
sessierij-lock kan daardoor geen ontbrekende request-lock maskeren.
Herstel houdt dezelfde UUID vast tussen inspectie en retry, ook wanneer
een ander tabblad annuleert of een nieuwe actie start. Een afgewezen retry
wist geen eerdere onbekende uitkomst.

De GPG/tar-exportketen is getest met tijdelijke sleutels en fictieve bestanden;
CLI-dumpopties zijn gecontroleerd met een dry-run. Dit is geen productiebackup
of herstelproef. Runtime-audit: nul bekende kwetsbaarheden. Zeven hoge
meldingen via braces en twee matige via postcss-selector-parser zitten in
dev-tooling; een Tailwind-upgrade vereist afzonderlijke CSS- en a11y-validatie.

## Open activering

- Free-projectaanmaak voor ABAS Preview is geweigerd op het quotum. Geen ander
  project is gepauzeerd, verwijderd of opgewaardeerd. Bestaande previews delen
  nog productie; nieuwe previewbuilds worden daarom door de guard geweigerd.
- Vercel Deployment Checks zijn niet geactiveerd; releaseworkflowcredentials
  ontbreken. Native Git-auto-deploy blijft actief.
- 0041, 0042 en 0043 zijn niet op productie toegepast. De CI is groen; uitrol
  vereist nog een recente herstelbare backup en een geactiveerde releasegate.
  Daarna volgen de migraties vóór de app, met catalogus- en rechtencontrole.
- Op verzoek zijn alleen backupcode en procedure voorbereid. Geen echte
  productie-export, externe opslag, scheduler of restoreproef uitgevoerd.

Zie het [platformrunbook](2026-10-05-platform-runbook.md),
[backup en herstel](2026-10-05-backup-restore.md) en de
[eindreview](2026-10-06-platform-eindreview.md) voor bewijs en procedures.

## Eindreview — 2026-10-06

PR #163 is gemerged en meegenomen, inclusief levende Auth-sessies in de
financiële fixtures en de uitgebreidere RPC-catalogus. De reparaties gebruiken
0042/0043 en ADR 0023/0024; startsaldoregistratie blijft behouden.

De lokale patch is daadwerkelijk toegepast op een tijdelijke checkout van
main 74737e41. De tree is exact gelijk aan de gepubliceerde PR-head:
`0e6d4d39f57ec5dc0a17ddc4d038c661d500cb4a`. Nieuwere main 0cfbb565 bevat
sinds deze basis alleen documentatie. De PR was bij de eindcontrole mergeable.

Read-only hercontrole bevestigt productieversie 0040, nul actieve barsessies
en geen financiële receipt-tabel. Code en verificatie zijn afgerond; PR #162 is daarna op expliciet verzoek
gemerged als 62ca126b. De productievoorwaarden blijven open en de automatische
build is door de schemacontrole gestopt wegens de nog ontbrekende financiële RPC’s. De backupopdracht
blijft beperkt tot voorbereiding; er is geen productie-export gemaakt.
