-- Negative-test coverage for ledenbeheer (docs/features/ledenbeheer.md, no
-- issuenummer toegewezen op het moment van schrijven — zie spec-intro) en
-- ledenbeheer-email (docs/features/ledenbeheer-email.md, #57):
-- create_member/update_member_name/set_member_archived/set_member_role/
-- update_member_email (ADR 0002's auth.uid()-based actorcheck, exact
-- hetzelfde patroon als assortimentbeheer.test.sql /
-- negatieve_saldolimiet.test.sql). Run met `npm run db:test` (= `supabase
-- test db`, vereist `supabase start` / Docker lokaal).
--
-- Geschreven en nagelezen volgens assortimentbeheer.test.sql's fixture-/
-- assertiestijl exact — zie dat bestand voor de twee aannames die alle
-- auth.uid()-actorcheck-tests in deze repo delen (auth.users-fixture-vorm,
-- request.jwt.claim.sub-simulatie van auth.uid()).
--
-- members staat al sinds 0001_init.sql in de blanket-REVOKE (regel 137) —
-- rls_write_protection.test.sql dekt daar al `insert into members`; dit
-- bestand voegt de ontbrekende update/delete-varianten voor members toe aan
-- dat bestand (niet hier) voor consistentie met hoe de rest van de suite dat
-- organiseert (zie rls_write_protection.test.sql).

create extension if not exists pgtap with schema extensions;

begin;
select plan(59);

-- ── Fixtures ──────────────────────────────────────────────────────────

-- auth.users: minimal rows so members.auth_user_id's FK is satisfiable and
-- auth.uid() (once request.jwt.claim.sub is set to one of these ids) can
-- resolve to a matching (or deliberately non-matching) members row.
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000280', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-admin-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000281', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-staff-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000282', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-archived-admin-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000283', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-orphan-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');
-- Note: (...283) is deliberately never referenced by any members row below
-- — it exists in auth.users but no members.auth_user_id points to it,
-- simulating "auth.uid() matches no member at all" (actor_not_found,
-- variant A: orphan session).

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000290', 'LB Admin Fixture',          'beheerder', null, 0, false, '00000000-0000-0000-0000-000000000280'),
  ('00000000-0000-0000-0000-000000000291', 'LB Staff Fixture',          'bardienst', null, 0, false, '00000000-0000-0000-0000-000000000281'),
  ('00000000-0000-0000-0000-000000000292', 'LB Archived Admin Fixture', 'beheerder', null, 0, true,  '00000000-0000-0000-0000-000000000282');
-- (...292) exists as a members row but is archived — auth.uid() resolving
-- to it hits the actor-check's `and not archived` filter, simulating
-- "auth.uid() matches an archived member" (actor_not_found, variant B).

-- Target rows, no auth.users session of their own — pure RPC targets.
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000002a0', 'LB Other Admin Fixture',      'beheerder', null, 0, false),
  ('00000000-0000-0000-0000-0000000002a1', 'LB Rename Target',            'lid',       null, 0, false),
  ('00000000-0000-0000-0000-0000000002a2', 'LB Archived Rename Target',   'lid',       null, 0, true),
  ('00000000-0000-0000-0000-0000000002a3', 'LB Archive Target',           'lid',       null, 0, false),
  ('00000000-0000-0000-0000-0000000002a4', 'LB Role Target',              'lid',       null, 0, false);

-- Target rows voor update_member_email (#57), los van de rijen hierboven —
-- die worden al door de create_member/update_member_name/set_member_archived/
-- set_member_role-tests gemuteerd, dus niet herbruikt voor de e-mailtests.
insert into members (id, name, role, pin_hash, balance_cents, archived, email) values
  ('00000000-0000-0000-0000-0000000002a5', 'LB Email Target',             'lid', null, 0, false, null),
  ('00000000-0000-0000-0000-0000000002a6', 'LB Email Wipe Target',        'lid', null, 0, false, 'bestaand@test.local'),
  ('00000000-0000-0000-0000-0000000002a7', 'LB Archived Email Target',    'lid', null, 0, true,  null);

-- ── create_member ─────────────────────────────────────────────────────

-- 1) actor_not_found, variant A: auth.uid() matches no members row at all.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000283', true);
select throws_ok(
  $$ select create_member('Nieuw Lid', null) $$,
  'P0001', 'actor_not_found',
  'create_member rejects a caller whose auth.uid() matches no members row'
);

-- 2) no_admin_role: caller resolves to a real, active member, but not beheerder.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000281', true);
select throws_ok(
  $$ select create_member('Nieuw Lid', null) $$,
  'P0001', 'no_admin_role',
  'create_member rejects a caller whose role is bardienst, not beheerder'
);

