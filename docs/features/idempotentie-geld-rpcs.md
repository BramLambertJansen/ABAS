# Idempotentie voor geld-RPC's (`request_id`)

**Status: concept, wacht op akkoord van Bram.** Er is nog niets gebouwd en
geen enkele keuze hieronder is genomen: alles onder "Open vragen" is een
aanbeveling. Het issue is gelabeld `needs-decision` en Bram heeft de
Architect niet gevraagd zelf te kiezen. De Developer begint pas na akkoord.

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

## Ontwerp (alles onder voorbehoud van de open vragen)

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
- Fase 2 (alleen na vraag 9): in de onbekende-uitkomstmelding een "Opnieuw
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

## Open vragen (met aanbeveling)

Antwoord "pak aanbevelingen" volstaat. Niets hieronder is gekozen.

**1. Opslag: kolom met unieke constraint op elke geldtabel, of één aparte
`idempotency_keys`-tabel?** (issue-vraag 1)
Aanbeveling: **aparte tabel**. Eén mechanisme, één plek om te testen en te
reviewen, werkt ook voor `create_member` dat geen transactierij heeft, en geen
wijziging aan `orders`/`top_ups`/`members` (geen kolom op de PII-tabel
`members`, geen impact op leesrechten en overzichten). Het alternatief
(`request_id` met unieke index op `orders` en `top_ups`, en een kolom op
`members`) geeft permanente uniekheid zonder retentiegat en geen cron, maar
verspreidt het mechanisme over drie tabellen en vraagt voor `create_member`
een kolom op `members`. Dat is het afgewogen alternatief als Bram permanente
sleutels belangrijker vindt.

**2. Bewaartermijn.** (issue-vraag 2)
Aanbeveling: **30 dagen**, opgeruimd door een dagelijkse `pg_cron`-job
(03:00, zoals `purge_client_errors`). Rijen zijn klein (ids en een hash); een
retry-venster is minuten, dus 30 dagen is een ruime marge zonder dat de tabel
onbeperkt groeit. Wordt het permanent gewenst, dan is vraag 1 het alternatief.

**3. Gedrag bij dezelfde sleutel met andere parameters, andere RPC of ander
lid.** (issue-vraag 3)
Aanbeveling: **fout `request_id_conflict`**, één code voor alle drie gevallen
(geen aanwijzing voor een ander lid dat de sleutel bestaat). Geen stille
uitvoering met de nieuwe payload, geen stille replay van de oude. Scope van de
sleutel is het **lid** van de sessie (`actor_member_id`), niet de
bar-sessie of dienst: een herinlog van hetzelfde lid mag herhalen, een collega
niet.

**4. Moet een herhaling de state-checks (dienst open, bezetting, saldo,
negatieflimiet) opnieuw doen?**
Aanbeveling: **nee**, alleen de guards. Een eerder geslaagde boeking wordt bij
herhaling zelfde resultaat, ook als de dienst inmiddels sloot of het saldo
daalde. Anders ziet de gebruiker een fout bij een boeking die er wel is.

**5. Mag een sleutel na een mislukte eerste aanroep hergebruikt worden?**
Aanbeveling: **ja, vanzelf** (de claim rolt mee terug); de client maakt na een
definitieve fout toch een nieuwe sleutel. Geen aparte "mislukt"-status in de
tabel.

**6. Waar leeft de sleutel op de client?**
Aanbeveling: **in het geheugen van de hook** (per openstaande intentie),
fase 1. Reden: de bestaande overlays zijn gemount per actie en dit raakt de
bewuste T06-afspraken niet. Gevolg: na een paginaherlaad is de sleutel weg en
valt een herpoging terug op "controleer eerst" (zoals vandaag). Alternatief:
sessionStorage per tab zodat een herlaad na een hangend verzoek veilig kan
herhalen. Dat is nuttiger voor het T06-scenario "hangt tot herladen", maar
vraagt opruimregels en bijkomende testgevallen; aanbevolen als vervolg,
niet in de eerste ronde.

**7. Rollout en compatibiliteit: `p_request_id` optioneel of verplicht?**
Aanbeveling: **optioneel (`default null`) in deze release, verplicht in een
latere migratie** (null wordt dan `request_id_required`). Backend en frontend
deployen niet atomair; een cache- of niet-herladen client mag niet ineens op
"functie bestaat niet" lopen. De oude signaturen worden wel gedropt (geen
overloads). Bestaande aanroepen in tests en seed (ruim 80 regels in circa 25
bestanden) blijven daardoor werken zonder wijziging. Het verplicht maken is een
klein opvolgticket zodra de nieuwe client breed draait. Alles in één release
met verplichte parameter is het alternatief; het geeft de sterkste garantie,
maar breekt oude clients hard.

