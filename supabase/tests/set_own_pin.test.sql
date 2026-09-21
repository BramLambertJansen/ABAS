-- Negative-test coverage for set_own_pin (supabase/migrations/
-- 0014_pin_zelfbediening.sql, docs/features/auth-methode-per-lid.md #42, ADR
-- 0004). Run with `npm run db:test` (= `supabase test db`, needs `supabase
-- start` / Docker locally).
--
-- set_own_pin is a self-service, auth.uid()-based RPC (same actorcheck shape
-- as create_member/update_member_name/set_member_archived/set_member_role,
-- ADR 0002 → "Post-implementatie fix"'s `select * into v_actor` pattern) but
-- a lighter check than those: it only requires the caller to resolve to a
-- non-archived bardienst/beheerder member, and it only ever writes the
-- caller's own row — there is no target-member-id parameter to guard
-- separately. Fixture-/assertiestijl follows ledenbeheer.test.sql /
-- assortimentbeheer.test.sql exactly, including the two assumptions their
-- header comments already flag for every auth.uid()-based RPC test in this
-- repo (auth.users fixture-vorm, request.jwt.claim.sub-simulatie van
-- auth.uid()).
--
-- Foutcodes hieronder zijn letterlijk overgenomen uit
-- 0014_pin_zelfbediening.sql, niet aangenomen: actor_not_found (regel 48),
-- no_bar_role (regel 54), invalid_pin_format (regel 69).

create extension if not exists pgtap with schema extensions;

begin;
select plan(15);

-- ── Fixtures ──────────────────────────────────────────────────────────

-- auth.users: minimal rows so members.auth_user_id's FK is satisfiable and
-- auth.uid() (once request.jwt.claim.sub is set to one of these ids) can
-- resolve to a matching (or deliberately non-matching) members row.
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sop-bardienst-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sop-archived-beheerder-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sop-lid-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sop-beheerder-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sop-orphan-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');
-- (...115) is deliberately never referenced by any members row below — it
-- exists in auth.users but no members.auth_user_id points to it, simulating
-- "auth.uid() matches no member at all" (actor_not_found, variant A: orphan
-- session).

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000120', 'SOP Bardienst Fixture',          'bardienst', crypt('1111', gen_salt('bf')), 0, false, '00000000-0000-0000-0000-000000000110'),
  ('00000000-0000-0000-0000-000000000121', 'SOP Archived Beheerder Fixture', 'beheerder', null,                          0, true,  '00000000-0000-0000-0000-000000000112'),
  ('00000000-0000-0000-0000-000000000122', 'SOP Lid Fixture',                'lid',       null,                          0, false, '00000000-0000-0000-0000-000000000113'),
  ('00000000-0000-0000-0000-000000000123', 'SOP Beheerder Fixture',          'beheerder', null,                          0, false, '00000000-0000-0000-0000-000000000114');
-- (...121) exists as a members row but is archived — auth.uid() resolving to
-- it hits the actorcheck's `and not archived` filter, simulating
-- "auth.uid() matches an archived member" (actor_not_found, variant B).
-- (...122) has a linked auth account and an active row, but role = 'lid' —
-- for no_bar_role. (...123) is a second, distinct bardienst/beheerder-lid
-- (beheerder this time, not bardienst) so the happy-path coverage below
-- proves both roles are accepted, not just bardienst.

-- ── actor_not_found ───────────────────────────────────────────────────────

-- 1) variant A: auth.uid() matches no members row at all.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000115', true);
select throws_ok(
  $$ select set_own_pin('1234') $$,
  'P0001', 'actor_not_found',
  'set_own_pin rejects a caller whose auth.uid() matches no members row'
);

-- 2) variant B: auth.uid() matches a members row, but it's archived.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000112', true);
select throws_ok(
  $$ select set_own_pin('1234') $$,
  'P0001', 'actor_not_found',
  'set_own_pin rejects a caller whose members row is archived'
);

-- ── no_bar_role ───────────────────────────────────────────────────────────

-- 3) caller resolves to a real, active, linked member, but role is 'lid'.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000113', true);
select throws_ok(
  $$ select set_own_pin('1234') $$,
  'P0001', 'no_bar_role',
  'set_own_pin rejects a caller whose role is lid, not bardienst/beheerder'
);

-- Confirms the lid fixture's pin_hash was never touched by the rejected call.
select is(
  (select pin_hash from members where id = '00000000-0000-0000-0000-000000000122'),
  null,
  'the rejected lid-role caller''s pin_hash stays null'
);

-- ── invalid_pin_format ────────────────────────────────────────────────────

-- From here on, act as the bardienst fixture (a valid actor for every
-- remaining case).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000110', true);

-- 4) too short (not 4 digits).
select throws_ok(
  $$ select set_own_pin('123') $$,
  'P0001', 'invalid_pin_format',
  'set_own_pin rejects a pin shorter than 4 digits'
);

-- 5) not numeric.
select throws_ok(
  $$ select set_own_pin('abcd') $$,
  'P0001', 'invalid_pin_format',
  'set_own_pin rejects a non-numeric pin'
);

-- 6) too long (not 4 digits).
select throws_ok(
  $$ select set_own_pin('12345') $$,
  'P0001', 'invalid_pin_format',
  'set_own_pin rejects a pin longer than 4 digits'
);

-- Confirms none of the three rejected format attempts touched the actor's
-- original pin_hash.
select ok(
  (select crypt('1111', pin_hash) = pin_hash from members where id = '00000000-0000-0000-0000-000000000120'),
  'the bardienst actor''s original pin_hash is unchanged after the rejected format attempts'
);

-- ── happy path ────────────────────────────────────────────────────────────

-- 7) set/change the PIN (bardienst).
select lives_ok(
  $$ select set_own_pin('5678') $$,
  'set_own_pin succeeds for an active bardienst member with a valid 4-digit pin'
);

select ok(
  (select crypt('5678', pin_hash) = pin_hash from members where id = '00000000-0000-0000-0000-000000000120'),
  'the bardienst actor''s pin_hash is updated to match the new pin'
);

-- 8) the RPC writes at, and only at, the caller's own row — returns that
-- row (spec → RPC's, point 4).
select is(
  (select (set_own_pin('5678')).id),
  '00000000-0000-0000-0000-000000000120'::uuid,
  'set_own_pin returns the caller''s own, updated members row'
);

-- 9) turn the PIN off (p_pin = null) — no confirmation step needed
-- server-side, spec → RPC's / Schermflow stap 6.
select lives_ok(
  $$ select set_own_pin(null) $$,
  'set_own_pin succeeds in clearing the pin (p_pin = null)'
);

select is(
  (select pin_hash from members where id = '00000000-0000-0000-0000-000000000120'),
  null,
  'the bardienst actor''s pin_hash is null after clearing it'
);

-- 10) happy path for the other eligible role (beheerder, not just
-- bardienst) — both roles must be accepted (RPC's step 2).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000114', true);
select lives_ok(
  $$ select set_own_pin('9012') $$,
  'set_own_pin succeeds for an active beheerder member with a valid 4-digit pin'
);

select ok(
  (select crypt('9012', pin_hash) = pin_hash from members where id = '00000000-0000-0000-0000-000000000123'),
  'the beheerder actor''s pin_hash is updated to match the new pin'
);

select * from finish();
rollback;
