# Laag-saldo signalering (€10-drempel)

**Status: afgesloten zonder resterende bouwscope (2026-08-29).** AC #1 en #2
waren al gedekt door #8 vóórdat deze spec geschreven werd; AC #3 (het
proactieve overzicht) is door Bram expliciet geskipt — zie "Besloten: AC #3
wordt niet gebouwd" hieronder. Geen Developer/Tester/Reviewer-stap nodig voor
dit ticket. Deze spec blijft als document staan (de opgebouwde afweging over
waar zo'n overzicht ooit zou landen is niet weggegooid), maar #9 zelf is
gesloten. Zie [issue #9](https://github.com/BramLambertJansen/ABAS/issues/9).
Volgt op [#8](https://github.com/BramLambertJansen/ABAS/issues/8) (verkoopscherm,
`docs/features/verkoop.md`, gebouwd en gemerged) — dat scherm bouwde de
passieve saldo-markering in de ledenzoeker/ledenkaart al, met de
motivatie "dit is de 'bardienst ziet saldi om te kunnen waarschuwen'-eis uit
CLAUDE.md → Domein, hier alleen als passieve kleurcode... een proactieve
waarschuwingsflow/'aandacht'-lijst is #9, niet dit ticket" (`docs/features/
verkoop.md` → Schermflow §2). Dit is dat vervolgticket: alleen het
proactieve overzicht, niet de per-lid-markering — die bestaat al.

## Status van de drie acceptatiecriteria (voor je verder leest)

Twee van de drie AC's uit de issue-body zijn al volledig gedekt door wat er
al op `main` staat; deze spec voegt alleen het derde toe. Dat is geen
herformulering om het ticket kleiner te laten lijken — het is waarom deze
spec zo kort is vergeleken met #7/#8.

1. **"Vaste, systeembrede drempel van €10, geen UI om te wijzigen" — al
   gebouwd, niets nieuws nodig.** `app_settings.low_balance_threshold_cents`
   bestaat al sinds `0001_init.sql` (regel 45–47), met een harde default van
   `1000` (cent) en een commentaar dat letterlijk verwijst naar deze regel in
   CLAUDE.md. Sinds `0004_revoke_app_settings_writes.sql` is de hele tabel
   bovendien `REVOKE`d voor `insert/update/delete` van `authenticated`, en er
   bestaat geen RPC die deze kolom schrijft (zie `docs/ARCHITECTURE.md` →
   "Wat het prototype deed maar hier nog niet is besloten" resp. issue #11
   voor `negative_limit_cents`, dat wél een toekomstige schrijf-RPC krijgt —
   voor `low_balance_threshold_cents` is er principieel geen schrijfpad
   gepland). Er is dus letterlijk geen UI-component die dit zou kúnnen
   wijzigen, laat staan een die het per ongeluk toestaat. Deze spec verandert
   hier niets aan; ze **leest** de kolom, net als AC #2 dat al doet.
2. **"Signalering zichtbaar in het verkoopscherm bij het selecteren van een
   lid met saldo < €10" — al gebouwd, niets nieuws nodig.** `Mandje.tsx`
   (`src/features/verkoop/Mandje.tsx`) toont, zowel in de zoekresultatenlijst
   als op de ledenkaart ná selectie, een tekstsuffix (" — laag saldo") plus
   een ⚠-icoon met sr-only-tekst wanneer `balanceCents <
   lowBalanceThresholdCents` (strikt kleiner-dan — geen `<=`, zie
   Randgevallen). Dit staat expliciet genoteerd in `docs/features/
   verkoop.md` → "Gebouwd (2026-08-26)": "de laag-saldo-markering in §2 is in
   de bouw nooit kleur-only... nodig om niet puur op kleur te leunen (WCAG
   AA)". Deze spec bouwt hier niets aan bij en herhaalt het gedrag niet in
   Randgevallen hieronder, behalve waar het overzicht (AC #3) dezelfde
   grenswaarde-conventie moet overnemen voor consistentie.
3. **"Een overzicht ('aandacht'-achtig) van leden met laag saldo, voor de
   bardienst" — nog niet gebouwd. Dit is de enige echte scope van deze
   spec.**

## Besloten: AC #3 (het overzicht) wordt niet gebouwd (2026-08-29)

Bram heeft gekozen: het proactieve "wat aandacht vraagt"-overzicht wordt
**geskipt** — "niet mega belangrijk". De keuze tussen optie A/B/C hieronder
is daarmee niet meer relevant; het overzicht wordt niet gebouwd, in geen van
de drie vormen. Deze spec-sectie blijft staan als document van de afweging
(voor het geval dit later alsnog opgepakt wordt), maar is niet langer
actiegericht.

Met AC #1 en #2 al gedekt door #8 (zie hierboven) en AC #3 nu expliciet
geskipt, heeft issue #9 geen resterende bouwscope over. Zie onderaan dit
document voor de afsluiting van het ticket.

<details>
<summary>Oorspronkelijke beslisvraag (archief, niet langer actiegericht)</summary>

Dit was de ene open vraag die deze spec niet zelf kon beantwoorden zonder te
gissen — vergelijkbaar met hoe `docs/features/bezetting-beheren.md` de
zelf-verwijderingsvraag aan Bram voorlegde vóór de rest vastgelegd werd.

Het ontwerp (`designs/Bar App.dc.html`, regel 412–440, 1526, 1614, 2790) plaatst
"Aandacht" (`isAandacht`) als een eigen tegel binnen een **beheer-tabbalk**
(`TAB_NAMES`: Aandacht, Leden, Assortiment, Rapportages, Instellingen,
Logboek) die alleen zichtbaar is via `isAdminRole(role)`. Dat past hier niet
1-op-1: onze rolzichtbaarheid is fundamenteel anders dan het prototype
(CLAUDE.md → Domein: precies drie rollen, geen `barmanager`/`boekhouder`), én
de AC-tekst zegt expliciet "voor de bardienst" — niet "voor de beheerder".
Beheerder werkt bovendien inmiddels (sinds ADR 0002/0003, `/beheer`) via een
**volledig aparte, e-mail-ingelogde sessie** die de gedeelde bar-tablet-sessie
tijdelijk vervangt — een `bardienst`-medewerker op de gedeelde sessie zou een
in `/beheer` gebouwd overzicht dus nooit te zien krijgen zonder zelf een
beheerder-e-mailaccount te hebben. Het prototype se plek voor "Aandacht"
volgen zou dus rechtstreeks tegen AC #3's eigen tekst ingaan.

Wat overblijft is een keuze **binnen de gedeelde bar-tablet-sessie**, waar
vandaag precies twee schermen achter een open dienst bestaan
(`src/features/verkoop/DienstTabs.tsx`: Verkoop, Dienst — zie
`docs/ARCHITECTURE.md` → "First multi-screen bar navigation"). Drie
kandidaten, geen daarvan is af te leiden uit CLAUDE.md, de wireframe (die een
andere rolstructuur veronderstelt) of het ticket zelf:

- **A — nieuwe derde tab in `DienstTabs`** ("Verkoop", "Dienst", "Aandacht"),
  zelfde `role="tablist"`-patroon, zelfde vertrouwensmodel (iedereen op de
  gedeelde sessie tijdens een open dienst ziet 'm, geen extra restrictie —
  consistent met hoe Verkoop/Dienst nu werken). Grootste zichtbaarheid,
  grootste chrome-toevoeging (een derde tab op een scherm dat vandaag twee
  heeft).
- **B — sectie binnen de bestaande Dienst-tab** (`DienstActief.tsx`), naast
  de bezetting-sectie: geen nieuwe tab, een uitbreiding van een bestaand
  scherm. Kleinste chrome-toevoeging, maar begraaft het overzicht een niveau
  dieper dan Verkoop (waar de bardienst het grootste deel van de dienst
  doorbrengt) en dan AC #3's eigen woordkeuze ("overzicht... voor de
  bardienst", niet "detail op het dienst-scherm") misschien bedoelt.
- **C — overlay vanuit het Verkoopscherm** (bv. een knop/badge bij de
  ledenzoeker die `src/components/Overlay.tsx` opent, zelfde primitive als
  "Bezetting wijzigen"/de afrekenbevestiging). Geen nieuwe tab, wel een
  nieuwe interactie binnen het scherm waar de bardienst al staat. Roept een
  ontwerpvraag op die deze spec dan alsnog zou moeten beantwoorden (welke
  trigger, waar op het scherm) — vandaar dat het hier als optie staat, niet
  als voorkeur.

Geen van de drie is triviaal fout of triviaal goed; ze verschillen vooral in
hoeveel chrome ze aan een al bestaand scherm toevoegen versus hoe zichtbaar
het overzicht wordt.

**Wél al af te leiden, ongeacht A/B/C**: het overzicht is alleen bereikbaar
tijdens een open dienst. Er bestaat vandaag geen navigatie op de gedeelde
bar-tablet-sessie buiten een open dienst om (vóór het starten van een dienst
toont `DienstStarten.tsx` alleen het PIN-pad/personeelskeuze, geen ander
scherm) — dit is dus geen aparte keuze, maar een rechtstreeks gevolg van hoe
`shells/bar` vandaag is opgebouwd.

</details>

## Doel

Bardienst (en, als superset, beheerder — zelfde rolmodel als overal in
`shells/bar`) kan in één blik zien welke leden een saldo onder de vaste €10-
drempel hebben, zonder eerst een naam te hoeven zoeken in het verkoopscherm.
Dat is het verschil met de al gebouwde AC #2: die markering helpt alleen
wanneer je toevallig al naar dat ene lid aan het zoeken bent; dit overzicht
is de proactieve tegenhanger — "wie moet ik vandaag actief attenderen op
opwaarderen", ook voor leden die niet zelf iets komen bestellen.

**Raakt geen van de twee kernbeslissingen uit CLAUDE.md →
Architectuurbeslissingen.** Dit scherm doet geen enkele schrijfactie: het
leest alleen het al bestaande, door eerdere RPC's (`top_up`, `place_order`)
berekende `members.balance_cents` en de vaste `app_settings.
low_balance_threshold_cents`. Er wordt niets besteld, niets opgewaardeerd en
niemand krijgt iets toegeschreven (`served_by`) — dus noch "geld alleen via
RPC" noch "attributie alleen via PIN" is hier van toepassing, niet omdat dit
scherm er een uitzondering op is, maar omdat het simpelweg geen geldbeweging
of toeschrijving bevat.

## Betrokken shell

`shells/bar` alleen — zelfde reden als #6/#7/#8: er is geen dienst-/
verkoopconcept in `shells/portal`, en dit overzicht is nadrukkelijk voor
bardienst bedoeld (AC #3), niet voor het lid zelf (een lid ziet in de portal
straks alleen het eigen saldo, niet dat van anderen). Component(en) staan
shell-agnostic in een nieuwe map `src/features/laag-saldo-signalering/`,
naast (niet in) `src/features/verkoop/`/`bezetting-beheren/` — zelfde
"eigen issue, eigen spec, eigen featuremap"-redenering als die twee, ook al
is de precieze mount-plek (tab/sectie/overlay) nog aan de Beslissing hierboven.

## Datamodel

**Geen schemawijziging.** Zoals hierboven onder AC #1 vastgesteld, bestaat
alles al: `app_settings.low_balance_threshold_cents` (vast, `1000` cent,
`REVOKE`d) en `members.balance_cents` (bijgewerkt door `place_order`/
`top_up`, nooit rechtstreeks beschreven — geldtabellen-`REVOKE` geldt hier
onveranderd).

## RPC's / leeshooks

**Geen nieuwe RPC — het is puur lezen, geen enkele schrijfactie.**

**Geen nieuwe leeshook nodig.** In tegenstelling tot `docs/features/
assortimentbeheer.md`'s afweging (waar een tweede leesbehoefte op
`products` wél een eigen hook rechtvaardigde, omdat filter/sortering
wezenlijk verschilden van #8's `useProducts()`), is dat hier niet aan de
orde: de twee bestaande hooks geven al precies de velden die dit overzicht
nodig heeft, zonder enige aanpassing.

- **`useMembers()`** (`src/hooks/queries/useMembers.ts`, gebouwd voor #8) —
  levert al `{ id, name, balanceCents }` voor elk niet-gearchiveerd lid,
  alfabetisch. Dit overzicht filtert die array client-side op
  `balanceCents < lowBalanceThresholdCents` — een `useMemo`-derivatie in het
  nieuwe component, exact zoals `VerkoopScherm.tsx` `productList`/
  `cartDisplayLines` al client-side afleidt uit ruwe hook-data zonder een
  aparte hook daarvoor te bouwen.
- **`useAppSettings()`** (`src/hooks/queries/useAppSettings.ts`, gebouwd voor
  #8) — levert `lowBalanceThresholdCents` (en `negativeLimitCents`, hier
  ongebruikt).
- Beide hooks hebben al een `refetch()`/mount-effect dat past bij het
  bestaande "elke tab-wissel = verse data"-patroon
  (`docs/ARCHITECTURE.md` → "First multi-screen bar navigation": tabs worden
  gemount/unmount, niet verborgen) — als het overzicht optie A of B wordt
  (een tab/tab-sectie), krijgt het dus vanzelf verse gegevens bij elke keer
  dat de bardienst erheen navigeert, zonder dat dit component zelf iets
  hoeft te doen. Bij optie C (overlay) geldt hetzelfde via het moment van
  openen (zelfde lifecycle-redenering als `BezettingOverlay`/
  `AfrekenenOverlay`).

## Rolzichtbaarheid

Zelfde vertrouwensmodel als #7/#8: iedereen die de gedeelde bar-tablet-sessie
gebruikt tijdens een open dienst ziet dit overzicht, ongeacht rol — geen
aparte weergave voor bardienst versus beheerder. Dit is ook precies wat AC #3
vraagt ("voor de bardienst") en is de reden waarom een `/beheer`-plek (zoals
het prototype koos) hier is afgewezen, zie "Beslissing nodig" hierboven.
`app_settings`/`members` zijn al leesbaar voor elke `authenticated`-sessie
(bestaande `_select`-policies, single-tenant), dus er is ook geen RLS-wijziging
nodig om dit voor bardienst te ontsluiten.

## Schermflow

Inhoud van het overzicht — onafhankelijk van of dit een tab, een sectie of
een overlay wordt (zie "Beslissing nodig"):

- **Titel**: **"Wat aandacht vraagt"** (letterlijk overgenomen uit
  `designs/Bar App.dc.html` regel 413 — eerste bouw volgt het ontwerp per
  CLAUDE.md → Designbestanden; afwijken is latere, normale evolutie).
- **Lijst**: elk lid met `balanceCents < lowBalanceThresholdCents`, **oplopend
  gesorteerd op saldo** (laagste/meest-negatieve saldo bovenaan) — een
  bewuste eis van deze spec, geen implementatiedetail: het doel is bardienst
  zo snel mogelijk naar het meest urgente geval te laten kijken, en dit is een
  gratis client-side sort (`Array.prototype.sort`) op data die toch al
  geladen is, geen extra RPC of query-parameter.
- **Per rij**: naam + huidig saldo (`formatCents`). Optioneel, als
  visuele verfijning (net als AC #2's ⚠-icoon geen puur-kleur-signaal mag
  zijn): het ontwerp onderscheidt "GEEN SALDO" (`balance <= 0`) van "SALDO
  LAAG" (`0 < balance < threshold`, regel 2979) met een badge-tekst. Dit is
  geen harde eis van deze spec (de AC vraagt alleen om "een overzicht van
  leden met laag saldo", geen twee-tier-classificatie), maar wel toegestaan
  en aangeraden als Developer het zonder extra complexiteit kan toevoegen —
  het is dezelfde data (`balanceCents`), geen nieuwe hook of berekening.
- **Lege staat** (niemand onder de drempel): **"Niets dat aandacht vraagt" /
  "saldo's zijn op orde"** (letterlijk overgenomen uit `designs/Bar
  App.dc.html` regel 431–432) — geen crash, geen lege witruimte zonder
  uitleg.
- **Geen actie op een rij.** Tikken op een lid opent hier niets (geen
  deep-link naar Verkoop met dat lid voorgeselecteerd) — zie Expliciet
  buiten scope voor waarom dat bewust niet in deze spec zit.
- **Laad-/foutstaten**: zelfde vaste-Nederlandse-boodschap-patroon als elke
  andere hook in deze codebase (`useMembers`/`useAppSettings` hebben dit al
  ingebouwd) — geen ruwe Postgres-foutmelding, geen crash.

**Navigatie naar dit overzicht** hangt af van de Beslissing hierboven en
wordt hier dus niet vastgelegd — zodra Bram kiest, is dat een kleine
aanvulling (welke tab-knop/sectie-titel/trigger-knop), geen wijziging aan
de inhoud hierboven.

## Randgevallen

- **Grenswaarde**: strikt `balanceCents < lowBalanceThresholdCents`, geen
  `<=` — consistent met de al gebouwde `Mandje.tsx`-implementatie van AC #2
  (die ook `<` gebruikt, niet het ontwerp se `<=` op regel 2976). Een lid met
  saldo exact €10 verschijnt dus **niet** in dit overzicht, net zoals het nu
  al niet als "laag saldo" gemarkeerd wordt in het verkoopscherm. Deze twee
  plekken mogen nooit een andere grens hanteren dan elkaar.
- **Negatief saldo**: telt gewoon mee (voldoet al aan `< threshold`), geen
  aparte behandeling nodig om in de lijst te verschijnen — het optionele
  "GEEN SALDO"-onderscheid hierboven is puur cosmetisch.
- **Lege lijst** (niemand onder de drempel): zie Schermflow, nette lege
  staat, geen crash.
- **Instellingen nog niet geladen** (`useAppSettings()` in `"loading"`):
  toon een laadstatus, niet stilzwijgend "0 leden" — een `threshold = 0`
  placeholder zou (net als in `VerkoopScherm.tsx`'s eigen `settingsReady`-
  guard voor `insufficientFunds`) ten onrechte iedereen als "niet laag"
  classificeren totdat de instelling echt geladen is.
- **Lid archiveert tussen laden en tonen** (bv. via een toekomstig
  Ledenbeheer-scherm, dat nog niet bestaat): `useMembers()` filtert al op
  `archived = false` bij elke fetch; het lid verdwijnt gewoon bij de
  volgende refetch (tab-wissel/overlay-open, zie RPC's/leeshooks), geen
  crash tussentijds.
- **Saldo wijzigt live terwijl het overzicht open staat** (bv. een collega
  rondt op hetzelfde tablet een bestelling af terwijl deze tab al open was —
  enige tablet-sessie, dus zeldzaam): geen live-subscriptie vereist, refetch
  bij het opnieuw binnenkomen (mount/unmount-lifecycle, zelfde patroon als
  `DienstTabs`) is voldoende — zelfde soort "geen race-conditie-bescherming
  nodig"-afweging als eerdere specs (bv. #29, en `docs/features/
  bezetting-beheren.md`'s eigen buiten-scope-punt daarover).
- **A11y**: welke test-scenario hier nodig is hangt af van de Beslissing
  hierboven. Bij optie A/B (tab of sectie, geen nieuwe overlay) volstaat een
  scenario dat naar de betreffende tab navigeert vóór het scannen, net zoals
  de bestaande `bezetting-overlay`-test al eerst op de "Dienst"-tab klikt
  voordat 'm scant (`e2e/a11y.spec.ts` regel 108–137). Bij optie C (overlay)
  is het patroon identiek aan de twee bestaande overlay-scenario's in
  diezelfde suite (open de overlay, wacht op focus, scan). In geen van de
  drie gevallen is dit al gedekt door de huidige statische routelijst
  (`/`, `/portal`, `/beheer`) — Tester moet dit expliciet toevoegen, zelfde
  constatering als #7/#8 voor hun eigen overlays.

## Expliciet buiten scope

- **Notificaties/pushmeldingen/badge-teller op andere schermen** — AC #3
  vraagt om "een overzicht", niet om een proactieve melding die de bardienst
  ongevraagd bereikt terwijl die op een ander scherm zit. "Signalering" in de
  ticket-titel is hiermee ingevuld als "zichtbaar zodra je het scherm
  bezoekt", niet als een systeem dat uit zichzelf aandacht trekt.
- **Deep-link/voorselectie van het lid in Verkoop vanuit een rij in dit
  overzicht** — niet gevraagd door AC #3, en zou het al getrackte
  state-lift-vraagstuk van
  [issue #43](https://github.com/BramLambertJansen/ABAS/issues/43)
  (Verkoop-tab-state die verloren gaat bij tab-wissel,
  `docs/ARCHITECTURE.md` → "First multi-screen bar navigation") direct
  raken. Apart ticket als hier behoefte aan blijkt.
- **Drempel of negatieflimiet zelf instellen/wijzigen** — beide al buiten
  scope elders (`low_balance_threshold_cents` heeft principieel geen
  schrijf-RPC gepland, zie AC #1 hierboven; `negative_limit_cents` is #11).
- **"Saldo opwaarderen"-snelkoppeling vanuit een rij** — zelfde reden als
  `docs/features/verkoop.md`'s eigen buiten-scope-punt: er bestaat nog geen
  opwaardeer-UI (`top_up`-RPC bestaat, UI niet). Een knop die nergens
  naartoe leidt hoort niet in dit scherm.
- **Filteren/zoeken binnen het overzicht zelf** — geen AC-vereiste; bij een
  vereniging van deze schaal is een ongefilterde, gesorteerde lijst naar
  verwachting kort genoeg om zonder zoekveld te doorzien.
- **Beheerder-only "audit"/logboek-variant van "aandacht"**
  (`auditFilters`/`auditAttentionLabel` in het ontwerp) — niet-besloten
  scope, `docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog niet
  is besloten" (Logboek).
- **Rapportage/export van de lijst** (CSV/PDF) — hoort bij het niet-besloten
  `Rapportages`-concept, zelfde bron.
- **Race-conditie-bescherming bij gelijktijdige saldowijzigingen** — zie
  Randgevallen, zelfde afweging als elders in deze codebase (#29).

## `useShell()`-contract

Hangt af van de Beslissing hierboven:

- **Optie A/B** (tab of sectie binnen een bestaand scherm): geen nieuwe
  invulling van `useShell()`. Hergebruikt het bestaande `role="tablist"`-
  patroon (`DienstTabs.tsx`) resp. de bestaande sectie-opbouw
  (`DienstActief.tsx`) zonder dat `overlay`/`density`/`columns` een nieuwe
  betekenis krijgen.
- **Optie C** (overlay): hergebruikt `src/components/Overlay.tsx` zoals
  "Bezetting wijzigen"/de afrekenbevestiging dat al doen — `useShell().
  overlay` is op `shells/bar` vandaag altijd `"modal"`, geen nieuwe
  architectuurbeslissing, wel een derde consument.

In alle gevallen: `density`/`columns` worden door dit overzicht niet nieuw
ingevuld — de ledenlijst is een verticale lijst (zoals `ProductenLijst.tsx`
en het ontwerp `attentionItems` beide als lijst tonen, geen grid); een latere
iteratie die 'm als grid wil tonen is implementatiedetail, geen
architectuurkeuze.
