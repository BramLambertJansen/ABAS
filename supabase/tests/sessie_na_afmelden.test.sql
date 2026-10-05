-- Een token van een beëindigde sessie leest en schrijft niets meer
-- (docs/features/sessie-na-afmelden.md → Tests, ADR 0022, migratie 0041).
-- Run met `npm run db:test`.
--
-- "Dood" is hier: een `session_id`-claim zonder rij in auth.sessions (de
-- toestand na uitloggen, wachtwoordherstel, wachtwoordwijziging of
-- koppelen). Per rol (lid, bardienst, beheerder) een levende sessie
-- (`…41c…`, met rij) en een dode sessie-id (`…41d…`, zonder rij).
--
-- Leestoetsen draaien met `set local role authenticated`: RLS geldt niet
-- voor de superuser (rls_lid_eigen_rijen.test.sql → punt 1). Geen absolute
-- rij-aantallen voor de brede tak: de controle (blok 3) meet de
-- tabeltotalen als superuser, zoals rls_lid_eigen_rijen.test.sql.
--
--    1. caller_session_alive(): elke vorm van ontbrekende of verkeerde claim
--       is false, nooit een fout.
--    2. RLS, dode sessie: 0 rijen in de acht tabellen.
--    3. RLS, levende sessie: wat de rol zonder 0041 zag (de conjunctie
--       neemt niets weg).
--    4. Globale tabellen blijven open.
--    5. require_session: session_ended, niets geschreven, geen hartslag.
--    6. Volgorde van de guardcodes.
--    7-10. De guardvrije RPC's.
--   11. close_signed_out_bar_sessions(): de cron-job.
--   12. close_bar_session_internal: de mapping naar `uitgelogd`, en een
--       sluiting door de cron-job na een normale sluiting doet niets.

create extension if not exists pgtap with schema extensions;

begin;
select plan(93);

-- ── Helper ───────────────────────────────────────────────────────────────

-- Zet de claims zoals PostgREST ze uit het JWT haalt. `request.jwt.claim.sub`
-- leeg, zodat alleen `request.jwt.claims` telt.
create function pg_temp.als(p_claims jsonb)
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
end;
$fn$;

-- ── Fixtures (als superuser) ─────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values
    ('00000000-0000-0000-0000-0000000041a1', 'sna-lid@test.local'),
    ('00000000-0000-0000-0000-0000000041a2', 'sna-bardienst@test.local'),
    ('00000000-0000-0000-0000-0000000041a3', 'sna-beheerder@test.local'),
    ('00000000-0000-0000-0000-0000000041a4', 'sna-uitgenodigd@test.local'),
    ('00000000-0000-0000-0000-0000000041a5', 'sna-bardienst-cron@test.local'),
    ('00000000-0000-0000-0000-0000000041a6', 'sna-bardienst-levend@test.local')
  ) as v(id, email);

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id,
                     email, invited_at, invited_auth_user_id) values
  ('00000000-0000-0000-0000-0000000041b1', 'SNA Lid',        'lid',       null, 1000, false,
   '00000000-0000-0000-0000-0000000041a1', null, null, null),
  ('00000000-0000-0000-0000-0000000041b2', 'SNA Bardienst',  'bardienst', null, 0, false,
   '00000000-0000-0000-0000-0000000041a2', null, null, null),
  ('00000000-0000-0000-0000-0000000041b3', 'SNA Beheerder',  'beheerder', null, 0, false,
   '00000000-0000-0000-0000-0000000041a3', null, null, null),
  -- Uitgenodigd, nog niet gekoppeld (blok 10).
  ('00000000-0000-0000-0000-0000000041b4', 'SNA Uitgenodigd', 'lid',      null, 0, false,
   null, 'sna-uitgenodigd@test.local', now(), '00000000-0000-0000-0000-0000000041a4'),
  ('00000000-0000-0000-0000-0000000041b5', 'SNA Cron',       'bardienst', null, 0, false,
   '00000000-0000-0000-0000-0000000041a5', null, null, null),
  ('00000000-0000-0000-0000-0000000041b6', 'SNA Levend',     'bardienst', null, 0, false,
   '00000000-0000-0000-0000-0000000041a6', null, null, null);

