-- Negatieve en positieve tests voor de PIN-login (0028, docs/features/
-- dienst-per-sessie.md → Inloggen op de bar, RPC's; ADR 0016 → Beslissing 7):
-- verify_bar_pin, record_bar_password_login, bar_login_options.
--
-- Wat hier vastligt:
--   * alleen `service_role` mag ze aanroepen (niet anon, niet authenticated);
--   * de PIN werkt alleen op een apparaat waar het lid eerder met het
--     wachtwoord inlogde, niet ingetrokken en niet verlopen (30 dagen);
--   * lockout (B2): de vijfde foute PIN blokkeert het lid op alle apparaten,
--     de foute pogingen blijven staan (geen rollback), en een geslaagde
--     wachtwoordlogin heft de blokkade op;
--   * kostenfactor 12 (B1): set_own_pin hasht met 12, een oudere hash wordt
--     bij de eerste geslaagde PIN-login opnieuw gehasht;
--   * iemand buiten een vertrouwd apparaat leert niet of een lid een PIN
--     heeft;
--   * de PIN die via set_own_pin (portal) is gezet, werkt in verify_bar_pin
--     (vervangt set_own_pin_start_shift.test.sql).
--
-- Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(50);

-- ── Fixtures ──────────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-00000000b110', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'vbp-a@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000b111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'vbp-b@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-00000000b120', 'VBP Lid A', 'bardienst', null, 0, false,
   '00000000-0000-0000-0000-00000000b110'),
  ('00000000-0000-0000-0000-00000000b121', 'VBP Lid B', 'beheerder', null, 0, false,
   '00000000-0000-0000-0000-00000000b111'),
  -- Zonder PIN.
  ('00000000-0000-0000-0000-00000000b122', 'VBP Zonder PIN', 'bardienst', null, 0, false, null),
  -- Zonder account.
  ('00000000-0000-0000-0000-00000000b123', 'VBP Zonder account', 'bardienst',
   crypt('1234', gen_salt('bf', 6)), 0, false, null),
  -- Gearchiveerd en een gewoon lid.
  ('00000000-0000-0000-0000-00000000b124', 'VBP Gearchiveerd', 'bardienst',
   crypt('1234', gen_salt('bf', 6)), 0, true, null),
  ('00000000-0000-0000-0000-00000000b125', 'VBP Gewoon lid', 'lid', null, 0, false, null);

-- ── Rechten: alleen service_role ──────────────────────────────────────────

select ok(
  has_function_privilege('service_role', 'public.verify_bar_pin(text,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.record_bar_password_login(text,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.bar_login_options(text,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.register_bar_session_server(uuid,uuid,uuid)', 'EXECUTE'),
  'de server-side loginfuncties zijn uitvoerbaar voor service_role'
);
select ok(
  not has_function_privilege('anon', 'public.verify_bar_pin(text,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.verify_bar_pin(text,uuid,text)', 'EXECUTE'),
  'verify_bar_pin is niet uitvoerbaar voor anon of authenticated'
);
select ok(
  not has_function_privilege('anon', 'public.record_bar_password_login(text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_bar_password_login(text,uuid)', 'EXECUTE'),
  'record_bar_password_login is niet uitvoerbaar voor anon of authenticated'
);
select ok(
  not has_function_privilege('anon', 'public.bar_login_options(text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.bar_login_options(text,uuid)', 'EXECUTE'),
  'bar_login_options is niet uitvoerbaar voor anon of authenticated'
);
select ok(
  not has_function_privilege('anon', 'public.register_bar_session_server(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.register_bar_session_server(uuid,uuid,uuid)', 'EXECUTE'),
  'register_bar_session_server is niet uitvoerbaar voor anon of authenticated'
);
select ok(
  not has_function_privilege('service_role', 'public.bar_pin_state(text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.bar_pin_state(text,uuid)', 'EXECUTE'),
  'bar_pin_state is een interne helper, ook niet voor service_role'
);

set local role authenticated;
select throws_ok(
  $$ select * from verify_bar_pin('h', '00000000-0000-0000-0000-00000000b120', '4821') $$,
  '42501', null,
  'een ingelogde sessie kan verify_bar_pin niet aanroepen'
);
select throws_ok(
  $$ select record_bar_password_login('h', '00000000-0000-0000-0000-00000000b120') $$,
  '42501', null,
  'een ingelogde sessie kan record_bar_password_login niet aanroepen'
);
reset role;
set local role anon;
select throws_ok(
  $$ select * from verify_bar_pin('h', '00000000-0000-0000-0000-00000000b120', '4821') $$,
  '42501', null,
  'zonder sessie kan verify_bar_pin niet aangeroepen worden (geen PIN-brute-force met de publieke key)'
);
reset role;

