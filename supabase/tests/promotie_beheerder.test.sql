-- Promotie naar beheerder beëindigt de bar-sessies (0037; docs/features/
-- beheer-tweede-factor.md → RPC's → `set_member_role`, besloten 11; ADR
-- 0017). Wat hier vastligt:
--
--   * bardienst → beheerder sluit elke actieve bar-sessie met
--     `beheerder_geworden`, met de koppeling (zelfde reden), een melding bij
--     de wees-dienst (zelfde reden), en de Auth-sessie van elke bar-sessie;
--   * het PIN-vertrouwen op alle apparaten vervalt;
--   * een Auth-sessie zonder bar-sessie (portal) blijft staan, de dienst zelf
--     blijft open;
--   * `my_bar_state` meldt `left_shift_open` ook bij `beheerder_geworden`;
--   * lid → beheerder (geen bar-sessie): alleen het PIN-vertrouwen vervalt;
--   * beheerder → beheerder en lid → bardienst doen niets;
--   * archiveren sluit nog steeds met `geen_bar_rol`;
--   * end_member_bar_sessions weigert een andere reden, de oude signatuur
--     bestaat niet meer, en de functie is voor geen API-rol uitvoerbaar.
--
-- Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(24);

-- ── Opzet ─────────────────────────────────────────────────────────────────
--
-- Vaste uuid's per rol (alleen in dit bestand):
--   a… beheerder (de actor, sessie in modus beheer, aal2)
--   b… bardienst die beheerder wordt (twee bar-sessies, één in een dienst)
--   d… beheerder die beheerder blijft (een bar-sessie)
--   e… bardienst die gearchiveerd wordt (een bar-sessie)
--   c… lid dat bardienst wordt, f… lid dat beheerder wordt

