-- Negative-test coverage for add_shift_member/remove_shift_member, per
-- tester.md and docs/features/bezetting-beheren.md → Randgevallen
-- ("Toevoegen/verwijderen buiten een actieve dienst" — #7's own acceptance
-- criterion). Sinds dienst-per-sessie (0029) komt de sessie-guard vóór de
-- shift_not_open-check: een afgesloten of onbekende dienst heeft voor de
-- sessie geen actieve koppeling, dus de RPC's geven session_not_on_shift. Run with `npm run db:test` (= `supabase test db`, needs
-- `supabase start` / Docker locally).
--
-- NOT RUN against a real Postgres from the sandbox that wrote this file —
-- same known limitation as start_shift.test.sql/place_order.test.sql/
-- top_up.test.sql (no Docker daemon / supabase CLI here, see
-- docs/ARCHITECTURE.md → "Verified vs. not"). Written and reviewed by hand,
-- first real execution is `supabase start && npm run db:test`.
--
-- remove_shift_member's shift_not_open guard is the one real RPC change in
-- #7 (migration 0003_remove_shift_member_requires_open_shift.sql) — before
-- that fix it was a kale `delete` with no open-shift check at all, unlike
-- add_shift_member which already had one. So beyond just asserting the
-- exception, every "should be rejected" case here also asserts the roster
-- row it would have touched is unchanged — proving the call didn't
-- partially apply before raising, not just that it raised.

create extension if not exists pgtap with schema extensions;

begin;
select plan(32);

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

-- ── Fixtures ──────────────────────────────────────────────────────────
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000060', 'Shift Starter A', 'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000061', 'Eligible B',      'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000062', 'Lid Member C',    'lid',       null,                          0, false),
  ('00000000-0000-0000-0000-000000000063', 'Archived D',      'bardienst', crypt('1234', gen_salt('bf')), 0, true);

-- S1: open shift (ended_at is null) — the only shift add/remove is allowed
-- to touch.
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060', null);
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060');

-- S2: already-ended shift, with a pre-existing roster row (Starter A), to
-- prove neither add nor remove can touch it, and that a failed remove
-- doesn't delete that row anyway.
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000060', now());
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000060');

-- Starter A is ingelogd in een bar-sessie die aan dienst S1 (...70) gekoppeld is.
select pg_temp.act_as_bar('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000070');

-- ── 1) happy path: add_shift_member on an open shift ────────────────────
select lives_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000070'::uuid,
       '00000000-0000-0000-0000-000000000061'::uuid
     ) $$,
  'add_shift_member succeeds for an eligible member on an open shift'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000070'
       and member_id = '00000000-0000-0000-0000-000000000061'),
  1,
  'the added member now has a roster row on the open shift'
);

-- ── 2) happy path: remove_shift_member undoes it on the same open shift ──
select lives_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-000000000070'::uuid,
       '00000000-0000-0000-0000-000000000061'::uuid
     ) $$,
  'remove_shift_member succeeds on an open shift'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000070'
       and member_id = '00000000-0000-0000-0000-000000000061'),
  0,
  'the removed member no longer has a roster row'
);

-- ── 3) add_shift_member on an ended shift → session_not_on_shift ──────────────
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000071'::uuid,
       '00000000-0000-0000-0000-000000000061'::uuid
     ) $$,
  'P0001', 'session_not_on_shift',
  'add_shift_member rejects adding to a shift that has already ended'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000071'
       and member_id = '00000000-0000-0000-0000-000000000061'),
  0,
  'the rejected add left no roster row behind on the ended shift'
);

-- ── 4) add_shift_member on a non-existent shift_id → session_not_on_shift ─────
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000099'::uuid,
       '00000000-0000-0000-0000-000000000061'::uuid
     ) $$,
  'P0001', 'session_not_on_shift',
  'add_shift_member rejects a shift_id that does not exist at all'
);

-- ── 5) remove_shift_member on an ended shift → session_not_on_shift ───────────
-- Core acceptance criterion of #7 and the one real RPC fix
-- (0003_remove_shift_member_requires_open_shift.sql): before that fix this
-- delete had no open-shift guard at all.
select throws_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-000000000071'::uuid,
       '00000000-0000-0000-0000-000000000060'::uuid
     ) $$,
  'P0001', 'session_not_on_shift',
  'remove_shift_member rejects removing from a shift that has already ended'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000071'
       and member_id = '00000000-0000-0000-0000-000000000060'),
  1,
  'the roster row on the ended shift survives the rejected remove call — no partial delete before the raise'
);

-- ── 6) remove_shift_member on a non-existent shift_id → session_not_on_shift ──
select throws_ok(
  $$ select remove_shift_member(
       '00000000-0000-0000-0000-000000000099'::uuid,
       '00000000-0000-0000-0000-000000000060'::uuid
     ) $$,
  'P0001', 'session_not_on_shift',
  'remove_shift_member rejects a shift_id that does not exist at all'
);

