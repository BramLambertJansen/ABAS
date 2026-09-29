-- Negatieve tests voor update_own_name (supabase/migrations/
-- 0026_eigen_naam_wijzigen.sql, docs/features/portal-profiel.md → Testplan,
-- issue #17, ADR 0012). Run met `npm run db:test` (= `supabase test db`,
-- vereist `supabase start` / Docker lokaal).
--
-- Fixture- en assertiestijl als set_own_pin.test.sql: auth.users-rijen als
-- minimale FK-doelen, auth.uid() gesimuleerd via request.jwt.claim.sub.
-- Foutcodes letterlijk uit 0026: actor_not_found, invalid_name.

create extension if not exists pgtap with schema extensions;

begin;
select plan(24);

-- ── Fixtures ──────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'uon-lid-a-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'uon-lid-b-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'uon-bardienst-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000213', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'uon-beheerder-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000214', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'uon-archived-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000215', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'uon-orphan-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');
-- (...215) heeft bewust geen members-rij: model voor de gedeelde
-- device-sessie en een ongekoppelde auth.users-rij.

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000220', 'UON Lid A',       'lid',       null,                          1234, false, '00000000-0000-0000-0000-000000000210'),
  ('00000000-0000-0000-0000-000000000221', 'UON Lid B',       'lid',       null,                          -500, false, '00000000-0000-0000-0000-000000000211'),
  ('00000000-0000-0000-0000-000000000222', 'UON Bardienst',   'bardienst', crypt('1111', gen_salt('bf')), 700,  false, '00000000-0000-0000-0000-000000000212'),
  ('00000000-0000-0000-0000-000000000223', 'UON Beheerder',   'beheerder', null,                          0,    false, '00000000-0000-0000-0000-000000000213'),
  ('00000000-0000-0000-0000-000000000224', 'UON Gearchiveerd', 'lid',      null,                          0,    true,  '00000000-0000-0000-0000-000000000214');

-- ── Grants en vorm ────────────────────────────────────────────────────

select is(
  has_function_privilege('anon', 'update_own_name(text)', 'EXECUTE'),
  false,
  'update_own_name is niet uitvoerbaar door anon'
);

select is(
  has_function_privilege('public', 'update_own_name(text)', 'EXECUTE'),
  false,
  'update_own_name is niet uitvoerbaar door PUBLIC'
);

-- 6) Precies één argument: geen doel-id, alleen de eigen rij.
select is(
  (select pronargs::integer from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_own_name'),
  1,
  'update_own_name heeft precies één argument (geen doel-id-parameter)'
);

-- ── 1) actor_not_found: geen gekoppelde members-rij ───────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000215', true);
select throws_ok(
  $$ select update_own_name('Iemand') $$,
  'P0001', 'actor_not_found',
  'update_own_name weigert een aanroeper zonder gekoppelde members-rij'
);

-- ── 2) actor_not_found: gearchiveerd lid, naam onveranderd ────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000214', true);
select throws_ok(
  $$ select update_own_name('Nieuwe Naam') $$,
  'P0001', 'actor_not_found',
  'update_own_name weigert een gearchiveerd lid'
);
select is(
  (select name from members where id = '00000000-0000-0000-0000-000000000224'),
  'UON Gearchiveerd',
  'de naam van het gearchiveerde lid is onveranderd'
);

-- ── 3) invalid_name: leeg, alleen spaties, null ───────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000210', true);
select throws_ok(
  $$ select update_own_name('') $$,
  'P0001', 'invalid_name',
  'update_own_name weigert een lege naam'
);
select throws_ok(
  $$ select update_own_name('   ') $$,
  'P0001', 'invalid_name',
  'update_own_name weigert een naam van alleen spaties'
);
select throws_ok(
  $$ select update_own_name(null) $$,
  'P0001', 'invalid_name',
  'update_own_name weigert null'
);
select is(
  (select name from members where id = '00000000-0000-0000-0000-000000000220'),
  'UON Lid A',
  'de naam blijft onveranderd na de geweigerde pogingen'
);

