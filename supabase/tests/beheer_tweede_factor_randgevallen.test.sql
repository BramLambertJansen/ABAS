-- Randgevallen bij "beheer eist een tweede factor" (0034, ADR 0017,
-- docs/features/beheer-tweede-factor.md), aanvullend op
-- beheer_tweede_factor.test.sql en ronde 7 van beheer_rpcs_modus.test.sql.
-- De vraag hier: komt een beheerder zonder aal2 via een andere weg toch bij
-- beheer, en weigert elke weigering om de goede reden. Wat hier vastligt:
--
--   * aal2 alleen is geen beheer: een portal-sessie (geen bar_sessions-rij)
--     met aal2 krijgt `no_bar_session` bij elke beheer-RPC;
--   * een beheersessie zonder aal-claim, of met aal1, krijgt
--     `aal2_required`, en de weigering zet geen hartslag;
--   * register_bar_session('beheer') telt alleen een geverifieerde TOTP-factor
--     van het eigen account (niet: unverified met aal2, een andere
--     factorsoort, de factor van een ander account); de rolcontrole gaat voor
--     de factorcontrole;
--   * pin_needs_mfa: een geblokkeerde PIN blijft `pin_locked`, een
--     niet-afgemaakte factor telt niet, en de weigering verlengt het
--     PIN-vertrouwen niet; zonder vertrouwen of zonder PIN lekt de vlag niet;
--   * resumable is false voor een beheerder met alleen een niet-afgemaakte
--     factor;
--   * het einde van een bar-sessie haalt alleen de eigen auth.sessions-rij
--     weg (een portal-sessie van hetzelfde account blijft), ook bij
--     archiveren (`geen_bar_rol`).
--
-- Eigen, vaste id's (…f3…): geen andere suite gebruikt ze. Run met
-- `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(29);

-- ── Fixtures ──────────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, crypt('x', gen_salt('bf', 4)), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}'
from (values
  ('00000000-0000-0000-0000-0000000f3a01'::uuid, 'tfr-factor@test.local'),
  ('00000000-0000-0000-0000-0000000f3a02'::uuid, 'tfr-onaf@test.local'),
  ('00000000-0000-0000-0000-0000000f3a03'::uuid, 'tfr-telefoon@test.local'),
  ('00000000-0000-0000-0000-0000000f3a04'::uuid, 'tfr-bardienst-factor@test.local'),
  ('00000000-0000-0000-0000-0000000f3a05'::uuid, 'tfr-zonder@test.local'),
  ('00000000-0000-0000-0000-0000000f3a06'::uuid, 'tfr-bardienst@test.local')
) as u(id, email);

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  -- Beheerder met geverifieerde TOTP-factor.
  ('00000000-0000-0000-0000-0000000f3b01', 'TFR Beheerder factor', 'beheerder',
   null, 0, false, '00000000-0000-0000-0000-0000000f3a01'),
  -- Beheerder met alleen een niet-afgemaakte factor, met PIN.
  ('00000000-0000-0000-0000-0000000f3b02', 'TFR Beheerder onaf', 'beheerder',
   crypt('1212', gen_salt('bf', 4)), 0, false, '00000000-0000-0000-0000-0000000f3a02'),
  -- Beheerder met alleen een (geverifieerde) factor van een andere soort.
  ('00000000-0000-0000-0000-0000000f3b03', 'TFR Beheerder telefoon', 'beheerder',
   null, 0, false, '00000000-0000-0000-0000-0000000f3a03'),
  -- Bardienst met een geverifieerde factor.
  ('00000000-0000-0000-0000-0000000f3b04', 'TFR Bardienst factor', 'bardienst',
   null, 0, false, '00000000-0000-0000-0000-0000000f3a04'),
  -- Beheerder zonder factor, met PIN.
  ('00000000-0000-0000-0000-0000000f3b05', 'TFR Beheerder zonder', 'beheerder',
   crypt('3434', gen_salt('bf', 4)), 0, false, '00000000-0000-0000-0000-0000000f3a05'),
  -- Bardienst zonder factor (voor archiveren).
  ('00000000-0000-0000-0000-0000000f3b06', 'TFR Bardienst', 'bardienst',
   null, 0, false, '00000000-0000-0000-0000-0000000f3a06');

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, phone)
values
  ('00000000-0000-0000-0000-0000000f3c01', '00000000-0000-0000-0000-0000000f3a01', null,
   'totp', 'verified', now(), now(), 'TFRSECRET1', null),
  ('00000000-0000-0000-0000-0000000f3c02', '00000000-0000-0000-0000-0000000f3a02', null,
   'totp', 'unverified', now(), now(), 'TFRSECRET2', null),
  ('00000000-0000-0000-0000-0000000f3c03', '00000000-0000-0000-0000-0000000f3a03', null,
   'phone', 'verified', now(), now(), null, '+31600000000'),
  ('00000000-0000-0000-0000-0000000f3c04', '00000000-0000-0000-0000-0000000f3a04', null,
   'totp', 'verified', now(), now(), 'TFRSECRET4', null);

-- Een vertrouwd apparaat voor de twee PIN-beheerders.
insert into bar_devices (id, token_hash) values
  ('00000000-0000-0000-0000-0000000f3d01', 'tfr-device');
insert into bar_device_members (device_id, member_id, password_login_at, last_login_at) values
  ('00000000-0000-0000-0000-0000000f3d01', '00000000-0000-0000-0000-0000000f3b02',
   now() - interval '3 days', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000f3d01', '00000000-0000-0000-0000-0000000f3b05',
   now() - interval '3 days', now() - interval '3 days');
update bar_devices set last_seen_at = now() - interval '3 days'
  where id = '00000000-0000-0000-0000-0000000f3d01';

-- De beheersessie van de beheerder met factor (geregistreerd met aal2).
insert into bar_sessions (auth_session_id, member_id, mode, last_activity_at) values
  ('00000000-0000-0000-0000-0000000f3e01', '00000000-0000-0000-0000-0000000f3b01', 'beheer',
   now() - interval '5 minutes');

-- JWT-claims van een Auth-sessie; p_aal null = geen aal-claim.
create function pg_temp.claims(p_sub uuid, p_session uuid, p_aal text)
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', p_sub::text, 'session_id', p_session::text)
      || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text,
    true
  );
end;
$fn$;

-- ═══ aal2 alleen is geen beheer ══════════════════════════════════════════

-- Een portal-sessie (geen bar_sessions-rij) van de beheerder met factor, na
-- de code in de portal: aal2, maar geen beheersessie.
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a01', '00000000-0000-0000-0000-0000000f3e02', 'aal2');
select throws_ok(
  $$ select update_negative_limit(0) $$,
  'P0001', 'no_bar_session',
  'een portal-sessie met aal2 kan geen beheer-RPC aanroepen (no_bar_session)'
);
select throws_ok(
  $$ select * from list_members_admin() $$,
  'P0001', 'no_bar_session',
  'een portal-sessie met aal2 leest de ledenlijst van beheer niet (no_bar_session)'
);
select throws_ok(
  $$ select check_beheer_session() $$,
  'P0001', 'no_bar_session',
  'check_beheer_session weigert een portal-sessie met aal2 (no_bar_session): geen invite'
);

-- ═══ Een beheersessie zonder aal2 ════════════════════════════════════════

select pg_temp.claims('00000000-0000-0000-0000-0000000f3a01', '00000000-0000-0000-0000-0000000f3e01', null);
select throws_ok(
  $$ select update_negative_limit(0) $$,
  'P0001', 'aal2_required',
  'een beheersessie zonder aal-claim: beheer-RPC geweigerd (aal2_required)'
);
select throws_ok(
  $$ select check_beheer_session() $$,
  'P0001', 'aal2_required',
  'een beheersessie zonder aal-claim: check_beheer_session geweigerd (aal2_required)'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a01', '00000000-0000-0000-0000-0000000f3e01', '');
select throws_ok(
  $$ select update_negative_limit(0) $$,
  'P0001', 'aal2_required',
  'een beheersessie met een lege aal-claim: aal2_required'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a01', '00000000-0000-0000-0000-0000000f3e01', 'aal1');
select throws_ok(
  $$ select create_product('TFR product', 'bier', 100) $$,
  'P0001', 'aal2_required',
  'een beheersessie met aal1: create_product geweigerd (aal2_required)'
);
select is(
  (select count(*)::integer from products where name = 'TFR product'),
  0,
  'na aal2_required is er niets geschreven'
);
select is(
  (select last_activity_at from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000f3e01'),
  now() - interval '5 minutes',
  'een weigering met aal2_required zet geen hartslag'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a01', '00000000-0000-0000-0000-0000000f3e01', 'aal2');
select lives_ok(
  $$ select check_beheer_session() $$,
  'dezelfde beheersessie met aal2: check_beheer_session slaagt'
);

-- ═══ register_bar_session('beheer'): welke factor telt ═══════════════════

-- Auth-sessies voor de session_id's hieronder: register_bar_session eist een
-- rij in auth.sessions (0040, ADR 0020 → Beslissing 8), anders zou elke
-- aanroep `session_ended` geven en niet de factorcontrole testen.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000f3e03', '00000000-0000-0000-0000-0000000f3a02', now(), now()),
  ('00000000-0000-0000-0000-0000000f3e04', '00000000-0000-0000-0000-0000000f3a03', now(), now()),
  ('00000000-0000-0000-0000-0000000f3e05', '00000000-0000-0000-0000-0000000f3a05', now(), now()),
  ('00000000-0000-0000-0000-0000000f3e06', '00000000-0000-0000-0000-0000000f3a04', now(), now());

select pg_temp.claims('00000000-0000-0000-0000-0000000f3a02', '00000000-0000-0000-0000-0000000f3e03', 'aal2');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'mfa_not_enrolled',
  'alleen een niet-afgemaakte factor, ook met een aal2-claim: mfa_not_enrolled'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a03', '00000000-0000-0000-0000-0000000f3e04', 'aal2');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'mfa_not_enrolled',
  'alleen een geverifieerde factor van een andere soort (phone): mfa_not_enrolled'
);
-- De factor van een ander account telt niet: de beheerder zonder factor, in
-- een sessie terwijl de beheerder met factor die wel heeft.
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a05', '00000000-0000-0000-0000-0000000f3e05', 'aal2');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'mfa_not_enrolled',
  'de factor van een ander account telt niet: mfa_not_enrolled'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a04', '00000000-0000-0000-0000-0000000f3e06', 'aal2');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'no_admin_role',
  'een bardienst met factor en aal2 krijgt geen beheer (no_admin_role, de rol gaat voor de factor)'
);
select is(
  (select count(*)::integer from bar_sessions
    where auth_session_id in (
      '00000000-0000-0000-0000-0000000f3e03', '00000000-0000-0000-0000-0000000f3e04',
      '00000000-0000-0000-0000-0000000f3e05', '00000000-0000-0000-0000-0000000f3e06')),
  0,
  'geen van deze weigeringen legt een sessie vast'
);

-- ═══ pin_needs_mfa ═══════════════════════════════════════════════════════

select is(
  (select result_code from verify_bar_pin('tfr-device', '00000000-0000-0000-0000-0000000f3b02', '1212')),
  'pin_needs_mfa',
  'een beheerder met alleen een niet-afgemaakte factor: pin_needs_mfa'
);
select is(
  (select result_code from verify_bar_pin('tfr-device', '00000000-0000-0000-0000-0000000f3b05', '3434')),
  'pin_needs_mfa',
  'stap: een beheerder zonder factor met de juiste PIN: pin_needs_mfa'
);
select is(
  (select last_login_at from bar_device_members
    where device_id = '00000000-0000-0000-0000-0000000f3d01'
      and member_id = '00000000-0000-0000-0000-0000000f3b05'),
  now() - interval '3 days',
  'pin_needs_mfa verlengt het PIN-vertrouwen van dit lid niet'
);
select is(
  (select last_seen_at from bar_devices where id = '00000000-0000-0000-0000-0000000f3d01'),
  now() - interval '3 days',
  'pin_needs_mfa telt niet als login op het apparaat (last_seen_at ongewijzigd)'
);

-- Een geblokkeerde PIN blijft geblokkeerd: de lockout gaat voor pin_needs_mfa.
insert into pin_failures (member_id, failed_count, last_failed_at, locked_at)
values ('00000000-0000-0000-0000-0000000f3b05', 5, now(), now())
on conflict (member_id) do update set failed_count = 5, last_failed_at = now(), locked_at = now();
select is(
  (select result_code from verify_bar_pin('tfr-device', '00000000-0000-0000-0000-0000000f3b05', '3434')),
  'pin_locked',
  'een geblokkeerde beheerder zonder factor krijgt pin_locked, niet pin_needs_mfa'
);
select is(
  (select row(pin_available, pin_locked, pin_needs_mfa)::text
     from bar_login_options('tfr-device', '00000000-0000-0000-0000-0000000f3b05')),
  '(f,t,f)',
  'bar_login_options: geblokkeerd gaat voor pin_needs_mfa'
);
delete from pin_failures where member_id = '00000000-0000-0000-0000-0000000f3b05';

-- Zonder vertrouwen (meer dan 30 dagen) of zonder PIN lekt de vlag niet.
update bar_device_members set last_login_at = now() - interval '31 days'
  where device_id = '00000000-0000-0000-0000-0000000f3d01'
    and member_id = '00000000-0000-0000-0000-0000000f3b05';
select is(
  (select row(pin_available, pin_locked, pin_needs_mfa)::text
     from bar_login_options('tfr-device', '00000000-0000-0000-0000-0000000f3b05')),
  '(f,f,f)',
  'bar_login_options: vertrouwen verlopen → geen pin_needs_mfa (de rol lekt niet)'
);
update bar_device_members set last_login_at = now()
  where device_id = '00000000-0000-0000-0000-0000000f3d01'
    and member_id = '00000000-0000-0000-0000-0000000f3b05';
update members set pin_hash = null where id = '00000000-0000-0000-0000-0000000f3b05';
select is(
  (select row(pin_available, pin_locked, pin_needs_mfa)::text
     from bar_login_options('tfr-device', '00000000-0000-0000-0000-0000000f3b05')),
  '(f,f,f)',
  'bar_login_options: zonder PIN → geen pin_needs_mfa'
);

-- ═══ resumable ═══════════════════════════════════════════════════════════

insert into bar_sessions (auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000f3e07', '00000000-0000-0000-0000-0000000f3b02', 'bar');
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a02', '00000000-0000-0000-0000-0000000f3e07', 'aal1');
select is(
  (select (my_bar_state() -> 'session' ->> 'resumable')::boolean),
  false,
  'resumable is false voor de bar-sessie van een beheerder met alleen een niet-afgemaakte factor'
);

-- ═══ Einde bar-sessie: alleen de eigen auth.sessions-rij ═════════════════

-- De bardienst heeft een bar-sessie én een portal-sessie (geen bar_sessions-rij).
insert into bar_sessions (auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000f3e08', '00000000-0000-0000-0000-0000000f3b06', 'bar');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000f3e08', '00000000-0000-0000-0000-0000000f3a06', now(), now()),
  ('00000000-0000-0000-0000-0000000f3e09', '00000000-0000-0000-0000-0000000f3a06', now(), now()),
  ('00000000-0000-0000-0000-0000000f3e01', '00000000-0000-0000-0000-0000000f3a01', now(), now());

select pg_temp.claims('00000000-0000-0000-0000-0000000f3a06', '00000000-0000-0000-0000-0000000f3e08', 'aal1');
select lives_ok($$ select end_bar_session(false) $$, 'stap: de bardienst logt uit op de bar');
select is(
  (select array_agg(id order by id)::text from auth.sessions
    where user_id = '00000000-0000-0000-0000-0000000f3a06'),
  '{00000000-0000-0000-0000-0000000f3e09}',
  'uitloggen op de bar haalt alleen die Auth-sessie weg; de portal-sessie blijft'
);

-- Archiveren (geen_bar_rol): een nieuwe bar-sessie van hetzelfde lid.
insert into bar_sessions (auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000f3e10', '00000000-0000-0000-0000-0000000f3b06', 'bar');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000f3e10', '00000000-0000-0000-0000-0000000f3a06', now(), now());
select pg_temp.claims('00000000-0000-0000-0000-0000000f3a01', '00000000-0000-0000-0000-0000000f3e01', 'aal2');
select lives_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000f3b06', true) $$,
  'stap: de beheerder (aal2) archiveert de bardienst'
);
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000f3e10'),
  'geen_bar_rol',
  'archiveren: de bar-sessie is gesloten (geen_bar_rol)'
);
select is(
  (select array_agg(id order by id)::text from auth.sessions
    where user_id = '00000000-0000-0000-0000-0000000f3a06'),
  '{00000000-0000-0000-0000-0000000f3e09}',
  'archiveren: de Auth-sessie van de bar is weg, de portal-sessie blijft'
);

select * from finish();
rollback;
