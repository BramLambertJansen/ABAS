-- Attributie en sessie-herkomst van de geld-RPC's na dienst-per-sessie
-- (0029, docs/features/dienst-per-sessie.md → Bestaande RPC's, ADR 0016;
-- CLAUDE.md → Architectuurbeslissingen "served_by komt uit de bezetting").
--
-- Wat hier vastligt, bovenop de per-RPC-bestanden (place_order, top_up,
-- reverse_order):
--   * bar_session_id is nooit een clientparameter: geen enkele bar- of
--     geld-RPC heeft een argument dat naar een sessie verwijst, en de kolom
--     komt uit het session_id-claim van de áánroepende sessie — ook als het
--     lid een tweede sessie heeft, of als twee sessies in dezelfde dienst
--     werken;
--   * served_by/reversed_by worden tegen de bezetting van déze dienst
--     gecontroleerd: niet tegen de bezetting van een andere dienst, niet
--     tegen de sessie (het lid van de sessie dat zichzelf uit de bezetting
--     haalde, kan niet meer als served_by), en een verwijderd bezettingslid
--     telt niet meer; null is geen served_by;
--   * A4 kijkt naar het lid van de sessie, ook als served_by een geldig
--     bezettingslid is, en ook voor een beheerder; een ander lid opwaarderen
--     mag wel;
--   * een geweigerde geldaanroep verplaatst geen geld en schrijft geen rij.
--
-- Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(33);

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

-- Zelfde reden als place_order.test.sql: seed.sql zet de limiet op 1500.
update app_settings set negative_limit_cents = 0;

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000007010', 'Attr Starter',   'bardienst', null, 0,    false),
  ('00000000-0000-0000-0000-000000007011', 'Attr Collega',   'bardienst', null, 0,    false),
  ('00000000-0000-0000-0000-000000007012', 'Attr Elders',    'bardienst', null, 0,    false),
  ('00000000-0000-0000-0000-000000007013', 'Attr Koper',     'lid',       null, 1000, false),
  ('00000000-0000-0000-0000-000000007014', 'Attr Beheerder', 'beheerder', null, 0,    false);

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000070c0', 'Attr Pils', 'Bier', 250, false);

-- De open dienst: starter en collega in de bezetting. Een gesloten dienst
-- waarin "Attr Elders" wel in de bezetting stond.
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-000000007010');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-000000007010'),
  ('00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-000000007011');
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-000000007021', '00000000-0000-0000-0000-000000007012', now());
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000007021', '00000000-0000-0000-0000-000000007012');

-- Sessies: de starter heeft er twee (d1 gekoppeld, d2 niet), de collega één
-- (d3, ook aan de dienst gekoppeld: twee sessies in één dienst), de beheerder
-- één (d4, gekoppeld).
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000007010', null, '00000000-0000-0000-0000-0000000070d2');
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000007011', '00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-0000000070d3');
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000007014', '00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-0000000070d4');
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000007010', '00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-0000000070d1');

-- ═══ bar_session_id is geen clientparameter ═══════════════════════════════

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('place_order', 'top_up', 'reverse_order_at_bar', 'reverse_order_as_admin',
                        'start_shift', 'end_shift', 'add_shift_member', 'remove_shift_member',
                        'resume_orphan_shift', 'admin_take_over_shift', 'admin_end_shift')
      and exists (select 1 from unnest(coalesce(p.proargnames, '{}'::text[])) a where a ilike '%session%')),
  0,
  'geen bar- of geld-RPC heeft een argument dat naar een sessie verwijst (bar_session_id is nooit een clientparameter)'
);
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('place_order', 'top_up', 'reverse_order_at_bar', 'reverse_order_as_admin')),
  4,
  'place_order, top_up en de twee terugdraai-RPC''s hebben elk precies één signatuur (geen overload met een sessie-argument)'
);

-- Twee sessies van hetzelfde lid: de boeking hangt aan de aanroepende sessie.
select lives_ok(
  $$ select place_order('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000070c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000007010'::uuid) $$,
  'de starter bestelt vanuit zijn gekoppelde sessie'
);
select is(
  (select bar_session_id from orders where member_id = '00000000-0000-0000-0000-000000007013'),
  (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000070d1'),
  'orders.bar_session_id is de aanroepende sessie, niet de andere sessie van hetzelfde lid'
);

-- De tweede sessie van de starter werkt niet in de dienst.
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000007010', null, '00000000-0000-0000-0000-0000000070d2');
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000070c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000007010'::uuid) $$,
  'P0001', 'session_not_on_shift',
  'een tweede, niet-gekoppelde sessie van hetzelfde lid boekt niet in de dienst'
);

