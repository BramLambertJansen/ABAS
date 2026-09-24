# Bestelling terugdraaien

Beslissingen door Bram, 2026-09-24. Dit vult in wat bij het Dienst-scherm
(`docs/features/dienst-overzicht.md`) bewust buiten scope bleef.

## Besloten

- **Alleen een hele bestelling terugdraaien**, met een verplichte reden.
  Geen vrije saldocorrectie ("bij/af met een bedrag"), dus CLAUDE.md "er
  is geen saldocorrectie in de app" blijft staan. Geen deelterugdraaiing:
  wie 2 van de 3 wil laten staan, tikt die opnieuw aan de bar.
- **Bar (gedeelde tablet):** tijdens een open dienst, alleen voor een
  bestelling van **die dienst**, via ⤺ in de transactielijst. Wie het deed
  wordt gekozen uit de actieve bezetting, precies zoals `served_by` bij
  afrekenen. De RPC weigert iedereen die niet in de bezetting staat. Geen
  PIN.
- **Beheer (/beheer, eigen e-mailsessie, ADR 0002):** een beheerder mag
  **elke** bestelling terugdraaien, ook uit een afgesloten dienst, via
  Leden → lid beheren → "Bestelling terugdraaien".
- **Omzet:** een teruggedraaide bestelling telt nergens meer mee: niet in
  de omzetkaart, niet bij "dienst afsluiten", niet in de omzet per uur en
  niet bij de bonnen per persoon. Draait een beheerder later een bestelling
  uit een afgesloten dienst terug, dan daalt de omzet van die dienst dus
  achteraf. De bestelling zelf blijft zichtbaar, doorgestreept, met
  "TERUG" en de reden.

## Datamodel — `0020_bestelling_terugdraaien.sql`

Nieuwe geldtabel `order_reversals`, waarin alleen wordt toegevoegd:

- `order_id`: de primary key, dus een bestelling kan hooguit één keer
  worden teruggedraaid. Dat garandeert de database zelf.
- `reason`: 1–200 tekens na trimmen.
- `reversed_by`: het lid dat terugdraaide.
- `via`: `bar` of `beheer`.
- `shift_id`: de open dienst bij `via = 'bar'`, anders `null`.
- `refunded_cents`: wat er werkelijk is teruggeboekt. Bij een bestelling
  zonder lid is dat 0.

De bestelling zelf (`orders`, `order_lines`) wordt nooit gewijzigd.

RLS en rechten:
- **Lezen:** hetzelfde als `orders` (0015). Niet-lid-rollen en de gedeelde
  device-sessie lezen alles; een lid ziet alleen de terugdraaiingen van
  de eigen bestellingen.
- **Schrijven:** `insert`, `update` en `delete` zijn REVOKED. Schrijven kan
  alleen via de RPC's. `check:rls` telt de tabel mee als geldtabel.

## RPC's

Beide RPC's werken hetzelfde af:
- ze lezen het bedrag uit `orders.total_cents` en boeken het terug op
  het lid, ook als dat lid inmiddels gearchiveerd is;
- ze voegen de reversal-rij toe;
- ze geven die rij terug.

Ze zetten een rij-lock op de bestelling, zodat twee gelijktijdige
aanroepen voor dezelfde bestelling op elkaar wachten.

| RPC | Wie | Controles, in volgorde |
|---|---|---|
| `reverse_order_at_bar(p_order_id, p_shift_id, p_reason, p_reversed_by)` | de gedeelde bar-sessie | `shift_not_open` → `order_not_found` → `order_not_in_shift` → `reversed_by_not_on_shift` → `reason_required` / `reason_too_long` → `already_reversed` |
| `reverse_order_as_admin(p_order_id, p_reason)` | een beheerder via `auth.uid()` | `actor_not_found` / `no_admin_role` → `order_not_found` → `reason_required` / `reason_too_long` → `already_reversed` |

De client stuurt nooit een bedrag. EXECUTE heeft alleen `authenticated`
(zelfde patroon als 0018).

## Schermflow

**Bar — Dienst-scherm:**
- Een verkoop die nog niet is teruggedraaid heeft een ⤺-knop, met als
  toegankelijke naam "Bestelling terugdraaien: {lid}, {tijd}, {bedrag}".
