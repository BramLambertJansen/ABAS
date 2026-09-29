-- Negative-test coverage for #14 (docs/features/assortimentbeheer.md):
-- create_product/update_product_price/set_product_archived (ADR 0002's
-- auth.uid()-based actor check), plus the spec's explicitly-required
-- regressietest prijs-freeze, plus the belt-and-braces REVOKE on `products`.
-- Run with `npm run db:test` (= `supabase test db`, needs `supabase start` /
-- Docker locally).
--
-- NOT RUN against a real Postgres from the sandbox that wrote this file —
-- same known limitation as the other RPC test files (no Docker daemon /
-- supabase CLI here, see docs/ARCHITECTURE.md → "Verified vs. not"). Written
-- and reviewed by hand; first real execution is `supabase start && npm run
-- db:test`.
--
-- Two assumptions this file makes that the earlier RPC tests didn't need to,
-- because create_product/update_product_price/set_product_archived are the
-- first RPCs in this repo to read auth.uid() instead of taking an explicit
-- p_actor_member_id/p_actor_pin (ADR 0002). Flagging both explicitly since
-- neither can be checked without a real Postgres:
--   1. `auth.users` fixture rows below use the standard minimal-columns
--      insert pattern (id/email/aud/role/timestamps) commonly used for
--      pgTAP fixtures against Supabase's GoTrue-managed auth schema. This
--      repo has no prior test that inserts into auth.users, so this is the
--      first real exercise of that pattern here — if the exact auth.users
--      column constraints on this project's Postgres version reject it,
--      this fixture block is the first thing to adjust.
--   2. auth.uid() is simulated the standard way for Postgres-level testing
--      of Supabase's actual auth.uid() implementation (which reads
--      `current_setting('request.jwt.claim.sub', true)`): `select
--      set_config('request.jwt.claim.sub', '<uuid>', true)` before each RPC
--      call, `true` = local to the current transaction, so it can be
--      switched between test cases within this file's single
--      begin/rollback block.

create extension if not exists pgtap with schema extensions;

begin;
select plan(30);

-- ── Sessie-helper (dienst per sessie, ADR 0016) ────────────────────────────
-- Beheer-RPC's eisen een geregistreerde sessie in modus `beheer`
-- (require_beheer_session, 0028). Zet de JWT-claims voor `p_auth_user` en
-- registreert, als er een lid bij hoort, een bar-sessie in `p_mode`. Bewust
-- rechtstreeks geïnsert, ook voor een bardienst of een gearchiveerd lid: zo
-- bewijzen deze tests de guard zelf en niet register_bar_session. Een account
-- zonder lid krijgt geen bar-sessie (no_bar_session).
create function pg_temp.act_as_user(p_auth_user uuid, p_mode text default 'beheer')
returns void
language plpgsql
as $fn$
declare
  v_member uuid;
begin
  select id into v_member from members where auth_user_id = p_auth_user;
  if v_member is not null then
    insert into bar_sessions (auth_session_id, member_id, mode)
    values (p_auth_user, v_member, p_mode)
    on conflict (auth_session_id) do nothing;
  end if;
  perform set_config('request.jwt.claim.sub', p_auth_user::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_auth_user::text, 'session_id', p_auth_user::text)::text,
    true
  );
end;
$fn$;

-- Bar-sessie voor een lid (modus `bar`, met een koppeling aan `p_shift`): voor
-- de bar-RPC's die deze test naast de beheer-RPC's gebruikt. Maakt zo nodig
-- een auth-account voor het lid.
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

-- auth.users: minimal rows so members.auth_user_id's FK is satisfiable and
-- auth.uid() (once request.jwt.claim.sub is set to one of these ids) can
-- resolve to a matching (or deliberately non-matching) members row.
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'staff-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'archived-admin-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'orphan-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');
-- Note: A4 (...083) is deliberately never referenced by any members row
-- below — it exists in auth.users but no members.auth_user_id points to it,
-- simulating "auth.uid() matches no member at all" (actor_not_found).

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000090', 'Admin Fixture',          'beheerder', null, 0, false, '00000000-0000-0000-0000-000000000080'),
  ('00000000-0000-0000-0000-000000000091', 'Staff Fixture',          'bardienst', null, 0, false, '00000000-0000-0000-0000-000000000081'),
  ('00000000-0000-0000-0000-000000000092', 'Archived Admin Fixture', 'beheerder', null, 0, true,  '00000000-0000-0000-0000-000000000082');

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000000a0', 'Test Radler',             'Bier',   300, false),
  ('00000000-0000-0000-0000-0000000000a1', 'Test Archived Fixture',   'Wijn',   700, true),
  ('00000000-0000-0000-0000-0000000000a2', 'Test Freeze Product',     'Snacks', 400, false);

