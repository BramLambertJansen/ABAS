-- Negative-test coverage for reverse_order_at_bar / reverse_order_as_admin
-- (0020_bestelling_terugdraaien.sql, docs/features/bestelling-terugdraaien.md).
-- Run with `npm run db:test`.
--
-- Every weigergrond gets its own case, plus the happy path of both RPCs with
-- the exact balance effect: a reversal is a money write, so "it doesn't
-- throw" is not enough — the refund must be exactly orders.total_cents, once.
--
-- Same auth.users-fixture and request.jwt.claim.sub simulation of auth.uid()
-- as ledenbeheer.test.sql.

create extension if not exists pgtap with schema extensions;

begin;
select plan(27);

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000380', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rev-admin@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000381', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rev-staff@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  -- Not referenced by any members row: the shared device session.
  ('00000000-0000-0000-0000-000000000382', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rev-device@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000390', 'Rev Admin',     'beheerder', null, 0,    false, '00000000-0000-0000-0000-000000000380'),
  ('00000000-0000-0000-0000-000000000391', 'Rev Staff',     'bardienst', null, 0,    false, '00000000-0000-0000-0000-000000000381'),
  ('00000000-0000-0000-0000-000000000392', 'Rev Not On Shift', 'bardienst', null, 0, false, null),
  ('00000000-0000-0000-0000-000000000393', 'Rev Lid',       'lid',       null, 1000, false, null),
  ('00000000-0000-0000-0000-000000000394', 'Rev Archived',  'lid',       null, 200,  true,  null);

-- Open shift (with Rev Staff on it), and a closed one.
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000003a0', '00000000-0000-0000-0000-000000000391');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000003a0', '00000000-0000-0000-0000-000000000391');
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-000000000391', now());
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-000000000391');

insert into orders (id, shift_id, member_id, served_by, total_cents) values
  -- b0: open shift, reversed at the bar (happy path)
  ('00000000-0000-0000-0000-0000000003b0', '00000000-0000-0000-0000-0000000003a0', '00000000-0000-0000-0000-000000000393', '00000000-0000-0000-0000-000000000391', 350),
  -- b1: open shift, used for the bar-side negative cases
  ('00000000-0000-0000-0000-0000000003b1', '00000000-0000-0000-0000-0000000003a0', '00000000-0000-0000-0000-000000000393', '00000000-0000-0000-0000-000000000391', 250),
  -- b2: closed shift, reversed by the admin (happy path)
  ('00000000-0000-0000-0000-0000000003b2', '00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-000000000393', '00000000-0000-0000-0000-000000000391', 700),
  -- b3: open shift, archived member — refund still lands
  ('00000000-0000-0000-0000-0000000003b3', '00000000-0000-0000-0000-0000000003a0', '00000000-0000-0000-0000-000000000394', '00000000-0000-0000-0000-000000000391', 100);

-- ── reverse_order_at_bar ────────────────────────────────────────────────

-- 1) happy path
select lives_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b0'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       '  verkeerd lid getikt  ',
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'reverse_order_at_bar succeeds for an order of the open shift by a roster member'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000393'),
  1350,
  'the refund is exactly orders.total_cents'
);

select results_eq(
  $$ select reason, reversed_by, via, shift_id, refunded_cents
       from order_reversals where order_id = '00000000-0000-0000-0000-0000000003b0' $$,
  $$ values ('verkeerd lid getikt'::text,
             '00000000-0000-0000-0000-000000000391'::uuid,
             'bar'::text,
             '00000000-0000-0000-0000-0000000003a0'::uuid,
             350) $$,
  'the reversal row records the trimmed reason, who, via=bar, the shift and the refunded amount'
);

-- 2) already reversed — and the balance does not move a second time
select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b0'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       'nog eens',
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'P0001', 'already_reversed',
  'an order can only be reversed once'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000393'),
  1350,
  'a rejected second reversal does not refund again'
);

-- 3) shift not open (the closed shift's order, via the bar)
select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b2'::uuid,
       '00000000-0000-0000-0000-0000000003a1'::uuid,
       'te laat',
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'P0001', 'shift_not_open',
  'the bar cannot reverse once the shift is closed'
);

