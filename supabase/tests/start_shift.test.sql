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
select plan(17);

-- ── Fixtures ──────────────────────────────────────────────────────────
-- #29: start_shift weigert zodra er al een open dienst is. `db:test` draait
-- in check:all ná de e2e-suite, tegen dezelfde lokale database, en die
-- laat een dienst open staan (a11y.spec.ts → ensureShiftStarted). Die
-- eerst sluiten, binnen deze teruggedraaide transactie, zodat dit bestand
-- niet afhangt van wat er eerder draaide.
update shifts set ended_at = now() where ended_at is null;

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000050', 'Correct Pin',   'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000051', 'No Pin Set',    'bardienst', null,                          0, false),
  ('00000000-0000-0000-0000-000000000052', 'Just A Member', 'lid',       null,                          0, false),
  ('00000000-0000-0000-0000-000000000053', 'Archived Staff','bardienst', crypt('1234', gen_salt('bf')), 0, true);

-- #18 (docs/features/activiteittypes.md): start_shift's third parameter,
-- p_activity_type_id, is verplicht sinds 0019_activiteittypes.sql — every
-- call below needs a real activity_types row to point at. Dedicated fixture
-- rows, not the migration's own seed rows, same "don't depend on another
-- migration's data" convention as the rest of this file's fixtures.
insert into activity_types (id, name, archived) values
  ('00000000-0000-0000-0000-0000000000b0', 'Test Activity Fixture', false),
  ('00000000-0000-0000-0000-0000000000b1', 'Archived Activity Fixture', true);

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
       '1234',
       '00000000-0000-0000-0000-0000000000b0'::uuid
     ) $$,
  'start_shift succeeds for a bar-role member with the correct PIN and a valid activity type'
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

-- #18: the chosen activity type is stored on the new shift — the whole
-- point of this migration's change to start_shift.
select is(
  (select activity_type_id from shifts
     where started_by = '00000000-0000-0000-0000-000000000050'),
  '00000000-0000-0000-0000-0000000000b0'::uuid,
  'the started shift stores the given activity_type_id'
);

-- ── 1b) #29: een tweede start_shift terwijl de dienst uit 1) nog open
-- staat, wordt geweigerd — en voegt geen dienst toe.
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000054'::uuid,
       '1234',
       '00000000-0000-0000-0000-0000000000b0'::uuid
     ) $$,
  'P0001', 'shift_already_open',
  'start_shift rejects starting a shift while another shift is still open'
);

select is(
  (select count(*)::int from shifts where ended_at is null),
  1,
  'the rejected start_shift left exactly one open shift'
);

-- De check staat vóór de lid/PIN-checks (#29): ook een foute PIN krijgt
-- shift_already_open, niet invalid_pin.
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000050'::uuid,
       '9999',
       '00000000-0000-0000-0000-0000000000b0'::uuid
     ) $$,
  'P0001', 'shift_already_open',
  'shift_already_open is checked before the PIN'
);

-- Dienst uit 1) sluiten, zodat de afwijzingen hieronder hun eigen foutcode
-- geven in plaats van shift_already_open.
update shifts set ended_at = now() where ended_at is null;

-- 1c) Na het sluiten kan er weer een dienst gestart worden — de check
-- kijkt naar open diensten, niet naar diensten in het algemeen.
select lives_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000050'::uuid,
       '1234',
       '00000000-0000-0000-0000-0000000000b0'::uuid
     ) $$,
  'start_shift succeeds again once the previous shift is closed'
);

update shifts set ended_at = now() where ended_at is null;

-- ── 2) wrong PIN ────────────────────────────────────────────────────────
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000050'::uuid,
       '9999',
       '00000000-0000-0000-0000-0000000000b0'::uuid
     ) $$,
  'P0001', 'invalid_pin',
  'start_shift rejects an incorrect PIN'
);

-- ── 3) bar-role member who has never had a PIN set (pin_hash null) ──────
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000051'::uuid,
       '1234',
       '00000000-0000-0000-0000-0000000000b0'::uuid
     ) $$,
  'P0001', 'invalid_pin',
  'start_shift rejects a member with no PIN set yet, not a null-pointer/500'
);

-- ── 4) role is 'lid', not bardienst/beheerder ────────────────────────────
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000052'::uuid,
       '1234',
       '00000000-0000-0000-0000-0000000000b0'::uuid
     ) $$,
  'P0001', 'no_bar_role',
  'start_shift rejects a lid even if a PIN happened to be set'
);

-- ── 5) archived bar-role member ──────────────────────────────────────────
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000053'::uuid,
       '1234',
       '00000000-0000-0000-0000-0000000000b0'::uuid
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
       '1234',
       '00000000-0000-0000-0000-0000000000b0'::uuid
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

update shifts set ended_at = now() where ended_at is null;

-- ── 7) #18: activiteittype is verplicht — a null p_activity_type_id is
-- rejected (docs/features/activiteittypes.md → "Beantwoorde vraag", the one
-- previously open question, now settled as "verplicht").
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000050'::uuid,
       '1234',
       null
     ) $$,
  'P0001', 'invalid_activity_type',
  'start_shift rejects a null activity type — verplicht, zie #18'
);

-- ── 8) #18: activity_type_not_found — an id that does not point at any
-- activity_types row (spec → Randgevallen: "puur defensief, geen realistisch
-- pad" — there's no delete, only archive, but start_shift still guards it).
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000050'::uuid,
       '1234',
       '00000000-0000-0000-0000-0000000000ff'::uuid
     ) $$,
  'P0001', 'activity_type_not_found',
  'start_shift rejects an activity type id that does not exist'
);

-- ── 9) #18: activity_type_archived — a real but archived activity type
-- (spec → Randgevallen: the "archived between choosing and confirming the
-- PIN" race — this proves the guard itself, independent of the UI-level
-- recovery DienstStarten.tsx does when it sees this error code).
select throws_ok(
  $$ select start_shift(
       '00000000-0000-0000-0000-000000000050'::uuid,
       '1234',
       '00000000-0000-0000-0000-0000000000b1'::uuid
     ) $$,
  'P0001', 'activity_type_archived',
  'start_shift rejects an archived activity type'
);

select * from finish();
rollback;
