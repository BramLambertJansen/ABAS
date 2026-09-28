-- Negatieve tests voor 0023_bar_rpcs_weigeren_lid.sql (A2,
-- docs/features/bar-rpc-autorisatie.md): top_up, place_order en
-- reverse_order_at_bar weigeren een sessie die naar een lid met rol `lid`
-- herleidt, en werken ongewijzigd voor de gedeelde device-sessie en een
-- bardienst-sessie. Run met `npm run db:test`.
--
-- Draait als `authenticated` (niet als superuser), zelfde vorm als
-- rls_lid_eigen_rijen.test.sql: zo loopt de aanroep door dezelfde
-- EXECUTE-grant en dezelfde auth.uid() als een echte portal-sessie. Het
-- aanvalsscenario uit de analyse is letterlijk: een lid dat alleen leest wat
-- het mag lezen (eigen members.id, een open shift_id, een served_by uit
-- shift_members) en daarmee de RPC aanroept.

create extension if not exists pgtap with schema extensions;

begin;
select plan(20);

-- ── Fixtures (als superuser) ─────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000005a0', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bar-rpc-lid@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bar-rpc-bardienst@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  -- Geen members-rij: de gedeelde bar-tablet-device-sessie.
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bar-rpc-device@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-0000000005b0', 'Bar-RPC Lid',       'lid',       null, 1000, false, '00000000-0000-0000-0000-0000000005a0'),
  ('00000000-0000-0000-0000-0000000005b1', 'Bar-RPC Bardienst', 'bardienst', crypt('1234', gen_salt('bf')), 0, false, '00000000-0000-0000-0000-0000000005a1');

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000005c0', 'Bar-RPC Pils', 'Bier', 250, false);

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000005d0', '00000000-0000-0000-0000-0000000005b1');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000005d0', '00000000-0000-0000-0000-0000000005b1');

-- Een eigen bestelling van het lid, om terugdraaien op te proberen.
insert into orders (id, shift_id, member_id, served_by, total_cents) values
  ('00000000-0000-0000-0000-0000000005e0', '00000000-0000-0000-0000-0000000005d0',
   '00000000-0000-0000-0000-0000000005b0', '00000000-0000-0000-0000-0000000005b1', 250);
insert into order_lines (order_id, product_id, qty, unit_cents) values
  ('00000000-0000-0000-0000-0000000005e0', '00000000-0000-0000-0000-0000000005c0', 1, 250);

-- ── Lid-sessie: alles geweigerd ──────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a0', true);
set local role authenticated;

-- 1) Het bewezen scenario: zichzelf opwaarderen.
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       50000, 'cash',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_role',
  'top_up weigert een lid-sessie die zichzelf opwaardeert'
);

-- 2) De guard staat vóór de andere checks: een lid krijgt no_bar_role, niet
-- shift_not_open, dus leert niets over welke diensten bestaan.
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000005ff'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_role',
  'top_up geeft een lid no_bar_role, ook bij een niet-bestaande dienst'
);

-- 3) Bestellen.
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000005c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_role',
  'place_order weigert een lid-sessie'
);

-- 4) De eigen bestelling terugdraaien (geld terug naar het eigen saldo).
select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000005e0'::uuid,
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       'zelf terugdraaien',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_role',
  'reverse_order_at_bar weigert een lid-sessie'
);

-- 4b) Dienst afsluiten en bezetting wijzigen.
select throws_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000005d0'::uuid) $$,
  'P0001', 'no_bar_role',
  'end_shift weigert een lid-sessie'
);
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_role',
  'add_shift_member weigert een lid-sessie'
);
select throws_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_role',
  'remove_shift_member weigert een lid-sessie'
);

reset role;

-- 5–7) Niets is bewogen.
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-0000000005b0'),
  1000,
  'saldo van het lid is ongewijzigd na de geweigerde aanroepen'
);
select is(
  (select count(*)::int from top_ups where member_id = '00000000-0000-0000-0000-0000000005b0'),
  0,
  'geen top_ups-rij voor het lid'
);
select is(
  (select count(*)::int from order_reversals where order_id = '00000000-0000-0000-0000-0000000005e0'),
  0,
  'de bestelling van het lid is niet teruggedraaid'
);
select ok(
  (select ended_at is null from shifts where id = '00000000-0000-0000-0000-0000000005d0'),
  'de dienst staat nog open'
);
select is(
  (select count(*)::int from shift_members where shift_id = '00000000-0000-0000-0000-0000000005d0'),
  1,
  'de bezetting is ongewijzigd'
);

-- ── Device-sessie (geen members-rij): werkt als voorheen ─────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a2', true);
set local role authenticated;

-- 8)
select lives_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'top_up slaagt voor de device-sessie'
);

-- 9)
select lives_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000005c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'place_order slaagt voor de device-sessie'
);

-- 10)
select lives_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000005e0'::uuid,
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       'verkeerd lid getikt',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'reverse_order_at_bar slaagt voor de device-sessie'
);

reset role;

-- ── Bardienst-sessie (e-mail → Bar, ADR 0003): werkt als voorheen ────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a1', true);
set local role authenticated;

-- 11)
select lives_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'top_up slaagt voor een bardienst-sessie'
);

-- 12)
select lives_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000005c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'place_order slaagt voor een bardienst-sessie'
);

reset role;

-- ── Device-sessie: bezetting en afsluiten werken als voorheen ────────────
-- Als laatste, omdat dit de dienst afsluit waar de blokken hierboven op
-- draaien.

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a2', true);
set local role authenticated;

select lives_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'add_shift_member slaagt voor de device-sessie'
);
select lives_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'remove_shift_member slaagt voor de device-sessie'
);
select lives_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000005d0'::uuid) $$,
  'end_shift slaagt voor de device-sessie'
);

reset role;

select * from finish();
rollback;
