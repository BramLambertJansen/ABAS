-- De sessie-RPC's en beheerderingrepen van dienst-per-sessie (0028,
-- docs/features/dienst-per-sessie.md → RPC's, Schermflow, Inactiviteit,
-- Beheerder): register_bar_session(_server), touch_bar_session,
-- end_bar_session, my_bar_state, admin_end_shift, admin_take_over_shift,
-- admin_end_bar_session en close_inactive_bar_sessions. Zowel de gewenste
-- uitkomst als elke weigergrond. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(116);

-- ── Sessie-helper (dienst per sessie, ADR 0016) ────────────────────────────
-- De bar-RPC's eisen een geregistreerde bar-sessie met een actieve koppeling
-- aan de dienst (require_shift_session, 0028). Deze helper registreert voor
-- een lid een sessie in modus `bar` (rechtstreeks geïnsert), koppelt haar aan
-- `p_shift` en zet de JWT-claims. Het lid krijgt zo nodig een auth-account.
-- `p_session`: het sessie-id (standaard het lid-id); geef een ander id mee voor
-- een tweede of nieuwe sessie van hetzelfde lid.
create function pg_temp.act_as_bar(p_member uuid, p_shift uuid default null, p_session uuid default null)
returns void
language plpgsql
as $fn$
declare
  v_auth uuid;
  v_session uuid;
begin
  select auth_user_id into v_auth from members where id = p_member;
  if v_auth is null then
    v_auth := p_member;
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_auth::text || '@bar.test.local', crypt('not-used', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}'
    ) on conflict (id) do nothing;
    update members set auth_user_id = v_auth where id = p_member;
  end if;
  insert into bar_sessions (auth_session_id, member_id, mode)
  values (coalesce(p_session, p_member), p_member, 'bar')
  on conflict (auth_session_id) do nothing;
  select id into v_session from bar_sessions where auth_session_id = coalesce(p_session, p_member);
  if p_shift is not null then
    insert into shift_sessions (shift_id, bar_session_id)
    values (p_shift, v_session)
    on conflict do nothing;
  end if;
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth::text, 'session_id', coalesce(p_session, p_member)::text)::text,
    true
  );
end;
$fn$;

create function pg_temp.act_as_user(p_auth_user uuid, p_mode text default 'beheer')
returns void
language plpgsql
as $fn$
declare
  v_member uuid;
begin
  select id into v_member from members where auth_user_id = p_auth_user;
  -- De Auth-sessie uit het token: register_bar_session eist haar
  -- (0040, ADR 0020 → Beslissing 8).
  insert into auth.sessions (id, user_id, created_at, updated_at)
  values (p_auth_user, p_auth_user, now(), now())
  on conflict (id) do nothing;
  if v_member is not null then
    insert into bar_sessions (auth_session_id, member_id, mode)
    values (p_auth_user, v_member, p_mode)
    on conflict (auth_session_id) do nothing;
  end if;
  perform set_config('request.jwt.claim.sub', p_auth_user::text, true);
  -- Een beheersessie is altijd aal2: register_bar_session('beheer') en
  -- require_beheer_session eisen dat (ADR 0017, 0034).
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_auth_user::text, 'session_id', p_auth_user::text,
      'aal', case when p_mode = 'beheer' then 'aal2' else 'aal1' end
    )::text,
    true
  );
end;
$fn$;

-- ── Fixtures ──────────────────────────────────────────────────────────────

update shifts set ended_at = now() where ended_at is null;
-- Sessies van eerdere suites (e2e) mogen de tellingen hieronder niet raken.
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd' where ended_at is null;
update admin_notifications set resolved_at = now() where resolved_at is null;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-00000000e0a0', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sr-admin@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000e0a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sr-staff@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000e0a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sr-lid@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000e0a3', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sr-admin2@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-00000000e010', 'SR Beheerder', 'beheerder', null, 0, false, '00000000-0000-0000-0000-00000000e0a0'),
  ('00000000-0000-0000-0000-00000000e011', 'SR Bardienst', 'bardienst', null, 0, false, '00000000-0000-0000-0000-00000000e0a1'),
  ('00000000-0000-0000-0000-00000000e012', 'SR Lid',       'lid',       null, 0, false, '00000000-0000-0000-0000-00000000e0a2'),
  ('00000000-0000-0000-0000-00000000e013', 'SR Beheerder Twee', 'beheerder', null, 0, false, '00000000-0000-0000-0000-00000000e0a3'),
  ('00000000-0000-0000-0000-00000000e014', 'SR Zonder account', 'bardienst', null, 0, false, null),
  ('00000000-0000-0000-0000-00000000e015', 'SR Bardienst Twee', 'bardienst', null, 0, false, null);

