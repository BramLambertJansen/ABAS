-- resume_orphan_shift (0030, docs/features/dienst-per-sessie.md → vraag 24 (ii),
-- ADR 0016): een bardienst uit de bezetting van een wees-dienst (open dienst
-- zonder actieve koppeling) pakt hem na opnieuw inloggen weer op. Elke
-- weigergrond heeft een negatieve test, plus de happy path en het oplossen van
-- de beheerdermelding. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(31);

-- Registreert voor een lid een bar-sessie (modus bar, rechtstreeks geïnsert),
-- optioneel gekoppeld aan een dienst, en zet de JWT-claims. Het lid krijgt zo
-- nodig een auth-account. `p_session`: het sessie-id (standaard het lid-id).
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
update admin_notifications set resolved_at = now() where resolved_at is null;

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-00000000f010', 'RO Starter',    'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-00000000f011', 'RO Bezetting',  'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-00000000f012', 'RO Bezetting Twee', 'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-00000000f013', 'RO Buitenstaander', 'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-00000000f014', 'RO Beheerder',  'beheerder', null, 0, false);

insert into activity_types (id, name, archived) values
  ('00000000-0000-0000-0000-00000000f0b0', 'RO Training', false);

-- De starter start de dienst; twee leden en een beheerder staan in de bezetting.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f010');
select start_shift('00000000-0000-0000-0000-00000000f0b0');
select set_config('test.shift', (select id::text from shifts where ended_at is null), true);
insert into shift_members (shift_id, member_id) values
  (current_setting('test.shift')::uuid, '00000000-0000-0000-0000-00000000f011'),
  (current_setting('test.shift')::uuid, '00000000-0000-0000-0000-00000000f012'),
  (current_setting('test.shift')::uuid, '00000000-0000-0000-0000-00000000f014');
-- Accounts voor de leden die hieronder inloggen.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f011', null, '00000000-0000-0000-0000-00000000f0d1');
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f012', null, '00000000-0000-0000-0000-00000000f0d2');
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f013', null, '00000000-0000-0000-0000-00000000f0d3');
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f014', null, '00000000-0000-0000-0000-00000000f0d4');

-- ── De dienst heeft nog een actieve koppeling: onaantastbaar (12d) ────────

select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f013', null, '00000000-0000-0000-0000-00000000f0d3');
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'not_in_shift_crew',
  'buiten de bezetting: not_in_shift_crew, ook bij een dienst met een actieve koppeling (leert niets over koppelingen)'
);

select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f011', null, '00000000-0000-0000-0000-00000000f0d1');
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'shift_not_orphan',
  'een dienst met een actieve koppeling elders kan niet worden hervat (12d blijft nee)'
);
select is(
  (select count(*)::int from shift_sessions where shift_id = current_setting('test.shift')::uuid and left_at is null),
  1,
  'de geweigerde poging liet de koppeling van de starter staan'
);

-- ── De starter logt uit met "open laten": de dienst is wees ───────────────

select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f010');
select end_bar_session(false);
select is(
  (select count(*)::int from admin_notifications
    where shift_id = current_setting('test.shift')::uuid and resolved_at is null),
  1,
  'stap: de wees-dienst heeft een openstaande beheerdermelding'
);

-- ── Weigeringen ───────────────────────────────────────────────────────────

-- Geen bar-sessie: een sessie zonder rij in bar_sessions.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f011","session_id":"00000000-0000-0000-0000-00000000f0ee"}', true);
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'no_bar_session',
  'zonder geregistreerde bar-sessie: no_bar_session'
);

-- Geen claim.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f011"}', true);
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'no_bar_session',
  'zonder session_id-claim: no_bar_session'
);

-- Een beheersessie (modus beheer) van een beheerder die in de bezetting staat.
select pg_temp.act_as_mode('00000000-0000-0000-0000-00000000f014', '00000000-0000-0000-0000-00000000f0d5', 'beheer');
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'wrong_mode',
  'een sessie in modus beheer kan niet hervatten, ook niet als het lid in de bezetting staat'
);

