-- Negatieve tests voor de sessie-guards (0028) op elke bar-RPC
-- (docs/features/dienst-per-sessie.md → RPC's → Guards, ADR 0016 → Gevolgen):
-- start_shift, place_order, top_up, reverse_order_at_bar, end_shift,
-- add_shift_member en remove_shift_member weigeren
--   * zonder bar-sessie (ook een lid-sessie en een sessie zonder lid),
--   * met een beëindigde sessie,
--   * met een te lang inactieve sessie,
--   * met een sessie in modus `beheer`,
--   * met een gearchiveerd lid of een lid dat geen bar-rol meer heeft,
--   * met een sessie van een ander account dan het lid,
--   * (de zes met een dienst) met een sessie die niet aan de dienst gekoppeld is,
--     waarvan de koppeling beëindigd is, of die aan een andere dienst hangt,
--   * met een token zonder (geldig) session_id-claim.
-- Alle guards staan vóór alle andere checks: de RPC's krijgen daarom dummy
-- argumenten, en de foutcode is steeds die van de guard.
--
-- Data-gedreven: één lijst met aanroepen (pg_temp.calls), één ronde per
-- faalmodus. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(96);

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

-- ── Fixtures ──────────────────────────────────────────────────────────────

update shifts set ended_at = now() where ended_at is null;

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-00000000a010', 'Guard Staff A', 'bardienst', null, 0, false),
  ('00000000-0000-0000-0000-00000000a011', 'Guard Staff B', 'bardienst', null, 0, false);

-- Een lid (portal-account) met een echt auth-account, maar zonder bar-sessie.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-00000000a0f0', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'guard-lid@test.local', crypt('x', gen_salt('bf')), now(),
  now(), now(), '{"provider":"email","providers":["email"]}', '{}'
);
insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-00000000a012', 'Guard Lid', 'lid', null, 0, false,
   '00000000-0000-0000-0000-00000000a0f0');

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-00000000a020', '00000000-0000-0000-0000-00000000a010');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-00000000a020', '00000000-0000-0000-0000-00000000a010');

-- Sessie A: geldig, aan de dienst gekoppeld. Sessie B: geldig, maar niet aan
-- de dienst gekoppeld.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000a010', '00000000-0000-0000-0000-00000000a020');
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000a011');

-- De aanroepen die elke ronde probeert. `has_shift`: heeft een p_shift_id, dus
-- ook `session_not_on_shift` kan.
create function pg_temp.calls()
returns table (name text, sql text, has_shift boolean)
language sql
as $q$
  select * from (values
    ('start_shift',
     $s$ select start_shift('00000000-0000-0000-0000-00000000a0b0'::uuid) $s$, false),
    ('place_order',
     $s$ select place_order('00000000-0000-0000-0000-00000000a020'::uuid, null,
           '[{"product_id":"00000000-0000-0000-0000-00000000a0b1","qty":1}]'::jsonb,
           '00000000-0000-0000-0000-00000000a010'::uuid) $s$, true),
    ('top_up',
     $s$ select top_up('00000000-0000-0000-0000-00000000a020'::uuid,
           '00000000-0000-0000-0000-00000000a011'::uuid, 500, 'cash',
           '00000000-0000-0000-0000-00000000a010'::uuid) $s$, true),
    ('reverse_order_at_bar',
     $s$ select reverse_order_at_bar(gen_random_uuid(),
           '00000000-0000-0000-0000-00000000a020'::uuid, 'reden',
           '00000000-0000-0000-0000-00000000a010'::uuid) $s$, true),
    ('end_shift',
     $s$ select end_shift('00000000-0000-0000-0000-00000000a020'::uuid) $s$, true),
    ('add_shift_member',
     $s$ select add_shift_member('00000000-0000-0000-0000-00000000a020'::uuid,
           '00000000-0000-0000-0000-00000000a011'::uuid) $s$, true),
    ('remove_shift_member',
     $s$ select remove_shift_member('00000000-0000-0000-0000-00000000a020'::uuid,
           '00000000-0000-0000-0000-00000000a010'::uuid) $s$, true)
  ) as v(name, sql, has_shift)
