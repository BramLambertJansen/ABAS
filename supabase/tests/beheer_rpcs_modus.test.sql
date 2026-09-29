-- Elke beheer-RPC eist een sessie in modus `beheer` (require_beheer_session,
-- 0028/0029, docs/features/dienst-per-sessie.md → RPC's → Guards, besloten
-- vraag 11, ADR 0016 → Beslissing 8): een beheerder in bar-modus, zonder
-- bar-sessie, met een beëindigde of inactieve sessie of met een gearchiveerd
-- lid komt er niet in — ook al zou de ADR 0002-actorcheck hem toelaten. Zo
-- komt een PIN-sessie (altijd `bar`) nooit in beheer.
--
-- Data-gedreven: één lijst met de vijftien beheer-RPC's, één ronde per
-- faalmodus. De guard staat vóór de actorcheck en de invoervalidatie, dus de
-- argumenten mogen dummy zijn. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(99);

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

-- Beheer-sessie (modus `beheer`).
create function pg_temp.act_as_user(p_auth_user uuid, p_mode text default 'beheer')
returns void
language plpgsql
as $fn$
declare
  v_member uuid;
begin
  select id into v_member from members where auth_user_id = p_auth_user;
  if v_member is not null then
    insert into bar_sessions (auth_session_id, member_id, mode)
    values (p_auth_user, v_member, p_mode)
    on conflict (auth_session_id) do nothing;
  end if;
  perform set_config('request.jwt.claim.sub', p_auth_user::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_auth_user::text, 'session_id', p_auth_user::text)::text,
    true
  );
end;
$fn$;

-- ── Fixtures ──────────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-00000000c010', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'bmodus-admin@test.local', crypt('x', gen_salt('bf')), now(),
  now(), now(), '{"provider":"email","providers":["email"]}', '{}'
);
insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-00000000c020', 'BM Admin', 'beheerder', null, 0, false,
   '00000000-0000-0000-0000-00000000c010'),
  ('00000000-0000-0000-0000-00000000c021', 'BM Target', 'bardienst', null, 0, false, null);

-- Een bestelling voor reverse_order_as_admin, zodat de aanroep, als de guard
-- hem toeliet, echt zou slagen.
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-00000000c030', '00000000-0000-0000-0000-00000000c021', now());
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-00000000c030', '00000000-0000-0000-0000-00000000c021');
insert into orders (id, shift_id, member_id, served_by, total_cents) values
  ('00000000-0000-0000-0000-00000000c031', '00000000-0000-0000-0000-00000000c030', null,
   '00000000-0000-0000-0000-00000000c021', 100);

create function pg_temp.calls()
returns table (name text, sql text)
language sql
as $q$
  select * from (values
    ('create_product', $s$ select create_product('x', 'y', 100) $s$),
    ('update_product_price', $s$ select update_product_price(gen_random_uuid(), 100) $s$),
    ('set_product_archived', $s$ select set_product_archived(gen_random_uuid(), true) $s$),
    ('create_activity_type', $s$ select create_activity_type('x') $s$),
    ('update_activity_type_name', $s$ select update_activity_type_name(gen_random_uuid(), 'x') $s$),
    ('set_activity_type_archived', $s$ select set_activity_type_archived(gen_random_uuid(), true) $s$),
    ('update_negative_limit', $s$ select update_negative_limit(0) $s$),
    ('create_member', $s$ select create_member('x', 0, null) $s$),
    ('update_member_name', $s$ select update_member_name('00000000-0000-0000-0000-00000000c021', 'y') $s$),
    ('set_member_archived', $s$ select set_member_archived('00000000-0000-0000-0000-00000000c021', true) $s$),
    ('set_member_role', $s$ select set_member_role('00000000-0000-0000-0000-00000000c021', 'lid') $s$),
    ('update_member_email', $s$ select update_member_email('00000000-0000-0000-0000-00000000c021', 'a@b.nl') $s$),
    ('list_members_admin', $s$ select * from list_members_admin() $s$),
    ('mark_member_invite_sent', $s$ select mark_member_invite_sent('00000000-0000-0000-0000-00000000c021') $s$),
    ('reverse_order_as_admin', $s$ select reverse_order_as_admin('00000000-0000-0000-0000-00000000c031', 'reden') $s$)
  ) as v(name, sql)
$q$;

-- ── Ronde 1: een beheerder in bar-modus ──────────────────────────────────
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000c020');
select throws_ok(c.sql, 'P0001', 'wrong_mode', c.name || ' weigert een beheerder in een sessie met modus bar (wrong_mode)')
  from pg_temp.calls() c;

-- ── Ronde 2: geen bar-sessie ─────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c010","session_id":"00000000-0000-0000-0000-00000000c0f0"}', true);
select throws_ok(c.sql, 'P0001', 'no_bar_session', c.name || ' weigert een sessie zonder registratie (no_bar_session)')
  from pg_temp.calls() c;

