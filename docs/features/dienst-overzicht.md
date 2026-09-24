# Dienst-scherm gelijkgetrokken met het ontwerp

Scope door Bram vastgesteld op 2026-09-24, in de sessie waarin dit gebouwd
werd ("ik wil dat je 'dienst' gaat gelijktrekken met het design"): layout
met rail, omzetkaart en een alleen-lezen transactielijst. Terugdraaien en
correcties komen later als apart ticket.

Bron: `designs/Bar App.dc.html`, het `isShift`-scherm (regel 132–215 voor
het hoofdvlak, 340–371 voor het rechterpaneel) en de rail (regel 39–57,
stijlen `navStyle`/`navBar` op regel 2988).

## Betrokken shell

Alleen `shells/bar`. Nieuwe featuremap `src/features/dienst-overzicht/`
(`DienstOverzicht.tsx`, `Transactielijst.tsx`, `ledger.ts`). Die vervangt
`src/features/bezetting-beheren/DienstActief.tsx`. `BezettingOverlay` en
`DienstAfsluitenOverlay` worden ongewijzigd hergebruikt.

## Datamodel en RPC's

**Geen schemawijziging, geen nieuwe RPC.** Eén nieuwe leeshook:

- `useShiftLedger(shiftId)` doet twee platte `select`s op `orders` (met
  `order_lines` → `products.name`) en `top_ups`, beide met de naam van het
  lid en van `served_by`. Het resultaat is gesorteerd, nieuwste eerst.
  Bedragen komen ongewijzigd uit de database. `orders`/`top_ups` hebben
  elk twee FK's naar `members`, dus de embeds zijn per kolom benoemd
  (`members!member_id`, `members!served_by`). Leesrecht volgt uit de
  bestaande `_select`-policies (0015: niet-lid-rollen lezen alles).

De omzetkaart gebruikt de bestaande `useShiftSummary()`, dezelfde cijfers
die het afsluit-overzicht toont.

## Navigatie

De tabbalk uit #8 is vervangen door de donkere icon-rail uit het ontwerp:
het "A"-merk, de badge "DIENST", en de tabs Verkoop en Dienst (nog steeds
`role="tab"`, verticale `tablist`). Verkoop blijft de standaard. Het
"Afsluiten"-item onderaan de rail uit het ontwerp is weggelaten: de
gedeelde bar-sessie kent geen modus om uit te stappen. Een dienst sluit je
af via het Dienst-scherm.

## Schermflow

**Kop:** de titel "Dienst" met een bezettingschip (maximaal drie
initialen, "Tom +1", en een "+"). Een tik op de chip opent
`BezettingOverlay`.

**Omzetkaart (donker):** "OMZET DEZE DIENST" met het omzettotaal (alles
op rekening) en de activiteit ernaast. Daaronder de kaartjes BESTELLINGEN
en OPGEWAARDEERD. Het ontwerp toont hier "PIN VERKOOP" en "OP REKENING";
pinverkoop bestaat niet (verkoop.md → Besloten), dus die kaart vervalt, en
"op rekening" zou gelijk zijn aan het totaal.

**Transactielijst:**
- Zoekveld "Zoek op naam of product". Het zoekt op lidnaam, productnaam en
  soort boeking.
- Filter "geboekt door" (Iedereen plus iedereen die in deze dienst iets
  boekte, met aantallen), als uitklaplijst zoals in het ontwerp.
- De segmentfilter Alles/Geld/Assortiment uit het ontwerp vervalt. Er is
  geen log van assortimentswijzigingen, en zonder Assortiment is "Geld"
  gelijk aan "Alles".
- Boekingen zijn gegroepeerd per uur ("21:00 – 22:00", met omzet en
  aantal bestellingen van dat uur).
- Een regel toont: tijd, soort (VERKOOP/OPWAARDERING), initialen van wie
  boekte (alleen bij meer dan één persoon in de bezetting), lid, "N items"
  of "opgewaardeerd · contant", en het bedrag ("− €" voor verkoop,
  "+ €" in groen voor opwaardering).

**Rechterpaneel:** de starter van de dienst, "sinds HH:MM · duur" (de duur
wordt elke 30 seconden bijgewerkt), en de activiteit als pil. Daaronder
BEZETTING met per persoon het aantal bonnen (bestellingen met die persoon
als `served_by`) en de knop "wijzigen". Onderaan de zwarte knop "dienst
afsluiten", die `DienstAfsluitenOverlay` opent.

## Expliciet buiten scope

- **Terugdraaien/correcties** (ontwerp: ⤺ per verkoopregel, "N correcties
  deze dienst"). Dat vraagt een nieuwe geld-RPC, en daarmee een eigen spec
  en negatieve tests. Het wordt een apart ticket.
- Pinverkoop en pin-/Tikkie-opwaarderingen: bestaan niet.
- De bezettingschip in de kop van het Verkoop-scherm. Verkoop is
  ongewijzigd, op de rail na.

## Randgevallen

- Geen boekingen: "Nog niets geboekt deze dienst". Zoeken zonder
  resultaat: "Niets gevonden voor “…”".
- Een verkoop zonder lid (`member_id` null; bouwt de app vandaag niet)
  toont "Losse verkoop".
- Laad- en foutstatus per blok (omzetkaart, bezetting, lijst). De
  foutteksten zijn vaste Nederlandse meldingen, nooit de ruwe fout.
- **A11y:** `e2e/a11y.spec.ts` scant het scherm zonder dialoog, en de
  uitklaplijst in open toestand als er boekingen zijn. Nieuwe
  kleurtokens (`ink.soft`, `rail.accent`/`badge`/`value`) staan met hun
  contrast toegelicht in `tailwind.config.ts`.
