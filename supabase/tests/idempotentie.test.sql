-- Tests voor 0042_idempotentie_geld_rpcs.sql (#143,
-- docs/features/idempotentie-geld-rpcs.md → Testplan, ADR 0023). Run met
-- `npm run db:test` (= `supabase test db`, vereist `supabase start` / Docker).
--
-- Wat dit bewijst (nummers volgen het testplan van de spec):
--   1. eerste aanroep met sleutel boekt één keer en vult idempotency_keys;
--   2. replay (zelfde sleutel, lid en opdracht): zelfde rij terug, niets
--      extra geboekt, ook bij andere volgorde van de regels;
--   3. replay met andere opdracht: request_id_conflict, niets gewijzigd;
--   4. sleutel van een ander lid of van een andere RPC: dezelfde fout;
--   5. replay bij een inmiddels onder de limiet gezakt saldo en bij een
--      afgesloten dienst: nog steeds het oorspronkelijke resultaat; een
--      mislukte eerste aanroep laat geen sleutel achter;
--   6. zonder sleutel: gedrag als voorheen, geen rij in idempotency_keys;
--   7. guards en self_top_up_forbidden geven hun gewone fout, ook met een
--      bestaande sleutel (geen lek over het bestaan van de sleutel);
--   8. de €500-grens van top_up is onveranderd;
--   9. rechten: geen toegang tot idempotency_keys, geen EXECUTE op de purge,
--      retentie van 30 dagen, de cron-job;
--  10. geen overloads meer van de drie RPC's.

create extension if not exists pgtap with schema extensions;

begin;
select plan(85);

-- ── Helpers ──────────────────────────────────────────────────────────────

-- Registreert een sessie van `p_member` in modus `p_mode` (rechtstreeks
-- geïnsert, zoals de andere geld-tests), koppelt haar zo nodig aan een dienst
-- en zet de JWT-claims. Een beheersessie is aal2 (ADR 0017, 0034). Het
-- Auth-account is er al (fixtures) en heeft het lid-id als id.
create function pg_temp.act_as(p_member uuid, p_mode text default 'bar', p_shift uuid default null)
returns void
language plpgsql
as $fn$
declare
  v_session uuid;
begin
  insert into bar_sessions (auth_session_id, member_id, mode)
  values (p_member, p_member, p_mode)
  on conflict (auth_session_id) do nothing;
  select id into v_session from bar_sessions where auth_session_id = p_member;
  if p_shift is not null then
    insert into shift_sessions (shift_id, bar_session_id)
    values (p_shift, v_session)
    on conflict do nothing;
  end if;
  insert into auth.sessions (id, user_id, created_at, updated_at)
  values (p_member, p_member, now(), now())
  on conflict (id) do nothing;
  perform set_config('request.jwt.claim.sub', p_member::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_member::text, 'session_id', p_member::text,
      'aal', case when p_mode = 'beheer' then 'aal2' else 'aal1' end
    )::text,
    true
  );
end;
$fn$;

-- De foutmelding van een SQL-opdracht, of null als ze slaagt (om "dezelfde
-- fout met en zonder sleutel" te kunnen vergelijken).
create function pg_temp.err(p_sql text)
returns text
language plpgsql
as $fn$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$fn$;

create function pg_temp.lines(p_pils integer, p_wijn integer default 0)
returns jsonb
language sql
as $fn$
  select coalesce(jsonb_agg(l), '[]'::jsonb) from (
    select jsonb_build_object('product_id', '00000000-0000-0000-0000-00000000a101', 'qty', p_pils) as l
     where p_pils > 0
    union all
    select jsonb_build_object('product_id', '00000000-0000-0000-0000-00000000a102', 'qty', p_wijn)
     where p_wijn > 0
  ) x
$fn$;

-- ── Fixtures ─────────────────────────────────────────────────────────────

update app_settings set negative_limit_cents = 0;

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-00000000a101', 'Idem Pils',  'Bier', 250, false),
  ('00000000-0000-0000-0000-00000000a102', 'Idem Wijn',  'Wijn', 400, false);

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select m, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       m::text || '@idem.test.local', crypt('not-used', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}'
  from unnest(array[
    '00000000-0000-0000-0000-00000000a201'::uuid,  -- A, bardienst
    '00000000-0000-0000-0000-00000000a202'::uuid,  -- B, bardienst
    '00000000-0000-0000-0000-00000000a203'::uuid,  -- O, bardienst niet op de dienst
    '00000000-0000-0000-0000-00000000a401'::uuid,  -- beheerder 1
    '00000000-0000-0000-0000-00000000a402'::uuid   -- beheerder 2
  ]) as m;

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-00000000a201', 'Idem A',     'bardienst', null, 0,    false, '00000000-0000-0000-0000-00000000a201'),
  ('00000000-0000-0000-0000-00000000a202', 'Idem B',     'bardienst', null, 0,    false, '00000000-0000-0000-0000-00000000a202'),
  ('00000000-0000-0000-0000-00000000a203', 'Idem O',     'bardienst', null, 0,    false, '00000000-0000-0000-0000-00000000a203'),
  ('00000000-0000-0000-0000-00000000a301', 'Idem Lid 1', 'lid',       null, 2000, false, null),
  ('00000000-0000-0000-0000-00000000a302', 'Idem Lid 2', 'lid',       null, 100,  false, null),
  ('00000000-0000-0000-0000-00000000a401', 'Idem Beheer 1', 'beheerder', null, 0, false, '00000000-0000-0000-0000-00000000a401'),
  ('00000000-0000-0000-0000-00000000a402', 'Idem Beheer 2', 'beheerder', null, 0, false, '00000000-0000-0000-0000-00000000a402');

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000a201');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000a201'),
  ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000a202');

