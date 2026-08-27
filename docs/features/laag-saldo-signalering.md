# Laag-saldo signalering: de "Aandacht"-lijst

Spec voor [issue #9](https://github.com/BramLambertJansen/ABAS/issues/9),
"[Fase 1] Laag-saldo signalering (€10-drempel)". Volgt op
[#8](https://github.com/BramLambertJansen/ABAS/issues/8) (verkoopscherm,
gemerged via PR #41) — dat scherm noemde dit ticket al met naam voor het deel
dat het bewust niet bouwde: "Proactieve laag-saldo-signalering ('aandacht'-
lijst, notificaties) — #9. Dit scherm doet alleen de passieve kleurcode in de
ledenzoeker." (`docs/features/verkoop.md` → Expliciet buiten scope). Dit is
dat vervolg.

**Van de drie acceptatiecriteria in #9 zijn er al twee gebouwd als bijvangst
van #8**, geen actie meer nodig:

1. Vaste, systeembrede drempel van €10 — bestaat al als
   `app_settings.low_balance_threshold_cents` (default 1000 cents, geen UI om
   te wijzigen), `supabase/migrations/0001_init.sql`,
   `src/hooks/queries/useAppSettings.ts`.
2. Signalering bij lid-selectie in het verkoopscherm — al gebouwd in
   `src/features/verkoop/Mandje.tsx` (⚠-icoon + tekst + kleurcode in de
   ledenzoeker en op de geselecteerde-lid-kaart, nooit kleur-only per
   `check:a11y`).

**Deze spec dekt uitsluitend het derde, resterende criterium**: een
overzicht ("aandacht"-lijst) van alle leden met laag saldo, voor de
bardienst.

## Doel

Een derde tabblad naast Verkoop/Dienst dat in één oogopslag toont welke
leden aandacht nodig hebben op saldo — zodat de bardienst dit proactief kan
signaleren, ook zonder dat er net iemand wordt afgerekend. Puur lezen/
filteren van al bestaande data (`members.balance_cents`,
`app_settings.low_balance_threshold_cents`); geen nieuwe geldlogica, geen
nieuwe RPC.

## Betrokken shell

`shells/bar` alleen, op dienstniveau — geen `shells/portal`-concept (een lid
ziet in de portal alleen het eigen saldo, nooit dat van anderen) en geen
`/beheer`-sessie.

## Besloten met Bram (2026-08-27)

Twee punten die anders open hadden gestaan, zijn al afgestemd:

- **Plek van het overzicht**: een derde tab in
  `src/features/verkoop/DienstTabs.tsx` ("Verkoop" / "Dienst" / "Aandacht"),
  op dienstniveau — niet gekoppeld aan de losse `/beheer`-sessie. Het
  wireframe (`designs/Bar App.dc.html`, regel 2790 e.v.) plaatst "Aandacht"
  achter een beheerder-gate (`bscr`, binnen het beheerpaneel), maar de
  acceptatiecriteria van #9 zeggen expliciet "voor de bardienst" (niet
  beheerder-specifiek) en het issue is gelabeld `shell:bar`, niet `auth`. Een
  navigatiestructuur voor `/beheer` bestaat bewust nog niet
  (`docs/features/assortimentbeheer.md` → Expliciet buiten scope, "Een echte
  tabbalk/navigatiestructuur voor `shells/bar`") en wordt door dit ticket niet
  alsnog geïntroduceerd.
- **Klik-actie op een lid in de lijst**: geen. Het wireframe koppelt een klik
  aan "opwaarderen" (`action: 'opwaarderen'`, regel 2982, `onClick:
  selectManageMember` + `setBeheerTab('members')`), maar `top_up` (#10) heeft
  nog geen UI. De lijst in dit ticket is puur informatief (naam + saldo +
  tag); #10 voegt later de opwaardeer-actie toe.

Geen ADR nodig voor deze twee punten: het zijn geen nieuwe
architectuurbeslissingen, alleen een keuze binnen de al bestaande
tab-navigatie van #8 en een bewuste "nog niet"-op #10. Deze spec zelf raakt
ook verder geen architectuurbeslissing (geen RPC, geen geldlaag, geen
attributie) — Developer schrijft hier **geen ADR** bij.

## Datamodel

**Geen wijziging.** Hergebruikt exact de al bestaande velden:

- `members.balance_cents` (via `useMembers()`, al gefilterd op
  `archived = false`, alfabetisch op naam).
- `app_settings.low_balance_threshold_cents` (via `useAppSettings()`, de
  enige rij in die tabel).

Geen nieuwe kolom, geen nieuwe migratie.

## RPC's

Geen nieuwe RPC. Dit is een pure leesactie — `useMembers()` en
`useAppSettings()` (beide al in `src/hooks/queries/`, gebouwd voor #8)
worden ongewijzigd hergebruikt. Elke tab in `DienstTabs.tsx` haalt zijn eigen
data op (zelfde patroon als `VerkoopScherm` en `DienstActief` nu al doen,
niet via props van bovenaf doorgegeven) — dit nieuwe tabblad roept dus zelf
`useMembers()` en `useAppSettings()` aan, net als `VerkoopScherm.tsx` dat nu
al doet. Dat betekent ook: bij het wisselen naar deze tab wordt een verse
ledenlijst opgehaald (mount/unmount-als-lifecycle, `docs/ARCHITECTURE.md` →
"First multi-screen bar navigation"), geen stale saldo's van vóór het
wisselen.

## Rolzichtbaarheid

Zelfde vertrouwensmodel als de andere twee tabs in `DienstTabs.tsx`:
iedereen die de gedeelde bar-tablet-sessie gebruikt tijdens een **open
dienst** ziet dit tabblad, geen aparte restrictie per rol (bardienst en
beheerder gelijk, zoals CLAUDE.md → Domein: beheerder is een superset van
bardienst). Dit volgt rechtstreeks uit de bestaande structuur, geen nieuwe
keuze: `DienstTabs` wordt alleen gerenderd zodra er een open dienst is
(`DienstStarten.tsx` geeft pas door aan `DienstTabs` ná `useOpenShift()`),
dus **zonder een open dienst bestaat dit tabblad niet** — exact hetzelfde
als voor Verkoop en Dienst vandaag al geldt. Dit is geen bewuste
scope-beperking van dit ticket, maar een gevolg van hoe `DienstTabs.tsx` al
werkt; een "aandacht"-overzicht buiten een open dienst om (bv. vanaf een
toekomstig beheerscherm) is geen onderdeel van deze spec.

Geen leesbeperking op de onderliggende data: dezelfde `members_select`-policy
die `useMembers()` in het verkoopscherm al gebruikt (elke `authenticated`
sessie mag lezen, single-tenant) geldt hier ongewijzigd.

## Schermflow

Nieuw bestand: **`src/features/verkoop/AandachtScherm.tsx`** (naast
`VerkoopScherm.tsx`, zelfde featuremap — zie "Waarom deze map" hieronder).

1. **Derde tab** in `DienstTabs.tsx`: "Aandacht", naast "Verkoop" (blijft de
   standaard/actieve tab na dienst-start, ongewijzigd) en "Dienst". Zelfde
   tab-styling/`role="tablist"`-patroon als de bestaande twee knoppen, geen
   nieuwe chrome.
2. **Lijst**: elk niet-gearchiveerd lid met `balance_cents < low_balance_
   threshold_cents` (zie "Randgeval: saldo exact op de drempel" hieronder
   voor waarom `<` en niet `<=`), in de volgorde die `useMembers()` al
   levert (alfabetisch op naam) — geen aparte sortering (bv. op oplopend
   saldo) toegevoegd; dat is geen AC-eis en voegt een stap toe die de
   bestaande hook niet al doet.
3. **Per rij**: een tag/pil + naam + saldo, zelfde soort informatie-indeling
   als het wireframe (regel 2978–2982) maar met de al bestaande
   pill/tag-stijl uit deze codebase (`bg-warning-bg text-warning-fg
   rounded-xl px-3 py-2 text-xs font-bold`, zie Mandje.tsx/CLAUDE.md-notitie
   in de achtergrond van dit ticket) in plaats van het wireframe's eigen
   kleuren:
   - Tag-tekst: **"GEEN SALDO"** als `balance_cents <= 0`, anders **"SALDO
     LAAG"** (0 < saldo < drempel) — zelfde onderscheid als het wireframe
     (`m.balance <= 0 ? 'GEEN SALDO' : 'SALDO LAAG'`, regel 2979). Puur
     tekstueel onderscheid, geen kleur-only signaal nodig omdat de tag zelf
     al tekst is.
   - Naam + "saldo {bedrag}" (via `formatCents()`).
   - Geen klik-actie (zie "Besloten met Bram" hierboven) — de rij is niet
     interactief, dus geen `<button>`/`role="button"`, geen
     hover-affordance die interactiviteit suggereert.
4. **Lege staat**: geen enkel lid onder de drempel → nette lege staat, tekst
   uit het wireframe overgenomen (regel 431–432): **"Niets dat aandacht
   vraagt"** / **"saldo's zijn op orde"**. Geen crash, geen "0 resultaten"-
   generieke tekst.
5. **Laden/fout**: zelfde patroon als de andere hooks in dit scherm-domein
   (`VerkoopScherm.tsx`) — `useMembers()`/`useAppSettings()` in
   `"loading"`-status → neutrale laadindicatie (`role="status"`);
   `"error"`-status → de bestaande Nederlandse foutmelding van de hook
   zelf (`role="alert"`), geen eigen nieuwe foutmelding verzinnen. Zolang
   `appSettings` nog niet `"ready"` is, wordt de lijst niet gefilterd/getoond
   (drempel nog onbekend) — zelfde soort guard als `VerkoopScherm.tsx`'s
   `settingsReady`.

### Waarom `src/features/verkoop/`, geen eigen `src/features/laag-saldo/`

Dit is een derde tab binnen dezelfde `DienstTabs.tsx`-navigatie die #8 al
introduceerde, niet een zelfstandig scherm met een eigen entry-point. De twee
bestaande tabs (`VerkoopScherm.tsx`, en `DienstActief.tsx` dat feitelijk in
`bezetting-beheren/` staat maar via `verkoop/DienstTabs.tsx` ontsloten wordt)
laten zien dat het domein "wat er op dit derde bar-scherm gebeurt tijdens een
dienst" al in `verkoop/` samenkomt. Een eigen featuremap zou alleen zin
hebben als dit overzicht ook los van `DienstTabs` bruikbaar zou moeten zijn
(bv. vanaf `/beheer`) — dat is expliciet niet zo (zie Rolzichtbaarheid).

## Randgevallen

- **Geen leden met laag saldo** → lege staat, zie Schermflow stap 4.
- **Gearchiveerde leden**: automatisch uitgesloten, want `useMembers()`
  filtert al op `archived = false` — geen aparte filter-logica nodig in
  `AandachtScherm.tsx` zelf.
- **Saldo exact op de drempel** (`balance_cents === low_balance_threshold_
  cents`, dus precies €10 bij de huidige instelling): **hoort niet bij
  "laag"** — vergelijking is `<`, niet `<=`. Dit is bewust gekozen op basis
  van twee dingen die al vaststaan en die niet stilzwijgend van elkaar mogen
  afwijken: de issue-tekst zelf ("saldo < €10") en de al gebouwde passieve
  signalering in `Mandje.tsx`, die exact dezelfde vergelijking gebruikt
  (`member.balanceCents < lowBalanceThresholdCents`, twee plekken in dat
  bestand). Het wireframe gebruikt `<=` (regel 2976: `m.balance <=
  threshold`) — dat wordt hier **niet** gevolgd, want `Mandje.tsx` is al
  gebouwde, gemergede code (niet langer alleen een prototype-referentie) en
  moet consistent blijven met deze nieuwe lijst: een lid dat in de
  ledenzoeker geen ⚠ krijgt, mag niet ineens wél in de Aandacht-lijst
  verschijnen bij exact €10,00 saldo.
- **`useAppSettings()` nog `"loading"`/`"error"`**: lijst wordt niet getoond
  (drempel onbekend, filteren zou onjuist zijn) — laadindicatie/foutmelding
  in plaats van een (mogelijk verkeerd) gefilterde lijst.
- **`useMembers()` `"loading"`/`"error"`**: zelfde aanpak, bestaande
  Nederlandse foutmelding van de hook, geen crash.
- **Saldo wijzigt terwijl de tab open staat** (bv. iemand rekent af op de
  Verkoop-tab, wisselt terug naar Aandacht): geen realtime-subscription
  vereist — de mount/unmount-lifecycle van `DienstTabs.tsx` (zie RPC's
  hierboven) haalt bij elke terugkeer naar deze tab een verse lijst op, dat
  is voldoende voor dit ticket. Geen polling, geen Supabase Realtime-kanaal.

## Expliciet buiten scope

- **Klik-naar-opwaarderen** vanuit een rij in de lijst — zie "Besloten met
  Bram". Aparte scope van #10 (`top_up`-UI), die vandaag niet bestaat.
- **Instelbare drempel** (bedrag zelf wijzigen) — geen scope van dit ticket
  en geen apart issue nodig: CLAUDE.md → Domein legt al vast dat de
  drempel "systeembreed, geen instelling per lid" is; er is geen UI-eis om
  het systeembrede bedrag zelf aan te passen.
- **Beheerder-specifieke gate op deze tab** — het wireframe plaatst
  "Aandacht" achter een beheerpaneel; deze spec doet dat expliciet niet (zie
  "Besloten met Bram").
- **Sortering/zoekveld/filters binnen de Aandacht-lijst** (bv. sorteren op
  oplopend saldo, zoeken op naam) — geen AC-eis, niet gebouwd in deze versie.
- **Badge/telling op de tab zelf** (bv. "Aandacht (3)") — het wireframe heeft
  zoiets (`attentionCountLabel`), maar het is geen acceptatiecriterium van
  #9. Developer mag het toevoegen als triviale UX-toevoeging, geen eis van
  deze spec.
- **Notificaties/pushmeldingen** buiten dit scherm om — #9's titel noemt
  "signalering", ingevuld als een overzichtsscherm dat de bardienst zelf
  opent, niet een proactief kanaal (geen notificatie-infrastructuur bestaat
  in deze codebase).
- **Realtime-updates van de lijst terwijl hij open staat** — zie Randgevallen,
  refetch-bij-tab-wissel is voldoende voor dit ticket.

## `useShell()`-contract

Geen nieuwe invulling. Dit tabblad is een platte lijst (geen grid, geen
overlay, geen modal) — `columns`/`density`/`overlay` worden hier niet nieuw
ingevuld, zelfde constatering als `docs/features/verkoop.md` en
`docs/features/assortimentbeheer.md` al maakten voor hun eigen schermen.