-- Beide beheerders hebben een geverifieerde tweede factor: zonder factor
-- geeft register_bar_session('beheer') `mfa_not_enrolled` (0034, ADR 0017).
-- Die weigering zelf staat in beheer_tweede_factor.test.sql.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000e0a0', null, 'totp', 'verified', now(), now(), 'SRADMINSECRET'),
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000e0a3', null, 'totp', 'verified', now(), now(), 'SRADMIN2SECRET');

-- De Auth-sessies waarmee hieronder register_bar_session wordt aangeroepen:
-- die eist een rij in auth.sessions met id = session_id-claim en user_id =
-- auth.uid() (0040, ADR 0020 → Beslissing 8).
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000e0d1', '00000000-0000-0000-0000-00000000e0a1', now(), now()),
  ('00000000-0000-0000-0000-00000000e0d2', '00000000-0000-0000-0000-00000000e0a0', now(), now()),
  ('00000000-0000-0000-0000-00000000e0d3', '00000000-0000-0000-0000-00000000e0a0', now(), now()),
  ('00000000-0000-0000-0000-00000000e0d9', '00000000-0000-0000-0000-00000000e0a1', now(), now());

insert into activity_types (id, name, archived) values
  ('00000000-0000-0000-0000-00000000e0b0', 'SR Training', false);
insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-00000000e0c0', 'SR Pils', 'Bier', 250, false);

-- ═══ register_bar_session ═════════════════════════════════════════════════

-- Geen claim.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e0a1"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a1', true);
select throws_ok(
  $$ select register_bar_session('bar') $$,
  'P0001', 'no_bar_session',
  'register_bar_session zonder session_id-claim: no_bar_session'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a1","session_id":"00000000-0000-0000-0000-00000000e0d1"}', true);
select throws_ok(
  $$ select register_bar_session('kassa') $$,
  'P0001', 'invalid_mode',
  'register_bar_session met een onbekende modus: invalid_mode'
);
select lives_ok(
  $$ select register_bar_session('bar') $$,
  'een bardienst registreert zijn sessie in modus bar'
);
select is(
  (select mode from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d1'),
  'bar',
  'de sessie is vastgelegd met modus bar'
);
select is(
  (select member_id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d1'),
  '00000000-0000-0000-0000-00000000e011'::uuid,
  'het lid van de sessie komt uit auth.uid(), niet uit een parameter'
);
select is(
  (select (register_bar_session('bar')).id),
  (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d1'),
  'nogmaals registreren met dezelfde modus geeft dezelfde sessie terug'
);
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'no_admin_role',
  'een bardienst kan zich niet in modus beheer registreren'
);

-- Een beheerder met een bar-sessie (bv. na een PIN-login): nooit naar beheer,
-- ook niet met aal2 (na de code; zonder code is het `aal2_required`).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a0', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a0","session_id":"00000000-0000-0000-0000-00000000e0d2","aal":"aal2"}', true);
select lives_ok($$ select register_bar_session('bar') $$, 'een beheerder registreert een bar-sessie');
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'mode_locked',
  'een sessie wisselt nooit van modus: bar → beheer geeft mode_locked (een PIN-sessie komt nooit in beheer)'
);

-- Een beheerder: beide modi, elk in een eigen sessie.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a0', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a0","session_id":"00000000-0000-0000-0000-00000000e0d3","aal":"aal2"}', true);
select lives_ok(
  $$ select register_bar_session('beheer') $$,
  'een beheerder registreert een sessie in modus beheer'
);
select throws_ok(
  $$ select register_bar_session('bar') $$,
  'P0001', 'mode_locked',
  'beheer → bar in dezelfde sessie: mode_locked (modus wisselen = uitloggen, ADR 0003)'
);

-- De sessie van iemand anders. Sinds 0040 (ADR 0020 → Beslissing 8) houdt
-- de Auth-sessiecontrole dit al tegen: e0d3 staat in auth.sessions op e0a0,
-- niet op de aanroeper, dus session_ended vóór de controle op bar_sessions.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a3', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a3","session_id":"00000000-0000-0000-0000-00000000e0d3","aal":"aal2"}', true);
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'session_ended',
  'een sessie-id dat al van een ander lid is, kan niet overgenomen worden (Auth-sessie van een ander account)'
);

