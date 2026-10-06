# 0023 — Geld-RPC's zijn idempotent via een client-sleutel in `idempotency_keys`

Status: **geaccepteerd (2026-10-06), nog niet geïmplementeerd.** Bram heeft de
aanbevelingen 1–12 uit de spec
[`docs/features/idempotentie-geld-rpcs.md`](../features/idempotentie-geld-rpcs.md)
overgenomen (issue #143); die spec geldt daarmee als goedgekeurd.
**Preciseert:** de kernbeslissing "Geld beweegt alleen via RPC" in `CLAUDE.md`:
de RPC is ook de plek die een herhaald verzoek herkent. **Raakt:**
[ADR 0016](0016-dienst-hoort-bij-geregistreerde-app-sessies.md) (de guards blijven de
sessiebinding), [ADR 0022](0022-token-van-beeindigde-sessie-leest-en-schrijft-niets.md)
(een replay passeert dezelfde guards, dus ook `caller_session_alive()`).

## Context

`place_order`, `top_up` en `create_member` boeken bij elke aanroep opnieuw.
Na een netwerkfout of onbekende serverfout weet de client niet of de eerste
aanroep verwerkt is. T06 (#126) loste dat in de UI op met "controleer eerst
het saldo" en geen automatische retry; de tekst zegt zelf dat een tweede
poging dubbel kan boeken. Een dubbele klik die door de UI-guard glipt, twee
tabbladen of een herhaald HTTP-verzoek hebben hetzelfde effect. Saldo is niet
te corrigeren in de app (CLAUDE.md, Opwaarderen), dus een dubbele boeking is
een echte schade.

`create_member` heeft geen natuurlijke sleutel (`members.name` en `email` zijn
niet uniek) en geen transactierij. `reverse_order_*` is al veilig door de
primary key op `order_reversals.order_id`, `for update` en `already_reversed`.

## Beslissing

**1. De client genereert per gebruikersintentie een uuid (`p_request_id`) en
stuurt hem mee.** Eén bewuste actie is één sleutel, hergebruikt bij elke
herpoging van dezelfde opdracht. De server dedupliceert nooit op inhoud, alleen
op sleutel: twee bewust identieke bestellingen zijn twee sleutels.

**2. Eén aparte tabel `idempotency_keys`** (`request_id` primary key, `rpc`,
`actor_member_id`, `payload_hash`, `result_id`, `created_at`). RLS aan, geen
policies, `revoke all` voor `authenticated` en `anon`, en toegevoegd aan
`MONEY_TABLES` in `scripts/check-rls.mjs`. Alleen de `security definer`-RPC's
lezen en schrijven. Geen persoonsgegevens: ids en een sha256-hash.

**3. Volgorde in de RPC is bindend:** eerst de guards (`require_*`,
`self_top_up_forbidden`), dan de sleutel claimen met
`insert ... on conflict (request_id) do nothing`, dan uitvoeren. Faalt de
uitvoering, dan rolt de claim mee terug: een mislukte eerste aanroep houdt de
sleutel niet vast en er is geen "mislukt"-status.

**4. Dezelfde sleutel, andere `rpc`, ander lid of andere `payload_hash` geeft
één foutcode: `request_id_conflict`.** Eén code zodat een ander lid niet kan
aflezen dat een sleutel bestaat. De scope is het **lid van de sessie**
(`actor_member_id`), niet de bar-sessie of dienst: een herinlog van hetzelfde
lid mag herhalen, een collega niet. De hash dekt de intentie (bij `place_order`
dienst, lid, `served_by` en `(product_id, qty)`-regels; nooit prijzen of
totaal), zodat een replay `served_by` niet kan omzetten.

**5. Een replay (zelfde rpc, actor en hash) geeft het oorspronkelijke
resultaat terug, bewust zonder de state-checks te herhalen.** Alleen de guards
lopen opnieuw. Dienst open, bezetting, saldo, negatieflimiet en de
€500-grens worden bij een replay **niet** getoetst. Zie "Replay zonder
state-checks" hieronder: dit is een besluit, geen omissie.

**6. Races lossen de primary key en `on conflict` op.** De tweede aanroep
wacht tot de eerste commit (dan replay) of afbreekt (dan claimt hij zelf).
Geen advisory lock. Werkt onder `read committed`.

**7. Bewaartermijn 30 dagen**, dagelijks opgeruimd door een `pg_cron`-job
(03:00) die `purge_idempotency_keys()` aanroept, een interne functie (geen
EXECUTE voor enige API-rol; `intern` in `rpc_catalogus`), naar het patroon van
`purge_client_errors` (`0025`). Een herhaling na het opruimen is een nieuwe
boeking; bij een retry-venster van minuten is dat acceptabel.

**8. `p_request_id` is eerst optioneel (`default null`), later verplicht.**
Backend en frontend deployen niet atomair. De migratie dropt de oude
signaturen expliciet (een tweede overload geeft `PGRST203` op alle
bar-verkoop) en geeft de grants opnieuw uit. Een aparte, latere migratie maakt
de parameter verplicht (`request_id_required`); pas dan is een gate in
`rpc_catalogus` zinvol (elke geldschrijvende client-RPC heeft `p_request_id`).

**9. Geen replay-vlag.** Het returntype blijft ongewijzigd; de client
behandelt een replay als gewoon succes. `create_member` geeft bij een replay de
huidige `members`-rij.

**10. De client bewaart de sleutel in het hookgeheugen** (fase 1); na een
paginaherlaad is hij weg. `sessionStorage` is een mogelijk vervolg.

**11. Buiten deze beslissing:** `reverse_order_*` (al veilig), een
transactierij voor het startsaldo van `create_member` (eigen grootboekbeslissing,
opvolgticket), en de webhook van #23 (krijgt een eigen RPC en sleutelruimte,
zonder de kassa-grens van €500; dit ontwerp staat dat niet in de weg).

## Replay zonder state-checks (niet terugdraaien)

Een replay doet bewust **alleen de guards** en geeft het eerder vastgelegde
resultaat terug. Een latere wijziging die op een replay `shift_not_open`,
`insufficient_balance`, `amount_exceeds_max` of `served_by`-fouten laat
optreden, is een regressie. Reden: de eerste aanroep is geslaagd. Zou de
herhaling nu een fout geven (dienst inmiddels gesloten, saldo inmiddels
gedaald), dan denkt de UI dat de boeking mislukte terwijl ze er wel is, en
verleidt dat tot een nieuwe intentie en dus alsnog een dubbele boeking. De
beveiliging zit in de guards (sessie, rol, `self_top_up_forbidden`), in de
actor-binding en in de `payload_hash` (inclusief `served_by`), niet in het
herhalen van state-checks. Elke wijziging aan dit gedrag vraagt een nieuwe ADR.

## Uitrolvolgorde

1. **Migratie vóór of samen met de frontend.** Met een optionele parameter is
   migratie-eerst veilig: een oude client stuurt geen sleutel en krijgt het
   gedrag van vandaag. Een frontend die `p_request_id` meestuurt vóór de
   migratie is niet veilig (onbekende parameter, PostgREST weigert).
2. Het verplicht maken (beslissing 8) pas als de nieuwe client breed draait.

## Wanneer de UI "boekt niet dubbel" mag zeggen

Pas als fase 1 (migratie plus hooks die de sleutel meesturen) staat **én** de
race-integratietest (`test:integration`, twee parallelle aanroepen met dezelfde
sleutel: één boeking, beide antwoorden hetzelfde id, saldo één keer
gewijzigd) slaagt. Tot dan blijft de T06-tekst en het T06-gedrag staan
(`OnbekendeUitkomstMelding`, geen automatische retry, geen time-out voor
geldoverlays). "Opnieuw proberen" met dezelfde sleutel en een heroverweging van
de time-out zijn fase 2 en vragen een eigen akkoord van Bram. Een herhaling
zonder sleutel (oude client, herlaad) is nooit beschermd.

## Gevolgen

- Een client die na een onbekende uitkomst met dezelfde sleutel herhaalt, kan
  niet meer dubbel boeken; een dubbelverzoek is onschadelijk.
- Nieuwe tabel in de geldlaag; `check:rls` en `db:test` bewaken rechten en
  negatieve tests. Een nieuwe geld-RPC met een client-sleutel gebruikt dezelfde
  tabel en dezelfde volgorde (guards, claim, uitvoeren).
- `orders`, `top_ups`, `members`, `order_lines`, `list_own_transactions` en de
  omzet- en kasoverzichten veranderen niet.
- De body's van `place_order` en `top_up` worden in een nieuwe migratie
  herhaald (basis: `0029`); de bestaande tests moeten ongewijzigd slagen.
- Vergeten de oude signatuur te droppen breekt alle bar-verkoop (`PGRST203`);
  `rpc_catalogus` (geen overload) en een rooktest zijn verplicht vóór merge.
- Race-gedrag is alleen met twee echte verbindingen te bewijzen, dus alleen in
  CI (`test:integration`).

## Verworpen alternatieven

- **Een `request_id`-kolom met unieke index per tabel** (`orders`, `top_ups`,
  `members`). Permanente uniekheid, geen retentiegat en geen cron. Maar het
  verspreidt het mechanisme over drie tabellen, raakt de PII-tabel `members`
  met een extra kolom en heeft invloed op leesrechten en overzichten. Eén
  tabel is één plek om te testen en te reviewen, en werkt ook voor
  `create_member` zonder transactierij. Het retentiegat van 30 dagen is bewust
  geaccepteerd.
- **Dedupliceren op inhoud** (zelfde lid, zelfde regels, korte tijd). Twee
  bewust identieke rondjes zouden worden samengevoegd.
- **Replay met herhaalde state-checks.** Geeft foutmeldingen bij een geslaagde
  boeking; zie hierboven.
- **Per sleutel een status (`mislukt`/`gelukt`).** Onnodig: rollback van de
  claim doet hetzelfde.
- **Sleutelscope per bar-sessie of dienst.** Een herinlog van hetzelfde lid kan
  dan niet herhalen.
- **Aparte foutcodes per geval** (andere payload, ander lid, andere RPC). Laat
  een ander lid aflezen dat een sleutel bestaat.
- **Parameter meteen verplicht.** Sterkste garantie, maar breekt een
  niet-herladen client hard bij niet-atomaire deploys.
- **Een replay-vlag in het returntype.** Raakt alle hooks en tests voor kleine
  gebruikerswaarde.
