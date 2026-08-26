-- Negative-test coverage for start_shift, per tester.md: the one real
-- authentication event per shift (CLAUDE.md → Auth), so every rejection
-- path gets its own case, not just the happy path. Run with
-- `npm run db:test` (= `supabase test db`, needs `supabase start` /
-- Docker locally). NOT executed in this environment — no Docker daemon
-- available here, see the scaffolding summary for what's verified vs. not.
--
-- PIN storage/hashing itself (pgcrypto/crypt(), 4 digits, no lockout in
-- MVP) is settled — docs/ARCHITECTURE.md "Money & attribution" → PIN
-- storage/hashing, issue #3.

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

-- ── Fixtures ──────────────────────────────────────────────────────────
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000050', 'Correct Pin',   'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000051', 'No Pin Set',    'bardienst', null,                          0, false),
  ('00000000-0000-0000-0000-000000000052', 'Just A Member', 'lid',       null,                          0, false),
  ('00000000-0000-0000-0000-000000000053', 'Archived Staff','bardienst', crypt('1234', gen_salt('bf')), 0, true);

-- ── 1) happy path: correct PIN starts a shift ──────────────────────────
select lives_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000050'::uuid,
       '1234'
     ) $$,
  'start_shift succeeds for a bar-role member with the correct PIN'
);

select is(
  (select count(*)::int from shift_members sm
     join shifts s on s.id = sm.shift_id
     where s.started_by = '00000000-0000-0000-0000-000000000050'),
  1,
  'the starter lands in the roster as its only member'
);

select is(
  (select member_id from shift_members sm
     join shifts s on s.id = sm.shift_id
     where s.started_by = '00000000-0000-0000-0000-000000000050'),
  '00000000-0000-0000-0000-000000000050'::uuid,
  'the sole roster member is the starter themselves'
);

-- ── 2) wrong PIN ────────────────────────────────────────────────────────
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000050'::uuid,
       '9999'
     ) $$,
  'P0001', 'invalid_pin',
  'start_shift rejects an incorrect PIN'
);

-- ── 3) bar-role member who has never had a PIN set (pin_hash null) ──────
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000051'::uuid,
       '1234'
     ) $$,
  'P0001', 'invalid_pin',
  'start_shift rejects a member with no PIN set yet, not a null-pointer/500'
);

-- ── 4) role is 'lid', not bardienst/beheerder ────────────────────────────
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000052'::uuid,
       '1234'
     ) $$,
  'P0001', 'no_bar_role',
  'start_shift rejects a lid even if a PIN happened to be set'
);

-- ── 5) archived bar-role member ──────────────────────────────────────────
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000053'::uuid,
       '1234'
     ) $$,
  'P0001', 'member_not_found',
  'start_shift rejects an archived member even with the correct PIN'
);

select * from finish();
rollback;