-- Regression-test (prijs-freeze) fixtures: an open shift + a buying member,
-- reused from the same style as place_order.test.sql.
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000000a3', 'Freeze Shift Starter', 'bardienst', crypt('1234', gen_salt('bf')), 0,    false),
  ('00000000-0000-0000-0000-0000000000a5', 'Freeze Buyer',         'lid',       null,                          1000, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a3');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a3');

-- ── create_product ───────────────────────────────────────────────────────

-- 1) actor_not_found: auth.uid() matches no members row at all.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000083');
select throws_ok(
  $$ select create_product('Nieuw Product', 'Bier', 250) $$,
  'P0001', 'no_bar_session',
  'create_product rejects a caller whose auth.uid() matches no members row'
);

-- 2) no_admin_role: caller resolves to a real, active member, but not beheerder.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000081');
select throws_ok(
  $$ select create_product('Nieuw Product', 'Bier', 250) $$,
  'P0001', 'no_admin_role',
  'create_product rejects a caller whose role is bardienst, not beheerder'
);

-- From here on, act as the admin fixture.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000080');

-- 3) invalid_name
select throws_ok(
  $$ select create_product('   ', 'Bier', 250) $$,
  'P0001', 'invalid_name',
  'create_product rejects a blank (whitespace-only) name'
);

-- 4) invalid_category
select throws_ok(
  $$ select create_product('Nieuw Product', '   ', 250) $$,
  'P0001', 'invalid_category',
  'create_product rejects a blank (whitespace-only) category'
);

-- 5) invalid_price
select throws_ok(
  $$ select create_product('Nieuw Product', 'Bier', 0) $$,
  'P0001', 'invalid_price',
  'create_product rejects a price of 0'
);

-- 6) happy path
select lives_ok(
  $$ select create_product('Test Fles Wijn', 'Wijn', 550) $$,
  'create_product succeeds for a beheerder with valid input'
);

select is(
  (select count(*)::int from products
     where name = 'Test Fles Wijn' and category = 'Wijn'
       and price_cents = 550 and archived = false),
  1,
  'the new product exists with the given name/category/price and archived=false'
);

-- ── update_product_price ─────────────────────────────────────────────────

-- 7) actor_not_found: caller resolves to a real members row, but it's archived.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000082');
select throws_ok(
  $$ select update_product_price('00000000-0000-0000-0000-0000000000a0', 400) $$,
  'P0001', 'no_bar_role',
  'update_product_price rejects a caller whose members row is archived'
);

-- 8) no_admin_role
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000081');
select throws_ok(
  $$ select update_product_price('00000000-0000-0000-0000-0000000000a0', 400) $$,
  'P0001', 'no_admin_role',
  'update_product_price rejects a caller whose role is bardienst, not beheerder'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-000000000080');

-- 9) product_not_found
select throws_ok(
  $$ select update_product_price('00000000-0000-0000-0000-0000000000ff', 400) $$,
  'P0001', 'product_not_found',
  'update_product_price rejects a product id that does not exist'
);

-- 10) invalid_price
select throws_ok(
  $$ select update_product_price('00000000-0000-0000-0000-0000000000a0', 0) $$,
  'P0001', 'invalid_price',
  'update_product_price rejects a price of 0'
);

-- 11) happy path
select lives_ok(
  $$ select update_product_price('00000000-0000-0000-0000-0000000000a0', 450) $$,
  'update_product_price succeeds for a beheerder with a valid new price'
);

select is(
  (select price_cents from products where id = '00000000-0000-0000-0000-0000000000a0'),
  450,
  'the product price is updated to the new value'
);

-- 12) randgeval: a gearchiveerd product stays price-editable (spec →
-- Randgevallen: no "not archived" requirement on update_product_price).
select lives_ok(
  $$ select update_product_price('00000000-0000-0000-0000-0000000000a1', 750) $$,
  'update_product_price succeeds even when the product is archived'
);