-- De levende sessies. De dode (41d1 lid, 41d2 bardienst, 41d3 beheerder,
-- 41d4 uitgenodigd, en verder) hebben bewust geen rij.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000041c1', '00000000-0000-0000-0000-0000000041a1', now(), now()),
  ('00000000-0000-0000-0000-0000000041c2', '00000000-0000-0000-0000-0000000041a2', now(), now()),
  ('00000000-0000-0000-0000-0000000041c3', '00000000-0000-0000-0000-0000000041a3', now(), now()),
  ('00000000-0000-0000-0000-0000000041c4', '00000000-0000-0000-0000-0000000041a4', now(), now()),
  ('00000000-0000-0000-0000-0000000041c6', '00000000-0000-0000-0000-0000000041a6', now(), now());

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000041e0', 'SNA Pils', 'Bier', 250, false);

-- Eén open dienst (start_shift staat er maar één toe), met de bardienst in
-- de bezetting; een gesloten dienst met een openstaande melding.
update shifts set ended_at = now() where ended_at is null;
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041b2', null),
  ('00000000-0000-0000-0000-0000000041f1', '00000000-0000-0000-0000-0000000041b2', now());
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041b2'),
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041b5');

-- Een bestelling, opwaardering en terugdraaiing van het lid.
insert into orders (id, shift_id, member_id, served_by, total_cents) values
  ('00000000-0000-0000-0000-0000000041e1', '00000000-0000-0000-0000-0000000041f0',
   '00000000-0000-0000-0000-0000000041b1', '00000000-0000-0000-0000-0000000041b2', 250);
insert into order_lines (order_id, product_id, qty, unit_cents) values
  ('00000000-0000-0000-0000-0000000041e1', '00000000-0000-0000-0000-0000000041e0', 1, 250);
insert into order_reversals (order_id, reason, reversed_by, via, shift_id, refunded_cents) values
  ('00000000-0000-0000-0000-0000000041e1', 'sna test', '00000000-0000-0000-0000-0000000041b2',
   'bar', '00000000-0000-0000-0000-0000000041f0', 250);
insert into top_ups (shift_id, member_id, amount_cents, method, served_by) values
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041b1', 1000, 'cash',
   '00000000-0000-0000-0000-0000000041b2');

-- De bar-sessie van de bardienst op de tablet, waarvan de Auth-sessie (41d2)
-- elders beëindigd is, gekoppeld aan de open dienst. Hartslag vast, zodat
-- blok 5 kan zien dat een weigering hem niet zet.
insert into bar_sessions (id, auth_session_id, member_id, mode, last_activity_at) values
  ('00000000-0000-0000-0000-0000000041d2', '00000000-0000-0000-0000-0000000041d2',
   '00000000-0000-0000-0000-0000000041b2', 'bar', now() - interval '5 minutes');
insert into shift_sessions (shift_id, bar_session_id) values
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041d2');
-- De beheersessie van de beheerder, Auth-sessie (41d3) elders beëindigd.
insert into bar_sessions (id, auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000041d3', '00000000-0000-0000-0000-0000000041d3',
   '00000000-0000-0000-0000-0000000041b3', 'beheer');

insert into admin_notifications (id, kind, reason, shift_id, bar_session_id) values
  ('00000000-0000-0000-0000-0000000041f9', 'dienst_zonder_sessie', 'inactief',
   '00000000-0000-0000-0000-0000000041f1', '00000000-0000-0000-0000-0000000041d2');