-- ── De PIN via set_own_pin (portal), kostenfactor 12 ──────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b110', true);
select set_own_pin('4821');
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select substring(pin_hash from 5 for 2) from members where id = '00000000-0000-0000-0000-00000000b120'),
  '12',
  'set_own_pin hasht met kostenfactor 12 (B1)'
);

-- ── Nog geen vertrouwd apparaat: geen PIN-poging mogelijk ─────────────────

select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'een onbekend apparaat kan niet met de PIN inloggen'
);
select is(
  (select result_code from verify_bar_pin(null, '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'zonder apparaatcookie kan niet met de PIN ingelogd worden'
);
select is(
  (select failed_count from pin_failures where member_id = '00000000-0000-0000-0000-00000000b120'),
  null,
  'buiten een vertrouwd apparaat telt er niets mee voor de lockout (niemand kan een lid van buitenaf blokkeren)'
);
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b121', '4821')),
  'pin_not_available',
  'een lid zonder PIN geeft hetzelfde antwoord als een lid mét PIN op een onbekend apparaat (geen lek of een lid een PIN heeft)'
);
select results_eq(
  $$ select pin_available, pin_locked from bar_login_options('hash-a', '00000000-0000-0000-0000-00000000b120') $$,
  $$ values (false, false) $$,
  'bar_login_options: onbekend apparaat, alleen wachtwoord, en geen lockout-vlag'
);

-- ── Wachtwoordlogin maakt het apparaat vertrouwd ──────────────────────────

select is(
  (select count(*)::int from (select record_bar_password_login('hash-a', '00000000-0000-0000-0000-00000000b120')) x),
  1,
  'record_bar_password_login geeft een apparaat-id terug'
);
select is(
  (select count(*)::int from bar_devices where token_hash = 'hash-a'),
  1,
  'het apparaat is aangemaakt (alleen de hash)'
);
select is(
  (select count(*)::int from bar_device_members bdm join bar_devices d on d.id = bdm.device_id
     where d.token_hash = 'hash-a' and bdm.member_id = '00000000-0000-0000-0000-00000000b120'),
  1,
  'het apparaat is vertrouwd voor dit lid'
);
select results_eq(
  $$ select pin_available, pin_locked from bar_login_options('hash-a', '00000000-0000-0000-0000-00000000b120') $$,
  $$ values (true, false) $$,
  'bar_login_options: PIN mogelijk op het vertrouwde apparaat'
);

-- Tweede vertrouwde apparaten, vóór de foute pogingen hieronder: een wachtwoordlogin
-- heft de blokkade op, dus dit moet vooraf.
select record_bar_password_login('hash-b', '00000000-0000-0000-0000-00000000b121');
select record_bar_password_login('hash-c', '00000000-0000-0000-0000-00000000b120');

-- Vertrouwd voor lid A betekent niet vertrouwd voor lid B.
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b121', '4821')),
  'pin_not_available',
  'het apparaat is alleen vertrouwd voor de leden die er met het wachtwoord inlogden'
);

-- ── Foute PIN's, lockout ──────────────────────────────────────────────────

select results_eq(
  $$ select result_code, attempts_left from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '0000') $$,
  $$ values ('invalid_pin'::text, 4) $$,
  'eerste foute PIN: invalid_pin met 4 resterende pogingen'
);
select is(
  (select failed_count from pin_failures where member_id = '00000000-0000-0000-0000-00000000b120'),
  1,
  'de foute poging blijft staan (de teller wordt niet teruggedraaid)'
);
select results_eq(
  $$ select result_code, attempts_left from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '0001') $$,
  $$ values ('invalid_pin'::text, 3) $$,
  'tweede foute PIN: 3 resterende pogingen'
);
select results_eq(
  $$ select result_code, attempts_left from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '0002') $$,
  $$ values ('invalid_pin'::text, 2) $$,
  'derde foute PIN: 2 resterende pogingen'
);
select results_eq(
  $$ select result_code, attempts_left from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '0003') $$,
  $$ values ('invalid_pin'::text, 1) $$,
  'vierde foute PIN: 1 resterende poging'
);
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '0004')),
  'pin_locked',
  'vijfde foute PIN: de PIN is geblokkeerd'
);
select isnt(
  (select locked_at from pin_failures where member_id = '00000000-0000-0000-0000-00000000b120'),
  null,
  'pin_failures.locked_at is gezet'
);
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_locked',
  'ook de juiste PIN wordt geweigerd zolang de blokkade staat'
);
select results_eq(
  $$ select pin_available, pin_locked from bar_login_options('hash-a', '00000000-0000-0000-0000-00000000b120') $$,
  $$ values (false, true) $$,
  'bar_login_options: PIN niet mogelijk, met de lockout-vlag voor de tekst'
);

