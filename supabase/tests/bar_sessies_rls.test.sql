-- RLS en tabelrechten van de nieuwe tabellen uit 0027 (docs/features/
-- dienst-per-sessie.md → Datamodel, ADR 0016): bar_sessions, shift_sessions,
-- admin_notifications (lezen alleen voor bar-rollen, meldingen alleen voor
-- een beheerder, schrijven nooit), en bar_devices, bar_device_members,
-- pin_failures (helemaal niet leesbaar of schrijfbaar voor een API-rol). Voor
-- elke policy een negatieve test (`check:rls`).
--
-- Plus de constraints die de invarianten in de database vastleggen: één
-- actieve koppeling per sessie, één open melding per dienst, consistente
-- einde-kolommen. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(43);

-- ── Fixtures (als superuser) ──────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-00000000d010', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-bar@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-admin@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000d012', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-lid@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  -- Geen members-rij: het device-account.
  ('00000000-0000-0000-0000-00000000d013', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-device@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000d014', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-archived@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-00000000d020', 'RLS Bardienst', 'bardienst', null, 0, false, '00000000-0000-0000-0000-00000000d010'),
  ('00000000-0000-0000-0000-00000000d021', 'RLS Beheerder', 'beheerder', null, 0, false, '00000000-0000-0000-0000-00000000d011'),
  ('00000000-0000-0000-0000-00000000d022', 'RLS Lid',       'lid',       null, 0, false, '00000000-0000-0000-0000-00000000d012'),
  ('00000000-0000-0000-0000-00000000d023', 'RLS Gearchiveerd', 'bardienst', null, 0, true, '00000000-0000-0000-0000-00000000d014');

update shifts set ended_at = now() where ended_at is null;
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-00000000d030', '00000000-0000-0000-0000-00000000d020');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-00000000d030', '00000000-0000-0000-0000-00000000d020');

insert into bar_devices (id, token_hash) values
  ('00000000-0000-0000-0000-00000000d040', 'rls-device-hash');
insert into bar_device_members (device_id, member_id, password_login_at) values
  ('00000000-0000-0000-0000-00000000d040', '00000000-0000-0000-0000-00000000d020', now());
insert into pin_failures (member_id, failed_count) values
  ('00000000-0000-0000-0000-00000000d020', 2);

insert into bar_sessions (id, auth_session_id, member_id, mode, device_id) values
  ('00000000-0000-0000-0000-00000000d050', '00000000-0000-0000-0000-00000000d050',
   '00000000-0000-0000-0000-00000000d020', 'bar', '00000000-0000-0000-0000-00000000d040');
insert into shift_sessions (shift_id, bar_session_id) values
  ('00000000-0000-0000-0000-00000000d030', '00000000-0000-0000-0000-00000000d050');
insert into admin_notifications (id, kind, reason, shift_id, bar_session_id) values
  ('00000000-0000-0000-0000-00000000d060', 'dienst_zonder_sessie', 'inactief',
   '00000000-0000-0000-0000-00000000d030', '00000000-0000-0000-0000-00000000d050');

-- ── Lezen: bar-rollen zien sessies en koppelingen ─────────────────────────

-- Een levende Auth-sessie per account (id = het auth-id): elke leespolicy
-- en de guardvrije RPC's eisen haar (0041, ADR 0022).
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000d010', '00000000-0000-0000-0000-00000000d010', now(), now()),
  ('00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-00000000d011', now(), now()),
  ('00000000-0000-0000-0000-00000000d012', '00000000-0000-0000-0000-00000000d012', now(), now()),
  ('00000000-0000-0000-0000-00000000d013', '00000000-0000-0000-0000-00000000d013', now(), now()),
  ('00000000-0000-0000-0000-00000000d014', '00000000-0000-0000-0000-00000000d014', now(), now());

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d010","session_id":"00000000-0000-0000-0000-00000000d010"}', true);
set local role authenticated;

select is(
  (select count(*)::int from bar_sessions where id = '00000000-0000-0000-0000-00000000d050'),
  1,
  'een bardienst leest bar_sessions'
);
select is(
  (select count(*)::int from shift_sessions where bar_session_id = '00000000-0000-0000-0000-00000000d050'),
  1,
  'een bardienst leest shift_sessions'
);
select is(
  (select count(*)::int from admin_notifications),
  0,
  'een bardienst leest geen admin_notifications (alleen een beheerder)'
);

-- ── Lezen: een beheerder ziet ook de meldingen ────────────────────────────

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d011","session_id":"00000000-0000-0000-0000-00000000d011"}', true);
set local role authenticated;