-- Referentietotalen (superuser: RLS geldt niet), na alle fixtures voor
-- blok 2 en 3.
select set_config('sna.n_members',             (select count(*)::text from members), true);
select set_config('sna.n_orders',              (select count(*)::text from orders), true);
select set_config('sna.n_order_lines',         (select count(*)::text from order_lines), true);
select set_config('sna.n_top_ups',             (select count(*)::text from top_ups), true);
select set_config('sna.n_order_reversals',     (select count(*)::text from order_reversals), true);
select set_config('sna.n_bar_sessions',        (select count(*)::text from bar_sessions), true);
select set_config('sna.n_shift_sessions',      (select count(*)::text from shift_sessions), true);
select set_config('sna.n_admin_notifications', (select count(*)::text from admin_notifications), true);

-- ═══ 1. caller_session_alive() ═══════════════════════════════════════════

set local role authenticated;

select pg_temp.als(null);
select is(caller_session_alive(), false, 'helper: geen claims → false');

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1"}');
select is(caller_session_alive(), false, 'helper: claim zonder session_id → false');

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":""}');
select is(caller_session_alive(), false, 'helper: lege session_id → false');

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"geen-uuid"}');
select lives_ok($$ select caller_session_alive() $$, 'helper: session_id die geen uuid is → geen fout');
select is(caller_session_alive(), false, 'helper: session_id die geen uuid is → false');

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041d1"}');
select is(caller_session_alive(), false, 'helper: session_id zonder rij in auth.sessions → false');

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041c2"}');
select is(caller_session_alive(), false, 'helper: session_id van een rij van een ander account → false');

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041c1"}');
select is(caller_session_alive(), true, 'helper: levende sessie van dit account → true');

reset role;

-- ═══ 2. RLS, dode sessie: 0 rijen ════════════════════════════════════════

-- De bardienst, met het token van de tablet (41d2).
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041d2"}');
set local role authenticated;
select is((select count(*)::int from members),             0, 'bardienst, dode sessie: 0 rijen in members');
select is((select count(*)::int from orders),              0, 'bardienst, dode sessie: 0 rijen in orders');
select is((select count(*)::int from order_lines),         0, 'bardienst, dode sessie: 0 rijen in order_lines');
select is((select count(*)::int from top_ups),             0, 'bardienst, dode sessie: 0 rijen in top_ups');
select is((select count(*)::int from order_reversals),     0, 'bardienst, dode sessie: 0 rijen in order_reversals');
select is((select count(*)::int from bar_sessions),        0, 'bardienst, dode sessie: 0 rijen in bar_sessions');
select is((select count(*)::int from shift_sessions),      0, 'bardienst, dode sessie: 0 rijen in shift_sessions');
select is((select count(*)::int from admin_notifications), 0, 'bardienst, dode sessie: 0 rijen in admin_notifications');
reset role;

-- De beheerder (41d3).
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a3","session_id":"00000000-0000-0000-0000-0000000041d3"}');
set local role authenticated;
select is((select count(*)::int from members),             0, 'beheerder, dode sessie: 0 rijen in members');
select is((select count(*)::int from orders),              0, 'beheerder, dode sessie: 0 rijen in orders');
select is((select count(*)::int from order_lines),         0, 'beheerder, dode sessie: 0 rijen in order_lines');
select is((select count(*)::int from top_ups),             0, 'beheerder, dode sessie: 0 rijen in top_ups');
select is((select count(*)::int from order_reversals),     0, 'beheerder, dode sessie: 0 rijen in order_reversals');
select is((select count(*)::int from bar_sessions),        0, 'beheerder, dode sessie: 0 rijen in bar_sessions');
select is((select count(*)::int from shift_sessions),      0, 'beheerder, dode sessie: 0 rijen in shift_sessions');
select is((select count(*)::int from admin_notifications), 0, 'beheerder, dode sessie: 0 rijen in admin_notifications');
reset role;

