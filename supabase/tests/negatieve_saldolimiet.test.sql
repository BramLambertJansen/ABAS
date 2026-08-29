-- Negative-test coverage for #11 (docs/features/negatieve-saldolimiet.md):
-- update_negative_limit (ADR 0002's auth.uid()-based actorcheck, exact same
-- pattern as assortimentbeheer.test.sql's create_product/
-- update_product_price/set_product_archived coverage). Run with
-- `npm run db:test` (= `supabase test db`, needs `supabase start` / Docker
-- locally).
--
-- NOT RUN against a real Postgres from the sandbox that wrote this file —
-- same known limitation as the other RPC test files (no Docker daemon /
-- supabase CLI here, see docs/ARCHITECTURE.md → "Verified vs. not"). Written
-- and reviewed by hand, following assortimentbeheer.test.sql's fixture/
-- assertion style exactly; first real execution is
-- `supabase start && npm run db:test`.
--
-- Belt-and-braces confirmation (spec → Testgevallen point 6): a direct
-- `update app_settings set negative_limit_cents = ...` as `authenticated`
-- stays blocked by the existing REVOKE (0004_revoke_app_settings_writes.sql)
-- — already covered by rls_write_protection.test.sql, unchanged by this
-- feature, no duplicate test added here.

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ── Fixtures ──────────────────────────────────────────────────────────

-- auth.users: minimal rows so members.auth_user_id's FK is satisfiable and
-- auth.uid() (once request.jwt.claim.sub is set to one of these ids) can
-- resolve to a matching (or deliberately non-matching) members row. Same
-- minimal-columns insert pattern as assortimentbeheer.test.sql.
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000180', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'nsl-admin-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000181', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'nsl-staff-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000182', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'nsl-orphan-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');
-- Note: A3 (...182) is deliberately never referenced by any members row
-- below — it exists in auth.users but no members.auth_user_id points to it,
-- simulating "auth.uid() matches no member at all" (actor_not_found).

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000190', 'NSL Admin Fixture', 'beheerder', null, 0, false, '00000000-0000-0000-0000-000000000180'),
  ('00000000-0000-0000-0000-000000000191', 'NSL Staff Fixture', 'bardienst', null, 0, false, '00000000-0000-0000-0000-000000000181');

-- Fixtures for the €0-via-RPC + place_order-weigering case (test 2): an open
-- shift and a lid with balance 0, same shape as place_order.test.sql.
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000001a0', 'NSL Shift Starter', 'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-0000000001a1', 'NSL Zero Balance Buyer', 'lid', null, 0, false);
insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000001a2', 'NSL Test Pils', 'Bier', 250, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-0000000001a0');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-0000000001a0');

-- ── 1) Happy path ─────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000180', true);

select lives_ok(
  $$ select update_negative_limit(1000) $$,
  'update_negative_limit succeeds for a beheerder with a valid, non-negative amount'
);

select is(
  (select negative_limit_cents from app_settings),
  1000,
  'app_settings.negative_limit_cents is updated to the new value (1000)'
);

-- ── 2) €0 gedraagt zich als "nooit negatief" (via de RPC zelf) ──────────
-- (spec → Randgevallen / Testgevallen punt 2 — AC #4 nu via het echte
-- schrijfpad, niet alleen via place_order.test.sql's directe SQL-fixture.)
select lives_ok(
  $$ select update_negative_limit(0) $$,
  'update_negative_limit succeeds in setting the limit to 0 ("geen")'
);

select is(
  (select negative_limit_cents from app_settings),
  0,
  'app_settings.negative_limit_cents is 0 after the RPC call'
);

select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000001a3'::uuid,
       '00000000-0000-0000-0000-0000000001a1'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000001a2","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000001a0'::uuid
     ) $$,
  'P0001', 'insufficient_balance',
  'place_order rejects an order for a member with balance 0 once the RPC-set limit is 0'
);

-- ── 3) invalid_negative_limit ────────────────────────────────────────────
select throws_ok(
  $$ select update_negative_limit(-100) $$,
  'P0001', 'invalid_negative_limit',
  'update_negative_limit rejects a negative amount'
);

select throws_ok(
  $$ select update_negative_limit(null) $$,
  'P0001', 'invalid_negative_limit',
  'update_negative_limit rejects a null amount'
);

-- ── 4) actor_not_found ────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000182', true);
select throws_ok(
  $$ select update_negative_limit(500) $$,
  'P0001', 'actor_not_found',
  'update_negative_limit rejects a caller whose auth.uid() matches no members row'
);

-- ── 5) no_admin_role ──────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000181', true);
select throws_ok(
  $$ select update_negative_limit(500) $$,
  'P0001', 'no_admin_role',
  'update_negative_limit rejects a caller whose role is bardienst, not beheerder'
);

select * from finish();
rollback;
