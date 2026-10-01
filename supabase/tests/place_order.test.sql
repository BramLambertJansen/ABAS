-- Negative-test coverage for place_order, per tester.md: happy path plus
-- every identified way it must refuse. Run with `npm run db:test`
-- (= `supabase test db`, needs `supabase start` / Docker locally).
--
-- Extended for docs/features/verkoop.md (#8): that spec's Randgevallen →
-- "RPC-foutcodes van place_order" table documents dedicated UI handling in
-- AfrekenenOverlay.tsx for every code below (member_not_found,
-- product_not_available, shift_not_open get their own Dutch message/
-- refetch; empty_order/invalid_qty fall through to a generic message but
-- are still guarded against server-side). The pre-existing coverage here
-- (happy path, insufficient_balance, served_by_not_on_shift) left those
-- five other codes unproven — if the RPC ever stopped raising exactly
-- these strings, the UI's switch on `result.code` would silently mismatch
-- with no test to catch it. Filling that gap per tester.md's mandate
-- ("elke geïdentificeerde weigergrond"), not because place_order itself
-- changed for #8 — it didn't.

create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

-- ── Sessie-helper (dienst per sessie, ADR 0016) ────────────────────────────
-- De bar-RPC's eisen een geregistreerde bar-sessie met een actieve koppeling
-- aan de dienst (require_shift_session, 0028). Deze helper registreert voor
-- een lid een sessie in modus `bar` (rechtstreeks geïnsert), koppelt haar aan
-- `p_shift` en zet de JWT-claims. Het lid krijgt zo nodig een auth-account.
-- `p_session`: het sessie-id (standaard het lid-id); geef een ander id mee voor
-- een tweede of nieuwe sessie van hetzelfde lid.
create function pg_temp.act_as_bar(p_member uuid, p_shift uuid default null, p_session uuid default null)
returns void
language plpgsql
as $fn$
declare
  v_auth uuid;
  v_session uuid;
begin
  select auth_user_id into v_auth from members where id = p_member;
  if v_auth is null then
    v_auth := p_member;
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_auth::text || '@bar.test.local', crypt('not-used', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}'
    ) on conflict (id) do nothing;
    update members set auth_user_id = v_auth where id = p_member;
  end if;
  insert into bar_sessions (auth_session_id, member_id, mode)
  values (coalesce(p_session, p_member), p_member, 'bar')
  on conflict (auth_session_id) do nothing;
  select id into v_session from bar_sessions where auth_session_id = coalesce(p_session, p_member);
  if p_shift is not null then
    insert into shift_sessions (shift_id, bar_session_id)
    values (p_shift, v_session)
    on conflict do nothing;
  end if;
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth::text, 'session_id', coalesce(p_session, p_member)::text)::text,
    true
  );
end;
$fn$;

-- ── Fixtures ──────────────────────────────────────────────────────────
-- Pin the negative limit explicitly rather than relying on the migration's
-- default (0) — supabase/seed.sql overrides it to 1500 for local dev, and
-- this test's "exceeds the limit" case silently stopped being true under
-- that value (order stayed within -1500) until CI's first real run against
-- Postgres caught it (issue #2). Self-contained now: this test doesn't
-- care what seed.sql does elsewhere.
update app_settings set negative_limit_cents = 0;

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-000000000001', 'Test Pils',       'Bier', 250, false),
  ('00000000-0000-0000-0000-000000000002', 'Archived Radler', 'Bier', 250, true);

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000010', 'Shift Starter',   'bardienst', crypt('1234', gen_salt('bf')), 500, false),
  ('00000000-0000-0000-0000-000000000011', 'Not On Shift',    'bardienst', crypt('1234', gen_salt('bf')), 500, false),
  ('00000000-0000-0000-0000-000000000012', 'Buying Member',   'lid',       null,                          300, false),
  ('00000000-0000-0000-0000-000000000013', 'Archived Member', 'lid',       null,                          300, true);

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010');

-- An already-ended shift, for the shift_not_open case below.
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010', now());
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010');

-- De starter is ingelogd in een bar-sessie die aan dienst ...20 gekoppeld is.
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020');

-- ── 1) happy path ─────────────────────────────────────────────────────
select lives_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'place_order succeeds for a roster member with sufficient balance'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000012'),
  50,
  'balance decremented by the order total (300 - 250 = 50)'
);

select is(
  (select ol.unit_cents from order_lines ol join orders o on o.id = ol.order_id
     where o.member_id = '00000000-0000-0000-0000-000000000012'),
  250,
  'order_lines.unit_cents freezes the product price at order time'
);