-- De eigen Auth-sessie, maar de bar_sessions-rij met dat id staat op een
-- ander lid. Langs de API kan die toestand niet ontstaan (register_bar_session
-- zet altijd het eigen lid), maar de tak `v_session.member_id <> v_member.id`
-- blijft de laatste verdediging. Rechtstreeks ingevoegd, langs de RPC om:
-- e0d4 staat in auth.sessions op de aanroeper e0a3, de bar_sessions-rij op
-- de bardienst e011.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000e0d4', '00000000-0000-0000-0000-00000000e0a3', now(), now());
insert into bar_sessions (auth_session_id, member_id, mode) values
  ('00000000-0000-0000-0000-00000000e0d4', '00000000-0000-0000-0000-00000000e011', 'bar');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a3', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a3","session_id":"00000000-0000-0000-0000-00000000e0d4","aal":"aal2"}', true);
select throws_ok(
  $$ select register_bar_session('bar') $$,
  'P0001', 'no_bar_role',
  'eigen Auth-sessie, maar de bar-sessie met dat id staat op een ander lid: no_bar_role'
);
select is(
  (select member_id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d4'),
  '00000000-0000-0000-0000-00000000e011'::uuid,
  'de bar-sessie van het andere lid is niet overgenomen'
);

-- Beëindigd: niet opnieuw te registreren.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a1', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a1","session_id":"00000000-0000-0000-0000-00000000e0d1"}', true);
update bar_sessions set ended_at = now(), end_reason = 'inactief'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0d1';
select throws_ok(
  $$ select register_bar_session('bar') $$,
  'P0001', 'session_ended',
  'een gesloten (bv. inactieve) sessie registreert zich niet opnieuw'
);

-- Gearchiveerd lid.
update members set archived = true where id = '00000000-0000-0000-0000-00000000e011';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a1","session_id":"00000000-0000-0000-0000-00000000e0d9"}', true);
select throws_ok(
  $$ select register_bar_session('bar') $$,
  'P0001', 'no_bar_role',
  'een gearchiveerd lid registreert geen sessie'
);
update members set archived = false where id = '00000000-0000-0000-0000-00000000e011';

