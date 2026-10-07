---
name: spec
description: Schrijf een ABAS-featurespec in docs/features/<naam>.md volgens het vaste sjabloon, inclusief de verplichte sectie "Hergebruik & UX-patronen". Gebruik bij elke nieuwe feature of wijziging die een spec nodig heeft, vóór er code geschreven wordt.
---

# /spec — featurespec

## Actuele feiten

!`node scripts/kit/feiten.mjs conventies`

## Bestaande bouwstenen

!`node scripts/kit/catalogus.mjs componenten`

## Sjabloon

Schrijf `docs/features/<naam>.md` (kleine letters, streepjes) met precies deze
koppen. Laat geen kop weg; schrijf "n.v.t. — reden" als iets niet speelt.
Ontbreekt een antwoord: vraag het aan Bram, vul geen aanname in.

```markdown
# <Titel>

Status: **voorstel**

## Doel
## Betrokken shell(s)
bar | portal | beide (via gedeeld component) — en waarom.
## Datamodel
Nieuwe of gewijzigde tabellen/kolommen; grants expliciet (geen auto-expose).
## RPC's
Nieuw of bestaand; klasse (client/server/intern); guard; foutcodes.
Raakt het geld: welke `*_once`-RPC, en hoe de regel "de client stuurt nooit
een bedrag dat de server gebruikt" blijft gelden.
## Rolzichtbaarheid
Lid / bardienst / beheerder: wie ziet en doet wat.
## Hergebruik & UX-patronen
- Componenten uit de catalogus: <welke, met variant>; nieuw alleen met reden.
- Staten per scherm: laden, leeg, fout, pending, succes, verouderd — tekst en
  gedrag voor elk.
- Copy: elke zichtbare tekst letterlijk (Nederlands).
- Toon en shell: `tone`, `useShell()`-velden die het scherm leest.
- Toegankelijkheid: focusvolgorde, toetsenbord, waar foutmeldingen landen.
## Randgevallen
Tabel: situatie → gedrag → foutcode/tekst.
## Tests
Negatieve test per policy en per weigergrond; e2e/a11y-punten.
## Expliciet buiten scope
```

Raakt de spec een nieuwe architectuurbeslissing: schrijf de ADR erbij
(`Status: **voorstel**`, volgende vrije nummer hierboven). Geef daarna beide
aan Bram; alleen hij zet `goedgekeurd`.