create temp table uitkomst (naam text primary key, id uuid, extra text);

-- ── 1) place_order: eerste aanroep met sleutel ───────────────────────────

select pg_temp.act_as('00000000-0000-0000-0000-00000000a201', 'bar', '00000000-0000-0000-0000-00000000a501');
select pg_temp.act_as('00000000-0000-0000-0000-00000000a202', 'bar', '00000000-0000-0000-0000-00000000a501');
select pg_temp.act_as('00000000-0000-0000-0000-00000000a201', 'bar', '00000000-0000-0000-0000-00000000a501');

insert into uitkomst (naam, id)
select 'order1', (place_order(
  '00000000-0000-0000-0000-00000000a501'::uuid,
  '00000000-0000-0000-0000-00000000a301'::uuid,
  pg_temp.lines(2),
  '00000000-0000-0000-0000-00000000a201'::uuid,
  '00000000-0000-0000-0000-00000000b001'::uuid)).id;

select is(
  (select count(*)::integer from orders where id = (select id from uitkomst where naam = 'order1')),
  1,
  '1) place_order met sleutel boekt een bestelling'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-00000000a301'),
  1500,
  '1) het saldo daalt één keer (2 x 250)'
);
select is(
  (select array[rpc, actor_member_id::text, result_id::text]
     from idempotency_keys where request_id = '00000000-0000-0000-0000-00000000b001'),
  array['place_order', '00000000-0000-0000-0000-00000000a201',
        (select id::text from uitkomst where naam = 'order1')],
  '1) idempotency_keys bevat rpc, lid van de sessie en resultaat-id'
);

-- ── 2) place_order: replay ───────────────────────────────────────────────

select is(
  (select (place_order(
     '00000000-0000-0000-0000-00000000a501'::uuid,
     '00000000-0000-0000-0000-00000000a301'::uuid,
     pg_temp.lines(2),
     '00000000-0000-0000-0000-00000000a201'::uuid,
     '00000000-0000-0000-0000-00000000b001'::uuid)).id),
  (select id from uitkomst where naam = 'order1'),
  '2) replay geeft dezelfde bestelling terug'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-00000000a301'),
  1500,
  '2) replay wijzigt het saldo niet'
);
select is(
  (select count(*)::integer from orders where member_id = '00000000-0000-0000-0000-00000000a301'),
  1,
  '2) replay maakt geen tweede bestelling'
);
select is(
  (select count(*)::integer from order_lines
    where order_id = (select id from uitkomst where naam = 'order1')),
  1,
  '2) replay maakt geen extra bestelregels'
);
select is(
  (select count(*)::integer from idempotency_keys),
  1,
  '2) replay maakt geen tweede sleutelrij'
);

-- Regels in een andere volgorde zijn dezelfde opdracht.
insert into uitkomst (naam, id)
select 'order2', (place_order(
  '00000000-0000-0000-0000-00000000a501'::uuid,
  '00000000-0000-0000-0000-00000000a301'::uuid,
  jsonb_build_array(
    jsonb_build_object('product_id', '00000000-0000-0000-0000-00000000a101', 'qty', 1),
    jsonb_build_object('product_id', '00000000-0000-0000-0000-00000000a102', 'qty', 1)),
  '00000000-0000-0000-0000-00000000a201'::uuid,
  '00000000-0000-0000-0000-00000000b002'::uuid)).id;
