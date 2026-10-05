-- Account koppelen alleen met bewijs van mailbezit
-- (docs/features/account-koppeling-bewijs.md, ADR 0020, migratie 0040).
-- Run met `npm run db:test`.
--
-- Een `members`-rij krijgt alleen een `auth_user_id` als de sessie die
-- koppelt (1) via een token uit de mailbox tot stand kwam (`amr`), (2) van
-- het auth-account is dat de uitnodiging aanmaakte (`invited_auth_user_id`),
-- (3) een bevestigd adres heeft dat gelijk is aan `members.email`; en het lid
-- niet gearchiveerd is. Elk negatief geval hieronder bewijst twee dingen: de
-- RPC geeft null (stille no-op, nooit een fout) én `auth_user_id` blijft
-- null.
--
-- Bij een geslaagde koppeling worden wachtwoord en MFA-factoren van het
-- account gewist en eindigen alle andere sessies (ADR 0020 → Beslissing 3
-- en 4): GoTrue zet bij het openen van de uitnodiging zelf een tijdelijk
-- wachtwoord (verify.go:317-329), dus een account met wachtwoord moet
-- kunnen koppelen (23). Een no-op raakt niets aan (5, 25, 26).
--
-- De belangrijkste test is 2): een bevestigd account zonder mailbewijs (de
-- autoconfirm-wachtwoordsignup) koppelt niet. "Bevestigd" is niet genoeg.
--
-- Fixtures: auth.users zonder wachtwoord (`encrypted_password = ''`) en
-- bevestigd, tenzij anders vermeld; leden uitgenodigd (`invited_at = now()`)
-- en gebonden aan hun account, tenzij anders vermeld. Elk geval heeft een
-- eigen account en een eigen lid, zodat de gevallen elkaar niet raken.

create extension if not exists pgtap with schema extensions;

begin;
select plan(73);

-- ── Helpers ──────────────────────────────────────────────────────────────

-- JWT-claims van een Auth-sessie, zelfde vorm als
-- beheer_tweede_factor.test.sql, plus `amr` zoals Supabase Auth hem
-- ondertekent: `[{"method": ..., "timestamp": ...}]`. `p_session` null:
-- geen session_id-claim. `p_amr` null: geen amr-claim.
create function pg_temp.claims(p_sub uuid, p_session uuid, p_amr text)
returns void
language plpgsql
as $fn$
declare
  v_claims jsonb := jsonb_build_object('sub', p_sub::text);
begin
  if p_session is not null then
    v_claims := v_claims || jsonb_build_object('session_id', p_session::text);
  end if;
  if p_amr is not null then
    v_claims := v_claims || jsonb_build_object(
      'amr', jsonb_build_array(jsonb_build_object('method', p_amr, 'timestamp', 0)));
  end if;
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claims', v_claims::text, true);
end;
$fn$;

-- Ruwe claims, voor de vormen van `amr` die pg_temp.claims niet maakt.
create function pg_temp.raw_claims(p_sub uuid, p_claims jsonb)
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claims', p_claims::text, true);
end;
$fn$;

-- Beheersessie (modus beheer, aal2), zoals ledenbeheer.test.sql.
create function pg_temp.act_as_beheerder(p_auth_user uuid)
returns void
language plpgsql
as $fn$
declare
  v_member uuid;
begin
  select id into v_member from members where auth_user_id = p_auth_user;
  insert into bar_sessions (auth_session_id, member_id, mode)
  values (p_auth_user, v_member, 'beheer')
  on conflict (auth_session_id) do nothing;
  perform set_config('request.jwt.claim.sub', p_auth_user::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_auth_user::text, 'session_id', p_auth_user::text, 'aal', 'aal2')::text,
    true
  );
end;
$fn$;