-- ── Ronde 3: beëindigde beheer-sessie ────────────────────────────────────
select pg_temp.act_as_user('00000000-0000-0000-0000-00000000c010');
update bar_sessions set ended_at = now(), end_reason = 'uitgelogd'
  where auth_session_id = '00000000-0000-0000-0000-00000000c010';
select throws_ok(c.sql, 'P0001', 'session_ended', c.name || ' weigert een beëindigde beheer-sessie (session_ended)')
  from pg_temp.calls() c;
update bar_sessions set ended_at = null, end_reason = null
  where auth_session_id = '00000000-0000-0000-0000-00000000c010';

-- ── Ronde 4: inactieve beheer-sessie ─────────────────────────────────────
update bar_sessions set last_activity_at = now() - interval '61 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000c010';
select throws_ok(c.sql, 'P0001', 'session_inactive', c.name || ' weigert een inactieve beheer-sessie (session_inactive)')
  from pg_temp.calls() c;
update bar_sessions set last_activity_at = now()
  where auth_session_id = '00000000-0000-0000-0000-00000000c010';

-- ── Ronde 5: gearchiveerd lid ────────────────────────────────────────────
update members set archived = true where id = '00000000-0000-0000-0000-00000000c020';
select throws_ok(c.sql, 'P0001', 'no_bar_role', c.name || ' weigert een gearchiveerd lid (no_bar_role)')
  from pg_temp.calls() c;
update members set archived = false where id = '00000000-0000-0000-0000-00000000c020';

-- ── Ronde 6: een bardienst-rol in een beheer-sessie ──────────────────────
-- (rechtstreeks geïnsert; register_bar_session laat dit niet toe)
update members set role = 'bardienst' where id = '00000000-0000-0000-0000-00000000c020';
select throws_ok(c.sql, 'P0001', 'no_admin_role', c.name || ' weigert een beheer-sessie van een lid dat geen beheerder (meer) is (no_admin_role)')
  from pg_temp.calls() c;
update members set role = 'beheerder' where id = '00000000-0000-0000-0000-00000000c020';

-- ── Herstel: een geldige beheer-sessie werkt, en zet de hartslag ─────────
update bar_sessions set last_activity_at = now() - interval '5 minutes'
  where auth_session_id = '00000000-0000-0000-0000-00000000c010';
select lives_ok(
  $$ select update_negative_limit(0) $$,
  'een beheerder in een beheer-sessie mag een beheer-RPC aanroepen'
);
select is(
  (select last_activity_at from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000c010'),
  now(),
  'een geslaagde beheer-RPC zet de hartslag'
);
select lives_ok(
  $$ select reverse_order_as_admin('00000000-0000-0000-0000-00000000c031', 'reden') $$,
  'reverse_order_as_admin slaagt in een beheer-sessie (de aanroepen hierboven werden dus echt door de guard tegengehouden)'
);
select is(
  (select bar_session_id from order_reversals where order_id = '00000000-0000-0000-0000-00000000c031'),
  null,
  'bij reverse_order_as_admin blijft bar_session_id leeg'
);

-- ── Archiveren / rol → lid beëindigt de bar-sessies van dat lid ──────────
-- (dienst-per-sessie, vraag 21 en 27)
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-00000000c022', 'BM Ontslagen', 'bardienst', null, 0, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-00000000c032', '00000000-0000-0000-0000-00000000c022');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-00000000c032', '00000000-0000-0000-0000-00000000c022');
select pg_temp.act_as_bar('00000000-0000-0000-0000-00000000c022', '00000000-0000-0000-0000-00000000c032');
insert into bar_devices (id, token_hash) values
  ('00000000-0000-0000-0000-00000000c0d0', 'bm-device');
insert into bar_device_members (device_id, member_id, password_login_at) values
  ('00000000-0000-0000-0000-00000000c0d0', '00000000-0000-0000-0000-00000000c022', now());

select pg_temp.act_as_user('00000000-0000-0000-0000-00000000c010');
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-00000000c022', 'lid') $$,
  'een beheerder zet een bardienst met een actieve sessie en een open dienst terug naar lid'
);
select is(
  (select end_reason from bar_sessions where auth_session_id = '00000000-0000-0000-0000-00000000c022'),
  'geen_bar_rol',
  'de bar-sessie van dat lid is meteen beëindigd (geen_bar_rol)'
);
select is(
  (select left_reason from shift_sessions where shift_id = '00000000-0000-0000-0000-00000000c032'),
  'geen_bar_rol',
  'de koppeling met de dienst eindigt met reden geen_bar_rol'
);
select is(
  (select reason from admin_notifications where shift_id = '00000000-0000-0000-0000-00000000c032' and resolved_at is null),
  'geen_bar_rol',
  'de dienst is nu een wees-dienst: er is een melding voor de beheerders'
);
select isnt(
  (select revoked_at from bar_device_members where member_id = '00000000-0000-0000-0000-00000000c022'),
  null,
  'het PIN-vertrouwen van dat lid is op alle apparaten ingetrokken'
);

select * from finish();
rollback;
