-- De sessie-guards op de nieuwe RPC's van 0028/0030 die een sessie
-- aannemen maar geen dienst-koppeling eisen: admin_end_shift,
-- admin_take_over_shift, admin_end_bar_session, resume_orphan_shift,
-- touch_bar_session en end_bar_session (docs/features/dienst-per-sessie.md →
-- RPC's → Guards, Beheerder, Inactiviteit; ADR 0016). Plus wat
-- bar_sessie_rpcs.test.sql alleen voor de gewenste uitkomst toetste:
--   * afmelden trekt het vertrouwen van het apparaat in voor élk lid op dat
--     apparaat, en niet het vertrouwen van het lid op een ander apparaat;
--   * admin_end_shift werkt ook vanuit bar-modus, admin_end_bar_session ook
--     vanuit beheer (spec → Randgevallen, 12a/12c);
--   * my_bar_state lekt niets over diensten aan een beëindigde sessie of een
--     sessie waarvan het lid geen bar-rol meer heeft;
--   * close_inactive_bar_sessions raakt een al beëindigde sessie niet, maakt
--     geen melding zolang de dienst nog een actieve koppeling heeft, en sluit
--     ook een inactieve beheersessie.
--
-- Data-gedreven voor de guards: één lijst met aanroepen, één ronde per
-- faalmodus. De guard staat vóór alle andere checks, dus een ronde die
-- onverwacht door de guard komt, zou de toestand veranderen: de controles
-- direct na de rondes vangen dat. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(66);

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

-- Een sessie in een gekozen modus voor een lid dat al een account heeft.
create function pg_temp.act_as_mode(p_member uuid, p_session uuid, p_mode text)
returns void
language plpgsql
as $fn$
declare
  v_auth uuid;
begin
  select auth_user_id into v_auth from members where id = p_member;
  insert into bar_sessions (auth_session_id, member_id, mode)
  values (p_session, p_member, p_mode)
  on conflict (auth_session_id) do nothing;
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth::text, 'session_id', p_session::text)::text,
    true
  );
end;
$fn$;

-- ── Fixtures ──────────────────────────────────────────────────────────────

update shifts set ended_at = now() where ended_at is null;

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000008010', 'AG Beheerder',       'beheerder', null, 0, false),
  ('00000000-0000-0000-0000-000000008011', 'AG Bardienst',       'bardienst', crypt('1234', gen_salt('bf', 4)), 0, false),
  ('00000000-0000-0000-0000-000000008013', 'AG Bardienst Twee',  'bardienst', crypt('1234', gen_salt('bf', 4)), 0, false);

-- Een lid (portal) met een eigen account.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-0000000080a2', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ag-lid@test.local', crypt('x', gen_salt('bf')), now(),
  now(), now(), '{"provider":"email","providers":["email"]}', '{}'
);
insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000008012', 'AG Lid', 'lid', null, 0, false,
   '00000000-0000-0000-0000-0000000080a2');

-- De open dienst van de bardienst (sessie d1), met de beheerder in de
-- bezetting (zodat resume_orphan_shift, als de guard hem doorliet, verder
-- zou komen).
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-000000008020', '00000000-0000-0000-0000-000000008011');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000008020', '00000000-0000-0000-0000-000000008011'),
  ('00000000-0000-0000-0000-000000008020', '00000000-0000-0000-0000-000000008010');
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000008011',
  '00000000-0000-0000-0000-000000008020', '00000000-0000-0000-0000-0000000080d1');

-- Apparaat 1: de sessie d1 draait erop; vertrouwd voor beide bardiensten.
-- Apparaat 2: ook vertrouwd voor de eerste bardienst.
insert into bar_devices (id, token_hash) values
  ('00000000-0000-0000-0000-0000000080f1', 'ag-apparaat-1'),
  ('00000000-0000-0000-0000-0000000080f2', 'ag-apparaat-2');
insert into bar_device_members (device_id, member_id, password_login_at) values
  ('00000000-0000-0000-0000-0000000080f1', '00000000-0000-0000-0000-000000008011', now()),
  ('00000000-0000-0000-0000-0000000080f1', '00000000-0000-0000-0000-000000008013', now()),
  ('00000000-0000-0000-0000-0000000080f2', '00000000-0000-0000-0000-000000008011', now());
