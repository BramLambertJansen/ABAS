-- Test-dekking voor start_shift sinds dienst-per-sessie (0029, docs/features/
-- dienst-per-sessie.md → RPC's → Bestaande RPC's, ADR 0016): `start_shift(
-- p_activity_type_id)` zonder PIN. De starter is het lid van de aanroepende
-- bar-sessie (de login op de namenlijst is de authenticatie), de dienst wordt
-- aan die sessie gekoppeld. Alle guard-weigeringen (geen sessie, beëindigd,
-- inactief, modus beheer, gearchiveerd) staan in bar_sessie_guards.test.sql;
-- hier de regels van start_shift zelf. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(20);

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
  -- De Auth-sessie uit het token: elke leespolicy en require_session eisen
  -- haar (0041, ADR 0022). Niet voor een al gesloten bar-sessie:
  -- close_bar_session_internal heeft die Auth-sessie verwijderd.
  insert into auth.sessions (id, user_id, created_at, updated_at)
  select coalesce(p_session, p_member), v_auth, now(), now()
   where not exists (select 1 from bar_sessions
                      where auth_session_id = coalesce(p_session, p_member)
                        and ended_at is not null)
  on conflict (id) do nothing;
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth::text, 'session_id', coalesce(p_session, p_member)::text)::text,
    true
  );
end;
$fn$;

-- ── Fixtures ──────────────────────────────────────────────────────────────
-- start_shift weigert zodra er al een open dienst is (shift_already_open).
-- `db:test` draait in check:all ná de e2e-suite, tegen dezelfde lokale
-- database, en die laat een dienst open staan. Die eerst sluiten, binnen
-- deze teruggedraaide transactie, zodat dit bestand niet afhangt van wat er
-- eerder draaide.
update shifts set ended_at = now() where ended_at is null;

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000050', 'Starter Bardienst', 'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-000000000051', 'Tweede Bardienst',  'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-000000000052', 'Starter Beheerder', 'beheerder', null, 0, false);

-- start_shift's parameter is een verplicht activiteittype (0019). Eigen
-- fixture-rijen, niet de seed-rijen van die migratie.
insert into activity_types (id, name, archived) values
  ('00000000-0000-0000-0000-0000000000b0', 'Test Activity Fixture', false),
  ('00000000-0000-0000-0000-0000000000b1', 'Archived Activity Fixture', true);

-- ── 1) happy path ─────────────────────────────────────────────────────────
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000000050');

select lives_ok(
  $$ select start_shift('00000000-0000-0000-0000-0000000000b0'::uuid) $$,
  'start_shift slaagt voor een bar-sessie zonder PIN en met een geldig activiteittype'
);

select is(
  (select started_by from shifts where ended_at is null),
  '00000000-0000-0000-0000-000000000050'::uuid,
  'de starter is het lid van de sessie'
);

select is(
  (select member_id from shift_members sm join shifts s on s.id = sm.shift_id where s.ended_at is null),
  '00000000-0000-0000-0000-000000000050'::uuid,
  'de starter staat als enige in de bezetting'
);

select is(
  (select activity_type_id from shifts where ended_at is null),
  '00000000-0000-0000-0000-0000000000b0'::uuid,
  'het gekozen activiteittype is op de dienst vastgelegd'
);

select is(
  (select started_session_id from shifts where ended_at is null),
  (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-000000000050'),
  'shifts.started_session_id is de sessie van de starter'
);

select is(
  (select count(*)::int from shift_sessions ss join shifts s on s.id = ss.shift_id
    where s.ended_at is null and ss.left_at is null
      and ss.bar_session_id = (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-000000000050')),
  1,
  'de sessie is aan de nieuwe dienst gekoppeld'
);

-- ── 2) dezelfde sessie start geen tweede dienst ───────────────────────────
select throws_ok(
  $$ select start_shift('00000000-0000-0000-0000-0000000000b0'::uuid) $$,
  'P0001', 'session_has_shift',
  'een sessie die al in een dienst werkt, start geen tweede (session_has_shift)'
);

-- ── 3) een andere sessie: er is al een open dienst (stand (a)) ────────────
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000000051');
select throws_ok(
  $$ select start_shift('00000000-0000-0000-0000-0000000000b0'::uuid) $$,
  'P0001', 'shift_already_open',
  'een tweede sessie start geen tweede open dienst (shift_already_open, fase 1 is stand (a))'
);
select is(
  (select count(*)::int from shifts where ended_at is null),
  1,
  'de geweigerde start voegt geen dienst toe'
);

-- De check komt vóór de activiteittype-checks (zelfde volgorde als 0021):
-- ook een ongeldig type krijgt shift_already_open.
select throws_ok(
  $$ select start_shift(null) $$,
  'P0001', 'shift_already_open',
  'shift_already_open komt vóór de activiteittype-checks'
);

-- ── 4) na afsluiten kan er weer een dienst gestart worden ─────────────────
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000000050');
select lives_ok(
  $$ select end_shift((select id from shifts where ended_at is null)) $$,
  'de starter sluit de dienst'
);
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000000051');
select lives_ok(
  $$ select start_shift('00000000-0000-0000-0000-0000000000b0'::uuid) $$,
  'na het sluiten kan een andere sessie een nieuwe dienst starten (de check kijkt naar open diensten)'
);
select is(
  (select started_by from shifts where ended_at is null),
  '00000000-0000-0000-0000-000000000051'::uuid,
  'de nieuwe starter is het lid van de tweede sessie'
);
select end_shift((select id from shifts where ended_at is null));

-- ── 5) een beheerder start ook gewoon een dienst ──────────────────────────
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000000052');
select lives_ok(
  $$ select start_shift('00000000-0000-0000-0000-0000000000b0'::uuid) $$,
  'start_shift slaagt ook voor een beheerder in bar-modus'
);
select end_shift((select id from shifts where ended_at is null));

-- ── 6) activiteittype: verplicht, bestaand en actief ──────────────────────
select throws_ok(
  $$ select start_shift(null) $$,
  'P0001', 'invalid_activity_type',
  'een null activiteittype wordt geweigerd (verplicht, activiteittypes.md)'
);
select throws_ok(
  $$ select start_shift(gen_random_uuid()) $$,
  'P0001', 'activity_type_not_found',
  'een onbekend activiteittype wordt geweigerd'
);
select throws_ok(
  $$ select start_shift('00000000-0000-0000-0000-0000000000b1'::uuid) $$,
  'P0001', 'activity_type_archived',
  'een gearchiveerd activiteittype wordt geweigerd'
);
select is(
  (select count(*)::int from shifts where ended_at is null),
  0,
  'geen van de geweigerde starts liet een open dienst achter'
);

-- ── 7) de PIN speelt geen rol meer ────────────────────────────────────────
select ok(
  to_regprocedure('public.start_shift(uuid,text,uuid)') is null,
  'de oude signatuur start_shift(member, pin, activiteittype) bestaat niet meer'
);
select ok(
  has_function_privilege('authenticated', 'public.start_shift(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.start_shift(uuid)', 'EXECUTE'),
  'start_shift(uuid) is alleen voor een ingelogde sessie uitvoerbaar'
);

select * from finish();
rollback;