-- Het lid (41d1): ook de eigen rijen niet.
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041d1"}');
set local role authenticated;
select is((select count(*)::int from members),         0, 'lid, dode sessie: ook de eigen members-rij niet');
select is((select count(*)::int from orders),          0, 'lid, dode sessie: ook de eigen orders niet');
select is((select count(*)::int from order_lines),     0, 'lid, dode sessie: ook de eigen order_lines niet');
select is((select count(*)::int from top_ups),         0, 'lid, dode sessie: ook de eigen top_ups niet');
select is((select count(*)::int from order_reversals), 0, 'lid, dode sessie: ook de eigen order_reversals niet');
reset role;

-- ═══ 3. RLS, levende sessie (controle) ═══════════════════════════════════

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041c2"}');
set local role authenticated;
select is((select count(*)::int from members),         current_setting('sna.n_members')::int,         'bardienst, levende sessie: alle members');
select is((select count(*)::int from orders),          current_setting('sna.n_orders')::int,          'bardienst, levende sessie: alle orders');
select is((select count(*)::int from order_lines),     current_setting('sna.n_order_lines')::int,     'bardienst, levende sessie: alle order_lines');
select is((select count(*)::int from top_ups),         current_setting('sna.n_top_ups')::int,         'bardienst, levende sessie: alle top_ups');
select is((select count(*)::int from order_reversals), current_setting('sna.n_order_reversals')::int, 'bardienst, levende sessie: alle order_reversals');
select is((select count(*)::int from bar_sessions),    current_setting('sna.n_bar_sessions')::int,    'bardienst, levende sessie: alle bar_sessions');
select is((select count(*)::int from shift_sessions),  current_setting('sna.n_shift_sessions')::int,  'bardienst, levende sessie: alle shift_sessions');
reset role;

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a3","session_id":"00000000-0000-0000-0000-0000000041c3"}');
set local role authenticated;
select is((select count(*)::int from members),             current_setting('sna.n_members')::int,             'beheerder, levende sessie: alle members');
select is((select count(*)::int from orders),              current_setting('sna.n_orders')::int,              'beheerder, levende sessie: alle orders');
select is((select count(*)::int from order_lines),         current_setting('sna.n_order_lines')::int,         'beheerder, levende sessie: alle order_lines');
select is((select count(*)::int from top_ups),             current_setting('sna.n_top_ups')::int,             'beheerder, levende sessie: alle top_ups');
select is((select count(*)::int from order_reversals),     current_setting('sna.n_order_reversals')::int,     'beheerder, levende sessie: alle order_reversals');
select is((select count(*)::int from bar_sessions),        current_setting('sna.n_bar_sessions')::int,        'beheerder, levende sessie: alle bar_sessions');
select is((select count(*)::int from shift_sessions),      current_setting('sna.n_shift_sessions')::int,      'beheerder, levende sessie: alle shift_sessions');
select is((select count(*)::int from admin_notifications), current_setting('sna.n_admin_notifications')::int, 'beheerder, levende sessie: alle admin_notifications');
reset role;

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041c1"}');
set local role authenticated;
select results_eq(
  $$ select id from members $$,
  $$ values ('00000000-0000-0000-0000-0000000041b1'::uuid) $$,
  'lid, levende sessie: precies de eigen members-rij'
);
select results_eq(
  $$ select id from orders $$,
  $$ values ('00000000-0000-0000-0000-0000000041e1'::uuid) $$,
  'lid, levende sessie: precies de eigen bestelling'
);
select results_eq(
  $$ select order_id from order_lines $$,
  $$ values ('00000000-0000-0000-0000-0000000041e1'::uuid) $$,
  'lid, levende sessie: precies de eigen bestelregel'
);
select results_eq(
  $$ select member_id from top_ups $$,
  $$ values ('00000000-0000-0000-0000-0000000041b1'::uuid) $$,
  'lid, levende sessie: precies de eigen opwaardering'
);
select results_eq(
  $$ select order_id from order_reversals $$,
  $$ values ('00000000-0000-0000-0000-0000000041e1'::uuid) $$,
  'lid, levende sessie: precies de eigen terugdraaiing'
);
reset role;