$q$;

-- ── Basis: een geldige sessie werkt en zet de hartslag ───────────────────

select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000a010');
update bar_sessions set last_activity_at = now() - interval '10 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000a010';

select lives_ok(
  $$ select add_shift_member('00000000-0000-0000-0000-00000000a020'::uuid,
       '00000000-0000-0000-0000-00000000a011'::uuid) $$,
  'een geldige, aan de dienst gekoppelde sessie mag een bar-RPC aanroepen'
);
select is(
  (select last_activity_at from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000a010'),
  now(),
  'een geslaagde bar-RPC zet de hartslag (last_activity_at)'
);

-- ── Ronde 1: geen bar-sessie ─────────────────────────────────────────────
-- Een claim voor een sessie die nergens geregistreerd is.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a0f9","session_id":"00000000-0000-0000-0000-00000000a0f9"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_session', c.name || ' weigert een niet-geregistreerde sessie (no_bar_session)')
  from pg_temp.calls() c;

-- ── Ronde 2: een lid-sessie (portal) ─────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a0f0","session_id":"00000000-0000-0000-0000-00000000a0e0"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_session', c.name || ' weigert een lid-sessie (no_bar_session)')
  from pg_temp.calls() c;

-- ── Ronde 3: sessie B, niet aan de dienst gekoppeld ──────────────────────
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000a011');
select throws_ok(c.sql, 'P0001', 'session_not_on_shift', c.name || ' weigert een sessie die niet aan de dienst gekoppeld is (session_not_on_shift)')
  from pg_temp.calls() c where c.has_shift;

-- ── Ronde 4: sessie van een ander account dan het lid ────────────────────
-- Sessie A, maar met de sub van een ander account: de sessie hoort niet meer
-- bij het account van het lid.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a011","session_id":"00000000-0000-0000-0000-00000000a010"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_role', c.name || ' weigert een sessie die niet bij het account van het lid hoort (no_bar_role)')
  from pg_temp.calls() c;

-- ── Ronde 5: beëindigde sessie ───────────────────────────────────────────
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000a010');
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd'
  where auth_session_id = '00000000-0000-0000-0000-00000000a010';
select throws_ok(c.sql, 'P0001', 'session_ended', c.name || ' weigert een beëindigde sessie (session_ended)')
  from pg_temp.calls() c;
update bar_sessions set ended_at = null, end_reason = null
  where auth_session_id = '00000000-0000-0000-0000-00000000a010';

-- ── Ronde 6: te lang inactieve sessie ────────────────────────────────────
update bar_sessions set last_activity_at = now() - interval '61 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000a010';
select throws_ok(c.sql, 'P0001', 'session_inactive', c.name || ' weigert een sessie die langer dan 60 minuten stil is (session_inactive)')
  from pg_temp.calls() c;

-- Een mislukte aanroep telt niet als activiteit.
select is(
  (select last_activity_at from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000a010'),
  now() - interval '61 minutes',
  'een geweigerde aanroep zet de hartslag niet'
);
update bar_sessions set last_activity_at = now()
  where auth_session_id = '00000000-0000-0000-0000-00000000a010';

-- ── Ronde 7: sessie in modus beheer ──────────────────────────────────────
update bar_sessions set mode = 'beheer'
  where auth_session_id = '00000000-0000-0000-0000-00000000a010';
select throws_ok(c.sql, 'P0001', 'wrong_mode', c.name || ' weigert een sessie in modus beheer (wrong_mode)')
  from pg_temp.calls() c;
update bar_sessions set mode = 'bar'
  where auth_session_id = '00000000-0000-0000-0000-00000000a010';

-- ── Ronde 8: gearchiveerd lid, en een lid dat `lid` werd ─────────────────
update members set archived = true where id = '00000000-0000-0000-0000-00000000a010';
select throws_ok(c.sql, 'P0001', 'no_bar_role', c.name || ' weigert een gearchiveerd lid (no_bar_role)')
  from pg_temp.calls() c;
update members set archived = false, role = 'lid' where id = '00000000-0000-0000-0000-00000000a010';
select throws_ok(c.sql, 'P0001', 'no_bar_role', c.name || ' weigert een lid dat geen bar-rol meer heeft (no_bar_role)')
  from pg_temp.calls() c;
update members set role = 'bardienst' where id = '00000000-0000-0000-0000-00000000a010';

-- ── Herstel: na al het bovenstaande werkt de sessie weer ─────────────────
select lives_ok(
  $$ select add_shift_member('00000000-0000-0000-0000-00000000a020'::uuid,
       '00000000-0000-0000-0000-00000000a011'::uuid) $$,
  'na herstel van sessie en lid werkt de sessie weer'
);

-- ── Ronde 9: een claim zonder session_id ─────────────────────────────────
-- Een geldig account van een bardienst, maar het token draagt geen
-- session_id: de sessie komt nooit uit iets anders dan het JWT-claim.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a010', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a010"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_session', c.name || ' weigert een token zonder session_id-claim (no_bar_session)')
  from pg_temp.calls() c;

-- ── Ronde 10: een session_id dat geen uuid is ────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a010","session_id":"geen-uuid"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_session', c.name || ' weigert een session_id dat geen uuid is (no_bar_session, geen castfout)')
  from pg_temp.calls() c;

-- ── Ronde 11: de koppeling met de dienst is beëindigd ────────────────────
-- Sessie A heeft een rij in shift_sessions voor de dienst, maar die is
-- gesloten (bv. overgenomen door een beheerder): een gesloten koppeling telt
-- niet als koppeling.
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000a010');
update shift_sessions set left_at = now(), left_reason = 'overgenomen'
  where shift_id = '00000000-0000-0000-0000-00000000a020'
    and bar_session_id = (select id from bar_sessions
                           where auth_session_id = '00000000-0000-0000-0000-00000000a010');
select throws_ok(c.sql, 'P0001', 'session_not_on_shift', c.name || ' weigert een sessie waarvan de koppeling met de dienst is beëindigd (session_not_on_shift)')
  from pg_temp.calls() c where c.has_shift;

-- ── Ronde 12: gekoppeld aan een andere open dienst ───────────────────────
-- Sessie A werkt in een tweede open dienst (rechtstreeks geïnsert; fase 1
-- kent er maar één, maar de guard mag daar niet op leunen). Een koppeling met
-- dienst X is geen koppeling met dienst Y.
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-00000000a021', '00000000-0000-0000-0000-00000000a010');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-00000000a021', '00000000-0000-0000-0000-00000000a010');
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000a010', '00000000-0000-0000-0000-00000000a021');
select throws_ok(c.sql, 'P0001', 'session_not_on_shift', c.name || ' weigert een sessie die aan een andere dienst gekoppeld is (session_not_on_shift)')
  from pg_temp.calls() c where c.has_shift;

-- ── Rechten: de guards zijn geen API ─────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.require_bar_session()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.require_bar_session()', 'EXECUTE'),
  'require_bar_session is geen API (geen EXECUTE voor authenticated of anon)'
);
select ok(
  not has_function_privilege('authenticated', 'public.require_shift_session(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.require_shift_session(uuid)', 'EXECUTE'),
  'require_shift_session is geen API'
);
select ok(
  not has_function_privilege('authenticated', 'public.require_beheer_session()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.require_beheer_session()', 'EXECUTE'),
  'require_beheer_session is geen API'
);
select ok(
  to_regprocedure('public.start_shift(uuid,text,uuid)') is null,
  'de oude start_shift met PIN bestaat niet meer'
);

select * from finish();
rollback;
