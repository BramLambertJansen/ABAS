-- Test-dekking voor end_shift(p_shift_id uuid) sinds dienst-per-sessie
-- (0029_bar_rpcs_eisen_bar_sessie.sql, docs/features/dienst-per-sessie.md →
-- Bestaande RPC's). Vóór die migratie was end_shift een stille no-op voor een
-- onbekende of al gesloten dienst (0001/0023, oorspronkelijk voor #12,
-- docs/features/dienst-afsluiten.md); nu eist het een actieve koppeling van de
-- sessie met de dienst en is "geen koppeling" een fout, geen stille no-op.
-- Run met `npm run db:test` (= `supabase test db`, needs `supabase start` /
-- Docker locally).
--
-- Testgevallen:
--   1) happy path: de dienst sluit, de koppeling krijgt `dienst_afgesloten`
--   2) een tweede aanroep is een fout (de koppeling is weg), en overschrijft
--      `ended_at` niet
--   3) een onbekende dienst is `session_not_on_shift`
--   4) sluit de lus met place_order/top_up via het echte sluitpad
--   5) een sessie zonder koppeling aan déze dienst kan hem niet sluiten
--   6) een openstaande melding voor de dienst wordt opgelost

create extension if not exists pgtap with schema extensions;

begin;
select plan(13);

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

-- ── 1) Happy path ─────────────────────────────────────────────────────
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000000e0', 'ES Happy Starter', 'bardienst', null, 0, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e0');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e0');
select pg_temp.act_as_bar('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-0000000000e3');

select lives_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'end_shift succeeds for an open shift with an active koppeling'
);

select isnt(
  (select ended_at from shifts where id = '00000000-0000-0000-0000-0000000000e3'),
  null,
  'shifts.ended_at is no longer null after end_shift'
);

select is(
  (select left_reason from shift_sessions where shift_id = '00000000-0000-0000-0000-0000000000e3'),
  'dienst_afgesloten',
  'de koppeling van de sessie is gesloten met reden dienst_afgesloten'
);

-- ── 2) Tweede aanroep: fout, geen stille no-op ────────────────────────────
-- Backdate ended_at: `now()` is de transactietijd, dus zonder dit zou een
-- overschrijving niet te zien zijn (zelfde reden als in de oude versie van
-- deze test).
update shifts set ended_at = '2020-01-01T00:00:00Z'::timestamptz
  where id = '00000000-0000-0000-0000-0000000000e3';

select throws_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'P0001', 'session_not_on_shift',
  'end_shift op een al gesloten dienst is een fout: de koppeling is weg (geen stille no-op meer)'
);

select is(
  (select ended_at from shifts where id = '00000000-0000-0000-0000-0000000000e3'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'de tweede aanroep overschrijft ended_at niet'
);

-- ── 3) Onbekende dienst ───────────────────────────────────────────────────
select throws_ok(
  $$ select end_shift(gen_random_uuid()) $$,
  'P0001', 'session_not_on_shift',
  'end_shift voor een onbekende dienst is session_not_on_shift'
);

-- ── 4) Sluit de lus met place_order/top_up ────────────────────────────────
-- Bewijst dat er na end_shift zelf niets meer geboekt kan worden, niet alleen
-- na een gefabriceerde afgesloten rij (place_order.test.sql/top_up.test.sql).
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000000e4', 'ES Loop Starter', 'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-0000000000e5', 'ES Loop Buyer',   'lid',       null, 1000, false);
insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000000e6', 'ES Test Pils', 'Bier', 250, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e4');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e4');
select pg_temp.act_as_bar('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e7');

select lives_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000e7'::uuid) $$,
  'end_shift closes this shift via the real close path'
);

select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000000e7'::uuid,
       '00000000-0000-0000-0000-0000000000e5'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000000e6","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000000e4'::uuid
     ) $$,
  'P0001', 'session_not_on_shift',
  'place_order weigert na end_shift zelf: de koppeling is gesloten'
);

select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000000e7'::uuid,
       '00000000-0000-0000-0000-0000000000e5'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-0000000000e4'::uuid
     ) $$,
  'P0001', 'session_not_on_shift',
  'top_up weigert na end_shift zelf: de koppeling is gesloten'
);

-- ── 5) Een sessie zonder koppeling aan déze dienst ────────────────────────
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000000e8', 'ES Owner', 'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-0000000000e9', 'ES Outsider', 'bardienst', null, 0, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000e8');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000e8');
select pg_temp.act_as_bar('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000ea');
-- De buitenstaander heeft wel een bar-sessie, maar geen koppeling aan ...ea.
select pg_temp.act_as_bar('00000000-0000-0000-0000-0000000000e9');

select throws_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000ea'::uuid) $$,
  'P0001', 'session_not_on_shift',
  'end_shift weigert een sessie die niet aan de dienst gekoppeld is'
);

select is(
  (select ended_at from shifts where id = '00000000-0000-0000-0000-0000000000ea'),
  null,
  'de dienst staat nog open na de geweigerde aanroep'
);

-- ── 6) Een openstaande melding wordt opgelost ─────────────────────────────
insert into bar_sessions (id, auth_session_id, member_id, mode, ended_at, end_reason)
values ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000f0',
        '00000000-0000-0000-0000-0000000000e8', 'bar', now(), 'inactief');
insert into admin_notifications (id, kind, reason, shift_id, bar_session_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'dienst_zonder_sessie', 'inactief',
   '00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000f0');
select pg_temp.act_as_bar('00000000-0000-0000-0000-0000000000e8');
select lives_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000ea'::uuid) $$,
  'de eigenaar van de dienst kan hem sluiten'
);

select isnt(
  (select resolved_at from admin_notifications where id = '00000000-0000-0000-0000-0000000000f1'),
  null,
  'het sluiten van de dienst lost de openstaande melding op'
);

select * from finish();
rollback;