-- From here on, act as the admin fixture.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000280', true);

-- 3) invalid_name
select throws_ok(
  $$ select create_member('   ', null) $$,
  'P0001', 'invalid_name',
  'create_member rejects a blank (whitespace-only) name'
);

-- 4) invalid_starting_balance
select throws_ok(
  $$ select create_member('Nieuw Lid', -100) $$,
  'P0001', 'invalid_starting_balance',
  'create_member rejects a negative starting balance'
);

-- 5) happy path, with startsaldo
select lives_ok(
  $$ select create_member('Nieuw Lid Met Saldo', 5000) $$,
  'create_member succeeds for a beheerder with a valid name and non-negative starting balance'
);

select is(
  (select count(*)::int from members
     where name = 'Nieuw Lid Met Saldo' and role = 'lid'
       and balance_cents = 5000 and archived = false
       and pin_hash is null and auth_user_id is null),
  1,
  'the new member exists with role lid, balance 5000, archived false, no pin_hash/auth_user_id'
);

-- 6) happy path, zonder startsaldo (null -> 0, "geen startsaldo" is normaal)
select lives_ok(
  $$ select create_member('Nieuw Lid Zonder Saldo', null) $$,
  'create_member succeeds for a beheerder with a valid name and a null starting balance'
);

select is(
  (select balance_cents from members where name = 'Nieuw Lid Zonder Saldo'),
  0,
  'a null starting balance defaults to 0'
);

-- 7) invalid_email (#57): een niet-leeg e-mailadres dat het minimale
-- formaat niet matcht.
select throws_ok(
  $$ select create_member('Nieuw Lid Ongeldige Email', null, 'niet-een-email') $$,
  'P0001', 'invalid_email',
  'create_member rejects a starting email that does not match the minimal format'
);

-- 8) happy path met een geldig e-mailadres (#57).
select lives_ok(
  $$ select create_member('Nieuw Lid Met Email', null, 'nieuw-lid@test.local') $$,
  'create_member succeeds for a beheerder with a valid starting email'
);

select is(
  (select email from members where name = 'Nieuw Lid Met Email'),
  'nieuw-lid@test.local',
  'the new member is stored with the given starting email'
);

-- 9) happy path met null/leeg e-mailadres (#57): bestaand gedrag blijft
-- werken na de signatuurwijziging (p_email default null, backwards
-- compatible met de 2-parameter-aanroepen hierboven).
select lives_ok(
  $$ select create_member('Nieuw Lid Zonder Email', null, '   ') $$,
  'create_member succeeds with a whitespace-only (effectively empty) starting email'
);

select is(
  (select email from members where name = 'Nieuw Lid Zonder Email'),
  null,
  'a whitespace-only starting email is stored as null'
);

-- ── update_member_name ───────────────────────────────────────────────────

-- 10) actor_not_found, variant B: caller resolves to a real members row, but
-- it's archived.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000282', true);
select throws_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a1', 'X') $$,
  'P0001', 'actor_not_found',
  'update_member_name rejects a caller whose members row is archived'
);

-- 11) no_admin_role
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000281', true);
select throws_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a1', 'X') $$,
  'P0001', 'no_admin_role',
  'update_member_name rejects a caller whose role is bardienst, not beheerder'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000280', true);

-- 12) member_not_found
select throws_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002ff', 'X') $$,
  'P0001', 'member_not_found',
  'update_member_name rejects a member id that does not exist'
);

