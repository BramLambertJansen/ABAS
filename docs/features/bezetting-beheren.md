# Bezetting beheren tijdens dienst

> **Bijgewerkt door [`dienst-per-sessie.md`](dienst-per-sessie.md) (ADR 0016, gemerged in [PR #120](https://github.com/BramLambertJansen/ABAS/pull/120), 2026-10-01):**
> `add_shift_member` en `remove_shift_member` eisen een bar-sessie die aan de
> dienst gekoppeld is (`require_shift_session`). "Iedereen op de gedeelde
> bar-tablet-sessie" hieronder is historie: het is nu iedereen die in een
> persoonlijke sessie op het apparaat van de dienst werkt. De bezetting zelf
> (wie meewerkt, `served_by`) is ongewijzigd.

Spec voor [issue #7](https://github.com/BramLambertJansen/ABAS/issues/7).
Volgt op [#6](https://github.com/BramLambertJansen/ABAS/issues/6) (`docs/features/dienst-starten.md`)
en vervangt/breidt uit wat daar bewust als plaatsvervanger is neergezet:
`src/features/dienst-starten/ShiftActivePlaceholder.tsx` noemt dit ticket met
naam in zijn eigen commentaar als de spec die hem vervangt.

## Besloten: zelf-verwijdering (2026-08-26)

Bram heeft gekozen: **optie B — geen restrictie**. De dienst-starter (en
iedereen anders) kan zichzelf uit de bezetting verwijderen, ook tot een lege
bezetting — precies wat `add_shift_member`/`remove_shift_member` vandaag al
toestaan, zonder extra check. Geen starter-lock in de UI (geen `locked`-gedrag
zoals het ontwerp dat toont), geen minimum-bezetting-check in de RPC's. De
enige RPC-wijziging die deze spec vraagt is de `shift_not_open`-fix op
`remove_shift_member` verderop — ongewijzigd door dit besluit, want die fix
gaat over *wanneer* je mag verwijderen (dienst moet open zijn), niet over
*wie* je mag verwijderen.

Gevolg dat bewust geaccepteerd is: als de bezetting leeg raakt, falen
`place_order`/`top_up` daarna voor iedereen op `served_by_not_on_shift` totdat
er weer iemand wordt toegevoegd — geen dataverlies, wel een doodlopend tablet
tot iemand zichzelf of een ander weer toevoegt. Zie Randgevallen → "Lege
bezetting" voor het vereiste schermgedrag in die staat.

## Doel

Na het starten van een dienst (#6) kan de starter — en iedereen die daarna
aan het gedeelde bar-tablet staat — andere leden aan de actieve bezetting
toevoegen zonder dat die leden zelf inloggen, en leden uit de bezetting
verwijderen, ook terwijl de dienst al loopt. De bezetting is zichtbaar op het
"dienst actief"-scherm. Dit is precies het "crew"/"wie werkt er mee"-concept
uit `designs/chats/chat18.md` en `chat19.md`, vereenvoudigd zoals
`docs/ARCHITECTURE.md` → "Dienst & bezetting" al vastlegt: geen per-order PIN,
geen apart "wie geeft uit"-scherm (dat hoort bij het verkoopscherm, #8, niet
hier).

## Betrokken shell

`shells/bar` alleen — zelfde reden als #6, er is geen dienst-concept in
`shells/portal`. Het scherm/component staat shell-agnostic in
`src/features/bezetting-beheren/` (los van `src/features/dienst-starten/`,
zodat de twee specs — dienst starten vs. bezetting tijdens een lopende dienst
beheren — elk hun eigen featuremap houden, net zoals ze elk hun eigen issue
en spec hebben). `src/features/dienst-starten/DienstStarten.tsx` mount het
nieuwe component in plaats van `ShiftActivePlaceholder` zodra er een open
dienst is; `ShiftActivePlaceholder.tsx` vervalt (zijn enige inhoud —
"gestart door X sinds HH:MM" — verhuist naar het nieuwe component, zie
Schermflow).

## Datamodel

Geen schemawijziging. Gebruikt `shifts`, `shift_members` en `members` exact
zoals ze in `0001_init.sql` staan.

## RPC's

- **`add_shift_member(p_shift_id, p_member_id)`** — bestaand, ongewijzigd.
  Gooit `shift_not_open` (dienst niet open) of `member_not_eligible`
  (gearchiveerd of geen `bardienst`/`beheerder`-rol).
- **`remove_shift_member(p_shift_id, p_member_id)`** — bestaand, **wijziging
  nodig**. In `0001_init.sql` (regel 212–219) is dit een kale
  `delete from shift_members where shift_id = ... and member_id = ...` zonder
  enige controle of de dienst nog open is — in tegenstelling tot
  `add_shift_member`, die die controle al wel heeft (regel 197–199). Dat is
  een gat tegen de eigen acceptatiecriteria van #7: "toevoegen/verwijderen
  buiten een actieve dienst wordt geweigerd" geldt vandaag alleen voor
  toevoegen. Voeg dezelfde `shift_not_open`-guard toe die `add_shift_member`
  al heeft, vóór de delete. Dit is een wijziging aan een bestaande RPC, geen
  nieuwe RPC — geen ADR nodig (sluit een gat tegen een al vastgelegd
  principe, introduceert niets nieuws), wél een nieuwe, opeenvolgend
  genummerde migratie na `0002_fix_start_shift_pgcrypto_search_path.sql`
  (bijv. `0003_remove_shift_member_requires_open_shift.sql`) — dat is het
  bestaande patroon in dit repo voor een fix op een al gemergede RPC, niet
  het aanpassen van `0001_init.sql` zelf. De functie gaat daarbij naar
  `language plpgsql` (nodig voor de conditionele `raise`, zoals
  `add_shift_member` dat ook al is) — `grant execute` hoeft niet opnieuw:
  zelfde naam/signatuur, `create or replace function` behoudt de bestaande
  grant. **Dit moet met naam terugkomen in Developer's PR-beschrijving en in
  Tester's testplan** — het is de enige echte RPC-wijziging in deze spec en
  raakt rechtstreeks een acceptatiecriterium.
- Verder geen nieuwe RPC's. "Wie zit er nu in de bezetting?" en "wie is
  beschikbaar om toe te voegen?" zijn platte `select`s (zelfde argumentatie
  als `docs/features/dienst-starten.md` → RPC's: `authenticated` mag alles
  lezen, single-tenant) en horen dus in `src/hooks/queries/`.

## Schermflow

1. **Binnenkomst**: zoals nu — `DienstStarten` toont dit scherm alleen als
   `useOpenShift()` een open dienst teruggeeft (stap 4/5 van
   `docs/features/dienst-starten.md`). Niets aan die binnenkomstlogica
   verandert.
2. **Dienst-actief-scherm** (nieuw component, vervangt
   `ShiftActivePlaceholder`) toont:
   - de bestaande "Dienst actief"-info (✓-badge, "Gestart door X om HH:MM",
     ongewijzigde tekst/opmaak uit de huidige placeholder);
   - een **bezetting-sectie**: avatarstapel + namen van de huidige
     `shift_members` (nieuwe leeshook, zie hieronder), plus een knop om de
     bezetting te wijzigen (bijv. "Bezetting wijzigen", tapdoel ≥44px zoals
     de rest van de bar-shell). Dit is waar acceptatiecriterium "bezetting
     zichtbaar ergens in de bar-UI" wordt ingevuld — er is nog maar één
     bar-scherm gebouwd (#8/verkoop en #12/afsluiten bestaan nog niet), dus
     een schermbrede header-chip zoals het prototype die op meerdere
     schermen toont (`designs/Bar App.dc.html` regel 64–70) is nu nog niet
     zinvol; dat volgt vanzelf zodra #8 een tweede bar-scherm toevoegt.
   - Placeholder-restzin ("Verkoop, bezetting en dienst afsluiten volgen in
     latere schermen") wordt aangepast: bezetting is nu gebouwd, verkoop/
     afsluiten (#8/#12) blijven genoemd als nog te volgen.
3. **Tik op "Bezetting wijzigen"** → een overlay opent
   (`useShell().overlay`, zie useShell()-contract hieronder — vandaag altijd
   `"modal"` op de bar-shell). Titel en toelichting, aangepast van
   `designs/Bar App.dc.html` (regel 3199/3202 — de "intro"-variant met
   activiteitskeuze is buiten scope, zie hieronder):
   - Titel: **"Bezetting van deze dienst"**
   - Toelichting: **"Iedereen hieronder werkt in dezelfde dienst. Tik iemand
     aan om toe te voegen of af te melden."**
   - Eén lijst van alle niet-gearchiveerde `bardienst`/`beheerder`-leden —
     kandidatenpool via de bestaande `useBarStaff()`-hook (hergebruikt, geen
     nieuwe leeshook nodig voor "wie mag toegevoegd worden"). Per rij: naam +
     rolbadge (zelfde opmaak als `StaffPicker.tsx` — controleer dat component
     eerst op hergebruik/uitbreiding voor je nieuwe rij-markup schrijft, per
     CLAUDE.md → "Componenten zijn herbruikbaar totdat bewezen anders"; de
     interactie is hier wel anders — multi-toggle in plaats van
     single-select-en-navigeer — dus een 1-op-1 hergebruik van `StaffPicker`
     zelf ligt niet voor de hand, wel het onderliggende rij-patroon).
   - Wie al in de bezetting zit: visueel gemarkeerd (bijv. vinkje/gevulde
     rand, zoals het ontwerp's `on ? '✓' : '+'`). Tik op een rij **buiten**
     de bezetting → `add_shift_member`. Tik op een rij **in** de bezetting →
     `remove_shift_member` — zonder uitzondering voor de starter-rij (zie
     "Besloten: zelf-verwijdering" hierboven).
   - Geen aparte bevestiging of PIN per tik — dit dekt letterlijk het eerste
     acceptatiecriterium ("geen PIN/bevestiging van dat lid nodig") en volgt
     het ontwerp, dat ook geen confirm-stap heeft op deze toggle.
   - Sluiten via een knop ("Klaar", vertaald van het ontwerp se "klaar") of
     de standaard modal-sluitroutes (backdrop-tik, Escape — zie
     useShell()-contract voor de a11y-eisen aan de overlay zelf).
4. **Elke tik**: RPC-aanroep, daarna directe visuele update van die rij.
   Mislukt de aanroep → Nederlandse foutmelding in de overlay via
   `role="alert"` (zelfde patroon als `useOpenShift`/`useBarStaff`: ruwe
   Postgres-foutmelding alleen loggen, nooit tonen), rij blijft in de oude
   staat. Typed error-code union per actie (zelfde patroon als
   `useStartShift.ts` → `StartShiftErrorCode`): voor toevoegen
   `no_bar_role | shift_not_open | member_not_eligible | unknown`, voor
   verwijderen (na de RPC-fix hierboven) `no_bar_role | shift_not_open |
   unknown`. `no_bar_role` (lid-sessie, sinds 0023, #100) toont bij beide
   "dit account mag niet op de bar werken — log uit en log in als bardienst".
5. **Overlay sluiten** → terug naar het dienst-actief-scherm; de
   bezetting-sectie toont de actuele lijst (refetch van de nieuwe leeshook).

## Rolzichtbaarheid

Zelfde model als #6: iedereen die de gedeelde bar-tablet-sessie gebruikt
tijdens een open dienst ziet dit scherm en kan de bezetting wijzigen — er is
geen aparte weergave of extra restrictie per rol. Dat is bewust consistent
met de rest van de RPC-laag: `add_shift_member`/`remove_shift_member`
controleren (net als `place_order`/`top_up`) alleen de rol van het lid dat
wordt toegevoegd/verwijderd, nooit de rol van wie de aanroep doet — er is geen
"alleen de starter mag de bezetting wijzigen"-regel, nergens in CLAUDE.md,
`docs/ARCHITECTURE.md` of #7 vastgelegd, en dat past bij het gedeelde-tablet
vertrouwensmodel (`docs/ARCHITECTURE.md` → "Shared bar-tablet session
mechanism").

## Randgevallen

- **Toevoegen/verwijderen buiten een actieve dienst** → `shift_not_open` van
  beide RPC's (zie RPC-sectie voor de fix die dit voor verwijderen pas
  mogelijk maakt) — dit is de expliciete negatieve test uit #7's
  acceptatiecriteria en moet in `supabase/tests/` terugkomen (nieuw
  testbestand, er bestaat vandaag geen `add_shift_member`/
  `remove_shift_member`-dekking in `supabase/tests/`, alleen indirecte
  fixtures in `start_shift.test.sql`/`place_order.test.sql`/
  `top_up.test.sql`).
- **Lege bezetting** (bijv. de starter verwijdert zichzelf als laatste
  overgeblevene — toegestaan, zie "Besloten: zelf-verwijdering" hierboven) →
  het scherm mag niet crashen: bezetting-sectie toont een lege staat (bijv.
  "Nog niemand" i.p.v. een avatarstapel) en de "Bezetting wijzigen"-knop
  blijft werken zodat er weer iemand toegevoegd kan worden.
- **Lid wiens rol/archief-status wijzigt terwijl het al in de bezetting
  zit** (bv. een beheerder verandert iemand terug naar `lid`, of archiveert
  ze, tijdens een lopende dienst) → blijft zichtbaar in de bezetting-lijst
  van de huidige leeshook (die leest gewoon de bestaande `shift_members`-rij
  + huidige naam, geen filter op rol/archief) zoals eerder toegevoegde leden
  ook zichtbaar blijven in historische data (vgl. `order_lines.unit_cents`
  die prijswijzigingen niet met terugwerkende kracht doorvoert). Zo iemand
  verdwijnt wel uit de kandidatenpool om (opnieuw) toe te voegen — die pool
  komt uit `useBarStaff()`, die al filtert op niet-gearchiveerd +
  `bardienst`/`beheerder`.
- **Dubbele toevoeging** (zelfde lid twee keer aantikken, race tussen twee
  snelle tikken) — `add_shift_member` gebruikt al `on conflict do nothing`;
  de UI voorkomt dit bovendien door een rij die al in de bezetting zit als
  "verwijderen" te tonen, niet als "toevoegen".
- **Kan bezetting/kandidatenlijst niet laden** (netwerkfout — zelfde
  bekende beperking als #6: geen live Supabase-project in deze omgeving) →
  vaste Nederlandse foutmelding in het scherm, geen crash, zelfde patroon als
  `useOpenShift`/`useBarStaff`.
- **Dienst eindigt terwijl de overlay open staat** — niet bereikbaar in deze
  scope: `end_shift` heeft nog geen UI-trigger (#12, dienst afsluiten, is nog
  niet gebouwd), dus dit scenario kan in de huidige app niet ontstaan. Geen
  gedrag hiervoor specificeren nu; #12 behandelt dit wanneer het aan de beurt
  is.
- **A11y-dekking van de overlay zelf**: `e2e/a11y.spec.ts` scant vandaag
  alleen de statische `/`- en `/portal`-routes bij het laden — dit is het
  eerste scherm met een echte interactieve overlay (`useShell().overlay`,
  hieronder), en de axe-scan zoals hij nu is opgezet opent die overlay niet
  vóór het scannen. Tester moet de scan uitbreiden zodat de geopende-overlay-
  staat ook gescand wordt (bv. een extra testcase die op de "Bezetting
  wijzigen"-knop klikt vóór de axe-analyse), anders blijft dit scherms
  belangrijkste nieuwe UI-element (een modal met focus-trap, backdrop, tikbare
  rijen) buiten het WCAG-AA-gate om.

## Expliciet buiten scope

- **Activiteitskeuze bij het openen van de bezetting** (het ontwerp's
  "intro"-variant met `shiftActivityId`/`crewSheetIntro`, regel 941–964 in
  `designs/Bar App.dc.html`) — expliciet nog niet besloten scope, zie
  `docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog niet is
  besloten" ("Activity types linked to a shift").
- **"Wie geeft uit?"-keuze bij afrekenen** (`serverOptions`/`serverMissing`
  in het ontwerp) — hoort bij het verkoopscherm, #8, niet hier. Deze spec
  bouwt alleen de bezetting zelf (wie staat er mee te werken), niet de
  attributie per bestelling — die logica bestaat al serverside in
  `place_order`/`top_up` (`served_by`) en krijgt zijn UI in #8.
- **Dienstoverzicht met bonnen-per-bediener** (`crewStatRows` in het ontwerp)
  — hoort bij #8 en/of #12 (afsluiten), niet hier.
- **Schermbrede/header-bezetting-chip zichtbaar op meerdere bar-schermen**
  (zoals het ontwerp's navbar-chip) — er is nog maar één bar-scherm; dit
  volgt vanzelf zodra #8 een tweede scherm toevoegt, geen voorschot nemen nu.
- **Race-condition-bescherming bij gelijktijdige toggles** — geen scope,
  zelfde soort afweging als issue #29 voor `start_shift`.
- **Sheet-variant van de overlay** (voor `shells/portal`) — er is geen
  dienst-concept in de portal en dus geen consument vandaag; zie
  useShell()-contract hieronder.
- **RPC-laag afdwingen van een minimale bezetting / de starter beschermen
  tegen verwijdering** — bewust niet gebouwd, zie "Besloten:
  zelf-verwijdering" hierboven (optie B). `remove_shift_member` krijgt niets
  extra's bovenop de `shift_not_open`-fix.

## `useShell()`-contract

Eerste echte gebruik van `overlay` (`"modal" | "sheet"`) — de open
aantekening hierover in `docs/ARCHITECTURE.md` → "Open" noemt dit scherm al
als de waarschijnlijke eerste consument. De "Bezetting wijzigen"-overlay is
het eerste onderdeel dat een secundaire weergave nodig heeft; het rendert
volgens `useShell().overlay`, wat op de bar-shell vandaag altijd `"modal"`
is (`barCapabilities.overlay`, `src/shells/bar/capabilities.ts`).

Dit is ook de eerste keer dat er een gedeelde overlay-primitive nodig is.
`src/components/` is nog leeg — dit is het moment om daar de eerste
component neer te zetten (naam/props aan Developer, per CLAUDE.md levert de
Architect geen code), zodat een volgend scherm met een secundaire weergave
'm hergebruikt in plaats van dupliceert. De primitive moet type-technisch
beide takken van `overlay` onderscheiden (`"modal"` vs `"sheet"`), maar bouw
nu alleen de `"modal"`-tak echt uit (centered dialog met backdrop, zoals het
ontwerp's `crewSheetOpen`-overlay: rgba-backdrop, gecentreerde kaart) — er is
geen `shells/portal`-consument vandaag om een sheet-variant tegen te bouwen
of te testen. Dat is dezelfde afweging als shadcn/ui in
`docs/ARCHITECTURE.md` → "Built": niet vooruit bouwen wat nog geen scherm
nodig heeft. Verplicht wél, ongeacht welke tak: `role="dialog"`,
`aria-modal="true"`, gelabeld door de titel, focus die bij openen naar de
overlay verplaatst en bij sluiten terugkeert, en Escape/backdrop-tik die
sluit — dat is wat `check:a11y` zinvol kan scannen zodra Tester de scan
uitbreidt (zie Randgevallen).

`density` en `columns` worden door dit scherm niet nieuw ingevuld — de
kandidatenlijst in de overlay kan het bestaande `columns`-patroon van
`StaffPicker` hergebruiken als de rij-vorm dat toelaat, maar is ook prima als
enkele kolom (lijst i.p.v. grid, zoals het ontwerp de crew-lijst toont) —
implementatiedetail, geen architectuurkeuze.