-- ── Fixtures ─────────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select v.id::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', v.email,
       v.pw, v.confirmed, now(), now(),
       '{"provider":"email","providers":["email"]}', '{}'
  from (values
    -- De beheerder die update_member_email/mark_member_invite_sent aanroept.
    ('00000000-0000-0000-0000-0000000ac001', 'akb-beheerder@test.local',  crypt('x', gen_salt('bf')), now()),
    -- 1) onbevestigd
    ('00000000-0000-0000-0000-0000000ac011', 'akb-onbevestigd@test.local', '', null),
    -- 2) bevestigd, maar alleen een wachtwoordsessie
    ('00000000-0000-0000-0000-0000000ac012', 'akb-password@test.local',    '', now()),
    -- 3) amr ontbreekt / geen array / alleen token_refresh
    ('00000000-0000-0000-0000-0000000ac013', 'akb-amr@test.local',         '', now()),
    -- 4) het gebonden account en een tweede account op hetzelfde adres
    ('00000000-0000-0000-0000-0000000ac014', 'akb-ander@test.local',       '', now()),
    ('00000000-0000-0000-0000-0000000ac015', 'AKB-Ander@test.local',       '', now()),
    -- 5) account met wachtwoord en factor, alleen een wachtwoordsessie
    ('00000000-0000-0000-0000-0000000ac016', 'akb-wachtwoord@test.local',  crypt('geheim', gen_salt('bf')), now()),
    -- 6) gearchiveerd lid
    ('00000000-0000-0000-0000-0000000ac017', 'akb-archief@test.local',     '', now()),
    -- 7) geen session_id
    ('00000000-0000-0000-0000-0000000ac018', 'akb-sessie@test.local',      '', now()),
    -- 8) adres in auth.users wijkt af van members.email
    ('00000000-0000-0000-0000-0000000ac019', 'akb-auth-adres@test.local',  '', now()),
    -- 9) al aan een ander lid gekoppeld
    ('00000000-0000-0000-0000-0000000ac01a', 'akb-gekoppeld@test.local',   '', now()),
    -- 10) twee leden gebonden aan hetzelfde id
    ('00000000-0000-0000-0000-0000000ac01b', 'akb-dubbel@test.local',      '', now()),
    -- 11) bardienst en beheerder via link_lid_member_account
    ('00000000-0000-0000-0000-0000000ac01c', 'akb-bardienst@test.local',   '', now()),
    ('00000000-0000-0000-0000-0000000ac01d', 'akb-beheer@test.local',      '', now()),
    -- 13)-15) update_member_email
    ('00000000-0000-0000-0000-0000000ac020', 'akb-wijzig@test.local',      '', now()),
    ('00000000-0000-0000-0000-0000000ac021', 'akb-wis@test.local',         '', now()),
    ('00000000-0000-0000-0000-0000000ac022', 'akb-hoofd@test.local',       '', now()),
    -- 17)-18) mark_member_invite_sent
    ('00000000-0000-0000-0000-0000000ac030', 'akb-iemand-anders@test.local', '', null),
    ('00000000-0000-0000-0000-0000000ac031', 'AKB-Uitnodig@test.local',    '', null),
    -- 20)-22) happy paths
    ('00000000-0000-0000-0000-0000000ac040', 'akb-happy@test.local',       '', now()),
    ('00000000-0000-0000-0000-0000000ac041', 'akb-magic@test.local',       '', now()),
    ('00000000-0000-0000-0000-0000000ac042', 'akb-otp@test.local',         '', now()),
    -- 23) gebonden account met wachtwoord (zoals GoTrue het achterlaat)
    ('00000000-0000-0000-0000-0000000ac043', 'akb-reset@test.local',       crypt('tijdelijk', gen_salt('bf')), now()),
    -- 24) gebonden account met wachtwoord en een verified factor
    ('00000000-0000-0000-0000-0000000ac044', 'akb-mfa@test.local',         crypt('tijdelijk', gen_salt('bf')), now()),
    -- 25) al gekoppeld account met wachtwoord en factor
    ('00000000-0000-0000-0000-0000000ac045', 'akb-in-gebruik@test.local',  crypt('in-gebruik', gen_salt('bf')), now()),
    -- 26) het gebonden account en een tweede account op hetzelfde adres,
    --     met wachtwoord en sessies
    ('00000000-0000-0000-0000-0000000ac046', 'akb-variant@test.local',     '', now()),
    ('00000000-0000-0000-0000-0000000ac047', 'AKB-Variant@test.local',     crypt('van-een-ander', gen_salt('bf')), now())
  ) as v(id, email, pw, confirmed);

