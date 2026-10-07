# 0001 — Beheerder-only RPC-writes verifiëren de aanroeper opnieuw, per call

Status: **vervallen**

Toelichting: **vervangen door [ADR 0002](0002-beheeracties-vereisen-eigen-e-mail-sessie.md)**
(2026-08-26). Bram heeft de aanname waarop dit ADR rustte — geen
per-operator sessie, dus verifieer per RPC-call met een PIN — zelf
gecorrigeerd: een beheerder-identiteit is niet gedeeld en krijgt een eigen
e-mail-sessie, los van de gedeelde tablet-sessie. Het patroon hieronder
(`p_actor_member_id`/`p_actor_pin` per RPC) is niet meer het geldende
mechanisme voor beheerder-only writes; dit document blijft staan als de
eerdere afweging, niet als geldende instructie. Oorspronkelijke status:
geaccepteerd (Architect-beslissing binnen bestaande patronen, ter bevestiging
aan Bram samengevat in `docs/features/assortimentbeheer.md` →
"Let op — een echte openstaande architectuurvraag").

## Context

`docs/ARCHITECTURE.md` → "Shared bar-tablet session mechanism": één
Supabase Auth-sessie per fysiek tablet, gedeeld door alle bardienst/
beheerder-medewerkers. Er bestaat geen per-operator sessie — RLS kan dus
nooit "alleen een beheerder mag dit" afdwingen op basis van wie er is
ingelogd, want er is niemand specifiek ingelogd.

Tot nu toe kwam dit twee keer voor, en allebei losten het anders op omdat de
vraag anders lag:

- **`start_shift`** verifieert de PIN van de starter zelf, tegen diens eigen
  rol (`bardienst`/`beheerder`) — één eigen, zelf-gerapporteerde
  authenticatie per dienst. Precies het patroon dat CLAUDE.md →
  Architectuurbeslissingen als "het enige echte authenticatiemoment" noemt.
- **`add_shift_member`/`remove_shift_member`** verifiëren helemaal geen
  aanroeper — ze controleren alleen de *eligibility van het doelwit*
  (mag dit lid toegevoegd worden: niet gearchiveerd, `bardienst`/
  `beheerder`-rol). Wie de tik gaf wordt bewust niet gecontroleerd (zie
  `docs/features/bezetting-beheren.md` → Rolzichtbaarheid) — dat kán omdat
  er geen acceptatiecriterium is dat de *aanroeper* een bepaalde rol moet
  hebben.

Issue #14 (Assortimentbeheer) is de eerste feature waar dat verschil er wél
toe doet: het acceptatiecriterium "alleen beheerder-rol" gaat over wie de
*schrijfactie zelf* uitvoert (prijs wijzigen, product toevoegen/archiveren),
niet over de eligibility van een target-rij. Er bestaat nog geen patroon in
deze codebase voor "verifieer dat de aanroeper zelf een bepaalde rol heeft",
en RLS kan het structureel niet — de enige plek waar dat gecontroleerd kan
worden is binnen een `SECURITY DEFINER`-RPC, net als bij `start_shift`.

## Beslissing

Elke schrijf-RPC die alleen door een `beheerder` uitgevoerd mag worden,
neemt `p_actor_member_id` + `p_actor_pin` als parameters en verifieert, in
deze volgorde (identiek aan `start_shift`'s bestaande volgorde):

1. lid bestaat en is niet gearchiveerd → anders `actor_not_found`
2. lid heeft rol `beheerder` → anders `no_admin_role`
3. `crypt(p_actor_pin, pin_hash) = pin_hash` → anders `invalid_pin`

pas dáárna voert de RPC de eigenlijke schrijfactie uit, in hetzelfde
statement/dezelfde functie — geen aparte "ontgrendel"-stap die los van de
schrijfactie zelf staat.

**Geen tijdgebonden "beheermodus"-sessie.** Elke privileged schrijfactie
verifieert opnieuw, ook als dezelfde beheerder twee tikken na elkaar geeft.
Er komt geen server-side sessie/token-concept en geen client-side cache van
de ingevoerde PIN die stilzwijgend wordt hergebruikt voor een volgende
aanroep — elke aanroep draagt een vers, door de gebruiker net getypt PIN.

Dit patroon is niet uniek voor Assortimentbeheer: elke toekomstige
beheerder-only schrijfactie op het gedeelde bar-tablet (bv. rolwijziging in
ledenbeheer, de negatieflimiet in instellingen) hoort dezelfde vorm te
volgen — `p_actor_member_id`/`p_actor_pin`, dezelfde controlevolgorde,
dezelfde herbruikbare naamkeuze-plus-PIN-pad-UI — tenzij een latere ADR dit
expliciet heroverweegt.

## Verworpen alternatief: tijdgebonden step-up ("beheermodus")

Het prototype (`designs/Bar App.dc.html`, `adminPinDraft`/`adminUntil`,
regel 2231–2256) doet dit anders: één PIN-invoer ontgrendelt een 10 minuten
geldige "beheermodus" voor een specifieke, herkende identiteit
(`adminIdentityId`), waarna meerdere acties binnen dat venster geen nieuwe
PIN meer vragen.

Dat is voor deze RPC-laag op twee manieren te bouwen, allebei verworpen voor
nu:

- **(a) Client-side cache**: na de eerste PIN-invoer het ruwe PIN in
  React-state onthouden en bij elke volgende schrijfactie automatisch
  meesturen (de RPC verifieert nog steeds elke keer echt — dit is puur een
  UI-gemak, geen nieuw server-mechanisme). Verworpen: dit introduceert een
  patroon dat nergens anders in deze codebase bestaat — een PIN die na
  invoer bewaard en hergebruikt wordt in plaats van direct verbruikt — en
  staat op gespannen voet met hoe `docs/ARCHITECTURE.md` → "PIN
  storage/hashing" het vandaag beschrijft ("the client only ever sends the
  entered PIN", gelezen als: per actie vers ingevoerd, niet bewaard).
- **(b) Server-side sessie/token**: een nieuw opslag-/verval-/
  intrekkingsmechanisme voor "wie is nu ontgrendeld tot wanneer". Verworpen:
  dat is een echt nieuw architectuuronderdeel — precies het soort beslissing
  die een eigen ADR *zou* verdienen — en staat niet in verhouding tot de
  omvang van een CRUD-scherm voor een handvol producten.

Kosten van deze beslissing: een beheerder die drie dingen na elkaar wijzigt
(bv. product toevoegen, dan een prijs, dan iets archiveren) typt drie keer
een 4-cijferige PIN. Geaccepteerd als de eenvoudigere, veiligere default
voor de MVP — pas heroverwegen (met een eigen ADR) als dit in de praktijk
echt te veel wrijving blijkt te geven, niet vooraf.

## Gevolgen

- Geen schema- of sessie-wijziging nodig — het bestaande
  `SECURITY DEFINER`/RLS-REVOKE-patroon uit `0001_init.sql` blijft
  ongewijzigd; dit voegt alleen een nieuwe *vorm* van RPC-parameters en
  -validatie toe, geen nieuwe infrastructuur.
- Elke volgende beheerder-only schrijf-RPC kan dit ADR citeren in plaats van
  de afweging opnieuw te voeren.
- De actor-keuze (naam + PIN) is een UI-stap die het bestaande
  `StaffPicker`/`PinPad`-paar (`src/features/dienst-starten/`) opnieuw kan
  gebruiken — zie `docs/features/assortimentbeheer.md` → Schermflow.