select is(
  (select count(*)::int from bar_sessions where id = '00000000-0000-0000-0000-00000000d050'),
  1,
  'een beheerder leest bar_sessions'
);
select is(
  (select count(*)::int from admin_notifications where id = '00000000-0000-0000-0000-00000000d060'),
  1,
  'een beheerder leest admin_notifications'
);

-- ── Lezen: een lid ziet niets ─────────────────────────────────────────────

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d012","session_id":"00000000-0000-0000-0000-00000000d012"}', true);
set local role authenticated;

select is((select count(*)::int from bar_sessions), 0, 'een lid leest geen bar_sessions');
select is((select count(*)::int from shift_sessions), 0, 'een lid leest geen shift_sessions');
select is((select count(*)::int from admin_notifications), 0, 'een lid leest geen admin_notifications');

-- ── Lezen: een sessie zonder lid (het device-account) ziet niets ─────────

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d013","session_id":"00000000-0000-0000-0000-00000000d013"}', true);
set local role authenticated;

select is((select count(*)::int from bar_sessions), 0, 'een account zonder lid leest geen bar_sessions');
select is((select count(*)::int from shift_sessions), 0, 'een account zonder lid leest geen shift_sessions');
select is((select count(*)::int from admin_notifications), 0, 'een account zonder lid leest geen admin_notifications');

-- ── Lezen: een gearchiveerd lid ziet niets ────────────────────────────────

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d014","session_id":"00000000-0000-0000-0000-00000000d014"}', true);
set local role authenticated;

select is((select count(*)::int from bar_sessions), 0, 'een gearchiveerd lid leest geen bar_sessions');
select is((select count(*)::int from shift_sessions), 0, 'een gearchiveerd lid leest geen shift_sessions');

-- ── Lezen: anon ziet niets (geen recht) ───────────────────────────────────

reset role;
set local role anon;

select throws_ok($$ select * from bar_sessions $$, '42501', null, 'anon leest geen bar_sessions');
select throws_ok($$ select * from shift_sessions $$, '42501', null, 'anon leest geen shift_sessions');
select throws_ok($$ select * from admin_notifications $$, '42501', null, 'anon leest geen admin_notifications');
select throws_ok($$ select * from bar_devices $$, '42501', null, 'anon leest geen bar_devices');

reset role;

-- ── Schrijven: nooit, voor geen API-rol, ook niet voor een beheerder ─────

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d011","session_id":"00000000-0000-0000-0000-00000000d011"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into bar_sessions (auth_session_id, member_id, mode)
       values (gen_random_uuid(), '00000000-0000-0000-0000-00000000d021', 'beheer') $$,
  '42501', null, 'een beheerder kan zichzelf niet rechtstreeks als bar-sessie registreren'
);
select throws_ok(
  $$ update bar_sessions set last_activity_at = now() $$,
  '42501', null, 'bar_sessions is niet te updaten (de hartslag loopt via een RPC)'
);
select throws_ok(
  $$ delete from bar_sessions $$,
  '42501', null, 'bar_sessions is niet te verwijderen'
);
select throws_ok(
  $$ insert into shift_sessions (shift_id, bar_session_id)
       values ('00000000-0000-0000-0000-00000000d030', '00000000-0000-0000-0000-00000000d050') $$,
  '42501', null, 'shift_sessions is niet rechtstreeks te schrijven (koppelen loopt via een RPC)'
);
select throws_ok(
  $$ update shift_sessions set left_at = now(), left_reason = 'uitgelogd' $$,
  '42501', null, 'shift_sessions is niet te updaten'
);
select throws_ok(
  $$ delete from shift_sessions $$,
  '42501', null, 'shift_sessions is niet te verwijderen'
);
select throws_ok(
  $$ update admin_notifications set resolved_at = now() $$,
  '42501', null, 'een beheerder lost een melding niet rechtstreeks op (dat doet overnemen of afsluiten)'
);
select throws_ok(
  $$ insert into admin_notifications (kind, reason, shift_id)
       values ('dienst_zonder_sessie', 'inactief', '00000000-0000-0000-0000-00000000d030') $$,
  '42501', null, 'admin_notifications is niet rechtstreeks te schrijven'
);

-- ── De PIN-tabellen: geen enkele toegang voor een API-rol ────────────────

