# Herstelbare leesfouten en actuele portaldata

**Status: deels gebouwd (PR #159, a34bed6): alles behalve het
PortalShellHome-deel, dat wacht op #115.** Zie "Zoals gebouwd" onderaan.
Goedgekeurd door de Architect namens Bram (2026-10-05). Bram heeft voor dit
ticket uitdrukkelijk gezegd dat de Architect de keuzes zelf maakt (de "stel de
vraag en wacht"-regel uit `CLAUDE.md` is hier opgeheven); de keuzes staan onder
"Besluiten Architect" en zijn de conservatiefste variant waar het kon.

Spec voor [issue #128](https://github.com/BramLambertJansen/ABAS/issues/128)
(frontend T08 · P2, epic #121, findings F13 en F14, labels `bug`,
`shell:bar`, `shell:portal`). Gevalideerd tegen `main` op `70ad465`. Bouwt
voort op [`portal-dashboard.md`](portal-dashboard.md),
[`portaltransacties-consistent.md`](portaltransacties-consistent.md) (T09,
gebouwd) en [`opslaan-sluiten-pending.md`](opslaan-sluiten-pending.md) (T06,
gebouwd; focus- en pendingconventies). Verwant: #115 (eigenaar van de
foutclassificatie van de portal-sessielookup), #78, #51, #67 (zie "Gerelateerde
issues").

## Doel

Een tijdelijke storing verandert niet in een onjuiste accountmelding. De
gebruiker kan op elk leesscherm herstellen met "Opnieuw proberen", verliest
daarbij geen invoer, en de portal laat zien hoe actueel saldo en transacties
zijn en ververst ze bij terugkeer. Alleen frontend: geen RPC, RLS, migratie,
schema of auth-/sessiebeleid, en niets dat geld, saldi of attributie raakt.

## Gelezen bronnen

- **Ticket #128**, #115, #78, #51, #67 (volledige tekst gelezen), plus T09
  (`portaltransacties-consistent.md`, "Zoals gebouwd") en T06
  (`opslaan-sluiten-pending.md`, "Zoals gebouwd").
- **Wireframe** `designs/Lid App.dc.html` (saldo- en transactiescherm): geen
  verversactie of actualiteitsregel ontworpen. Dat is een toevoeging, geen
  afwijking van een ontwerpkeuze; het in-app design system is de waarheid.
- **Code**: `src/hooks/queries/` (`usePortalSession`, `usePortalBalance`,
  `usePortalTransactions`, `usePortalAppSettings`, `usePortalProfiel`,
  `useMijnDienst`, `useBarNamen`, `useBarAuth`, `useMembers`, `useProducts`,
  `useShiftMembers`, `useBeheerSession` en de andere leeshooks),
  `src/lib/loadErrors.ts`, `src/lib/clientErrors.ts`,
  `src/features/portal-dashboard/`, `src/shells/portal/PortalShellHome.tsx`,
  `src/features/bar-sessie/` (`BarApp`, `BarSessieProvider`),
  `src/features/bar-inloggen/BarInloggen.tsx`, `DienstStarten`,
  `ActiviteitKeuze`, `VerkoopScherm`, `Mandje`, de lijsten in logboek,
  dienst-overzicht, ledenbeheer, assortimentbeheer, bezetting.
- **Kaders**: `CLAUDE.md` (`check:policy`: geen kale `console.error` in
  `src/hooks/queries/`, fouten via `src/lib/clientErrors.ts`; de client
  berekent nooit een bedrag), `docs/ARCHITECTURE.md`, ADR 0009 (portal-cookie),
  ADR 0012 (portal-eigen data), ADR 0015 (client-fouten via RPC), ADR 0016
  (dienst hoort bij sessie).

## Validatie van de bevindingen op actuele main

Het ticket is geschreven op `ebca054`. Sindsdien is veel gebouwd (o.a.
dienst-per-sessie, T05 tot T07, T09); onderstaande is gecontroleerd op
`70ad465`.

### F13 (leesfouten): deels bevestigd, deels achterhaald

- **Portal-sessielookup: bevestigd.** `usePortalSession.ts`: de `catch` rond
  de `members`-lookup zet `denied` met `DENIED_MESSAGE` ("Dit account is niet
  gekoppeld aan een lid."), identiek aan "lookup geslaagd, geen rij".
  `PortalShellHome` toont dat via `PortalLogin deniedMessage`, zonder
  opnieuw-proberen. Eigenaar van de fix: #115.
- **Eindeloze loader in dezelfde hook (extra bevinding, niet in het
  ticket):** `supabase.auth.getSession().then(...)` heeft geen `.catch`.
  Een afgewezen `getSession()` laat `usePortalSession` voor altijd op
  `loading` staan ("Bezig met laden…" zonder uitweg).
- **Achtergrondlookup kan het dashboard wegslaan (extra bevinding):**
  `onAuthStateChange` roept `resolve()` bij elk auth-event aan
  (`TOKEN_REFRESHED`, `SIGNED_IN` bij terugkeer naar het tabblad). Zodra de
  `catch` van #115 een foutstaat zet, zou een mislukte achtergrondlookup een
  werkend dashboard vervangen door een foutscherm. `resolve()` heeft ook
  geen volgordeguard: een late lookup van een oude identiteit kan die van
  een nieuwe overschrijven (acceptatiecriterium 6).
- **Barstartscherm (F13, tweede helft): achterhaald in vorm, aanwezig in
  essentie.** `useOpenShift`/`DienstStarten#L243` bestaan niet meer. Het
  startscherm zonder sessie is nu `BarInloggen` met `useBarNamen`
  (`GET /inloggen/namen`). Bij `namen.status === "error"` staat er wél een
  "Opnieuw proberen" (het ticket zegt dat die ontbreekt: niet meer waar),
  maar de "Inloggen met e-mail"-link naar `/beheer` staat alleen in de
  `ready`-tak. Bij een mislukte namenlijst is de e-mailingang dus nog
  steeds onbereikbaar. Dat is de overgebleven bevinding.
- **Bar-fase `fout`** (`BarApp`, `my_bar_state` mislukt na login): heeft
  "Opnieuw proberen" (`sessie.herlaad`). Dat werkt. Geen e-mailingang, en
  die is hier ook niet nodig: er is dan al een sessie.
- **Leesschermen zonder herstelactie (bevestigd):** alleen foutregel, geen
  knop: Verkoop (assortiment `products`, ledenlijst in `Mandje`,
  `crew`/bezettingspil, `appSettings`), `ActiviteitKeuze` (`loadErrorMessage`),
  `LogboekLijst`, dienst-overzicht `Transactielijst`, `LedenLijst`,
  `LidBestellingenOverlay`, `DienstActief` (bezetting), `ProductenLijst`,
  `NegatieveLimietInstellingen`, `ActiviteitstypesInstellingen`, en de
  portal-tabs Saldo en Transacties (`usePortalBalance`,
  `usePortalTransactions`, `usePortalAppSettings`). Wel een knop hebben:
  `BarInloggen` (namen), `BarApp` en `Assortimentbeheer` (fase `fout`),
  `BezettingOverlay` (kandidaten), portal `AccountTab` (profiel),
  `TweestapSheet`.
- **Foutteksten portal-leeshooks (bevestigd):** `usePortalBalance`,
  `usePortalTransactions` en `usePortalAppSettings` zeggen bij elke fout
  "Controleer de verbinding", ook bij een serverfout; alleen
  `usePortalProfiel` gebruikt `loadErrorMessage` (#68). Bij `!data` in
  `usePortalBalance` staat ook "Controleer de verbinding", terwijl de
  verbinding dan werkt.
- **`useBeheerSession` (nagaan van #115): zelfde patroon, maar al deels
  goed.** Zijn `catch` zet `denied` met een eigen tekst ("Kon niet
  controleren of dit account mag inloggen — probeer opnieuw in te loggen."),
  niet "niet gekoppeld". Hij heeft wél een volgordeguard (`request`). Er is
  geen opnieuw-proberen-knop. Dat is #115-gebied, zie "Gerelateerde issues".
- **Volgordeguard per hook (T08 criterium 6):** `useMijnDienst` en
  `useBeheerSession` hebben een `request`-teller. De meeste andere
  leeshooks (`usePortal*`, `useMembers`, `useProducts`, `useShiftMembers`)
  hebben alleen een `cancelled`-vlag die in de `catch` wordt gelezen en
  voorkomt niets: een late respons kan de state van een nieuwere laadronde
  overschrijven. Op de bar is dat afgedekt doordat `DienstTabs` per
  `session.id:shift.id` gekeyd is (remount), op de portal niet.

### F14 (verouderde portaldata): bevestigd

- `usePortalBalance`, `usePortalTransactions` en `usePortalAppSettings`
  laden alleen bij mount; `refetch()` zet `status: "loading"` en vervangt de
  getoonde data door "laden…". Nergens wordt `visibilitychange`, `focus` of
  `online` beluisterd. (De Supabase auth-client doet dat wel, voor tokens:
  dat kan een `onAuthStateChange`-event geven, maar ververst geen saldo.)
- Er is geen verversknop en geen "bijgewerkt om"-regel. `PortalDashboard`
  documenteert zelf "geen live-subscriptie in v1"; `portal-dashboard.md`
  (Randgevallen) noemt "refetch bij opnieuw binnenkomen (focus/mount)", maar
  focus is nooit gebouwd: alleen mount (tabwissel).
- Tabs mounten alleen terwijl ze actief zijn (`PortalDashboard`). Saldo en
  Transacties lezen daarom onafhankelijk dezelfde transacties; de Saldo-tab
  heeft saldo, instellingen en transacties in drie losse hooks met drie
  losse laadstatussen.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC.** Alleen lezen. Saldo en transactiebedragen worden
  getoond zoals de server ze levert; er komt geen berekening bij (geen
  verschil "oud saldo naar nieuw saldo", geen optelling). Er komt geen
  schrijfpad bij en `place_order`, `top_up` en de terugdraai-RPC's blijven
  onaangeraakt. Het "Bijgewerkt om"-tijdstip is de klokstand van het apparaat
  bij een geslaagde lezing, geen bedrag en geen autorisatie-informatie.
- **`served_by` uit de bezetting.** Niet geraakt. De bestaande
  checkout-/opwaardeerblokkades in `VerkoopScherm` (bezetting, ledenlijst,
  producten en instellingen moeten `ready` zijn) blijven ongewijzigd en
  worden alleen met een test vastgezet.
- **Dataversheid is geen autorisatie** (ticket, Verificatie). Een verouderd
  of mislukt gelezen scherm geeft geen extra rechten; RLS en RPC-guards
  beslissen, ook als de client een oude waarde toont. Een verlopen sessie
  blijft `signed-out` (loginscherm), niet "leesfout".
- **ADR 0009 (portal-cookie-isolatie).** Alle nieuwe portalcode gebruikt
  `portalClient`; de gedeelde componenten en hooks importeren geen
  Supabase-client.
- **Hergebruik** (CLAUDE.md, "Componenten zijn herbruikbaar"): bestaande
  patronen hergebruikt (`loadErrorMessage`/`reportClientError`,
  "Opnieuw proberen"-knopstijl van `AccountTab`, `useHerstelFocus`,
  `aria-disabled` i.p.v. `disabled` voor focusbehoud zoals `BeheerLogin`/#77,
  de `request`-teller uit `useMijnDienst`). Nieuw wordt alleen gemaakt waar
  het nog niet bestaat; zie "Gedeelde onderdelen".

## Betrokken shells

- **`shells/portal`**: Saldo- en Transactiestab (verversing, actualiteit,
  stale-status), `PortalShellHome` (foutstaat sessie, keyed dashboard).
- **`shells/bar`**: `BarInloggen` (e-mailingang bij fout), en de
  herstelknop op de leesschermen uit de lijst hierboven.
- Alles via gedeelde componenten in `src/components/` en hooks in
  `src/hooks/`; features blijven shell-onwetend (`check:arch`). Geen
  `useShell()`-contract: de herstelknop en verversregel zien er in beide
  shells hetzelfde uit, alleen de toon (`light` of `rail`) verschilt.

## Gedeelde onderdelen (nieuw, klein)

1. **`src/lib/verversen.ts` (puur, unit-getest).** (a) `moetVerversen({
   laatsteSuccesMs, nuMs, minIntervalMs, bezig, laatsteMislukt, bron })`: de
   beslisregel voor terugkeer/verbindingherstel; (b) `bijgewerktLabel(ms)`:
   "Bijgewerkt om 14:32" in vaste tijdzone `Europe/Amsterdam` (zelfde
   conventie als T09: `PORTAL_TIME_ZONE` verhuist naar dit bestand en
   `transacties.ts` importeert hem; `src/lib` importeert nooit uit
   `src/features`, en een tweede constante is duplicatie); (c) de vaste teksten
   (zie "Teksten").
2. **`src/hooks/useVerversBijTerugkeer.ts`.** Luistert op
   `document.visibilitychange` (alleen naar `visible`) en `window.online`,
   past `moetVerversen` toe en roept de meegegeven `ververs()` aan.
   Verwijdert zijn listeners bij unmount. Geen polling, geen interval.
3. **Stale-while-revalidate in de portal-leeshooks.** `usePortalBalance`,
   `usePortalTransactions`, `usePortalAppSettings` krijgen hetzelfde,
   uniforme extra veldenpaar zodat de schermen identiek reageren; de
   bestaande velden (`status`, `message`, `balance`, `transactions`,
   `settings`, `refetch`) blijven bestaan en T09-consumenten blijven werken:
   - `status` blijft `loading | error | ready`. Een `refetch()` of `ververs()`
     vanuit `ready` laat `status` op `ready` staan met de oude data.
   - `ververs: { bezig: boolean; mislukt: boolean; bijgewerktOp: number |
     null }` (laatste geslaagde lezing, ms-klok van het apparaat).
   - Mislukt een verversing vanuit `ready`: data en `status: "ready"`
     blijven, `ververs.mislukt = true`, de fout gaat via `reportClientError`.
     Mislukt de allereerste laadronde (of `refetch()` vanuit `error`): `status:
     "error"` zoals nu, met de klasse-tekst uit `loadErrorMessage`.
   - **Volgordeguard (last request wins):** `useRef`-teller zoals in
     `useMijnDienst`; een antwoord van een oudere ronde wordt genegeerd; de
     cleanup van het effect verhoogt de teller zodat een antwoord na
     unmount (uitloggen tijdens de query) niets zet.
   - De gedeelde logica mag in één interne helper (`useStaleLezing`) in
     `src/hooks/queries/` leven, zodat de drie hooks niet driemaal dezelfde
     machine bevatten (duplicatie is een reviewfout). Die helper roept zelf
     geen Supabase aan; de hooks geven hun `load`-functie mee. Past binnen
     `check:policy` (queries blijven in de hooks, fouten via
     `clientErrors.ts`).
4. **`src/components/LeesFout.tsx`.** Foutregel plus "Opnieuw proberen". Props:
   `message`, `onRetry`, `bezig`, `tone: "light" | "rail"`. De knop is
   `aria-disabled` tijdens `bezig` (niet `disabled`, anders verliest hij de
   focus), de foutregel is `role="alert"`, hoogte van de knop minimaal 44px
   (zelfde maat als de bestaande herstelknoppen). Vervangt de losse
   foutregels op de schermen uit de lijst; de bestaande knoppen op
   `BarInloggen`, `BarApp`, `Assortimentbeheer`, `BezettingOverlay` en
   `AccountTab` mogen op dezelfde component overgaan als dat zonder
   gedragswijziging kan, maar dat is geen eis (zie "Besluiten", 13).
5. **`src/components/VerversStatus.tsx`** (alleen portal-gebruik nu, maar
   shell-onwetend). Toont "Bijgewerkt om 14:32" en een knop "Verversen";
   tijdens `bezig` "Bezig met verversen…" (knop `aria-disabled`, focus blijft
   op de knop); na `mislukt` "Verversen mislukt. Je ziet de gegevens van
   14:32." (zie Teksten). De live-regio is `role="status"` (beleefd), niet
   `role="alert"`: de data blijft bruikbaar.
6. **Focus.** Elke herstelflow volgt de T06-regel "focus nooit op `body`".
   Bij een geslaagde retry vanuit `error` verdwijnt de knop uit de DOM; de
   focus gaat dan (via `useHerstelFocus`) naar de herstelde sectie
   (`tabIndex={-1}`, `aria-label` op het gebied of de kop ervan). Bij een
   mislukte retry blijft de focus op de knop (hij verdwijnt dan niet). De
   verversknop in `VerversStatus` blijft altijd gemount, dus daar is geen
   focushersteller nodig.

## Schermgedrag

### Portal

**`PortalShellHome`** (integratie met #115, zie "Gerelateerde issues"):
1. `loading` blijft de neutrale laadtekst.
2. `signed-out` blijft het loginscherm (de verlopen-sessie-staat: een aparte
   staat, geen leesfout).
3. `denied` blijft uitsluitend "lookup geslaagd, geen `members`-rij" (#115).
4. De foutstaat van #115 toont de laad-/verbindingsfout met "Opnieuw
   proberen" via `LeesFout` (tone `light`), zonder loginformulier en zonder
   "niet gekoppeld"-tekst.
5. `signed-in` bevat daarnaast `userId`, en `PortalDashboard` krijgt
   `key={userId}`: een andere identiteit herstart alle tabs en hooks, zoals
   `BarSessieProvider` dat met `sleutel` doet.
6. **Achtergrondlookup:** wanneer de sessie al `signed-in` is en een volgende
   auth-event een nieuwe lookup start, blijft `signed-in` staan; die lookup
   mag niet naar `loading` of de foutstaat terugvallen. Alleen de eerste
   lookup en een lookup voor een andere `userId` kunnen de foutstaat geven.
   Een `members`-rij die verdwenen is (lookup geslaagd, geen rij) blijft
   `denied`, ook op de achtergrond. Een auth-event voor dezelfde `userId`
   terwijl een lookup loopt start geen tweede request. `resolve()` krijgt
   een volgordeguard (de laatste identiteit wint).
7. `getSession()` krijgt een `.catch`: een afgewezen sessielezing geeft de
   foutstaat (met opnieuw proberen), nooit een eindeloze loader.

**Saldo-tab:**
- Bovenaan het gebied (boven de saldokaart) staat `VerversStatus`, zodra er
  minstens één keer data is. Eén knop ververst saldo, instellingen en
  transacties samen; `bijgewerktOp` is de oudste van de drie.
- Eerste laadronde: ongewijzigd "laden…". Mislukt de eerste ronde van een
  van de drie: die sectie toont `LeesFout` met een eigen "Opnieuw proberen"
  (alleen die hook), de rest blijft staan zoals nu.
- Daarna: een mislukte verversing laat saldo en lijst staan met de melding
  "Verversen mislukt…". De laag-saldokaart gebruikt alleen een `ready`
  drempel (bestaande regel); bij een mislukte verversing van de instellingen
  blijft de oude drempel staan, bij nooit geladen drempel verschijnt de kaart
  niet (ongewijzigd).
- De Saldo-tab heeft geen schrijfknoppen; er is dus niets om te blokkeren.

**Transacties-tab:** dezelfde `VerversStatus` boven de filters; verversen
herlaadt de transacties. Het gekozen filter blijft staan (client-side state,
niet gekoppeld aan data). Het saldo is hier niet zichtbaar; het wordt vers
geladen zodra de gebruiker terug naar Saldo gaat (mount-per-tab, zoals nu).
Een expliciete tabwissel doet dus altijd een verse lezing, ook bij
`minIntervalMs` (de drempel geldt alleen voor terugkeer/verbindingherstel).

**Terugkeer:** het tabblad wordt weer zichtbaar of de browser meldt `online`:
`useVerversBijTerugkeer` ververst de zichtbare hooks via dezelfde `ververs()`
als de knop (één request per hook, geen tweede). Zie beslissing 3 voor de
regels.

**Account-tab:** ongewijzigd (profiel heeft al `LeesFout`-equivalent); alleen
de bestaande foutregel mag op `LeesFout` overgaan. Geen verversregel, geen
schrijfwijziging.

### Bar

- **`BarInloggen` bij `namen.status === "error"`:** naast de foutregel en
  "Opnieuw proberen" (nu al aanwezig, via `LeesFout` tone `rail`) staat
  ook de "Inloggen met e-mail"-link naar `/beheer` (zelfde tekst
  `STARTSCHERM.emailLink`, zelfde stijl als in de `ready`-tak; de link
  wordt één keer gedefinieerd en in beide takken gerenderd, niet gekopieerd).
  Zo blijft de alternatieve login bereikbaar als de namenlijst faalt, ook
  tijdens "laden…".
- **Alle leesschermen uit de bevindingenlijst** krijgen `LeesFout`
  (foutregel plus "Opnieuw proberen" gekoppeld aan de `refetch` van de
  betreffende hook; `ActiviteitKeuze` aan `activiteitTypes.refetch`).
  Meerdere fouten tegelijk op Verkoop: elke sectie krijgt de knop van haar
  eigen hook (assortiment, ledenlijst in `Mandje`, bezetting); de
  `checkoutNotice`-tekst in `Mandje` blijft zoals nu en wijst naar de
  getoonde herstelknop.
- **Geen invoerverlies:** een retry roept alleen `refetch` van de hook aan.
  Mandje, gekozen lid en zoektekst staan in de T03-`draft` (gelift in
  `DienstTabs`, #43) en blijven staan; `BarInloggen` bewaart de gekozen
  naam en het ingetypte wachtwoord niet bij een namen-retry (die staat dan
  nog niet op het scherm, want er is nog geen lijst). `VerkoopScherm`
  verandert niets in de volgorde waarin hooks data naar het mandje
  teruggeven (de bestaande snapshot-guard rond `selectedMemberSnapshot`
  blijft).
- **Schrijven geblokkeerd:** onveranderd. `checkoutReady`, `topupDisabled`
  en de bezettingsguard in `VerkoopScherm` houden Afrekenen en Opwaarderen
  geblokkeerd zolang ledenlijst, producten, instellingen of bezetting niet
  `ready` zijn. Een retry heft de blokkade pas op zodra de data weer `ready`
  is.
- **Verouderde antwoorden:** de leeshooks die een identiteit of dienst als
  parameter hebben (`useShiftMembers(shiftId)`, `useShiftLedger`,
  `useShiftSummary`, `useMemberOrders`) krijgen dezelfde `request`-teller;
  een late respons voor een oude dienst of een ander lid vervangt de data
  niet. De overige bar-leeshooks hebben geen parameter en blijven zoals ze
  zijn (`DienstTabs` is gekeyd per sessie en dienst).

## Teksten

Alle foutteksten komen uit `loadErrorMessage` (`src/lib/loadErrors.ts`, #68).
Nooit de ruwe fout op het scherm, wel de korte code zoals nu. Nieuw en vast:

| Plek | Tekst |
|---|---|
| Herstelknop (overal) | "Opnieuw proberen" (bestaande tekst) |
| Bezig met herstellen | "Opnieuw proberen…" (knop `aria-disabled`) |
| Portal-ververslabel | "Bijgewerkt om {HH:mm}" |
| Portal-verversknop | "Verversen" |
| Verversen bezig | "Bezig met verversen…" |
| Verversen mislukt, data blijft | "Verversen mislukt. Je ziet de gegevens van {HH:mm}." plus de bestaande klasse-tekst (verbinding of serverkant) |
| `usePortalBalance` bij `!data` | "Kan het saldo niet laden. Log opnieuw in." (zelfde patroon als `usePortalProfiel`) |
| `usePortalBalance`/`Transactions`/`AppSettings` bij catch | `loadErrorMessage("Kan het saldo niet laden." / "Kan de transacties niet laden." / "Kan de instellingen niet laden.", err)` |

De tekst voor de sessielookup (#115) wordt door #115 vastgesteld.

## Besluiten Architect (namens Bram, 2026-10-05)

Bram heeft voor dit ticket de keuzes bij de Architect gelegd. Per keuze: de
vraag, het antwoord, één zin reden. Waar twijfel was, is de
conservatiefste optie gekozen.

1. **Vraag:** wie bouwt de foutclassificatie van `usePortalSession` (#115
   of dit ticket)? **Antwoord:** #115 bouwt die en haar test (hookstaat,
   foutscherm met "Opnieuw proberen", e2e met 500 en netwerkfout); T08 bouwt
   daarna alleen wat hierboven onder "PortalShellHome" 5 tot 7 staat
   (`userId` plus `key`, achtergrondlookup valt niet terug, volgordeguard,
   `getSession`-catch). **Reden:** het ticket schrijft dubbele
   implementatie uitdrukkelijk uit, en deze volgorde laat elk ticket één
   eigenaar. Volgorde: #115 eerst mergen; staat #115 nog open als de
   Developer bij T08 begint, dan stopt de Developer voor het
   `PortalShellHome`-deel en meldt dat, in plaats van de classificatie zelf
   te bouwen.
2. **Vraag:** blijven bekende data zichtbaar bij een mislukte verversing, en
   waar? **Antwoord:** alleen op de portal (Saldo, Transacties); op de bar
   alleen herstelknoppen en de bestaande fail-closed gedrag, geen
   stale-while-revalidate in de bar-leeshooks. **Reden:** de portal heeft
   geen schrijfknoppen, dus oude data tonen is risicoloos; op de bar
   blokkeert een mislukte lezing nu Afrekenen en dat is veiliger dan
   afrekenen met een oud saldo.
3. **Vraag:** wanneer ververst de portal? **Antwoord:** op de verversknop,
   bij `visibilitychange` naar zichtbaar en bij `online`, nooit via polling
   of Realtime. Terugkeer ververst alleen als de laatste geslaagde lezing
   30 seconden of ouder is, of als de laatste poging mislukte; `online`
   ververst altijd, behalve als er al een lezing loopt; een lezing die al
   loopt wordt nooit opnieuw gestart. **Reden:** het ticket verbiedt
   permanente polling en Realtime zonder behoefte; 30 s voorkomt dubbele
   requests bij snel wisselen van tabblad en is makkelijk te wijzigen.
4. **Vraag:** hoe tonen we de actualiteit? **Antwoord:** een vaste regel
   "Bijgewerkt om HH:mm" (Amsterdamse tijd, klok van het apparaat) bovenaan
   Saldo en Transacties, geen aparte "verouderd"-drempel of -kleur.
   **Reden:** een tijdstip is waarheidsgetrouw en zonder gokken over wat "te
   oud" is; een drempel zou een productkeuze zijn die niemand vroeg.
5. **Vraag:** ververst het saldo samen met de historie? **Antwoord:** ja, op
   de Saldo-tab één knop en één `bijgewerktOp` (de oudste) voor saldo,
   instellingen en transacties; op de Transacties-tab alleen de transacties,
   het saldo volgt bij de volgende mount van Saldo. **Reden:** dat is wat de
   gebruiker per scherm ziet en het houdt het mount-per-tab-patroon
   (T09, `PortalDashboard`) intact.
6. **Vraag:** wat gebeurt er bij een identiteitswissel op de portal?
   **Antwoord:** `PortalDashboard` krijgt `key={userId}` (alle hooks en
   tabstate resetten) en alle portal-leeshooks krijgen een
   laatste-request-wint-guard. **Reden:** dat is het bestaande patroon van
   `BarSessieProvider`/`useMijnDienst` en sluit het "late response"-risico
   zonder nieuwe architectuur.
7. **Vraag:** hoe blijft de alternatieve login bereikbaar op het
   barstartscherm? **Antwoord:** de "Inloggen met e-mail"-link staat ook
   bij laden en bij een fout van de namenlijst; in de fase `fout` (er is dan
   al een sessie) komt geen e-mailingang en geen uitlogknop bij. **Reden:**
   een uitlogactie tijdens een leesfout kan een open dienst losmaken, en dat
   raakt sessiebeleid (ADR 0016), buiten deze scope.
8. **Vraag:** één herstelcomponent of per scherm? **Antwoord:** één gedeeld
   `LeesFout` in `src/components/` (tone `light`/`rail`), één
   `VerversStatus`, één `useVerversBijTerugkeer`. **Reden:** CLAUDE.md
   behandelt duplicatie als reviewfout, en vijftien losse foutblokken met
   knop is precies dat.
9. **Vraag:** hoe voorkomen we focusverlies na herstel? **Antwoord:** retry
   blijft `aria-disabled` op dezelfde knop tijdens laden; bij succes gaat de
   focus naar de herstelde sectie (`useHerstelFocus`, `tabIndex={-1}`), nooit
   `body`. **Reden:** T06 heeft dit als vaste regel en deze flow haalt de
   knop uit de DOM.
10. **Vraag:** `role` van de verversmeldingen? **Antwoord:** een mislukte
    verversing met blijvende data is `role="status"`; een leesfout zonder
    data blijft `role="alert"`. **Reden:** bruikbare data blijven tonen
    rechtvaardigt geen onderbreking van de schermlezer.
11. **Vraag:** nemen we `useBeheerSession` mee (#115 vraagt om nagaan)?
    **Antwoord:** nee, wel gedocumenteerd hierboven. **Reden:** die hook
    toont al een eigen foutmelding en een volgordeguard, de resterende
    verbetering (retry-knop, device-accountmelding) hangt met #78 en #115
    samen en raakt de `/beheer`-modus.
12. **Vraag:** tonen we een aparte "sessie verlopen"-melding? **Antwoord:**
    nee; een verlopen sessie blijft `signed-out` met het gewone loginscherm
    (aparte staat, geen leesfout), en daarvoor komt geen nieuwe tekst.
    **Reden:** een melding vraagt onderscheid tussen verlopen en nooit
    ingelogd, wat sessiegedrag raakt.
13. **Vraag:** worden bestaande herstelknoppen (BarInloggen, BarApp,
    Assortimentbeheer, BezettingOverlay, AccountTab) verplicht naar
    `LeesFout` omgezet? **Antwoord:** nee, optioneel. **Reden:** niet
    nodig voor het ticket en elke omzetting kan een e2e-selector
    verschuiven; de Developer zet alleen om als de bestaande specs groen
    blijven.
14. **Vraag:** hoe gaat de achtergrondlookup van `usePortalSession` om met
    een fout? **Antwoord:** een al ingelogd dashboard blijft staan (zie
    "PortalShellHome" 6); er komt geen toast of melding. **Reden:** de
    lookup op de achtergrond is geen gebruikersactie, en het dashboard
    wegslaan om een mislukte token-refresh is erger dan even wachten.
15. **Vraag:** ADR nodig? **Antwoord:** nee (zie "ADR nodig?"). **Reden:**
    elke keuze past binnen bestaande patronen en `CLAUDE.md`.

## Wat wel en niet gebouwd wordt

**Wel (bouwklaar, frontend-only):** alles hierboven, mits #115 gemerged is
voor het `PortalShellHome`-deel (zie besluit 1). De onderdelen zonder #115-
afhankelijkheid (gedeelde onderdelen, portal-leeshooks, verversing,
bar-herstelknoppen, e-mailingang) kunnen eerder.

**Niet gebouwd, losse follow-ups (voorstel):**

- **Echte cross-client controle (barboeking op client A, portalrefresh op
  B):** dit vraagt een echte database en het boeken via de echte RPC met een
  bardienstsessie, dus een live-e2e of handmatige reeks, niet iets dat in
  deze frontendbouw kan. In T08 wordt het gemockt bewezen (de mock geeft bij
  de tweede lezing een ander saldo) en door de Tester handmatig gedaan. Voorstel
  voor een apart ticket: "Live e2e: bardienst boekt, lid-portal ververst" (Tester/
  infra, geen app-wijziging, geen backend-wijziging).
- **Stale-while-revalidate voor de bar-leeshooks:** zie besluit 2. Voorstel:
  ticket pas nadat is gemeten of bardienst het mist; frontend-only.
- **Verlopen-sessiemelding op de portal** (besluit 12) en **uitloggen uit de
  barfase `fout`** (besluit 7): raken sessiebeleid; als Bram dat wil, een
  eigen spec.
- **Backend-idempotentie en echte backendtests:** niet nodig voor T08, er
  is geen backendwijziging.

## Gerelateerde issues: wat wel en niet meegenomen

- **#115 (portal-sessielookup toont "niet gekoppeld"):** blijft eigenaar van
  de classificatie, de foutstaat, het foutscherm met "Opnieuw proberen" en
  de e2e met onderschepte `members`-request (500, netwerkfout) en
  ongekoppeld account. **Niet meegenomen in T08** (besluit 1). Meegenomen
  als integratie: `userId`/`key`, achtergrondlookup, volgordeguard,
  `getSession`-catch. Voorstel: één opmerking op #115 met een verwijzing naar
  deze spec zodat de Developer van #115 de extra stappen kent. Dit
  document verandert #115 niet.
- **#78 (/beheer op het bar-tablet toont "niet gekoppeld"):** **niet
  meegenomen.** Is een gedrags- en tekstkeuze van `useBeheerSession`/
  `BeheerLogin` in beheer (device-accountsituatie; sinds ADR 0016 is er geen
  gedeeld device-account meer, dus de vraag zelf moet eerst opnieuw getoetst
  worden). Valt buiten leesfout-herstel en portalactualiteit. Blijft open,
  niet stilzwijgend gesloten.
- **#51 (negatieflimiet-wijziging bereikt open verkoopscherm niet):** **niet
  meegenomen.** Gaat over staleness van instellingen op de bar na een
  beheeractie en vraagt een architectuurkeuze (Realtime of gedeelde cache)
  die dit ticket expliciet niet maakt (geen Realtime). T08 geeft de
  instellingen op Verkoop wel een herstelknop bij een leesfout; de
  verversing na `insufficient_balance` blijft #51. De
  `useVerversBijTerugkeer`-hook kan #51 later hergebruiken. Blijft open.
- **#67 (migraties niet automatisch op productie):** **niet meegenomen.**
  Deploy-/CI-proces, geen app-wijziging. T08 verbetert alleen wat de
  gebruiker bij zo'n storing ziet: `loadErrorMessage` (#68) maakt al
  onderscheid, en nu is er een herstelactie. Blijft open.
- **Afstemming:** T01/#122 (sessiestatus) en T03/#43 (draftbehoud): T03 is
  gebouwd (draft in `DienstTabs`), dus een retry verliest geen mandje.
  T01 raakt dezelfde `usePortalSession`; bij een conflict wint #115, daarna T01,
  daarna T08. T12/#132 (contrast, portalbreedte) raakt dezelfde schermen; de
  Developer neemt contrast van de nieuwe badges/regels mee volgens de dan
  geldende tokens, zonder T12 voor te sorteren.

## Datamodel, RPC's, rolzichtbaarheid

- **Datamodel:** geen wijziging. **RPC's:** geen nieuwe en geen gewijzigde;
  alleen bestaande reads (`members`, `app_settings`, `list_own_transactions`,
  `order_lines`, `my_bar_state`, bestaande bar-reads) worden vaker of opnieuw
  aangeroepen. **RLS/migratie/auth:** niets.
- **Rolzichtbaarheid:** onveranderd (ADR 0007, 0012, 0019). Een lid ziet nog
  steeds alleen eigen saldo en transacties; de verversing leest met dezelfde
  expliciete `auth_user_id`-filter/zelf-scopende RPC. Geen extra data, geen
  extra velden.

## Randgevallen

| Geval | Gedrag |
|---|---|
| Portal open, bardienst boekt een bestelling | Bij terugkeer naar het tabblad ververst Saldo automatisch als de laatste geslaagde lezing 30 s of ouder is, of direct als er nog geen geslaagde lezing is of de laatste poging mislukte; anders via "Verversen". Label toont de nieuwe tijd. |
| Verbinding valt weg, `online` volgt | Terugkeer ververst direct (behalve als er al een lezing loopt). |
| Verversen mislukt, data was er | Data blijft, melding "Verversen mislukt…", knop blijft; laag-saldokaart gebruikt de laatst bekende drempel. |
| Allereerste lezing mislukt | `LeesFout` met "Opnieuw proberen", geen verversregel (er is nog geen tijdstip). |
| Opnieuw proberen mislukt weer | Dezelfde foutregel, focus blijft op de knop; geen automatische herhaling, geen backoff-loop. |
| Uitloggen terwijl een lezing loopt | Antwoord wordt genegeerd (cleanup), niets wordt gezet; geen foutmelding. |
| Andere identiteit binnen dezelfde pagina | `key={userId}` herstart de boom; een late respons van de vorige identiteit wordt genegeerd. |
| Twee verversingen vlak na elkaar (knop plus terugkeer) | Eén request per hook; de knop is `aria-disabled` tijdens `bezig`, terugkeer slaat een lopende lezing over. |
| Auth-event bij tabterugkeer terwijl lookup faalt | Dashboard blijft staan (besluit 14). |
| Lid zonder `members`-rij | `denied`, ongewijzigd (#115). |
| Tabwissel Saldo naar Transacties | Verse lezing bij mount, ook binnen 30 s (alleen terugkeer gebruikt de drempel). |
| Namenlijst faalt op de bar | Foutregel, "Opnieuw proberen", en "Inloggen met e-mail" naar `/beheer`. |
| Verkoop: producten laden mislukt | Foutregel met knop; Afrekenen blijft geblokkeerd; mandje blijft staan. |
| Verkoop: alleen bezetting mislukt | Idem voor de bezettingspil; Afrekenen en Opwaarderen blijven geblokkeerd. |
| `visibilitychange` tijdens verborgen tab | Geen verversing zolang het tabblad niet zichtbaar is. |

## ADR nodig?

**Nee.** Er is geen echte architectuurbeslissing: de verversing gebruikt
bestaande browsergebeurtenissen, geen nieuwe datastroom, geen cache of
Realtime (dat zou #51 en een ADR vragen), geen wijziging van de
sessie- of geldlaag. De gedeelde onderdelen volgen bestaande patronen
(`useMijnDienst`-teller, `useHerstelFocus`, `loadErrors`).
`docs/ARCHITECTURE.md` krijgt een korte alinea bij de bouw.

## Teststrategie

De Reviewer controleert deze lijst; de Tester voert de handmatige reeks uit.

**Unit (`npm test`, pure code in `src/lib/verversen.ts`):**
- `moetVerversen`: terugkeer binnen 30 s en laatste lezing geslaagd: nee;
  precies 30 s: ja; laatste poging mislukt: ja, ook binnen 30 s; `online`
  ja behalve `bezig`; `bezig` altijd nee; nog nooit geladen: ja.
- `bijgewerktLabel`: vaste `Europe/Amsterdam`, ook rond de zomertijdwissel en
  op een UTC-runner; ongeldige of `null`-waarde geeft geen label.
- Teksten via `loadErrorMessage`: netwerk en server (met en zonder code) per
  portal-hook; `!data` geeft de "Log opnieuw in"-tekst.
- De pure state-overgangen van de stale-machine als die als functie
  uitgesplitst is (ready blijft ready bij mislukte verversing; error blijft
  error bij een mislukte retry; een oudere ronde wordt genegeerd).

**E2E (Playwright, gemockt, nieuw `e2e/leesfouten-herstel.spec.ts`;
vertraagde en onderschepte routes via `page.route`), negatieve gevallen
eerst:**
1. Portal, `members`-lookup geeft 500, daarna netwerkfout: geen "niet
   gekoppeld" (dat blijft voor de ongekoppelde account, bestaande spec), wel
   de laad-/serverfout met "Opnieuw proberen" (de assertie hangt aan #115;
   T08 test alleen dat dit blijft). Retry herstelt zonder login.
2. Portal, saldo-/transactie-/instellingenlezing faalt: `LeesFout`; retry
   herstelt; foutmelding verschilt tussen verbinding en server (code
   zichtbaar, geen ruwe fout).
3. Portal, eerst geladen, dan verversing mislukt: data blijft zichtbaar,
   "Verversen mislukt…", label ongewijzigd, daarna herstel zet het label
   op de nieuwe tijd.
4. Verouderde data: mock geeft bij de tweede lezing een ander saldo; na
   `visibilitychange` (via `page.evaluate` die het event stuurt) en na
   "Verversen" staat het nieuwe saldo er, en de transactielijst is ook
   ververst.
5. Geen dubbele oproepen: knop en `visibilitychange` vlak na elkaar leveren
   één `members`-request en één `list_own_transactions`-request per ronde
   (tellen via de routes); binnen 30 s geeft terugkeer geen request; een
   tweede `visibilitychange` terwijl een lezing loopt ook niet.
6. Verbindingherstel: `context.setOffline(false)` na offline geeft een
   verversing; verborgen tab geeft er geen.
7. Late respons: een trage respons voor identiteit A komt aan nadat
   identiteit B is ingelogd (uitloggen en inloggen binnen één test); de data
   van B blijft staan. Idem: uitloggen tijdens een lopende lezing geeft geen
   fout en geen state van A in de loginpagina.
8. Trage respons: de laadtekst blijft `role="status"`, geen eindeloze
   loader als `getSession` afwijst (route/`addInitScript` voor de
   storage-fout): foutstaat met knop.
9. Bar: namenlijst 500: foutregel, "Opnieuw proberen" en de e-mail-link naar
   `/beheer` zijn zichtbaar en bereikbaar; retry herstelt de lijst.
10. Bar, Verkoop: `products`/`members`/`shift_members`/`app_settings` falen
    afzonderlijk: elke sectie heeft een eigen "Opnieuw proberen", Afrekenen
    en Opwaarderen blijven disabled tot de data terug is, en het mandje met
    gekozen lid blijft staan na de retry (geen invoerverlies).
11. Overige leesschermen (`ActiviteitKeuze`, logboek, dienst-overzicht,
    ledenlijst, bezetting, assortiment, instellingen): één representatieve
    foutlus per scherm, retry herstelt.
12. Verlopen sessie blijft een eigen staat: `signed-out` geeft het
    loginformulier, geen leesfout en geen "niet gekoppeld".

**Toegankelijkheid:**
- `check:a11y` (axe, elk shell-entrypoint) in foutstaat en met
  `VerversStatus` (ready, bezig, mislukt), zowel `light` als `rail`.
- Focus nooit op `body`: na een geslaagde retry staat de focus op de herstelde
  sectie; na een mislukte retry op de knop; na "Verversen" blijft hij op de
  knop; na tabwissel gelden de bestaande T09-regels. Test via
  `document.activeElement !== document.body` na elke herstelstap.
- `role="alert"` alleen voor leesfouten zonder data; bij blijvende data
  `role="status"`; geen dubbele alerts naast elkaar (zelfde les als #78).
- Touchdoel van de herstel- en verversknop minimaal 44px.

**Handmatig (Tester), niet gedekt door de gemockte tests:**
- Echte barboeking op client A (echte `place_order`) gevolgd door verversing
  van de portal op client B (telefoon), via knop én terugkeer; saldo en lijst
  samen.
- Echt verbindingsverlies (vliegtuigmodus) en herstel op de telefoon.
- Safari/Android: gedrag van `visibilitychange` en `online` op de echte
  browsers.
- Geen claim over deze punten tot ze zijn uitgevoerd.

## Expliciet buiten scope

- Alles uit "Niet gebouwd, losse follow-ups".
- De foutclassificatie van `usePortalSession` zelf (#115).
- #78, #51, #67 (zie hierboven).
- Realtime, polling, een gedeelde cache/query-client, offline- of
  PWA-uitbreiding, offlineboekingen, service-worker-caching.
- Wijzigingen aan RPC's, RLS, migraties, schema, auth- of sessiebeleid,
  `useBeheerSession`, het geldpad of attributie.
- Gedragswijziging van de gebouwde T05, T06, T07 en T09 buiten wat hier
  staat: T09-presentatie (badge "Teruggedraaid", "Door:"/"Reden:", maand-
  groepen, tijdzone) en de mount-per-tab-regel blijven ongewijzigd; alleen de
  data-/statuslaag eronder en de regel boven de tabinhoud veranderen.

## Zoals gebouwd

PR #159 (`Part of #128`, sluit #128 niet), gemerged als `a34bed6`. Alles
hieronder is gecontroleerd tegen de code op `main`. Afwijkingen van de spec
staan er expliciet bij.

### Onderdelen en hun plek

- `src/lib/verversen.ts` (puur, getest in `test/verversen.test.ts`):
  `moetVerversen`, `bijgewerktLabel` (plus `tijdLabel`, `verversMisluktTekst`,
  `VERVERS_TEKSTEN`, `MIN_VERVERS_INTERVAL_MS` = 30 s), de stale-machine
  (`LezingState`, `lezingGestart`, `lezingGeslaagd`, `lezingMislukt`,
  `verversInfo`) en `maakRondeGuard` (laatste-request-wint). `PORTAL_TIME_ZONE`
  is hierheen verhuisd uit `src/features/portal-dashboard/transacties.ts`, dat
  hem nu importeert (geen re-export; de enige andere gebruiker is de test).
- `src/hooks/queries/useStaleLezing.ts`: de ene machine achter
  `usePortalBalance`, `usePortalTransactions` en `usePortalAppSettings`
  (de drie portalhooks). Stale-while-revalidate: een mislukte verversing vanuit
  `ready` houdt de data en zet `ververs.mislukt`; een mislukte eerste ronde of
  retry is `error`. Bevat ook `VasteLeesFout`. Roept zelf geen Supabase aan.
- `src/components/LeesFout.tsx` (foutregel `role="alert"` plus "Opnieuw
  proberen", tone `light`/`rail`, `aria-disabled` tijdens bezig, 44px) en
  `src/components/VerversStatus.tsx` ("Bijgewerkt om HH:mm", knop "Verversen",
  mislukt-regel `role="status"`).
- `src/hooks/useVerversBijTerugkeer.ts`: listeners op `visibilitychange` en
  `online`, beslist via `moetVerversen`; geen polling.
- `src/hooks/useFocusNaHerstel.ts`: focus naar de herstelde sectie (via
  `useHerstelFocus`) na een fout die `ready` wordt, alleen als de focus op
  `body` stond.
- `src/hooks/useLeesHerstel.ts`: voor de bar-leeshooks (fail-closed, `refetch`
  zet `loading`): houdt de fout en een `aria-disabled` knop zichtbaar tijdens
  de retry (`toonFout`, `message`, `bezig`, `retry`) en roept
  `useFocusNaHerstel` aan.
- `src/hooks/useFocusNaFaseFout.ts` (nieuw, niet in de spec): aangeroepen in
  `BarApp.tsx` (`BarSchermen`) en `Assortimentbeheer.tsx` (`BeheerSchermen`)
  met `sessie.fase`. De sessiefase `fout` heeft daar een eigen "Opnieuw
  proberen"-knop (geen `LeesFout`); na een geslaagde retry verdween die knop en
  viel de focus op `body`. Het hook focust dan de `h1` van het herstelde scherm
  (anders het eerste `main button/a/input`), alleen als de focus echt verloren
  is; `laden` tijdens de retry telt nog als dezelfde fout.
  `useFocusNaHerstel` kon niet hergebruikt worden: dat werkt met een
  `status` van een leeshook en een sectie-ref, terwijl hier de fase van de
  sessieprovider wisselt, de hele boom (en dus het ref-doel en de hook-instantie)
  verdwijnt, en `Assortimentbeheer` na succes doorverwijst naar `/` (een
  nieuwe `BarApp`-mount). Daarom staat `hadFout` op module-niveau en niet in
  een `useRef`.
- Portal: `SaldoTab` (een `VerversStatus` en een knop voor saldo, instellingen
  en transacties; label = oudste `bijgewerktOp`) en `TransactiesTab` (alleen de
  transacties), beide met `useVerversBijTerugkeer`, `LeesFout` voor een
  mislukte eerste lezing en `useFocusNaHerstel`.
- Bar-herstelknoppen (`LeesFout` via `useLeesHerstel`): `VerkoopScherm`
  (assortiment, leden, bezetting, instellingen; `Mandje` en `LidZoeker` kregen
  `onRetry`-props), `ActiviteitKeuze` via `DienstStarten` (met
  `useFocusNaHerstel`), `DienstActief` (bezetting), `Transactielijst`
  (dienst-overzicht), `LedenLijst`, `LogboekLijst`, `ProductenLijst`,
  `ActiviteitstypesInstellingen`, `NegatieveLimietInstellingen` en
  `LidBestellingenOverlay`. De parameter-hooks `useShiftMembers`,
  `useShiftLedger`, `useShiftSummary` en `useMemberOrders` kregen een
  laatste-request-wint-teller.
- `BarInloggen`: de "Inloggen met e-mail"-link (`emailIngang`) staat bij
  laden, bij een fout en bij de lijst (besluit 7); de namenfout gebruikt
  `LeesFout` (tone `rail`) via `useLeesHerstel`, de `h1` is de focusdoel.
  In de sessiefase `fout` is er bewust geen e-mailingang of uitlogknop.

### Besluiten

De 15 besluiten onder "Besluiten Architect" zijn namens Bram door de Architect
genomen (2026-10-05) en zijn zo gebouwd, behalve de besluiten (of delen
daarvan) die aan `usePortalSession` en `PortalShellHome` hangen en op #115
wachten (zie "Niet gebouwd" hieronder):

- **Besluit 1:** de foutclassificatie van `usePortalSession` is van #115 en dus
  niet gebouwd.
- **Besluit 6, deels:** de laatste-request-wint-guard in de portalhooks is er;
  `key={userId}` op `PortalDashboard` niet.
- **Besluit 14:** de achtergrondlookup die een ingelogd dashboard laat staan
  (geen terugval naar `loading` of fout) is niet gebouwd. Zolang #115 openstaat
  geldt dit gedrag dus nog niet; de randgevallenregel "Auth-event bij
  tabterugkeer terwijl lookup faalt" beschrijft het beoogde, nog niet gebouwde
  gedrag.

### Niet gebouwd: wacht op #115

Het `PortalShellHome`-deel: `userId` in de `signed-in`-staat plus
`key={userId}` op `PortalDashboard`, de achtergrondlookup die niet terugvalt
naar `loading`/fout, de `getSession`-catch, en de foutclassificatie van
`usePortalSession`. `usePortalSession.ts` en `PortalShellHome.tsx` zijn
onaangeroerd; #115 is de eigenaar.

### Bewust buiten scope gebleven

`useBeheerSession`, #78, #51, #67 en een verlopen-sessiemelding (besluit 12).

### Tester en Reviewer

- **Tester-bevinding:** na een geslaagde retry in sessiefase `fout` viel de
  focus op `body`. De test liep via `Assortimentbeheer`, niet alleen `BarApp`;
  vandaar dat `useFocusNaFaseFout` in beide schermen staat (commit `0c590bc`,
  de eerdere `test.fail` werd een gewone test).
- **Aangepaste test:** "tabpanel zonder focusbare inhoud is zelf een
  tabstop" (`e2e/dialogen-tabs-landmarks.spec.ts`) houdt nu de saldo-,
  instellingen- en transactielezing open (mock), zodat het panel nog geen
  focusbare inhoud heeft. Met data staat er sinds T08 een "Verversen"-knop;
  een nieuwe test dekt dat geval (panel zelf geen tabstop). Legitiem: de
  inhoud van het panel veranderde, niet de tabregel.
- **Reviewer-oordeel:** alleen de PR-tekst was onjuist; die is hersteld. De
  code is akkoord bevonden.

### Bekend laag risico

De module-level `hadFout`-vlag in `useFocusNaFaseFout` overleeft een
unmount. Bij een latere mount kan de focus daardoor van `body` naar de `h1`
springen (bijvoorbeeld na uit- en inloggen zonder reload, terwijl de vlag nog
`true` stond). Dit randgeval is niet getest.

### Niet live geverifieerd

Echte barboeking op client A met verversing op client B, vliegtuigmodus en
herstel, en het gedrag van `visibilitychange`/`online` op Safari en Android.
De gemockte tests dekken dit niet; er wordt niets over beweerd.

### Backlog en follow-ups

- Live e2e "bardienst boekt, lid-portal ververst".
- Stale-while-revalidate op de bar (nu bewust fail-closed, besluit 2).
- Verlopen-sessiemelding.
- De module-vlag in `useFocusNaFaseFout` robuuster maken.
- Het `PortalShellHome`-deel na #115.

### ADR

Geen ADR bij dit ticket (besluit 15), dus ook niets af te sluiten.