-- 13) invalid_name
select throws_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a1', '   ') $$,
  'P0001', 'invalid_name',
  'update_member_name rejects a blank (whitespace-only) name'
);

-- 14) happy path
select lives_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a1', 'Herdoopt Lid') $$,
  'update_member_name succeeds for a beheerder with a valid new name'
);

select is(
  (select name from members where id = '00000000-0000-0000-0000-0000000002a1'),
  'Herdoopt Lid',
  'the member name is updated to the new value'
);

-- 15) randgeval: een gearchiveerd lid blijft naam-bewerkbaar (spec →
-- Randgevallen / RPC's: geen "not archived"-eis op update_member_name,
-- zelfde redenering als update_product_price op een gearchiveerd product).
select lives_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a2', 'Herdoopt Archief Lid') $$,
  'update_member_name succeeds even when the target member is archived'
);

select is(
  (select name from members where id = '00000000-0000-0000-0000-0000000002a2'),
  'Herdoopt Archief Lid',
  'the archived member''s name is updated'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a2'),
  true,
  'the member stays archived after its name was updated'
);

-- ── set_member_archived ──────────────────────────────────────────────────

-- 16) actor_not_found, variant A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000283', true);
select throws_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', true) $$,
  'P0001', 'actor_not_found',
  'set_member_archived rejects a caller whose auth.uid() matches no members row'
);

-- 17) no_admin_role
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000281', true);
select throws_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', true) $$,
  'P0001', 'no_admin_role',
  'set_member_archived rejects a caller whose role is bardienst, not beheerder'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000280', true);

-- 18) member_not_found
select throws_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002ff', true) $$,
  'P0001', 'member_not_found',
  'set_member_archived rejects a member id that does not exist'
);

-- 19) self_archive_forbidden: a beheerder cannot archive their own row (spec
-- → Randgevallen: would lock the actor out of /beheer with no RPC path back).
select throws_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-000000000290', true) $$,
  'P0001', 'self_archive_forbidden',
  'set_member_archived rejects a beheerder archiving their own members row'
);

-- 20) happy path: archive
select lives_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', true) $$,
  'set_member_archived succeeds in archiving an active member'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a3'),
  true,
  'the member is now archived'
);

-- 21) idempotent: sending p_archived = true again on an already-archived
-- member does not fail (spec → RPC's, same tolerance as set_product_archived).
select lives_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', true) $$,
  'set_member_archived on an already-archived member (p_archived=true again) does not fail'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a3'),
  true,
  'the already-archived member stays archived after the idempotent call'
);

-- 22) happy path: terugzetten (de-archive)
select lives_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', false) $$,
  'set_member_archived succeeds in de-archiving (terugzetten) the same member'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a3'),
  false,
  'the member is no longer archived'
);

-- ── set_member_role ───────────────────────────────────────────────────────

-- 23) actor_not_found, variant B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000282', true);
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'bardienst') $$,
  'P0001', 'actor_not_found',
  'set_member_role rejects a caller whose members row is archived'
);

-- 24) no_admin_role
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000281', true);
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'bardienst') $$,
  'P0001', 'no_admin_role',
  'set_member_role rejects a caller whose role is bardienst, not beheerder'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000280', true);

-- 25) member_not_found
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002ff', 'bardienst') $$,
  'P0001', 'member_not_found',
  'set_member_role rejects a member id that does not exist'
);

-- 26) invalid_role: not one of lid/bardienst/beheerder (server-fallback,
-- unreachable via the UI select — spec → RPC's/Randgevallen).
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'superadmin') $$,
  'P0001', 'invalid_role',
  'set_member_role rejects a role value outside lid/bardienst/beheerder'
);

-- 27) self_demote_forbidden: a beheerder cannot lower their own role (spec →
-- Randgevallen: would lock the actor out of /beheer with no RPC path back).
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-000000000290', 'lid') $$,
  'P0001', 'self_demote_forbidden',
  'set_member_role rejects a beheerder demoting their own role'
);

