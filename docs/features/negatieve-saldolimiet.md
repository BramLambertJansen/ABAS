# Negatieve-saldolimiet: systeeminstelling + afdwingen

Spec voor [issue #11](https://github.com/BramLambertJansen/ABAS/issues/11).
Werkt samen met [#8](https://github.com/BramLambertJansen/ABAS/issues/8)
(verkoopscherm, gemerged) en volgt hetzelfde beheer-sessiepatroon als
[#14](https://github.com/BramLambertJansen/ABAS/issues/14)
(`docs/features/assortimentbeheer.md`, ADR
[0002](../adr/0002-beheeracties-vereisen-eigen-e-mail-sessie.md)/
[0003](../adr/0003-auth-methode-per-lid-en-vaste-modus-bar-beheer.md)).

## Status van de acceptatiecriteria (voor je verder leest)

Net als bij [#9](laag-saldo-signalering.md) is een deel van dit ticket al
gebouwd, niet als herformulering om scope kleiner te laten lijken, maar
omdat #8 de handhaving al meebouwde toen het de bestaande
`negative_limit_cents`-kolom moest lezen voor zijn eigen saldo-check:

1. **"`place_order` controleert saldo tegen deze limiet server-side" — al
   gebouwd, niets nieuws nodig.** `place_order` (`0001_init.sql`, regel
   270–281) leest `app_settings.negative_limit_cents` en weigert met
   `insufficient_balance` zodra `balance_cents - total < -negative_limit`.
   Dit was er al vóór #8 (het stond al in de oorspronkelijke schema-migratie)
   en #8 hergebruikte het ongewijzigd voor zijn eigen proactieve
   onvoldoende-saldo-banner (`docs/features/verkoop.md` → Schermflow §2/§3).
2. **"Bestellen boven de limiet wordt geweigerd met duidelijke melding" — al
   gebouwd, niets nieuws nodig.** De melding **"Onvoldoende saldo — {tekort}
   tekort."** bestaat al, zowel als proactieve banner in `Mandje.tsx`
   (berekend uit `balance_cents + negative_limit_cents`) als als
   RPC-foutafhandeling in `AfrekenenOverlay.tsx` voor de
   `insufficient_balance`-foutcode (`docs/features/verkoop.md` →
   Randgevallen-tabel). Deze spec verandert die tekst niet.
3. **"Negatieve test: instelling op €0 gedraagt zich als 'nooit negatief'" —
   al gebouwd, niets nieuws nodig.** `supabase/tests/place_order.test.sql`
   zet expliciet `negative_limit_cents = 0` als fixture en bewijst met
   `throws_ok(..., 'insufficient_balance', ...)` dat een bestelling die het
   saldo verder dan €0 in het rood zou zetten, geweigerd wordt. Dit
   dekt AC #4 uit het ticket al voor het `place_order`-pad.
4. **"Instellingsscherm (beheerder) om de systeembrede negatieflimiet te
   wijzigen" — nog niet gebouwd. Dit is de enige echte scope van deze
   spec.** Er bestaat vandaag geen schrijfpad naar
   `app_settings.negative_limit_cents` — de kolom is sinds
   `0004_revoke_app_settings_writes.sql` `REVOKE`d voor
   `insert/update/delete` van `authenticated`, en er is geen RPC die 'm
   schrijft. `useAppSettings()` (`src/hooks/queries/useAppSettings.ts`) heeft
   zelfs een expliciete `refetch()`-weglating met als reden "de instelling
   wijzigt vandaag nergens in de UI (#11 ... is niet gebouwd)". Dat is
   precies wat deze spec toevoegt.

**Wat dit betekent voor de rest van dit document**: de RPC/handhavings-kant
van `place_order` blijft **ongewijzigd**; de spec hieronder gaat over het
nieuwe schrijfpad (RPC + UI) waarmee een beheerder die al bestaande, al
gecontroleerde kolom daadwerkelijk kan aanpassen — en over de kleine
aanvullingen die dat schrijfpad in bestaande code nodig maakt
(`useAppSettings()`'s ontbrekende `refetch()`, `/beheer`'s nog-geen-
navigatiestructuur).

## Doel

Een beheerder kan, ingelogd op `/beheer` (dezelfde eigen e-mail-sessie als
assortimentbeheer), de systeembrede negatieflimiet
(`app_settings.negative_limit_cents`) instellen — via vier vaste
snelkeuze-chips of een vrij bedrag — zodat de al bestaande handhaving in
`place_order` een instelbare in plaats van een vaste (migratie-default)
waarde afdwingt.

**Raakt de twee kernbeslissingen uit CLAUDE.md → Architectuurbeslissingen
als volgt**: "geld beweegt alleen via RPC" — de nieuwe schrijfactie op
`app_settings` gaat, net als elke andere geldbeweging/geld-aangrenzende
instelling, via een `SECURITY DEFINER`-RPC die de waarde valideert vóór het
schrijven; er is geen directe tabel-write. "`served_by` komt uit de
bezetting" is hier niet van toepassing — dit is geen bestelling/opwaardering
met attributie aan een bar-medewerker tijdens een dienst, maar een
beheerder-only instelling buiten shift-context, exact zoals
`create_product`/`update_product_price`/`set_product_archived` dat ook al
zijn (ADR 0002's `auth.uid()`-actorcheck, geen `served_by`, geen PIN-per-actie).

## Betrokken shell

`shells/bar` alleen, binnen de bestaande `/beheer`-route (geen nieuwe
top-level route). Er is geen instellingenconcept in `shells/portal` — een
lid ziet nooit systeeminstellingen (CLAUDE.md → Domein: geen los
adminscherm).

**Nieuw: `/beheer` krijgt een eenvoudige tabbalk (Assortiment |
Instellingen).** Vandaag toont `Assortimentbeheer.tsx` na een geslaagde
login altijd en alleen de productenlijst (`ProductenLijst.tsx`) — er is geen
navigatiestructuur, met als expliciete reden in
`docs/features/assortimentbeheer.md` → Expliciet buiten scope: *"een
tijdelijk, minimaal koppelpunt — geen tabbalk, geen navigatiestructuur"*, wat
op dat moment klopte omdat er precies één scherm achter de beheer-login
bestond. Dat is niet langer zo zodra deze spec een tweede scherm
(Instellingen) toevoegt. Dit volgt exact hetzelfde precedent als
`shells/bar`'s eigen dienst-navigatie: `docs/ARCHITECTURE.md` → "First
multi-screen bar navigation" (settled 2026-08-26) koos toen bewust voor een
eenvoudige `role="tablist"`-tabbar (`DienstTabs.tsx`) in plaats van het
ontwerp se donkere icon-rail-chrome, met de motivatie *"de spec fixeert dat
navigatie bestaat, niet de pixels"* — diezelfde redenering geldt hier
1-op-1. Dit is dus geen nieuwe architectuurbeslissing die een ADR verdient;
het is het toepassen van een al vastgelegd patroon op de eerste plek waar
`/beheer` zelf hetzelfde probleem (twee schermen, één sessie) krijgt.

- Nieuwe component `BeheerTabs.tsx` in `src/features/assortimentbeheer/`
  (niet een nieuw featuremapje — dit is chrome rond een bestaand
  beheer-scherm, geen eigen feature met eigen datamodel/RPC's; vergelijkbaar
  met hoe `DienstTabs.tsx` in `src/features/verkoop/` staat, niet in een
  aparte map). Twee tabs: **"Assortiment"** (bestaande `ProductenLijst`,
  ongewijzigd) en **"Instellingen"** (nieuw, deze spec — zie Schermflow).
  Zelfde mount/unmount-per-tab-lifecycle als `DienstTabs` (geen
  hidden-toggle) — elke tabwissel naar Instellingen krijgt zo altijd een
  verse `useAppSettings()`-lezing.
- `Assortimentbeheer.tsx` (top-level `/beheer`-component) rendert, ná een
  bevestigde `signed-in`-sessie, `BeheerTabs` in plaats van rechtstreeks
  `ProductenLijst` — de "Ingelogd als {naam} — uitloggen"-indicator en de
  "← terug naar bardienst"-link verhuizen van `ProductenLijst.tsx`'s eigen
  header naar een gedeeld stuk chrome boven de tabbalk (ze horen bij de
  sessie, niet bij één specifiek tabblad).
- De nieuwe Instellingen-inhoud staat in `src/features/assortimentbeheer/
  NegatieveLimietInstellingen.tsx` (eigen bestand, niet in `BeheerTabs.tsx`
  zelf — zelfde scheiding als `DienstTabs.tsx` die ook geen scherminhoud zelf
  bevat, alleen orkestreert).

## Datamodel

**Geen schemawijziging.** `app_settings.negative_limit_cents` bestaat al
sinds `0001_init.sql` (`integer not null default 0 check
(negative_limit_cents >= 0)`), inclusief de `REVOKE` op
`insert/update/delete` voor `authenticated` sinds
`0004_revoke_app_settings_writes.sql`. Deze spec voegt geen kolom toe — de
kolom kon alleen nooit geschreven worden; dat is precies het gat dat de
nieuwe RPC hieronder dicht.

## RPC's

Nieuwe migratie `supabase/migrations/0006_negatieve_saldolimiet.sql`
(`0005_assortimentbeheer.sql` is de laatste op `main`). Één nieuwe RPC,
zelfde ADR-0002-actorcheck-vorm als `create_product`/`update_product_price`/
`set_product_archived` — 1-op-1 gekopieerd, niet gegeneraliseerd naar een
gedeelde helper (zelfde "geen vroegtijdige extractie zonder een derde
onafhankelijke reden"-afweging als elders in deze codebase, bv.
`docs/features/opwaarderen.md`'s served_by-patroon):

```sql
create or replace function update_negative_limit(p_negative_limit_cents integer)
returns app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_settings app_settings;
begin
  select * into v_actor
  from members
  where auth_user_id = auth.uid() and not archived;

  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  if p_negative_limit_cents is null or p_negative_limit_cents < 0 then
    raise exception 'invalid_negative_limit' using errcode = 'P0001';
  end if;

  update app_settings set negative_limit_cents = p_negative_limit_cents
    returning * into v_settings;

  return v_settings;
end;
$$;

grant execute on function update_negative_limit to authenticated;
```

- **Grens**: `>= 0`, zelfde ondergrens als de bestaande check-constraint
  (`>= 0`, niet `> 0` — €0 is een geldige, expliciet bedoelde waarde, zie
  CLAUDE.md → Domein). Geen bovengrens — er staat nergens (CLAUDE.md,
  ARCHITECTURE.md, ontwerp) een maximum negatieflimiet vastgelegd, dus deze
  spec voegt er zelf geen toe.
- **`top_up` blijft ongewijzigd — geen aanpassing nodig.** `top_up` verhoogt
  altijd het saldo (`amount_cents > 0`, afgedwongen door zijn eigen
  `invalid_amount`-check); een opwaardering kan het saldo per definitie nooit
  verder in het rood zetten. De negatieflimiet is dus voor `top_up`
  irrelevant — dit is geen omissie, het ticket zelf zegt al "(en eventueel
  `top_up`)", en dat "eventueel" wordt hier expliciet met "nee" beantwoord.
- Single-row tabel (`app_settings`), dus geen `p_id`-parameter nodig — zelfde
  reden als waarom `useAppSettings()` geen id doorgeeft bij het lezen.
- Geen aparte RPC voor `low_balance_threshold_cents` — die kolom heeft
  principieel geen geplande schrijf-RPC (`docs/features/
  laag-saldo-signalering.md` → AC #1: "voor `low_balance_threshold_cents` is
  er principieel geen schrijfpad gepland"). Deze spec raakt die kolom niet.

## Leeshook-aanpassing

`useAppSettings()` (`src/hooks/queries/useAppSettings.ts`) krijgt een
`refetch(): void`, in dezelfde vorm als `useMembers()`/`useAlleProducten()`.
De bestaande javadoc-reden om 'm weg te laten ("de instelling wijzigt
vandaag nergens in de UI") vervalt zodra deze spec gebouwd is — dit is dus
een noodzakelijke, kleine wijziging aan bestaande code, geen nieuwe hook.
Geen ander gedrag van de hook verandert (zelfde `AppSettings`-type, zelfde
foutmelding-bij-laadfout).

Nieuwe mutatiehook **`useUpdateNegativeLimit()`** in
`src/hooks/queries/useUpdateNegativeLimit.ts`, exact dezelfde vorm als
`useUpdateProductPrice()`/`useSetProductArchived()` (status
`idle`/`pending`/`error`, `errorCode`, `reset()`). Typed error-code union:
`invalid_negative_limit | actor_not_found | no_admin_role | unknown`.

## Rolzichtbaarheid

Zelfde model als assortimentbeheer (#14): **alleen bereikbaar met een
actieve beheerder-sessie** op `/beheer`. Geen sessie → alleen het
inlogformulier (`BeheerLogin.tsx`, ongewijzigd). Sessie zonder
`beheerder`-rol (`useBeheerSession()`'s `"denied"`-staat) → hetzelfde
foutscherm als vandaag, vóór de tabbalk — de Instellingen-tab is dus nooit
zichtbaar voor een niet-beheerder, exact als de Assortiment-tab dat vandaag
al niet is. De RPC controleert `no_admin_role` daarnaast zelf, zelfde
verdediging-in-twee-lagen-redenering als `docs/features/
assortimentbeheer.md` → Rolzichtbaarheid.

De **huidige waarde lezen** (`app_settings.negative_limit_cents` via
`useAppSettings()`) is, zoals vandaag, leesbaar voor elke `authenticated`
sessie (bestaande `app_settings_select`-policy, single-tenant) — dit
verandert niet; alleen het schrijven krijgt nu voor het eerst een pad, en
dat pad is beheerder-only.

## Schermflow

### Instellingen-tab (`NegatieveLimietInstellingen.tsx`)

Volgt het ontwerp (`designs/Bar App.dc.html`, regel 575–608, 2967–3273)
letterlijk voor de eerste bouw (CLAUDE.md → Designbestanden):

1. **Kop**: "Negatief saldo toestaan" + toelichting **"Tot dit bedrag mag
   een lid in het rood staan. Erboven blokkeert de bar bestellen — het lid
   moet eerst opwaarderen."** (letterlijk uit het ontwerp, regel 582 — dit
   is de tekst die de issue-body citeert). Ernaast een statuspil:
   **"actief"** (wanneer `negativeLimitCents > 0`) of **"uit"** (wanneer
   `= 0`), niet kleur-only — tekst is zelf al het onderscheid, geen extra
   a11y-eis nodig.
2. **Huidige waarde**: groot getal (`formatCents(negativeLimitCents)`, of
   letterlijk **"geen"** wanneer `= 0` — ontwerp regel 3256) + onderschrift
   "huidige limiet".
3. **"Wat dit betekent"-uitleg**, direct uit het ontwerp (regel 3260–3262),
   afhankelijk van de huidige waarde:
   - `> 0`: **"Een lid met €0 op de rekening kan nog voor {bedrag} bestellen.
     Daarna weigert de kassa tot er is opgewaardeerd."**
   - `= 0`: **"Leden kunnen alleen bestellen met saldo op hun rekening. Bij
     €0 weigert de kassa meteen."**
4. **Snel instellen — vier chips**: **geen (€0) / €10 / €25 / €50**
   (letterlijk `[0,10,25,50]` uit het ontwerp, regel 2967 —
   `negativeLimitPresets`). Als de huidige waarde niet in die lijst voorkomt
   (bv. een eerder handmatig ingevuld bedrag als €15), toont het ontwerp een
   vijfde chip met die waarde erbij, opnieuw oplopend gesorteerd — dit
   overnemen is geen extra complexiteit (client-side `Set`/sort op een array
   van vier getallen plus de huidige waarde). Tik op een chip → **direct**
   `useUpdateNegativeLimit().updateNegativeLimit(chipValueCents)`, **geen
   bevestigingsstap** — zelfde "de sessie zelf is al de bevestiging"-
   redenering als assortimentbeheer's archiveer-toggle.
5. **Vrij invoerveld** ("ander bedrag") + **"opslaan"**-knop: tekst via
   `parseEuroToCents()` (bestaand, `src/lib/money.ts`, al gebruikt door
   opwaarderen's vrije-bedragveld). "Opslaan" pas actief bij een geldig,
   niet-negatief bedrag (client-side guard, geen vervanging van de
   RPC-validatie). Tik op "opslaan" → dezelfde
   `updateNegativeLimit(parsedCents)`-aanroep als de chips.
6. **Bevestiging bij succes**: toast **"Limiet ingesteld op {bedrag}"**
   (bedrag via `formatCents`, of **"geen"** bij €0 — consistent met stap 2;
   letterlijk uit het ontwerp, regel 2222) — zelfde toast-patroon/duur als
   assortimentbeheer ("[Naam] toegevoegd"). Ná succes: `useAppSettings().
   refetch()` zodat het grote getal in stap 2 en de "Wat dit betekent"-tekst
   in stap 3 meteen de nieuwe waarde tonen, en de chip-highlight (welke chip
   overeenkomt met de huidige waarde) meteen klopt.
7. **Bij fout**: zie Randgevallen; het scherm blijft op de Instellingen-tab,
   ingevoerde tekst in het vrije veld blijft staan.
8. **"Geldt voor alle leden."-onderschrift**: overgenomen uit het ontwerp
   (regel 607), **zonder** het tweede zinsdeel **"Wijzigingen komen met je
   naam in het logboek"** — er bestaat geen logboek/audit-trail
   (`docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog niet is
   besloten": Logboek is niet-besloten scope). Deze spec belooft dus geen
   audittrail die niet gebouwd wordt; zie ook Expliciet buiten scope.

### Navigatie

`BeheerTabs.tsx` toont, ná login, standaard de **Assortiment**-tab (bestaand
gedrag ongewijzigd — een beheerder die inlogt komt niet ineens op
Instellingen terecht). Wisselen naar **Instellingen** is een expliciete tik,
zelfde `role="tablist"`-patroon/toetsenbordgedrag als `DienstTabs`.

## Randgevallen

**RPC-foutcodes van `update_negative_limit`** (client → Nederlandse
melding):

| Code | Wanneer bereikbaar via deze UI | Melding | UI-actie |
|---|---|---|---|
| `invalid_negative_limit` | Client-guard hoort dit al te voorkomen (chips zijn altijd `>= 0`, "opslaan" disabled bij een ongeldig/negatief bedrag); server-fallback bij een edge case in de invoer | "vul een geldig bedrag in (€0 of hoger)" | invoerveld blijft bewerkbaar, scherm blijft open |
| `actor_not_found` | Beheerder-account tussentijds gearchiveerd of ontkoppeld (zelfde zeldzame race als assortimentbeheer) | "dit account is niet gekoppeld aan een lid — vraag een beheerder" | zelfde afhandeling als `useBeheerSession()`'s `"denied"`-staat vandaag al kent |
| `no_admin_role` | Praktisch onbereikbaar zolang `useBeheerSession()` al vooraf op `"denied"` filtert — server-fallback, geen client-pad dat dit normaal triggert | "dit account kan instellingen niet beheren — vraag een beheerder" | zelfde patroon als assortimentbeheer's `no_admin_role`-melding |
| `unknown` (netwerk/onverwacht) | Altijd mogelijk | "er ging iets mis, probeer het opnieuw" | scherm blijft open, ingevoerde waarde blijft staan |

**Overig**

- **Dubbele indiening** (snel twee chips/tikken kort na elkaar) →
  `useUpdateNegativeLimit()`'s `pending`-status disabled alle chips + de
  "opslaan"-knop tijdens de aanroep, zelfde patroon als
  `AfrekenenOverlay`/`OpwaarderenOverlay`.
- **Waarde wijzigt terwijl een bestelling tegelijk wordt afgerekend** (bv.
  een collega rekent af op hetzelfde tablet terwijl een beheerder tegelijk
  de limiet aanpast in een andere sessie/tab) — geen race-conditie-
  bescherming nodig, zelfde soort afweging als elders in deze codebase
  (#29): `place_order` leest de rij op het moment van bestellen, dus de
  nieuwste opgeslagen waarde geldt altijd voor de eerstvolgende
  bestelling, nooit een tussentijdse inconsistentie binnen één
  transactie.
- **€0 instellen ("geen"-chip) gedraagt zich als "nooit negatief"** — al
  bewezen voor het lees-/handhavingspad (zie AC-status hierboven,
  `place_order.test.sql`). Nieuw voor déze spec: een test die bewijst dat
  de **RPC** zelf `negative_limit_cents` daadwerkelijk op `0` kan zetten en
  dat een daaropvolgende `place_order`-aanroep die het saldo verder dan €0
  in het rood zou zetten, alsnog weigert — zie Testgevallen.
- **Negatieve/lege invoer in het vrije veld** → "opslaan"-knop disabled
  (client), en als het toch bij de server terechtkomt (bv. een niet-numerieke
  string die client-side niet goed geparsed werd): `invalid_negative_limit`,
  zie tabel hierboven.
- **A11y**: `/beheer`'s ingelogde staat (tabbalk + beide tabbladen) is
  vandaag nog niet in `e2e/a11y.spec.ts`'s route-/scenariolijst opgenomen —
  alleen het inlogformulier zelf wordt gescand (regel 14: `{ name: "beheer
  login", path: "/beheer" }`), exact dezelfde constatering als
  `docs/features/assortimentbeheer.md` → Randgevallen al maakte voor de
  overlays. Tester moet een scenario toevoegen dat na een geslaagde
  beheerder-login zowel de Assortiment- als de Instellingen-tab scant.

## Expliciet buiten scope

- **Wijzigingslogboek/audit-trail van limietwijzigingen** (het ontwerp se
  "Wijzigingen komen met je naam in het logboek") — niet-besloten scope,
  zelfde reden als assortimentbeheer's eigen buiten-scope-punt hierover
  (`docs/ARCHITECTURE.md` → "Wat het prototype deed maar hier nog niet is
  besloten": Logboek). De RPC-actorcheck dient alleen om de schrijfactie te
  autoriseren, niet om een auditspoor vast te leggen.
- **`low_balance_threshold_cents` instelbaar maken** — expliciet buiten
  scope elders (`docs/features/laag-saldo-signalering.md` → AC #1: geen
  schrijfpad gepland). Deze spec raakt uitsluitend `negative_limit_cents`.
- **`top_up`-aanpassing** — zie RPC's, een opwaardering kan de limiet nooit
  raken.
- **Een bovengrens op de negatieflimiet** — nergens vastgelegd, deze spec
  voegt er zelf geen toe (zie RPC's).
- **Activiteitstypes en andere naastgelegen instellingen** (het ontwerp
  toont "Negatief saldo toestaan" naast een "Activiteitstypes"-kaart op
  hetzelfde Instellingen-scherm, regel 610–629) — niet-besloten scope,
  ongerelateerd aan #11, niet in deze spec.
- **Een echte, blijvende navigatiestructuur voor `shells/bar`/`/beheer`
  buiten de eenvoudige tabbalk** — `BeheerTabs.tsx` is, net als
  `DienstTabs.tsx`, een minimale toepassing van een bestaand patroon, geen
  voorschot op een bredere navigatie-architectuur.
- **Race-conditie-bescherming bij gelijktijdige limietwijzigingen** — zie
  Randgevallen, zelfde afweging als elders in deze codebase (#29).

## `useShell()`-contract

Geen nieuwe invulling. `BeheerTabs.tsx` hergebruikt het bestaande
`role="tablist"`-patroon (`DienstTabs.tsx`) zonder dat `overlay`/`density`/
`columns` een nieuwe betekenis krijgen — de Instellingen-tab toont geen
overlay, alleen inline kaarten/chips (zoals het ontwerp ze ook toont), geen
grid dat `columns` nodig heeft.

## Nog te beslissen

Geen openstaande vraag die deze spec niet zelf kon beantwoorden — in
tegenstelling tot #9/#10 leverde het ontwerp hier concrete, geen
placeholder-waarden (chip-bedragen `0/10/25/50`, exacte teksten voor kop,
uitleg, "wat dit betekent", toast-bevestiging), en de handhavings-/
testkant van de eis was al gebouwd vóór dit ticket. De enige echte
architectuurkeuze (een tabbalk in `/beheer`) volgt een al vastgelegd
precedent (`DienstTabs`) rechtstreeks, zonder tegenstrijdigheid met een
bestaande beslissing.

Eén punt is een impliciete aanname, geen gok, maar het waard om hier expliciet
te noemen zodat Bram 'm kan corrigeren vóór de Developer bouwt: de foutmelding
voor `invalid_negative_limit` ("vul een geldig bedrag in (€0 of hoger)") is
door de Architect zelf geformuleerd, consistent met bestaande
meldingen-stijl (`top_up`'s "vul een geldig bedrag in"), niet letterlijk uit
het ontwerp overgenomen — het ontwerp toont deze foutmelding namelijk
nergens (de "opslaan"-knop is er simpelweg disabled, geen tekst voor de
server-fallback-situatie). Als Bram een andere formulering wil, is dat een
tekstwijziging in `useUpdateNegativeLimit`'s aanroepende component, geen
herziening van de rest van deze spec.

## Testgevallen (`db:test`)

Nieuw testbestand `supabase/tests/negatieve_saldolimiet.test.sql` (zelfde
naamconventie als `assortimentbeheer.test.sql`), pgTAP tegen
`update_negative_limit`:

1. Happy path: een `beheerder`-actor (gekoppelde `auth_user_id`) roept
   `update_negative_limit(1000)` aan → slaagt, `app_settings.
   negative_limit_cents` is daarna `1000`.
2. **€0 gedraagt zich als "nooit negatief" (AC #4, nu via de RPC zelf in
   plaats van een directe SQL-fixture)**: roep
   `update_negative_limit(0)` aan als beheerder, daarna `place_order` voor
   een lid met saldo `0` → `throws_ok(..., 'insufficient_balance', ...)`.
   Dit is de aanvulling die AC #4 nu ook via het echte schrijfpad bewijst,
   niet alleen via `place_order.test.sql`'s bestaande directe
   `update app_settings set ...`-fixture.
3. Weigering: `p_negative_limit_cents = -100` (of `null`) →
   `throws_ok(..., 'invalid_negative_limit', ...)`.
4. Weigering: caller zonder gekoppelde `auth_user_id` →
   `throws_ok(..., 'actor_not_found', ...)`.
5. Weigering: caller met rol `bardienst` (wel gekoppeld) →
   `throws_ok(..., 'no_admin_role', ...)`.
6. Belt-and-braces: directe `update app_settings set negative_limit_cents =
   ...` als `authenticated` blijft geweigerd door het bestaande `REVOKE`
   (`0004_revoke_app_settings_writes.sql`) — dit is al gedekt door
   `rls_write_protection.test.sql`, geen dubbele test nodig, alleen ter
   bevestiging in de PR-beschrijving dat dit ongewijzigd blijft.
