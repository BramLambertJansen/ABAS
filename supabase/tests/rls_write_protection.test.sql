-- Confirms the REVOKE in migration 0001 actually holds: `authenticated`
-- cannot write to any money-adjacent table directly, only through the
-- RPCs. This is the negative test for "geldtabellen REVOKED" (CLAUDE.md →
-- Verificatie, check:rls) — permission checks happen before constraint
-- checks in Postgres, so the placeholder ids below don't need to be real.

create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

set local role authenticated;

-- throws_ok(sql, sqlstate, expected_message, description) — the expected
-- message must be Postgres's actual native REVOKE-rejection text
-- ("permission denied for table X"), not a made-up description; passing a
-- description-shaped string in that slot (as this file used to) makes
-- pgTAP compare it against the real message and fail every time, even
-- though the underlying REVOKE was working correctly. Caught by CI's first
-- real run of `npm run db:test` against a real Postgres (issue #2).

select throws_ok(
  $$ insert into members (name, role) values ('x', 'lid') $$,
  '42501',
  'permission denied for table members',
  'insert on members is blocked for authenticated'
);

select throws_ok(
  $$ update app_settings set negative_limit_cents = 999999 $$,
  '42501',
  'permission denied for table app_settings',
  'update on app_settings is blocked for authenticated'
);

select throws_ok(
  $$ insert into orders (shift_id, served_by, total_cents)
     values (gen_random_uuid(), gen_random_uuid(), 0) $$,
  '42501',
  'permission denied for table orders',
  'insert on orders is blocked for authenticated'
);

select throws_ok(
  $$ insert into order_lines (order_id, product_id, qty, unit_cents)
     values (gen_random_uuid(), gen_random_uuid(), 1, 100) $$,
  '42501',
  'permission denied for table order_lines',
  'insert on order_lines is blocked for authenticated'
);

select throws_ok(
  $$ insert into top_ups (shift_id, member_id, amount_cents, method, served_by)
     values (gen_random_uuid(), gen_random_uuid(), 500, 'pin', gen_random_uuid()) $$,
  '42501',
  'permission denied for table top_ups',
  'insert on top_ups is blocked for authenticated'
);

select throws_ok(
  $$ insert into shifts (started_by) values (gen_random_uuid()) $$,
  '42501',
  'permission denied for table shifts',
  'insert on shifts is blocked for authenticated'
);

select throws_ok(
  $$ insert into shift_members (shift_id, member_id) values (gen_random_uuid(), gen_random_uuid()) $$,
  '42501',
  'permission denied for table shift_members',
  'insert on shift_members is blocked for authenticated'
);

-- Specifically relevant to #7 (docs/features/bezetting-beheren.md): the
-- one real RPC change there is remove_shift_member's shift_not_open guard
-- (migration 0003), which runs before a `delete from shift_members`
-- executed as security definer. This REVOKE is what stops a client from
-- doing that delete directly and skipping the guard entirely — insert
-- coverage above doesn't exercise that path, so it needs its own case.
select throws_ok(
  $$ delete from shift_members where shift_id = gen_random_uuid() and member_id = gen_random_uuid() $$,
  '42501',
  'permission denied for table shift_members',
  'delete on shift_members is blocked for authenticated'
);

select * from finish();
rollback;