select is(
  (select (place_order(
     '00000000-0000-0000-0000-00000000a501'::uuid,
     '00000000-0000-0000-0000-00000000a301'::uuid,
     jsonb_build_array(
       jsonb_build_object('product_id', '00000000-0000-0000-0000-00000000a102', 'qty', 1),
       jsonb_build_object('product_id', '00000000-0000-0000-0000-00000000a101', 'qty', 1)),
     '00000000-0000-0000-0000-00000000a201'::uuid,
     '00000000-0000-0000-0000-00000000b002'::uuid)).id),
  (select id from uitkomst where naam = 'order2'),
  '2) dezelfde regels in een andere volgorde zijn dezelfde opdracht (replay)'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-00000000a301'),
  850,
  '2) twee bestellingen geboekt (1500 - 650), de replay niet'
);

-- ── 3) place_order: replay met andere opdracht ───────────────────────────

select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(3),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) zelfde sleutel, andere aantallen: request_id_conflict'
);
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(0, 1),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) zelfde sleutel, ander product: request_id_conflict'
);
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a302'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) zelfde sleutel, ander lid: request_id_conflict'
);
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a202'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) zelfde sleutel, andere served_by: request_id_conflict (attributie is niet om te zetten)'
);
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       null, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) zelfde sleutel, gastbestelling in plaats van lid: request_id_conflict'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-00000000a301')
    + (select balance_cents from members where id = '00000000-0000-0000-0000-00000000a302'),
  950,
  '3) geen van de geweigerde aanroepen wijzigde een saldo'
);

-- ── 4) Sleutel van een ander lid, of van een andere RPC ──────────────────

select pg_temp.act_as('00000000-0000-0000-0000-00000000a202', 'bar', '00000000-0000-0000-0000-00000000a501');
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'P0001', 'request_id_conflict',
  '4) een ander lid met dezelfde sleutel en opdracht: request_id_conflict'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-00000000a202'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'P0001', 'request_id_conflict',
  '4) een place_order-sleutel op top_up: request_id_conflict'
);
select pg_temp.act_as('00000000-0000-0000-0000-00000000a201', 'bar', '00000000-0000-0000-0000-00000000a501');

-- ── 5) Mislukte eerste aanroep, saldo en dienst bij replay ───────────────

-- Lid 2 heeft 100 cent: een wijn (400) zakt onder de limiet 0.
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a302'::uuid, pg_temp.lines(0, 1),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b003'::uuid) $$,
  'P0001', 'insufficient_balance',
  '5) een eerste aanroep met onvoldoende saldo blijft insufficient_balance'
);
select is(
  (select count(*)::integer from idempotency_keys where request_id = '00000000-0000-0000-0000-00000000b003'),
  0,
  '5) een mislukte eerste aanroep laat geen sleutel achter'
);
update members set balance_cents = 1000 where id = '00000000-0000-0000-0000-00000000a302';
select lives_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a302'::uuid, pg_temp.lines(0, 1),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b003'::uuid) $$,
  '5) dezelfde sleutel is daarna weer bruikbaar en boekt'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-00000000a302'),
  600,
  '5) en boekt precies één keer'
);

-- Saldo ver onder de limiet: de replay geeft nog steeds het resultaat.
update members set balance_cents = -5000 where id = '00000000-0000-0000-0000-00000000a302';
select lives_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a302'::uuid, pg_temp.lines(0, 1),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b003'::uuid) $$,
  '5) replay met een inmiddels te laag saldo geeft geen insufficient_balance'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-00000000a302'),
  -5000,
  '5) en boekt niets'
);
update members set balance_cents = 600 where id = '00000000-0000-0000-0000-00000000a302';

