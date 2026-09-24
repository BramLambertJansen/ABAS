# Dienst-scherm: transactielijst, bonnen en duur

Scope door Bram vastgesteld op 2026-09-24 ("ik wil dat je 'dienst' gaat
gelijktrekken met het design"): layout met rail, omzetkaart en een
alleen-lezen transactielijst. Terugdraaien en correcties komen later als
apart ticket.

De rail, de bezettingspil, de omzetkaart en het rechterpaneel zijn
tegelijk gebouwd in #83 ("Bar-UI in lijn met het ontwerp") en staan in
`DienstTabs.tsx`, `BezettingPil.tsx` en `DienstActief.tsx`. Deze feature
(#82) voegt daar toe wat #83 bewust openliet: de transactielijst, het
aantal bonnen per persoon en de duur van de dienst.

Bron: `designs/Bar App.dc.html`, het `isShift`-scherm (regel 132–215 voor
het hoofdvlak, 340–371 voor het rechterpaneel).

## Betrokken shell

Alleen `shells/bar`. De nieuwe featuremap `src/features/dienst-overzicht/`
bevat `Transactielijst.tsx` en `ledger.ts` (pure logica, getest in
`test/ledger.test.ts`). `DienstActief.tsx` gebruikt ze.

## Datamodel en RPC's

**Geen schemawijziging, geen nieuwe RPC.** Eén nieuwe leeshook:

- `useShiftLedger(shiftId)` doet twee platte `select`s op `orders` (met
  `order_lines` → `products.name`) en `top_ups`, beide met de naam van het
  lid en van `served_by`. Het resultaat is gesorteerd, nieuwste eerst.
  Bedragen komen ongewijzigd uit de database. `orders`/`top_ups` hebben
  elk twee FK's naar `members`, dus de embeds zijn per kolom benoemd
  (`members!member_id`, `members!served_by`). Leesrecht volgt uit de
  bestaande `_select`-policies (0015: niet-lid-rollen lezen alles).

## Schermflow

**Transactielijst** (onder de omzetkaart):
- Zoekveld "Zoek op naam of product". Het zoekt op lidnaam, productnaam en
  soort boeking.
- Filter "geboekt door" (Iedereen plus iedereen die in deze dienst iets
  boekte, met aantallen), als uitklaplijst zoals in het ontwerp.
- De segmentfilter Alles/Geld/Assortiment uit het ontwerp vervalt. Er is
  geen log van assortimentswijzigingen, en zonder Assortiment is "Geld"
  gelijk aan "Alles".
- Boekingen zijn gegroepeerd per lokaal uurvak ("21:00 – 22:00", met omzet
  en aantal bestellingen van dat uur). De groepering gebruikt datum, uur
  en UTC-offset, zodat een dienst van meer dan 24 uur of het dubbele uur
  bij wintertijd geen uren samenvoegt.
- Een regel toont: tijd, soort (VERKOOP/OPWAARDERING), initialen van wie
  boekte (alleen bij meer dan één persoon in de bezetting), lid, "N items"
  of "opgewaardeerd · contant", en het bedrag ("− €" voor verkoop,
  "+ €" in groen voor opwaardering).

**Rechterpaneel:**
- Bij de starter staat naast "gestart om HH:MM" de duur van de dienst.
  Die wordt elke 30 seconden bijgewerkt.
- Onder BEZETTING staat per persoon het aantal bonnen: bestellingen met
  die persoon als `served_by`. Opwaarderingen tellen niet mee.
- De activiteitspil heeft een maximale breedte en kapt een lange naam af;
  de volledige naam staat in `title`.

## Expliciet buiten scope

- **Terugdraaien/correcties** (ontwerp: ⤺ per verkoopregel, "N correcties
  deze dienst"). Dat vraagt een nieuwe geld-RPC, en daarmee een eigen spec
  en negatieve tests. Het wordt een apart ticket.
- Pinverkoop en pin-/Tikkie-opwaarderingen: bestaan niet.

## Randgevallen

- Geen boekingen: "Nog niets geboekt deze dienst". Zoeken zonder
  resultaat: "Niets gevonden voor “…”".
- Een verkoop zonder lid (`member_id` null; bouwt de app vandaag niet)
  toont "Losse verkoop".
- De lijst heeft een eigen laad- en foutstatus. De fouttekst is een vaste
  Nederlandse melding, nooit de ruwe fout.
- **A11y:** `e2e/a11y.spec.ts` rekent eerst één bestelling af en scant dan
  het Dienst-scherm zonder dialoog, en daarna de uitklaplijst in open
  toestand.