-- De Auth-sessies van het happy-path-account: de sessie die koppelt en een
-- tweede, van vóór de koppeling.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000ac050', '00000000-0000-0000-0000-0000000ac040', now(), now()),
  ('00000000-0000-0000-0000-0000000ac051', '00000000-0000-0000-0000-0000000ac040', now(), now()),
  -- 5), 25), 26): de sessie die de RPC aanroept en een tweede.
  ('00000000-0000-0000-0000-0000000ac052', '00000000-0000-0000-0000-0000000ac016', now(), now()),
  ('00000000-0000-0000-0000-0000000ac053', '00000000-0000-0000-0000-0000000ac016', now(), now()),
  ('00000000-0000-0000-0000-0000000ac054', '00000000-0000-0000-0000-0000000ac045', now(), now()),
  ('00000000-0000-0000-0000-0000000ac055', '00000000-0000-0000-0000-0000000ac045', now(), now()),
  ('00000000-0000-0000-0000-0000000ac056', '00000000-0000-0000-0000-0000000ac047', now(), now()),
  ('00000000-0000-0000-0000-0000000ac057', '00000000-0000-0000-0000-0000000ac047', now(), now());

-- Verified TOTP-factoren voor 5), 24) en 25).
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values
  ('00000000-0000-0000-0000-0000000ac0f1', '00000000-0000-0000-0000-0000000ac016', null,
   'totp', 'verified', now(), now(), 'AKBSECRETNOOP'),
  ('00000000-0000-0000-0000-0000000ac0f2', '00000000-0000-0000-0000-0000000ac044', null,
   'totp', 'verified', now(), now(), 'AKBSECRETRESET'),
  ('00000000-0000-0000-0000-0000000ac0f3', '00000000-0000-0000-0000-0000000ac045', null,
   'totp', 'verified', now(), now(), 'AKBSECRETINGEBRUIK');

