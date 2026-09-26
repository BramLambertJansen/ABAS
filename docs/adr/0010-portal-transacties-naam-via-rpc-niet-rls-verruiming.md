# 0010 — De naam van de bardienst op een eigen transactie komt uit een RPC, niet uit een verruiming van `members_select`

Status: **voorgesteld** — hoort bij het concept
[`docs/features/portal-dashboard.md`](../features/portal-dashboard.md) (issue
#16), nog niet geaccordeerd door Bram. Amendeert
[ADR 0007](0007-rol-lid-leest-alleen-eigen-rijen.md); vervangt niets.

## Context

ADR 0007 sloot `members_select` dicht tot precies de eigen rij voor een
sessie met rol `lid`: `using (not caller_is_lid() or auth_user_id =
auth.uid())`. Dat ADR's eigen "Gevolgen"-sectie verwacht expliciet dat een
latere portal-leeshook geen eigen RPC nodig heeft: *"Een toekomstige
lees-hook voor de portal hoeft geen eigen RPC te zijn om veilig te zijn: een
gewone `.from("orders").select(...)` geeft een lid vanzelf alleen de eigen
rijen."*

Issue #16 (`docs/features/portal-dashboard.md`) breekt die verwachting op één
punt. De transactielijst moet, letterlijk uit de issue-tekst, "datum en
bardienst die het boekte" tonen — dus niet alleen `orders`/`top_ups`/
`order_reversals` (al toegankelijk voor een lid via de eigen rij, ADR 0007),
maar ook de **naam** van een andere `members`-rij: wie `served_by` was op die
bestelling/opwaardering, en wie `reversed_by` was op een terugdraaiing. Een
gewone PostgREST-embed (`orders.select("..., server:members!served_by(name)")`,
zoals `useShiftLedger.ts` dat al doet voor de bar) evalueert de embed als een
aparte `select` op `members` — en `members_select` staat een `lid`-sessie
daar niets toe behalve de eigen rij. De embed zou dus stil `null` teruggeven
voor elke transactie, ongeacht wie bediende.

## Beslissing

**Geen verruiming van `members_select`.** In plaats daarvan een nieuwe,
smalle `SECURITY DEFINER`-RPC, `list_own_transactions()`
(`docs/features/portal-dashboard.md` → RPC's), die zelf — met verhoogde
rechten, dus niet gehinderd door de RLS die op de aanroepende rol ligt — de
naam van de bediende/terugdraaiende medewerker opzoekt en als platte tekst
teruggeeft. De RPC filtert intern altijd op `member_id = caller_member_id()`:
hij geeft nooit iets terug van een andere lid dan de aanroeper, ongeacht wat
er aan parameters meegegeven zou kunnen worden (er zijn geen parameters).

Dit is dezelfde vorm als ADR 0004 (`members.email`): een kolom/veld dat niet
via de brede policy leesbaar mag zijn voor wie het aanvraagt, wordt in plaats
daarvan RPC-gated met een eigen, smalle controle — hier "alleen de naam, en
alleen van wie een eigen transactie bediende", daar "alleen voor een
beheerder-sessie". Twee toepassingen van hetzelfde patroon, niet twee
patronen.

**Waarom niet een gerichte RLS-uitzondering** (bijvoorbeeld: `members_select`
staat een `lid` ook toe een rij te lezen wiens `id` voorkomt als `served_by`/
`reversed_by` op een eigen bestelling/opwaardering/terugdraaiing) — dat was
het eerst overwogen alternatief, dezelfde vorm als `caller_owns_order()`.
Verworpen omdat RLS **rij-niveau** is, geen kolom-niveau: zo'n policy zou de
**hele** `members`-rij van de bediende medewerker openzetten voor een query
die de client zelf opstelt, niet alleen de `name`-kolom die de UI nodig
heeft. Een lid zou dan met een losse, rechtstreekse Supabase-call (buiten de
app-UI om, PostgREST kent geen kolomrestrictie per policy) ook
`balance_cents`/`archived`/`created_at` van die bardienst-medewerker kunnen
opvragen — en een bardienst/beheerder is net zo goed lid van de vereniging
met een eigen saldo. Dat is precies het soort brede neveneffect dat ADR 0004
al identificeerde voor `email` en dat ADR 0007 zelf bewust smal hield ("Vier
eigenschappen van die vorm zijn de beslissing... Strikt beperkend"). Een RPC
die alleen `name text` teruggeeft heeft dat lek niet: er is geen kolom om
per ongeluk méé te lekken, de functie retourneert precies wat ze zelf
samenstelt.

**Niet gekozen: alles (inclusief bestelregels/producten) via dezelfde RPC.**
`order_lines`/`products` hebben dit probleem niet — `order_lines_select`
staat een lid al toe de eigen bestelregels te lezen (`caller_owns_order()`,
ADR 0007), en `products` is sowieso ongeclausuleerd leesbaar voor elke
`authenticated`-sessie (ADR 0007 → Reikwijdte). Die twee blijven dus gewone
`.from(...).select(...)`-calls via `portalClient.ts`, geen RPC — alleen het
naam-probleem is smal genoeg gehouden om er één functie voor te schrijven, in
lijn met ADR 0007's eigen verwachting dat de meeste portal-leeshooks geen RPC
nodig hebben.

## Reikwijdte van deze beslissing

Dit ADR raakt alleen **lezen** van een naam ten behoeve van weergave. Het
raakt geen schrijfpad (die blijven ongewijzigd via `place_order`/`top_up`/
`reverse_order_at_bar`/`reverse_order_as_admin`) en het verandert niets aan
`members_select`, `orders_select`, `order_lines_select`, `top_ups_select` of
`order_reversals_select` zoals ADR 0007/`bestelling-terugdraaien.md` die al
vastlegden.

## Gevolgen

- `list_own_transactions()` is de eerste RPC in deze codebase die uitsluitend
  voor **lezen** bestaat zonder een PII-kolom als motivatie (in tegenstelling
  tot ADR 0004's `email`-RPC) — het bestaansrecht is hier "RLS is rij-niveau,
  de behoefte is kolom-niveau op een andere rij dan de eigen", niet
  geheimhouding van de naam zelf (een bardienst-naam is voor iedere andere
  `authenticated`-sessie al gewoon zichtbaar).
- Nieuwe negatieve testverwachting (`supabase/tests/`, zie
  `docs/features/portal-dashboard.md` → RPC's): een `lid`-sessie die de RPC
  aanroept, ziet nooit een transactie van een ander lid; een sessie zonder
  gekoppeld lid krijgt een lege set, geen fout.
- `rpc_execute_grants.test.sql` bewaakt deze functie automatisch mee (het
  controleert elke functie in `public`, geen aparte toevoeging nodig) — wél
  moet de migratie zelf `grant execute ... to authenticated` +
  `revoke ... from public/anon` bevatten, zoals elke RPC sinds 0018.
- Signaal, geen nieuwe regel: mocht een volgende feature nóg een keer tegen
  "RLS is rij-niveau, ik heb kolom-niveau nodig op een andere rij" aanlopen,
  dan is dat het moment om dit als een herbruikbaar patroon te benoemen
  (bijvoorbeeld in CLAUDE.md), niet om het per geval opnieuw te beargumenteren
  — twee toepassingen (ADR 0004, dit ADR) is nog geen patroon dat een gate
  verdient.
