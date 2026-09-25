# Dienst starten (bardienst-login)

Spec voor [issue #6](https://github.com/BramLambertJansen/ABAS/issues/6).
Eerste écht gebouwde scherm van `shells/bar` — zie CLAUDE.md → Werkstraat
voor waarom dit een spec vooraf krijgt in plaats van direct gebouwd wordt.

## Doel

Een bardienst/beheerder start een dienst met de eigen PIN. Dit is het enige
echte authenticatiemoment per dienst (CLAUDE.md → Auth). Na een succesvolle
start staat de starter automatisch als enige lid in de bezetting
(`shift_members`) — dat schrijfgedrag zit al in de bestaande `start_shift`-RPC
(`0001_init.sql`) en wordt door dit scherm niet opnieuw uitgevonden.

## Betrokken shell

`shells/bar` alleen. Het scherm zelf staat in `src/features/dienst-starten/`
(shell-agnostic per CLAUDE.md → Shells) en wordt gemount vanuit
`src/shells/bar/BarShellHome.tsx`. `shells/portal` blijft ongemoeid — er is
geen dienst-concept in de portal.

## Datamodel

Geen wijziging. Gebruikt de bestaande `members` (rol + `pin_hash` +
`archived`), `shifts` en `shift_members` tabellen uit `0001_init.sql`
precies zoals ze daar staan.

## RPC's

- **`start_shift(p_member_id, p_pin)`** — bestaand, ongewijzigd. Retourneert
  de nieuwe shift-row of gooit `member_not_found` / `no_bar_role` /
  `invalid_pin`.
- Geen nieuwe RPC. De twee leesacties die dit scherm nodig heeft (is er al
  een open dienst? wie mag een dienst starten?) zijn platte `select`s via de
  bestaande `_select`-policies (`authenticated` mag alles lezen, single-tenant
  — zie `docs/ARCHITECTURE.md` → Money & attribution). Die queries horen dus
  in `src/hooks/queries/`, niet in een RPC.

## Schermflow

1. **Laden**: check of er al een open dienst is (`shifts` met `ended_at is
   null`).
2. **Geen open dienst** → **stafkeuze**: grid van niet-gearchiveerde
   `bardienst`/`beheerder`-leden (naam + rolbadge), tik op een naam.
   Kolomaantal komt uit `useShell().columns` — dit is het eerste scherm dat
   dat veld daadwerkelijk gebruikt (zie ARCHITECTURE.md → Shells, "nog open").
3. **PIN-invoer**: 4 punt-indicators + numeriek toetsenbord (cijfers 0–9 +
   wis), tapdoelen ≥44px (WCAG 2.5.5), 56px zoals het ontwerp. Automatisch
   versturen zodra de 4e cijfer is ingevoerd. Fout → "onjuiste pincode" via
   `role="alert"`, invoer wist, opnieuw proberen kan direct. Terug-link naar
   stafkeuze.
4. **Succes** → dienst is nu open. Scherm toont een minimale
   "dienst actief"-plaatsvervanger (wie, sinds wanneer) — **geen**
   bezetting-, verkoop- of afsluitscherm; dat zijn respectievelijk #7, #8 en
   #12, nog niet gebouwd. Dit is bewust een placeholder, net als de huidige
   scaffold dat al zei niet te doen zonder spec.
5. **Open dienst bij laden** → stap 2/3 worden overgeslagen; scherm toont
   direct de "dienst actief"-plaatsvervanger. Er is maar één dienst
   tegelijk mogelijk op de gedeelde bar-tablet-sessie
   (`docs/ARCHITECTURE.md` → "Shared bar-tablet session mechanism").

## Rolzichtbaarheid

Iedereen die de gedeelde bar-tablet-sessie gebruikt ziet dit scherm zolang er
geen dienst open is. Er is geen aparte weergave per rol — de rolcontrole
(alleen `bardienst`/`beheerder` mag starten) gebeurt server-side in de RPC en
door de stafkeuze-lijst al te filteren op die rollen.

## Randgevallen

- **Foute PIN** → `invalid_pin`, "onjuiste pincode", geen dienst gestart.
- **Lid heeft nog nooit een PIN gekregen** (`pin_hash is null`) → zelfde
  `invalid_pin`-pad, geen aparte foutmelding (voorkomt lekken of iemand wel
  of niet een PIN heeft).
- **Gearchiveerd lid** → verschijnt niet in de stafkeuze-lijst (gefilterd bij
  het laden); zou de RPC toch worden aangeroepen dan `member_not_found`.
- **Kan bar-gegevens niet laden** (geen/foutieve Supabase-omgevingsvariabelen,
  netwerkfout) → duidelijke foutmelding in het scherm zelf, geen crash. Dit
  scherm is het eerste dat daadwerkelijk data ophaalt; er is in deze
  omgeving geen live Supabase-project beschikbaar om tegen te testen (zelfde
  bekende beperking als de RPC's/migraties zelf, zie ARCHITECTURE.md →
  Verificatie), dus deze foutstaat is wat `check:a11y` in CI daadwerkelijk
  rendert en scant.
- **Twee gelijktijdig geopende diensten** (race condition: twee tikken op
  "start" binnen hetzelfde moment, of een tweede tabblad) — oorspronkelijk
  buiten scope, later opgelost in
  [issue #29](https://github.com/BramLambertJansen/ABAS/issues/29)
  (`0021_start_shift_een_open_dienst.sql`): `start_shift` weigert met
  `shift_already_open` zolang er een dienst open is (advisory-lock, dus ook
  bij een echte gelijktijdige aanroep). Het scherm toont daarvoor geen
  foutmelding maar haalt de al open dienst op, net als na een geslaagde
  start.

## Expliciet buiten scope

- Bezetting beheren (#7), verkoopscherm (#8), dienst afsluiten (#12) — de
  "dienst actief"-plaatsvervanger hier is geen voorschot op die schermen.
  - **PIN vergeten / alternatieve inlogmethoden** (e-mail+wachtwoord,
  magic-link-noodingang) — het ontwerp heeft dit, maar het is expliciet een
  aparte "Beslissing nodig"-ticket (#22), nog niet besloten.
- Modus-keuze "Bardienst draaien" vs. "Beheer" uit het ontwerp — vervalt
  *voor dit scherm*: `beheerder` blijft een superset van `bardienst` die
  binnen dezelfde bar-shell werkt, geen apart adminscherm (CLAUDE.md →
  Domein), en deze PIN-flow krijgt geen keuzescherm. **Amendement
  (2026-08-26, ADR [0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)):**
  de uitspraak hierboven klopte binnen de aanname van dat moment (geen
  aparte beheer-sessie bestond nog); die aanname is sindsdien gecorrigeerd
  (ADR 0002) en het bredere modus-concept (bar/beheer, per sessie vast, niet
  wisselbaar) is teruggekomen op architectuurniveau — alleen bereikt via een
  aparte e-mail-inlogroute (`/beheer`, issue #14), niet via deze PIN-flow.
  Dit scherm zelf is niet herbouwd en blijft ongewijzigd.
- "Vorige dienst afgesloten door X"-banner uit het ontwerp — geen ticket
  hiervoor, hoort eerder bij #12.
- Lockout/rate-limit na foute pogingen — settled als "geen scope voor MVP"
  in #3.

## `useShell()`-contract

Eerste concrete invulling: `columns` bepaalt het aantal kolommen in de
stafkeuze-grid. `overlay` wordt door dit scherm niet gebruikt (geen
secundaire weergave hier) — blijft open voor het eerste scherm dat dat wel
nodig heeft.