insert into members (id, name, role, pin_hash, balance_cents, archived, email, invited_at,
                     auth_user_id, invited_auth_user_id) values
  ('00000000-0000-0000-0000-0000000ac081', 'AKB Beheerder', 'beheerder', null, 0, false,
   'akb-beheerder@test.local', null, '00000000-0000-0000-0000-0000000ac001', null),
  ('00000000-0000-0000-0000-0000000ac091', 'AKB Onbevestigd', 'bardienst', null, 0, false,
   'akb-onbevestigd@test.local', now(), null, '00000000-0000-0000-0000-0000000ac011'),
  ('00000000-0000-0000-0000-0000000ac092', 'AKB Password', 'beheerder', null, 0, false,
   'akb-password@test.local', now(), null, '00000000-0000-0000-0000-0000000ac012'),
  ('00000000-0000-0000-0000-0000000ac093', 'AKB Amr', 'bardienst', null, 0, false,
   'akb-amr@test.local', now(), null, '00000000-0000-0000-0000-0000000ac013'),
  ('00000000-0000-0000-0000-0000000ac094', 'AKB Ander', 'beheerder', null, 0, false,
   'akb-ander@test.local', now(), null, '00000000-0000-0000-0000-0000000ac014'),
  ('00000000-0000-0000-0000-0000000ac096', 'AKB Wachtwoord', 'beheerder', null, 0, false,
   'akb-wachtwoord@test.local', now(), null, '00000000-0000-0000-0000-0000000ac016'),
  ('00000000-0000-0000-0000-0000000ac097', 'AKB Archief', 'bardienst', null, 0, true,
   'akb-archief@test.local', now(), null, '00000000-0000-0000-0000-0000000ac017'),
  ('00000000-0000-0000-0000-0000000ac098', 'AKB Sessie', 'bardienst', null, 0, false,
   'akb-sessie@test.local', now(), null, '00000000-0000-0000-0000-0000000ac018'),
  ('00000000-0000-0000-0000-0000000ac099', 'AKB Lid Adres', 'bardienst', null, 0, false,
   'akb-lid-adres@test.local', now(), null, '00000000-0000-0000-0000-0000000ac019'),
  -- 9): ac9a is al aan het account gekoppeld; ac9b is er ook aan gebonden.
  ('00000000-0000-0000-0000-0000000ac09a', 'AKB Al Gekoppeld', 'bardienst', null, 0, false,
   'akb-gekoppeld@test.local', now(), '00000000-0000-0000-0000-0000000ac01a', null),
  ('00000000-0000-0000-0000-0000000ac09b', 'AKB Tweede Op Account', 'bardienst', null, 0, false,
   'akb-gekoppeld@test.local', now(), null, '00000000-0000-0000-0000-0000000ac01a'),
  ('00000000-0000-0000-0000-0000000ac09c', 'AKB Dubbel Een', 'bardienst', null, 0, false,
   'akb-dubbel@test.local', now(), null, '00000000-0000-0000-0000-0000000ac01b'),
  ('00000000-0000-0000-0000-0000000ac09d', 'AKB Dubbel Twee', 'bardienst', null, 0, false,
   'akb-dubbel@test.local', now(), null, '00000000-0000-0000-0000-0000000ac01b'),
  ('00000000-0000-0000-0000-0000000ac09e', 'AKB Bardienst', 'bardienst', null, 0, false,
   'akb-bardienst@test.local', now(), null, '00000000-0000-0000-0000-0000000ac01c'),
  ('00000000-0000-0000-0000-0000000ac09f', 'AKB Beheer', 'beheerder', null, 0, false,
   'akb-beheer@test.local', now(), null, '00000000-0000-0000-0000-0000000ac01d'),
  ('00000000-0000-0000-0000-0000000ac0a0', 'AKB Wijzig', 'bardienst', null, 0, false,
   'akb-wijzig@test.local', now(), null, '00000000-0000-0000-0000-0000000ac020'),
  ('00000000-0000-0000-0000-0000000ac0a1', 'AKB Wis', 'bardienst', null, 0, false,
   'akb-wis@test.local', now(), null, '00000000-0000-0000-0000-0000000ac021'),
  ('00000000-0000-0000-0000-0000000ac0a2', 'AKB Hoofd', 'bardienst', null, 0, false,
   'akb-hoofd@test.local', now(), null, '00000000-0000-0000-0000-0000000ac022'),
  -- 16)-18): nog niet uitgenodigd.
  ('00000000-0000-0000-0000-0000000ac0b0', 'AKB Uitnodig', 'bardienst', null, 0, false,
   'akb-uitnodig@test.local', null, null, null),
  -- 20)-22): gemengde hoofdletters in members.email; echte pin_hash zodat de
  -- scrub-assertie niet vacuous is.
  ('00000000-0000-0000-0000-0000000ac0c0', 'AKB Happy', 'bardienst', crypt('1234', gen_salt('bf')), 0, false,
   'AKB-Happy@Test.Local', now(), null, '00000000-0000-0000-0000-0000000ac040'),
  ('00000000-0000-0000-0000-0000000ac0c1', 'AKB Magic', 'lid', null, 0, false,
   'akb-magic@test.local', now(), null, '00000000-0000-0000-0000-0000000ac041'),
  ('00000000-0000-0000-0000-0000000ac0c2', 'AKB Otp', 'lid', null, 0, false,
   'akb-otp@test.local', now(), null, '00000000-0000-0000-0000-0000000ac042'),
  ('00000000-0000-0000-0000-0000000ac0c3', 'AKB Reset', 'beheerder', null, 0, false,
   'akb-reset@test.local', now(), null, '00000000-0000-0000-0000-0000000ac043'),
  ('00000000-0000-0000-0000-0000000ac0c4', 'AKB Mfa', 'beheerder', null, 0, false,
   'akb-mfa@test.local', now(), null, '00000000-0000-0000-0000-0000000ac044'),
  -- 25): ac0c5 is al aan het account gekoppeld; ac0c6 is er ook aan gebonden.
  ('00000000-0000-0000-0000-0000000ac0c5', 'AKB In Gebruik', 'bardienst', null, 0, false,
   'akb-in-gebruik@test.local', now(), '00000000-0000-0000-0000-0000000ac045', null),
  ('00000000-0000-0000-0000-0000000ac0c6', 'AKB In Gebruik Twee', 'bardienst', null, 0, false,
   'akb-in-gebruik@test.local', now(), null, '00000000-0000-0000-0000-0000000ac045'),
  ('00000000-0000-0000-0000-0000000ac0c7', 'AKB Variant', 'beheerder', null, 0, false,
   'akb-variant@test.local', now(), null, '00000000-0000-0000-0000-0000000ac046');