-- ═══ 4. Globale tabellen ═════════════════════════════════════════════════

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041d2"}');
set local role authenticated;
select ok((select count(*) from products) > 0, 'bardienst, dode sessie: products blijft leesbaar (globaal, keuze 3)');
reset role;

-- ═══ 5. require_session: session_ended ═══════════════════════════════════

select set_config('sna.balance_voor', (select balance_cents::text from members
  where id = '00000000-0000-0000-0000-0000000041b1'), true);
select set_config('sna.orders_voor', (select count(*)::text from orders), true);
select set_config('sna.hartslag_voor', (select last_activity_at::text from bar_sessions
  where id = '00000000-0000-0000-0000-0000000041d2'), true);

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041d2"}');
set local role authenticated;
select throws_ok($$ select touch_bar_session() $$, 'P0001', 'session_ended',
  'dode Auth-sessie, open bar-sessie: touch_bar_session → session_ended');
select throws_ok($$ select start_shift(null) $$, 'P0001', 'session_ended',
  'dode Auth-sessie: start_shift → session_ended');
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-0000000041f0'::uuid,
       '00000000-0000-0000-0000-0000000041b1'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000041e0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000041b2'::uuid) $$,
  'P0001', 'session_ended',
  'dode Auth-sessie: place_order → session_ended');
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-0000000041f0'::uuid,
       '00000000-0000-0000-0000-0000000041b1'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-0000000041b2'::uuid) $$,
  'P0001', 'session_ended',
  'dode Auth-sessie: top_up → session_ended');
reset role;

select is((select count(*)::text from orders), current_setting('sna.orders_voor'),
  '... geen bestelling geschreven');
select is((select balance_cents::text from members where id = '00000000-0000-0000-0000-0000000041b1'),
  current_setting('sna.balance_voor'),
  '... het saldo van het lid is ongewijzigd (geen bestelling, geen opwaardering)');

-- Beheer: een beheersessie met aal2, Auth-sessie dood.
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a3","session_id":"00000000-0000-0000-0000-0000000041d3","aal":"aal2"}');
set local role authenticated;
select throws_ok($$ select * from list_members_admin() $$, 'P0001', 'session_ended',
  'dode Auth-sessie, beheersessie met aal2: list_members_admin → session_ended');
reset role;

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041d2"}');
set local role authenticated;
select throws_ok($$ select end_bar_session(true) $$, 'P0001', 'session_ended',
  'dode Auth-sessie: end_bar_session(true) → session_ended');
reset role;
select is((select ended_at from shifts where id = '00000000-0000-0000-0000-0000000041f0'), null,
  '... de dienst is nog open');
select is((select last_activity_at::text from bar_sessions where id = '00000000-0000-0000-0000-0000000041d2'),
  current_setting('sna.hartslag_voor'),
  '... en geen enkele weigering zette de hartslag');

-- ═══ 6. Volgorde van de codes ════════════════════════════════════════════

-- Een al gesloten bar-sessie (41d6), Auth-sessie ook weg.
insert into bar_sessions (id, auth_session_id, member_id, mode, ended_at, end_reason) values
  ('00000000-0000-0000-0000-0000000041d6', '00000000-0000-0000-0000-0000000041d6',
   '00000000-0000-0000-0000-0000000041b2', 'bar', now() - interval '1 hour', 'uitgelogd');
-- Een inactieve bar-sessie met een levende Auth-sessie (41c2).
insert into bar_sessions (id, auth_session_id, member_id, mode, last_activity_at) values
  ('00000000-0000-0000-0000-0000000041c2', '00000000-0000-0000-0000-0000000041c2',
   '00000000-0000-0000-0000-0000000041b2', 'bar', now() - interval '61 minutes');

