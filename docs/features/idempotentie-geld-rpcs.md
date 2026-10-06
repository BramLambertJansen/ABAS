# Idempotentie voor geld-RPC's (`request_id`)

**Status: goedgekeurd door Bram (aanbevelingen 1-12 overgenomen).** De
Developer mag bouwen volgens "Besluiten van Bram" en "Fasering en bouwplan".
Fase 2 (zie besluit 9) heeft een eigen akkoord nodig en valt buiten deze bouw.
ADR: [0023](../adr/0023-geld-rpcs-idempotent-via-client-sleutel.md).

Spec voor [issue #143](https://github.com/BramLambertJansen/ABAS/issues/143)
(backend, voortgekomen uit T06 [#126](https://github.com/BramLambertJansen/ABAS/issues/126),
vraag C optie 3 in [`opslaan-sluiten-pending.md`](opslaan-sluiten-pending.md)).
Raakt de twee kernbeslissingen (geld alleen via RPC, attributie uit de
bezetting): zie "Raakt dit de kernbeslissingen".

Gelezen bronnen (huidige `main`, HEAD `0cfbb56`): het issue (geen comments);
migraties `0001`, `0016`, `0017`, `0020`, `0023`, `0028`, `0029`, `0041`
(laatste definities van `place_order`, `top_up`, `create_member`,
`reverse_order_*`, `require_shift_session`, `list_own_transactions`);
`supabase/tests/rpc_catalogus.test.sql`; `scripts/check-rls.mjs`;
ADR 0016, 0021, 0022; `bestelling-terugdraaien.md`, `opwaarderen.md`,
`opslaan-sluiten-pending.md`; `usePlaceOrder.ts`, `useTopUp.ts`,
`useCreateMember.ts`, `OnbekendeUitkomstMelding.tsx`, `AfrekenenOverlay.tsx`,
`src/lib/opslaan.ts`; `client_errors` (0025) als voorbeeld van een tabel
zonder policies met retentie via `pg_cron`. Geen wireframe: geen nieuw scherm.

## Doel

Een herhaald geldverzoek met dezelfde bedoeling geeft hetzelfde resultaat in
plaats van een tweede boeking. Daarmee kan een client na een netwerkfout of
onbekende serverfout veilig opnieuw proberen, ook als de server het eerste
verzoek wél verwerkte, en is een dubbel verzoek (dubbele klik die door de
UI-guard glipt, twee tabbladen, een herhaald HTTP-verzoek) onschadelijk.

## Wat het issue vraagt, wat er al is, wat ontbreekt

**Het issue vraagt:** een client-gegenereerde `request_id` per bewuste actie
op `place_order`, `top_up` en `create_member`; vier beslissingen (aanpak,
bewaartermijn, hergebruik met andere parameters, startsaldo-transactierij);
spec, ADR, `db:test`-tests (dubbel verzoek, ander lid, andere parameters),
`rpc_catalogus`-update; verwijst naar #23 (idempotentie voor een
toekomstige webhook).

**Gevalideerd tegen main:**

- Geen idempotentiesleutel in enige RPC (grep op `request_id`/`idempot` in
  `supabase/` en `src/`: alleen commentaar over idempotente eindstaat-RPC's).
  Een tweede `place_order`/`top_up`/`create_member` met dezelfde invoer boekt
  of maakt dus gewoon opnieuw.
- `place_order` (`0029`) en `top_up` (`0029`) schrijven in één transactie
  (saldo-update plus `orders`/`order_lines`, resp. `top_ups`), na
  `require_shift_session`, `shift_not_open`, `is_shift_member(served_by)`.
  `place_order` neemt `members ... for update` bij een lid; `top_up` neemt
  geen rijlock. Een fout in de functie draait alles terug.
- `create_member` (`0029`) schrijft `members.balance_cents` rechtstreeks,
  zonder transactierij. `members.name` is niet uniek en `members.email` is
  niet uniek (geen unieke index in `0008`/`0010`): er is **geen natuurlijke
  sleutel** voor `create_member`. Een tweede submit maakt een tweede lid met
  hetzelfde startsaldo; saldo is niet te corrigeren (CLAUDE.md, Opwaarderen).
- `reverse_order_at_bar`/`reverse_order_as_admin` (`0020`, `0029`): de
  primary key op `order_reversals.order_id` plus `for update` op de
  bestelling en de check `already_reversed` maken een dubbele terugboeking
  onmogelijk. Een herhaling na onbekende uitkomst geeft geen tweede boeking
  maar de **fout** `already_reversed`. Geen geldrisico; zie vraag 11.
- Frontend (T06, gemerged): `OnbekendeUitkomstMelding` ("Controleer eerst het
  saldo of de transacties voordat je opnieuw probeert." plus knop "Ik heb
  gecontroleerd") in `AfrekenenOverlay`, `OpwaarderenOverlay`,
  `NieuwLidOverlay`, uitsluitend na een echte netwerk-/onbekende fout
  (`unknown`), nooit door time-out. Geldoverlays hebben `closeBlocked`
  zonder 30 s-time-out (besluit 1 in `opslaan-sluiten-pending.md`). De
  componenttekst zegt zelf: "zonder idempotentiesleutel in de RPC blijft een
  tweede poging dubbel kunnen boeken". De hooks sturen alleen ids, aantallen
  en bedrag; de client berekent niets.
- **Wat in T06 expliciet is afgesproken voor dit ticket:** idempotentie als
  apart ticket met eigen spec en ADR; de UI claimt tot dan niet dat dubbel
  boeken is uitgesloten; de time-out voor geldoverlays mag pas
  heroverwogen worden als dit staat ("daarmee kan ... de time-out voor
  geldoverlays heroverwogen worden", issuetekst). Dat is dus een
  **beslissing van Bram**, geen gevolg dat de Developer zelf toepast (vraag 9).
- `pg_cron` is al in gebruik (`0025`, `purge_client_errors`, ook `0028`):
  retentie via een geplande job is een bestaand patroon.

**Ontbreekt:** sleutelopslag, de RPC-aanpassingen, tests, rpc_catalogus,
clientgedrag, ADR.

## Betrokken shell(s)

`shells/bar` (bar-RPC's `place_order`, `top_up`; beheer-RPC `create_member`
binnen de bar-shell, modus beheer). Geen portal-wijziging. De hooks
(`src/hooks/queries/`) en de overlays zijn shell-onwetend; geen
`useShell()`-uitbreiding.

## Ontwerp

### De sleutel

- **Herkomst:** een uuid die de client genereert (`crypto.randomUUID()`), als
  nieuwe parameter `p_request_id uuid` op de drie RPC's.
- **Per gebruikersintentie, niet per aanroep.** Eén bewuste actie
  ("Afrekenen", "Opwaarderen", "Toevoegen") = één sleutel, hergebruikt bij elke
  herpoging van **dezelfde** opdracht. Een sleutel per HTTP-aanroep geeft
  geen enkele bescherming.
- Twee identieke bestellingen achter elkaar (twee keer hetzelfde biertje,
  bewust) zijn twee intenties en dus twee sleutels: de server dedupliceert
  nooit op inhoud, alleen op sleutel.

### Opslag

Eén nieuwe tabel `idempotency_keys` (aanbevolen, vraag 1):

| kolom | betekenis |
|---|---|
| `request_id uuid primary key` | de unieke constraint is de scheidsrechter bij een race |
| `rpc text not null` (`check in ('place_order','top_up','create_member')`) | voor welke RPC |
| `actor_member_id uuid not null references members(id)` | lid van de sessie (bar-sessie resp. beheer-sessie) die het verzoek deed |
| `payload_hash text not null` | sha256 over de genormaliseerde parameters (zie hieronder) |
| `result_id uuid not null` | `orders.id`, `top_ups.id` of `members.id` (geen FK: meervoudig doel) |
| `created_at timestamptz not null default now()` | voor retentie; index erop |

- RLS aan, **geen policies**, `revoke all ... from authenticated, anon` (zoals
  `client_errors`). Alleen de `security definer`-RPC's schrijven en lezen. Geen
  leesrecht voor wie dan ook: de tabel bevat geen informatie die een client
  nodig heeft.
- Wordt aan `MONEY_TABLES` in `scripts/check-rls.mjs` toegevoegd (de tabel
  bepaalt of een geldboeking dubbel kan plaatsvinden; `check:rls` eist dan
  een expliciete `REVOKE ... FROM authenticated`). Dat is een eenregelige
  gate-aanpassing.
- Geen persoonsgegevens, alleen ids en een hash.

### Gedrag in de RPC (volgorde is bindend)

1. **Guards eerst, ongewijzigd:** `require_shift_session` /
   `require_beheer_session`, en voor `top_up` `self_top_up_forbidden`. Een
   buitenstaander of een sessie die niet op de dienst staat leert dus niets uit
   het bestaan van een sleutel.
2. **Sleutel claimen** (alleen als `p_request_id` niet null):
   `insert into idempotency_keys ... on conflict (request_id) do nothing`.
3. **Geen conflict (zelf geclaimd):** gewone uitvoering zoals nu (alle
   bestaande validaties, saldo- en negatieflimietcontrole, €500-grens,
   `served_by`-controle), daarna `result_id` vullen. Faalt een validatie, dan
   rolt de hele functie terug **inclusief de claim**: een mislukte eerste
   aanroep houdt de sleutel niet vast (vraag 5).
4. **Wel conflict (de sleutel bestond al, door ons of een ander):**
   - zelfde `rpc`, zelfde `actor_member_id` en zelfde `payload_hash`: geef
     het eerdere resultaat terug (rij opnieuw gelezen via `result_id`, zelfde
     returntype als nu), **zonder** de state-checks opnieuw te doen en zonder
     iets te boeken. Dus ook als de dienst inmiddels gesloten is of het saldo
     inmiddels te laag zou zijn: een eerder geslaagde boeking mag bij herhaling
     niet in een fout veranderen, anders denkt de UI dat het niet gelukt is
     (vraag 4);
   - anders (andere payload, andere RPC of ander lid): fout
     `request_id_conflict`. Eén code voor alle drie, zodat een ander lid niet
     kan aflezen dat een sleutel bestaat (vraag 3).
5. **Race (twee gelijktijdige aanroepen met dezelfde sleutel):** de tweede
   `insert ... on conflict do nothing` wacht op de unieke index tot de eerste
   transactie commit of afbreekt. Commit: tweede ziet het conflict en geeft
   het resultaat terug (stap 4). Afbreken: tweede claimt zelf en voert uit.
   Geen advisory lock nodig; de primary key is zowel mechanisme als backstop.
   Werkt onder `read committed` (de PostgREST-standaard), niet bewust onder
   `repeatable read`.

### Payload-vingerafdruk (`payload_hash`)

Sha256 (ingebouwd `sha256()`, geen pgcrypto/`search_path`-gedoe) over een
genormaliseerde tekst van de parameters die de **intentie** vastleggen, niet
van wat de server eruit berekent:

- `place_order`: dienst, lid (of null), `served_by`, en de regels als lijst
  van `(product_id, qty)` gesorteerd op product_id/qty. Geen prijzen of
  totaal (die bepaalt de server; client stuurt ze niet).
- `top_up`: dienst, lid, bedrag, methode, `served_by`.
- `create_member`: getrimde naam, `coalesce(startsaldo, 0)`, genormaliseerd
  e-mailadres (zelfde trim/null-regel als de RPC).

### Wat het resultaat bij herhaling is

Het **oorspronkelijke** resultaat: `place_order` en `top_up` geven de
vastgelegde rij (`orders.total_cents` is bevroren, dus ook na een
prijswijziging of een latere terugdraaiing zelfde totaal). `create_member`
geeft de **huidige** `members`-rij (met `pin_hash` op null zoals nu); is het lid
tussendoor hernoemd of gearchiveerd, dan ziet de client dat. Returntypes
blijven ongewijzigd; er is geen "is herhaling"-vlag (vraag 8).

## RPC's (nieuw of bestaand)

Geen nieuwe client-RPC. Wel wijzigen:

| RPC | nieuwe signatuur |
|---|---|
| `place_order` | `(p_shift_id, p_member_id, p_lines, p_served_by, p_request_id uuid default null)` |
| `top_up` | `(p_shift_id, p_member_id, p_amount_cents, p_method, p_served_by, p_request_id uuid default null)` |
| `create_member` | `(p_name, p_starting_balance_cents, p_email default null, p_request_id uuid default null)` |

Eén interne functie erbij: `purge_idempotency_keys()` (intern: geen EXECUTE voor
enige API-rol, `pg_cron`-job, patroon van `purge_client_errors`, `0025`).

Migratiepunten (`0042_...`, nummer controleren bij schrijven: `check:migrations`):

- Een nieuwe signatuur met `create or replace` maakt een **tweede overload**
  (precedent: `0008` deed `drop function if exists create_member(text, integer)`).
  Twee overloads geven bij PostgREST `PGRST203`. De migratie **dropt** dus
  expliciet de oude signaturen en geeft daarna `revoke ... from public, anon` en
  `grant execute ... to authenticated` op de nieuwe (`0018`, `rpc_execute_grants`).
- De body's herhalen de volledige huidige logica van `0029` (copy, geen
  herschrijving), plus de sleutelstappen hierboven.
- `rpc_catalogus.test.sql`: `purge_idempotency_keys` als `intern` toevoegen
  (en `plan` ophogen). De drie client-RPC's blijven `client` met guard
  (`require_*` staat in de body; test 3 controleert dat de tekst een guard noemt).
- Geen wijziging aan `orders`, `top_ups`, `members`, `order_lines` in de
  aanbevolen variant, dus geen impact op `rls_leespolicies`,
  `list_own_transactions`, omzet- of kasoverzichten.

## Rolzichtbaarheid

Ongewijzigd: bardienst/beheerder roepen aan zoals nu; een lid heeft geen
toegang tot deze RPC's (guards). `idempotency_keys` is voor niemand leesbaar via
de API. De sleutel zelf is geen geheim, maar is alleen herhaalbaar door
hetzelfde lid met dezelfde payload.

## Raakt dit de kernbeslissingen uit CLAUDE.md?

- **Geld alleen via RPC:** ja, en het versterkt die. De RPC blijft de enige
  schrijver; de client stuurt een id (de sleutel) naast de bestaande ids,
  aantallen of opwaardeerbedrag, nooit een berekend totaal of saldo. De
  vingerafdruk hasht alleen wat de client al stuurde. Replay boekt niets.
- **`served_by` uit de bezetting:** ongewijzigd. Bij een eerste uitvoering loopt
  `is_shift_member(served_by)` zoals nu. Bij een replay wordt niet opnieuw
  getoetst (het resultaat is al toegekend), maar `served_by` zit in de
  vingerafdruk: een replay met een ander `served_by` is `request_id_conflict`
  en kan dus geen attributie "omzetten". Sessiebinding blijft via
  `require_shift_session`.
- **Saldo en negatieflimiet:** op de eerste uitvoering volledig; bij replay niet
  opnieuw (anders zou een geslaagde boeking bij herhaling `insufficient_balance`
  kunnen geven). De bestaande `for update` op het lid in `place_order` blijft.
- **€500/€100 bij `top_up`:** de €500-grens zit in de RPC en geldt bij de eerste
  uitvoering; het €100-bevestigingsstapje is een clientzaak en verandert niet.
  Dezelfde bevestigde intentie houdt dezelfde sleutel; een gewijzigd bedrag is
  een nieuwe intentie met een nieuwe sleutel.
- **A4 (nooit naar het eigen lid):** staat in de guardfase vóór de sleutelstap
  en geldt dus ook bij replay.
- **Beheer-modus (ADR 0017):** `create_member` blijft achter
  `require_beheer_session` en de actorcheck.
- **Voor #23 (iDEAL-webhook):** deze tabel bedient alleen kassa-/sessie-RPC's.
  Een webhook heeft geen lid-sessie en een providersleutel; die krijgt later een
  eigen RPC met een eigen sleutelruimte (providerreferentie), zonder de €500.
  Dit ontwerp staat dat niet in de weg (zelfde tabel met een extra `rpc`
  waarde en een andere actor, of een aparte kolom) maar bouwt het niet.

## Frontend-gevolgen

Alleen wat nodig is voor een werkende sleutel; geen nieuw scherm.

- Een klein, puur, in `npm test` testbaar hulpje (voorstel
  `src/lib/requestId.ts`, naam aan de Developer): sleutel per intentie. Het
  onthoudt `(vingerafdruk van de opdracht -> uuid)`, geeft dezelfde uuid terug
  zolang de opdracht gelijk is en er geen definitieve uitkomst was, en vergeet
  hem bij succes, bij een bekende (domein)fout, of bij een gewijzigde opdracht.
  Een `unknown`-uitkomst houdt de sleutel vast. De client-vingerafdruk is alleen
  een keuze **welke uuid** te hergebruiken, geen bedrag en geen
  boekhoudkundige berekening.
- De drie hooks (`usePlaceOrder`, `useTopUp`, `useCreateMember`) gebruiken dat
  hulpje en sturen `p_request_id` mee; hun publieke vorm blijft gelijk, dus de
  overlays hoeven in fase 1 niet te wijzigen. Nieuwe foutcode
  `request_id_conflict` in de `KnownCodes`, getoond als algemene fout; hij hoort
  niet voor te komen en wordt niet gemeld aan `client_errors` (domeinuitkomst).
- Bij fase 1 blijft T06-gedrag **ongewijzigd**: `OnbekendeUitkomstMelding`,
  "Ik heb gecontroleerd", geen automatische retry, geen time-out voor geld,
  `closeBlocked`. De winst in fase 1 is dat dubbelverzoeken onschadelijk zijn.
- Fase 2 (apart akkoord van Bram, besluit 9; buiten deze bouw): in de onbekende-uitkomstmelding een "Opnieuw
  proberen" met dezelfde sleutel, en eventueel een time-out op geldoverlays.
  Teksten zijn aan Bram (CLAUDE.md: geen verzonnen teksten); een voorstel staat
  bij vraag 9. De sleutel leeft in geheugen van de hook, dus een paginaherlaad
  verliest hem (vraag 6).

## Randgevallen

- **Mislukte eerste aanroep:** geen rij blijft staan (rollback), dus dezelfde
  sleutel mag hergebruikt worden, ook met een aangepaste payload. De client
  maakt na een bekende fout wel een nieuwe sleutel (schoner).
- **Eerste aanroep geslaagd, antwoord verloren:** herhaling met dezelfde sleutel
  geeft de bestaande rij; saldo verandert niet een tweede keer.
- **Gelijktijdig:** zie "Race". Test met twee echte verbindingen.
- **Sleutel van een ander lid of andere RPC:** `request_id_conflict`.
- **Sleutel na verlopen retentie:** een herhaling na het opruimen is een nieuwe
  boeking. Daarom moet de retentie veel langer zijn dan elke realistische
  retry (vraag 2).
- **Sessie tussendoor beëindigd:** de guards weigeren zoals nu
  (`session_ended` e.d.); na opnieuw inloggen door hetzelfde lid kan dezelfde
  sleutel in dezelfde dialoog nog werken, dat is `actor_member_id` en niet
  de sessie (vraag 3).
- **Oude client zonder `p_request_id`:** null = gedrag als vandaag, geen
  bescherming (vraag 7).
- **`p_request_id` geen geldige uuid:** PostgREST weigert (`22P02`); de hook
  valt op `unknown`. Komt niet voor met `crypto.randomUUID()`.
- **Gastbestelling (`p_member_id` null):** gewoon hetzelfde mechanisme.
- **Twee bewust identieke bestellingen:** twee sleutels, twee boekingen.

## Besluiten van Bram

Bram nam alle aanbevelingen over ("Pak aanbevelingen"). De nummering blijft
die van de vragen, omdat de rest van de spec ernaar verwijst.

1. **Opslag:** aparte tabel `idempotency_keys`, RLS aan zonder policies,
   `revoke all` voor `authenticated` en `anon`, toevoegen aan `MONEY_TABLES`
   in `scripts/check-rls.mjs`. Geen kolom op `orders`/`top_ups`/`members`.
2. **Bewaartermijn:** 30 dagen, dagelijkse `pg_cron`-job (03:00) die
   `purge_idempotency_keys()` aanroept; interne functie, `intern` in
   `rpc_catalogus`.
3. **Zelfde sleutel, andere payload, andere RPC of ander lid:** één foutcode
   `request_id_conflict`. Scope van de sleutel is het lid van de sessie
   (`actor_member_id`), niet de bar-sessie of dienst.
4. **Replay:** alleen de guards lopen, geen herhaalde state-checks; het
   oorspronkelijke resultaat komt terug. Bewust, vastgelegd in ADR 0023.
5. **Mislukte eerste aanroep:** de claim rolt mee terug, geen "mislukt"-status;
   de sleutel is daarna weer bruikbaar.
6. **Sleutel op de client:** in het hookgeheugen (fase 1). `sessionStorage` is
   een mogelijk vervolg, niet in deze bouw.
7. **Rollout:** `p_request_id uuid default null`, oude signaturen expliciet
   gedropt met opnieuw uitgegeven grants (geen overloads); later verplicht via
   een aparte migratie (`request_id_required`), dan pas een gate in
   `rpc_catalogus`.
8. **Geen replay-vlag:** returntypes ongewijzigd, replay is gewoon succes.
9. **Frontend in twee fases, apart gemerged.** FASE 1 NU: hooks sturen de
   sleutel mee, T06-gedrag ongewijzigd (`OnbekendeUitkomstMelding`, geen
   retry, geen time-out voor geld, `closeBlocked`), de UI claimt niets.
   FASE 2 APART: "Opnieuw proberen" met dezelfde sleutel en heroverweging van
   de time-out voor geldoverlays; dat vraagt een eigen akkoord van Bram (ook
   voor de teksten) en valt BUITEN deze bouw. De UI zegt pas "boekt niet
   dubbel" na fase 1 en een slagende race-integratietest (ADR 0023).
10. **Startsaldo-transactierij:** niet in dit ticket; opvolgticket (#143b) met
    eigen spec. Startsaldo blijft de eerste stand van het lid.
11. **`reverse_order_at_bar`/`reverse_order_as_admin`:** buiten scope (al veilig
    via primary key, `for update` en `already_reversed`).
12. **ADR:** 0023, `docs/adr/0023-geld-rpcs-idempotent-via-client-sleutel.md`
    (0022 bestond al). Een gate op "elke geldschrijvende client-RPC heeft
    `p_request_id`" volgt pas nadat de parameter verplicht is (opvolger).

## Fasering en bouwplan (voor de Developer)

Drie stappen, in deze volgorde, bij voorkeur als drie commits in één PR (of
(a)+(b) eerst als eigen PR). Migratie vóór of samen met de frontend (ADR 0023,
rolloutvolgorde); frontend nooit vóór de migratie.

**(a) Migratie, pgTAP, rpc_catalogus, check-rls**
- `supabase/migrations/0042_idempotentie_geld_rpcs.sql` (nummer controleren
  met `check:migrations`): tabel + index op `created_at`, RLS + `revoke`,
  `drop function` van de drie oude signaturen, drie nieuwe RPC's (body's
  letterlijk uit `0029` plus sleutelstappen, volgorde: guards, claim,
  uitvoeren), `revoke ... from public, anon` en `grant execute ... to
  authenticated`, `purge_idempotency_keys()` en de cron-job.
- `scripts/check-rls.mjs`: `idempotency_keys` in `MONEY_TABLES`.
- `supabase/tests/idempotentie.test.sql` volgens het testplan, en
  `rpc_catalogus.test.sql` (`purge_idempotency_keys` als `intern`, `plan`
  ophogen, geen overload). Bestaande tests (`place_order`, `top_up`,
  `negatieve_saldolimiet`, `geld_rpcs_attributie`, `end_shift`) ongewijzigd
  groen.

**(b) Integratietest voor de race**
- `integration/idempotentie-race.test.ts`: twee parallelle `place_order` en
  twee parallelle `top_up` met dezelfde sleutel via PostgREST
  (`Promise.all`); één boeking, beide antwoorden hetzelfde id, saldo één keer
  gewijzigd. Vorm van de bestaande `integration/*.test.ts`.

**(c) Frontend fase 1**
- `src/lib/requestId.ts` (naam aan de Developer) met unit-test in `test/`;
  `usePlaceOrder`, `useTopUp`, `useCreateMember` sturen `p_request_id` mee;
  `request_id_conflict` als bekende code (niet naar `client_errors`),
  `test/moneyHooksFoutlogging.test.ts` bijwerken.
- E2E (Playwright, gemockte RPC): de aanvraag bevat `p_request_id`, geen
  berekend bedrag; bestaande specs (`opslaan-sluiten-pending*`,
  `bestelling-terugdraaien`) blijven groen. De overlays en teksten blijven
  ongewijzigd.
- Verwijzing naar deze spec in `opslaan-sluiten-pending.md`, `opwaarderen.md`,
  `verkoop.md`, `ledenbeheer.md`; `docs/ARCHITECTURE.md` (geldlaag).

**Wat alleen CI kan bewijzen:** er is lokaal geen Supabase/docker. `db:test`
(pgTAP, rpc_catalogus, check van overloads/grants/cron) en `test:integration`
(de race) draaien alleen in CI; de Developer kan lokaal alleen `check:fast`
(lint, typecheck, unit, check:arch/policy/rls/migrations/adr) en de unit-tests
bewijzen. De Developer meldt dit expliciet in de PR en schrijft de SQL daarom
extra zorgvuldig (copy van `0029`); de handmatige rooktest op de lokale stack
uit risico 2 is dan voor de Tester/CI. De PR is pas klaar bij groene
`check:all` in CI.

## Testplan

**pgTAP, nieuw `supabase/tests/idempotentie.test.sql`** (en toevoegingen in
`rpc_catalogus.test.sql`):

1. `place_order`, `top_up`, `create_member`: eerste aanroep met sleutel boekt
   één keer en vult `idempotency_keys` (rpc, actor, result_id).
2. Replay met dezelfde sleutel en payload: zelfde rij terug, saldo en aantal
   rijen in `orders`/`order_lines`/`top_ups`/`members` ongewijzigd.
3. Replay met andere payload (ander bedrag, andere regels, ander lid, andere
   `served_by`, andere startsaldo/naam): `request_id_conflict`, geen
   wijziging.
4. Sleutel van een ander lid, en dezelfde sleutel op een andere RPC:
   `request_id_conflict` (zonder dat de fout verschilt).
5. Replay na dienstafsluiting en na een saldo onder de limiet: nog steeds het
   oorspronkelijke resultaat (vraag 4); eerste aanroep met onvoldoende saldo
   blijft `insufficient_balance` en laat geen sleutel achter (mislukte
   aanroep, sleutel daarna bruikbaar).
6. Zonder `p_request_id`: gedrag als nu, geen rij in `idempotency_keys`.
7. Guards: een buitenstaander, een lid-sessie, een sessie niet op de dienst en
   `self_top_up_forbidden` krijgen hun gewone fout, ook met een bestaande
   sleutel (geen lek).
8. €500-grens en `amount_exceeds_max` onveranderd bij de eerste aanroep.
9. Negatieve rechten: `authenticated` en `anon` kunnen niet lezen, schrijven of
   verwijderen in `idempotency_keys` (zelfde vorm als `client_errors`-tests);
   `purge_idempotency_keys` niet uitvoerbaar voor `authenticated`/`service_role`;
   de purge verwijdert rijen ouder dan de termijn en laat jongere staan; de
   cron-job staat geregistreerd.
10. `rpc_execute_grants`/`rpc_catalogus`: geen overload meer, rechten kloppen.

**Integratietest (`test:integration`), nodig voor de race:** pgTAP draait één
sessie en kan niet bewijzen dat twee gelijktijdige verbindingen de unieke
index goed afhandelen. Twee parallelle `place_order`/`top_up`-aanroepen met
dezelfde sleutel via PostgREST (`Promise.all`), assert: één boeking, beide
antwoorden hebben hetzelfde id, saldo één keer gewijzigd. Draait tegen de
lokale stack in de CI-stap na `db:test` (vorm van de bestaande
`integration/*.test.ts`).

**Unit (`npm test`):** het sleutelhulpje (zelfde opdracht -> zelfde uuid,
gewijzigde opdracht of definitieve uitkomst -> nieuwe uuid, `unknown` houdt vast),
en een bijwerking van `test/moneyHooksFoutlogging.test.ts` voor
`request_id_conflict` als bekende code.

**E2E (Playwright, gemockte RPC):** Afrekenen en Opwaarderen en Nieuw lid:
de aanvraag bevat een `p_request_id`; een herpoging na een afgebroken verzoek
(fase 2) stuurt dezelfde id; een gewijzigde invoer een nieuwe; geen
berekend bedrag in de payload. Bestaande specs (`opslaan-sluiten-pending*`,
`bestelling-terugdraaien`) blijven groen.

**Handmatig (Tester):** op de bar-tablet met een kunstmatig vertraagde
verbinding een afrekening afbreken en opnieuw proberen (fase 2); controle in de
transactielijst dat er één bestelling staat. Geen claim over werking op
Safari/touch zonder die reeks.

## Wat expliciet buiten scope valt

- Een transactierij voor het startsaldo (vraag 10), saldocorrectie, of het
  corrigeren van reeds bestaande dubbele leden/boekingen.
- Idempotentie op `reverse_order_*`, `update_*`, `set_*`, `start_shift` (al
  eindstaat-idempotent of geen geld) (vraag 11).
- De webhook/iDEAL-RPC uit #23 (alleen: ontwerp staat het niet in de weg).
- Time-out voor geldoverlays en de "Opnieuw proberen"-UI (fase 2, besluit 9,
  eigen akkoord van Bram).
- Sleutel bewaren over een paginaherlaad (vraag 6).
- Het verplicht maken van `p_request_id` en een gate daarop (opvolger, vraag 7
  en 12).
- Offline/PWA-retry-wachtrij (CLAUDE.md: geen offline).

## Risico's

1. **Overbelofte.** Pas na fase 1 én bewijs door de race-integratietest mag de
   UI "boekt niet dubbel" zeggen; de huidige T06-tekst blijft tot dan staan.
   Een herhaling zonder sleutel (oude client, herlaad) is niet beschermd.
2. **Overloads/PostgREST:** vergeten oude signatuur te droppen geeft
   `PGRST203` op alle bar-verkoop. Test 10 en een handmatige rooktest op de
   lokale stack zijn verplicht vóór merge.
3. **Rolloutvolgorde:** migratie vóór frontend is veilig (optionele parameter);
   frontend vóór migratie is dat niet (onbekende parameter). Merge dus
   migratie eerst, of beide in één release.
4. **Replay zonder state-checks** is bewust en moet in de ADR staan, zodat een
   latere wijziging niet per ongeluk weer `shift_not_open` op een replay zet.
5. **Retentiegat:** een herhaling na 30 dagen boekt opnieuw; praktisch
   irrelevant voor een kassa, maar het verschil met permanente sleutels
   (vraag 1) is een bewuste keuze.
6. **Kopieerrisico:** de body's van `place_order`/`top_up` worden herhaald in
   een nieuwe migratie. De Developer moet `0029` letterlijk als basis nemen en
   de bestaande testbestanden (`place_order`, `top_up`, `negatieve_saldolimiet`,
   `geld_rpcs_attributie`, `end_shift`) ongewijzigd laten slagen.

## Bestanden (indicatie, aan de Developer)

- `supabase/migrations/0042_idempotentie_geld_rpcs.sql`: tabel, RLS/REVOKE,
  drop oude signaturen, drie RPC's, `purge_idempotency_keys` en cron-job.
- `supabase/tests/idempotentie.test.sql` (nieuw), `rpc_catalogus.test.sql`
  (bijwerken).
- `integration/idempotentie-race.test.ts` (nieuw).
- `scripts/check-rls.mjs`: `idempotency_keys` in `MONEY_TABLES`.
- `src/lib/requestId.ts` (voorstel), `src/hooks/queries/usePlaceOrder.ts`,
  `useTopUp.ts`, `useCreateMember.ts`; `test/` voor het hulpje.
- Fase 2: `src/components/OnbekendeUitkomstMelding.tsx`,
  `src/lib/opslaan.ts`, de drie overlays.
- `docs/adr/0023-geld-rpcs-idempotent-via-client-sleutel.md` (staat er al), `docs/ARCHITECTURE.md` (geldlaag), en een regel in
  `opslaan-sluiten-pending.md`, `opwaarderen.md`, `verkoop.md`,
  `ledenbeheer.md` die naar deze spec verwijst.