-- ═══ Negatief: link_invited_member_account / link_lid_member_account ═════

-- 1) Onbevestigd account kan niet koppelen, ook met amr invite.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac011', '00000000-0000-0000-0000-0000000ac011', 'invite');
select is((select link_invited_member_account() is null), true,
  'een onbevestigd account koppelt niet (email_confirmed_at is null)');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac091'), null,
  'het lid van het onbevestigde account blijft ongekoppeld');

-- 2) Bevestigd, maar geen mailbewijs: amr password, zoals een
--    wachtwoordsignup met "Confirm email" uit.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac012', '00000000-0000-0000-0000-0000000ac012', 'password');
select is((select link_invited_member_account() is null), true,
  'een bevestigd account met alleen amr password koppelt niet: bevestigd is geen bewijs van mailbezit');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac092'), null,
  'het lid blijft ongekoppeld na een wachtwoordsessie');

-- 3) amr ontbreekt / is geen array / bevat alleen token_refresh.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac013', '00000000-0000-0000-0000-0000000ac013', null);
select is((select link_invited_member_account() is null), true,
  'een sessie zonder amr-claim koppelt niet');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac093'), null,
  'het lid blijft ongekoppeld zonder amr-claim');

select pg_temp.raw_claims('00000000-0000-0000-0000-0000000ac013',
  '{"sub":"00000000-0000-0000-0000-0000000ac013","session_id":"00000000-0000-0000-0000-0000000ac013","amr":"invite"}');
select is((select link_invited_member_account() is null), true,
  'een amr-claim die geen array is, koppelt niet');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac093'), null,
  'het lid blijft ongekoppeld met een amr die geen array is');

select pg_temp.claims('00000000-0000-0000-0000-0000000ac013', '00000000-0000-0000-0000-0000000ac013', 'token_refresh');
select is((select link_invited_member_account() is null), true,
  'een amr met alleen token_refresh koppelt niet');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac093'), null,
  'het lid blijft ongekoppeld met alleen token_refresh');

-- 4) Ander auth-uid dan het uitgenodigde: zelfde adres (andere
--    hoofdletters), bevestigd, amr magiclink, maar invited_auth_user_id wijst
--    naar het eerste account.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac015', '00000000-0000-0000-0000-0000000ac015', 'magiclink');
select is((select link_invited_member_account() is null), true,
  'een ander account op hetzelfde adres dan het uitgenodigde koppelt niet');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac094'), null,
  'het lid blijft ongekoppeld voor een account waaraan het niet gebonden is');

-- 5) Een no-op raakt niets aan: gebonden, bevestigd account met wachtwoord,
--    factor en een tweede sessie, maar amr password. (Was: "account met
--    wachtwoord koppelt niet"; dat geval is nu positief, zie 23.)
select pg_temp.claims('00000000-0000-0000-0000-0000000ac016', '00000000-0000-0000-0000-0000000ac052', 'password');
select is((select link_invited_member_account() is null), true,
  'een gebonden account met wachtwoord en alleen amr password koppelt niet');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac096'), null,
  'het lid blijft ongekoppeld na de no-op');
select ok(
  (select encrypted_password = crypt('geheim', encrypted_password)
     from auth.users where id = '00000000-0000-0000-0000-0000000ac016'),
  'een no-op laat het wachtwoord staan');
select ok(exists (select 1 from auth.mfa_factors where id = '00000000-0000-0000-0000-0000000ac0f1'),
  'een no-op laat de MFA-factor staan');
select ok(exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000ac053'),
  'een no-op laat de andere sessie staan');

-- 6) Gearchiveerd lid, verder alles in orde.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac017', '00000000-0000-0000-0000-0000000ac017', 'invite');
select is((select link_invited_member_account() is null), true,
  'een gearchiveerd lid is niet koppelbaar');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac097'), null,
  'het gearchiveerde lid blijft ongekoppeld');

