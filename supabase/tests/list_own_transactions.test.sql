-- Negative-test coverage for list_own_transactions()
-- (supabase/migrations/0023_portal_eigen_transacties.sql,
-- docs/features/portal-dashboard.md → RPC's, ADR 0010). Run with
-- `npm run db:test` (= `supabase test db`, vereist `supabase start` /
-- Docker lokaal).
--
-- Actorpatroon: dezelfde superuser + request.jwt.claim.sub-simulatie van
-- auth.uid() als reverse_order.test.sql/lid_account_koppelen.test.sql. De
-- toegangscontrole hier zit ín de RPC-body (`caller_member_id()`, zelf
-- SECURITY DEFINER, 0015), niet in een RLS-policy die voor de aanroepende
-- rol wordt geëvalueerd — dus geen `set local role authenticated` nodig
-- (dat is wél verplicht in rls_lid_eigen_rijen.test.sql/
-- rls_write_protection.test.sql, zie die bestanden voor waarom het daar wel
-- moet: RLS-policies worden voor een superuser niet geëvalueerd, maar
-- `caller_member_id()` draait zelf als SECURITY DEFINER en werkt ongeacht
-- de rol van de aanroeper).
--
-- Vier gevallen die de spec expliciet opsomt
-- (docs/features/portal-dashboard.md → RPC's, laatste bullet):
--   1. een lid-sessie ziet nooit een transactie van een ander lid;
--   2. een sessie zonder gekoppeld lid (device-sessie, of een
--      bardienst/beheerder-sessie zonder eigen lid-rij) krijgt een lege
--      set, geen fout;
--   3. een teruggedraaide bestelling komt terug met reversed = true en de
--      juiste reversal_reason/reversed_via/reversed_by_name;
--   4. een opwaardering heeft altijd reversed = false, nooit een
--      reversal-veld gevuld.
-- Plus, uit ADR 0010 → Rolzichtbaarheid ("een bardienst/beheerder-sessie
-- ... zou hooguit de eigen transacties als lid-van-de-vereniging
-- terugkrijgen, nooit die van een ander lid. Geen extra rolcheck nodig"):
-- dat is zelf ook een bewering die een test verdient, niet alleen een
-- ADR-zin — Blok 5 hieronder bewijst het met een echte bardienst-eigen
-- bestelling.

create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

-- ── Fixtures ──────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000fa0', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lot-lid-a@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000fa1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lot-lid-b@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  -- Niet door een members-rij gerefereerd: simuleert de gedeelde
  -- bar-tablet-device-sessie.
  ('00000000-0000-0000-0000-000000000fa2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lot-device@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  -- Ook niet door een members-rij gerefereerd: een ánder scenario dan het
  -- device-account hierboven (de spec noemt het apart), maar functioneel
  -- dezelfde caller_member_id() = null-situatie — een bardienst/beheerder-
  -- achtige sessie zonder eigen lid-rij.
  ('00000000-0000-0000-0000-000000000fa3', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lot-staff-orphan@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  -- Wél een members-rij (rol bardienst), met een eigen bestelling — Blok 5.
  ('00000000-0000-0000-0000-000000000fa4', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lot-staff@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000fb0', 'LOT Lid A',        'lid',       null, 1000, false, '00000000-0000-0000-0000-000000000fa0'),
  ('00000000-0000-0000-0000-000000000fb1', 'LOT Lid B',        'lid',       null, 2000, false, '00000000-0000-0000-0000-000000000fa1'),
  ('00000000-0000-0000-0000-000000000fb2', 'LOT Server',       'bardienst', null, 0,    false, null),
  ('00000000-0000-0000-0000-000000000fb3', 'LOT Admin',        'beheerder', null, 0,    false, null),
  ('00000000-0000-0000-0000-000000000fb4', 'LOT Eigen Staff',  'bardienst', null, 0,    false, '00000000-0000-0000-0000-000000000fa4');

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb2');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb2');

-- Lid A: drie bestellingen (één niet-teruggedraaid, één teruggedraaid via
-- bar, één teruggedraaid via beheer), verschillende created_at zodat
-- "nieuwste eerst" toetsbaar is.
insert into orders (id, shift_id, member_id, served_by, total_cents, created_at) values
  ('00000000-0000-0000-0000-000000000fd0', '00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb0', '00000000-0000-0000-0000-000000000fb2', 500, now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000fd1', '00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb0', '00000000-0000-0000-0000-000000000fb2', 300, now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-000000000fd2', '00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb0', '00000000-0000-0000-0000-000000000fb2', 700, now() - interval '40 minutes');

insert into order_reversals (order_id, reason, reversed_by, via, shift_id, refunded_cents) values
  ('00000000-0000-0000-0000-000000000fd1', 'verkeerd getikt',  '00000000-0000-0000-0000-000000000fb2', 'bar',    '00000000-0000-0000-0000-000000000fc0', 300),
  ('00000000-0000-0000-0000-000000000fd2', 'foutieve levering', '00000000-0000-0000-0000-000000000fb3', 'beheer', null,                                    700);

insert into top_ups (id, shift_id, member_id, amount_cents, method, served_by, created_at) values
  ('00000000-0000-0000-0000-000000000fd3', '00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb0', 1000, 'cash', '00000000-0000-0000-0000-000000000fb2', now() - interval '20 minutes');

-- Lid B: eigen bestelling + opwaardering — moeten voor lid A onzichtbaar
-- blijven, en lid A's rijen moeten voor lid B onzichtbaar blijven.
insert into orders (id, shift_id, member_id, served_by, total_cents, created_at) values
  ('00000000-0000-0000-0000-000000000fd4', '00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb1', '00000000-0000-0000-0000-000000000fb2', 999, now() - interval '5 minutes');
insert into top_ups (id, shift_id, member_id, amount_cents, method, served_by, created_at) values
  ('00000000-0000-0000-0000-000000000fd5', '00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb1', 2000, 'cash', '00000000-0000-0000-0000-000000000fb2', now() - interval '5 minutes');

-- LOT Eigen Staff: eigen bestelling, als lid-van-de-vereniging (Blok 5).
insert into orders (id, shift_id, member_id, served_by, total_cents, created_at) values
  ('00000000-0000-0000-0000-000000000fd6', '00000000-0000-0000-0000-000000000fc0', '00000000-0000-0000-0000-000000000fb4', '00000000-0000-0000-0000-000000000fb2', 250, now() - interval '5 minutes');

-- ── Blok 1: lid A ────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000fa0', true);

-- Volledigheid + volgorde in één bewering: precies de vier eigen rijen,
-- nieuwste eerst (created_at: fd0 > fd3 > fd1 > fd2).
select results_eq(
  $$ select id, kind from list_own_transactions() $$,
  $$ values
      ('00000000-0000-0000-0000-000000000fd0'::uuid, 'bestelling'::text),
      ('00000000-0000-0000-0000-000000000fd3'::uuid, 'opwaardering'::text),
      ('00000000-0000-0000-0000-000000000fd1'::uuid, 'bestelling'::text),
      ('00000000-0000-0000-0000-000000000fd2'::uuid, 'bestelling'::text) $$,
  'lid A ziet precies de vier eigen transacties, nieuwste eerst'
);

select is(
  (select count(*)::integer from list_own_transactions()),
  4,
  'lid A ziet geen rij meer of minder dan de eigen vier'
);

select is(
  (select count(*)::integer from list_own_transactions() where id = '00000000-0000-0000-0000-000000000fd4'),
  0,
  'lid A ziet nooit de bestelling van lid B'
);

select is(
  (select count(*)::integer from list_own_transactions() where id = '00000000-0000-0000-0000-000000000fd5'),
  0,
  'lid A ziet nooit de opwaardering van lid B'
);

-- Niet-teruggedraaide bestelling: reversed=false, method=null, geen enkel
-- reversal-veld gevuld.
select results_eq(
  $$ select kind, amount_cents, method, reversed, reversal_reason, reversed_via, reversed_by_name
       from list_own_transactions() where id = '00000000-0000-0000-0000-000000000fd0' $$,
  $$ values ('bestelling'::text, 500, null::text, false, null::text, null::text, null::text) $$,
  'een niet-teruggedraaide bestelling heeft reversed=false en geen reversal-velden'
);

-- Teruggedraaid via de bar: reversed=true met de juiste reason/via/naam.
select results_eq(
  $$ select kind, amount_cents, reversed, reversal_reason, reversed_via, reversed_by_name
       from list_own_transactions() where id = '00000000-0000-0000-0000-000000000fd1' $$,
  $$ values ('bestelling'::text, 300, true, 'verkeerd getikt'::text, 'bar'::text, 'LOT Server'::text) $$,
  'een via de bar teruggedraaide bestelling komt terug met reversed=true en de juiste reason/via/naam'
);

-- Teruggedraaid via beheer: zelfde, met een andere reversed_by.
select results_eq(
  $$ select kind, amount_cents, reversed, reversal_reason, reversed_via, reversed_by_name
       from list_own_transactions() where id = '00000000-0000-0000-0000-000000000fd2' $$,
  $$ values ('bestelling'::text, 700, true, 'foutieve levering'::text, 'beheer'::text, 'LOT Admin'::text) $$,
  'een via beheer teruggedraaide bestelling komt terug met reversed=true en de juiste reason/via/naam'
);

-- Opwaardering: altijd reversed=false, nooit een reversal-veld gevuld, wél
-- de method.
select results_eq(
  $$ select kind, amount_cents, method, reversed, reversal_reason, reversed_via, reversed_by_name
       from list_own_transactions() where id = '00000000-0000-0000-0000-000000000fd3' $$,
  $$ values ('opwaardering'::text, 1000, 'cash'::text, false, null::text, null::text, null::text) $$,
  'een opwaardering heeft altijd reversed=false en nooit een gevuld reversal-veld'
);

-- ── Blok 2: lid B — het spiegelbeeld van blok 1 ─────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000fa1', true);

select is(
  (select count(*)::integer from list_own_transactions()),
  2,
  'lid B ziet precies de eigen twee transacties'
);

select is(
  (select count(*)::integer from list_own_transactions() where id = '00000000-0000-0000-0000-000000000fd0'),
  0,
  'lid B ziet nooit een transactie van lid A'
);

-- ── Blok 3: gedeelde device-sessie (geen gekoppeld lid) ─────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000fa2', true);

select is(
  (select count(*)::integer from list_own_transactions()),
  0,
  'de gedeelde device-sessie (geen gekoppeld lid) krijgt een lege set'
);

select lives_ok(
  $$ select * from list_own_transactions() $$,
  'de device-sessie krijgt geen fout, alleen een stille lege resultset'
);

-- ── Blok 4: bardienst/beheerder-achtige sessie zonder eigen lid-rij ─────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000fa3', true);

select is(
  (select count(*)::integer from list_own_transactions()),
  0,
  'een sessie zonder eigen lid-rij krijgt ook een lege set, geen fout'
);

-- ── Blok 5 (ADR 0010 → Rolzichtbaarheid): bardienst mét eigen lid-rij ───
-- "zou hooguit de eigen transacties als lid-van-de-vereniging
-- terugkrijgen, nooit die van een ander lid" — dat is hier geen aanname
-- meer.

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000fa4', true);

select results_eq(
  $$ select id from list_own_transactions() $$,
  $$ values ('00000000-0000-0000-0000-000000000fd6'::uuid) $$,
  'een bardienst met een eigen lid-rij ziet precies de eigen bestelling, niet die van lid A of B'
);

select * from finish();
rollback;