-- Dienst met `ended_at` maar nog gekoppelde sessie (de guard eist de
-- koppeling, niet ended_at): de state-check shift_not_open loopt niet bij replay.
update shifts set ended_at = now() where id = '00000000-0000-0000-0000-00000000a501';
select is(
  (select (place_order(
     '00000000-0000-0000-0000-00000000a501'::uuid,
     '00000000-0000-0000-0000-00000000a301'::uuid,
     pg_temp.lines(2),
     '00000000-0000-0000-0000-00000000a201'::uuid,
     '00000000-0000-0000-0000-00000000b001'::uuid)).id),
  (select id from uitkomst where naam = 'order1'),
  '5) replay na dienst-ended_at geeft het oorspronkelijke resultaat (geen shift_not_open)'
);
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(1),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b004'::uuid) $$,
  'P0001', 'shift_not_open',
  '5) een eerste aanroep op de gesloten dienst blijft shift_not_open'
);
update shifts set ended_at = null where id = '00000000-0000-0000-0000-00000000a501';

-- ── 6) Zonder sleutel: gedrag als voorheen ───────────────────────────────

select is(
  (select count(*)::integer from idempotency_keys),
  3,
  '6) vóór de aanroepen zonder sleutel staan er drie sleutelrijen'
);
select lives_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(1),
       '00000000-0000-0000-0000-00000000a201'::uuid) $$,
  '6) place_order zonder sleutel (4 argumenten) werkt'
);
select lives_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(1),
       '00000000-0000-0000-0000-00000000a201'::uuid, null) $$,
  '6) place_order met expliciete null-sleutel werkt'
);
select is(
  (select count(*)::integer from orders where member_id = '00000000-0000-0000-0000-00000000a301'),
  4,
  '6) zonder sleutel dedupliceert niets: twee extra bestellingen'
);
select is(
  (select count(*)::integer from idempotency_keys),
  3,
  '6) zonder sleutel komt er geen rij in idempotency_keys'
);

-- ── 1/2/3/4) top_up ──────────────────────────────────────────────────────

insert into uitkomst (naam, id)
select 'topup1', (top_up(
  '00000000-0000-0000-0000-00000000a501'::uuid,
  '00000000-0000-0000-0000-00000000a301'::uuid,
  700, 'cash',
  '00000000-0000-0000-0000-00000000a201'::uuid,
  '00000000-0000-0000-0000-00000000b010'::uuid)).id;
insert into uitkomst (naam, extra)
select 'saldo_na_topup', balance_cents::text from members where id = '00000000-0000-0000-0000-00000000a301';

select is(
  (select array[rpc, actor_member_id::text, result_id::text]
     from idempotency_keys where request_id = '00000000-0000-0000-0000-00000000b010'),
  array['top_up', '00000000-0000-0000-0000-00000000a201',
        (select id::text from uitkomst where naam = 'topup1')],
  '1) top_up met sleutel: rij in idempotency_keys met rpc, lid en resultaat-id'
);
select is(
  (select (top_up(
     '00000000-0000-0000-0000-00000000a501'::uuid,
     '00000000-0000-0000-0000-00000000a301'::uuid,
     700, 'cash',
     '00000000-0000-0000-0000-00000000a201'::uuid,
     '00000000-0000-0000-0000-00000000b010'::uuid)).id),
  (select id from uitkomst where naam = 'topup1'),
  '2) top_up replay geeft dezelfde opwaardering terug'
);
select is(
  (select balance_cents::text from members where id = '00000000-0000-0000-0000-00000000a301'),
  (select extra from uitkomst where naam = 'saldo_na_topup'),
  '2) top_up replay wijzigt het saldo niet'
);
select is(
  (select count(*)::integer from top_ups where member_id = '00000000-0000-0000-0000-00000000a301'),
  1,
  '2) top_up replay maakt geen tweede opwaardering'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 800, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b010'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) top_up, zelfde sleutel, ander bedrag: request_id_conflict'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a302'::uuid, 700, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b010'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) top_up, zelfde sleutel, ander lid: request_id_conflict'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 700, 'cash',
       '00000000-0000-0000-0000-00000000a202'::uuid,
       '00000000-0000-0000-0000-00000000b010'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) top_up, zelfde sleutel, andere served_by: request_id_conflict'
);
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(1),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b010'::uuid) $$,
  'P0001', 'request_id_conflict',
  '4) een top_up-sleutel op place_order: request_id_conflict'
);
select pg_temp.act_as('00000000-0000-0000-0000-00000000a202', 'bar', '00000000-0000-0000-0000-00000000a501');
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 700, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b010'::uuid) $$,
  'P0001', 'request_id_conflict',
  '4) top_up met de sleutel van een ander lid: request_id_conflict'
);
select pg_temp.act_as('00000000-0000-0000-0000-00000000a201', 'bar', '00000000-0000-0000-0000-00000000a501');

