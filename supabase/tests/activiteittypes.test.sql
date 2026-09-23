-- pgTAP-dekking voor #18 (docs/features/activiteittypes.md):
-- create_activity_type/update_activity_type_name/set_activity_type_archived
-- (ADR 0002's auth.uid()-actorcheck, 1-op-1 gekopieerd van
-- assortimentbeheer.test.sql's create_product/update_product_price/
-- set_product_archived-dekking), plus de belt-and-braces REVOKE op
-- `activity_types`. De Developer-stap dekte alleen actor_not_found/
-- no_admin_role/happy path per RPC; de Tester-stap (dit bestand, sindsdien
-- uitgebreid) vult de volledige negatieve matrix aan die
-- assortimentbeheer.test.sql voor producten al had: dubbele
-- archiveer-idempotentie (test 18-20) en het "gearchiveerd blijft
-- hernoembaar"-randgeval (test 21-23), zie de bijbehorende commentaren
-- hieronder. start_shift's activity_type_not_found/activity_type_archived-
-- randgevallen staan in start_shift.test.sql (tests 8-9 daar), niet hier —
-- dat raakt start_shift zelf, niet deze drie RPC's.
--
-- RLS: de REVOKE-block onderaan dit bestand (insert/update/delete geblokkeerd
-- voor `authenticated`) is de enige negatieve RLS-dekking die dit repo voor
-- een lookup-tabel als deze kent — zelfde patroon als products'
-- (assortimentbeheer.test.sql) en members' (rls_write_protection.test.sql)
-- REVOKE-blokken. Er is bewust geen negatieve SELECT-test: de
-- activity_types_select-policy staat lezen toe aan élke authenticated-sessie
-- (single-tenant, spec → Rolzichtbaarheid → "Lezen"), dus er is geen
-- toegangsbeperking om als negatief geval te bewijzen — dat zou een
-- happy-path-test in vermomming zijn, geen negatieve.
--
-- Run met `npm run db:test` (= `supabase test db`, needs `supabase start` /
-- Docker locally). Niet lokaal tegen een echte Postgres gedraaid vanuit
-- deze sandbox — zelfde gedocumenteerde beperking als
-- assortimentbeheer.test.sql (geen Docker-daemon hier).

create extension if not exists pgtap with schema extensions;

begin;
select plan(26);

-- ── Fixtures ──────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'activiteittypes-admin-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'activiteittypes-staff-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'activiteittypes-orphan-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');
-- ...c2 is deliberately never referenced by any members row below —
-- simulates "auth.uid() matches no member at all" (actor_not_found).

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-0000000000d0', 'Activiteittypes Admin Fixture', 'beheerder', null, 0, false, '00000000-0000-0000-0000-0000000000c0'),
  ('00000000-0000-0000-0000-0000000000d1', 'Activiteittypes Staff Fixture', 'bardienst', null, 0, false, '00000000-0000-0000-0000-0000000000c1');

insert into activity_types (id, name, archived) values
  ('00000000-0000-0000-0000-0000000000e0', 'Test Kroegentocht', false);

-- ── create_activity_type ─────────────────────────────────────────────────

-- 1) actor_not_found
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select throws_ok(
  $$ select create_activity_type('Nieuw Type') $$,
  'P0001', 'actor_not_found',
  'create_activity_type rejects a caller whose auth.uid() matches no members row'
);

-- 2) no_admin_role
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select throws_ok(
  $$ select create_activity_type('Nieuw Type') $$,
  'P0001', 'no_admin_role',
  'create_activity_type rejects a caller whose role is bardienst, not beheerder'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c0', true);

-- 3) invalid_name
select throws_ok(
  $$ select create_activity_type('   ') $$,
  'P0001', 'invalid_name',
  'create_activity_type rejects a blank (whitespace-only) name'
);

-- 4-5) happy path
select lives_ok(
  $$ select create_activity_type('Test Repetitie') $$,
  'create_activity_type succeeds for a beheerder with a valid name'
);

select is(
  (select count(*)::int from activity_types
     where name = 'Test Repetitie' and archived = false),
  1,
  'the new activity type exists with the given name and archived=false'
);

-- ── update_activity_type_name ────────────────────────────────────────────

-- 6) actor_not_found
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select throws_ok(
  $$ select update_activity_type_name('00000000-0000-0000-0000-0000000000e0', 'Nieuwe Naam') $$,
  'P0001', 'actor_not_found',
  'update_activity_type_name rejects a caller whose auth.uid() matches no members row'
);

-- 7) no_admin_role
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select throws_ok(
  $$ select update_activity_type_name('00000000-0000-0000-0000-0000000000e0', 'Nieuwe Naam') $$,
  'P0001', 'no_admin_role',
  'update_activity_type_name rejects a caller whose role is bardienst, not beheerder'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c0', true);

-- 8) activity_type_not_found
select throws_ok(
  $$ select update_activity_type_name('00000000-0000-0000-0000-0000000000ff', 'Nieuwe Naam') $$,
  'P0001', 'activity_type_not_found',
  'update_activity_type_name rejects an activity type id that does not exist'
);

