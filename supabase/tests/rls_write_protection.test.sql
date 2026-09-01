-- Confirms the REVOKE in migration 0001 actually holds: `authenticated`
-- cannot write to any money-adjacent table directly, only through the
-- RPCs. This is the negative test for "geldtabellen REVOKED" (CLAUDE.md →
-- Verificatie, check:rls) — permission checks happen before constraint
-- checks in Postgres, so the placeholder ids below don't need to be real.

create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

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

-- Added for ledenbeheer (docs/features/ledenbeheer.md): only `insert` on
-- members was covered above until now — the new create_member/
-- update_member_name/set_member_archived/set_member_role RPCs' whole
-- write paths are UPDATE (three of the four) and INSERT (create_member),
-- so UPDATE gets its own explicit belt-and-braces case too (DELETE was
-- already implied by the blanket REVOKE but had no case of its own either;
-- added for completeness, no RPC in this repo issues a `delete` on
-- members).
select throws_ok(
  $$ update members set name = 'y' where id = gen_random_uuid() $$,
  '42501',
  'permission denied for table members',
  'update on members (create_member/update_member_name/set_member_archived/set_member_role''s write path) is blocked for authenticated'
);

select throws_ok(
  $$ delete from members where id = gen_random_uuid() $$,
  '42501',
  'permission denied for table members',
  'delete on members is blocked for authenticated'
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

-- Added for #12 (docs/features/dienst-afsluiten.md → Testgevallen point 5,
-- "belt-and-braces"): the spec assumed an `update shifts set ended_at =
-- ...` case already existed here, but only `insert into shifts` was
-- actually covered above — UPDATE was proven only indirectly via the same
-- REVOKE statement, never with its own pgTAP case. end_shift's whole write
-- path is exactly this UPDATE, so it gets its own explicit case now.
select throws_ok(
  $$ update shifts set ended_at = now() where id = gen_random_uuid() $$,
  '42501',
  'permission denied for table shifts',
  'update on shifts (end_shift''s write path) is blocked for authenticated'
);

select * from finish();
rollback;