-- Een beëindigde sessie.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f011', null, '00000000-0000-0000-0000-00000000f0d6');
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd'
  where auth_session_id = '00000000-0000-0000-0000-00000000f0d6';
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'session_ended',
  'een beëindigde sessie kan niet hervatten'
);

-- Een inactieve sessie.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f011', null, '00000000-0000-0000-0000-00000000f0d7');
update bar_sessions set last_activity_at = now() - interval '61 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000f0d7';
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'session_inactive',
  'een inactieve sessie kan niet hervatten'
);

-- Niet in de bezetting.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f013', null, '00000000-0000-0000-0000-00000000f0d3');
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'not_in_shift_crew',
  'een bardienst buiten de bezetting kan een wees-dienst niet hervatten'
);

-- Onbekende dienst.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f011', null, '00000000-0000-0000-0000-00000000f0d1');
select throws_ok(
  $$ select resume_orphan_shift('00000000-0000-0000-0000-00000000f0ee') $$,
  'P0001', 'shift_not_open',
  'een onbekende dienst: shift_not_open'
);

-- Een dienst die al dicht is.
insert into shifts (id, started_by, started_at, ended_at, activity_type_id) values
  ('00000000-0000-0000-0000-00000000f0c1', '00000000-0000-0000-0000-00000000f010',
   now() - interval '3 hours', now() - interval '2 hours', '00000000-0000-0000-0000-00000000f0b0');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-00000000f0c1', '00000000-0000-0000-0000-00000000f011');
select throws_ok(
  $$ select resume_orphan_shift('00000000-0000-0000-0000-00000000f0c1') $$,
  'P0001', 'shift_not_open',
  'een dienst die al is afgesloten kan niet worden hervat'
);

-- De sessie werkt al in een andere dienst.
insert into shifts (id, started_by, activity_type_id) values
  ('00000000-0000-0000-0000-00000000f0c2', '00000000-0000-0000-0000-00000000f011', '00000000-0000-0000-0000-00000000f0b0');
insert into shift_sessions (shift_id, bar_session_id)
  select '00000000-0000-0000-0000-00000000f0c2', id from bar_sessions
   where auth_session_id = '00000000-0000-0000-0000-00000000f0d1';
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'session_has_shift',
  'een sessie die al in een dienst werkt, hervat geen tweede'
);
-- Opruimen: die tweede dienst is niet meer nodig.
update shift_sessions set left_at = now(), left_reason = 'dienst_afgesloten'
  where shift_id = '00000000-0000-0000-0000-00000000f0c2';
update shifts set ended_at = now() where id = '00000000-0000-0000-0000-00000000f0c2';

select is(
  (select count(*)::int from shift_sessions where shift_id = current_setting('test.shift')::uuid and left_at is null),
  0,
  'alle geweigerde pogingen lieten de wees-dienst zonder koppeling'
);
select is(
  (select count(*)::int from admin_notifications
    where shift_id = current_setting('test.shift')::uuid and resolved_at is null),
  1,
  'en de melding staat nog open'
);

-- ── Happy path ────────────────────────────────────────────────────────────