set local role authenticated;
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041d6"}');
select throws_ok($$ select touch_bar_session() $$, 'P0001', 'session_ended',
  'volgorde: dode Auth-sessie en een gesloten bar-sessie → session_ended');
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041d1"}');
select throws_ok($$ select touch_bar_session() $$, 'P0001', 'no_bar_session',
  'volgorde: dode Auth-sessie zonder bar-sessie → no_bar_session');
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041c2"}');
select throws_ok($$ select touch_bar_session() $$, 'P0001', 'session_inactive',
  'volgorde: levende Auth-sessie en een inactieve bar-sessie → session_inactive (ongewijzigd)');
reset role;

-- ═══ 7. update_own_name ══════════════════════════════════════════════════

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041d1"}');
set local role authenticated;
select throws_ok($$ select update_own_name('Overgenomen') $$, 'P0001', 'actor_not_found',
  'update_own_name met een dode sessie → actor_not_found');
reset role;
select is((select name from members where id = '00000000-0000-0000-0000-0000000041b1'), 'SNA Lid',
  '... de naam is ongewijzigd');

select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041c1"}');
set local role authenticated;
select lives_ok($$ select update_own_name('SNA Lid Nieuw') $$,
  'update_own_name met een levende sessie slaagt');
reset role;
select is((select name from members where id = '00000000-0000-0000-0000-0000000041b1'), 'SNA Lid Nieuw',
  '... en wijzigt de naam');

-- ═══ 8. list_own_transactions ════════════════════════════════════════════

set local role authenticated;
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041d1"}');
select is((select count(*)::int from list_own_transactions()), 0,
  'list_own_transactions met een dode sessie → 0 rijen');
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a1","session_id":"00000000-0000-0000-0000-0000000041c1"}');
select set_eq(
  $$ select id from list_own_transactions() where kind = 'bestelling' $$,
  $$ values ('00000000-0000-0000-0000-0000000041e1'::uuid) $$,
  'list_own_transactions met een levende sessie → de eigen bestelling (controle)'
);
reset role;

-- ═══ 9. my_bar_state ═════════════════════════════════════════════════════

set local role authenticated;
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041d2"}');
select is(my_bar_state(), '{"session": null}'::jsonb,
  'my_bar_state met een dode sessie en een open bar-sessie → {"session": null}, geen naam of rol');
reset role;
-- Een gesloten bar-sessie houdt haar sluitreden (keuze 5):
-- close_bar_session_internal verwijdert bij elke sluiting de Auth-sessie, de
-- tablet toont de reden. Geen dienstkoppeling: blok 11 en 12 blijven los.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000041db', '00000000-0000-0000-0000-0000000041a2', now(), now());
insert into bar_sessions (id, auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000041db', '00000000-0000-0000-0000-0000000041db',
   '00000000-0000-0000-0000-0000000041b2', 'bar');
select close_bar_session_internal('00000000-0000-0000-0000-0000000041db', 'afgemeld');
set local role authenticated;
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a2","session_id":"00000000-0000-0000-0000-0000000041db"}');
select is(my_bar_state() -> 'session' ->> 'status', 'ended',
  'my_bar_state met een dode sessie en een gesloten bar-sessie → status ended');
select is(my_bar_state() -> 'session' ->> 'end_reason', 'afgemeld',
  '... met de sluitreden (afgemeld)');
select ok(not (my_bar_state() ?| array['shift', 'other_shift', 'notifications']),
  '... en zonder shift, other_shift of notifications');
reset role;

-- ═══ 10. link_invited_member_account ═════════════════════════════════════

set local role authenticated;
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a4","session_id":"00000000-0000-0000-0000-0000000041d4","amr":[{"method":"otp","timestamp":0}]}');
select is((select link_invited_member_account() is null), true,
  'link_invited_member_account met mailbewijs maar een dode sessie → null');
reset role;
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000041b4'), null,
  '... het lid blijft ongekoppeld');
select ok(exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000041c4'),
  '... en de andere (levende) sessie van het account bestaat nog (stap 9 niet uitgevoerd)');

