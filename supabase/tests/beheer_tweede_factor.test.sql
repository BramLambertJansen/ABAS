-- Beheer eist een tweede factor (0034, docs/features/beheer-tweede-factor.md,
-- ADR 0017 → Beslissing 1 en 2). Wat hier vastligt:
--
--   * register_bar_session('beheer') weigert zonder geverifieerde factor
--     (`mfa_not_enrolled`, ook met alleen een niet-afgemaakte factor), weigert
--     met een factor en aal1 (`aal2_required`) en slaagt met aal2; modus `bar`
--     slaagt met aal1;
--   * verify_bar_pin geeft een beheerder zonder factor `pin_needs_mfa`, zonder
--     de foutteller op te hogen; met factor werkt de PIN; een bardienst merkt
--     niets;
--   * bar_login_options geeft de vlag `pin_needs_mfa`;
--   * my_bar_state().session.resumable voor beheer, voor de bar-sessie van
--     een beheerder zonder factor, en voor de rest;
--   * close_bar_session_internal verwijdert de auth.sessions-rij, voor elke
--     sluitreden (uitgelogd, niet_hervat, afgemeld, inactief, geen_bar_rol),
--     en een ontbrekende rij is geen fout;
--   * member_has_verified_factor is voor geen enkele API-rol uitvoerbaar.
--
-- Dat elke beheer-RPC aal1 weigert, staat in beheer_rpcs_modus.test.sql
-- (ronde 7). Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(46);

-- ── Fixtures ──────────────────────────────────────────────────────────────

-- Sessies en diensten van eerdere suites (e2e) mogen hier niets raken.
update shifts set ended_at = now() where ended_at is null;
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd' where ended_at is null;
update admin_notifications set resolved_at = now() where resolved_at is null;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, crypt('x', gen_salt('bf', 4)), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}'
from (values
  ('00000000-0000-0000-0000-0000000f2a01'::uuid, 'tf-met-factor@test.local'),
  ('00000000-0000-0000-0000-0000000f2a02'::uuid, 'tf-zonder-factor@test.local'),
  ('00000000-0000-0000-0000-0000000f2a03'::uuid, 'tf-bardienst@test.local'),
  ('00000000-0000-0000-0000-0000000f2a04'::uuid, 'tf-onaf@test.local')
) as u(id, email);

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-0000000f2b01', 'TF Beheerder met factor',    'beheerder',
   crypt('1357', gen_salt('bf', 4)), 0, false, '00000000-0000-0000-0000-0000000f2a01'),
  ('00000000-0000-0000-0000-0000000f2b02', 'TF Beheerder zonder factor', 'beheerder',
   crypt('2468', gen_salt('bf', 4)), 0, false, '00000000-0000-0000-0000-0000000f2a02'),
  ('00000000-0000-0000-0000-0000000f2b03', 'TF Bardienst',               'bardienst',
   crypt('3579', gen_salt('bf', 4)), 0, false, '00000000-0000-0000-0000-0000000f2a03'),
  ('00000000-0000-0000-0000-0000000f2b04', 'TF Beheerder onaf',          'beheerder',
   null, 0, false, '00000000-0000-0000-0000-0000000f2a04');

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values
  ('00000000-0000-0000-0000-0000000f2c01', '00000000-0000-0000-0000-0000000f2a01', null,
   'totp', 'verified', now(), now(), 'TFSECRETVERIFIED'),
  -- Een niet-afgemaakte factor telt niet (spec → Schermflow, "unverified").
  ('00000000-0000-0000-0000-0000000f2c04', '00000000-0000-0000-0000-0000000f2a04', null,
   'totp', 'unverified', now(), now(), 'TFSECRETUNVERIFIED');

-- Een vertrouwd apparaat voor alle drie de PIN-leden.
insert into bar_devices (id, token_hash) values
  ('00000000-0000-0000-0000-0000000f2d01', 'tf-device');
insert into bar_device_members (device_id, member_id, password_login_at, last_login_at) values
  ('00000000-0000-0000-0000-0000000f2d01', '00000000-0000-0000-0000-0000000f2b01', now(), now()),
  ('00000000-0000-0000-0000-0000000f2d01', '00000000-0000-0000-0000-0000000f2b02', now(), now()),
  ('00000000-0000-0000-0000-0000000f2d01', '00000000-0000-0000-0000-0000000f2b03', now(), now());