select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f011', null, '00000000-0000-0000-0000-00000000f0d1');
select lives_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'een bardienst uit de bezetting hervat de wees-dienst'
);
select is(
  (select count(*)::int from shift_sessions ss
    where ss.shift_id = current_setting('test.shift')::uuid and ss.left_at is null
      and ss.bar_session_id = (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000f0d1')),
  1,
  'de sessie heeft een actieve koppeling met de dienst'
);
select is(
  (select resolved_by from admin_notifications where shift_id = current_setting('test.shift')::uuid),
  '00000000-0000-0000-0000-00000000f011'::uuid,
  'de beheerdermelding is opgelost, door het lid dat hervatte'
);
select isnt(
  (select resolved_at from admin_notifications where shift_id = current_setting('test.shift')::uuid),
  null,
  'de melding heeft een resolved_at'
);
select is(
  (my_bar_state() -> 'shift' ->> 'id')::uuid,
  current_setting('test.shift')::uuid,
  'my_bar_state toont de hervatte dienst als eigen dienst'
);
select is(
  (select count(*)::int from shift_members where shift_id = current_setting('test.shift')::uuid),
  4,
  'de bezetting is ongewijzigd (er komt niemand bij)'
);

-- Het tweede bezettingslid komt te laat: de dienst heeft weer een koppeling.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f012', null, '00000000-0000-0000-0000-00000000f0d2');
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'shift_not_orphan',
  'na het hervatten is de dienst niet meer wees: het tweede bezettingslid krijgt shift_not_orphan'
);

-- ── Een sessie die eerder in deze dienst werkte, koppelt opnieuw ──────────

update shift_sessions set left_at = now(), left_reason = 'overgenomen'
  where shift_id = current_setting('test.shift')::uuid;
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f011', null, '00000000-0000-0000-0000-00000000f0d1');
select lives_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'een sessie met een eerdere (gesloten) koppeling aan deze dienst hervat opnieuw'
);
select is(
  (select count(*)::int from shift_sessions ss
    where ss.shift_id = current_setting('test.shift')::uuid and ss.left_at is null
      and ss.bar_session_id = (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000f0d1')),
  1,
  'de bestaande koppelingsrij is heropend, geen tweede rij'
);

-- ── Na hervatten: de attributie is niet veranderd ─────────────────────────
-- De hervattende sessie boekt in de dienst, maar served_by wordt nog steeds
-- tegen de (ongewijzigde) bezetting gecontroleerd: de buitenstaander komt er
-- door het hervatten niet in.

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-00000000f0e0', 'RO Pils', 'Bier', 250, false);

select throws_ok(
  $$ select place_order(current_setting('test.shift')::uuid, null,
       '[{"product_id":"00000000-0000-0000-0000-00000000f0e0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-00000000f013'::uuid) $$,
  'P0001', 'served_by_not_on_shift',
  'na hervatten: een served_by buiten de bezetting blijft geweigerd'
);
select throws_ok(
  $$ select top_up(current_setting('test.shift')::uuid,
       '00000000-0000-0000-0000-00000000f012'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-00000000f013'::uuid) $$,
  'P0001', 'served_by_not_on_shift',
  'na hervatten: top_up met een served_by buiten de bezetting blijft geweigerd'
);
select lives_ok(
  $$ select place_order(current_setting('test.shift')::uuid, null,
       '[{"product_id":"00000000-0000-0000-0000-00000000f0e0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-00000000f011'::uuid) $$,
  'na hervatten boekt de sessie in de dienst, met een bezettingslid als served_by'
);
select is(
  (select bar_session_id from orders where shift_id = current_setting('test.shift')::uuid),
  (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000f0d1'),
  'de boeking na hervatten hangt aan de hervattende sessie'
);

-- ── Een bezettingslid dat geen bar-rol meer heeft ─────────────────────────
-- Maak de dienst eerst weer wees, zodat alleen de guard nog in de weg staat.
update shift_sessions set left_at = now(), left_reason = 'uitgelogd'
  where shift_id = current_setting('test.shift')::uuid and left_at is null;

select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000f012', null, '00000000-0000-0000-0000-00000000f0d2');
update members set archived = true where id = '00000000-0000-0000-0000-00000000f012';
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'no_bar_role',
  'een gearchiveerd bezettingslid kan de wees-dienst niet hervatten'
);
update members set archived = false, role = 'lid' where id = '00000000-0000-0000-0000-00000000f012';
select throws_ok(
  $$ select resume_orphan_shift(current_setting('test.shift')::uuid) $$,
  'P0001', 'no_bar_role',
  'een bezettingslid dat rol lid kreeg, kan de wees-dienst niet hervatten'
);
update members set role = 'bardienst' where id = '00000000-0000-0000-0000-00000000f012';
select is(
  (select count(*)::int from shift_sessions where shift_id = current_setting('test.shift')::uuid and left_at is null),
  0,
  'de geweigerde pogingen lieten de dienst wees'
);

select * from finish();
rollback;
