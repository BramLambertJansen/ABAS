# Herstel frameworkreview 2026-10-09

Status: **goedgekeurd**

Bram: "Oke verwerk het review rapport" (2026-10-09).

## Doel

De geconstateerde omzeilingen sluiten en racegevoelige lezingen herstellen;
externe instellingen verifieerbaar maken voordat het framework naar een
starterapp verhuist. Geen claim dat lokale hooks een beveiligingssandbox zijn.

## Betrokken shell

Bar en beheer: leden, producten, instellingen en activiteittypen. Geen
schermwijzigingen; dezelfde loading/error/ready- en refetch-API.

## Datamodel en RPC's

Geen nieuwe tabellen of RPC's. De bestaande productiemigraties 0041–0044
moeten volgens het platformrunbook uitgerold worden vóór de nieuwe app.

## Rollen

Developer schrijft geen gate of test; Tester schrijft de vier testmappen.
Hoofdsessie verwerkt deze goedgekeurde reparatie. Alleen Bram geeft de
onafhankelijke gate-review; mergen blijft zijn handeling (ADR 0027).

## Hergebruik & UX-patronen

Bestaande `maakRondeGuard` gebruiken, geen nieuwe querybibliotheek.
AST-parser en dezelfde lokale padconfig delen tussen hook en diff-guard.
Bestaande foutmelding en statevorm behouden.

## Randgevallen

Oud antwoord en oude fout na refetch/unmount mogen niet meer schrijven of
loggen. Review op oude SHA, self-review, dismissal en changes-requested
geven geen gate-akkoord. Label alleen is onvoldoende. Een API-403 is een
onverifieerbare inrichting, geen goedkeuring. Secretscanuitzonderingen gelden
uitsluitend voor afzonderlijk geclassificeerde historische fingerprints.

## Testplan

Regressies voor imports, re-exports en bracketqueries; rol- en shellgrenzen;
review op exacte SHA en schone werkboom met rode checks. Draai de echte zeven
query-hooks met omgekeerde netwerkvolgorde en late fouten. Volledige snelle
gates, build, database-, integratie- en browsertests. Historiescan met dezelfde
gepinde scanner als CI. Leg externe blokkades expliciet vast.

## Buiten scope

Betaald plan, repositoryzichtbaarheid wijzigen, een andere Supabase-database
gebruiken, productiebackup activeren of mergen zonder Brams review.
