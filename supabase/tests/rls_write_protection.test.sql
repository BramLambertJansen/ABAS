-- Confirms the REVOKE in migration 0001 actually holds: `authenticated`
-- cannot write to any money-adjacent table directly, only through the
-- RPCs. This is the negative test for "geldtabellen REVOKED" (CLAUDE.md →
-- Verificatie, check:rls) — permission checks happen before constraint
-- checks in Postgres, so the placeholder ids below don't need to be real.
-- Not executed in this environment, see place_order.test.sql.

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

set local role authenticated;

select throws_ok(
  $$ insert into members (name, role) values ('x', 'lid') $$,
  '42501',
  'insert on members is blocked for authenticated'
);

select throws_ok(
  $$ update app_settings set negative_limit_cents = 999999 $$,
  '42501',
  'update on app_settings is blocked for authenticated'
);

select throws_ok(
  $$ insert into orders (shift_id, served_by, total_cents)
     values (gen_random_uuid(), gen_random_uuid(), 0) $$,
  '42501',
  'insert on orders is blocked for authenticated'
);

select throws_ok(
  $$ insert into order_lines (order_id, product_id, qty, unit_cents)
     values (gen_random_uuid(), gen_random_uuid(), 1, 100) $$,
  '42501',
  'insert on order_lines is blocked for authenticated'
);

select throws_ok(
  $$ insert into top_ups (shift_id, member_id, amount_cents, method, served_by)
     values (gen_random_uuid(), gen_random_uuid(), 500, 'pin', gen_random_uuid()) $$,
  '42501',
  'insert on top_ups is blocked for authenticated'
);

select throws_ok(
  $$ insert into shifts (started_by) values (gen_random_uuid()) $$,
  '42501',
  'insert on shifts is blocked for authenticated'
);

select throws_ok(
  $$ insert into shift_members (shift_id, member_id) values (gen_random_uuid(), gen_random_uuid()) $$,
  '42501',
  'insert on shift_members is blocked for authenticated'
);

select * from finish();
rollback;