-- 8) €500-grens onveranderd, en een mislukte aanroep laat geen sleutel achter.
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 50001, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b011'::uuid) $$,
  'P0001', 'amount_exceeds_max',
  '8) €500,01 blijft amount_exceeds_max, ook met sleutel'
);
select is(
  (select count(*)::integer from idempotency_keys where request_id = '00000000-0000-0000-0000-00000000b011'),
  0,
  '8) de geweigerde aanroep laat geen sleutel achter'
);
select lives_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 50000, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b011'::uuid) $$,
  '8) precies €500 slaagt met dezelfde sleutel'
);

-- 6) top_up zonder sleutel
select lives_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 100, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid) $$,
  '6) top_up zonder sleutel (5 argumenten) werkt'
);
select is(
  (select count(*)::integer from idempotency_keys),
  5,
  '6) en laat geen sleutelrij achter (3 + 2 top_up-sleutels)'
);

-- ── 7) Guards en self_top_up_forbidden, ook met een bestaande sleutel ────

select is(
  pg_temp.err($$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a201'::uuid, 700, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b010'::uuid) $$),
  'self_top_up_forbidden',
  '7) self_top_up_forbidden met een bestaande sleutel'
);
select is(
  pg_temp.err($$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a201'::uuid, 700, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid) $$),
  'self_top_up_forbidden',
  '7) dezelfde fout zonder sleutel'
);

-- Een bardienst die niet op de dienst staat.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a203', 'bar');
select isnt(
  pg_temp.err($$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$),
  'request_id_conflict',
  '7) place_order: een sessie niet op de dienst krijgt niet request_id_conflict'
);
select is(
  pg_temp.err($$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$),
  pg_temp.err($$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid) $$),
  '7) place_order: dezelfde guardfout met en zonder bestaande sleutel'
);
select is(
  pg_temp.err($$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 700, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b010'::uuid) $$),
  pg_temp.err($$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 700, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid) $$),
  '7) top_up: dezelfde guardfout met en zonder bestaande sleutel'
);

-- Een beheersessie (modus beheer) is geen bar-sessie voor een dienst.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a401', 'beheer');
select isnt(
  pg_temp.err($$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$),
  'request_id_conflict',
  '7) place_order vanuit een beheersessie met een bestaande sleutel: gewone guardfout'
);

-- Geen sessie voor dit account (een buitenstaander): dezelfde fout als zonder sleutel.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000dead', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000dead","session_id":"00000000-0000-0000-0000-00000000dead"}', true);
select is(
  pg_temp.err($$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$),
  pg_temp.err($$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid) $$),
  '7) een buitenstaander leert niets uit het bestaan van een sleutel'
);

-- ── create_member ────────────────────────────────────────────────────────

select pg_temp.act_as('00000000-0000-0000-0000-00000000a401', 'beheer');

insert into uitkomst (naam, id)
select 'lid1', (create_member(' Idem Nieuw ', 300, ' nieuw@idem.test ',
  '00000000-0000-0000-0000-00000000b020'::uuid)).id;