-- 4) order does not exist
select throws_ok(
  $$ select reverse_order_at_bar(
       gen_random_uuid(),
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       'reden',
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'P0001', 'order_not_found',
  'an unknown order id is rejected'
);

-- 5) order belongs to another shift than the one passed
select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b2'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       'reden',
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'P0001', 'order_not_in_shift',
  'the bar can only reverse orders of the open shift itself'
);

-- 6) reversed_by is not on the roster
select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b1'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       'reden',
       '00000000-0000-0000-0000-000000000392'::uuid) $$,
  'P0001', 'reversed_by_not_on_shift',
  'reversed_by must be on the active roster (same rule as served_by)'
);

-- 7) empty / whitespace-only / null reason
select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b1'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       '   ',
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'P0001', 'reason_required',
  'a whitespace-only reason is rejected'
);

select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b1'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       null,
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'P0001', 'reason_required',
  'a null reason is rejected'
);

-- 8) reason too long: 201 rejected, exactly 200 accepted (boundary)
select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b1'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       repeat('x', 201),
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'P0001', 'reason_too_long',
  'a 201-character reason is rejected'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000393'),
  1350,
  'none of the rejected bar calls moved the balance'
);

select lives_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b1'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       repeat('x', 200),
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'a reason of exactly 200 characters is accepted'
);

-- 9) archived member still gets the refund
select lives_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000003b3'::uuid,
       '00000000-0000-0000-0000-0000000003a0'::uuid,
       'dubbel getikt',
       '00000000-0000-0000-0000-000000000391'::uuid) $$,
  'an order of a since-archived member can still be reversed'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000394'),
  300,
  'the archived member''s balance is refunded too'
);

-- ── reverse_order_as_admin ──────────────────────────────────────────────

-- 10) no linked member (the shared device session)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000382', true);
select throws_ok(
  $$ select reverse_order_as_admin('00000000-0000-0000-0000-0000000003b2'::uuid, 'reden') $$,
  'P0001', 'actor_not_found',
  'a session without a linked member cannot use the admin path'
);

-- 11) bardienst is not a beheerder
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000381', true);
select throws_ok(
  $$ select reverse_order_as_admin('00000000-0000-0000-0000-0000000003b2'::uuid, 'reden') $$,
  'P0001', 'no_admin_role',
  'a bardienst cannot use the admin path, not even for a closed shift'
);

-- 12) admin: unknown order, empty reason, too long
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000380', true);
select throws_ok(
  $$ select reverse_order_as_admin(gen_random_uuid(), 'reden') $$,
  'P0001', 'order_not_found',
  'admin path: an unknown order id is rejected'
);

select throws_ok(
  $$ select reverse_order_as_admin('00000000-0000-0000-0000-0000000003b2'::uuid, '') $$,
  'P0001', 'reason_required',
  'admin path: an empty reason is rejected'
);

select throws_ok(
  $$ select reverse_order_as_admin('00000000-0000-0000-0000-0000000003b2'::uuid, repeat('x', 201)) $$,
  'P0001', 'reason_too_long',
  'admin path: a 201-character reason is rejected'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000393'),
  1600,
  'none of the rejected admin calls moved the balance (1350 + the 250 of b1)'
);

-- 13) admin happy path, on an order of a closed shift
select lives_ok(
  $$ select reverse_order_as_admin('00000000-0000-0000-0000-0000000003b2'::uuid, 'lid heeft niet besteld') $$,
  'a beheerder can reverse an order of a closed shift'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000393'),
  2300,
  'the admin refund is exactly orders.total_cents'
);

select results_eq(
  $$ select reversed_by, via, shift_id, refunded_cents
       from order_reversals where order_id = '00000000-0000-0000-0000-0000000003b2' $$,
  $$ values ('00000000-0000-0000-0000-000000000390'::uuid, 'beheer'::text, null::uuid, 700) $$,
  'the admin reversal is attributed to the beheerder, via=beheer, without a shift'
);

-- 14) admin: already reversed (also one reversed at the bar)
select throws_ok(
  $$ select reverse_order_as_admin('00000000-0000-0000-0000-0000000003b0'::uuid, 'nog eens') $$,
  'P0001', 'already_reversed',
  'admin path: an order reversed at the bar cannot be reversed again'
);

-- 15) the order rows themselves are untouched
select is(
  (select total_cents from orders where id = '00000000-0000-0000-0000-0000000003b2'),
  700,
  'reversing never rewrites the order itself'
);

select * from finish();
rollback;