-- De collega (eigen sessie, zelfde dienst) draait de bestelling van de starter
-- terug: de terugdraaiing hangt aan de sessie van de collega.
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000007011', null, '00000000-0000-0000-0000-0000000070d3');
select lives_ok(
  $$ select reverse_order_at_bar(
       (select id from orders where member_id = '00000000-0000-0000-0000-000000007013'),
       '00000000-0000-0000-0000-000000007020'::uuid, 'verkeerd lid',
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'een tweede sessie in dezelfde dienst draait een bestelling van de eerste terug'
);
select is(
  (select r.bar_session_id from order_reversals r join orders o on o.id = r.order_id
    where o.member_id = '00000000-0000-0000-0000-000000007013'),
  (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000070d3'),
  'order_reversals.bar_session_id is de sessie die terugdraaide, niet die van de bestelling'
);
select lives_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-000000007010'::uuid) $$,
  'de collega waardeert op met de starter als served_by'
);
select is(
  (select bar_session_id from top_ups where member_id = '00000000-0000-0000-0000-000000007013'),
  (select id from bar_sessions where auth_session_id = '00000000-0000-0000-0000-0000000070d3'),
  'top_ups.bar_session_id is de aanroepende sessie, niet die van served_by'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000007013'),
  1500,
  'stap: saldo koper na bestelling, terugdraaiing en opwaardering (1000 - 250 + 250 + 500)'
);

-- ═══ served_by / reversed_by tegen de bezetting van déze dienst ══════════

-- Een bestelling om terug te draaien in de weigergevallen hieronder.
select place_order('00000000-0000-0000-0000-000000007020'::uuid,
  '00000000-0000-0000-0000-000000007013'::uuid,
  '[{"product_id":"00000000-0000-0000-0000-0000000070c0","qty":2}]'::jsonb,
  '00000000-0000-0000-0000-000000007011'::uuid);
select set_config('test.order',
  (select id::text from orders where member_id = '00000000-0000-0000-0000-000000007013' and total_cents = 500), true);

-- In de bezetting van een andere (gesloten) dienst, niet van deze.
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000070c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000007012'::uuid) $$,
  'P0001', 'served_by_not_on_shift',
  'place_order: served_by uit de bezetting van een andere dienst telt niet'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-000000007012'::uuid) $$,
  'P0001', 'served_by_not_on_shift',
  'top_up: served_by uit de bezetting van een andere dienst telt niet'
);
select throws_ok(
  $$ select reverse_order_at_bar(current_setting('test.order')::uuid,
       '00000000-0000-0000-0000-000000007020'::uuid, 'reden',
       '00000000-0000-0000-0000-000000007012'::uuid) $$,
  'P0001', 'reversed_by_not_on_shift',
  'reverse_order_at_bar: reversed_by uit de bezetting van een andere dienst telt niet'
);

-- null is geen served_by.
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000070c0","qty":1}]'::jsonb,
       null) $$,
  'P0001', 'served_by_not_on_shift',
  'place_order: served_by null wordt geweigerd'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid, 500, 'cash', null) $$,
  'P0001', 'served_by_not_on_shift',
  'top_up: served_by null wordt geweigerd'
);
select throws_ok(
  $$ select reverse_order_at_bar(current_setting('test.order')::uuid,
       '00000000-0000-0000-0000-000000007020'::uuid, 'reden', null) $$,
  'P0001', 'reversed_by_not_on_shift',
  'reverse_order_at_bar: reversed_by null wordt geweigerd'
);