select is(
  (select bar_session_id from orders where member_id = '00000000-0000-0000-0000-000000000012'),
  (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-000000000010'),
  'orders.bar_session_id is door de RPC uit de sessie gevuld'
);

-- ── 2) insufficient balance beyond the negative limit (default €0) ─────
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":5}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'P0001', 'insufficient_balance',
  'place_order rejects an order that would exceed the negative-balance limit'
);

-- ── 3) served_by not on the shift's roster ──────────────────────────────
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000000011'::uuid
     ) $$,
  'P0001', 'served_by_not_on_shift',
  'place_order rejects a served_by id that is not on the shift roster'
);

-- ── 4) shift not open (ended) ────────────────────────────────────────────
-- Sinds dienst-per-sessie komt de guard (require_shift_session) vóór de
-- shift_not_open-check: een afgesloten dienst heeft geen actieve koppeling
-- meer, dus de RPC geeft session_not_on_shift. De client behandelt beide
-- codes als "deze sessie werkt niet (meer) in deze dienst".
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000021'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'P0001', 'session_not_on_shift',
  'place_order rejects an order against a shift that has already ended (de sessie is er niet aan gekoppeld)'
);

-- ── 5) empty order (empty lines array) ──────────────────────────────────
-- Practically unreachable through the verkoop UI today (cart guards
-- prevent an empty submission) but still a server-side money rule the RPC
-- must enforce on its own, per tester.md's canonical weigergronden list
-- ("lege bestelling").
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'P0001', 'empty_order',
  'place_order rejects an order with no lines'
);

-- ── 6) invalid qty (zero/negative) ───────────────────────────────────────
-- Same "practically unreachable via this UI, still a server-side rule"
-- reasoning as empty_order — tester.md's canonical list names this
-- "negatief bedrag" for money RPCs generally; here it's a negative qty.
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":-1}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'P0001', 'invalid_qty',
  'place_order rejects a line with a non-positive qty'
);

-- ── 7) product not available (archived) ──────────────────────────────────
-- Reachable per docs/features/verkoop.md → Randgevallen if a product is
-- archived between tapping and checkout; UI refetches the assortment and
-- shows "een product in je mandje is niet meer beschikbaar — controleer je
-- mandje" for this exact code.
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000002","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'P0001', 'product_not_available',
  'place_order rejects a line referencing an archived product'
);

-- ── 8) member not found (archived) ───────────────────────────────────────
-- Reachable per docs/features/verkoop.md → Randgevallen if a member is
-- archived between selection and checkout; UI shows "dit lid bestaat niet
-- meer of is gearchiveerd — kies een ander lid" and returns to the member
-- search for this exact code.
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000013'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'P0001', 'member_not_found',
  'place_order rejects an order for an archived member'
);

-- ── 9) totaal en regels komen uit dezelfde prijslezing ───────────────────
-- Vastgelegd voor 0017_place_order_prijs_snapshot.sql (App-review
-- 2026-09-21). Tot die migratie las place_order elke productprijs twee keer
-- — één keer om `orders.total_cents` te berekenen, en ná de insert opnieuw
-- om `order_lines.unit_cents` te vullen. Onder READ COMMITTED krijgt elk
-- statement een verse snapshot, dus een `update_product_price` die tussen
-- die twee lezingen commit liet het ordertotaal en de orderregels
-- uiteenlopen.
--
-- Die race zelf is niet deterministisch na te bootsen binnen één pgTAP-
-- transactie (er is geen tweede, gelijktijdige sessie om de prijs tussen de
-- twee lezingen in te wijzigen). Wat hier wél vastligt is de invariant die
-- de race brak, over meerdere regels én meerdere producten heen:
-- `orders.total_cents` moet exact de som van zijn eigen regels zijn. Zolang
-- de RPC één lezing doet kan dat niet anders; zou iemand de tweede lezing
-- ooit opnieuw introduceren, dan is dit de assertie die de bedoeling
-- documenteert.
insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-000000000003', 'Test Fris', 'Fris', 175, false);

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000014', 'Multiline Buyer', 'lid', null, 10000, false);

select lives_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000014'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":2},
         {"product_id":"00000000-0000-0000-0000-000000000003","qty":3}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'place_order accepts a multi-line order across two products'
);

select is(
  (select count(*)::integer from order_lines ol
     join orders o on o.id = ol.order_id
     where o.member_id = '00000000-0000-0000-0000-000000000014'),
  2,
  'both lines of the multi-line order were written'
);

select is(
  (select o.total_cents from orders o
     where o.member_id = '00000000-0000-0000-0000-000000000014'),
  (select sum(ol.qty * ol.unit_cents)::integer from order_lines ol
     join orders o on o.id = ol.order_id
     where o.member_id = '00000000-0000-0000-0000-000000000014'),
  'orders.total_cents equals the sum of its own order_lines (2x250 + 3x175 = 1025)'
);

select * from finish();
rollback;