-- 9-10) happy path
select lives_ok(
  $$ select update_activity_type_name('00000000-0000-0000-0000-0000000000e0', 'Test Kroegentocht Hernoemd') $$,
  'update_activity_type_name succeeds for a beheerder with a valid new name'
);

select is(
  (select name from activity_types where id = '00000000-0000-0000-0000-0000000000e0'),
  'Test Kroegentocht Hernoemd',
  'the activity type name is updated to the new value'
);

-- ── set_activity_type_archived ───────────────────────────────────────────

-- 11) actor_not_found
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select throws_ok(
  $$ select set_activity_type_archived('00000000-0000-0000-0000-0000000000e0', true) $$,
  'P0001', 'actor_not_found',
  'set_activity_type_archived rejects a caller whose auth.uid() matches no members row'
);

-- 12) no_admin_role
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select throws_ok(
  $$ select set_activity_type_archived('00000000-0000-0000-0000-0000000000e0', true) $$,
  'P0001', 'no_admin_role',
  'set_activity_type_archived rejects a caller whose role is bardienst, not beheerder'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c0', true);

-- 13) activity_type_not_found
select throws_ok(
  $$ select set_activity_type_archived('00000000-0000-0000-0000-0000000000ff', true) $$,
  'P0001', 'activity_type_not_found',
  'set_activity_type_archived rejects an activity type id that does not exist'
);

-- 14-17) happy path: archive, then de-archive.
select lives_ok(
  $$ select set_activity_type_archived('00000000-0000-0000-0000-0000000000e0', true) $$,
  'set_activity_type_archived succeeds in archiving an active activity type'
);

select is(
  (select archived from activity_types where id = '00000000-0000-0000-0000-0000000000e0'),
  true,
  'the activity type is now archived'
);

select lives_ok(
  $$ select set_activity_type_archived('00000000-0000-0000-0000-0000000000e0', false) $$,
  'set_activity_type_archived succeeds in de-archiving the same activity type'
);

select is(
  (select archived from activity_types where id = '00000000-0000-0000-0000-0000000000e0'),
  false,
  'the activity type is no longer archived'
);

-- 18-20) idempotent: sending p_archived = true twice on an already-archived
-- activity type does not fail (spec → RPC's: "Client stuurt de expliciete
-- eindstaat, idempotent" — zelfde tolerantie als set_product_archived,
-- assortimentbeheer.test.sql test 21).
select lives_ok(
  $$ select set_activity_type_archived('00000000-0000-0000-0000-0000000000e0', true) $$,
  'set_activity_type_archived archives the fixture activity type (setup for the idempotence check below)'
);

select lives_ok(
  $$ select set_activity_type_archived('00000000-0000-0000-0000-0000000000e0', true) $$,
  'set_activity_type_archived on an already-archived activity type (p_archived=true again) does not fail'
);

select is(
  (select archived from activity_types where id = '00000000-0000-0000-0000-0000000000e0'),
  true,
  'the already-archived activity type stays archived after the idempotent call'
);

-- 21-23) randgeval: a gearchiveerd activiteittype blijft hernoembaar via
-- update_activity_type_name. De migratie-commentaar bij die RPC zegt dit
-- met zoveel woorden ("Geen eis dat het type niet gearchiveerd is — zelfde
-- redenering als update_product_price op een gearchiveerd product"), maar
-- dat commentaar is geen bewijs — deze test toetst het gedrag zelf i.p.v.
-- het aan te nemen (opdracht Tester, #18), inclusief dat hernoemen het
-- archived-veld niet als bijeffect terugzet.
select lives_ok(
  $$ select update_activity_type_name('00000000-0000-0000-0000-0000000000e0', 'Test Kroegentocht Gearchiveerd Hernoemd') $$,
  'update_activity_type_name succeeds even when the activity type is archived'
);

select is(
  (select name from activity_types where id = '00000000-0000-0000-0000-0000000000e0'),
  'Test Kroegentocht Gearchiveerd Hernoemd',
  'the archived activity type''s name is updated too'
);

select is(
  (select archived from activity_types where id = '00000000-0000-0000-0000-0000000000e0'),
  true,
  'renaming an archived activity type does not un-archive it as a side effect'
);

-- ── REVOKE op activity_types (belt-and-braces, spec → Datamodel) ────────
-- Zelfde patroon als assortimentbeheer.test.sql's products-blok.

set local role authenticated;

select throws_ok(
  $$ insert into activity_types (name) values ('x') $$,
  '42501',
  'permission denied for table activity_types',
  'insert on activity_types is blocked for authenticated'
);

select throws_ok(
  $$ update activity_types set archived = true where id = gen_random_uuid() $$,
  '42501',
  'permission denied for table activity_types',
  'update on activity_types is blocked for authenticated'
);

select throws_ok(
  $$ delete from activity_types where id = gen_random_uuid() $$,
  '42501',
  'permission denied for table activity_types',
  'delete on activity_types is blocked for authenticated'
);

select * from finish();
rollback;