-- ── 4) + 5) Lid A wijzigt alleen de eigen naam ────────────────────────

create temp table uon_before as
  select id, name, role, balance_cents, archived, has_pin, auth_user_id
  from members
  where id in ('00000000-0000-0000-0000-000000000220', '00000000-0000-0000-0000-000000000221');

-- 7) positief voor lid, en getrimd.
select is(
  (select (update_own_name('  Anna  ')).name),
  'Anna',
  'een lid kan de eigen naam wijzigen, en de waarde wordt getrimd'
);
select is(
  (select name from members where id = '00000000-0000-0000-0000-000000000220'),
  'Anna',
  'de nieuwe, getrimde naam staat in de rij van de aanroeper'
);

-- 4) de rij van lid B is byte-voor-byte onveranderd.
select is(
  (select row(m.id, m.name, m.role, m.balance_cents, m.archived, m.has_pin, m.auth_user_id)::text
     from members m where m.id = '00000000-0000-0000-0000-000000000221'),
  (select row(b.id, b.name, b.role, b.balance_cents, b.archived, b.has_pin, b.auth_user_id)::text
     from uon_before b where b.id = '00000000-0000-0000-0000-000000000221'),
  'de rij van een ander lid is onveranderd (naam, rol, saldo, archief, has_pin, auth_user_id)'
);

-- 5) alleen `name` verandert bij de aanroeper.
select is(
  (select m.balance_cents from members m where m.id = '00000000-0000-0000-0000-000000000220'),
  (select b.balance_cents from uon_before b where b.id = '00000000-0000-0000-0000-000000000220'),
  'balance_cents van de aanroeper is onveranderd'
);
select is(
  (select m.role::text from members m where m.id = '00000000-0000-0000-0000-000000000220'),
  (select b.role::text from uon_before b where b.id = '00000000-0000-0000-0000-000000000220'),
  'role van de aanroeper is onveranderd'
);
select is(
  (select m.archived from members m where m.id = '00000000-0000-0000-0000-000000000220'),
  (select b.archived from uon_before b where b.id = '00000000-0000-0000-0000-000000000220'),
  'archived van de aanroeper is onveranderd'
);
select is(
  (select m.has_pin from members m where m.id = '00000000-0000-0000-0000-000000000220'),
  (select b.has_pin from uon_before b where b.id = '00000000-0000-0000-0000-000000000220'),
  'has_pin van de aanroeper is onveranderd'
);
select is(
  (select m.auth_user_id from members m where m.id = '00000000-0000-0000-0000-000000000220'),
  (select b.auth_user_id from uon_before b where b.id = '00000000-0000-0000-0000-000000000220'),
  'auth_user_id van de aanroeper is onveranderd'
);

-- ── 7) positief voor bardienst en beheerder ───────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000212', true);
select is(
  (select (update_own_name('Bart Dienst')).id),
  '00000000-0000-0000-0000-000000000222'::uuid,
  'een bardienst kan de eigen naam wijzigen en krijgt de eigen rij terug'
);
select is(
  (select name from members where id = '00000000-0000-0000-0000-000000000222'),
  'Bart Dienst',
  'de naam van de bardienst is bijgewerkt'
);

-- 8) de return scrubt pin_hash, ook als de aanroeper een PIN heeft.
select is(
  (select (update_own_name('Bart Dienst')).pin_hash),
  null,
  'update_own_name scrubt pin_hash in de return-rij'
);
select ok(
  (select crypt('1111', pin_hash) = pin_hash from members where id = '00000000-0000-0000-0000-000000000222'),
  'de opgeslagen pin_hash van de bardienst is onveranderd'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000213', true);
select lives_ok(
  $$ select update_own_name('Bea Heerder') $$,
  'een beheerder kan de eigen naam wijzigen'
);
select is(
  (select name from members where id = '00000000-0000-0000-0000-000000000223'),
  'Bea Heerder',
  'de naam van de beheerder is bijgewerkt'
);

select * from finish();
rollback;
