---
name: nieuw-scherm
description: Bouw een nieuw scherm of een nieuwe overlay in een ABAS-feature (src/features) vanuit een goedgekeurde spec, met hergebruik uit de catalogus, alle staten (laden/leeg/fout/pending/succes/verouderd) en toegankelijkheid. Gebruik bij de eerste bouw van een scherm.
---

# /nieuw-scherm

## Bouwstenen

!`node scripts/kit/catalogus.mjs`

## Stappen

1. **Spec**: lees `docs/features/<naam>.md` (status `goedgekeurd`), vooral
   "Hergebruik & UX-patronen". Ontbreekt een staat of tekst: vraag het.
2. **Wireframe**: eerste bouw → `/designs/` (`Bar App.dc.html` /
   `Lid App.dc.html`, live op `/design`). Daarna is het in-app design system
   leidend.
3. **Plaats**: `src/features/<feature>/`. Een feature importeert geen shell
   en geen Supabase-client; data via een hook uit `src/hooks/queries/`.
4. **Staten**: render elke staat uit de spec. Leesfout zonder data →
   `LeesFout`; verversfout met data → `VerversStatus`; onbekende
   geld-uitkomst → `OnbekendeUitkomstMelding`/`GeldActieHerstel`.
5. **Dialoog**: altijd `Overlay`; nooit twee overlays tegelijk.
6. **Knoppen en velden**: uit de catalogus (`knopStijlen.ts`, `TekstVeld`,
   `ZoekVeld`, `Select`, …). Geen gekopieerde klasseketen; ontbreekt een
   variant → `/nieuw-component`.
7. **Bedragen**: alleen weergeven (`formatCents`). Een subtotaal ter
   weergave mag; het bevestigde totaal komt uit de RPC.
8. **Toegankelijkheid** vanaf de eerste regel; de Tester voegt het scherm toe
   aan de axe-scan in `e2e/`.
9. Draai `npm run check:fast`.
