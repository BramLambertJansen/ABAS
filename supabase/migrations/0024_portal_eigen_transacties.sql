-- Portal-dashboard: eigen saldo + transacties (#16,
-- docs/features/portal-dashboard.md → RPC's). Zie
-- docs/adr/0010-portal-transacties-naam-via-rpc-niet-rls-verruiming.md voor
-- waarom dit een RPC is en geen verruiming van `members_select`.
--
-- `list_own_transactions()` combineert `orders` en `top_ups` van de
-- aanroepende sessie (via `caller_member_id()`, 0015) tot één tijdlijn en
-- lost daarbij, met verhoogde SECURITY DEFINER-rechten, de naam op van wie
-- `served_by`/`reversed_by` was — een gewone PostgREST-embed zou dat niet
-- kunnen: `members_select` (0015) staat een `lid`-sessie alleen de eigen rij
-- toe, dus een embed naar een andere members-rij geeft stil `null` terug.
--
-- Geen parameters: de functie bepaalt de aanroeper zelf. Een sessie zonder
-- gekoppeld lid (`caller_member_id()` is `null` — de gedeelde
-- bar-tablet-device-sessie, of een bardienst/beheerder-sessie zonder eigen
-- `lid`-rij) krijgt vanzelf een lege resultset: `member_id = null` is nooit
-- waar in SQL, dus zowel de orders- als de top_ups-tak levert dan niets op —
-- stille no-op, geen fout, geen aparte branch nodig.
--
-- `order_lines`/`products` (itemomschrijving) horen hier bewust niet bij:
-- die hebben het kolom-op-andere-rij-probleem niet (`order_lines_select`
-- staat een lid al toe de eigen bestelregels te lezen, `products` is
-- ongeclausuleerd leesbaar) — `usePortalTransactions.ts` haalt die met een
-- gewone, tweede `portalClient.ts`-select op. Zie ADR 0010 → "Niet gekozen".
create or replace function list_own_transactions()
returns table (
  id uuid,
  kind text,
  created_at timestamptz,
  amount_cents integer,
  method text,
  server_name text,
  reversed boolean,
  reversal_reason text,
  reversed_via text,
  reversed_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    'bestelling'::text as kind,
    o.created_at,
    o.total_cents as amount_cents,
    null::text as method,
    coalesce(server.name, 'onbekend') as server_name,
    (r.order_id is not null) as reversed,
    r.reason as reversal_reason,
    r.via as reversed_via,
    reverser.name as reversed_by_name
  from orders o
  join members server on server.id = o.served_by
  left join order_reversals r on r.order_id = o.id
  left join members reverser on reverser.id = r.reversed_by
  where o.member_id = caller_member_id()

  union all

  select
    t.id,
    'opwaardering'::text as kind,
    t.created_at,
    t.amount_cents,
    t.method,
    coalesce(server.name, 'onbekend') as server_name,
    false as reversed,
    null::text as reversal_reason,
    null::text as reversed_via,
    null::text as reversed_by_name
  from top_ups t
  join members server on server.id = t.served_by
  where t.member_id = caller_member_id()

  order by created_at desc;
$$;

comment on function list_own_transactions() is
  'Alle bestellingen en opwaarderingen van de aanroepende sessie (via caller_member_id()), nieuwste eerst, inclusief de naam van wie bediende/terugdraaide. SECURITY DEFINER exclusief om die naam te kunnen lezen ondanks members_select (ADR 0007/0010) — filtert zelf altijd op de eigen member_id, geeft nooit een andere sessie iets terug. Zie docs/features/portal-dashboard.md → RPC''s.';

-- Alleen voor een ingelogde sessie, zelfde patroon als elke RPC sinds 0018:
-- een nieuwe functie krijgt van Postgres standaard EXECUTE voor PUBLIC (en
-- via Supabase's default privileges voor anon) — supabase/tests/
-- rpc_execute_grants.test.sql bewaakt dat élke functie in `public` dit
-- expliciet intrekt.
grant execute on function list_own_transactions() to authenticated;
revoke execute on function list_own_transactions() from public;
revoke execute on function list_own_transactions() from anon;