-- 7) Geen session_id-claim.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac018', null, 'invite');
select is((select link_invited_member_account() is null), true,
  'een sessie zonder session_id-claim koppelt niet');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac098'), null,
  'het lid blijft ongekoppeld zonder session_id');

-- 8) Adres in auth.users wijkt af van members.email (gebonden id klopt).
select pg_temp.claims('00000000-0000-0000-0000-0000000ac019', '00000000-0000-0000-0000-0000000ac019', 'invite');
select is((select link_invited_member_account() is null), true,
  'een gebonden account op een ander adres dan members.email koppelt niet');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac099'), null,
  'het lid blijft ongekoppeld als de adressen verschillen');

-- 9) Account al aan een ander lid gekoppeld: no-op, geen unique-violation.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac01a', '00000000-0000-0000-0000-0000000ac01a', 'invite');
select lives_ok($$ select link_invited_member_account() $$,
  'een al gekoppeld account geeft geen unique-violation');
select is((select link_invited_member_account() is null), true,
  'een al gekoppeld account koppelt geen tweede lid');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac09b'), null,
  'het tweede lid op dat account blijft ongekoppeld');

-- 10) Twee leden gebonden aan hetzelfde id: geen van beide gekoppeld.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac01b', '00000000-0000-0000-0000-0000000ac01b', 'invite');
select is((select link_invited_member_account() is null), true,
  'twee leden gebonden aan hetzelfde account: geen koppeling');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac09c'), null,
  'het eerste van de twee leden blijft ongekoppeld');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac09d'), null,
  'het tweede van de twee leden blijft ongekoppeld');

-- 11) link_lid_member_account met een verder geldige bardienst- en
--     beheerder-rij: het rolfilter blijft.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac01c', '00000000-0000-0000-0000-0000000ac01c', 'otp');
select is((select link_lid_member_account() is null), true,
  'link_lid_member_account koppelt geen verder geldige bardienst-rij');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac09e'), null,
  'de bardienst-rij blijft ongekoppeld via link_lid_member_account');

select pg_temp.claims('00000000-0000-0000-0000-0000000ac01d', '00000000-0000-0000-0000-0000000ac01d', 'otp');
select is((select link_lid_member_account() is null), true,
  'link_lid_member_account koppelt geen verder geldige beheerder-rij');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac09f'), null,
  'de beheerder-rij blijft ongekoppeld via link_lid_member_account');

-- 12) De interne helper is voor geen API-rol uitvoerbaar.
select ok(not has_function_privilege('authenticated', 'public.link_member_account_internal(text)', 'EXECUTE'),
  'link_member_account_internal is niet uitvoerbaar voor authenticated');
select ok(not has_function_privilege('anon', 'public.link_member_account_internal(text)', 'EXECUTE'),
  'link_member_account_internal is niet uitvoerbaar voor anon');

-- ═══ update_member_email ═════════════════════════════════════════════════

-- 13) Adreswijziging wist de uitnodiging; daarna koppelt het oude gebonden
--     account niet meer, ook niet als het in auth.users op het nieuwe adres
--     staat.
select pg_temp.act_as_beheerder('00000000-0000-0000-0000-0000000ac001');
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000ac0a0', 'akb-nieuw@test.local') $$,
  'update_member_email wijzigt het adres van een uitgenodigd lid');
select ok(
  (select invited_at is null and invited_auth_user_id is null
     from members where id = '00000000-0000-0000-0000-0000000ac0a0'),
  'een adreswijziging wist invited_at en invited_auth_user_id');

update auth.users set email = 'akb-nieuw@test.local'
  where id = '00000000-0000-0000-0000-0000000ac020';
select pg_temp.claims('00000000-0000-0000-0000-0000000ac020', '00000000-0000-0000-0000-0000000ac020', 'invite');
select is((select link_invited_member_account() is null), true,
  'na een adreswijziging koppelt het oude gebonden account niet, ook niet op het nieuwe adres');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac0a0'), null,
  'het lid blijft ongekoppeld na de adreswijziging');