- Die opent de overlay "Bestelling terugdraaien" met:
  - lid, tijd, items en bedrag;
  - een verplicht redenveld;
  - "Wie draait terug?" (`BezettingKeuze`, alleen bij twee of meer mensen
    in de bezetting);
  - de knoppen "annuleren" en "terugdraaien".
- Na succes: een toast "Bestelling teruggedraaid · €x", en de lijst en de
  omzet worden opnieuw opgehaald.
- Het paneel toont "N correcties deze dienst" zodra N > 0.

**Beheer — Leden → lid beheren → "Bestelling terugdraaien":**
- Een overlay met het label "BEHEERDER", een redenveld en de laatste 50
  bestellingen van het lid, uit alle diensten, nieuwste eerst.
- Een tik op een rij klapt een bevestiging open ("Terugdraaien zet €x terug
  op het saldo van {lid}."). Zonder reden kan er niet worden bevestigd.
- Teruggedraaide rijen tonen "teruggedraaid" en zijn niet meer aan te tikken.
- Sluiten gaat terug naar de ledenlijst, die het nieuwe saldo laadt.

## Foutcodes → melding

Vaste teksten in `src/features/bestelling-terugdraaien/messages.ts`:

| Code | Melding |
|---|---|
| `shift_not_open` | deze dienst is al afgesloten — terugdraaien kan nu alleen nog via beheer |
| `order_not_in_shift` | deze bestelling hoort niet bij de open dienst — terugdraaien kan alleen via beheer |
| `reversed_by_not_on_shift` | wie terugdraait staat niet (meer) in de bezetting — kies opnieuw (de keuze wordt gewist en de bezetting opnieuw opgehaald) |
| `actor_not_found` | je sessie hoort niet bij een lid — log opnieuw in |
| `no_admin_role` | alleen een beheerder kan dit doen |
| `order_not_found` | deze bestelling bestaat niet meer (de lijst wordt opnieuw opgehaald) |
| `reason_required` | vul een reden in |
| `reason_too_long` | de reden mag maximaal 200 tekens zijn |
| `already_reversed` | deze bestelling is al teruggedraaid (de lijst wordt opnieuw opgehaald) |
| anders | er ging iets mis, probeer het opnieuw |

## Gedeeld component

`src/components/BezettingKeuze.tsx` is de "wie geeft uit?"-keuze. Die
stond eerst als kopie in zowel `AfrekenenOverlay` als `OpwaarderenOverlay`,
en is nu gedeeld door die twee en `TerugdraaienOverlay`.

## Tests

- **`supabase/tests/reverse_order.test.sql`:** het bedrag is exact
  `total_cents`, één keer, bij beide RPC's. Elke foutcode heeft een
  negatieve test, en er is een grenstest op 200/201 tekens. Een
  gearchiveerd lid krijgt het bedrag ook terug, en de bestelling zelf blijft
  ongewijzigd.
- **Uitbreidingen:**
  - `rls_write_protection.test.sql`: insert, update en delete op
    `order_reversals` worden geweigerd;
  - `rls_lid_eigen_rijen.test.sql`: een lid ziet alleen de eigen
    terugdraaiingen, een bardienst ziet alles;
  - `rpc_execute_grants.test.sql`: beide RPC's zijn alleen voor
    `authenticated`.
- **`test/ledger.test.ts`:** teruggedraaide bestellingen tellen niet mee
  in de omzet per uur en de bonnen.
- **`e2e/a11y.spec.ts`:** de bar-flow tegen de echte RPC: afrekenen → ⤺ →
  overlay scannen → terugdraaien → "TERUG" en het correctieblok.
- **`e2e/bestelling-terugdraaien.spec.ts`:** de beheer-flow, gemockt. Er
  gaan alleen order-id en reden mee, bevestigen kan niet zonder reden, de
  foutmelding klopt, en de overlay wordt met axe gescand.

## Expliciet buiten scope

- Vrije saldocorrectie (bij/af met een zelf ingetypt bedrag).
- Een terugdraaiing ongedaan maken. Er is geen RPC voor, en `delete` is
  REVOKED.
- Deelterugdraaiing per regel of aantal.
- Het transactieoverzicht voor leden in het portaal. Het leesrecht staat al
  klaar (RLS hierboven), het scherm bestaat nog niet.
- Een audit-log- of Logboek-scherm. De reversal-rij zelf is het spoor.
