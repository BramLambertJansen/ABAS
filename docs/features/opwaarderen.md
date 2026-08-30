# Saldo opwaarderen (contant)

Spec voor [issue #10](https://github.com/BramLambertJansen/ABAS/issues/10).
Volgt op [#7](https://github.com/BramLambertJansen/ABAS/issues/7) (bezetting
beheren, gemerged) en werkt samen met
[#8](https://github.com/BramLambertJansen/ABAS/issues/8) (verkoopscherm,
gemerged via PR #41) — die spec noemde dit ticket al met naam en liet de
"saldo opwaarderen"-knoppen bewust weg: *"er bestaat nog geen opwaardeer-
scherm of -hook in de codebase (`top_up`-RPC bestaat, UI niet)... opwaarderen
krijgt zijn eigen ticket/spec"* (`docs/features/verkoop.md` → Expliciet
buiten scope). Dit is dat ticket.

**Alleen contant, alleen vanuit verkoop** — zie "Besloten" onderaan. Online
opwaarderen (iDEAL/portal) is [#23](https://github.com/BramLambertJansen/ABAS/issues/23);
opwaarderen vanuit een ledenbeheerscherm volgt op
[#13](https://github.com/BramLambertJansen/ABAS/issues/13) (nog niet
gebouwd).

## Doel

Bardienst kan tijdens een open dienst contant het saldo van een lid verhogen
via de bestaande `top_up`-RPC, met dezelfde served_by-attributie als
`place_order`. Geen nieuwe geldlogica: de `top_up`-RPC (`0001_init.sql`, al
pgTAP-getest in `supabase/tests/top_up.test.sql`) bepaalt de mutatie
server-side; dit scherm stuurt uitsluitend het gekozen lid, een bedrag (in
centen, uit een chip-keuze of een vrij invoerveld) en `served_by` mee —
nooit een berekend saldo.

## Betrokken shell

`shells/bar` alleen. Het scherm zelf komt in een nieuwe map
`src/features/opwaarderen/` (shell-agnostic per CLAUDE.md → Shells), naast
`src/features/verkoop/`.

## Datamodel

**Geen schemawijziging.** `top_ups`, de `top_up`-RPC, de bijbehorende
`_select`-policy en de `REVOKE` op de tabel bestaan al in `0001_init.sql`
precies zoals dit scherm ze nodig heeft.

## RPC's

- **`top_up(p_shift_id, p_member_id, p_amount_cents, p_method,
  p_served_by)`** — bestaand, ongewijzigd. Client stuurt member-id, een
  bedrag in centen (uit een chip of `parseEuroToCents()` op het vrije
  invoerveld — puur input-parsing, geen berekening, zie `src/lib/money.ts`)
  en `served_by` mee. `p_method` is altijd de vaste waarde `"cash"` — de
  UI biedt geen methodekeuze (zie Besloten). Retourneert de nieuwe
  `top_ups`-rij (incl. `amount_cents`, bruikbaar voor de toast-bevestiging).
- Geen nieuwe leesactie. Hergebruikt de bestaande `useMembers()`,
  `useShiftMembers(shiftId)`, `useAppSettings()` — zelfde hooks als #8,
  ongewijzigd.
- Nieuwe mutatiehook **`useTopUp()`** in `src/hooks/queries/useTopUp.ts` —
  zelfde vorm als `usePlaceOrder()` (`status`/`errorCode`/`reset`,
  discriminated result). Typed error-code union: `shift_not_open |
  served_by_not_on_shift | invalid_amount | member_not_found | unknown` —
  dit zijn exact de `raise exception`-codes die `top_up` in `0001_init.sql`
  gooit; zie Randgevallen voor de UI-afhandeling per code.

## Rolzichtbaarheid

Zelfde vertrouwensmodel als #8: iedereen op de gedeelde bar-tablet-sessie
tijdens een open dienst kan opwaarderen; `top_up` controleert alleen
`served_by` tegen de bezetting, geen rol-check.

## Navigatie

Geen nieuwe navigatie/route. Het opwaardeerscherm is een modal
(`src/components/Overlay.tsx`, derde consument naast `AfrekenenOverlay` en
`BezettingOverlay`), geopend vanuit het al bestaande Verkoop-tabblad.

## Schermflow

### 1. Trigger vanuit verkoop (`Mandje.tsx`)

Twee triggers, beide op de al bestaande ledenkaart/banner in het
mandje-paneel (`docs/features/verkoop.md` → Schermflow §2), beide openen
dezelfde overlay voor hetzelfde geselecteerde lid:

- Een knop **"saldo opwaarderen"** naast de bestaande "wissel"-knop op de
  ledenkaart, zichtbaar zodra een lid gekozen is.
- Een knop **"opwaarderen"** in de bestaande onvoldoende-saldo-banner
  ("Onvoldoende saldo — {tekort} tekort."), naast de bannertekst.

Beide tillen het "open de overlay"-signaal op naar `VerkoopScherm.tsx` via
één `onOpenTopup: () => void`-prop — `Mandje` kent alleen de trigger, niet
de open/close-levenscyclus (zelfde verdeling als `onOpenCheckout`).

### 2. Opwaardeer-overlay (modal, `Overlay.tsx`)

- Titel: **"Saldo opwaarderen bij {ledennaam}"** (consistent met
  "Afrekenen bij {ledennaam}").
- Ledenkaart: naam + huidig saldo, met dezelfde laag-saldo-tekstsuffix ("
  — laag saldo") als `Mandje.tsx`/#9 wanneer `balanceCents <
  lowBalanceThresholdCents` — zelfde grens, zelfde bron
  (`useAppSettings()`), nooit kleur-only.
- Statische indicatie **"betaald met: contant"** — geen methode-toggle.
  MVP is uitsluitend contant (CLAUDE.md → Domein, en expliciet in #10's
  acceptatiecriteria); een toggle met maar één werkende optie voegt niets
  toe en zou de indruk wekken dat er een keuze is. Zodra een tweede methode
  landt (#23), krijgt die keuze hier pas een UI.
- Vier vaste **bedrag-chips**: €5 / €10 / €20 / €50 (Besloten,
  2026-08-29). Tikken op een chip vult het bedrag; nog een keer tikken of
  een ander bedrag intikken overschrijft de keuze.
- Vrij **invoerveld** ("ander bedrag") — tekst wordt via
  `parseEuroToCents()` omgezet; een ongeldige/lege waarde is geen geldig
  bedrag (zie hieronder).
- **"Wie geeft uit?"-picker** — 1-op-1 hetzelfde patroon als
  `AfrekenenOverlay.tsx`/§3 van `verkoop.md`: alleen zichtbaar bij bezetting
  2+, automatische toewijzing bij precies 1 lid, hint "verplicht"/"gekozen".
- Knoppen: **"annuleren"** (sluit; niet tijdens een lopende `top_up`-
  aanroep) en **"boeken"** (disabled zonder geldig, positief bedrag, of
  zonder `served_by` bij bezetting 2+, of tijdens pending — zelfde
  dubbele-indiening-guard als `AfrekenenOverlay`).
- Bij tik op "boeken": `useTopUp().topUp(shiftId, member.id, amountCents,
  effectiveServedBy)`. Bij succes: overlay sluit, toast "Opgewaardeerd —
  {bedrag}." (zelfde toast-patroon als "Afgerekend — …"),
  `useMembers().refetch()` zodat een volgende zoekactie het bijgewerkte
  saldo toont. Bij fout: zie Randgevallen; overlay blijft in de regel open.

## Randgevallen

**Bezetting** — zelfde drie standen als `verkoop.md` §3, hier hergebruikt:
- **Bezetting = 0**: opwaarderen client-side geblokkeerd vóór de
  RPC-aanroep, zelfde `EMPTY_ROSTER_MESSAGE`-achtige melding als het
  verkoopscherm (`rosterEmpty`/`rosterUnavailable`-guards, ook hier
  toegepast op de trigger-knop zelf: geen overlay openen zonder bekende
  bezetting).
- **Bezetting = 1** → automatische toewijzing, geen picker.
- **Bezetting 2+** → picker verplicht, boeken geblokkeerd zonder keuze.
- **`served_by` valt weg tussen kiezen en boeken** (zeldzame race, zelfde
  scenario als `verkoop.md`): RPC gooit `served_by_not_on_shift`, UI reset
  de keuze en toont "degene die je koos staat niet meer in de bezetting —
  kies opnieuw", overlay blijft open.

**RPC-foutcodes van `top_up`** (client → Nederlandse melding):

| Code | Wanneer bereikbaar via deze UI | Melding | UI-actie |
|---|---|---|---|
| `served_by_not_on_shift` | Race, zie hierboven | "degene die je koos staat niet meer in de bezetting — kies opnieuw" | keuze resetten, bezetting refetchen, overlay blijft open |
| `member_not_found` | Lid wordt gearchiveerd tussen openen en boeken (praktisch onbereikbaar zolang #13 niet bestaat, wel cheap af te vangen) | "dit lid bestaat niet meer of is gearchiveerd — kies een ander lid" | overlay sluit terug naar het verkoopscherm, leden refetchen |
| `invalid_amount` | Client-guard hoort dit al te voorkomen (geen geldig/positief bedrag); server-fallback bij een edge case in de invoer | "vul een geldig bedrag in" | overlay blijft open, invoerveld blijft bewerkbaar |
| `shift_not_open` | Bereikbaar sinds #12 (docs/features/dienst-afsluiten.md): "Dienst afsluiten" op de Dienst-tab roept `end_shift` aan, waarna een nog open opwaardeer-overlay hierop stuit bij boeken, zelfde constatering als `verkoop.md` | "de dienst is niet meer actief — herlaad het scherm" | — |
| `unknown` (netwerk/onverwacht) | Altijd mogelijk | "er ging iets mis, probeer het opnieuw" | overlay blijft open, bedrag/keuze blijven staan zodat opnieuw proberen kan zonder alles opnieuw in te vullen |

**Overig**
- **Dubbele indiening** (dubbeltik op "boeken") → `useTopUp()`'s
  `pending`-status disabled de knop tijdens de aanroep, zelfde patroon als
  `AfrekenenOverlay`.
- **Netwerkfout tijdens `top_up`** → gekozen bedrag/lid blijven intact
  zodat de operator zonder opnieuw in te vullen kan herproberen.
- **A11y van de opwaardeer-overlay**: net als bij #7/#8 moet Tester de
  axe-scan uitbreiden met een scenario dat deze overlay opent vóór het
  scannen, anders blijft dit scherms nieuwe interactieve element buiten de
  WCAG-AA-gate.

## Expliciet buiten scope

- **Opwaarderen vanuit ledenbeheer** (`onOpenTopupFromMember` in het
  ontwerp) — [#13](https://github.com/BramLambertJansen/ABAS/issues/13)
  (Ledenbeheer) bestaat nog niet, er is geen "lid beheren"-paneel om de
  knop in te zetten. Zodra #13 er is, kan dat scherm dezelfde
  `OpwaarderenOverlay` hergebruiken.
- **Online opwaarderen** (iDEAL, Tikkie, andere portal-methodes) —
  [#23](https://github.com/BramLambertJansen/ABAS/issues/23). De RPC-grens
  (client stuurt nooit een berekend bedrag, methode is een los RPC-param)
  staat al zo dat een betaalprovider-webhook er later naast kan zonder het
  patroon te breken — geen wijziging hier nodig om dat mogelijk te houden.
- **Saldocorrectie** (het naastliggende `correctionOpen`-modal in het
  ontwerp, voor foutief geboekte tikken) — hoort bij #13, niet bij dit
  ticket.
- **Methode-toggle/meerdere betaalmethodes** — client stuurt hardcoded
  `"cash"`; zie Besloten.
- **Server-side afdwinging van `method`** (check-constraint op
  `top_ups.method`) — zie Besloten. De kolom blijft vrije tekst; de client
  is de enige plek die vandaag de waarde bepaalt.

## `useShell()`-contract

Geen nieuwe beslissing. Derde consument van de bestaande `Overlay`-
primitive; `overlay` blijft `"modal"` op `shells/bar` (settled sinds #7).
`columns`/`density` worden door dit scherm niet nieuw ingevuld.

## Besloten: bedrag-chips en method-afdwinging (2026-08-29)

Bram heeft gekozen:
- **Bedrag-chips:** €5 / €10 / €20 / €50 (vier vaste snelkeuzes, naast het
  vrije invoerveld).
- **`method`-afdwinging:** geen server-side check-constraint op
  `top_ups.method` nu. De client stuurt altijd de hardcoded technische
  waarde `"cash"` (Engelse RPC-param-conventie, consistent met de
  bestaande errcodes zoals `shift_not_open`/`served_by_not_on_shift`); de
  NL-UI-tekst is "contant". Geen migratie nodig voor dit ticket — een
  constraint kan alsnog toegevoegd worden zodra #23 een tweede methode
  introduceert en er iets is om tegen af te dwingen.

Bevindingen die tot deze vragen leidden (context, geen actie meer nodig):
het **ontwerp** (`designs/Bar App.dc.html`, regel ~1080) toont vier
bedrag-chips zonder ingevulde waarden (template-placeholders) en een
3-opties methode-toggle ("contant"/"Tikkie"/"bank" — prototype-tekst, niet
de vastgelegde MVP-scope). De `top_ups.method`-kolom (`0001_init.sql`) is
vrije tekst zonder check-constraint; de RPC accepteert vandaag elke string.

## Gebouwd (2026-08-29): status na deze branch

Deze spec klopt op alle inhoudelijke punten (RPC-gebruik, schermflow,
randgevallen-tabel, scope-afbakening) zoals gebouwd. Geen migratie nodig —
`top_up`/`top_ups`/RLS/REVOKE bestonden al. Nieuwe bestanden:
`src/hooks/queries/useTopUp.ts`, `src/features/opwaarderen/
OpwaarderenOverlay.tsx`, `src/features/opwaarderen/messages.ts`; gewijzigd:
`src/features/verkoop/Mandje.tsx` (twee triggers), `src/features/verkoop/
VerkoopScherm.tsx` (`topupOpen`-state, orchestratie, gedeelde
`handleMemberNotFound` sluit nu ook de opwaardeer-overlay).

Het served_by/bezetting-patroon (`needsPicker`/`effectiveServedBy`, de
`pending`-sluit-guard) is bewust 1-op-1 gekopieerd uit `AfrekenenOverlay.tsx`
in plaats van geëxtraheerd naar een gedeeld component — zelfde
"geen vroegtijdige extractie zonder een derde consument"-afweging als #8
tegenover `BezettingOverlay`.

Tester breidde `supabase/tests/top_up.test.sql` uit met de drie eerder
onbedekte weigergronden (`invalid_amount` ×2, `member_not_found`,
`shift_not_open` — plan ging van 3 naar 7 assertions) en
`e2e/a11y.spec.ts` met twee scenario's: de opwaardeer-overlay zelf
(axe-scan + focus-assertion, vanuit de ledenkaart-trigger) en een los
scenario dat bevestigt dat de onvoldoende-saldo-banner-knop naar dezelfde
overlay leidt. Zelfde bekende beperking als de afrekenbevestiging-test:
tegen `supabase/seed.sql` blijft de bezetting op 1 lid, dus de 2+
"Wie geeft uit?"-picker wordt hier niet gescand.

**Verificatie-kanttekening**: in de ontwikkelomgeving van deze sessie was
`supabase start` (Docker) niet bereikbaar — image-pulls van de container-
registry werden door het netwerkbeleid geweigerd (403). `lint`,
`typecheck`, `build`, `check:arch`, `check:policy` en `check:rls` draaiden
wel volledig en groen. De pgTAP-tests (bestaand + nieuw, alle
weigergronden hierboven) zijn handmatig geverifieerd tegen een echte
lokale PostgreSQL 16 + pgTAP-installatie met de daadwerkelijke migraties
toegepast — alle assertions slagen. `check:a11y` (Playwright, vereist de
draaiende app + een volledige Supabase-auth-stack) kon in die omgeving niet
end-to-end gedraaid worden; een reguliere CI-run (met Docker-toegang) moet
dit alsnog bevestigen vóór merge.