-- 14) Adres wissen wist ook.
select pg_temp.act_as_beheerder('00000000-0000-0000-0000-0000000ac001');
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000ac0a1', '') $$,
  'update_member_email wist het adres van een uitgenodigd lid');
select ok(
  (select email is null and invited_at is null and invited_auth_user_id is null
     from members where id = '00000000-0000-0000-0000-0000000ac0a1'),
  'adres wissen wist ook invited_at en invited_auth_user_id');

-- 15) Alleen hoofdletters gewijzigd: de uitnodiging blijft.
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000ac0a2', 'AKB-Hoofd@Test.Local') $$,
  'update_member_email wijzigt alleen de hoofdletters');
select ok(
  (select email = 'AKB-Hoofd@Test.Local' and invited_at is not null
          and invited_auth_user_id = '00000000-0000-0000-0000-0000000ac022'
     from members where id = '00000000-0000-0000-0000-0000000ac0a2'),
  'alleen hoofdletters wijzigen laat invited_at en invited_auth_user_id staan');

-- ═══ mark_member_invite_sent(uuid, uuid) ═════════════════════════════════

-- 16) Onbekend p_auth_user_id.
select throws_ok(
  $$ select mark_member_invite_sent('00000000-0000-0000-0000-0000000ac0b0', '00000000-0000-0000-0000-0000000acfff') $$,
  'P0001', 'invite_account_mismatch',
  'mark_member_invite_sent weigert een onbekend auth-account (invite_account_mismatch)');

-- 17) Auth-account met een ander adres.
select throws_ok(
  $$ select mark_member_invite_sent('00000000-0000-0000-0000-0000000ac0b0', '00000000-0000-0000-0000-0000000ac030') $$,
  'P0001', 'invite_account_mismatch',
  'mark_member_invite_sent weigert een auth-account op een ander adres (invite_account_mismatch)');
select ok(
  (select invited_at is null and invited_auth_user_id is null
     from members where id = '00000000-0000-0000-0000-0000000ac0b0'),
  'na invite_account_mismatch zijn invited_at en invited_auth_user_id ongewijzigd');

-- 18) Happy: het account staat op het adres van het lid (andere
--     hoofdletters).
select lives_ok(
  $$ select mark_member_invite_sent('00000000-0000-0000-0000-0000000ac0b0', '00000000-0000-0000-0000-0000000ac031') $$,
  'mark_member_invite_sent registreert een uitnodiging naar het account op het adres van het lid');
select ok(
  (select invited_at is not null and invited_auth_user_id = '00000000-0000-0000-0000-0000000ac031'
     from members where id = '00000000-0000-0000-0000-0000000ac0b0'),
  'mark_member_invite_sent zet invited_at en invited_auth_user_id');

-- ═══ Positief ════════════════════════════════════════════════════════════

-- 20) Happy path: gebonden, bevestigd, geen wachtwoord, amr invite.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac040', '00000000-0000-0000-0000-0000000ac050', 'invite');
select lives_ok(
  $$ create temp table akb_happy as select * from link_invited_member_account() $$,
  'link_invited_member_account koppelt het gebonden, bevestigde account zonder wachtwoord met amr invite');
select is((select auth_user_id from akb_happy), '00000000-0000-0000-0000-0000000ac040'::uuid,
  'de teruggegeven rij heeft auth_user_id = de eigen auth.uid()');
select is((select pin_hash from akb_happy), null,
  'de teruggegeven rij heeft pin_hash gescrubd');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac0c0'),
  '00000000-0000-0000-0000-0000000ac040'::uuid,
  'de koppeling staat in de tabel (members.email met gemengde hoofdletters)');

-- 21) Andere Auth-sessies van het account zijn weg, de eigen niet.
select ok(not exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000ac051'),
  'de andere Auth-sessie van het account is na de koppeling beëindigd');
select ok(exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000ac050'),
  'de eigen Auth-sessie bestaat na de koppeling nog');

