-- Negative-test coverage for start_shift, per tester.md: the one real
-- authentication event per shift (CLAUDE.md → Auth), so every rejection
-- path gets its own case, not just the happy path. Run with
-- `npm run db:test` (= `supabase test db`, needs `supabase start` /
-- Docker locally).
--
-- PIN storage/hashing itself (pgcrypto/crypt(), 4 digits, no lockout in
-- MVP) is settled — docs/ARCHITECTURE.md "Money & attribution" → PIN
-- storage/hashing, issue #3.

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ── Fixtures ──────────────────────────────────────────────────────────
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000050', 'Correct Pin',   'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000051', 'No Pin Set',    'bardienst', null,                          0, false),
  ('00000000-0000-0000-0000-000000000052', 'Just A Member', 'lid',       null,                          0, false),
  ('00000000-0000-0000-0000-000000000053', 'Archived Staff','bardienst', crypt('1234', gen_salt('bf')), 0, true);

-- Regression fixture for docs/features/auth-methode-per-lid.md (#42) / ADR
-- 0004: a bardienst member with BOTH a pin_hash AND a linked auth_user_id
-- (the normal, expected end state for a member who set up a PIN shortcut on
-- top of the now-mandatory password account, ADR 0005 → Beslissing 2/3).
-- start_shift itself was explicitly NOT changed for #42 (spec → RPC's:
-- "geen migratie nodig voor deze RPC") — this proves that claim rather than
-- assuming it, by confirming PIN-login still succeeds when a password
-- account also exists, not just when it doesn't (test 1 above already
-- covers the pin_hash-only case).
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ss-pin-and-account-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000054', 'Pin And Account', 'bardienst', crypt('1234', gen_salt('bf')), 0, false, '00000000-0000-0000-0000-000000000054');

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

-- ── 6) regression: PIN-login keeps working when the member also has a
-- linked wachtwoordaccount (docs/features/auth-methode-per-lid.md #42 / ADR
-- 0004 — "geen migratie nodig voor deze RPC") ────────────────────────────
select lives_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000054'::uuid,
       '1234'
     ) $$,
  'start_shift succeeds via PIN for a member who also has a linked auth_user_id (both mechanisms coexist, ADR 0005)'
);

select is(
  (select count(*)::int from shift_members sm
     join shifts s on s.id = sm.shift_id
     where s.started_by = '00000000-0000-0000-0000-000000000054'),
  1,
  'the starter with both a pin_hash and an auth_user_id lands in the roster as its only member'
);

select * from finish();
rollback;
