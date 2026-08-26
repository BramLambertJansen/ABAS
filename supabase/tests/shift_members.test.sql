-- Negative-test coverage for add_shift_member/remove_shift_member, per
-- tester.md and docs/features/bezetting-beheren.md → Randgevallen
-- ("Toevoegen/verwijderen buiten een actieve dienst" — #7's own acceptance
-- criterion). Run with `npm run db:test` (= `supabase test db`, needs
-- `supabase start` / Docker locally).
--
-- NOT RUN against a real Postgres from the sandbox that wrote this file —
-- same known limitation as start_shift.test.sql/place_order.test.sql/
-- top_up.test.sql (no Docker daemon / supabase CLI here, see
-- docs/ARCHITECTURE.md → "Verified vs. not"). Written and reviewed by hand,
-- first real execution is `supabase start && npm run db:test`.
--
-- remove_shift_member's shift_not_open guard is the one real RPC change in
-- #7 (migration 0003_remove_shift_member_requires_open_shift.sql) — before
-- that fix it was a kale `delete` with no open-shift check at all, unlike
-- add_shift_member which already had one. So beyond just asserting the
-- exception, every "should be rejected" case here also asserts the roster
-- row it would have touched is unchanged — proving the call didn't
-- partially apply before raising, not just that it raised.

create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

-- ── Fixtures ──────────────────────────────────────────────────────────
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000060', 'Shift Starter A', 'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000061', 'Eligible B',      'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000062', 'Lid Member C',    'lid',       null,                          0, false),
  ('00000000-0000-0000-0000-000000000063', 'Archived D',      'bardienst', crypt('1234', gen_salt('bf')), 0, true);

-- S1: open shift (ended_at is null) — the only shift add/remove is allowed
-- to touch.
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060', null);
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060');

-- S2: already-ended shift, with a pre-existing roster row (Starter A), to
-- prove neither add nor remove can touch it, and that a failed remove
-- doesn't delete that row anyway.
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000060', now());
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000060');

-- ── 1) happy path: add_shift_member on an open shift ────────────────────
select lives_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000070'::uuid,
       '00000000-0000-0000-0000-000000000061'::uuid
     ) $$,
  'add_shift_member succeeds for an eligible member on an open shift'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000070'
       and member_id = '00000000-0000-0000-0000-000000000061'),
  1,
  'the added member now has a roster row on the open shift'
);

-- ── 2) happy path: remove_shift_member undoes it on the same open shift ──
select lives_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-000000000070'::uuid,
       '00000000-0000-0000-0000-000000000061'::uuid
     ) $$,
  'remove_shift_member succeeds on an open shift'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000070'
       and member_id = '00000000-0000-0000-0000-000000000061'),
  0,
  'the removed member no longer has a roster row'
);

-- ── 3) add_shift_member on an ended shift → shift_not_open ──────────────
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000071'::uuid,
       '00000000-0000-0000-0000-000000000061'::uuid
     ) $$,
  'P0001', 'shift_not_open',
  'add_shift_member rejects adding to a shift that has already ended'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000071'
       and member_id = '00000000-0000-0000-0000-000000000061'),
  0,
  'the rejected add left no roster row behind on the ended shift'
);

-- ── 4) add_shift_member on a non-existent shift_id → shift_not_open ─────
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000099'::uuid,
       '00000000-0000-0000-0000-000000000061'::uuid
     ) $$,
  'P0001', 'shift_not_open',
  'add_shift_member rejects a shift_id that does not exist at all'
);

-- ── 5) remove_shift_member on an ended shift → shift_not_open ───────────
-- Core acceptance criterion of #7 and the one real RPC fix
-- (0003_remove_shift_member_requires_open_shift.sql): before that fix this
-- delete had no open-shift guard at all.
select throws_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-000000000071'::uuid,
       '00000000-0000-0000-0000-000000000060'::uuid
     ) $$,
  'P0001', 'shift_not_open',
  'remove_shift_member rejects removing from a shift that has already ended'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000071'
       and member_id = '00000000-0000-0000-0000-000000000060'),
  1,
  'the roster row on the ended shift survives the rejected remove call — no partial delete before the raise'
);

-- ── 6) remove_shift_member on a non-existent shift_id → shift_not_open ──
select throws_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-000000000099'::uuid,
       '00000000-0000-0000-0000-000000000060'::uuid
     ) $$,
  'P0001', 'shift_not_open',
  'remove_shift_member rejects a shift_id that does not exist at all'
);

-- ── 7) add_shift_member with an archived member → member_not_eligible ───
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000070'::uuid,
       '00000000-0000-0000-0000-000000000063'::uuid
     ) $$,
  'P0001', 'member_not_eligible',
  'add_shift_member rejects an archived bardienst member even on an open shift'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000070'
       and member_id = '00000000-0000-0000-0000-000000000063'),
  0,
  'the archived member got no roster row'
);

-- ── 8) add_shift_member with a role of 'lid' → member_not_eligible ──────
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000070'::uuid,
       '00000000-0000-0000-0000-000000000062'::uuid
     ) $$,
  'P0001', 'member_not_eligible',
  'add_shift_member rejects a lid — only bardienst/beheerder are eligible'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000070'
       and member_id = '00000000-0000-0000-0000-000000000062'),
  0,
  'the lid member got no roster row'
);

select * from finish();
rollback;