set local role authenticated;
select pg_temp.als('{"sub":"00000000-0000-0000-0000-0000000041a4","session_id":"00000000-0000-0000-0000-0000000041c4","amr":[{"method":"otp","timestamp":0}]}');
select is((select (link_invited_member_account()).auth_user_id), '00000000-0000-0000-0000-0000000041a4'::uuid,
  'controle: dezelfde aanroep met de levende sessie koppelt wel');
reset role;

-- ═══ 11. close_signed_out_bar_sessions() ═════════════════════════════════

-- De koppeling van 41d2 eerst netjes los, zodat 41d7 de laatste koppeling aan
-- de open dienst is; 41d2 en 41d3 sluiten als boekhouding (zelfde reden als
-- de cron-job, zonder melding: er is nog een koppeling).
update shift_sessions set left_at = now(), left_reason = 'uitgelogd'
 where bar_session_id = '00000000-0000-0000-0000-0000000041d2' and left_at is null;
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd'
 where id in ('00000000-0000-0000-0000-0000000041d2', '00000000-0000-0000-0000-0000000041d3');
update bar_sessions set last_activity_at = now()
 where id = '00000000-0000-0000-0000-0000000041c2';

-- 41d7: open, Auth-sessie weg, laatste koppeling aan de open dienst.
insert into bar_sessions (id, auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000041d7', '00000000-0000-0000-0000-0000000041d7',
   '00000000-0000-0000-0000-0000000041b5', 'bar');
insert into shift_sessions (shift_id, bar_session_id) values
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041d7');
-- 41c6: open, Auth-sessie levend.
insert into bar_sessions (id, auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000041c6', '00000000-0000-0000-0000-0000000041c6',
   '00000000-0000-0000-0000-0000000041b6', 'bar');

select set_config('sna.d6_ended_at', (select ended_at::text from bar_sessions
  where id = '00000000-0000-0000-0000-0000000041d6'), true);

select close_signed_out_bar_sessions();

select isnt((select ended_at from bar_sessions where id = '00000000-0000-0000-0000-0000000041d7'), null,
  'cron-job: de open bar-sessie zonder Auth-sessie is gesloten');
select is((select end_reason from bar_sessions where id = '00000000-0000-0000-0000-0000000041d7'),
  'elders_uitgelogd',
  '... met sluitreden elders_uitgelogd');
select is((select left_reason from shift_sessions where bar_session_id = '00000000-0000-0000-0000-0000000041d7'),
  'uitgelogd',
  '... de koppeling eindigt als uitgelogd');
select is(
  (select count(*)::int from admin_notifications
    where shift_id = '00000000-0000-0000-0000-0000000041f0' and resolved_at is null and reason = 'uitgelogd'),
  1,
  '... en de wees-dienst geeft één melding met reden uitgelogd');
select is((select ended_at from shifts where id = '00000000-0000-0000-0000-0000000041f0'), null,
  '... de dienst zelf blijft open');
select is((select ended_at from bar_sessions where id = '00000000-0000-0000-0000-0000000041c6'), null,
  'cron-job: een open bar-sessie mét Auth-sessie blijft ongemoeid');
select is(
  (select end_reason || ' ' || ended_at::text from bar_sessions where id = '00000000-0000-0000-0000-0000000041d6'),
  'uitgelogd ' || current_setting('sna.d6_ended_at'),
  'cron-job: een al gesloten bar-sessie zonder Auth-sessie blijft ongemoeid');

select set_config('sna.d7_ended_at', (select ended_at::text from bar_sessions
  where id = '00000000-0000-0000-0000-0000000041d7'), true);
select close_signed_out_bar_sessions();
select is(
  (select count(*)::int from admin_notifications where shift_id = '00000000-0000-0000-0000-0000000041f0'),
  1,
  'cron-job, tweede aanroep: geen tweede melding (idempotent)');
