---
name: review
description: Review een ABAS-PR of de huidige diff tegen de goedgekeurde spec en de kernregels. Meldt alleen blokkerende correctheids- en requirementsgaten met bestand:regel. Gebruik vóór Bram merget, of laat de reviewer-agent hem draaien.
---

# /review

## Feiten

!`node scripts/kit/feiten.mjs gates`

## Werkwijze

1. Bepaal de diff (`git diff origin/main...HEAD`) en de spec waar de PR naar
   verwijst. Geen goedgekeurde spec bij featurewerk: blokkerend.
2. Lees de CI-uitkomst van de laatste commit. Rood = geblokkeerd; zoek niet
   handmatig wat een gate al vindt.
3. Loop alleen deze vragen af, elk met een concreet pad van invoer naar fout:
   - Doet de PR wat de spec zegt, niet meer en niet minder?
   - Stuurt de client ergens een bedrag dat de server gebruikt? Nieuwe
     geldpaden via `*_once`?
   - Wordt `served_by` server-side tegen de bezetting gecontroleerd?
   - Shell-isolatie, datalaag, `server-only`, rolzichtbaarheid intact?
   - Focus, toetsenbord en foutplaatsing (wat axe niet ziet)?
   - Had een component of hook uit `node scripts/kit/catalogus.mjs`
     hergebruikt moeten worden?
   - Heeft elke nieuwe policy en RPC een negatieve test?
   - Wijzigt de PR gates of tests: staat het label `gate-wijziging` erop?
4. Uitkomst: `akkoord`, of `geblokkeerd` met de lijst. Geen stijlvoorkeuren,
   geen akkoord-met-kanttekening.