**8. Moet de RPC melden dat het een herhaling was?**
Aanbeveling: **nee**, returntype ongewijzigd. De client behandelt replay als
gewoon succes. Een vlag vraagt een ander returntype (jsonb of composite) en
raakt alle hooks en tests; de gebruikerswaarde is klein.

**9. Frontend in dit ticket, of in twee fases?** En wat met de T06-besluiten?
Aanbeveling: **twee fases, apart gemerged.** Fase 1: migratie, tests, hooks
sturen de sleutel mee, T06-gedrag ongewijzigd (geen nieuwe teksten nodig).
Fase 2 (apart akkoord van Bram): "Opnieuw proberen" met dezelfde sleutel in
`OnbekendeUitkomstMelding`, en pas dán heroverweging van de 30 s-time-out voor
geldoverlays (besluit 1 in T06 blijft tot Bram anders zegt; een time-out
afbreken is pas veilig als de herpoging idempotent is). Voorstel tekst voor
fase 2, aan Bram om aan te passen: "De uitkomst is onbekend. Opnieuw
proberen boekt niet dubbel." (formulering uitsluitend na akkoord op de
garantie; zie risico 1).

**10. Startsaldo bij `create_member`: transactierij toevoegen?** (issue-vraag 4)
Aanbeveling: **nee, niet in dit ticket.** Idempotentie lost het dubbele lid
op; een transactierij voor het startsaldo is een eigen grootboekbeslissing.
`top_ups` is er niet voor geschikt (`shift_id not null`, telt mee in de
kas-/omzetoverzichten van een dienst, en `list_own_transactions` zou een
"opwaardering" tonen die geen contant geld was). Een transactierij vraagt een
nieuw soort rij (bijvoorbeeld een aparte beginsaldotabel), RLS, weergave in
portal en logboek, en past niet in een idempotentieticket. Opvolgticket
(#143b) met eigen spec, als Bram het wil. Tot dan blijft de eis "startsaldo is
de eerste stand van het lid, niet een transactie".

**11. Ook `reverse_order_at_bar`/`reverse_order_as_admin`?**
Aanbeveling: **nee.** Geldzakelijk al veilig (primary key op
`order_reversals.order_id`, `for update`, `already_reversed`). Het resterende
punt is dat een herhaling na onbekende uitkomst een fout geeft in plaats van
succes; dat is een UX-kwestie (de bestaande `already_reversed`-tekst is dan
juist), geen risico op dubbel boeken. Aan Bram om te bevestigen dat de
terugdraai-UX hier geen werk voor nodig heeft.

**12. ADR.**
Aanbeveling: **ja, ADR 0023** (nummer nu vrij; `check:adr` bewaakt dubbele
nummers, controleren bij schrijven): "Geld-RPC's met een client-sleutel zijn
idempotent via `idempotency_keys`". Het is een architectuurbeslissing die elke
volgende geldfeature raakt (webhook #23, nieuwe geld-RPC's) en een bestaande
beslissing preciseert (geld alleen via RPC). Staat niet in CLAUDE.md en
wordt door geen gate afgedwongen. De Architect schrijft de ADR zodra Bram de
antwoorden gaf, **vóór** de Developer begint, in dezelfde PR als de
implementatie of eerder; hij legt vast: aparte tabel, scope per lid,
replay-semantiek zonder state-checks, retentie, één foutcode, optioneel eerst.
Een gate erbij (afgedwongen dat elke geldschrijvende client-RPC een
`p_request_id` heeft) is mogelijk via `rpc_catalogus` maar pas zinvol als
de parameter verplicht is (vraag 7); dat noteer ik als opvolger.

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
- Time-out voor geldoverlays en de "Opnieuw proberen"-UI (fase 2, vraag 9).
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
- `docs/adr/0023-...md`, `docs/ARCHITECTURE.md` (geldlaag), en een regel in
  `opslaan-sluiten-pending.md`, `opwaarderen.md`, `verkoop.md`,
  `ledenbeheer.md` die naar deze spec verwijst.