-- Zet de JWT-claims van een Auth-sessie.
create function pg_temp.claims(p_sub uuid, p_session uuid, p_aal text)
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub::text, 'session_id', p_session::text, 'aal', p_aal)::text,
    true
  );
end;
$fn$;

-- ═══ register_bar_session('beheer') ═══════════════════════════════════════

select pg_temp.claims('00000000-0000-0000-0000-0000000f2a02', '00000000-0000-0000-0000-0000000f2e01', 'aal1');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'mfa_not_enrolled',
  'een beheerder zonder tweede factor kan geen beheersessie registreren (mfa_not_enrolled)'
);
-- Ook met een aal2-claim: zonder geverifieerde factor geen beheer.
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a02', '00000000-0000-0000-0000-0000000f2e01', 'aal2');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'mfa_not_enrolled',
  'zonder geverifieerde factor ook met een aal2-claim geen beheersessie (mfa_not_enrolled)'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a04', '00000000-0000-0000-0000-0000000f2e02', 'aal1');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'mfa_not_enrolled',
  'een niet-afgemaakte (unverified) factor telt niet: mfa_not_enrolled'
);
select is(
  (select count(*)::integer from bar_sessions
    where auth_session_id in ('00000000-0000-0000-0000-0000000f2e01', '00000000-0000-0000-0000-0000000f2e02')),
  0,
  'een geweigerde registratie legt geen sessie vast'
);