select is((select ended_at::text from bar_sessions where id = '00000000-0000-0000-0000-0000000041d7'),
  current_setting('sna.d7_ended_at'),
  'cron-job, tweede aanroep: de gesloten sessie wordt niet opnieuw gesloten');

select is(
  (select schedule from cron.job where jobname = 'close_signed_out_bar_sessions'),
  '* * * * *',
  'cron.job bevat close_signed_out_bar_sessions, elke minuut');

-- ═══ 12. close_bar_session_internal: mapping naar de koppelingsreden ═════

insert into bar_sessions (id, auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000041d8', '00000000-0000-0000-0000-0000000041d8',
   '00000000-0000-0000-0000-0000000041b2', 'bar'),
  ('00000000-0000-0000-0000-0000000041d9', '00000000-0000-0000-0000-0000000041d9',
   '00000000-0000-0000-0000-0000000041b2', 'bar'),
  ('00000000-0000-0000-0000-0000000041da', '00000000-0000-0000-0000-0000000041da',
   '00000000-0000-0000-0000-0000000041b2', 'bar');
insert into shift_sessions (shift_id, bar_session_id) values
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041d8'),
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041d9'),
  ('00000000-0000-0000-0000-0000000041f0', '00000000-0000-0000-0000-0000000041da');

select close_bar_session_internal('00000000-0000-0000-0000-0000000041d8', 'niet_hervat');
select close_bar_session_internal('00000000-0000-0000-0000-0000000041d9', 'elders_uitgelogd');
select close_bar_session_internal('00000000-0000-0000-0000-0000000041da', 'afgemeld');

select is((select left_reason from shift_sessions where bar_session_id = '00000000-0000-0000-0000-0000000041d8'),
  'uitgelogd', 'close_bar_session_internal: niet_hervat → koppeling uitgelogd (ongewijzigd)');
select is((select left_reason from shift_sessions where bar_session_id = '00000000-0000-0000-0000-0000000041d9'),
  'uitgelogd', 'close_bar_session_internal: elders_uitgelogd → koppeling uitgelogd');
select is((select left_reason from shift_sessions where bar_session_id = '00000000-0000-0000-0000-0000000041da'),
  'afgemeld', 'close_bar_session_internal: afgemeld → afgemeld (de mapping is niet te breed)');

-- Gelijktijdig met een normale sluiting: de cron-job las 41da nog als open,
-- maar end_bar_session/admin_end_bar_session sloot haar eerst. Dan roept de
-- job close_bar_session_internal aan op een al gesloten sessie; de
-- `ended_at is null`-voorwaarde daar (niet de filter in de job) houdt de
-- eerste sluiting intact. ended_at teruggezet, zodat een tweede sluiting
-- zichtbaar zou zijn (now() is binnen de transactie constant).
update bar_sessions set ended_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000000041da';
select set_config('sna.da_ended_at', (select ended_at::text from bar_sessions
  where id = '00000000-0000-0000-0000-0000000041da'), true);
select set_config('sna.n_meldingen_f0', (select count(*)::text from admin_notifications
  where shift_id = '00000000-0000-0000-0000-0000000041f0'), true);

select close_bar_session_internal('00000000-0000-0000-0000-0000000041da', 'elders_uitgelogd');

select is(
  (select end_reason || ' ' || ended_at::text from bar_sessions where id = '00000000-0000-0000-0000-0000000041da'),
  'afgemeld ' || current_setting('sna.da_ended_at'),
  'close_bar_session_internal na een normale sluiting: sluitreden en tijdstip blijven die van de eerste sluiting');
select is((select left_reason from shift_sessions where bar_session_id = '00000000-0000-0000-0000-0000000041da'),
  'afgemeld', '... de koppeling houdt haar reden');
select is(
  (select count(*)::text from admin_notifications where shift_id = '00000000-0000-0000-0000-0000000041f0'),
  current_setting('sna.n_meldingen_f0'),
  '... en er komt geen tweede beheerdermelding');

select * from finish();
rollback;
