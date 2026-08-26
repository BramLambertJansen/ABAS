# Verbetering zonder functionaliteiten

_Started 2026-07-31 22:52 UTC_

---

## User

zonder functionaliteiten toe te voegen - hoe zou je dit verbeteren

## Assistant

_[tool: read_file]_

Kritiek op wat er staat (geen nieuwe features):

**Echte bugs**
- De `accent`-tweak werkt maar half: knop "inloggen", de link "alles", de laag-saldo-kaart en de links in de helmet zijn hardcoded `#ee5a24`. Accent wisselen geeft een inconsistente app.
- Elke lijstrij heeft `border-bottom` → zwevende streep onder de laatste rij van elke kaart.
- Tab-bar-items zijn ~34px hoog; onder de 44px minimum tikdoelgrootte.
- Meta-tekst 11.5px in `#aca69e` op wit ≈ 2.4:1 contrast — te licht om te lezen.

**Hiërarchie**
- Bijna alles is weight 700/800. Als álles vet is, is niets belangrijk. Body/meta naar 500–600, alleen bedragen en koppen op 800.
- Radii (14/15/16/18/24/26) en fontgroottes (11/11.5/12/12.5/13/13.5/14/14.5) zijn ruis. Terug naar ~4 stappen elk maakt het meteen "ontworpen" i.p.v. handmatig getweakt.

**Redundantie schrappen**
- Drie routes naar transacties op één scherm (chevron in saldokaart, "alles", tab). Houd er één — de tab.
- De twee statkaartjes ("deze maand besteed" / "bestellingen") herhalen wat de lijst eronder al toont. Weg = rustiger scherm, saldo wordt echt de held.
- De gekleurde bolletjes in de lijst dragen niets: het bedrag (+ groen / − zwart) zegt het al.

**Consistentie**
- Saldo-scherm toont per rij alleen de datum, transactiescherm datum + omschrijving. Zelfde rij, zelfde inhoud.
- Buttons lowercase, koppen sentence case. Kies één.
- Ingevuld wachtwoord met bullets op het loginscherm leest als een bug; laat het leeg of gebruik echte demo-tekst.

Zeg maar welke hiervan ik doorvoer — de bugs + hiërarchie is de kleinste ingreep met het grootste verschil.

## User

Go!

## Assistant

_[tool: dc_write]_

_[tool: ready_for_verification]_

Doorgevoerd: accent stuurt nu álles aan (logo, knoppen, laag-saldo-kaart, pin-dots, toggle), geen zwevende randen meer onder laatste rijen, tab-items 48px, meta-tekst donkerder (#7c766e), één type/radius-schaal, statkaartjes + bolletjes + dubbele routes naar transacties weg, saldo-rijen tonen nu dezelfde info als het transactiescherm, sentence case overal, leeg wachtwoordveld bij login.

