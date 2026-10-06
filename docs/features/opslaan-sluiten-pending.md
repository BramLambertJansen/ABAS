# Opslaan, sluiten en gelijktijdige acties voorspelbaar maken

**Status: gebouwd** (PR [#142](https://github.com/BramLambertJansen/ABAS/pull/142),
gemerged 2026-10-02, `cf93611`; issue #126, T06). Het document hieronder is de
spec zoals goedgekeurd; "Zoals gebouwd" direct hieronder beschrijft wat er
daadwerkelijk staat en waar het afwijkt of nog openligt. Bij tegenspraak geldt
"Zoals gebouwd". De spec is goedgekeurd door Bram (2026-10-02): aanbevelingen
bij A, B, C, D en E, en een time-out van 30 seconden voor een hangend verzoek,
alleen voor beheerdialogen zonder geld (besluit 1).

## Zoals gebouwd

**Gedeelde onderdelen** (zie ook `docs/ARCHITECTURE.md`):

- `src/lib/opslaan.ts`: pure regels en teksten (`PENDING_TIMEOUT_MS` = 30 s,
  `isBezig`/`magActieStarten`, de onopgeslagen-definities voor tekst, keuze,
  prijs en nieuw-formulier, de weggooi- en onbekende-uitkomstteksten). Unit-
  getest in `test/opslaan.test.ts`.
- `useOpslaanBlokkade(pending, { metTimeout = true })`: geeft `closeBlocked` en
  `timedOut`. Met time-out valt de blokkade na 30 s en is `timedOut` waar; het
  verzoek wordt niet afgebroken. Met `{ metTimeout: false }` blijft
  `closeBlocked` staan tot het verzoek klaar is en is `timedOut` nooit waar.
- `useHerstelFocus`: zet na pending de focus terug op de sectie met het
  resultaat (nooit `body`).
- `OpslaanSectie`: `aria-busy`, uitleg "wacht tot de lopende wijziging klaar
  is" en de eigen `role="alert"`-foutregel per sectie.
- `OnbekendeUitkomstMelding({ onGecontroleerd, hangend })`: controletekst plus
  "Ik heb gecontroleerd". `hangend` (toegevoegd na de Reviewer-bevinding)
  maakt de knop disabled zolang het verzoek nog loopt.
- `Overlay` kreeg de additieve prop `onopgeslagen`: Escape en backdrop vragen
  inline in dezelfde dialoog (ADR 0014: geen tweede overlay) "Niet-opgeslagen
  wijziging weggooien?" met Weggooien en Terug (focus op Terug); nogmaals
  Escape/backdrop is "terug". De eigen Sluiten/Annuleren-knoppen gooien direct
  weg (vraag B, optie 3). `closeBlocked` wint altijd.

**Toepassing:**

- Geld zonder time-out (besluit 1): Afrekenen, Opwaarderen en Nieuw lid gebruiken
  `useOpslaanBlokkade(pending, { metTimeout: false })`. Onbekende uitkomst
  (netwerk-/onbekende fout, nooit een time-out) toont
  `OnbekendeUitkomstMelding`, geen "probeer opnieuw", geen automatische
  tweede poging. Bewust gevolg: een echt hangend geldverzoek houdt de dialoog
  vast tot herladen. De UI claimt niet dat dubbel boeken is uitgesloten;
  dat vraagt backend-idempotentie, apart ticket
  [#143](https://github.com/BramLambertJansen/ABAS/issues/143) (`request_id` op
  `place_order`, `top_up`, `create_member`). `test/sessieCodeMessages.test.ts` is
  bewust aangepast: `unknown` bij `place_order`/`top_up` is nu de controletekst.
- Beheerdialogen zonder geld (Product beheren, Nieuw product, Lid beheren,
  Bezetting, portal-sheets Naam, Wachtwoord, Pincode): `closeBlocked` met
  30 s-time-out en de generieke tekst uit besluit 3. Lopende actie: veld
  `readOnly`, knop "Opslaan…"; Sluiten/Annuleren/Klaar disabled.
- F11: serialisatie per object (één schrijfactie tegelijk), eigen foutregel
  per sectie in plaats van één gedeelde `lastAction`, succes past alleen de
  gewijzigde velden toe. "Bestelling terugdraaien" is in Lid beheren disabled
  tijdens een lopende wijziging (besluit 4).
- Onopgeslagen-vraag (`onopgeslagen`): Nieuw product, Nieuw lid, Product
  beheren, Lid beheren en de sheets Naam, Wachtwoord en Pincode. Niet op
  Bezetting (geen formulier).

**Afwijkingen van de spec:**

- De foutregel per sectie bestaat alleen zolang er een fout is (niet als lege
  gemounte regio), omdat bestaande e2e-specs op één `role="alert"` rekenen.
- `TweestapSheet` blokkeert sluiten alleen tijdens de code-bevestiging en heeft
  geen onopgeslagen-vraag: een half ingevoerde code gaat bij Escape/backdrop
  verloren (Codex-bevinding P2, bewust niet opgelost in T06).
- De code-stap van `WachtwoordWijzigenSheet` blokkeert sluiten niet.
- Timeout-tekst en weggooitekst zijn de goedgekeurde teksten uit besluit 2 en 3.

**Bevindingen tijdens de bouw:**

- Tester: (1) dubbele geldopdracht na een time-out en (2) focus op `body` na
  pending. Beide gefixt; (1) is opgelost door geld geen time-out te geven
  (besluit Bram, commit `2928cd0`). Dezelfde bevinding stond als Codex P1 in de
  PR (een time-out maakte een nog lopende `place_order` opnieuw verstuurbaar,
  en een late `onSuccess` kon de nieuwe winkelmand wissen).
- Reviewer: "Ik heb gecontroleerd" was bruikbaar tijdens een hangend
  verzoek; gefixt met de prop `hangend`.

**Niet gedekt (open):**

- Geen e2e voor het pending- en sluitgedrag van `TweestapSheet` (de volledige
  inschrijvingsflow is wel gedekt in `e2e/portal-profiel.spec.ts`, gemockt en live).
- Geen 30 s-test voor Pincode, Wachtwoord wijzigen en Nieuw product.
- Geen test voor omgekeerde responsevolgorde in Lid beheren (de serialisatie
  maakt het in de UI onbereikbaar, maar het is niet bewezen met een test).
- Handmatige reeks (Safari, touch, schermlezer, trage tablet) nog niet
  uitgevoerd: geen claim over werking daarop.
- Backend-idempotentie: #143.
  Sinds #143 sturen `place_order`, `top_up` en `create_member` een optionele
  `p_request_id` mee; zie [`idempotentie-geld-rpcs.md`](idempotentie-geld-rpcs.md) (ADR 0023, #143). De UI-tekst van de onbekende uitkomst en de
  time-outs blijven tot fase 2 van die spec ongewijzigd.

**ADR:** er hoort geen ADR bij T06 (zie "ADR nodig?"); #143 krijgt een ADR bij
zijn eigen spec.

## Besluiten Bram (2026-10-02)

1. **30 s-time-out alleen zonder geld.** Geldoverlays (Afrekenen, Opwaarderen,
   Nieuw lid met startsaldo) houden `closeBlocked` tot het verzoek echt klaar
   is, ongewijzigd; de time-out geldt alleen voor beheerdialogen zonder geld.
   Bij een hangend geldverzoek blijft de dialoog geblokkeerd. "Onbekende
   uitkomst" plus controleknop verschijnen alleen na een echte netwerk-/
   onbekende fout (niet door time-out); de knop is disabled zolang het
   verzoek pending is. **Bewust gevolg:** een echt hangend geldverzoek houdt
   de dialoog vast tot herladen. Geen backend-idempotentie in T06 (apart
   ticket, vraag C optie 3).
2. **Weggooi-tekst:** "Niet-opgeslagen wijziging weggooien?" (de eerdere
   schrijfwijze "Ongeslagen wijziging weggooien?" was een typfout).
3. **Generieke time-outtekst voor niet-geldacties:** "De uitkomst is onbekend.
   Controleer eerst de actuele gegevens voordat je opnieuw probeert."
4. **"Bestelling terugdraaien" is disabled tijdens een lopende wijziging in
   Lid beheren**, met een uitlegregel (tekst in de stijl van de andere
   uitleg bij disabled knoppen; de Developer gebruikt de bestaande
   serialisatie-uitleg uit "Zichtbare status").

Spec voor [issue #126](https://github.com/BramLambertJansen/ABAS/issues/126)
(frontend T06 · P2, epic #121, findings F10 en F11). Bouwt voort op het
gedeelde dialoogcontract van T05 (#125, gemerged, zie
`docs/features/dialogen-tabs-landmarks.md`) en stemt af met
[#131](https://github.com/BramLambertJansen/ABAS/issues/131) (T11,
beheerformulieren) en [#140](https://github.com/BramLambertJansen/ABAS/issues/140)
(pending-E2E voor de geldoverlays).

## Doel

Een gebruiker die iets opslaat weet of de opdracht nog loopt, geslaagd is of
herstel nodig heeft. Een dialoog verdwijnt niet onder een lopende mutatie,
een tweede actie in dezelfde dialoog verdringt de status of foutmelding van de
eerste niet, en de zichtbare opdracht komt overeen met wat er verstuurd is.
Dit ticket levert geen idempotentie-garantie voor geld (zie vraag C).

## Gelezen bronnen

- **Ticket #126** (volledig, F10, F11, acceptatiecriteria, verificatie) en de
  afhankelijke tickets #125, #131, #140.
- **Wireframe:** geen visuele wijziging gevraagd. Bestaande chrome van
  `designs/Bar App.dc.html` (modals) en `designs/Lid App.dc.html` (sheets)
  blijft; alleen gedrag, statustekst en blokkade veranderen.
- **Code (actuele main, HEAD `f3f4445`):** `src/components/Overlay.tsx`,
  `src/components/overlayShield.ts`, de overlays hieronder, hun hooks in
  `src/hooks/queries/`, `usePlaceOrder.ts`, `useTopUp.ts`, en
  `supabase/migrations/0029_bar_rpcs_eisen_bar_sessie.sql` (`create_member`).
- **Kaders:** `CLAUDE.md` (geld alleen via RPC, componenten herbruikbaar,
  "Geen enkele agent verzint een antwoord"), `docs/ARCHITECTURE.md`, ADR 0014,
  `docs/features/dialogen-tabs-landmarks.md` (sluit-/pendingcontract).

## Validatie van het ticket tegen actuele main

Het ticket is geschreven op commit `ebca054`. Wat sindsdien veranderde:

- **T05 is gemerged.** `Overlay` heeft `closeBlocked`, `closeBlockedMessage`
  (default "Even wachten, de actie wordt nog verwerkt.", zichtbaar na een
  geblokkeerde poging), `aria-busy` zolang geblokkeerd, een altijd gemounte
  `role="status"`, en focusherstel naar de dialoogcontainer als een control
  tijdens pending disabled wordt. Zeven overlays gebruiken het al: Afrekenen,
  Opwaarderen, Dienst afsluiten, Overnemen, Afmelden, Lid-bestellingen en
  Terugdraaien. Het mechanisme is er dus; T06 past het toe op de rest en
  beslist het beleid eromheen.
- **`MijnAccountOverlay` bestaat niet meer.** Er is geen bestand met die naam
  in `src/`; "Mijn account" op de portal zijn nu de sheets in
  `src/features/portal-profiel/` (`NaamWijzigenSheet`, `PincodeSheet`,
  `WachtwoordWijzigenSheet`, `TweestapSheet`). Een verouderde verwijzing staat
  nog in `docs/features/portal-profiel.md`. Het ticket noemt dit overlay-pad
  nog; de scope hieronder volgt de actuele code. Dit is geen verzonnen
  interpretatie: de bestanden zijn wat er nu is.
- **Pending-E2E ontbreekt** voor vijf van de zeven bestaande `closeBlocked`-
  overlays (zie #140). Hoort bij #140, niet bij T06; T06 voegt wel eigen
  pending-E2E toe voor de nieuwe toepassingen.

### Wat elke overlay nog mist

Alle overlays hieronder geven `onClose` direct door aan `Overlay` en hebben
een Sluiten/Annuleren/Klaar-knop die nooit disabled is. Geen enkele zet
`closeBlocked`. Dat is F10, bevestigd in de bron (niet in een browser opnieuw
gereproduceerd).

| Overlay | Pending-bron | Mist nu |
|---|---|---|
| `ProductBeherenOverlay` | `useUpdateProductPrice`, `useSetProductArchived` | `closeBlocked`; prijsveld blijft wijzigbaar tijdens pending (verstuurde en getoonde waarde kunnen uiteenlopen); `lastAction` gedeeld, zie F11; niets bij onopgeslagen prijs |
| `NieuwProductOverlay` | `useCreateProduct` | `closeBlocked`; velden blijven bewerkbaar tijdens pending; geen onopgeslagen-beleid |
| `LidBeherenOverlay` | vijf hooks (naam, e-mail, rol, archiveren, invite) | `closeBlocked`; vijf losse pendingvlaggen en één gedeelde `lastAction`; succes vervangt het hele lokale `member` (`setMember(updated)`); Sluiten nooit disabled |
| `NieuwLidOverlay` | `useCreateMember` (**startsaldo**) | `closeBlocked`; velden blijven bewerkbaar; zie vraag C |
| `BezettingOverlay` | `useAddShiftMember`, `useRemoveShiftMember` | `closeBlocked`; wel al serialisatie (`pendingId`) en `membersStatus`-guard, maar "Klaar", Escape en backdrop sluiten tijdens pending |
| `NaamWijzigenSheet`, `WachtwoordWijzigenSheet`, `PincodeSheet`, `TweestapSheet` | `usePortalUpdateOwnName`, `usePortalWachtwoordWijzigen`, `usePortalSetOwnPin`, `usePortalTweestap` | `closeBlocked`; Annuleren (`SheetKnoppen`) nooit disabled; `PincodeSheet` heeft eigen `pending`-guards op toetsen maar sluit wel |
| `SessieMeldingOverlay`, `UitloggenKnop`, `DienstTeLangOpenMelding` | geen of eigen | Nagaan door de Developer of er een mutatie in zit; geen aanname in deze spec |

### F11 in de code, bevestigd

- `LidBeherenOverlay` en `ProductBeherenOverlay` delen één `lastAction`. De
  foutregel toont alleen de fout van de láátst gestarte actie. Start de
  gebruiker tijdens een mislukkende naamwijziging een archiveeractie, dan
  verdwijnt de naamfout. Elke mutatiehook heeft bovendien zijn eigen
  `errorCode`, die pas bij de volgende aanroep van **die** hook wordt gereset.
- Elke succesresponse doet `setMember(updated)` / `setProduct(updated)` met
  het volledige object uit de RPC. Antwoorden komen in volgorde van aankomst,
  niet van start; een oudere response kan de nieuwere state overschrijven en
  tijdelijk waarden terugzetten die de gebruiker al wijzigde.
- Er is geen serialisatie per lid of product. De afzonderlijke
  `status !== "pending"`-guards beschermen alleen tegen een dubbele klik op
  dezelfde knop.
- Geen databasecorruptie: elke RPC zet een expliciete eindstaat (idempotent,
  ledenbeheer.md), dus de server houdt de laatst aangekomen waarde. Het risico
  zit in wat de UI toont, zoals het ticket ook stelt.

## Gekozen aanpak (onder voorbehoud van vraag A, B en C)

Een gedeeld beleid, in één plek, in plaats van per overlay opnieuw bedenken
(CLAUDE.md: duplicatie is een reviewfout).

### 1. Pending-model per detailobject

Een klein gedeeld hulpmiddel (naam en vorm aan de Developer; hook of
gedeelde helper in `src/hooks/` of `src/lib/`, getest zonder browser waar
puur) dat voor één detailobject (een lid, een product):

- **Mutaties serialiseert:** er loopt hoogstens één schrijfactie tegelijk per
  object. Een tweede actie tijdens pending is niet toegestaan (knop
  `disabled`, de bijbehorende reden zichtbaar), geen stille queue.
  Reden: de RPC's zijn onafhankelijke eindstaat-acties, dus gelijktijdig
  versturen is technisch veilig, maar maakt de UI-state onbepaalbaar. Voor
  de handvol acties per dialoog kost serialiseren de gebruiker geen merkbare
  tijd.
- **Eén foutstatus per actie bewaart,** niet één gedeelde `lastAction`: elke
  actiesectie (naam, e-mail, rol, archiveren, prijs, invite) toont zijn eigen
  fout naast zijn eigen knop, tot die actie opnieuw wordt gestart of de
  gebruiker de invoer wijzigt. De bovenste `role="alert"`-regel vervalt voor
  deze overlays; een fout hoort bij de plek waar de gebruiker keek. De
  `role="alert"` blijft per sectie, zodat een schermlezer hem aankondigt.
- **Succes toepast met één bron van waarheid:** na een geslaagde actie wordt
  het resultaat niet blind over het lokale object heen gezet. Twee toegestane
  varianten (keuze Developer, te verantwoorden in de PR):
  (a) alleen de velden toepassen die de actie wijzigde (de RPC-respons voor
  die velden, de rest van het lokale object blijft); of
  (b) na elke succes de lijstquery verversen (`onChanged()` doet dat al) en de
  dialoog uit die lijstrij hydrateren.
  Zolang er per object hoogstens één mutatie loopt (punt hierboven) kan een
  oudere response een nieuwere niet meer overschrijven; (a) of (b) blijft
  nodig voor wat de server intussen elders wijzigde.
- **Verstuurde waarde bevriest:** het veld en de knop van de lopende actie
  zijn tijdens pending `readOnly`/`disabled` (met `aria-busy` op de sectie en
  zichtbare tekst "Opslaan…"), zodat de getoonde invoer gelijk blijft aan wat
  verstuurd is. Na succes toont het veld de teruggegeven waarde; na een fout
  blijft de ingevoerde waarde staan zodat de gebruiker kan corrigeren.
  Velden van andere secties blijven bewerkbaar, maar hun opslaan-knoppen zijn
  disabled zolang er een mutatie voor dit object loopt (met uitleg: zie
  Zichtbare status).
- **Zichtbare status:** een tekstuele "bezig"-aanduiding op de lopende
  sectie, en een korte uitleg bij de disabled knoppen van de andere secties
  ("wacht tot de lopende wijziging klaar is"). Een disabled knop zonder
  reden is een F10-acceptatiecriterium ("geblokkeerde velden/keuzes zijn
  verklaarbaar"). Tekst komt van Bram (zie vraag D in "Kleinere
  tekstbeslissingen").

### 2. Sluitcontract (hangt af van vraag A)

Zie vraag A. In beide varianten volgen Escape, backdrop, Sluiten, Annuleren
en Klaar **hetzelfde** pad, zoals acceptatiecriterium 1 eist. Voor variant 1
(blokkeren) betekent dat: `closeBlocked={pending}` plus de knoppen op
`disabled={pending}` of dezelfde vlag, zoals de zeven bestaande overlays.

### 3. Onopgeslagen invoer (hangt af van vraag B)

Zie vraag B. Gemeenschappelijke eisen, ongeacht de keuze:

- "Onopgeslagen" is **gedefinieerd** als: de invoer wijkt af van de laatst
  opgeslagen waarde (voor prijs: niet leeg en ongelijk aan huidige prijs;
  naam/e-mail/rol: ongelijk aan het lid; voor Nieuw lid/product: elk
  ingevuld veld). Een onaangeroerd of reeds opgeslagen formulier is niet
  onopgeslagen en sluit zonder vraag (geen bevestigingsspam; acceptatiecriterium 5).
- De regel wordt op één plek vastgelegd, niet per overlay herhaald.

### 4. Welke overlays vallen onder welk beleid

- **Beheerformulieren met invoer** (Product beheren, Nieuw product, Lid
  beheren, Nieuw lid, de vier portal-sheets): pending-model, sluitcontract
  én onopgeslagen-beleid.
- **Actielijsten zonder formulier** (Bezetting): pending-model en
  sluitcontract; geen onopgeslagen-beleid (er is geen concept, elke tik is
  direct een actie).
- **Geldoverlays** (Afrekenen, Opwaarderen, Nieuw lid met startsaldo;
  daarnaast Terugdraaien en de vier andere bestaande): behouden
  `closeBlocked` tot het verzoek echt klaar is en hun extra bescherming
  ongewijzigd, **zonder 30 s-time-out** (besluit 1); het enige dat T06 doet
  is vraag C toepassen. Hun beleid wordt dus **niet** versoepeld, ook niet
  als vraag A voor "taak buiten de dialoog" kiest. De time-out geldt alleen
  voor beheerdialogen zonder geld.

## Vragen voor Bram (beantwoord, zie "Zoals gebouwd")

Historisch: de vragen zoals gesteld vóór de bouw. De antwoorden staan in
"Besluiten Bram" bovenaan en zijn gebouwd zoals daar beschreven.

### Vraag A: sluiting blokkeren tijdens opslaan, of een zichtbare taak buiten de dialoog?

Het ticket vraagt "kies voor blokkeren óf een zichtbare taak buiten de
dialoog; geen stil doorlopende mutatie na een verdwenen venster".

- **Optie 1: sluiting blokkeren** (`closeBlocked={pending}`). Past op het
  bestaande mechanisme uit T05, dat al op zeven overlays staat; één
  beleid voor geld en beheer. Nadeel: de gebruiker wacht (typisch
  sub-seconde; bij een traag netwerk merkbaar), en Escape voelt dan
  tijdelijk dood. De melding "Even wachten, de actie wordt nog verwerkt." staat
  al vast.
- **Optie 2: taak buiten de dialoog.** De dialoog sluit, een zichtbare
  statusregel (toast of statusbalk in de shell) toont "prijs opslaan…" en
  daarna succes of fout, met herstelactie bij een fout. Nadeel: dat is een
  nieuw globaal onderdeel (een taaklaag met levensduur buiten de dialoog),
  vraagt een plek in beide shells, een beleid voor meerdere taken tegelijk,
  en een plan voor de fout nadat het formulier al weg is (de ingevoerde
  waarde moet dan ergens heen). Daarmee verbreedt het scope van M naar L
  en raakt het ADR 0014 (meldingen wachten tot geen overlay open is).

**Aanbeveling: optie 1, blokkeren.** Het is het kleinste beleid dat
acceptatiecriterium 2 haalt, hergebruikt `closeBlocked` en de bestaande
status-regio, en geeft de gebruiker de foutmelding op de plek waar hij de
invoer nog heeft. Optie 2 is alleen verdedigbaar als Bram verwacht dat
opslaan op de bar-tablet regelmatig langzaam is; dat is niet aangetoond
(het ticket gebruikt een met opzet vertraagde RPC). Geldoverlays blijven in
elk geval geblokkeerd, ook zonder time-out (besluit 1): bij een lopende
geldmutatie is een verdwenen venster nooit goed.

### Vraag B: gedrag bij sluiten met onopgeslagen invoer

Het ticket vraagt "een bewuste keuze, geen bevestigingsspam bij
ongewijzigde of al opgeslagen forms".

- **Optie 1: bevestigen.** Escape, backdrop en Sluiten/Annuleren tonen
  "Niet-opgeslagen wijziging weggooien?" met Weggooien en Terug (besluit 2). Alleen als de
  invoer onopgeslagen is (definitie hierboven). Geldt voor Nieuw lid, Nieuw
  product, Product beheren, Lid beheren en de portal-sheets.
- **Optie 2: stil weggooien** (huidig gedrag, nu met `closeBlocked` bij
  pending). Simpel, maar een per ongeluk getikte backdrop op de
  bar-tablet gooit een half ingevulde Nieuw-lid weg.
- **Optie 3: alleen de backdrop en Escape beschermen,** de expliciete
  knoppen Sluiten/Annuleren gooien weg. Compromis: een bewuste knop is een
  bewuste keuze, een per ongeluk tik niet.

**Aanbeveling: optie 3**, met onopgeslagen-controle zoals gedefinieerd, en
alleen voor formulieren met invoer (niet Bezetting). Het beschermt tegen
het reëel aannemelijke ongeluk (backdrop-tik op een tablet, zie ook open
vraag 6 in de T05-spec die `mousedown` hield) zonder bevestigingsspam bij
een bewuste Annuleren. De bevestiging zelf is een tweede dialoog en
ADR 0014 verbiedt twee overlays tegelijk: de Developer moet dat binnen
de bestaande `Overlay` oplossen (bijvoorbeeld een inline bevestigingsstap in
dezelfde dialoog), niet een tweede `Overlay` stapelen. Als dat onhandig
blijkt, terug naar de Architect.

### Vraag C: aanpak voor geldrequests met onbekende uitkomst

Het ticket: "bij een geldrequest met onbekende uitkomst wordt status eerst
gecontroleerd; geen automatische blinde retry. Indien het backendcontract
geen veilige controle biedt, dat als apart vereiste benoemen."

**Wat de code en het schema nu doen (gelezen, niet aangenomen):**

- `usePlaceOrder` en `useTopUp` vangen een netwerk- of
  onbekende fout in dezelfde `catch` en tonen "er ging iets mis, probeer het
  opnieuw" (`src/features/verkoop/messages.ts`,
  `src/features/opwaarderen/messages.ts`). Dat is een uitnodiging tot blinde
  retry bij een verzoek waarvan de uitkomst onbekend is (de server kan het al
  hebben verwerkt).
- Er is **geen idempotentiesleutel** in een geld-RPC (grep op
  `idempot`/`request_id` in `supabase/migrations/` en `src/` vindt alleen
  commentaar over idempotente eindstaat-RPC's, niet over een sleutel).
  Een tweede `place_order`, `top_up` of `create_member` met dezelfde invoer
  boekt dus gewoon opnieuw.
- `create_member` met startsaldo schrijft `members.balance_cents` rechtstreeks
  (`0029_bar_rpcs_eisen_bar_sessie.sql`, `create_member`), **zonder transactierij**, en er is geen
  uniekheid op naam. Een herhaalde submit levert een tweede lid met hetzelfde
  saldo op. Het ticket vraagt Nieuw lid met startsaldo expliciet te
  verifiëren; dit is waarom.
- Er is geen "status opvragen"-RPC voor een bestelling of opwaardering op
  basis van een clientreferentie. De client kent het resultaat-id pas ná een
  geslaagd antwoord.

**Wat een UI alleen kan doen, zonder backend:** de gebruiker niet laten
raden (geen "probeer opnieuw"), de wacht- en onbekende-status expliciet
tonen, en de gebruiker naar een bestaande bron verwijzen om te controleren
(saldo en transacties in de lijst, bestellingen in dienstoverzicht) vóór
een tweede poging. Dat is **geen bewijs** van uitkomst, alleen een
ontmoedigde retry.

Opties:

- **Optie 1: alleen UI-aanpassing nu.** Bij een onbekende uitkomst (netwerk
  of onbekende fout) op een geldrequest: geen "probeer opnieuw", maar
  "De uitkomst is onbekend. Controleer eerst het saldo of de transacties
  voordat je opnieuw probeert." De actieknop blijft geblokkeerd tot de
  gebruiker bewust "Ik heb gecontroleerd" kiest; de lijst met saldo/
  transacties wordt ververst. Backendvereiste apart benoemd (optie 3).
- **Optie 2: niets wijzigen.** Houdt de huidige tekst, maar dan blijft de
  blinde retry-uitnodiging staan en acceptatiecriterium 6 niet gehaald.
- **Optie 3: backend-idempotentie** (apart ticket, niet T06):
  client genereert een `request_id` (uuid) per bedoelde opdracht, `place_order`,
  `top_up` en `create_member` slaan hem op met een uniek-constraint en geven
  bij herhaling het eerdere resultaat terug. Past binnen "geld alleen via
  RPC" (de RPC blijft de enige schrijver; de client stuurt een id, geen
  bedrag). Vraagt migratie, `db:test`-tests en `rpc_catalogus`-bijwerking,
  en een beslissing over hoe lang sleutels bewaard worden. Dit is een
  schemawijziging: vereist een eigen spec en waarschijnlijk een ADR, en
  echte backendtests (ticket: "bewijs van echte geld-idempotentie vraagt een
  backendtest").

**Besluit Bram (2026-10-02): optie 1 in T06 én optie 3 als apart
vereiste-ticket, met de afbakening uit besluit 1.** De onbekende-uitkomst-
tekst en controleknop verschijnen alleen na een echte netwerk-/onbekende
fout, nooit door een time-out (geldverzoeken hebben er geen), en de knop is
disabled zolang het verzoek pending is. Bij een hangend geldverzoek blijft
de dialoog geblokkeerd. Oorspronkelijke aanbeveling: T06
doet wat de UI eerlijk kan (stoppen met "probeer opnieuw" op onbekende
geldfouten, expliciet de onbekende staat tonen, naar saldo/transacties
verwijzen, geen automatische retry) en zegt letterlijk in de UI en PR niet
dat dat dubbele boeking uitsluit. Het echte antwoord is backend-idempotentie;
die benoem ik hier als apart vereiste, zoals het ticket vraagt, en de
Architect schrijft die spec los zodra Bram het ticket wil. Reden: de
UI-check is zelf onbewezen (een gebruiker kan een verkeerde conclusie
trekken uit een verouderd saldo), dus mag T06 niet doen alsof het veilig
is. Voor `create_member` (geen transactierij, geen uniekheid) geldt
hetzelfde; een tweede lid met dezelfde naam en saldo is zichtbaar en
terug te draaien via archiveren, maar het saldo-effect is niet te
corrigeren omdat er geen saldocorrectie in de app is (CLAUDE.md,
Opwaarderen).

### Kleinere tekstbeslissingen (nodig voordat gebouwd wordt)

De standaardtekst bij blokkade staat vast (T05). De volgende teksten bestaan
nog niet en worden door Bram geleverd, niet door de Developer verzonnen:

- Tekst bij de "bezig"-aanduiding per sectie (bijvoorbeeld "Opslaan…" als
  knoplabel, voorstel; mag Bram aanpassen).
- Uitleg bij een disabled opslaan-knop door een lopende andere wijziging.
- De bevestigingstekst bij onopgeslagen invoer (vraag B) en de knoplabels.
- De tekst bij onbekende geldstatus (vraag C).

**Aanbeveling:** akkoord op de bovenstaande voorbeeldteksten als
uitgangspunt, aanpasbaar bij review; ik schrijf ze niet in als definitief.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC:** de feature voegt geen bedrag of RPC toe en de
  client berekent niets. De geldbeschermingen (`closeBlocked` op
  Afrekenen, Opwaarderen, Terugdraaien) blijven en worden niet versoepeld.
  Het enige geld-onderdeel is de statusweergave bij onbekende uitkomst
  (vraag C); een echte oplossing vraagt een RPC-wijziging en valt buiten
  T06.
- **`served_by` uit bezetting, PIN/wachtwoord, cookie-isolatie:** niet
  geraakt. `BezettingOverlay` verandert alleen in sluitgedrag, niet in wie
  mag toevoegen of afmelden.
- **Componenten herbruikbaar:** het pending-model en de onopgeslagen-regel
  komen één keer in een gedeeld stuk, niet per overlay. Is er al iets
  bruikbaars (zoals `SheetKnoppen`, `TekstVeld`), dan breidt de Developer dat
  uit.
- **Shells:** `shells/bar` (product, lid, bezetting) en `shells/portal`
  (account-sheets) via gedeelde componenten; geen `useShell()`-uitbreiding.

## Betrokken shells

- **`shells/bar`:** `ProductBeherenOverlay`, `NieuwProductOverlay`,
  `LidBeherenOverlay`, `NieuwLidOverlay`, `BezettingOverlay`.
- **`shells/portal`:** `NaamWijzigenSheet`, `WachtwoordWijzigenSheet`,
  `PincodeSheet`, `TweestapSheet`, `SheetKnoppen`.
- **Gedeeld:** het pending-model en de onopgeslagen-regel in
  `src/components/` of `src/hooks/`; `Overlay` zelf verandert niet, tenzij
  vraag B een inline bevestigingsstap vraagt (dan alleen additief).

## Datamodel, RPC's, rolzichtbaarheid

**Geen datamodelwijziging, geen nieuwe of gewijzigde RPC, geen migratie,
geen rolwijziging in T06 zelf.** Zichtbaarheid per rol blijft gelijk.
Backend-idempotentie uit vraag C optie 3 is expliciet een apart ticket met
eigen spec (en `db:test`/`rpc_catalogus`-gevolgen).

## ADR nodig?

**Nee voor T06 zelf** onder vraag A optie 1 en vraag B optie 3: het
beleid past in het T05-contract en `CLAUDE.md`. **Wel** een ADR als Bram voor
vraag A optie 2 kiest (een taaklaag buiten dialogen is een beslissing die
ADR 0014 raakt) of voor vraag C optie 3 (idempotentiesleutels op geld-RPC's
zijn een beslissing die elke volgende geldfeature raakt). Dan schrijf ik die
ADR bij die spec, niet erna.

## Randgevallen

- **Fout tijdens pending van een andere sectie:** elke sectie bewaart zijn
  eigen fout (F11); de fout van naam verdwijnt niet doordat archiveren
  start. Pas bij een nieuwe poging van dezelfde actie of een wijziging van
  zijn invoer wordt die fout gewist.
- **Responses in omgekeerde volgorde:** door serialisatie per object niet
  meer mogelijk binnen één dialoog. Twee dialogen voor hetzelfde object zijn
  verboden (ADR 0014). Een verversing van de lijst tijdens pending mag het
  lokale object niet terugzetten (de Developer toetst dit met een
  vertraagde en omgekeerde route in de test).
- **`member_not_found` / `product_not_found` tijdens pending:** de dialoog
  blijft open met de fout en `onChanged()` ververst de lijst, zoals nu;
  `closeBlocked` valt weg zodra de fout er is, zodat de gebruiker kan sluiten.
- **Pending dat nooit eindigt** (netwerk hangt), besluit 1:
  - *Beheerdialogen zonder geld* (Product beheren, Nieuw product, Lid beheren,
    Bezetting, portal-sheets): na **30 seconden** zet de hook de status op
    "onbekende uitkomst" en valt `closeBlocked`, zodat de gebruiker niet
    voor altijd is opgesloten. Tekst: besluit 3.
  - *Geldoverlays* (Afrekenen, Opwaarderen, Nieuw lid met startsaldo): **geen
    time-out.** `closeBlocked` blijft tot het verzoek echt klaar is,
    ongewijzigd. Een hangend geldverzoek houdt de dialoog dus geblokkeerd, en
    de controleknop blijft disabled zolang het pending is. Bewust gevolg:
    een echt hangend geldverzoek houdt de dialoog vast tot herladen; er is
    geen backend-idempotentie om daarna veilig opnieuw te proberen (apart
    ticket, vraag C optie 3).
- **Dubbele klik of Enter-herhaling in een formulier:** de `status`-guard
  bestaat al; het nieuwe pending-model dekt ook Enter in `<form onSubmit>`
  (de portal-sheets).
- **Focus tijdens pending:** de T05-regel geldt (verliest een disabled
  control de focus, dan naar de dialoogcontainer). Na succes of fout gaat
  de focus naar de sectie met het resultaat (de foutregel of het veld), niet
  naar `body`.
- **Nieuw lid met startsaldo:** de invoer is tijdens pending bevroren
  (naam, saldo, e-mail), zonder time-out (geldoverlay, besluit 1); na een
  echte netwerk-/onbekende fout geen "Toevoegen" met dezelfde waarden zonder
  de controlestap uit vraag C.
- **Bestelling terugdraaien in Lid beheren** (besluit 4): disabled zolang er
  een wijziging voor dit lid loopt, met een uitlegregel (tekst: besluit 4).
  Past in de serialisatie per object; de terugdraai-RPC zelf verandert niet.
- **Toast in `LidBeherenOverlay`** (3,5 s, `aria-live`): blijft; de nieuwe
  statusregel per sectie is aanvullend, niet in plaats van.

## Teststrategie

De Reviewer controleert deze lijst; de Tester voert de handmatige reeks uit.

**Unit (`npm test`):** pure delen van het pending-model en de
onopgeslagen-definitie (wat telt als gewijzigd, voor prijs, naam, e-mail,
rol, Nieuw lid/product); de serialisatieregel (tweede actie tijdens pending
geweigerd).

**E2E (Playwright, nieuw bestand `e2e/opslaan-sluiten-pending.spec.ts`,
vertraagde routes via `page.route` voor deterministische pending):**

1. Product beheren: prijs 2,75 opslaan met vertraagde RPC, direct Escape,
   backdrop, Sluiten: dialoog blijft, `status`-regio toont de melding,
   `aria-busy` staat, prijsveld en knop zijn bevroren; na antwoord sluit
   Escape wel.
2. Hetzelfde voor Nieuw product, Nieuw lid (met startsaldo), Lid beheren
   (naam, e-mail, rol, archiveren), Bezetting en een portal-sheet.
3. Lid beheren: start naam-opslaan (vertraagd), probeer rol en archiveren:
   die zijn disabled met zichtbare uitleg; geen dubbele aanroep (tel de
   requests).
4. Foutbehoud: naamwijziging faalt, daarna een andere actie: de naamfout
   blijft staan; een tweede fout verdringt hem niet.
5. Omgekeerde responsevolgorde: waar het product het toelaat (verschillende
   objecten of een verversing van de lijst tijdens pending), komt een late,
   oudere response nooit terug als nieuwste state.
6. Onopgeslagen (vraag B): gewijzigd veld plus Escape/backdrop toont de
   keuze; ongewijzigd of net opgeslagen formulier sluit zonder vraag; de
   bewuste Annuleren-knop volgt de gekozen variant.
7. Onbekende geldstatus (vraag C): een echte netwerk-/onbekende fout (request
   afgebroken, niet een time-out) op `place_order`/`top_up`/`create_member`
   toont de controletekst, geen "probeer opnieuw", en er volgt geen
   automatische tweede request (tel requests). De controleknop is disabled
   zolang het verzoek pending is. **Geen time-outtest voor geld:** een
   hangend geldverzoek houdt de dialoog geblokkeerd (besluit 1); dat is
   juist wat de test bevestigt (na ruim 30 s blijft `closeBlocked` staan).
   De 30 s-time-out wordt alleen getest voor beheerdialogen zonder geld
   (Product beheren, Lid beheren, Nieuw product, Bezetting, portal-sheets):
   na 30 s valt de blokkade, de generieke time-outtekst staat er en de
   dialoog is sluitbaar.
8. Focus: tijdens en na pending nooit op `body`.

**Axe:** een open Product beheren in pending-toestand en een
Lid beheren met een fout in de a11y-scan (stateful blok), op `wcag2a`/`wcag2aa`.

**Backend:** geen in T06. Idempotentietests komen bij het aparte ticket uit
vraag C. De UI mag niet claimen dat dubbele boeking is uitgesloten.

**Handmatig (Tester):** trage verbinding op de bar-tablet en de telefoon
(opslaan, Escape, backdrop-tik), schermlezer op de statusregio's en fouten
per sectie. Zonder die reeks claimt de PR geen werking op Safari, touch of
schermlezer.

**Regressie:** bestaande e2e-specs (`bestelling-terugdraaien`,
`bezetting-beheren`, `ledenbeheer-invite`, `portal-profiel`,
`dialogen-tabs-landmarks`) blijven groen; een gewijzigde assertie hoort in
de PR-beschrijving uitgelegd.

## Afstemming met afhankelijke tickets

- **#131 (T11)** bouwt de grotere ledendetailvariant (F24) en
  sectiefeedback op dezelfde `LidBeherenOverlay`. Conflictvlak is groot:
  het pending-model per sectie is precies wat sectiefeedback nodig heeft.
  **Voorstel:** T06 levert het pending-model en het foutbehoud per sectie,
  T11 gebruikt dat voor de nieuwe layout. Wie als eerste merget, past de ander
  aan. Besluit hierover is aan Bram (Vraag E hieronder).
- **#140:** pending-E2E voor de vijf bestaande geldoverlays; T06 raakt die
  niet, tenzij vraag C de tekst bij onbekende uitkomst daar ook wijzigt.
  Dan wordt #140 daarop afgestemd.
- **#125 (T05):** gemerged; `closeBlocked` is het mechanisme. Wijzigingen
  aan `Overlay` alleen additief.

### Vraag E: volgorde met T11

**Aanbeveling:** T06 eerst, T11 daarna op het pending-model. Alternatief is
tegelijk in één PR, wat de review groot maakt voor twee verschillende
doelen (gedrag versus layout).

## Expliciet buiten scope

- Een taaklaag of statusbalk buiten de dialoog (tenzij vraag A optie 2).
- Backend-idempotentie, idempotentiesleutels, migraties of wijzigingen aan
  geld-RPC's (apart ticket, vraag C optie 3).
- Een saldocorrectie in de app of het corrigeren van dubbele leden.
- Layout, ledendetailvariant en e-mailuitleg (T11/#131).
- Pending-E2E voor Opwaarderen, Dienst afsluiten, Overnemen, Afmelden en de
  bar-Terugdraaien (#140).
- Wijzigingen aan `Overlay` buiten wat vraag B (inline bevestiging) nodig
  heeft.
- Offline/PWA, auth- of schemawijzigingen, een verklaring van WCAG-conformiteit.
