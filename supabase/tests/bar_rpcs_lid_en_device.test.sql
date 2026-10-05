-- Een lid-sessie (portal) en een sessie zonder lid (het device-account dat bij
-- de uitrol verdwijnt) kunnen geen bar-RPC aanroepen: A2 uit docs/features/
-- bar-rpc-autorisatie.md, vervangen door de allowlist van dienst-per-sessie
-- (0028/0029, ADR 0016; A3 en B3 zijn daarmee gerealiseerd). Vervangt
-- bar_rpcs_weigeren_lid.test.sql (0023, de `caller_is_lid()`-denylist).
--
-- Draait als `authenticated` (niet als superuser), zelfde vorm als
-- rls_lid_eigen_rijen.test.sql: zo loopt de aanroep door dezelfde
-- EXECUTE-grant en dezelfde auth.uid() als een echte sessie. Het
-- aanvalsscenario is letterlijk: een lid dat alleen leest wat het mag lezen
-- (eigen members.id, een open shift_id, een served_by uit shift_members) en
-- daarmee de RPC aanroept. Sinds dienst-per-sessie is het antwoord voor
-- zo'n sessie `no_bar_session` (geen bar-sessie te registreren voor een lid),
-- niet meer `no_bar_role`.
--
-- Draait met `npm run db:test`.

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

-- ── Fixtures (als superuser) ──────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000005a0', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bar-rpc-lid@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  -- Geen members-rij: het device-account uit ADR 0011.
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bar-rpc-device@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

-- De Auth-sessies van het lid en het device-account: register_bar_session
-- eist een rij in auth.sessions (0040, ADR 0020 → Beslissing 8). Zonder die
-- rij zou het `session_ended` geven en niet de rolcheck testen.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000005f0', '00000000-0000-0000-0000-0000000005a0', now(), now()),
  ('00000000-0000-0000-0000-0000000005f1', '00000000-0000-0000-0000-0000000005a2', now(), now());

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-0000000005b0', 'Bar-RPC Lid',       'lid',       null, 1000, false, '00000000-0000-0000-0000-0000000005a0'),
  ('00000000-0000-0000-0000-0000000005b1', 'Bar-RPC Bardienst', 'bardienst', null, 0, false, null);

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000005c0', 'Bar-RPC Pils', 'Bier', 250, false);

update shifts set ended_at = now() where ended_at is null;
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000005d0', '00000000-0000-0000-0000-0000000005b1');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000005d0', '00000000-0000-0000-0000-0000000005b1');

-- Een eigen bestelling van het lid, om terugdraaien op te proberen.
insert into orders (id, shift_id, member_id, served_by, total_cents) values
  ('00000000-0000-0000-0000-0000000005e0', '00000000-0000-0000-0000-0000000005d0',
   '00000000-0000-0000-0000-0000000005b0', '00000000-0000-0000-0000-0000000005b1', 250);
insert into order_lines (order_id, product_id, qty, unit_cents) values
  ('00000000-0000-0000-0000-0000000005e0', '00000000-0000-0000-0000-0000000005c0', 1, 250);

-- ── Lid-sessie: alles geweigerd ──────────────────────────────────────────

-- Een lid heeft wel een sessie (session_id in het JWT), maar nooit een rij in
-- bar_sessions.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a0', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000005a0","session_id":"00000000-0000-0000-0000-0000000005f0"}', true);
set local role authenticated;

select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       50000, 'cash',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_session',
  'top_up weigert een lid-sessie die zichzelf opwaardeert'
);

-- De guard staat vóór de andere checks: een lid krijgt no_bar_session, niet
-- shift_not_open, dus leert niets over welke diensten bestaan.
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000005ff'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_session',
  'top_up geeft een lid no_bar_session, ook bij een niet-bestaande dienst'
);

select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000005c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_session',
  'place_order weigert een lid-sessie'
);

select throws_ok(
  $$ select reverse_order_at_bar(
       '00000000-0000-0000-0000-0000000005e0'::uuid,
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       'zelf terugdraaien',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_session',
  'reverse_order_at_bar weigert een lid-sessie'
);

select throws_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000005d0'::uuid) $$,
  'P0001', 'no_bar_session',
  'end_shift weigert een lid-sessie'
);
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_session',
  'add_shift_member weigert een lid-sessie'
);
select throws_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_session',
  'remove_shift_member weigert een lid-sessie'
);
select throws_ok(
  $$ select start_shift(gen_random_uuid()) $$,
  'P0001', 'no_bar_session',
  'start_shift weigert een lid-sessie'
);

-- Een lid kan zich ook niet als bar-sessie registreren (dat zou de allowlist
-- omzeilen): de rolcheck in register_bar_session.
select throws_ok(
  $$ select register_bar_session('bar') $$,
  'P0001', 'no_bar_role',
  'register_bar_session weigert een lid (rol lid)'
);
select throws_ok(
  $$ select register_bar_session('beheer') $$,
  'P0001', 'no_bar_role',
  'register_bar_session(beheer) weigert een lid'
);

reset role;

-- Niets is bewogen.
select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-0000000005b0'),
  1000,
  'saldo van het lid is ongewijzigd na de geweigerde aanroepen'
);
select is(
  (select count(*)::int from top_ups where member_id = '00000000-0000-0000-0000-0000000005b0'),
  0,
  'geen top_ups-rij voor het lid'
);
select is(
  (select count(*)::int from order_reversals where order_id = '00000000-0000-0000-0000-0000000005e0'),
  0,
  'de bestelling van het lid is niet teruggedraaid'
);
select ok(
  (select ended_at is null from shifts where id = '00000000-0000-0000-0000-0000000005d0'),
  'de dienst staat nog open'
);
select is(
  (select count(*)::int from shift_members where shift_id = '00000000-0000-0000-0000-0000000005d0'),
  1,
  'de bezetting is ongewijzigd'
);
select is(
  (select count(*)::int from bar_sessions where member_id = '00000000-0000-0000-0000-0000000005b0'),
  0,
  'er is geen bar-sessie voor het lid aangemaakt'
);

-- ── Sessie zonder lid (het device-account): ook alles geweigerd ──────────
-- Het device-account heeft geen members-rij en dus geen bar-sessie; met de
-- nieuwe guards kan het niets meer, ook niet als het cookie nog werkt.

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a2', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000005a2","session_id":"00000000-0000-0000-0000-0000000005f1"}', true);
set local role authenticated;

select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_session',
  'top_up weigert de device-sessie (geen members-rij)'
);
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000005c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'P0001', 'no_bar_session',
  'place_order weigert de device-sessie'
);
select throws_ok(
  $$ select register_bar_session('bar') $$,
  'P0001', 'no_bar_role',
  'register_bar_session weigert een account zonder lid'
);

reset role;

-- ── Een bardienst met een geregistreerde bar-sessie werkt gewoon ─────────

select pg_temp.act_as_bar('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005d0');
set local role authenticated;

select lives_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000005d0'::uuid,
       '00000000-0000-0000-0000-0000000005b0'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000005c0","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000005b1'::uuid) $$,
  'place_order slaagt voor een bardienst met een bar-sessie die aan de dienst gekoppeld is'
);

select * from finish();
rollback;