select throws_ok($$ select * from bar_devices $$, '42501', null, 'authenticated leest geen bar_devices');
select throws_ok($$ select * from bar_device_members $$, '42501', null, 'authenticated leest geen bar_device_members');
select throws_ok($$ select * from pin_failures $$, '42501', null, 'authenticated leest geen pin_failures');
select throws_ok(
  $$ update pin_failures set failed_count = 0, locked_at = null $$,
  '42501', null, 'authenticated kan de PIN-lockout niet opheffen'
);
select throws_ok(
  $$ insert into bar_device_members (device_id, member_id, password_login_at)
       values ('00000000-0000-0000-0000-00000000d040', '00000000-0000-0000-0000-00000000d021', now()) $$,
  '42501', null, 'authenticated kan geen apparaat als vertrouwd voor een lid registreren'
);
select throws_ok(
  $$ insert into bar_devices (token_hash) values ('zelfgemaakt') $$,
  '42501', null, 'authenticated kan geen apparaat aanmaken'
);

reset role;

-- ── De boekingskolommen zijn geen clientparameter ─────────────────────────
-- (geld beweegt alleen via RPC; de tabellen zijn al REVOKEd — zie
-- rls_write_protection.test.sql. Hier alleen dat de kolommen bestaan.)

select ok(
  (select count(*) = 4 from information_schema.columns
     where table_schema = 'public'
       and ((table_name = 'orders' and column_name = 'bar_session_id')
         or (table_name = 'top_ups' and column_name = 'bar_session_id')
         or (table_name = 'order_reversals' and column_name = 'bar_session_id')
         or (table_name = 'shifts' and column_name = 'started_session_id'))),
  'orders, top_ups, order_reversals en shifts hebben hun sessiekolom'
);

-- ── Invarianten in de database ────────────────────────────────────────────

-- Een sessie werkt in hooguit één dienst tegelijk, in elke stand.
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-00000000d031', '00000000-0000-0000-0000-00000000d020');
select throws_ok(
  $$ insert into shift_sessions (shift_id, bar_session_id)
       values ('00000000-0000-0000-0000-00000000d031', '00000000-0000-0000-0000-00000000d050') $$,
  '23505', null,
  'een sessie kan niet aan twee diensten tegelijk gekoppeld zijn (partiële unique index)'
);

-- Eén open melding per dienst.
select throws_ok(
  $$ insert into admin_notifications (kind, reason, shift_id)
       values ('dienst_zonder_sessie', 'uitgelogd', '00000000-0000-0000-0000-00000000d030') $$,
  '23505', null,
  'er is hooguit één openstaande melding per dienst'
);

-- Einde-kolommen zijn consistent.
select throws_ok(
  $$ update bar_sessions set ended_at = now() where id = '00000000-0000-0000-0000-00000000d050' $$,
  '23514', null,
  'een sessie kan niet beëindigd zijn zonder reden'
);
select throws_ok(
  $$ update bar_sessions set ended_by = '00000000-0000-0000-0000-00000000d021'
       where id = '00000000-0000-0000-0000-00000000d050' $$,
  '23514', null,
  'ended_by hoort alleen bij afgemeld'
);
select throws_ok(
  $$ insert into bar_sessions (auth_session_id, member_id, mode)
       values (gen_random_uuid(), '00000000-0000-0000-0000-00000000d020', 'kassa') $$,
  '23514', null,
  'de modus is bar of beheer'
);
select throws_ok(
  $$ insert into bar_sessions (auth_session_id, member_id, mode)
       values ('00000000-0000-0000-0000-00000000d050', '00000000-0000-0000-0000-00000000d020', 'bar') $$,
  '23505', null,
  'auth_session_id is uniek'
);

-- ── Aanvullend: anon en een gearchiveerde beheerder ───────────────────────

set local role anon;
select throws_ok($$ select * from bar_device_members $$, '42501', null, 'anon leest geen bar_device_members');
select throws_ok($$ select * from pin_failures $$, '42501', null, 'anon leest geen pin_failures');
reset role;

-- Een beheerder die gearchiveerd is, verliest ook het lezen van de meldingen
-- en de sessies (de policy eist `not archived`, niet alleen de rol).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-00000000d015', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'rls-admin-archived@test.local', crypt('x', gen_salt('bf')), now(),
  now(), now(), '{"provider":"email","providers":["email"]}', '{}'
);
insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-00000000d024', 'RLS Beheerder Gearchiveerd', 'beheerder', null, 0, true,
   '00000000-0000-0000-0000-00000000d015');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000d015', '00000000-0000-0000-0000-00000000d015', now(), now());

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d015","session_id":"00000000-0000-0000-0000-00000000d015"}', true);
set local role authenticated;
select is((select count(*)::int from admin_notifications), 0, 'een gearchiveerde beheerder leest geen admin_notifications');
select is((select count(*)::int from bar_sessions), 0, 'een gearchiveerde beheerder leest geen bar_sessions');
select is((select count(*)::int from shift_sessions), 0, 'een gearchiveerde beheerder leest geen shift_sessions');
reset role;

select * from finish();
rollback;
