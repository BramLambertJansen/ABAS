# Pending-E2E voor de overige `closeBlocked`-overlays

**Status: akkoord van Bram (2026-10-06): alle zeven aanbevelingen uit "Vragen voor Bram" overgenomen.**

Spec voor [issue #140](https://github.com/BramLambertJansen/ABAS/issues/140),
vervolg op #125 (PR #139, `docs/features/dialogen-tabs-landmarks.md` →
"Gebouwd, afwijkingen en wat niet gedaan is", regel over pending-E2E) en
epic #121. Alleen testwerk: geen productwijziging, geen datamodel, geen RPC,
geen ADR. Een test die een echt gat vindt wordt een bevinding in de PR en een
apart ticket, geen stille productfix (zie "Productbevindingen").

## Doel

Elke overlay die het gedeelde `closeBlocked`-contract van `Overlay` gebruikt
heeft een gemockte E2E-test die bewijst dat sluiten geblokkeerd is zolang de
actie loopt. Nu hebben alleen Afrekenen
(`e2e/dialogen-tabs-landmarks-negatief.spec.ts`, "Afrekenen pending") en de
beheer-terugdraaiflow (zelfde bestand, "geldmutatie: geblokkeerde
sluitpogingen"; `e2e/dialogen-tabs-landmarks.spec.ts`) zo'n test.

Het contract per overlay (uit het ticket):

- **(a)** Escape, backdrop en de sluitknop sluiten niet zolang de actie loopt;
  `aria-busy="true"` staat op de dialoog; na een poging toont
  `p[role="status"]` "Even wachten, de actie wordt nog verwerkt." (en vóór een
  poging is die regio leeg).
- **(b)** Precies één request, ook na herhaalde sluitpogingen (Escape en
  backdrop meermaals, geforceerde klik op de disabled knoppen).
- **(c)** De focus blijft in de dialoog: de knop die je klikte wordt disabled,
  de container krijgt focus (`toBeFocused()` op de dialoog), Tab en Shift+Tab
  blijven binnen.
- **(d)** Na afloop is sluiten weer mogelijk (Escape sluit, `aria-busy` weg,
  de regio weer leeg).

## Betrokken shell

Alleen `shells/bar` (alle vijf zijn bar-overlays; Afmelden staat in beheer-modus
van de bar-shell, ADR 0016). Geen portal. Geen raakvlak met de geldlaag-regels
voor het testwerk zelf; Opwaarderen en Terugdraaien raken geld, dus de test
bewaakt daar mee dat de client geen bedrag meestuurt (CLAUDE.md "Geld beweegt
alleen via RPC": alleen id's, aantal of opwaardeerbedrag, nooit een totaal).

## Gelezen bronnen

- **Ticket #140**, de spec `dialogen-tabs-landmarks.md` (Pending-contract,
  Teststrategie punt 5, 7 en "Gebouwd") en `opslaan-sluiten-pending.md`.
- **Code:** `src/components/Overlay.tsx` (`closeBlocked`, melding, focus-herstel
  naar de container, `aria-busy`, eigen "Sluiten"-knop disabled), de vijf
  overlays en hun hooks, de ingangen (`UitloggenKnop`, `DienstElders`,
  `AdminMeldingen`, `DienstenApparaten`, `DienstActief` met
  `Transactielijst`).
- **E2E:** alle bestanden in `e2e/` en `e2e/helpers/` (hieronder wat bruikbaar
  is). Geen wireframewijziging; geen visuele eis.
- **Kaders:** `CLAUDE.md` (gates, "Componenten zijn herbruikbaar" geldt hier
  ook voor testhelpers), ADR 0014, ADR 0016, ADR 0024 (`*_once`-RPC's).

## Wat al gedekt is (niet dupliceren)

| Overlay | Bestaande dekking | Gat voor #140 |
|---|---|---|
| Afrekenen | Volledig: `dialogen-tabs-landmarks-negatief.spec.ts` ("Afrekenen pending") en `opslaan-sluiten-pending-aanvulling.spec.ts` | Geen. Buiten dit ticket. |
| Lid-bestellingen / terugdraaien in **beheer** | Volledig: `dialogen-tabs-landmarks-negatief.spec.ts` ("geldmutatie: ...") en `dialogen-tabs-landmarks.spec.ts` | Geen. |
| **Opwaarderen** | Deels: `opslaan-sluiten-pending-aanvulling.spec.ts` "Opwaarderen: geen time-out voor geld" dekt `aria-busy`, Escape, backdrop, disabled "annuleren", één `top_up_once`-aanroep, en dat de dialoog sluit na het antwoord (ook na 30 s pending). Onbekende-uitkomstflow en focus na "Ik heb gecontroleerd" ook gedekt. | De `role="status"`-melding na een poging, de disabled "Sluiten"-knop, focus op de container, Tab/Shift+Tab binnen de dialoog en herhaalde pogingen na de eerste ontbreken; (d) na een mislukking is niet getoetst. Alleen die delta toevoegen, de bestaande test blijft staan. |
| **Dienst afsluiten** | Niets voor pending. Wel geopend in `dienst-te-lang-open.spec.ts` (annuleren, afsluiten vanuit de melding, geen pending-vertraging). | Alles. |
| **Overnemen** | Niets (`dienst-hervatten.spec.ts` toetst alleen Hervatten en de afwezigheid van de knop). | Alles. |
| **Afmelden** | Niets. | Alles. |
| **Bar-TerugdraaienOverlay** | Alleen echte backend in `a11y.spec.ts` (axe + één geslaagde terugdraai). Geen mock-spec, geen pending. | Alles. |

## Aanpak

### Nieuw bestand en gedeelde helper

Nieuw bestand `e2e/overlays-pending-sluiten.spec.ts` (naamgeving naar
`*-aanvulling`/`-negatief`; de bestaande bestanden zijn al groot). De vijf
overlays doen exact dezelfde assertiereeks, dus één gedeelde assertiefunctie
in plaats van vijf kopieën (CLAUDE.md: duplicatie is een reviewfout):

- `e2e/helpers/pendingOverlay.ts`:
  - `houdVast()` (nu lokaal in `opslaan-sluiten-pending-aanvulling.spec.ts`
    regel 30, daar verplaatsen en importeren; zuivere verplaatsing).
  - `expectGeblokkeerdTijdensPending(page, dialog, { bevestig, aanroepen })`:
    leest dat `p[role="status"]` bestaat en leeg is, klikt `bevestig`, asserteert
    `aria-busy`, `aanroepen() === 1`, disabled sluit-/annuleerknoppen,
    `dialog` focused, Tab/Shift+Tab binnen, drie keer Escape + backdrop
    (`page.mouse.click(5, 5)`, zoals het bestaande Afrekenen-patroon) +
    geforceerde klik op "Sluiten" en "annuleren", dan dialoog zichtbaar,
    status gelijk aan de standaardmelding, focus nog binnen, nog steeds één
    aanroep. Geen eigen kopie van de focusindexlogica; hergebruik
    `dialogFocusState` uit het negatief-bestand door die óók naar de helper te
    verplaatsen (geen gedragswijziging).
  - `expectSluitbaarNaPending(page, dialog)`: `aria-busy` weg, status leeg,
    Escape sluit, `dialog` count 0, `[inert]` count 0.
- Gedeelde omgevingen, ook naar `e2e/helpers/`:
  - `mockKassa` en `kiesLid` (nu `openKassa`/`kiesLid` in
    `opslaan-sluiten-pending-aanvulling.spec.ts`): voor Opwaarderen. Verplaatsen
    en importeren.
  - `mockBarDienst` (de lokale `openBar` in `dienst-hervatten.spec.ts`,
    `dienst-te-lang-open.spec.ts`, het negatief-bestand, plus `mockBarSessie`):
    voor Dienst afsluiten, Overnemen, Afmelden en Terugdraaien. Alleen
    nieuwe gebruikers hergebruiken het; de drie bestaande kopieën worden in dit
    ticket niet herschreven (zie vraag 1).
- `mockBarSessie` (`e2e/helpers/supabaseMock.ts`) krijgt één optie `admin`
  voor het beheeroverzicht (nu hardcoded `{ shifts: [], sessions: [] }`), voor
  Afmelden; zie vraag 3.

Fouten worden gesimuleerd met HTTP 400 en een PostgREST-fout
`{ code: "P0001", message: "<code>", details: null, hint: null }` (zoals
`resume_orphan_shift` al doet in `mockBarSessie`). Regel in de helper: **de
vertraging zit in de route** (`await vast.poort` vóór `json(...)`), niet in
`page.clock`, behalve waar al klok-gebruik bestaat. Elke test telt zelf de
aanroepen van de ene RPC; andere routes blijven direct.

### Per overlay

Elke overlay krijgt twee tests: **(1) geslaagd** (a, b, c, daarna sluit de
dialoog zelf en het gevolg is zichtbaar) en **(2) mislukt** (a, b, c, daarna
(d): de dialoog blijft open met de foutregel en is weer sluitbaar). Alleen bij
een mislukking blijft de dialoog open, dus alleen daar valt (d) te toetsen.

**1. Opwaarderen** (alleen delta)

- Ingang: `mockKassa` met `top_up`-handler; Anna kiezen; `opwaarderen` openen;
  "Ander bedrag" `5`; knop `boeken`.
- Vertraagde RPC: `POST /rest/v1/rpc/top_up_once` (ADR 0024; zie bestaande
  route-regex).
- Test 1: de gedeelde helper rond `boeken`, daarna succes (`{ amount_cents:
  500 }`) en de dialoog sluit. Payload bevat geen `amount_cents`-totaal buiten
  het ingetypte opwaardeerbedrag; geen berekend bedrag.
- Test 2: antwoord `400 insufficient_balance` of een andere bekende
  domeinfout (kies de code uit `OpwaarderenOverlay.tsx` bij bouw), de
  foutregel verschijnt, de dialoog is weer sluitbaar. Niet de
  onbekende-uitkomstflow (netwerkfout): die blokkeert bewust (besluit
  "geen time-out voor geld") en is al gedekt.
- Bestaande tests niet aanpassen of verplaatsen behalve de helperextractie.

**2. Dienst afsluiten**

- Ingang A (eigen, `end_shift`): `mockBarDienst` als bardienst met eigen
  dienst; `Uitloggen` → keuzedialoog "Je dienst loopt nog" → "Dienst afsluiten"
  → `getByRole("dialog", { name: "Dienst afsluiten" })` (selector zoals in
  `dienst-te-lang-open.spec.ts`).
  Alternatief kortere ingang: de knop "Dienst afsluiten" op het Dienst-tab
  (`dienst-te-lang-open.spec.ts` regel 285). Dat is de aanbevolen ingang
  (geen tussenstap); de Uitloggen-ingang valt buiten dit ticket.
- Ingang B (beheerder, `admin_end_shift`): twee ingangen zijn bij `variant
  = "beheerder"` aanwezig (`DienstElders`, `AdminMeldingen`,
  `DienstenApparaten`). Aanbeveling: één ingang kiezen. Eén variant volstaat
  voor het contract, want de pending-regel zit in dezelfde regel code
  (`closeBlocked={pending}` met `pending` uit twee hooks). Wel een
  aparte, korte test voor de beheerder-variant, omdat `pending` daar uit een
  andere hook komt (anders zou een foute koppeling van `pending` aan
  `eigenAfsluiten` onopgemerkt blijven). Ingang: `DienstElders` (bar-modus,
  `otherShift`, rol beheerder; knop "Afsluiten").
- Vertraagde RPC: `end_shift` (A), `admin_end_shift` (B).
- Bevestigknop: `getByRole("button", { name: "dienst afsluiten", exact: true })`
  (kleine letters; `bezig…` tijdens pending).
- Test 1 (A): na vrijgave sluit de dialoog en het scherm gaat naar "dienst
  starten" (`dienstGesloten = true` en `shifts`-route `null`, zoals in
  `dienst-te-lang-open.spec.ts` regel 357); `end_shift` precies één keer met
  `{ p_shift_id }`.
- Test 2 (A): `500` zonder code → "er ging iets mis, probeer het opnieuw" in
  `role="alert"`; `annuleren` weer enabled; Escape sluit.
- Test 3 (B): zelfde als 1 en 2, samen in één test: geslaagd en `shift_not_open`
  → "deze dienst is al afgesloten"; één helper-aanroep per pad.
- De overzichtslezingen (`orders`/`top_ups`/`shift_members`) komen uit de
  algemene mock als `[]`; zij zijn niet vertraagd en niet het onderwerp.

**3. Overnemen**

- Ingang: beheerder in bar-modus met `otherShift` (`orphan: false/true`,
  `inBezetting: false`), `mockBarSessie({ rol: "beheerder",
  voorgeregistreerd: "bar", bevestigd: true, otherShift })`; scherm "Er loopt
  al een dienst" → knop "Overnemen" (exact) → dialoog "Dienst overnemen?".
  (De titel in de dialoog is "Dienst overnemen?", de knop in de dialoog
  "Overnemen"; selecteer binnen de dialoog.)
- Vertraagde RPC: `admin_take_over_shift`.
- Let op: de bevestigknop heeft geen "bezig…"-label; er is dus geen zichtbare
  pendingtekst. De test toetst `aria-busy`, disabled-staat en focus, niet een
  label. Zie vraag 5.
- Test 1: na vrijgave sluit de dialoog, toast "Dienst overgenomen"
  (`role="status"`), precies één aanroep met `{ p_shift_id }`. Mockstaat van
  `my_bar_state` mag na `herlaad()` ongewijzigd blijven; de test toetst alleen
  de overlay en de toast, niet de overgang naar de dienst.
- Test 2: `shift_not_open` → "deze dienst is al afgesloten", dialoog blijft
  open, weer sluitbaar. `sessie.ververs()` wordt aangeroepen na de fout
  (`my_bar_state` een tweede keer opgevraagd); toets dat de dialoog daardoor
  niet verdwijnt zolang de mock `otherShift` blijft leveren.

**4. Afmelden**

- Ingang: beheerder in beheer-modus (`loginMetWachtwoord`, knop "Beheer",
  zoals in `dienst-te-lang-open.spec.ts` regel 396), tab "Diensten" in
  `Beheer-navigatie`, rij onder "Ingelogd" met `is_own: false`, knop
  `Afmelden: <naam>` (aria-label), dialoog "Apparaat afmelden?". Dit vraagt de
  `admin`-optie op `mockBarSessie` (vraag 3).
- Vertraagde RPC: `admin_end_bar_session` met `{ p_bar_session_id }`.
- Let op: net als Overnemen geen "bezig…"-label.
- Test 1: sluit na vrijgave, toast "Apparaat afgemeld", één aanroep.
- Test 2: foutcode `target_session_ended` (een bekende code uit
  `useAdminEndBarSession`; de overlay toont dan `foutOverig`, "er ging iets mis,
  probeer het opnieuw"; controleer bij bouw welke tekst klopt) → dialoog open,
  weer sluitbaar. Let op: `sessie.ververs()` loopt nu ook na een succes
  (`AfmeldenOverlay.bevestig`), dus toets dat de toast niet verdwijnt door het
  verversen.

**5. Bar-`TerugdraaienOverlay`**

- Ingang: bardienst met eigen dienst (`mockBarDienst`), Dienst-tab, ledger via
  de REST-route `orders` met de nested vorm die `useShiftLedger` leest
  (`id, created_at, total_cents, served_by, member:{name}, server:{name},
  order_lines:[{ qty, products:{name} }], order_reversals: []`) en
  `top_ups: []`. De ⤺-knop heeft `aria-label` `Bestelling terugdraaien: Anna de
  Vries, ...`; selecteer met `getByRole("button", { name: /^Bestelling
  terugdraaien: Anna de Vries/ })`. Eén bezettinglid in de bezetting
  (zoals `a11y.spec.ts`), dus geen "Wie draait terug?"-keuze; een tweede test
  met twee leden is niet nodig voor dit ticket.
- Vul "Reden" in; de knop `terugdraaien` is dan enabled.
- Vertraagde RPC: `reverse_order_at_bar`; payload bevat alleen order-id,
  shift-id, reden en `reversed_by`, geen bedrag (zelfde assertie als het
  beheerpatroon).
- Test 1: na vrijgave (`{ refunded_cents: 750 }`) sluit de dialoog, toast
  "Bestelling teruggedraaid · € 7,50" (`DienstActief`), één aanroep.
- Test 2: `already_reversed` → vaste melding uit
  `bestelling-terugdraaien/messages`, dialoog open, weer sluitbaar. Zonder
  extra `orders`-refetch-mock blijft de ledger gelijk; dat is genoeg.

## Productbevindingen om te verwachten

Geen verwachte productbug; de contractregel zelf is in #125 bewezen voor
Afrekenen en beheer-terugdraaien. Waar de tests een gat zouden kunnen vinden,
en wat te doen (bevinding in de PR, apart ticket, geen productfix in deze PR):

1. **Focus (c) bij Overnemen/Afmelden/Dienst afsluiten.** De bevestigknop
   wordt disabled en heeft geen "bezig…"-tekst. De Overlay-effecten (focus
   terug naar de container) werken op disabled-detectie en kunnen in
   Chromium net anders uitpakken dan bij Afrekenen. Test toetst `toBeFocused`
   op de dialoog (poll, niet direct); valt dit om, dan is dat een
   Overlay-bug, geen testprobleem.
2. **`sessie.ververs()`/`herlaad()` tijdens pending.** Overnemen en Afmelden
   roepen na de actie de sessiestaat opnieuw op. Als een poll (30 s,
   `STATE_POLL_INTERVAL_MS`) of de actie zelf de ouder doet unmounten
   terwijl de RPC nog loopt (bijv. de dienst is intussen weg uit
   `my_bar_state`), verdwijnt de dialoog ondanks `closeBlocked`. Dit is niet
   in de zeven tests te reproduceren zonder klokgebruik en valt buiten dit
   ticket; wel noteren als de bouw dit tegenkomt.
3. **Geen zichtbare pendingtekst bij Overnemen en Afmelden** (vraag 5). Geen
   defect volgens het ticket, wel een verschil met Afrekenen, Opwaarderen,
   Dienst afsluiten en Terugdraaien.
4. **`UitloggenKnop` keuzedialoog** ("Je dienst loopt nog") gebruikt een eigen
   `onClose={() => !bezig && ...}` in plaats van `closeBlocked`. Het is
   geen van de zeven overlays en geen geldactie; niet in dit ticket, wel
   vermeld voor consistentie (vraag 6).

## Rolzichtbaarheid, datamodel, RPC's

Geen wijzigingen. Rollen in de tests: bardienst (Opwaarderen, Dienst afsluiten
A, Terugdraaien), beheerder in bar-modus (Overnemen, Dienst afsluiten B),
beheerder in beheer-modus (Afmelden). De gate-impact: `check:a11y` en
`check:policy` blijven ongewijzigd; E2E draait lokaal/CI via Playwright zoals
de bestaande specs.

## Randgevallen

- **Backdrop-klik op (5, 5)** raakt in de bar-shell de rail of de achtergrond
  achter de overlay; de bestaande tests gebruiken dezelfde coördinaten
  (`inert` achtergrond, backdrop luistert op `document`). Als de rail bij
  Dienst afsluiten/Terugdraaien op een andere plek valt, kies een coördinaat
  buiten de dialoog en controleer dat de klik niet op een focusbaar element
  landt.
- **Eerste bevestigklik tijdens pending** is geforceerd (`click({ force: true
  })` op de disabled knop) en mag geen tweede aanroep geven.
- **Geen `page.clock`** in de nieuwe tests (de vertraging is een route-promise),
  zodat de 30 s-poll en heartbeat de teststand niet verstoren. Alleen waar een
  test de poll nodig heeft (risico 2 hierboven) zou de klok een rol krijgen;
  dat doen we niet.
- **Opruiming:** elke test laat de vastgehouden route na afloop door
  (`vast.laatDoor()`), ook bij een mislukte assertie, via `try/finally` in de
  helper, zodat `page.close()` niet op een hangende route wacht.

## Buiten scope

Safari/iPadOS, touch, schermlezer; een `check:policy`-gate voor
`role="dialog"`/`role="tablist"`; een time-outpad (30 s) voor deze overlays
(geen enkele van de vijf gebruikt `useOpslaanBlokkade` met time-out, ze
blokkeren tot de RPC klaar is); de onbekende-uitkomstflow van Afrekenen en
Opwaarderen (al gedekt); de refactor van de drie bestaande lokale
`openBar`-kopieën; wijzigingen aan `Overlay`, de overlays of hun teksten;
`UitloggenKnop`-keuzedialoog.

## Vragen voor Bram

_Besloten op 2026-10-06: alle zeven aanbevelingen overgenomen._

1. **Helpers verplaatsen of dupliceren?** `houdVast`, `mockKassa`/`kiesLid` en
   `dialogFocusState` staan nu lokaal in twee bestaande specs. Aanbeveling:
   verplaatsen naar `e2e/helpers/` als zuivere verplaatsing (geen gedragsverandering
   in de bestaande tests) en daar de gedeelde pending-assertie bijzetten. De
   alternatieve (kopieer en laat de bestaande specs ongemoeid) breekt de regel
   "duplicatie is een reviewfout". De drie bestaande `openBar`-varianten laat ik
   bewust staan (apart opruimticket).
2. **Eén nieuw specbestand of toevoegen aan `opslaan-sluiten-pending-aanvulling.spec.ts`?**
   Aanbeveling: nieuw bestand `e2e/overlays-pending-sluiten.spec.ts`, met de
   Opwaarderen-delta daarin (niet in het bestaande bestand, dat al ~600 regels is).
3. **`mockBarSessie` uitbreiden met een `admin`-optie** (diensten en sessies voor
   het beheeroverzicht, nu hardcoded leeg) voor de Afmelden-test?
   Aanbeveling: ja; het is testinfrastructuur, geen productcode, en het
   alternatief (een eigen `my_bar_state`-route in de spec) dupliceert de
   hele sessiemock.
4. **Twee tests per overlay (geslaagd én mislukt)?** Alleen bij een mislukking
   blijft de dialoog open, dus alleen daar is (d) "daarna weer sluitbaar" te
   toetsen; bij succes sluit de dialoog zelf. Aanbeveling: ja, tien
   tests, met de gedeelde assertie lopen ze kort. Minimale variant: alleen de
   mislukt-test per overlay plus één geslaagd voor Opwaarderen.
5. **Zichtbare pendingtekst bij Overnemen en Afmelden?** Hun bevestigknop heeft
   geen "bezig…" (alleen disabled + `aria-busy`); de andere vier hebben dat wel.
   Aanbeveling: niet wijzigen in dit ticket (testwerk) en de tests niet
   op een label laten leunen; apart ticket als je het visueel wilt gelijktrekken.
6. **`UitloggenKnop`-keuzedialoog** ("Je dienst loopt nog") buiten het
   `closeBlocked`-contract laten? Aanbeveling: ja, buiten scope; het is geen van de
   zeven en geen geld-/RPC-actie op die dialoog zelf (de actie loopt na het
   sluiten). Alleen een losse notitie als je het later wilt gelijktrekken.
7. **Dienst afsluiten: welke ingangen?** Aanbeveling: eigen variant via de
   Dienst-tab en één beheerder-variant via `DienstElders`; de overige ingangen
   (`AdminMeldingen`, `DienstenApparaten`, `DienstTeLangOpenMelding`,
   Uitloggen-keuze) gebruiken dezelfde overlay en worden niet apart getest.

## Gebouwd, afwijkingen en wat niet gedaan is

Alleen testwerk, geen productcode, migratie of RPC. Bestanden:
`e2e/overlays-pending-sluiten.spec.ts` (nieuw), `e2e/helpers/pendingOverlay.ts`,
`e2e/helpers/barBasis.ts`, `e2e/helpers/barDienst.ts` en `e2e/helpers/kassa.ts`
(nieuw), `e2e/helpers/supabaseMock.ts` (aangepast), en de specs waaruit
helpers zijn verplaatst (`opslaan-sluiten-pending-aanvulling.spec.ts`,
`dialogen-tabs-landmarks-negatief.spec.ts`).

**Zoals gespecificeerd gebouwd:** `houdVast` en `dialogFocusState` naar
`pendingOverlay.ts`; `openKassa` heet nu `mockKassa` en staat met `kiesLid` in
`kassa.ts`; `mockBarSessie` heeft een `admin`-optie; de gedeelde
`expectGeblokkeerdTijdensPending` (a, b, c) en per overlay een geslaagd- en een
mislukt-test (d), met de vertraging in de route en zonder `page.clock`.

**Afwijkingen en toevoegingen:**

- **12 tests, niet tien (vraag 4):** Dienst afsluiten heeft twee varianten
  (eigen en beheerder) met elk een geslaagd- en een mislukt-test. De spec
  schreef bij "Test 3 (B)" één gebundelde test voor; die is gesplitst zodat een
  falend pad het andere niet verbergt.
- **Extra verplaatst:** `openOpwaarderen` (naast `kiesLid`) naar `kassa.ts`,
  want de nieuwe spec heeft hem ook nodig; zuivere verplaatsing.
- **Extra helpers in `pendingOverlay.ts`:** `vertraagRpc` (houdt één RPC vast,
  telt aanroepen en payloads), `overlayStatus` (de laatste `p[role="status"]`
  van de dialoog, want "Overzicht laden…" staat erboven),
  `expectSluitbaarNaPending` (contract d) en `domeinFout` (een eenregelige
  wrapper om `json(route, 400, { code: "P0001", ... })`). Bij een mislukte
  assertie laat de helper de vastgehouden route alsnog door.
- **Gedeelde basis in plaats van een tweede kopie:** de basismocks (login,
  lege REST, dienst, bezetting, Pils, Anna, instellingen) en de constanten
  `ANNA`, `TOM` en `BAR_SHIFT` staan in `barBasis.ts` (`mockBarBasis`);
  `mockKassa` en `mockBarDienst` bouwen erop. `mockBarDienst` logt niet in,
  heeft opties voor rol, `otherShift` en een bestelling in de transactielijst,
  en geeft de sessie terug met `sluitDienst()`.
- **`bodyIsNiet`** is nu een export uit `supabaseMock.ts` (was lokaal in de
  aanvulling-spec).
- **Foutcodes gekozen bij de bouw:** Opwaarderen `invalid_amount` ("vul een
  geldig bedrag in"), een definitieve afwijzing in `moneyRequest.ts`, dus
  geen onbekende-uitkomstflow; Afmelden `target_session_ended`, een bekende
  code zonder eigen tekst, dus de overlay toont `foutOverig` ("er ging iets
  mis, probeer het opnieuw"); Overnemen en beheerder-afsluiten
  `shift_not_open`; Terugdraaien `already_reversed`; eigen Dienst afsluiten een
  500 zonder code.
- Overnemen en Afmelden hebben geen "bezig…"-label (vraag 5): die tests leunen
  op `aria-busy`, disabled en focus.

**Lokaal bewezen:** de nieuwe spec (12 tests) slaagt met `--repeat-each=5`; de specs
waaruit helpers verplaatst zijn geven dezelfde uitkomst; `check:fast` groen. De
tests vonden geen productgat.

**Niet gedaan / open punten:**

- **Mutatiecheck (door de Tester, lokaal, niet gecommit):** `closeBlocked`
  uit in de vijf overlays: alle 11 toenmalige tests rood; `Overlay` sluit
  toch bij Escape en backdrop: alle rood; annuleerknop niet disabled in
  Overnemen en Terugdraaien: 4 van 4 rood. Niet gemuteerd, alleen door lezen
  beoordeeld: de focus-trap-logica en de tekst van de `role="status"`-regio.
  De sluitpogingen worden sinds de review per Escape en per backdrop-klik
  afzonderlijk getoetst, zodat een dialoog die toch sluit snel en duidelijk
  faalt.
- **Overlay-`Sluiten`-knop:** die staat in `Overlay.tsx` (`sluitKnop`) alleen in
  `variant="detail"`, niet in de standaard-bar-overlays van deze spec, en de
  portal-sheets gebruiken hem niet (eigen "Annuleren"). Het pending-gedrag
  ervan is bedekt door `dialogen-tabs-landmarks-negatief.spec.ts:326`,
  `opslaan-sluiten-pending.spec.ts:169` en `:226` en
  `productafbeeldingen.spec.ts:140`; deze bar-spec bewijst hem niet.
- Afmelden-geslaagd wacht niet meer op een vaste pauze maar op de verversing
  van `my_bar_state`; een toast die pas ná die lezing verdwijnt, zou nog
  net ontsnappen aan de assertie.
- De 30 s-poll van de bar-sessie tijdens pending is niet getest (geen
  `page.clock`, zie Productbevindingen 2).
- De `UitloggenKnop`-keuzedialoog heeft een eigen `onClose` en valt buiten het
  `closeBlocked`-contract (vraag 6).
- **Bestaande flake**, niet van dit ticket: in
  `dialogen-tabs-landmarks-negatief.spec.ts`, test "geldmutatie: geblokkeerde
  sluitpogingen", zoekt `dialog.locator('p[role="status"]')` (r.314) alle
  `p`-statusregio's in de dialoog; volgens #175 punt 1 vindt die twee
  elementen ("Bestellingen laden…" en de sr-only status), een
  strict-mode-violation bij de assertie op r.317. Tijdens mijn baseline-runs
  (vóór mijn wijzigingen, onder parallelle load) zag ik die test incidenteel
  falen bij `await expect(status).toHaveText("")` na het succes (r.345). Ik heb
  de oorzaak niet uitgezocht, dus het staat niet vast dat dit hetzelfde falen
  is als in #175 punt 1.
- De kopieën van `houdVast` in `opslaan-sluiten-pending.spec.ts` en
  `productafbeeldingen.spec.ts` en de drie lokale `openBar`-kopieën blijven
  staan (apart opruimticket).
- `check:a11y`, `build`, `db:test` en `test:integration` draaien alleen in CI.