select pg_temp.claims('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2e03', 'aal1');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'aal2_required',
  'een beheerder met factor maar een aal1-sessie krijgt geen beheer (aal2_required)'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2e03', null);
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'aal2_required',
  'zonder aal-claim: aal2_required'
);
select is(
  (select count(*)::integer from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000f2e03'),
  0,
  'na aal2_required is er geen sessie vastgelegd'
);

select pg_temp.claims('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2e03', 'aal2');
select lives_ok(
  $$ select register_bar_session('beheer') $$,
  'een beheerder met factor en een aal2-sessie registreert een beheersessie'
);
select is(
  (select mode from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000f2e03'),
  'beheer',
  'de sessie staat in modus beheer'
);
select lives_ok(
  $$ select check_beheer_session() $$,
  'check_beheer_session slaagt voor deze aal2-beheersessie'
);

-- Modus bar blijft zonder code: aal1 volstaat, ook voor een beheerder
-- zonder factor.
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a02', '00000000-0000-0000-0000-0000000f2e04', 'aal1');
select lives_ok(
  $$ select register_bar_session('bar') $$,
  'register_bar_session(''bar'') slaagt met aal1 (beheerder zonder factor)'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a03', '00000000-0000-0000-0000-0000000f2e05', 'aal1');
select lives_ok(
  $$ select register_bar_session('bar') $$,
  'register_bar_session(''bar'') slaagt met aal1 (bardienst)'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2e06', 'aal1');
select lives_ok(
  $$ select register_bar_session('bar') $$,
  'register_bar_session(''bar'') slaagt met aal1 (beheerder met factor)'
);

-- ═══ my_bar_state().session.resumable ════════════════════════════════════

select pg_temp.claims('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2e03', 'aal2');
select is(
  (select (my_bar_state() -> 'session' ->> 'resumable')::boolean),
  false,
  'resumable is false voor een sessie in modus beheer'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a02', '00000000-0000-0000-0000-0000000f2e04', 'aal1');
select is(
  (select (my_bar_state() -> 'session' ->> 'resumable')::boolean),
  false,
  'resumable is false voor de bar-sessie van een beheerder zonder tweede factor'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a03', '00000000-0000-0000-0000-0000000f2e05', 'aal1');
select is(
  (select (my_bar_state() -> 'session' ->> 'resumable')::boolean),
  true,
  'resumable is true voor de bar-sessie van een bardienst'
);
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2e06', 'aal1');
select is(
  (select (my_bar_state() -> 'session' ->> 'resumable')::boolean),
  true,
  'resumable is true voor de bar-sessie van een beheerder met factor'
);
-- Zodra de beheerder een factor instelt, is zijn bar-sessie wel te hervatten.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('00000000-0000-0000-0000-0000000f2c02', '00000000-0000-0000-0000-0000000f2a02', null,
        'totp', 'verified', now(), now(), 'TFSECRETLATER');
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a02', '00000000-0000-0000-0000-0000000f2e04', 'aal1');
select is(
  (select (my_bar_state() -> 'session' ->> 'resumable')::boolean),
  true,
  'na het instellen van een factor is de bar-sessie van die beheerder wel te hervatten'
);
delete from auth.mfa_factors where id = '00000000-0000-0000-0000-0000000f2c02';

-- ═══ verify_bar_pin en bar_login_options ══════════════════════════════════

select is(
  (select result_code from verify_bar_pin('tf-device', '00000000-0000-0000-0000-0000000f2b02', '2468')),
  'pin_needs_mfa',
  'verify_bar_pin: beheerder zonder factor, juiste PIN → pin_needs_mfa'
);
select is(
  (select result_code from verify_bar_pin('tf-device', '00000000-0000-0000-0000-0000000f2b02', '0000')),
  'pin_needs_mfa',
  'verify_bar_pin: beheerder zonder factor, foute PIN → ook pin_needs_mfa (geen poging op de PIN)'
);
select is(
  (select coalesce(max(failed_count), 0) from pin_failures where member_id = '00000000-0000-0000-0000-0000000f2b02'),
  0,
  'pin_needs_mfa hoogt de foutteller niet op'
);
select is(
  (select member_auth_user_id from verify_bar_pin('tf-device', '00000000-0000-0000-0000-0000000f2b02', '2468')),
  null,
  'bij pin_needs_mfa geen account-id (geen sessie)'
);
select is(
  (select row(pin_available, pin_locked, pin_needs_mfa)::text
     from bar_login_options('tf-device', '00000000-0000-0000-0000-0000000f2b02')),
  '(f,f,t)',
  'bar_login_options: beheerder zonder factor → pin_available false, pin_needs_mfa true'
);
select is(
  (select row(pin_available, pin_locked, pin_needs_mfa)::text
     from bar_login_options(null, '00000000-0000-0000-0000-0000000f2b02')),
  '(f,f,f)',
  'bar_login_options zonder apparaatcookie: alleen wachtwoord, geen pin_needs_mfa (de rol lekt niet)'
);
select is(
  (select row(pin_available, pin_locked, pin_needs_mfa)::text
     from bar_login_options('tf-device', '00000000-0000-0000-0000-0000000f2b01')),
  '(t,f,f)',
  'bar_login_options: beheerder met factor → pin_available true, pin_needs_mfa false'
);
select is(
  (select row(pin_available, pin_locked, pin_needs_mfa)::text
     from bar_login_options('tf-device', '00000000-0000-0000-0000-0000000f2b03')),
  '(t,f,f)',
  'bar_login_options: bardienst ongewijzigd'
);
select is(
  (select result_code from verify_bar_pin('tf-device', '00000000-0000-0000-0000-0000000f2b01', '1357')),
  'ok',
  'verify_bar_pin: beheerder met factor → ok'
);
select is(
  (select result_code from verify_bar_pin('tf-device', '00000000-0000-0000-0000-0000000f2b03', '3579')),
  'ok',
  'verify_bar_pin: bardienst zonder factor → ok (ongewijzigd)'
);
select is(
  (select result_code from verify_bar_pin('tf-device', '00000000-0000-0000-0000-0000000f2b03', '0000')),
  'invalid_pin',
  'verify_bar_pin: bardienst met een foute PIN → invalid_pin (ongewijzigd)'
);

-- ═══ Het einde van een bar-sessie trekt de Auth-sessie in ═════════════════

-- Auth-sessies voor de bar-sessies hierboven (e2e03 beheer, e2e04 en e2e06
-- bar van beheerders, e2e05 bar van de bardienst).
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000f2e03', '00000000-0000-0000-0000-0000000f2a01', now(), now()),
  ('00000000-0000-0000-0000-0000000f2e04', '00000000-0000-0000-0000-0000000f2a02', now(), now()),
  ('00000000-0000-0000-0000-0000000f2e05', '00000000-0000-0000-0000-0000000f2a03', now(), now()),
  ('00000000-0000-0000-0000-0000000f2e06', '00000000-0000-0000-0000-0000000f2a01', now(), now());

-- uitgelogd (end_bar_session)
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a03', '00000000-0000-0000-0000-0000000f2e05', 'aal1');
select lives_ok($$ select end_bar_session(false) $$, 'stap: de bardienst logt uit');
select is(
  (select count(*)::integer from auth.sessions where id = '00000000-0000-0000-0000-0000000f2e05'),
  0,
  'uitgelogd: de auth.sessions-rij is weg'
);
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000f2e05'),
  'uitgelogd',
  'uitgelogd: de bar-sessie is gesloten zoals voorheen'
);

-- niet_hervat (end_bar_session met reden)
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a02', '00000000-0000-0000-0000-0000000f2e04', 'aal1');
select lives_ok($$ select end_bar_session(false, 'niet_hervat') $$, 'stap: niet te hervatten sessie gesloten');
select is(
  (select count(*)::integer from auth.sessions where id = '00000000-0000-0000-0000-0000000f2e04'),
  0,
  'niet_hervat: de auth.sessions-rij is weg'
);

-- afgemeld (admin_end_bar_session, vanuit de beheersessie)
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2e03', 'aal2');
select lives_ok(
  $$ select admin_end_bar_session((select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000f2e06')) $$,
  'stap: een beheerder meldt een apparaat af'
);
select is(
  (select count(*)::integer from auth.sessions where id = '00000000-0000-0000-0000-0000000f2e06'),
  0,
  'afgemeld: de auth.sessions-rij van de afgemelde sessie is weg'
);
select is(
  (select count(*)::integer from auth.sessions where id = '00000000-0000-0000-0000-0000000f2e03'),
  1,
  'afgemeld: de Auth-sessie van de beheerder die afmeldt blijft staan'
);

-- inactief (close_inactive_bar_sessions)
insert into bar_sessions (auth_session_id, member_id, mode, last_activity_at) values
  ('00000000-0000-0000-0000-0000000f2e07', '00000000-0000-0000-0000-0000000f2b03', 'bar', now() - interval '61 minutes');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000f2e07', '00000000-0000-0000-0000-0000000f2a03', now(), now());
select lives_ok($$ select close_inactive_bar_sessions() $$, 'stap: de cron-job sluit inactieve sessies');
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000f2e07'),
  'inactief',
  'inactief: de bar-sessie is gesloten'
);
select is(
  (select count(*)::integer from auth.sessions where id = '00000000-0000-0000-0000-0000000f2e07'),
  0,
  'inactief: de auth.sessions-rij is weg'
);

-- geen_bar_rol (end_member_bar_sessions, bij archiveren of rol → lid)
insert into bar_sessions (auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000f2e08', '00000000-0000-0000-0000-0000000f2b03', 'bar');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000f2e08', '00000000-0000-0000-0000-0000000f2a03', now(), now());
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000f2b03', 'lid') $$,
  'stap: de beheerder (aal2) zet de bardienst terug naar lid'
);
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000f2e08'),
  'geen_bar_rol',
  'geen_bar_rol: de bar-sessie is gesloten'
);
select is(
  (select count(*)::integer from auth.sessions where id = '00000000-0000-0000-0000-0000000f2e08'),
  0,
  'geen_bar_rol: de auth.sessions-rij is weg'
);

-- Ontbreekt de Auth-sessie al (bv. al uitgelogd bij Supabase), dan is dat
-- geen fout.
insert into bar_sessions (auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-0000000f2e09', '00000000-0000-0000-0000-0000000f2b01', 'bar');
select pg_temp.claims('00000000-0000-0000-0000-0000000f2a01', '00000000-0000-0000-0000-0000000f2e09', 'aal1');
select lives_ok(
  $$ select end_bar_session(false) $$,
  'uitloggen zonder auth.sessions-rij is geen fout'
);

-- ═══ Rechten ══════════════════════════════════════════════════════════════

select ok(
  not has_function_privilege('anon', 'public.member_has_verified_factor(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.member_has_verified_factor(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.member_has_verified_factor(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'public.member_has_verified_factor(uuid)', 'EXECUTE'),
  'member_has_verified_factor is voor geen enkele API-rol uitvoerbaar'
);

set local role authenticated;
select throws_ok(
  $$ select member_has_verified_factor('00000000-0000-0000-0000-0000000f2a01') $$,
  '42501', null,
  'een ingelogde sessie kan member_has_verified_factor niet aanroepen'
);
reset role;

select * from finish();
rollback;