insert into auth.users (id, aud, role, email) values
  ('a0000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'promo-a@aurora.local'),
  ('b0000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'promo-b@aurora.local'),
  ('d0000000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', 'promo-d@aurora.local'),
  ('e0000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'promo-e@aurora.local'),
  ('c0000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'promo-c@aurora.local'),
  ('f0000000-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated', 'promo-f@aurora.local');

insert into members (id, name, role, auth_user_id) values
  ('a0000000-0000-4000-8000-0000000000a0', 'Promo Beheerder', 'beheerder', 'a0000000-0000-4000-8000-0000000000a1'),
  ('b0000000-0000-4000-8000-0000000000b0', 'Promo Bardienst', 'bardienst', 'b0000000-0000-4000-8000-0000000000b1'),
  ('d0000000-0000-4000-8000-0000000000d0', 'Promo Al Beheerder', 'beheerder', 'd0000000-0000-4000-8000-0000000000d1'),
  ('e0000000-0000-4000-8000-0000000000e0', 'Promo Archief', 'bardienst', 'e0000000-0000-4000-8000-0000000000e1'),
  ('c0000000-0000-4000-8000-0000000000c0', 'Promo Lid', 'lid', 'c0000000-0000-4000-8000-0000000000c1'),
  ('f0000000-0000-4000-8000-0000000000f0', 'Promo Lid Beheer', 'lid', 'f0000000-0000-4000-8000-0000000000f1');

-- Auth-sessies: per bar-sessie één, plus een portal-sessie van b (zonder
-- bar-sessie) en een van c.
insert into auth.sessions (id, user_id, aal) values
  ('a0000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-0000000000a1', 'aal2'),
  ('b0000000-0000-4000-8000-0000000000b2', 'b0000000-0000-4000-8000-0000000000b1', 'aal1'),
  ('b0000000-0000-4000-8000-0000000000b3', 'b0000000-0000-4000-8000-0000000000b1', 'aal1'),
  ('b0000000-0000-4000-8000-0000000000b9', 'b0000000-0000-4000-8000-0000000000b1', 'aal1'),
  ('d0000000-0000-4000-8000-0000000000d2', 'd0000000-0000-4000-8000-0000000000d1', 'aal1'),
  ('e0000000-0000-4000-8000-0000000000e2', 'e0000000-0000-4000-8000-0000000000e1', 'aal1'),
  ('c0000000-0000-4000-8000-0000000000c9', 'c0000000-0000-4000-8000-0000000000c1', 'aal1');

insert into bar_devices (id, token_hash) values
  ('00000000-0000-4000-8000-00000000de01', 'promo-apparaat-1'),
  ('00000000-0000-4000-8000-00000000de02', 'promo-apparaat-2');

insert into bar_device_members (device_id, member_id, password_login_at) values
  ('00000000-0000-4000-8000-00000000de01', 'b0000000-0000-4000-8000-0000000000b0', now()),
  ('00000000-0000-4000-8000-00000000de02', 'b0000000-0000-4000-8000-0000000000b0', now()),
  ('00000000-0000-4000-8000-00000000de01', 'd0000000-0000-4000-8000-0000000000d0', now()),
  ('00000000-0000-4000-8000-00000000de01', 'c0000000-0000-4000-8000-0000000000c0', now()),
  ('00000000-0000-4000-8000-00000000de01', 'f0000000-0000-4000-8000-0000000000f0', now());

insert into bar_sessions (id, auth_session_id, member_id, mode, device_id) values
  ('a0000000-0000-4000-8000-0000000000a3', 'a0000000-0000-4000-8000-0000000000a2',
   'a0000000-0000-4000-8000-0000000000a0', 'beheer', null),
  ('b0000000-0000-4000-8000-0000000000b4', 'b0000000-0000-4000-8000-0000000000b2',
   'b0000000-0000-4000-8000-0000000000b0', 'bar', '00000000-0000-4000-8000-00000000de01'),
  ('b0000000-0000-4000-8000-0000000000b5', 'b0000000-0000-4000-8000-0000000000b3',
   'b0000000-0000-4000-8000-0000000000b0', 'bar', '00000000-0000-4000-8000-00000000de02'),
  ('d0000000-0000-4000-8000-0000000000d3', 'd0000000-0000-4000-8000-0000000000d2',
   'd0000000-0000-4000-8000-0000000000d0', 'bar', '00000000-0000-4000-8000-00000000de01'),
  ('e0000000-0000-4000-8000-0000000000e3', 'e0000000-0000-4000-8000-0000000000e2',
   'e0000000-0000-4000-8000-0000000000e0', 'bar', '00000000-0000-4000-8000-00000000de01');

-- De dienst van b, met alleen b's eerste sessie erin: na de promotie is hij
-- wees.
insert into shifts (id, started_by, started_session_id) values
  ('b0000000-0000-4000-8000-0000000000b6', 'b0000000-0000-4000-8000-0000000000b0',
   'b0000000-0000-4000-8000-0000000000b4');
insert into shift_sessions (shift_id, bar_session_id) values
  ('b0000000-0000-4000-8000-0000000000b6', 'b0000000-0000-4000-8000-0000000000b4');

-- De actor: beheersessie met aal2.
create function pg_temp.als(p_sub text, p_session text, p_aal text) returns void
language sql as $fn$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'session_id', p_session, 'aal', p_aal, 'role', 'authenticated')::text, true);
$fn$;

-- ── bardienst → beheerder ─────────────────────────────────────────────────

select pg_temp.als('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a2', 'aal2');
set local role authenticated;
select lives_ok(
  $$ select set_member_role('b0000000-0000-4000-8000-0000000000b0', 'beheerder') $$,
  'stap: de beheerder maakt de bardienst beheerder'
);
reset role;

select is(
  (select array_agg(end_reason order by id) from bar_sessions
    where member_id = 'b0000000-0000-4000-8000-0000000000b0'),
  array['beheerder_geworden', 'beheerder_geworden'],
  'bardienst → beheerder sluit elke actieve bar-sessie met beheerder_geworden'
);
select is(
  (select left_reason from shift_sessions where bar_session_id = 'b0000000-0000-4000-8000-0000000000b4'),
  'beheerder_geworden',
  'de koppeling met de dienst eindigt met beheerder_geworden'
);
select is(
  (select reason from admin_notifications
    where shift_id = 'b0000000-0000-4000-8000-0000000000b6' and resolved_at is null),
  'beheerder_geworden',
  'de wees-dienst geeft een melding met reden beheerder_geworden'
);
select ok(
  (select ended_at is null from shifts where id = 'b0000000-0000-4000-8000-0000000000b6'),
  'de dienst zelf blijft open'
);
select is(
  (select count(*)::integer from auth.sessions
    where id in ('b0000000-0000-4000-8000-0000000000b2', 'b0000000-0000-4000-8000-0000000000b3')),
  0,
  'de Auth-sessies van de bar-sessies zijn ingetrokken'
);
select is(
  (select count(*)::integer from auth.sessions where id = 'b0000000-0000-4000-8000-0000000000b9'),
  1,
  'een Auth-sessie zonder bar-sessie (portal) blijft staan'
);
select is(
  (select count(*)::integer from bar_device_members
    where member_id = 'b0000000-0000-4000-8000-0000000000b0' and revoked_at is null),
  0,
  'het PIN-vertrouwen vervalt op alle apparaten'
);
select ok(
  (select ended_at is null from bar_sessions where id = 'a0000000-0000-4000-8000-0000000000a3'),
  'de beheersessie van de actor blijft staan'
);
select is(
  (select role::text from members where id = 'b0000000-0000-4000-8000-0000000000b0'),
  'beheerder',
  'de rol is gewijzigd'
);

-- De melding op het apparaat: my_bar_state van de gesloten sessie.
select pg_temp.als('b0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-0000000000b2', 'aal1');
set local role authenticated;
select is(
  (select my_bar_state() -> 'session' ->> 'end_reason'),
  'beheerder_geworden',
  'my_bar_state geeft de sluitreden beheerder_geworden'
);
select is(
  (select (my_bar_state() -> 'session' ->> 'left_shift_open')::boolean),
  true,
  'my_bar_state: left_shift_open ook bij beheerder_geworden'
);
reset role;

-- ── beheerder → beheerder: niets ──────────────────────────────────────────

select pg_temp.als('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a2', 'aal2');
set local role authenticated;
select lives_ok(
  $$ select set_member_role('d0000000-0000-4000-8000-0000000000d0', 'beheerder') $$,
  'stap: beheerder → beheerder'
);
reset role;
select ok(
  (select ended_at is null from bar_sessions where id = 'd0000000-0000-4000-8000-0000000000d3')
  and exists (select 1 from auth.sessions where id = 'd0000000-0000-4000-8000-0000000000d2')
  and exists (select 1 from bar_device_members
               where member_id = 'd0000000-0000-4000-8000-0000000000d0' and revoked_at is null),
  'beheerder → beheerder laat bar-sessie, Auth-sessie en PIN-vertrouwen staan'
);

-- ── lid → bardienst: niets ────────────────────────────────────────────────

set local role authenticated;
select lives_ok(
  $$ select set_member_role('c0000000-0000-4000-8000-0000000000c0', 'bardienst') $$,
  'stap: lid → bardienst'
);
reset role;
select ok(
  exists (select 1 from auth.sessions where id = 'c0000000-0000-4000-8000-0000000000c9')
  and exists (select 1 from bar_device_members
               where member_id = 'c0000000-0000-4000-8000-0000000000c0' and revoked_at is null),
  'lid → bardienst laat Auth-sessie en PIN-vertrouwen staan'
);

-- ── lid → beheerder: alleen het PIN-vertrouwen ────────────────────────────

set local role authenticated;
select lives_ok(
  $$ select set_member_role('f0000000-0000-4000-8000-0000000000f0', 'beheerder') $$,
  'stap: lid → beheerder'
);
reset role;
select is(
  (select count(*)::integer from bar_device_members
    where member_id = 'f0000000-0000-4000-8000-0000000000f0' and revoked_at is null),
  0,
  'lid → beheerder: het PIN-vertrouwen vervalt (geen bar-sessie om te sluiten)'
);

-- ── Archiveren: nog steeds geen_bar_rol ───────────────────────────────────

set local role authenticated;
select lives_ok(
  $$ select set_member_archived('e0000000-0000-4000-8000-0000000000e0', true) $$,
  'stap: een bardienst archiveren'
);
reset role;
select is(
  (select end_reason from bar_sessions where id = 'e0000000-0000-4000-8000-0000000000e3'),
  'geen_bar_rol',
  'archiveren sluit de bar-sessie nog steeds met geen_bar_rol'
);

-- ── end_member_bar_sessions(p_member_id, p_reason) ────────────────────────

select throws_ok(
  $$ select end_member_bar_sessions('d0000000-0000-4000-8000-0000000000d0', 'uitgelogd') $$,
  'P0001', 'invalid_reason',
  'end_member_bar_sessions weigert een andere reden dan geen_bar_rol of beheerder_geworden'
);
select ok(
  (select ended_at is null from bar_sessions where id = 'd0000000-0000-4000-8000-0000000000d3'),
  'een geweigerde reden sluit niets'
);
select ok(
  to_regprocedure('public.end_member_bar_sessions(uuid)') is null,
  'de oude signatuur end_member_bar_sessions(uuid) bestaat niet meer'
);
select ok(
  not has_function_privilege('anon', 'public.end_member_bar_sessions(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.end_member_bar_sessions(uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.end_member_bar_sessions(uuid,text)', 'EXECUTE'),
  'end_member_bar_sessions is voor geen enkele API-rol uitvoerbaar'
);

select * from finish();
rollback;