update bar_sessions set device_id = '00000000-0000-0000-0000-0000000080f1'
  where auth_session_id = '00000000-0000-0000-0000-0000000080d1';

-- De beheerder in bar-modus (sessie d0) en een tweede bardienst-sessie (d3).
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000008013', null, '00000000-0000-0000-0000-0000000080d3');
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000008010', null, '00000000-0000-0000-0000-0000000080d0');

create function pg_temp.calls()
returns table (name text, sql text)
language sql
as $q$
  select * from (values
    ('admin_end_shift',
     $s$ select admin_end_shift('00000000-0000-0000-0000-000000008020'::uuid) $s$),
    ('admin_take_over_shift',
     $s$ select admin_take_over_shift('00000000-0000-0000-0000-000000008020'::uuid) $s$),
    ('admin_end_bar_session',
     $s$ select admin_end_bar_session((select id from bar_sessions
           where auth_session_id = '00000000-0000-0000-0000-0000000080d1')) $s$),
    ('resume_orphan_shift',
     $s$ select resume_orphan_shift('00000000-0000-0000-0000-000000008020'::uuid) $s$),
    ('touch_bar_session',
     $s$ select touch_bar_session() $s$),
    ('end_bar_session',
     $s$ select end_bar_session(false) $s$)
  ) as v(name, sql)
$q$;

-- ── Ronde 1: niet-geregistreerde sessie ──────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000008010","session_id":"00000000-0000-0000-0000-0000000080ee"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_session', c.name || ' weigert een niet-geregistreerde sessie (no_bar_session)')
  from pg_temp.calls() c;

-- ── Ronde 2: een lid-sessie (portal) ─────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000080a2', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000080a2","session_id":"00000000-0000-0000-0000-0000000080ef"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_session', c.name || ' weigert een lid-sessie (no_bar_session)')
  from pg_temp.calls() c;

-- ── Ronde 3: een token zonder session_id ─────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000008010', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000008010"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_session', c.name || ' weigert een token zonder session_id-claim (no_bar_session)')
  from pg_temp.calls() c;

-- ── Ronde 4: beëindigde sessie van de beheerder ──────────────────────────
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000008010', null, '00000000-0000-0000-0000-0000000080d0');
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd'
  where auth_session_id = '00000000-0000-0000-0000-0000000080d0';
select throws_ok(c.sql, 'P0001', 'session_ended', c.name || ' weigert een beëindigde sessie (session_ended)')
  from pg_temp.calls() c;
update bar_sessions set ended_at = null, end_reason = null
  where auth_session_id = '00000000-0000-0000-0000-0000000080d0';

-- ── Ronde 5: inactieve sessie ────────────────────────────────────────────
update bar_sessions set last_activity_at = now() - interval '61 minutes'
  where auth_session_id = '00000000-0000-0000-0000-0000000080d0';
select throws_ok(c.sql, 'P0001', 'session_inactive', c.name || ' weigert een sessie die langer dan 60 minuten stil is (session_inactive)')
  from pg_temp.calls() c;
update bar_sessions set last_activity_at = now()
  where auth_session_id = '00000000-0000-0000-0000-0000000080d0';

-- ── Ronde 6: gearchiveerde beheerder ─────────────────────────────────────
update members set archived = true where id = '00000000-0000-0000-0000-000000008010';
select throws_ok(c.sql, 'P0001', 'no_bar_role', c.name || ' weigert een gearchiveerd lid (no_bar_role)')
  from pg_temp.calls() c;

-- ── Ronde 7: beheerder die rol lid kreeg ─────────────────────────────────
update members set archived = false, role = 'lid' where id = '00000000-0000-0000-0000-000000008010';
select throws_ok(c.sql, 'P0001', 'no_bar_role', c.name || ' weigert een lid dat geen bar-rol meer heeft (no_bar_role)')
  from pg_temp.calls() c;
update members set role = 'beheerder' where id = '00000000-0000-0000-0000-000000008010';