-- 22) Portal-route: link_lid_member_account voor een lid, met amr magiclink
--     en met amr otp.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac041', '00000000-0000-0000-0000-0000000ac041', 'magiclink');
select is((select auth_user_id from link_lid_member_account()), '00000000-0000-0000-0000-0000000ac041'::uuid,
  'link_lid_member_account koppelt een lid met amr magiclink');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac0c1'),
  '00000000-0000-0000-0000-0000000ac041'::uuid,
  'de magiclink-koppeling staat in de tabel');

select pg_temp.claims('00000000-0000-0000-0000-0000000ac042', '00000000-0000-0000-0000-0000000ac042', 'otp');
select is((select auth_user_id from link_lid_member_account()), '00000000-0000-0000-0000-0000000ac042'::uuid,
  'link_lid_member_account koppelt een lid met amr otp');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac0c2'),
  '00000000-0000-0000-0000-0000000ac042'::uuid,
  'de otp-koppeling staat in de tabel');

-- 23) Account met wachtwoord wordt gekoppeld; het wachtwoord is daarna
--     leeg. Het hoofdpad: GoTrue zet bij het openen van de uitnodiging zelf
--     een tijdelijk wachtwoord (verify.go:317-329), en via token_hash is
--     amr otp (verify.go:285).
select pg_temp.claims('00000000-0000-0000-0000-0000000ac043', '00000000-0000-0000-0000-0000000ac043', 'otp');
select lives_ok(
  $$ create temp table akb_reset as select * from link_invited_member_account() $$,
  'link_invited_member_account koppelt een gebonden account met wachtwoord en amr otp');
select is((select auth_user_id from akb_reset), '00000000-0000-0000-0000-0000000ac043'::uuid,
  'de teruggegeven rij heeft auth_user_id = het account met wachtwoord');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac0c3'),
  '00000000-0000-0000-0000-0000000ac043'::uuid,
  'de koppeling van het account met wachtwoord staat in de tabel');
select is((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000ac043'), '',
  'na het koppelen is het wachtwoord van het account leeg');

-- 24) MFA-factoren zijn weg na het koppelen.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac044', '00000000-0000-0000-0000-0000000ac044', 'otp');
select is((select auth_user_id from link_invited_member_account()), '00000000-0000-0000-0000-0000000ac044'::uuid,
  'link_invited_member_account koppelt een gebonden account met een verified factor');
select ok(not exists (select 1 from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000ac044'),
  'na het koppelen heeft het account geen MFA-factor meer');

-- 25) Al gekoppeld account: een in gebruik zijnd wachtwoord wordt nooit
--     gewist, ook niet als er nog een tweede lid aan gebonden is.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac045', '00000000-0000-0000-0000-0000000ac054', 'otp');
select is((select link_invited_member_account() is null), true,
  'een al gekoppeld account met amr otp koppelt geen tweede lid');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac0c6'), null,
  'het tweede lid op het al gekoppelde account blijft ongekoppeld');
select ok(
  (select encrypted_password = crypt('in-gebruik', encrypted_password)
     from auth.users where id = '00000000-0000-0000-0000-0000000ac045'),
  'het wachtwoord van een al gekoppeld account blijft staan');
select ok(exists (select 1 from auth.mfa_factors where id = '00000000-0000-0000-0000-0000000ac0f3'),
  'de MFA-factor van een al gekoppeld account blijft staan');
select ok(exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000ac055'),
  'de andere sessie van een al gekoppeld account blijft staan');

-- 26) Ander account op hetzelfde adres als het gebonden account (variant van
--     4): niets gewist.
select pg_temp.claims('00000000-0000-0000-0000-0000000ac047', '00000000-0000-0000-0000-0000000ac056', 'magiclink');
select is((select link_invited_member_account() is null), true,
  'een niet-gebonden account op hetzelfde adres koppelt niet');
select is((select auth_user_id from members where id = '00000000-0000-0000-0000-0000000ac0c7'), null,
  'het lid blijft ongekoppeld voor het niet-gebonden account');
select ok(
  (select encrypted_password = crypt('van-een-ander', encrypted_password)
     from auth.users where id = '00000000-0000-0000-0000-0000000ac047'),
  'het wachtwoord van het niet-gebonden account blijft staan');
select ok(exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000ac057'),
  'de andere sessie van het niet-gebonden account blijft staan');

select * from finish();
rollback;