-- ── 7) add_shift_member with an archived member → member_not_eligible ───
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000070'::uuid,
       '00000000-0000-0000-0000-000000000063'::uuid
     ) $$,
  'P0001', 'member_not_eligible',
  'add_shift_member rejects an archived bardienst member even on an open shift'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000070'
       and member_id = '00000000-0000-0000-0000-000000000063'),
  0,
  'the archived member got no roster row'
);

-- ── 8) add_shift_member with a role of 'lid' → member_not_eligible ──────
select throws_ok(
  $$ select add_shift_member(
       '00000000-0000-0000-0000-000000000070'::uuid,
       '00000000-0000-0000-0000-000000000062'::uuid
     ) $$,
  'P0001', 'member_not_eligible',
  'add_shift_member rejects a lid — only bardienst/beheerder are eligible'
);

select is(
  (select count(*)::int from shift_members
     where shift_id = '00000000-0000-0000-0000-000000000070'
       and member_id = '00000000-0000-0000-0000-000000000062'),
  0,
  'the lid member got no roster row'
);

-- T02: een PIN is geen voorwaarde voor bezetting of geldattributie.
-- Eigen fixtures binnen de rollback; geen gedeelde seedleden wijzigen.
insert into members (id, name, role, balance_cents) values
  ('00000000-0000-0000-0000-000000000064', 'Bardienst zonder PIN', 'bardienst', 0),
  ('00000000-0000-0000-0000-000000000065', 'Beheerder zonder PIN', 'beheerder', 0);
insert into products (id, name, category, price_cents) values
  ('00000000-0000-0000-0000-000000000066', 'T02 product', 'Test', 100);
update members set balance_cents = 1000 where id = '00000000-0000-0000-0000-000000000062';

select lives_ok($$ select add_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000064') $$,
  'T02: bardienst zonder PIN mag in de bezetting');
select lives_ok($$ select add_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000065') $$,
  'T02: beheerder zonder PIN mag in de bezetting');
select lives_ok($$ select place_order(
  '00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000062',
  '[{"product_id":"00000000-0000-0000-0000-000000000066","qty":1}]', '00000000-0000-0000-0000-000000000064') $$,
  'T02: bardienst zonder PIN kan als served_by afrekenen');
select is((select served_by from orders where shift_id = '00000000-0000-0000-0000-000000000070'),
  '00000000-0000-0000-0000-000000000064'::uuid, 'T02: bestelling schrijft de gekozen crew op');
select lives_ok($$ select top_up(
  '00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000062',
  500, 'cash', '00000000-0000-0000-0000-000000000065') $$,
  'T02: beheerder zonder PIN kan als served_by opwaarderen');
select is((select served_by from top_ups where shift_id = '00000000-0000-0000-0000-000000000070'),
  '00000000-0000-0000-0000-000000000065'::uuid, 'T02: opwaardering schrijft de gekozen crew op');

select lives_ok($$ select add_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000061') $$,
  'T02: medewerker met PIN wordt toegevoegd');
update members set pin_hash = null where id = '00000000-0000-0000-0000-000000000061';
select ok((select not has_pin from members where id = '00000000-0000-0000-0000-000000000061')
  and is_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000061'),
  'T02: PIN uitzetten verwijdert bestaande crew niet');
select lives_ok($$ select place_order(
  '00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000062',
  '[{"product_id":"00000000-0000-0000-0000-000000000066","qty":1}]', '00000000-0000-0000-0000-000000000061') $$,
  'T02: na PIN uitzetten blijft served_by bruikbaar');
select lives_ok($$ select remove_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000061') $$,
  'T02: medewerker zonder PIN kan worden verwijderd');
select lives_ok($$ select add_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000061') $$,
  'T02: medewerker zonder PIN kan opnieuw worden toegevoegd');

update members set archived = true where id = '00000000-0000-0000-0000-000000000064';
select ok(is_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000064'),
  'T02: archivering wist bestaande crew niet');
select lives_ok($$ select remove_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000064') $$,
  'T02: gearchiveerde crew kan worden verwijderd');
select throws_ok($$ select add_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000064') $$,
  'P0001', 'member_not_eligible', 'T02: gearchiveerde crew kan niet opnieuw worden toegevoegd');
update members set role = 'lid' where id = '00000000-0000-0000-0000-000000000061';
select ok(is_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000061'),
  'T02: rolwijziging wist bestaande crew niet');
select lives_ok($$ select remove_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000061') $$,
  'T02: crew met gewijzigde rol kan worden verwijderd');
select throws_ok($$ select add_shift_member('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000061') $$,
  'P0001', 'member_not_eligible', 'T02: gewoon lid kan niet opnieuw worden toegevoegd');
select throws_ok($$ select place_order(
  '00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000062',
  '[{"product_id":"00000000-0000-0000-0000-000000000066","qty":1}]', '00000000-0000-0000-0000-000000000061') $$,
  'P0001', 'served_by_not_on_shift', 'T02: verwijderde crew kan niet meer afrekenen');

select * from finish();
rollback;