select is(
  (select array[rpc, actor_member_id::text, result_id::text]
     from idempotency_keys where request_id = '00000000-0000-0000-0000-00000000b020'),
  array['create_member', '00000000-0000-0000-0000-00000000a401',
        (select id::text from uitkomst where naam = 'lid1')],
  '1) create_member met sleutel: rij met rpc, beheerder en resultaat-id'
);
select is(
  (select (name, balance_cents, email) from members where id = (select id from uitkomst where naam = 'lid1'))::text,
  '("Idem Nieuw",300,nieuw@idem.test)',
  '1) het lid is aangemaakt met de genormaliseerde waarden'
);
select is(
  (select (create_member('Idem Nieuw', 300, 'nieuw@idem.test',
     '00000000-0000-0000-0000-00000000b020'::uuid)).id),
  (select id from uitkomst where naam = 'lid1'),
  '2) create_member replay (genormaliseerd gelijk) geeft hetzelfde lid terug'
);
select is(
  (select (create_member('Idem Nieuw', 300, 'nieuw@idem.test',
     '00000000-0000-0000-0000-00000000b020'::uuid)).pin_hash),
  null,
  '2) de replay geeft pin_hash null terug'
);
select is(
  (select count(*)::integer from members where name = 'Idem Nieuw'),
  1,
  '2) replay maakt geen tweede lid'
);
select throws_ok(
  $$ select create_member('Idem Andere', 300, 'nieuw@idem.test', '00000000-0000-0000-0000-00000000b020'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) create_member, zelfde sleutel, andere naam: request_id_conflict'
);
select throws_ok(
  $$ select create_member('Idem Nieuw', 400, 'nieuw@idem.test', '00000000-0000-0000-0000-00000000b020'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) create_member, zelfde sleutel, ander startsaldo: request_id_conflict'
);
select throws_ok(
  $$ select create_member('Idem Nieuw', 300, null, '00000000-0000-0000-0000-00000000b020'::uuid) $$,
  'P0001', 'request_id_conflict',
  '3) create_member, zelfde sleutel, geen e-mailadres meer: request_id_conflict'
);
select pg_temp.act_as('00000000-0000-0000-0000-00000000a201', 'bar', '00000000-0000-0000-0000-00000000a501');
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, 100, 'cash',
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b020'::uuid) $$,
  'P0001', 'request_id_conflict',
  '4) een create_member-sleutel op top_up: request_id_conflict'
);
select pg_temp.act_as('00000000-0000-0000-0000-00000000a401', 'beheer');
select pg_temp.act_as('00000000-0000-0000-0000-00000000a402', 'beheer');
select throws_ok(
  $$ select create_member('Idem Nieuw', 300, 'nieuw@idem.test', '00000000-0000-0000-0000-00000000b020'::uuid) $$,
  'P0001', 'request_id_conflict',
  '4) een andere beheerder met dezelfde sleutel en opdracht: request_id_conflict'
);

-- Een mislukte validatie laat geen sleutel achter; zonder sleutel: gedrag als voorheen.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a401', 'beheer');
select throws_ok(
  $$ select create_member('  ', 0, null, '00000000-0000-0000-0000-00000000b021'::uuid) $$,
  'P0001', 'invalid_name',
  '5) create_member met ongeldige naam blijft invalid_name'
);
select is(
  (select count(*)::integer from idempotency_keys where request_id = '00000000-0000-0000-0000-00000000b021'),
  0,
  '5) en laat geen sleutel achter'
);
select lives_ok(
  $$ select create_member('Idem Zonder Sleutel', null) $$,
  '6) create_member zonder sleutel (2 argumenten) werkt'
);
select is(
  (select count(*)::integer from idempotency_keys where rpc = 'create_member'),
  1,
  '6) en laat geen sleutelrij achter'
);

-- Guards: een bar-modus-sessie en een bardienst.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a201', 'bar', '00000000-0000-0000-0000-00000000a501');
select is(
  pg_temp.err($$ select create_member('Idem Nieuw', 300, 'nieuw@idem.test', '00000000-0000-0000-0000-00000000b020'::uuid) $$),
  pg_temp.err($$ select create_member('Idem Nieuw', 300, 'nieuw@idem.test') $$),
  '7) create_member vanuit een bar-sessie: dezelfde guardfout met en zonder bestaande sleutel'
);
select isnt(
  pg_temp.err($$ select create_member('Idem Nieuw', 300, 'nieuw@idem.test', '00000000-0000-0000-0000-00000000b020'::uuid) $$),
  'request_id_conflict',
  '7) en niet request_id_conflict'
);

-- ── 9) Rechten, retentie en cron ─────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a201', true);
set local role authenticated;
select throws_ok(
  $$ select count(*) from idempotency_keys $$,
  '42501', 'permission denied for table idempotency_keys',
  '9) authenticated kan idempotency_keys niet lezen'
);
select throws_ok(
  $$ insert into idempotency_keys (request_id, rpc, actor_member_id, payload_hash, result_id)
     values ('00000000-0000-0000-0000-00000000b0ff', 'top_up',
             '00000000-0000-0000-0000-00000000a201', 'x', '00000000-0000-0000-0000-00000000b0ff') $$,
  '42501', 'permission denied for table idempotency_keys',
  '9) authenticated kan geen sleutel invoegen'
);
select throws_ok(
  $$ update idempotency_keys set payload_hash = 'x' $$,
  '42501', 'permission denied for table idempotency_keys',
  '9) authenticated kan geen sleutel wijzigen'
);
select throws_ok(
  $$ delete from idempotency_keys $$,
  '42501', 'permission denied for table idempotency_keys',
  '9) authenticated kan geen sleutel verwijderen'
);
select throws_ok(
  $$ select purge_idempotency_keys() $$,
  '42501', 'permission denied for function purge_idempotency_keys',
  '9) authenticated kan purge_idempotency_keys niet uitvoeren'
);
reset role;

