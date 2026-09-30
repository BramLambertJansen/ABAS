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
--     (vervangt set_own_pin_start_shift.test.sql);
--   * record_bar_password_login weigert een ongeldig apparaat en een lid
--     zonder bar-rol, en heft alleen de blokkade van het eigen lid op;
--   * een geslaagde PIN zet de teller terug, een null-PIN telt mee, en een
--     poging op een ingetrokken apparaat telt niet mee;
--   * de grens van 30 dagen: 29 dagen is nog vertrouwd;
--   * het vertrouwen geldt per lid per apparaat (0033): de login van een
--     ander lid verlengt het niet, en een login verlengt alleen het eigen.
--
-- Niet hier te toetsen: "een fout wachtwoord telt niet mee". Dat is een
-- eigenschap van de loginflow (src/lib/barLogin.ts roept bij een mislukte
-- signInWithPassword geen enkele databasefunctie aan); er bestaat geen
-- databasepad dat een wachtwoordpoging registreert.
--
-- Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(74);

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

-- Verlopen: 30 dagen zonder login van dít lid op dit apparaat (0033: per lid
-- per apparaat, niet meer op bar_devices.last_seen_at).
update bar_device_members set last_login_at = now() - interval '31 days'
  where member_id = '00000000-0000-0000-0000-00000000b120'
    and device_id = (select id from bar_devices where token_hash = 'hash-c');
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'een lid dat 31 dagen niet op dit apparaat inlogde, kan er niet meer met de PIN in'
);
-- Een login van een ander lid op hetzelfde apparaat verlengt het vertrouwen
-- van lid A niet (0033), ook al is het apparaat daarmee net "gezien".
select record_bar_password_login('hash-c', '00000000-0000-0000-0000-00000000b121');
select is(
  (select last_seen_at from bar_devices where token_hash = 'hash-c'),
  now(),
  'stap: lid B logde zojuist in op hetzelfde apparaat'
);
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'de login van een ander lid verlengt het PIN-vertrouwen van lid A niet: na 31 dagen geweigerd'
);
select is(
  (select failed_count from pin_failures where member_id = '00000000-0000-0000-0000-00000000b120'),
  0,
  'een poging na het verlopen van het vertrouwen telt niet mee voor de lockout'
);
select record_bar_password_login('hash-c', '00000000-0000-0000-0000-00000000b120');
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'ok',
  'een wachtwoordlogin verlengt het vertrouwen'
);

-- ── record_bar_password_login: weigergronden ──────────────────────────────
-- Alleen de server roept dit aan, ná een geslaagde wachtwoordlogin. Toch
-- weigert de functie zelf een ongeldig apparaat en een lid zonder bar-rol:
-- anders kan een bug in de loginflow een lid met rol `lid` of een
-- gearchiveerd lid PIN-vertrouwen geven.

select throws_ok(
  $$ select record_bar_password_login(null, '00000000-0000-0000-0000-00000000b120') $$,
  'P0001', 'invalid_device',
  'record_bar_password_login zonder apparaat-hash: invalid_device'
);
select throws_ok(
  $$ select record_bar_password_login('', '00000000-0000-0000-0000-00000000b120') $$,
  'P0001', 'invalid_device',
  'record_bar_password_login met een lege apparaat-hash: invalid_device'
);
select throws_ok(
  $$ select record_bar_password_login('hash-x', '00000000-0000-0000-0000-00000000b125') $$,
  'P0001', 'not_allowed',
  'record_bar_password_login weigert een lid zonder bar-rol'
);
select throws_ok(
  $$ select record_bar_password_login('hash-x', '00000000-0000-0000-0000-00000000b124') $$,
  'P0001', 'not_allowed',
  'record_bar_password_login weigert een gearchiveerd lid'
);
select throws_ok(
  $$ select record_bar_password_login('hash-x', gen_random_uuid()) $$,
  'P0001', 'not_allowed',
  'record_bar_password_login weigert een onbekend lid'
);
select is(
  (select count(*)::int from bar_devices where token_hash = 'hash-x'),
  0,
  'de geweigerde aanroepen maakten geen apparaat aan'
);

-- ── Foute PIN op een ingetrokken apparaat telt niet mee ───────────────────

select is(
  (select result_code from verify_bar_pin('hash-a', '00000000-0000-0000-0000-00000000b120', '0000')),
  'pin_not_available',
  'een foute PIN op een ingetrokken apparaat: pin_not_available'
);
select is(
  (select failed_count from pin_failures where member_id = '00000000-0000-0000-0000-00000000b120'),
  0,
  'een poging op een ingetrokken apparaat telt niet mee voor de lockout'
);