-- Een session_id-claim zonder rij in auth.sessions (uitgelogd, of verwijderd
-- bij het koppelen van een account): geen nieuwe bar-sessie (0040, ADR 0020
-- → Beslissing 8).
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a1","session_id":"00000000-0000-0000-0000-00000000e0de"}', true);
select throws_ok(
  $$ select register_bar_session('bar') $$,
  'P0001', 'session_ended',
  'register_bar_session met een session_id zonder Auth-sessie: session_ended'
);
select ok(
  not exists (select 1 from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0de'),
  'zonder Auth-sessie wordt geen bar_sessions-rij aangemaakt'
);

-- ═══ register_bar_session_server ══════════════════════════════════════════

insert into bar_devices (id, token_hash) values
  ('00000000-0000-0000-0000-00000000e0e0', 'sr-device');

select is(
  (select (register_bar_session_server(
     '00000000-0000-0000-0000-00000000e0d5',
     '00000000-0000-0000-0000-00000000e011',
     '00000000-0000-0000-0000-00000000e0e0')).mode),
  'bar',
  'register_bar_session_server registreert altijd in modus bar'
);
select is(
  (select device_id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d5'),
  '00000000-0000-0000-0000-00000000e0e0'::uuid,
  'het apparaat wordt op de sessie vastgelegd'
);
select is(
  (select count(*)::int from (select register_bar_session_server(
     '00000000-0000-0000-0000-00000000e0d5',
     '00000000-0000-0000-0000-00000000e011',
     '00000000-0000-0000-0000-00000000e0e0')) x),
  1,
  'dezelfde sessie nogmaals registreren is idempotent'
);
select throws_ok(
  $$ select register_bar_session_server(gen_random_uuid(), '00000000-0000-0000-0000-00000000e012', null) $$,
  'P0001', 'not_allowed',
  'register_bar_session_server weigert een lid zonder bar-rol'
);
select throws_ok(
  $$ select register_bar_session_server(gen_random_uuid(), '00000000-0000-0000-0000-00000000e014', null) $$,
  'P0001', 'no_account',
  'register_bar_session_server weigert een lid zonder account'
);
select throws_ok(
  $$ select register_bar_session_server(gen_random_uuid(), gen_random_uuid(), null) $$,
  'P0001', 'not_allowed',
  'register_bar_session_server weigert een onbekend lid'
);
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0d5';
select throws_ok(
  $$ select register_bar_session_server(
       '00000000-0000-0000-0000-00000000e0d5',
       '00000000-0000-0000-0000-00000000e011', null) $$,
  'P0001', 'session_ended',
  'een beëindigde sessie wordt ook server-side niet opnieuw geregistreerd'
);

-- ═══ touch_bar_session ════════════════════════════════════════════════════

select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e011');
update bar_sessions set last_activity_at = now() - interval '30 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000e011';
select lives_ok($$ select touch_bar_session() $$, 'touch_bar_session werkt in modus bar');
select is(
  (select last_activity_at from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e011'),
  now(),
  'de hartslag zet last_activity_at'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-00000000e0a0');
update bar_sessions set last_activity_at = now() - interval '30 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0a0';
select lives_ok($$ select touch_bar_session() $$, 'touch_bar_session werkt ook in modus beheer');
select is(
  (select last_activity_at from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0a0'),
  now(),
  'de hartslag zet ook de beheer-sessie'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a0","session_id":"00000000-0000-0000-0000-00000000e0ff"}', true);
select throws_ok($$ select touch_bar_session() $$, 'P0001', 'no_bar_session',
  'touch_bar_session zonder geregistreerde sessie: no_bar_session');

select pg_temp.act_as_user('00000000-0000-0000-0000-00000000e0a0');
update bar_sessions set last_activity_at = now() - interval '61 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0a0';
select throws_ok($$ select touch_bar_session() $$, 'P0001', 'session_inactive',
  'een hartslag heropent een inactieve sessie niet');
update bar_sessions set last_activity_at = now()
  where auth_session_id = '00000000-0000-0000-0000-00000000e0a0';

-- ═══ end_bar_session ══════════════════════════════════════════════════════

-- Zonder dienst.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e015');
select throws_ok(
  $$ select end_bar_session(false, 'onzin') $$,
  'P0001', 'invalid_reason',
  'end_bar_session weigert een onbekende reden'
);
update bar_sessions set last_activity_at = now() - interval '30 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000e015';
select lives_ok(
  $$ select end_bar_session(false) $$,
  'uitloggen zonder open dienst'
);
select is(
  (select last_activity_at from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e015'),
  now() - interval '30 minutes',
  'uitloggen is geen activiteit (geen hartslag)'
);
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e015'),
  'uitgelogd',
  'de sessie is beëindigd met reden uitgelogd'
);
select throws_ok(
  $$ select touch_bar_session() $$,
  'P0001', 'session_ended',
  'na uitloggen weigert elke RPC de sessie (een database-feit, ook als het token nog geldig is)'
);
select throws_ok(
  $$ select end_bar_session(false) $$,
  'P0001', 'session_ended',
  'nogmaals uitloggen met een beëindigde sessie geeft session_ended (de client logt dan lokaal uit)'
);
select is(
  (select count(*)::int from admin_notifications where resolved_at is null),
  0,
  'uitloggen zonder dienst geeft geen melding'
);

-- Met dienst, open laten.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e011', null, '00000000-0000-0000-0000-00000000e0d7');
select start_shift('00000000-0000-0000-0000-00000000e0b0');
select lives_ok(
  $$ select end_bar_session(false) $$,
  'uitloggen met een open dienst, dienst open laten'
);
select is(
  (select count(*)::int from shifts where ended_at is null),
  1,
  'de dienst blijft open'
);
select is(
  (select left_reason from shift_sessions ss join shifts s on s.id = ss.shift_id where s.ended_at is null),
  'uitgelogd',
  'de koppeling eindigt met reden uitgelogd'
);
select is(
  (select reason from admin_notifications where resolved_at is null),
  'uitgelogd',
  'de wees-dienst geeft een melding voor de beheerders (reden uitgelogd)'
);
select is(
  (select count(*)::int from admin_notifications where resolved_at is null),
  1,
  'er is één melding per wees-dienst'
);

-- Met dienst, afsluiten.
update shifts set ended_at = now() where ended_at is null;
update admin_notifications set resolved_at = now() where resolved_at is null;
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e015', null, '00000000-0000-0000-0000-00000000e0d8');
select start_shift('00000000-0000-0000-0000-00000000e0b0');
select lives_ok(
  $$ select end_bar_session(true) $$,
  'uitloggen met de keuze de dienst af te sluiten'
);
select is(
  (select count(*)::int from shifts where ended_at is null),
  0,
  'de dienst is afgesloten'
);
select is(
  (select left_reason from shift_sessions ss join shifts s on s.id = ss.shift_id
    where s.started_session_id = (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d8')),
  'dienst_afgesloten',
  'de koppeling eindigt met reden dienst_afgesloten'
);
select is(
  (select count(*)::int from admin_notifications where resolved_at is null),
  0,
  'een afgesloten dienst geeft geen melding'
);

-- Een beheersessie die niet wordt hervat.
select pg_temp.act_as_user('00000000-0000-0000-0000-00000000e0a0');
select lives_ok(
  $$ select end_bar_session(false, 'niet_hervat') $$,
  'een beheersessie wordt na browser dicht en weer open gesloten (niet_hervat)'
);
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0a0'),
  'niet_hervat',
  'sluitreden niet_hervat'
);

-- ═══ my_bar_state ═════════════════════════════════════════════════════════

select set_config('request.jwt.claims', '{}', true);
select is(my_bar_state(), '{"session": null}'::jsonb, 'my_bar_state zonder claim: geen sessie');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a2', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a2","session_id":"00000000-0000-0000-0000-00000000e0aa"}', true);
select is(my_bar_state(), '{"session": null}'::jsonb, 'my_bar_state voor een lid-sessie: geen sessie en niets over diensten');

-- Fixture voor de rest: bardienst (e011) start een dienst; beheerder (e010) in bar-modus.
update shifts set ended_at = now() where ended_at is null;
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e011', null, '00000000-0000-0000-0000-00000000e0d9');
select start_shift('00000000-0000-0000-0000-00000000e0b0');

select is(
  (my_bar_state() -> 'session' ->> 'status'),
  'active',
  'my_bar_state: een actieve sessie'
);
select is(
  (my_bar_state() -> 'session' ->> 'member_name'),
  'SR Bardienst',
  'my_bar_state: wie er ingelogd is'
);
select is(
  (my_bar_state() -> 'shift' ->> 'activity_type_name'),
  'SR Training',
  'my_bar_state: de eigen dienst met het activiteittype'
);
select is(
  (my_bar_state() -> 'shift' ->> 'started_by_name'),
  'SR Bardienst',
  'my_bar_state: de starter van de eigen dienst'
);
select ok(
  not (my_bar_state() ? 'other_shift') and not (my_bar_state() ? 'notifications') and not (my_bar_state() ? 'admin'),
  'een bardienst met een eigen dienst krijgt geen data over andere diensten, meldingen of beheer'
);

-- my_bar_state schrijft niet.
update bar_sessions set last_activity_at = now() - interval '20 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0d9';
select my_bar_state();
select is(
  (select last_activity_at from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d9'),
  now() - interval '20 minutes',
  'my_bar_state is geen hartslag (het hervatscherm leest alleen)'
);
update bar_sessions set last_activity_at = now() where auth_session_id = '00000000-0000-0000-0000-00000000e0d9';

-- Een tweede sessie (beheerder, bar-modus) ziet de dienst elders.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e010');
select is(
  (my_bar_state() -> 'shift'),
  'null'::jsonb,
  'een sessie zonder eigen dienst heeft shift null'
);
select is(
  (my_bar_state() -> 'other_shift' ->> 'started_by_name'),
  'SR Bardienst',
  'de dienst elders: wie hem startte'
);
select is(
  (my_bar_state() -> 'other_shift' ->> 'orphan')::boolean,
  false,
  'de dienst elders is niet wees zolang er een sessie in werkt'
);
select is(
  (my_bar_state() -> 'other_shift' -> 'sessions' -> 0 ->> 'member_name'),
  'SR Bardienst',
  'de dienst elders: wie er ingelogd is'
);
select is(
  jsonb_array_length(my_bar_state() -> 'notifications'),
  0,
  'een beheerder ziet de (nu lege) lijst meldingen'
);

-- Overnemen door de beheerder.
select lives_ok(
  $$ select admin_take_over_shift((select id from shifts where ended_at is null)) $$,
  'een beheerder in bar-modus neemt de dienst over'
);
select is(
  (select left_reason from shift_sessions where bar_session_id = (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d9')),
  'overgenomen',
  'de bestaande koppeling krijgt reden overgenomen'
);
select is(
  (select count(*)::int from shift_sessions ss where ss.left_at is null
     and ss.bar_session_id = (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e010')),
  1,
  'de beheerder heeft nu een actieve koppeling'
);
select is(
  (select count(*)::int from shift_members where shift_id = (select id from shifts where ended_at is null)
     and member_id = '00000000-0000-0000-0000-00000000e010'),
  1,
  'de overnemer komt in de bezetting (12b)'
);
select is(
  (select started_by from shifts where ended_at is null),
  '00000000-0000-0000-0000-00000000e011'::uuid,
  'shifts.started_by blijft wie de dienst startte'
);
select is(
  (my_bar_state() -> 'shift' ->> 'id')::uuid,
  (select id from shifts where ended_at is null),
  'na overnemen heeft de beheerder de dienst als eigen dienst'
);

-- Het oude apparaat: sessie blijft ingelogd, kan niet meer in de dienst werken.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e011', null, '00000000-0000-0000-0000-00000000e0d9');
select throws_ok(
  $$ select place_order(
       (select id from shifts where ended_at is null), null,
       '[{"product_id":"00000000-0000-0000-0000-00000000e0c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-00000000e011'::uuid) $$,
  'P0001', 'session_not_on_shift',
  'na overnemen kan het oude apparaat niet meer in de dienst werken (bestelling geeft session_not_on_shift)'
);
select is(
  (my_bar_state() -> 'session' ->> 'status'),
  'active',
  'de sessie op het oude apparaat blijft ingelogd'
);
select is(
  (my_bar_state() -> 'last_left' ->> 'reason'),
  'overgenomen',
  'my_bar_state meldt waarom de dienst wegging (voor de melding "Je dienst is overgenomen")'
);

-- Een bardienst kan niet overnemen, niet afsluiten en niemand afmelden.
select throws_ok(
  $$ select admin_take_over_shift((select id from shifts where ended_at is null)) $$,
  'P0001', 'no_admin_role',
  'een bardienst kan een dienst niet overnemen'
);
select throws_ok(
  $$ select admin_end_shift((select id from shifts where ended_at is null)) $$,
  'P0001', 'no_admin_role',
  'een bardienst kan een dienst niet afsluiten via de beheerderroute'
);
select throws_ok(
  $$ select admin_end_bar_session((select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e010')) $$,
  'P0001', 'no_admin_role',
  'een bardienst kan geen sessie afmelden'
);

-- Overnemen: alleen in bar-modus, en niet als de eigen sessie al in een dienst werkt.
select pg_temp.act_as_user('00000000-0000-0000-0000-00000000e0a3');
select throws_ok(
  $$ select admin_take_over_shift((select id from shifts where ended_at is null)) $$,
  'P0001', 'wrong_mode',
  'overnemen kan niet vanuit modus beheer (het vraagt een bar-sessie op het nieuwe apparaat)'
);
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e010');
select throws_ok(
  $$ select admin_take_over_shift((select id from shifts where ended_at is null)) $$,
  'P0001', 'session_has_shift',
  'een sessie die al in een dienst werkt, neemt geen tweede over'
);
select is(my_bar_state() -> 'session' ->> 'mode', 'bar', 'stap: de beheerder werkt nog in bar-modus');

-- Afsluiten door een beheerder vanuit beheer-modus.
select pg_temp.act_as_user('00000000-0000-0000-0000-00000000e0a3');
select is(
  jsonb_array_length(my_bar_state() -> 'admin' -> 'shifts'),
  1,
  'het beheeroverzicht toont de open dienst'
);
select is(
  jsonb_array_length(my_bar_state() -> 'admin' -> 'shifts' -> 0 -> 'sessions'),
  1,
  'het beheeroverzicht toont de koppeling met de dienst'
);
select ok(
  jsonb_array_length(my_bar_state() -> 'admin' -> 'sessions') >= 2,
  'het beheeroverzicht toont de actieve sessies'
);
-- De id van de dienst die zo dichtgaat: eerdere delen van dit bestand sluiten
-- diensten met een kale update en laten hun koppelingen open, dus "alle
-- koppelingen" hieronder gaat over déze dienst.
select set_config('test.eind_shift', (select id::text from shifts where ended_at is null), true);
select lives_ok(
  $$ select admin_end_shift((select id from shifts where ended_at is null)) $$,
  'een beheerder sluit de dienst af vanuit modus beheer'
);
select is(
  (select count(*)::int from shifts where ended_at is null),
  0,
  'de dienst is gesloten'
);
select is(
  (select count(*)::int from shift_sessions
    where left_at is null and shift_id = current_setting('test.eind_shift')::uuid),
  0,
  'alle koppelingen van de dienst zijn gesloten'
);
select is(
  (select left_reason from shift_sessions ss where ss.bar_session_id = (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e010')),
  'afgesloten_door_beheerder',
  'de koppeling krijgt reden afgesloten_door_beheerder'
);
select throws_ok(
  $$ select admin_end_shift('00000000-0000-0000-0000-00000000e0ee') $$,
  'P0001', 'shift_not_open',
  'admin_end_shift op een dienst die al dicht is of niet bestaat: shift_not_open'
);

-- ═══ Wees-dienst en meldingen ═════════════════════════════════════════════

-- Nieuwe dienst door de bardienst; afmelden door de beheerder.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e011', null, '00000000-0000-0000-0000-00000000e0d9');
select start_shift('00000000-0000-0000-0000-00000000e0b0');
update bar_sessions set device_id = '00000000-0000-0000-0000-00000000e0e0'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0d9';
insert into bar_device_members (device_id, member_id, password_login_at)
  values ('00000000-0000-0000-0000-00000000e0e0', '00000000-0000-0000-0000-00000000e011', now());

select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e010');
select throws_ok(
  $$ select admin_end_bar_session(gen_random_uuid()) $$,
  'P0001', 'session_not_found',
  'admin_end_bar_session: onbekende sessie'
);
select lives_ok(
  $$ select admin_end_bar_session((select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d9')) $$,
  'een beheerder meldt het apparaat van een collega af'
);
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d9'),
  'afgemeld',
  'de sessie is afgemeld'
);
select is(
  (select ended_by from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d9'),
  '00000000-0000-0000-0000-00000000e010'::uuid,
  'ended_by is de beheerder die afmeldde'
);
select is(
  (select reason from admin_notifications where resolved_at is null),
  'afgemeld',
  'de dienst zonder apparaat geeft een melding (reden afgemeld)'
);
select isnt(
  (select revoked_at from bar_devices where id = '00000000-0000-0000-0000-00000000e0e0'),
  null,
  'afmelden trekt het PIN-vertrouwen van dat apparaat in'
);
select throws_ok(
  $$ select admin_end_bar_session((select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0d9')) $$,
  'P0001', 'target_session_ended',
  'een al afgemelde sessie afmelden: target_session_ended (niet de sessiecode session_ended)'
);
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e011', null, '00000000-0000-0000-0000-00000000e0d9');
select throws_ok(
  $$ select touch_bar_session() $$,
  'P0001', 'session_ended',
  'de afgemelde sessie wordt meteen geweigerd'
);
select is(
  (my_bar_state() -> 'session' ->> 'end_reason'),
  'afgemeld',
  'my_bar_state meldt de reden (voor de melding "Je bent afgemeld")'
);
select is(
  (my_bar_state() -> 'session' ->> 'left_shift_open')::boolean,
  true,
  'my_bar_state meldt dat de dienst bleef openstaan'
);

-- Meldingen zijn zichtbaar voor een beheerder en worden opgelost door overnemen.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e010');
select is(
  jsonb_array_length(my_bar_state() -> 'notifications'),
  1,
  'een beheerder ziet de melding in my_bar_state'
);
select is(
  my_bar_state() -> 'notifications' -> 0 ->> 'member_name',
  'SR Bardienst',
  'de melding noemt wie er wegviel'
);
select is(
  (my_bar_state() -> 'other_shift' ->> 'orphan')::boolean,
  true,
  'een dienst zonder actieve sessie is een wees-dienst'
);
select lives_ok(
  $$ select admin_take_over_shift((select id from shifts where ended_at is null)) $$,
  'een beheerder neemt de wees-dienst over'
);
select isnt(
  (select resolved_at from admin_notifications where reason = 'afgemeld'),
  null,
  'overnemen lost de melding op'
);
select is(
  (select resolved_by from admin_notifications where reason = 'afgemeld'),
  '00000000-0000-0000-0000-00000000e010'::uuid,
  'de melding is opgelost door de beheerder die overnam'
);

-- ═══ Inactiviteit: close_inactive_bar_sessions ════════════════════════════

update shifts set ended_at = now() where ended_at is null;
update shift_sessions set left_at = now(), left_reason = 'dienst_afgesloten' where left_at is null;
update admin_notifications set resolved_at = now() where resolved_at is null;
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd' where ended_at is null;

-- Twee sessies: bardienst (met dienst) is 61 minuten stil, beheerder (zonder
-- dienst) is 59 minuten stil.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e011', null, '00000000-0000-0000-0000-00000000e0db');
select start_shift('00000000-0000-0000-0000-00000000e0b0');
update bar_sessions set last_activity_at = now() - interval '61 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0db';
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e010', null, '00000000-0000-0000-0000-00000000e0dc');
update bar_sessions set last_activity_at = now() - interval '59 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0dc';

select is(
  (my_bar_state() -> 'session' ->> 'status'),
  'active',
  'stap: 59 minuten stil is nog actief'
);
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000e011', null, '00000000-0000-0000-0000-00000000e0db');
select is(
  (my_bar_state() -> 'session' ->> 'status'),
  'inactive',
  'my_bar_state: 61 minuten stil is inactief (de guard berekent dit zelf, ook zonder cron)'
);
select is(
  (my_bar_state() -> 'shift'),
  null,
  'een inactieve sessie leert niets over diensten'
);

select close_inactive_bar_sessions();

select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0db'),
  'inactief',
  'de job sluit een sessie die langer dan 60 minuten stil is (inactief)'
);
select is(
  (select ended_at is null from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0dc'),
  true,
  'een sessie die 59 minuten stil is, blijft open'
);
select is(
  (select left_reason from shift_sessions ss where ss.bar_session_id = (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0db')),
  'inactief',
  'de koppeling eindigt met reden inactief'
);
select is(
  (select reason from admin_notifications where resolved_at is null),
  'inactief',
  'de dienst zonder apparaat geeft een melding (reden inactief)'
);
select is(
  (select count(*)::int from shifts where ended_at is null),
  1,
  'de dienst zelf blijft open (wees-dienst)'
);

select close_inactive_bar_sessions();
select is(
  (select count(*)::int from admin_notifications where resolved_at is null),
  1,
  'de job is idempotent: geen tweede melding'
);

-- Een inactieve sessie zonder dienst geeft geen melding.
update bar_sessions set last_activity_at = now() - interval '2 hours'
  where auth_session_id = '00000000-0000-0000-0000-00000000e0dc';
select close_inactive_bar_sessions();
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000e0dc'),
  'inactief',
  'ook een sessie zonder dienst wordt gesloten'
);
select is(
  (select count(*)::int from admin_notifications where resolved_at is null),
  1,
  'een inactieve sessie zonder dienst geeft geen melding'
);

select ok(
  not has_function_privilege('authenticated', 'public.close_inactive_bar_sessions()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.close_inactive_bar_sessions()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.close_inactive_bar_sessions()', 'EXECUTE'),
  'close_inactive_bar_sessions is voor geen enkele API-rol uitvoerbaar (alleen pg_cron)'
);
select is(
  (select count(*)::int from cron.job where jobname = 'close_inactive_bar_sessions' and schedule = '* * * * *'),
  1,
  'pg_cron draait de job elke minuut'
);

-- ═══ Rechten van de sessie-RPC's ══════════════════════════════════════════

select ok(
  has_function_privilege('authenticated', 'public.register_bar_session(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.touch_bar_session()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.end_bar_session(boolean,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.my_bar_state()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_end_shift(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_take_over_shift(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_end_bar_session(uuid)', 'EXECUTE'),
  'de sessie-RPC''s zijn uitvoerbaar voor een ingelogde sessie'
);
select ok(
  not has_function_privilege('anon', 'public.register_bar_session(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.touch_bar_session()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.end_bar_session(boolean,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.my_bar_state()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_end_shift(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_take_over_shift(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_end_bar_session(uuid)', 'EXECUTE'),
  'de sessie-RPC''s zijn niet uitvoerbaar zonder sessie'
);

select * from finish();
rollback;
