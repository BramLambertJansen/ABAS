# Eindreview platformherstel ABAS — 2026-10-06

PR: https://github.com/BramLambertJansen/ABAS/pull/162
Actuele head: 7bd37194e921b8dbc5b2b34145f5d83188dc1c3d
Basis: main 74737e41, inclusief sessiebeveiliging (#163).

## Verificatie

- Lokaal: 804 unittests, lint, typecheck en alle repositorygates groen.
- Lokaal: 25 financiële browsertests groen, inclusief verlies van antwoord,
  herstel na reload, annulering, vrije navigatie, toetsenbord en axe.
- [Volledige CI voor de actuele head](https://github.com/BramLambertJansen/ABAS/actions/runs/37431699793)
  is geslaagd op 2026-10-06 om 07:59:59 UTC: 804 unittests, 1.688 pgTAP-
  asserties in 41 bestanden, 7 GoTrue/HTTP-integratietests en 442 browsertests.
  Eén bestaande browsertest voor tekstgrootte 200% staat expliciet op skip;
  die controle is niet als geslaagd meegeteld. Build en alle statische gates
  zijn groen.
- De actuele concurrencytest gebruikt twee afzonderlijke Auth-/barsessies.
- De runtime dependency-audit heeft nul bekende kwetsbaarheden.
- De patch in deze auditmap is toegepast op een tijdelijke checkout van
  main 74737e41. De resulterende tree is exact
  0e6d4d39f57ec5dc0a17ddc4d038c661d500cb4a, gelijk aan de PR-head.
- Nieuwere main 0cfbb565 bevat sinds deze basis uitsluitend documentatie;
  de PR was bij de eindcontrole mergeable en is daarna op expliciet verzoek gemerged.

## Inhoudelijke review

Goedgekeurde scopes staan in geldverzoeken-idempotent.md (inclusief de
expliciete annulering) en tabelrechten-api-rollen.md. Startsaldoregistratie
is behouden. Geen financiële berekening in de client; alleen validatie van
teruggegeven bedragen. Bestaande serverguards en served_by-controle blijven
staan, ook bij replay; vier extra negatieve tests toetsen ingetrokken Auth.
De interne receipt-tabel en helpers hebben geen API-rechten.

Herstel heeft geen automatische boeking of annulering bij mount/login.
Lopende en onbekende pogingen houden hun sleutel vast; een afgewezen retry
wist geen eerdere onbekende uitkomst. Herstel houdt de oorspronkelijke UUID
vast tussen inspectie en retry, ook als een ander tabblad annuleert of een
nieuwe actie start. Oudere v1-intents blijven conservatief onbekend.

De herstelmelding bedekt geen navigatie. Focus en Enter zijn getest; de
axe-scan heeft geen overtredingen. Queries blijven in de datalaag; geen
shell-import, gedeelde onbekende-uitkomstcomponenten blijven behouden.

## Merge en productie

De codeverificatie is afgerond en PR #162 is op expliciet verzoek gemerged.
Productie-uitrol wacht nog op de releasevoorwaarden. Productie blijft Supabase
zlyysbywrvaolpslcbid, versie 0040, zonder nieuwe receipts/migraties.

Voor productie: recente herstelbare backup en activering van de releasegate,
dan 0041/0042/0043 vóór de app met catalogus-/rechtencontrole. Backupopdracht
blijft voorbereiding; geen productie-export, scheduler of restore uitgevoerd.
Previewaanmaak is op het Free-quotum geweigerd. Geen ander project aangepast.
Zeven hoge plus twee matige dev-toolmeldingen vragen aparte upgradevalidatie.

Zie het [platformrunbook](2026-10-05-platform-runbook.md) en de
[backup- en herstelprocedure](2026-10-05-backup-restore.md).

## Merge — 2026-10-06

PR #162 is gemerged en gesloten. GitHub bevestigt dat main op merge-commit
`62ca126b957a35cf7d8a60eb94c3951f404f9d44` staat; de geteste PR-head is
`7bd37194e921b8dbc5b2b34145f5d83188dc1c3d`.

De automatische productiebuild `dpl_5rVbC4NNwEixm9o3Y3xrWwFvpCf6` is op
ERROR geëindigd door de bedoelde schemacontrole: inspect_money_request,
place_order_once, top_up_once en create_member_once ontbreken nog.
Er is geen nieuwe app uitgerold en er zijn geen migraties toegepast.
De laatste READY-productiedeployment blijft `dpl_CeMeZiFf9KrH1K4e31hnoXY4cVTS`,
gebouwd van main `0cfbb5658ce4bcdc0e918bc34d4daa663316379b`.
De productievoorwaarden blijven open; de broncode-merge geeft geen opdracht
om alsnog een backup te exporteren of databasemigraties uit te voeren.