-- ── Een geslaagde PIN zet de teller terug ─────────────────────────────────
-- (Hierboven stond de teller al op 0 door de wachtwoordlogin; hier echt na
-- foute pogingen, zonder wachtwoordlogin ertussen.)

select verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '0000');
select verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '0001');
select results_eq(
  $$ select result_code, attempts_left from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '0002') $$,
  $$ values ('invalid_pin'::text, 2) $$,
  'stap: drie foute PIN''s, nog 2 pogingen'
);
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'ok',
  'de juiste PIN vóór de vijfde poging slaagt'
);
select results_eq(
  $$ select result_code, attempts_left from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '0003') $$,
  $$ values ('invalid_pin'::text, 4) $$,
  'na een geslaagde PIN begint de teller opnieuw (4 resterende pogingen, niet 1)'
);
select results_eq(
  $$ select result_code, attempts_left from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', null) $$,
  $$ values ('invalid_pin'::text, 3) $$,
  'een lege (null) PIN is een foute poging en telt mee'
);

-- ── Tijdens de blokkade ───────────────────────────────────────────────────

select verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '0004');
select verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '0005');
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '0006')),
  'pin_locked',
  'stap: de vijfde foute poging sinds de laatste geslaagde blokkeert de PIN'
);
select is(
  (select result_code from verify_bar_pin('hash-onbekend', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_not_available',
  'een geblokkeerd lid op een onbekend apparaat: pin_not_available (buiten een vertrouwd apparaat lekt de blokkade niet)'
);
select results_eq(
  $$ select pin_available, pin_locked from bar_login_options('hash-onbekend', '00000000-0000-0000-0000-00000000b120') $$,
  $$ values (false, false) $$,
  'bar_login_options op een onbekend apparaat toont geen lockout-vlag'
);

-- De wachtwoordlogin van een ander lid heft deze blokkade niet op.
select record_bar_password_login('hash-b', '00000000-0000-0000-0000-00000000b121');
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'pin_locked',
  'de wachtwoordlogin van een ander lid heft de blokkade niet op (per lid)'
);
-- Een geweigerde wachtwoordlogin-registratie ook niet.
select throws_ok(
  $$ select record_bar_password_login('', '00000000-0000-0000-0000-00000000b120') $$,
  'P0001', 'invalid_device',
  'stap: een ongeldige registratie van de wachtwoordlogin'
);
select is(
  (select locked_at is not null from pin_failures where member_id = '00000000-0000-0000-0000-00000000b120'),
  true,
  'een geweigerde record_bar_password_login heft de blokkade niet op'
);

-- ── Vertrouwen: 29 dagen is nog geldig, en een login verlengt het ─────────

select record_bar_password_login('hash-c', '00000000-0000-0000-0000-00000000b120');
update bar_device_members set last_login_at = now() - interval '29 days'
  where member_id = '00000000-0000-0000-0000-00000000b120'
    and device_id = (select id from bar_devices where token_hash = 'hash-c');
-- Lid B logde 20 dagen geleden in: de PIN-login van lid A hieronder mag dat
-- niet verlengen.
update bar_device_members set last_login_at = now() - interval '20 days'
  where member_id = '00000000-0000-0000-0000-00000000b121'
    and device_id = (select id from bar_devices where token_hash = 'hash-c');
-- En het apparaat zelf is al 40 dagen niet gezien: dat telt niet meer.
update bar_devices set last_seen_at = now() - interval '40 days' where token_hash = 'hash-c';
select is(
  (select result_code from verify_bar_pin('hash-c', '00000000-0000-0000-0000-00000000b120', '4821')),
  'ok',
  'een lid dat 29 dagen geleden op dit apparaat inlogde, kan er nog met de PIN in'
);
select is(
  (select last_login_at from bar_device_members
     where member_id = '00000000-0000-0000-0000-00000000b120'
       and device_id = (select id from bar_devices where token_hash = 'hash-c')),
  now(),
  'een geslaagde PIN-login verlengt het vertrouwen van dit lid op dit apparaat (last_login_at = nu)'
);
select is(
  (select last_login_at from bar_device_members
     where member_id = '00000000-0000-0000-0000-00000000b121'
       and device_id = (select id from bar_devices where token_hash = 'hash-c')),
  now() - interval '20 days',
  'de PIN-login van lid A verlengt het vertrouwen van lid B op hetzelfde apparaat niet'
);

select * from finish();
rollback;