select is(
  (select price_cents from products where id = '00000000-0000-0000-0000-0000000000a1'),
  750,
  'the archived product''s price is updated too'
);

-- 13-15) regressietest prijs-freeze (acceptatiecriterium 2, spec →
-- Randgevallen): place an order at price A, then change the product's price
-- to B, then confirm the already-placed order_lines row still shows A.
select pg_temp.act_as_bar('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4');
select lives_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000000a4'::uuid,
       '00000000-0000-0000-0000-0000000000a5'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000000a2","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000000a3'::uuid
     ) $$,
  'place_order succeeds against the freeze-test product at its original price (400)'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-000000000080');
select lives_ok(
  $$ select update_product_price('00000000-0000-0000-0000-0000000000a2', 999) $$,
  'update_product_price succeeds in changing the freeze-test product''s price afterwards'
);

select is(
  (select ol.unit_cents from order_lines ol
     join orders o on o.id = ol.order_id
     where o.member_id = '00000000-0000-0000-0000-0000000000a5'
       and ol.product_id = '00000000-0000-0000-0000-0000000000a2'),
  400,
  'order_lines.unit_cents stays frozen at the original price (400), unaffected by the later price change to 999'
);

-- ── set_product_archived ─────────────────────────────────────────────────

-- 16) actor_not_found
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000083');
select throws_ok(
  $$ select set_product_archived('00000000-0000-0000-0000-0000000000a0', true) $$,
  'P0001', 'no_bar_session',
  'set_product_archived rejects a caller whose auth.uid() matches no members row'
);

-- 17) no_admin_role
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000081');
select throws_ok(
  $$ select set_product_archived('00000000-0000-0000-0000-0000000000a0', true) $$,
  'P0001', 'no_admin_role',
  'set_product_archived rejects a caller whose role is bardienst, not beheerder'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-000000000080');

-- 18) product_not_found
select throws_ok(
  $$ select set_product_archived('00000000-0000-0000-0000-0000000000ff', true) $$,
  'P0001', 'product_not_found',
  'set_product_archived rejects a product id that does not exist'
);

-- 19) happy path: archive
select lives_ok(
  $$ select set_product_archived('00000000-0000-0000-0000-0000000000a0', true) $$,
  'set_product_archived succeeds in archiving an active product'
);

select is(
  (select archived from products where id = '00000000-0000-0000-0000-0000000000a0'),
  true,
  'the product is now archived'
);

-- 20) happy path: de-archive
select lives_ok(
  $$ select set_product_archived('00000000-0000-0000-0000-0000000000a0', false) $$,
  'set_product_archived succeeds in de-archiving the same product'
);

select is(
  (select archived from products where id = '00000000-0000-0000-0000-0000000000a0'),
  false,
  'the product is no longer archived'
);

-- 21) idempotent: sending p_archived = true twice on an already-archived
-- product does not fail (spec → RPC's, same tolerance as add_shift_member's
-- on conflict do nothing).
select lives_ok(
  $$ select set_product_archived('00000000-0000-0000-0000-0000000000a1', true) $$,
  'set_product_archived on an already-archived product (p_archived=true again) does not fail'
);

select is(
  (select archived from products where id = '00000000-0000-0000-0000-0000000000a1'),
  true,
  'the already-archived product stays archived after the idempotent call'
);

-- ── REVOKE on products (belt-and-braces, spec → Datamodel) ──────────────
-- Same pattern as rls_write_protection.test.sql: `products` wasn't covered
-- there yet, added here since it's this feature's own REVOKE. Permission
-- checks happen before constraint checks in Postgres, so the placeholder
-- values below don't need to be valid/real.

set local role authenticated;

select throws_ok(
  $$ insert into products (name, category, price_cents) values ('x', 'y', 100) $$,
  '42501',
  'permission denied for table products',
  'insert on products is blocked for authenticated'
);

select throws_ok(
  $$ update products set price_cents = 999 where id = gen_random_uuid() $$,
  '42501',
  'permission denied for table products',
  'update on products is blocked for authenticated'
);

select throws_ok(
  $$ delete from products where id = gen_random_uuid() $$,
  '42501',
  'permission denied for table products',
  'delete on products is blocked for authenticated'
);

select * from finish();
rollback;