-- ── Ronde 8: sessie van een ander account ────────────────────────────────
-- De sessie d0 van de beheerder, met het account van de bardienst.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000008011', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000008011","session_id":"00000000-0000-0000-0000-0000000080d0"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_role', c.name || ' weigert een sessie die niet bij het account van het lid hoort (no_bar_role)')
  from pg_temp.calls() c;

-- ── Geen van de rondes veranderde iets ───────────────────────────────────
select is(
  (select ended_at from shifts where id = '00000000-0000-0000-0000-000000008020'),
  null,
  'na alle geweigerde aanroepen staat de dienst nog open'
);
select results_eq(
  $$ select b.ended_at is null, ss.left_at is null
       from bar_sessions b
       join shift_sessions ss on ss.bar_session_id = b.id
      where b.auth_session_id = '00000000-0000-0000-0000-0000000080d1'
        and ss.shift_id = '00000000-0000-0000-0000-000000008020' $$,
  $$ values (true, true) $$,
  'na alle geweigerde aanroepen is de sessie van de bardienst actief en nog gekoppeld'
);
select results_eq(
  $$ select ended_at is null, last_activity_at from bar_sessions
      where auth_session_id = '00000000-0000-0000-0000-0000000080d0' $$,
  $$ values (true, now()) $$,
  'de eigen sessie van de beheerder is niet beëindigd door end_bar_session in de rondes'
);

-- ═══ Afmelden vanuit beheer: vertrouwen per apparaat ═════════════════════

select pg_temp.act_as_mode('00000000-0000-0000-0000-000000008010', '00000000-0000-0000-0000-0000000080e0', 'beheer');
select lives_ok(
  $$ select admin_end_bar_session((select id from bar_sessions
       where auth_session_id = '00000000-0000-0000-0000-0000000080d1')) $$,
  'een beheerder meldt vanuit modus beheer een apparaat af (12c)'
);
select is(
  (select result_code from verify_bar_pin('ag-apparaat-1', '00000000-0000-0000-0000-000000008013', '1234')),
  'pin_not_available',
  'na afmelden kan ook een ander lid op dat apparaat niet meer met de PIN inloggen (het apparaat is ingetrokken)'
);
select is(
  (select result_code from verify_bar_pin('ag-apparaat-2', '00000000-0000-0000-0000-000000008011', '1234')),
  'ok',
  'afmelden raakt het vertrouwen van hetzelfde lid op een ander apparaat niet'
);

-- my_bar_state voor de afgemelde sessie: niets over diensten.
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000008011', null, '00000000-0000-0000-0000-0000000080d1');
select ok(
  my_bar_state() -> 'session' ->> 'status' = 'ended'
  and not (my_bar_state() ? 'shift')
  and not (my_bar_state() ? 'other_shift')
  and not (my_bar_state() ? 'notifications'),
  'my_bar_state voor een beëindigde sessie: status ended en geen gegevens over diensten'
);
select throws_ok(
  $$ select resume_orphan_shift('00000000-0000-0000-0000-000000008020'::uuid) $$,
  'P0001', 'session_ended',
  'de afgemelde sessie kan de dienst die ze achterliet niet zelf hervatten'
);

-- ═══ admin_end_shift vanuit bar-modus ════════════════════════════════════

select pg_temp.act_as_bar('00000000-0000-0000-0000-000000008010', null, '00000000-0000-0000-0000-0000000080d0');
select lives_ok(
  $$ select admin_end_shift('00000000-0000-0000-0000-000000008020'::uuid) $$,
  'een beheerder sluit een dienst af vanuit bar-modus (12a)'
);
select results_eq(
  $$ select s.ended_at is not null, n.resolved_at is not null, n.resolved_by
       from shifts s join admin_notifications n on n.shift_id = s.id
      where s.id = '00000000-0000-0000-0000-000000008020' $$,
  $$ values (true, true, '00000000-0000-0000-0000-000000008010'::uuid) $$,
  'de dienst is dicht en de melding (van het afmelden) is opgelost door die beheerder'
);

-- ═══ my_bar_state voor een lid zonder bar-rol ════════════════════════════