-- De lockout geldt per lid over alle apparaten.
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_locked',
  'de blokkade geldt ook op een tweede vertrouwd apparaat van dit lid'
);
select is(
  (select result_code from verify_bar_pin('hash-b', '00000000-0000-0000-0000-00000000b121', '9999')),
  'pin_not_available',
  'een ander lid is niet geblokkeerd (lid B heeft geen PIN)'
);

-- Een geslaagde wachtwoordlogin heft de blokkade op.
select record_bar_password_login('hash-a', '00000000-0000-0000-0000-00000000b120');

-- ── Geslaagde PIN-login ───────────────────────────────────────────────────

select is(
  (select locked_at from pin_failures where member_id = '00000000-0000-0000-0000-00000000b120'),
  null,
  'een wachtwoordlogin heft de PIN-blokkade op'
);
select results_eq(
  $$ select result_code, member_auth_user_id from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821') $$,
  $$ values ('ok'::text, '00000000-0000-0000-0000-00000000b110'::uuid) $$,
  'de juiste PIN op een vertrouwd apparaat slaagt en geeft het auth-account terug'
);
select is(
  (select trusted_device_id from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  (select id from bar_devices where token_hash = 'hash-a'),
  'verify_bar_pin geeft het apparaat-id terug voor register_bar_session_server'
);
select is(
  (select failed_count from pin_failures where member_id = '00000000-0000-0000-0000-00000000b120'),
  0,
  'een geslaagde PIN zet de teller op 0'
);

-- ── Herhashen (B1) ────────────────────────────────────────────────────────

update members set pin_hash = crypt('4821', gen_salt('bf', 6))
  where id = '00000000-0000-0000-0000-00000000b120';
select verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '0000');
select is(
  (select substring(pin_hash from 5 for 2) from members where id = '00000000-0000-0000-0000-00000000b120'),
  '06',
  'een foute PIN herhasht niet'
);
select verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821');
select is(
  (select substring(pin_hash from 5 for 2) from members where id = '00000000-0000-0000-0000-00000000b120'),
  '12',
  'een geslaagde PIN-login herhasht een hash met een lagere kostenfactor naar 12'
);
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  'ok',
  'de PIN werkt nog na het herhashen'
);

-- ── Andere weigergronden ──────────────────────────────────────────────────

select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b123', '1234')),
  'no_account',
  'een lid zonder gekoppeld account: no_account'
);
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b124', '1234')),
  'not_allowed',
  'een gearchiveerd lid: not_allowed'
);
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b125', '1234')),
  'not_allowed',
  'een lid zonder bar-rol: not_allowed'
);
select is(
  (select result_code from verify_bar_pin('hash-a', gen_random_uuid(), '1234')),
  'not_allowed',
  'een onbekend lid: not_allowed'
);

-- Lid zet de PIN uit: geen PIN meer.
update members set pin_hash = null where id = '00000000-0000-0000-0000-00000000b120';
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'na het uitzetten van de PIN (pin_hash null) is er geen PIN-login'
);
update members set pin_hash = crypt('4821', gen_salt('bf', 12))
  where id = '00000000-0000-0000-0000-00000000b120';

-- ── Vertrouwen intrekken ──────────────────────────────────────────────────

-- Per lid (archiveren, rol → lid): revoked_at op bar_device_members.
update bar_device_members set revoked_at = now()
  where member_id = '00000000-0000-0000-0000-00000000b120';
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'een ingetrokken lid-vertrouwen: geen PIN-login'
);
-- Een wachtwoordlogin herstelt het lid-vertrouwen.
select record_bar_password_login('hash-a', '00000000-0000-0000-0000-00000000b120');
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  'ok',
  'na een nieuwe wachtwoordlogin werkt de PIN op dat apparaat weer'
);

-- Per apparaat (apparaat afmelden): revoked_at op bar_devices.
update bar_devices set revoked_at = now() where token_hash = 'hash-a';
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'een ingetrokken apparaat: geen PIN-login'
);
select is(
  (select record_bar_password_login('hash-a', '00000000-0000-0000-0000-00000000b120')),
  null,
  'een ingetrokken apparaat blijft ingetrokken: record_bar_password_login geeft null (de server geeft dan een nieuw cookie uit)'
);
select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'ook na een wachtwoordlogin blijft het ingetrokken apparaat ingetrokken'
);

-- Verlopen: 30 dagen zonder login.
update bar_devices set last_seen_at = now() - interval '31 days' where token_hash = 'hash-c';
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'een apparaat waar 31 dagen niet is ingelogd, is niet meer vertrouwd'
);
select record_bar_password_login('hash-c', '00000000-0000-0000-0000-00000000b120');
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'ok',
  'een wachtwoordlogin verlengt het vertrouwen'
);

select * from finish();
rollback;