-- De starter haalt zichzelf uit de bezetting (mag, spec → Randgevallen). Zijn
-- sessie werkt door, maar hij is geen geldige served_by meer: attributie komt
-- uit de bezetting, niet uit de sessie.
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000007010', null, '00000000-0000-0000-0000-0000000070d1');
select remove_shift_member('00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-000000007010');
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000070c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000007010'::uuid) $$,
  'P0001', 'served_by_not_on_shift',
  'place_order: het lid van de sessie is na verwijderen uit de bezetting geen geldige served_by meer'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-000000007010'::uuid) $$,
  'P0001', 'served_by_not_on_shift',
  'top_up: het lid van de sessie is na verwijderen uit de bezetting geen geldige served_by meer'
);
select throws_ok(
  $$ select reverse_order_at_bar(current_setting('test.order')::uuid,
       '00000000-0000-0000-0000-000000007020'::uuid, 'reden',
       '00000000-0000-0000-0000-000000007010'::uuid) $$,
  'P0001', 'reversed_by_not_on_shift',
  'reverse_order_at_bar: het lid van de sessie is na verwijderen uit de bezetting geen geldige reversed_by meer'
);
-- Wel: dezelfde sessie boekt met een ander bezettingslid als served_by.
select lives_ok(
  $$ select place_order('00000000-0000-0000-0000-000000007020'::uuid,
       null,
       '[{"product_id":"00000000-0000-0000-0000-0000000070c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'de sessie werkt door na zichzelf uit de bezetting te halen, met een bezettingslid als served_by'
);

-- Een verwijderd bezettingslid telt niet meer.
select remove_shift_member('00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-000000007011');
select throws_ok(
  $$ select place_order('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000070c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'P0001', 'served_by_not_on_shift',
  'place_order: een uit de bezetting verwijderd lid is geen geldige served_by meer'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'P0001', 'served_by_not_on_shift',
  'top_up: een uit de bezetting verwijderd lid is geen geldige served_by meer'
);
select throws_ok(
  $$ select reverse_order_at_bar(current_setting('test.order')::uuid,
       '00000000-0000-0000-0000-000000007020'::uuid, 'reden',
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'P0001', 'reversed_by_not_on_shift',
  'reverse_order_at_bar: een uit de bezetting verwijderd lid is geen geldige reversed_by meer'
);

-- Geen van de geweigerde aanroepen verplaatste geld of schreef een rij.
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000007013'),
  1000,
  'saldo koper na de weigeringen: alleen de bestelling van 500 is eraf (1500 - 500)'
);
select results_eq(
  $$ select (select count(*)::int from orders where member_id = '00000000-0000-0000-0000-000000007013'),
            (select count(*)::int from top_ups where member_id = '00000000-0000-0000-0000-000000007013'),
            (select count(*)::int from order_reversals where order_id = current_setting('test.order')::uuid) $$,
  $$ values (2, 1, 0) $$,
  'de geweigerde aanroepen schreven geen bestelling, opwaardering of terugdraaiing'
);

-- ═══ A4 en het maximum ════════════════════════════════════════════════════

-- Collega terug in de bezetting.
select add_shift_member('00000000-0000-0000-0000-000000007020', '00000000-0000-0000-0000-000000007011');

-- Het realistische geval: de starter waardeert zichzelf op, met de collega
-- (geldig bezettingslid) als served_by. A4 kijkt naar de sessie.
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007010'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'P0001', 'self_top_up_forbidden',
  'A4: zichzelf opwaarderen blijft geweigerd als served_by een geldig ander bezettingslid is'
);

-- Een beheerder in bar-modus: ook geen zelf-opwaardering.
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000007014', null, '00000000-0000-0000-0000-0000000070d4');
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007014'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'P0001', 'self_top_up_forbidden',
  'A4 geldt ook voor een beheerder'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000007014'),
  0,
  'het saldo van de beheerder is ongewijzigd na de geweigerde zelf-opwaardering'
);
-- Een ander lid (de starter) opwaarderen mag wel: A4 gaat alleen over de eigen sessie.
select lives_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007010'::uuid, 500, 'cash',
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'een beheerder waardeert een collega-bardienst op (A4 gaat alleen over het lid van de sessie)'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000007010'),
  500,
  'het saldo van de collega is met het bedrag verhoogd'
);

-- Boven het maximum en een null-bedrag: geen geld verplaatst.
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid, 50001, 'cash',
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'P0001', 'amount_exceeds_max',
  'top_up boven €500 wordt geweigerd'
);
select throws_ok(
  $$ select top_up('00000000-0000-0000-0000-000000007020'::uuid,
       '00000000-0000-0000-0000-000000007013'::uuid, null, 'cash',
       '00000000-0000-0000-0000-000000007011'::uuid) $$,
  'P0001', 'invalid_amount',
  'top_up met een null-bedrag wordt geweigerd'
);
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000007013'),
  1000,
  'de geweigerde opwaarderingen veranderden het saldo niet'
);

select * from finish();
rollback;