-- Een nieuwe open dienst met een actieve koppeling, zodat er iets te lekken is.
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-000000008021', '00000000-0000-0000-0000-000000008011');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000008021', '00000000-0000-0000-0000-000000008011'),
  ('00000000-0000-0000-0000-000000008021', '00000000-0000-0000-0000-000000008013');
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000008011',
  '00000000-0000-0000-0000-000000008021', '00000000-0000-0000-0000-0000000080d2');

select pg_temp.act_as_bar('00000000-0000-0000-0000-000000008013', null, '00000000-0000-0000-0000-0000000080d3');
select is(
  (my_bar_state() -> 'other_shift' ->> 'id')::uuid,
  '00000000-0000-0000-0000-000000008021'::uuid,
  'stap: een actieve bardienst-sessie ziet de dienst elders'
);
update members set archived = true where id = '00000000-0000-0000-0000-000000008013';
select ok(
  my_bar_state() -> 'session' ->> 'status' = 'no_role'
  and not (my_bar_state() ? 'shift')
  and not (my_bar_state() ? 'other_shift'),
  'my_bar_state voor een gearchiveerd lid: status no_role en niets over diensten'
);
update members set archived = false, role = 'lid' where id = '00000000-0000-0000-0000-000000008013';
select ok(
  my_bar_state() -> 'session' ->> 'status' = 'no_role'
  and not (my_bar_state() ? 'shift')
  and not (my_bar_state() ? 'other_shift'),
  'my_bar_state voor een lid dat rol lid kreeg: status no_role en niets over diensten'
);
update members set role = 'bardienst' where id = '00000000-0000-0000-0000-000000008013';

-- ═══ close_inactive_bar_sessions ═════════════════════════════════════════

-- Twee sessies in dezelfde dienst (rechtstreeks gekoppeld; fase 1 kent dat
-- alleen via overnemen, maar de regel "één melding als de laatste koppeling
-- wegvalt" hoort er niet op te leunen). d2 valt stil, d3 blijft actief.
insert into shift_sessions (shift_id, bar_session_id)
  select '00000000-0000-0000-0000-000000008021', id from bar_sessions
   where auth_session_id = '00000000-0000-0000-0000-0000000080d3';
update bar_sessions set last_activity_at = now() - interval '61 minutes'
  where auth_session_id = '00000000-0000-0000-0000-0000000080d2';
update bar_sessions set last_activity_at = now() - interval '10 minutes'
  where auth_session_id = '00000000-0000-0000-0000-0000000080d3';
-- Een al afgemelde sessie die al lang stil is.
update bar_sessions set last_activity_at = now() - interval '3 hours'
  where auth_session_id = '00000000-0000-0000-0000-0000000080d1';
-- De beheersessie van de beheerder valt ook stil.
update bar_sessions set last_activity_at = now() - interval '61 minutes'
  where auth_session_id = '00000000-0000-0000-0000-0000000080e0';

select close_inactive_bar_sessions();

select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000080d2'),
  'inactief',
  'stap: de stille sessie is gesloten (inactief)'
);
select results_eq(
  $$ select b.ended_at is null, ss.left_at is null
       from bar_sessions b
       join shift_sessions ss on ss.bar_session_id = b.id
      where b.auth_session_id = '00000000-0000-0000-0000-0000000080d3'
        and ss.shift_id = '00000000-0000-0000-0000-000000008021' $$,
  $$ values (true, true) $$,
  'de actieve sessie in dezelfde dienst blijft open en gekoppeld'
);
select is(
  (select count(*)::int from admin_notifications
    where shift_id = '00000000-0000-0000-0000-000000008021'),
  0,
  'geen melding zolang de dienst nog een actieve koppeling heeft (niet wees)'
);
select results_eq(
  $$ select end_reason, ended_by from bar_sessions
      where auth_session_id = '00000000-0000-0000-0000-0000000080d1' $$,
  $$ values ('afgemeld'::text, '00000000-0000-0000-0000-000000008010'::uuid) $$,
  'de job overschrijft de sluitreden van een al beëindigde sessie niet'
);
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000080e0'),
  'inactief',
  'de job sluit ook een stille sessie in modus beheer'
);

select * from finish();
rollback;
