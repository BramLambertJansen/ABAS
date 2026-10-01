# GitHub-tickets — frontendreview 1 oktober 2026

Epic: [#121 — Frontendverbeteringen ABAS](https://github.com/BramLambertJansen/ABAS/issues/121).

Elf nieuwe uitvoertickets aangemaakt; bestaand #43 bijgewerkt als T03, met de oorspronkelijke vastlegging behouden. Samen twaalf uitvoertickets, als native GitHub-subissues onder epic #121 gekoppeld. Alle tickets bevatten auditbewijs, scope, checkbox-acceptatiecriteria, verificatie, bestaande labels en onderlinge verwijzingen. Geen assignees of milestones toegewezen.

| Ticket | GitHub | Titel | Prioriteit |
| --- | --- | --- | --- |
| T01 | [#122](https://github.com/BramLambertJansen/ABAS/issues/122) | Borg e-mailstart en sessiemodus bij dienst-per-sessie | P1 |
| T02 | [#123](https://github.com/BramLambertJansen/ABAS/issues/123) | Scheid PIN-stafkeuze van bezettingsgeschiktheid | P1 |
| T03 | [#43](https://github.com/BramLambertJansen/ABAS/issues/43) | Bewaar verkoopdraft binnen de open dienst | P1 |
| T04 | [#124](https://github.com/BramLambertJansen/ABAS/issues/124) | Maak bar en beheer bruikbaar op ondersteunde tablets | P1 |
| T05 | [#125](https://github.com/BramLambertJansen/ABAS/issues/125) | Herstel dialogen, tabs en landmarks | P1 |
| T06 | [#126](https://github.com/BramLambertJansen/ABAS/issues/126) | Maak opslaan, sluiten en gelijktijdige acties voorspelbaar | P2 |
| T07 | [#127](https://github.com/BramLambertJansen/ABAS/issues/127) | Verbeter invoerfeedback, ledenzoeker en productfilters | P2 |
| T08 | [#128](https://github.com/BramLambertJansen/ABAS/issues/128) | Geef herstelbare leesfouten en actuele portaldata | P2 |
| T09 | [#129](https://github.com/BramLambertJansen/ABAS/issues/129) | Maak portaltransacties inhoudelijk consistent | P1/P2 |
| T10 | [#130](https://github.com/BramLambertJansen/ABAS/issues/130) | Maak logboek chronologisch en eerlijk over de reikwijdte | P2 |
| T11 | [#131](https://github.com/BramLambertJansen/ABAS/issues/131) | Maak beheerformulieren en catalogus duidelijker | P2/P3 |
| T12 | [#132](https://github.com/BramLambertJansen/ABAS/issues/132) | Harmoniseer contrast, controls, taal en portalbreedte | P1/P3 |

## Afstemming met actuele GitHub-backlog

- [#115](https://github.com/BramLambertJansen/ABAS/issues/115) blijft eigenaar van de portal-sessielookupbug; T08 integreert die fix en pakt overige lees-/verversflows op.
- [PR #120](https://github.com/BramLambertJansen/ABAS/pull/120) bouwt persoonlijke bar-sessies. T01 en T02 zijn hierop afgestemde opvolg-/regressietickets, geen parallel authproject.
- [Dienst-per-sessie](https://github.com/BramLambertJansen/ABAS/blob/main/docs/features/dienst-per-sessie.md) en [ADR 0016](https://github.com/BramLambertJansen/ABAS/blob/main/docs/adr/0016-dienst-hoort-bij-geregistreerde-app-sessies.md) zijn inmiddels goedgekeurd. Die actuele richting vervangt de oudere D2-/device-sessie-aanpak uit het lokale auditvoorstel. De gepubliceerde tickets bevatten die actualisatie.
- [#117](https://github.com/BramLambertJansen/ABAS/issues/117), [#78](https://github.com/BramLambertJansen/ABAS/issues/78), [#51](https://github.com/BramLambertJansen/ABAS/issues/51) en [#67](https://github.com/BramLambertJansen/ABAS/issues/67) zijn waar relevant gekoppeld, niet gesloten of opnieuw aangemaakt.

De review blijft bewijs van commit `ebca0543443bac61fe3a20c9fdf0a82ac6fcf368`; GitHub/main loopt verder. Agents controleren bevindingen opnieuw op de actuele bronstand. Screenshots/auditdocumenten zijn niet gepusht; de ticketbeschrijvingen zijn daarom zelfstandig leesbaar en linken uitsluitend naar bestaande bronnen.