set local role anon;
select throws_ok(
  $$ select count(*) from idempotency_keys $$,
  '42501', 'permission denied for table idempotency_keys',
  '9) anon kan idempotency_keys niet lezen'
);
select throws_ok(
  $$ insert into idempotency_keys (request_id, rpc, actor_member_id, payload_hash, result_id)
     values ('00000000-0000-0000-0000-00000000b0fe', 'top_up',
             '00000000-0000-0000-0000-00000000a201', 'x', '00000000-0000-0000-0000-00000000b0fe') $$,
  '42501', 'permission denied for table idempotency_keys',
  '9) anon kan geen sleutel invoegen'
);
reset role;

set local role service_role;
select throws_ok(
  $$ select purge_idempotency_keys() $$,
  '42501', 'permission denied for function purge_idempotency_keys',
  '9) service_role kan purge_idempotency_keys niet uitvoeren'
);
reset role;

select is(
  (select count(*)::integer from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'idempotency_keys'
      and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0,
  '9) anon, authenticated en PUBLIC hebben geen enkel tabelrecht op idempotency_keys'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.idempotency_keys'::regclass)
    and (select count(*) = 0 from pg_policies
          where schemaname = 'public' and tablename = 'idempotency_keys'),
  '9) RLS aan op idempotency_keys, geen enkele policy'
);

-- Retentie: 31 dagen weg, 29 dagen blijft.
delete from idempotency_keys;
insert into idempotency_keys (request_id, rpc, actor_member_id, payload_hash, result_id, created_at) values
  ('00000000-0000-0000-0000-00000000c001', 'top_up', '00000000-0000-0000-0000-00000000a201', 'x',
   '00000000-0000-0000-0000-00000000c001', now() - interval '31 days'),
  ('00000000-0000-0000-0000-00000000c002', 'top_up', '00000000-0000-0000-0000-00000000a201', 'x',
   '00000000-0000-0000-0000-00000000c002', now() - interval '29 days');
select purge_idempotency_keys();
select is(
  (select array_agg(request_id::text) from idempotency_keys),
  array['00000000-0000-0000-0000-00000000c002'],
  '9) purge_idempotency_keys verwijdert een rij van 31 dagen en laat een van 29 staan'
);
select is(
  (select count(*)::integer from cron.job
    where command = 'select purge_idempotency_keys()'
      and schedule = '0 3 * * *'
      and jobname = 'purge_idempotency_keys'),
  1,
  '9) cron.job bevat de dagelijkse purge_idempotency_keys-job'
);

-- ── 10) Geen overloads ───────────────────────────────────────────────────

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'place_order'),
  1,
  '10) place_order heeft één signatuur'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'top_up'),
  1,
  '10) top_up heeft één signatuur'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_member'),
  1,
  '10) create_member heeft één signatuur'
);
select ok(
  has_function_privilege('authenticated', 'public.place_order(uuid,uuid,jsonb,uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.top_up(uuid,uuid,integer,text,uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.create_member(text,integer,text,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.place_order(uuid,uuid,jsonb,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.top_up(uuid,uuid,integer,text,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.create_member(text,integer,text,uuid)', 'EXECUTE'),
  '10) de nieuwe signaturen: wel authenticated, niet anon'
);

-- ── 5b) Een echte end_shift: de guard sluit de sessie uit ────────────────
--
-- Zodra de dienst via end_shift sluit, vervallen de koppelingen en weigert
-- de (ongewijzigde) guard een replay met session_not_on_shift, niet de
-- idempotentie. Bewust vastgelegd: de replay-garantie geldt zolang de sessie
-- aan de dienst gekoppeld is.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a201', 'bar', '00000000-0000-0000-0000-00000000a501');
select end_shift('00000000-0000-0000-0000-00000000a501');
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-00000000a501'::uuid,
       '00000000-0000-0000-0000-00000000a301'::uuid, pg_temp.lines(2),
       '00000000-0000-0000-0000-00000000a201'::uuid,
       '00000000-0000-0000-0000-00000000b001'::uuid) $$,
  'P0001', 'session_not_on_shift',
  '5b) na end_shift weigert de guard (session_not_on_shift) ook een replay'
);

select * from finish();
rollback;