-- 28) not a demotion: a beheerder re-sending 'beheerder' for their own row is
-- allowed (idempotent, not blocked by self_demote_forbidden).
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-000000000290', 'beheerder') $$,
  'set_member_role allows a beheerder to re-send their own current role (beheerder -> beheerder, not a demotion)'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-000000000290'),
  'beheerder',
  'the actor''s own role stays beheerder after the no-op self re-send'
);

-- 29) rolwijziging van een ándere beheerder, ook als dat de laatst
-- overgebleven ándere beheerder is, blijft toegestaan (spec expliciet: geen
-- "laatste beheerder"-telling/-bescherming — Randgevallen/Expliciet buiten
-- scope). At this point in the fixture set, (...2a0) is the only other
-- beheerder besides the acting admin (...290), i.e. genuinely "the last
-- other beheerder".
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a0', 'lid') $$,
  'set_member_role allows demoting another (the last other) beheerder to lid — no last-admin protection exists'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-0000000002a0'),
  'lid',
  'the other member''s role is now lid'
);

-- 30) happy path transition: lid -> bardienst
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'bardienst') $$,
  'set_member_role succeeds for the lid -> bardienst transition'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-0000000002a4'),
  'bardienst',
  'the member''s role is now bardienst'
);

-- 31) happy path transition: bardienst -> beheerder
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'beheerder') $$,
  'set_member_role succeeds for the bardienst -> beheerder transition'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-0000000002a4'),
  'beheerder',
  'the member''s role is now beheerder'
);

-- 32) idempotent, non-actor: sending the same role again succeeds without
-- error or change (spec → RPC's, same tolerance as set_member_archived).
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'beheerder') $$,
  'set_member_role on a member already at the target role (beheerder again) does not fail'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-0000000002a4'),
  'beheerder',
  'the member''s role is unchanged (still beheerder) after the idempotent call'
);

-- ── update_member_email (#57) ────────────────────────────────────────────

-- 33) actor_not_found, variant A: auth.uid() matches no members row at all.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000283', true);
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'x@test.local') $$,
  'P0001', 'actor_not_found',
  'update_member_email rejects a caller whose auth.uid() matches no members row'
);

-- 34) actor_not_found, variant B: caller resolves to a real members row, but
-- it's archived.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000282', true);
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'x@test.local') $$,
  'P0001', 'actor_not_found',
  'update_member_email rejects a caller whose members row is archived'
);

-- 35) no_admin_role
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000281', true);
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'x@test.local') $$,
  'P0001', 'no_admin_role',
  'update_member_email rejects a caller whose role is bardienst, not beheerder'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000280', true);

-- 36) member_not_found
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002ff', 'x@test.local') $$,
  'P0001', 'member_not_found',
  'update_member_email rejects a member id that does not exist'
);

-- 37) invalid_email
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'niet-een-email') $$,
  'P0001', 'invalid_email',
  'update_member_email rejects a value that does not match the minimal email format'
);

-- 38) happy path: nieuw e-mailadres zetten (null -> waarde).
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'gewijzigd@test.local') $$,
  'update_member_email succeeds in setting a new email on a member that had none'
);

select is(
  (select email from members where id = '00000000-0000-0000-0000-0000000002a5'),
  'gewijzigd@test.local',
  'the member email is updated to the new value'
);

-- 39) happy path: bestaand e-mailadres wissen naar null (leeg veld).
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a6', '') $$,
  'update_member_email succeeds in wiping an existing email back to null'
);

select is(
  (select email from members where id = '00000000-0000-0000-0000-0000000002a6'),
  null,
  'the member email is null after being wiped'
);

-- 40) randgeval: een gearchiveerd lid blijft e-mailadres-bewerkbaar (spec →
-- Randgevallen: geen "not archived"-eis, zelfde redenering als
-- update_member_name op een gearchiveerd lid).
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a7', 'archief@test.local') $$,
  'update_member_email succeeds even when the target member is archived'
);

select is(
  (select email from members where id = '00000000-0000-0000-0000-0000000002a7'),
  'archief@test.local',
  'the archived member''s email is updated'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a7'),
  true,
  'the member stays archived after its email was updated'
);

select * from finish();
rollback;
