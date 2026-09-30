-- Negative-test coverage for ledenbeheer (docs/features/ledenbeheer.md, no
-- issuenummer toegewezen op het moment van schrijven — zie spec-intro) en
-- ledenbeheer-email (docs/features/ledenbeheer-email.md, #57):
-- create_member/update_member_name/set_member_archived/set_member_role/
-- update_member_email/list_members_admin (ADR 0002's auth.uid()-based
-- actorcheck, exact hetzelfde patroon als assortimentbeheer.test.sql /
-- negatieve_saldolimiet.test.sql; list_members_admin is de eerste
-- lees-RPC, ADR 0004: members.email is column-level REVOKEd voor
-- authenticated, alleen leesbaar via deze RPC's eigen actorcheck). Run met
-- `npm run db:test` (= `supabase test db`, vereist `supabase start` /
-- Docker lokaal).
--
-- Geschreven en nagelezen volgens assortimentbeheer.test.sql's fixture-/
-- assertiestijl exact — zie dat bestand voor de twee aannames die alle
-- auth.uid()-actorcheck-tests in deze repo delen (auth.users-fixture-vorm,
-- request.jwt.claim.sub-simulatie van auth.uid()).
--
-- members staat al sinds 0001_init.sql in de blanket-REVOKE (regel 137) —
-- rls_write_protection.test.sql dekt daar al `insert into members`; dit
-- bestand voegt de ontbrekende update/delete-varianten voor members toe aan
-- dat bestand (niet hier) voor consistentie met hoe de rest van de suite dat
-- organiseert (zie rls_write_protection.test.sql).

create extension if not exists pgtap with schema extensions;

begin;
select plan(99);

-- ── Sessie-helper (dienst per sessie, ADR 0016) ────────────────────────────
-- Beheer-RPC's eisen een geregistreerde sessie in modus `beheer`
-- (require_beheer_session, 0028). Zet de JWT-claims voor `p_auth_user` en
-- registreert, als er een lid bij hoort, een bar-sessie in `p_mode`. Bewust
-- rechtstreeks geïnsert, ook voor een bardienst of een gearchiveerd lid: zo
-- bewijzen deze tests de guard zelf en niet register_bar_session. Een account
-- zonder lid krijgt geen bar-sessie (no_bar_session).
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
  -- Een beheersessie is altijd aal2: register_bar_session('beheer') en
  -- require_beheer_session eisen dat (ADR 0017, 0034).
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_auth_user::text, 'session_id', p_auth_user::text,
      'aal', case when p_mode = 'beheer' then 'aal2' else 'aal1' end
    )::text,
    true
  );
end;
$fn$;


-- ── Fixtures ──────────────────────────────────────────────────────────

-- auth.users: minimal rows so members.auth_user_id's FK is satisfiable and
-- auth.uid() (once request.jwt.claim.sub is set to one of these ids) can
-- resolve to a matching (or deliberately non-matching) members row.
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000280', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-admin-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000281', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-staff-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000282', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-archived-admin-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000283', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-orphan-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');
-- Note: (...283) is deliberately never referenced by any members row below
-- — it exists in auth.users but no members.auth_user_id points to it,
-- simulating "auth.uid() matches no member at all" (actor_not_found,
-- variant A: orphan session).

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000290', 'LB Admin Fixture',          'beheerder', null, 0, false, '00000000-0000-0000-0000-000000000280'),
  ('00000000-0000-0000-0000-000000000291', 'LB Staff Fixture',          'bardienst', null, 0, false, '00000000-0000-0000-0000-000000000281'),
  ('00000000-0000-0000-0000-000000000292', 'LB Archived Admin Fixture', 'beheerder', null, 0, true,  '00000000-0000-0000-0000-000000000282');
-- (...292) exists as a members row but is archived — auth.uid() resolving
-- to it hits the actor-check's `and not archived` filter, simulating
-- "auth.uid() matches an archived member" (actor_not_found, variant B).

-- Target rows, no auth.users session of their own — pure RPC targets.
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000002a0', 'LB Other Admin Fixture',      'beheerder', null, 0, false),
  ('00000000-0000-0000-0000-0000000002a1', 'LB Rename Target',            'lid',       null, 0, false),
  ('00000000-0000-0000-0000-0000000002a2', 'LB Archived Rename Target',   'lid',       null, 0, true),
  ('00000000-0000-0000-0000-0000000002a3', 'LB Archive Target',           'lid',       null, 0, false),
  ('00000000-0000-0000-0000-0000000002a4', 'LB Role Target',              'lid',       null, 0, false);

-- Target rows voor update_member_email (#57), los van de rijen hierboven —
-- die worden al door de create_member/update_member_name/set_member_archived/
-- set_member_role-tests gemuteerd, dus niet herbruikt voor de e-mailtests.
insert into members (id, name, role, pin_hash, balance_cents, archived, email) values
  ('00000000-0000-0000-0000-0000000002a5', 'LB Email Target',             'lid', null, 0, false, null),
  ('00000000-0000-0000-0000-0000000002a6', 'LB Email Wipe Target',        'lid', null, 0, false, 'bestaand@test.local'),
  ('00000000-0000-0000-0000-0000000002a7', 'LB Archived Email Target',    'lid', null, 0, true,  null);

-- Target rij voor de list_members_admin pin_hash-scrub-test (migratie
-- 0011_list_members_admin_pin_hash_scrub.sql, restbeperking #42) — de enige
-- rij in dit bestand met een echte (niet-lege) pin_hash, zodat de scrub ook
-- daadwerkelijk iets scrubt om te bewijzen (een pin_hash die toch al null
-- was, zou de test laten slagen zonder dat de scrub ooit iets deed).
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000002a8', 'LB Pin Scrub Target', 'bardienst', crypt('4321', gen_salt('bf')), 0, false);

-- Fixtures voor mark_member_invite_sent/link_invited_member_account (#24,
-- docs/features/lid-account-invite.md, migratie 0012, herzien — twee RPC's
-- i.p.v. de oude, niet meer bestaande mark_member_invited). Twee extra
-- auth.users-rijen die (nog) door geen enkele members-rij gebruikt worden:
--   - (...284): het auth.uid() dat link_invited_member_account()'s
--     happy-path-test hieronder daadwerkelijk aan een lid koppelt (simuleert
--     de sessie van het uitgenodigde lid zelf, ná een geslaagde
--     exchangeCodeForSession() — buiten pgTAP's bereik, zie spec →
--     Randgevallen).
--   - (...285): al gekoppeld aan een ánder lid (LB Link Already Linked
--     Target hieronder) — nodig om de "e-mailadres matcht, maar auth_user_id
--     is al gezet"-variant van link_invited_member_account te simuleren
--     (members.auth_user_id heeft een unique-constraint, 0005_assortimentbeheer.sql,
--     dus dit moet een eigen, ongebruikt auth.users-id zijn).
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000284', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-invite-linked-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000285', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lb-link-alreadylinked-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

-- Target rij voor mark_member_invite_sent's happy-path test: geen
-- auth_user_id (nog niet gekoppeld, dus invite-eligible), en een échte
-- (niet-lege) pin_hash — zelfde reden als "LB Pin Scrub Target" hierboven:
-- een pin_hash die toch al null was, zou de scrub-test laten slagen zonder
-- dat de scrub ooit iets deed (spec → RPC's: "Verplicht: zelfde
-- pin_hash-scrub...").
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000002a9', 'LB Invite Target', 'bardienst', crypt('9999', gen_salt('bf')), 0, false);

-- Target rijen voor link_invited_member_account — elk een eigen
-- email/invited_at/auth_user_id-combinatie, één per geval dat de spec →
-- Randgevallen "db:test/pgTAP..." expliciet noemt.
insert into members (id, name, role, pin_hash, balance_cents, archived, email, invited_at, auth_user_id) values
  -- Happy path: precies één match. Gemengd hoofdlettergebruik in het
  -- opgeslagen e-mailadres, bewust anders dan de sessie-claim hieronder
  -- (lowercase) — bewijst de case-insensitieve match (lower(email) =
  -- lower(auth.email())). Echte pin_hash zodat de scrub-assertion niet
  -- vacuous is (zelfde reden als LB Pin Scrub Target/LB Invite Target).
  ('00000000-0000-0000-0000-0000000002aa', 'LB Link Happy Target', 'bardienst',
   crypt('1111', gen_salt('bf')), 0, false, 'Link-Happy@Test.Local', now(), null),
  -- Geen match, variant 2: bestaat, e-mailadres matcht, maar auth_user_id is
  -- al gezet (gewone her-login van een al gekoppeld lid) — gekoppeld aan
  -- auth.users (...285) hierboven, een ander lid dan de sessie die
  -- hieronder inlogt.
  ('00000000-0000-0000-0000-0000000002ab', 'LB Link Already Linked Target', 'bardienst',
   null, 0, false, 'link-alreadylinked@test.local', now(), '00000000-0000-0000-0000-000000000285'),
  -- Geen match, variant 3: bestaat, e-mailadres matcht, maar nooit
  -- uitgenodigd (invited_at is null) — de "extra, goedkope verdedigingslaag"
  -- uit de RPC zelf (spec → RPC's punt 2).
  ('00000000-0000-0000-0000-0000000002ac', 'LB Link Never Invited Target', 'bardienst',
   null, 0, false, 'link-neverinvited@test.local', null, null),
  -- E-mailcollision: twee leden met hetzelfde e-mailadres, allebei
  -- eligible (auth_user_id null, invited_at gezet) — spec →
  -- Randgevallen "E-mailcollision bij het koppelen".
  ('00000000-0000-0000-0000-0000000002ad', 'LB Link Collision Target One', 'bardienst',
   null, 0, false, 'link-collision@test.local', now(), null),
  ('00000000-0000-0000-0000-0000000002ae', 'LB Link Collision Target Two', 'bardienst',
   null, 0, false, 'link-collision@test.local', now(), null);

-- ── create_member ─────────────────────────────────────────────────────

-- 1) actor_not_found, variant A: auth.uid() matches no members row at all.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000283');
select throws_ok(
  $$ select create_member('Nieuw Lid', null) $$,
  'P0001', 'no_bar_session',
  'create_member rejects a caller whose auth.uid() matches no members row'
);

-- 2) no_admin_role: caller resolves to a real, active member, but not beheerder.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000281');
select throws_ok(
  $$ select create_member('Nieuw Lid', null) $$,
  'P0001', 'no_admin_role',
  'create_member rejects a caller whose role is bardienst, not beheerder'
);

-- From here on, act as the admin fixture.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000280');

-- 3) invalid_name
select throws_ok(
  $$ select create_member('   ', null) $$,
  'P0001', 'invalid_name',
  'create_member rejects a blank (whitespace-only) name'
);

-- 4) invalid_starting_balance
select throws_ok(
  $$ select create_member('Nieuw Lid', -100) $$,
  'P0001', 'invalid_starting_balance',
  'create_member rejects a negative starting balance'
);

-- 5) happy path, with startsaldo
select lives_ok(
  $$ select create_member('Nieuw Lid Met Saldo', 5000) $$,
  'create_member succeeds for a beheerder with a valid name and non-negative starting balance'
);

select is(
  (select count(*)::int from members
     where name = 'Nieuw Lid Met Saldo' and role = 'lid'
       and balance_cents = 5000 and archived = false
       and pin_hash is null and auth_user_id is null),
  1,
  'the new member exists with role lid, balance 5000, archived false, no pin_hash/auth_user_id'
);

-- 6) happy path, zonder startsaldo (null -> 0, "geen startsaldo" is normaal)
select lives_ok(
  $$ select create_member('Nieuw Lid Zonder Saldo', null) $$,
  'create_member succeeds for a beheerder with a valid name and a null starting balance'
);

select is(
  (select balance_cents from members where name = 'Nieuw Lid Zonder Saldo'),
  0,
  'a null starting balance defaults to 0'
);

-- 7) invalid_email (#57): een niet-leeg e-mailadres dat het minimale
-- formaat niet matcht.
select throws_ok(
  $$ select create_member('Nieuw Lid Ongeldige Email', null, 'niet-een-email') $$,
  'P0001', 'invalid_email',
  'create_member rejects a starting email that does not match the minimal format'
);

-- 8) happy path met een geldig e-mailadres (#57).
select lives_ok(
  $$ select create_member('Nieuw Lid Met Email', null, 'nieuw-lid@test.local') $$,
  'create_member succeeds for a beheerder with a valid starting email'
);

select is(
  (select email from members where name = 'Nieuw Lid Met Email'),
  'nieuw-lid@test.local',
  'the new member is stored with the given starting email'
);

-- 9) happy path met null/leeg e-mailadres (#57): bestaand gedrag blijft
-- werken na de signatuurwijziging (p_email default null, backwards
-- compatible met de 2-parameter-aanroepen hierboven).
select lives_ok(
  $$ select create_member('Nieuw Lid Zonder Email', null, '   ') $$,
  'create_member succeeds with a whitespace-only (effectively empty) starting email'
);

select is(
  (select email from members where name = 'Nieuw Lid Zonder Email'),
  null,
  'a whitespace-only starting email is stored as null'
);

-- ── update_member_name ───────────────────────────────────────────────────

-- 10) actor_not_found, variant B: caller resolves to a real members row, but
-- it's archived.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000282');
select throws_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a1', 'X') $$,
  'P0001', 'no_bar_role',
  'update_member_name rejects a caller whose members row is archived'
);

-- 11) no_admin_role
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000281');
select throws_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a1', 'X') $$,
  'P0001', 'no_admin_role',
  'update_member_name rejects a caller whose role is bardienst, not beheerder'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-000000000280');

-- 12) member_not_found
select throws_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002ff', 'X') $$,
  'P0001', 'member_not_found',
  'update_member_name rejects a member id that does not exist'
);

-- 13) invalid_name
select throws_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a1', '   ') $$,
  'P0001', 'invalid_name',
  'update_member_name rejects a blank (whitespace-only) name'
);

-- 14) happy path
select lives_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a1', 'Herdoopt Lid') $$,
  'update_member_name succeeds for a beheerder with a valid new name'
);

select is(
  (select name from members where id = '00000000-0000-0000-0000-0000000002a1'),
  'Herdoopt Lid',
  'the member name is updated to the new value'
);

-- 15) randgeval: een gearchiveerd lid blijft naam-bewerkbaar (spec →
-- Randgevallen / RPC's: geen "not archived"-eis op update_member_name,
-- zelfde redenering als update_product_price op een gearchiveerd product).
select lives_ok(
  $$ select update_member_name('00000000-0000-0000-0000-0000000002a2', 'Herdoopt Archief Lid') $$,
  'update_member_name succeeds even when the target member is archived'
);

select is(
  (select name from members where id = '00000000-0000-0000-0000-0000000002a2'),
  'Herdoopt Archief Lid',
  'the archived member''s name is updated'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a2'),
  true,
  'the member stays archived after its name was updated'
);

-- ── set_member_archived ──────────────────────────────────────────────────

-- 16) actor_not_found, variant A
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000283');
select throws_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', true) $$,
  'P0001', 'no_bar_session',
  'set_member_archived rejects a caller whose auth.uid() matches no members row'
);

-- 17) no_admin_role
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000281');
select throws_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', true) $$,
  'P0001', 'no_admin_role',
  'set_member_archived rejects a caller whose role is bardienst, not beheerder'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-000000000280');

-- 18) member_not_found
select throws_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002ff', true) $$,
  'P0001', 'member_not_found',
  'set_member_archived rejects a member id that does not exist'
);

-- 19) self_archive_forbidden: a beheerder cannot archive their own row (spec
-- → Randgevallen: would lock the actor out of /beheer with no RPC path back).
select throws_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-000000000290', true) $$,
  'P0001', 'self_archive_forbidden',
  'set_member_archived rejects a beheerder archiving their own members row'
);

-- 20) happy path: archive
select lives_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', true) $$,
  'set_member_archived succeeds in archiving an active member'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a3'),
  true,
  'the member is now archived'
);

-- 21) idempotent: sending p_archived = true again on an already-archived
-- member does not fail (spec → RPC's, same tolerance as set_product_archived).
select lives_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', true) $$,
  'set_member_archived on an already-archived member (p_archived=true again) does not fail'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a3'),
  true,
  'the already-archived member stays archived after the idempotent call'
);

-- 22) happy path: terugzetten (de-archive)
select lives_ok(
  $$ select set_member_archived('00000000-0000-0000-0000-0000000002a3', false) $$,
  'set_member_archived succeeds in de-archiving (terugzetten) the same member'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a3'),
  false,
  'the member is no longer archived'
);

-- ── set_member_role ───────────────────────────────────────────────────────

-- 23) actor_not_found, variant B
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000282');
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'bardienst') $$,
  'P0001', 'no_bar_role',
  'set_member_role rejects a caller whose members row is archived'
);

-- 24) no_admin_role
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000281');
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'bardienst') $$,
  'P0001', 'no_admin_role',
  'set_member_role rejects a caller whose role is bardienst, not beheerder'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-000000000280');

-- 25) member_not_found
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002ff', 'bardienst') $$,
  'P0001', 'member_not_found',
  'set_member_role rejects a member id that does not exist'
);

-- 26) invalid_role: not one of lid/bardienst/beheerder (server-fallback,
-- unreachable via the UI select — spec → RPC's/Randgevallen).
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'superadmin') $$,
  'P0001', 'invalid_role',
  'set_member_role rejects a role value outside lid/bardienst/beheerder'
);

-- 27) self_demote_forbidden: a beheerder cannot lower their own role (spec →
-- Randgevallen: would lock the actor out of /beheer with no RPC path back).
select throws_ok(
  $$ select set_member_role('00000000-0000-0000-0000-000000000290', 'lid') $$,
  'P0001', 'self_demote_forbidden',
  'set_member_role rejects a beheerder demoting their own role'
);

-- 28) not a demotion: a beheerder re-sending 'beheerder' for their own row is
-- allowed (idempotent, not blocked by self_demote_forbidden).
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-000000000290', 'beheerder') $$,
  'set_member_role allows a beheerder to re-send their own current role (beheerder -> beheerder, not a demotion)'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-000000000290'),
  'beheerder',
  'the actor''s own role stays beheerder after the no-op self re-send'
);

-- 29) rolwijziging van een ándere beheerder, ook als dat de laatst
-- overgebleven ándere beheerder is, blijft toegestaan (spec expliciet: geen
-- "laatste beheerder"-telling/-bescherming — Randgevallen/Expliciet buiten
-- scope). At this point in the fixture set, (...2a0) is the only other
-- beheerder besides the acting admin (...290), i.e. genuinely "the last
-- other beheerder".
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a0', 'lid') $$,
  'set_member_role allows demoting another (the last other) beheerder to lid — no last-admin protection exists'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-0000000002a0'),
  'lid',
  'the other member''s role is now lid'
);

-- 30) happy path transition: lid -> bardienst
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'bardienst') $$,
  'set_member_role succeeds for the lid -> bardienst transition'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-0000000002a4'),
  'bardienst',
  'the member''s role is now bardienst'
);

-- 31) happy path transition: bardienst -> beheerder
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'beheerder') $$,
  'set_member_role succeeds for the bardienst -> beheerder transition'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-0000000002a4'),
  'beheerder',
  'the member''s role is now beheerder'
);

-- 32) idempotent, non-actor: sending the same role again succeeds without
-- error or change (spec → RPC's, same tolerance as set_member_archived).
select lives_ok(
  $$ select set_member_role('00000000-0000-0000-0000-0000000002a4', 'beheerder') $$,
  'set_member_role on a member already at the target role (beheerder again) does not fail'
);

select is(
  (select role::text from members where id = '00000000-0000-0000-0000-0000000002a4'),
  'beheerder',
  'the member''s role is unchanged (still beheerder) after the idempotent call'
);

-- ── update_member_email (#57) ────────────────────────────────────────────

-- 33) actor_not_found, variant A: auth.uid() matches no members row at all.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000283');
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'x@test.local') $$,
  'P0001', 'no_bar_session',
  'update_member_email rejects a caller whose auth.uid() matches no members row'
);

-- 34) actor_not_found, variant B: caller resolves to a real members row, but
-- it's archived.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000282');
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'x@test.local') $$,
  'P0001', 'no_bar_role',
  'update_member_email rejects a caller whose members row is archived'
);

-- 35) no_admin_role
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000281');
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'x@test.local') $$,
  'P0001', 'no_admin_role',
  'update_member_email rejects a caller whose role is bardienst, not beheerder'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-000000000280');

-- 36) member_not_found
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002ff', 'x@test.local') $$,
  'P0001', 'member_not_found',
  'update_member_email rejects a member id that does not exist'
);

-- 37) invalid_email
select throws_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'niet-een-email') $$,
  'P0001', 'invalid_email',
  'update_member_email rejects a value that does not match the minimal email format'
);

-- 38) happy path: nieuw e-mailadres zetten (null -> waarde).
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a5', 'gewijzigd@test.local') $$,
  'update_member_email succeeds in setting a new email on a member that had none'
);

select is(
  (select email from members where id = '00000000-0000-0000-0000-0000000002a5'),
  'gewijzigd@test.local',
  'the member email is updated to the new value'
);

-- 39) happy path: bestaand e-mailadres wissen naar null (leeg veld).
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a6', '') $$,
  'update_member_email succeeds in wiping an existing email back to null'
);

select is(
  (select email from members where id = '00000000-0000-0000-0000-0000000002a6'),
  null,
  'the member email is null after being wiped'
);

-- 40) randgeval: een gearchiveerd lid blijft e-mailadres-bewerkbaar (spec →
-- Randgevallen: geen "not archived"-eis, zelfde redenering als
-- update_member_name op een gearchiveerd lid).
select lives_ok(
  $$ select update_member_email('00000000-0000-0000-0000-0000000002a7', 'archief@test.local') $$,
  'update_member_email succeeds even when the target member is archived'
);

select is(
  (select email from members where id = '00000000-0000-0000-0000-0000000002a7'),
  'archief@test.local',
  'the archived member''s email is updated'
);

select is(
  (select archived from members where id = '00000000-0000-0000-0000-0000000002a7'),
  true,
  'the member stays archived after its email was updated'
);

-- ── members_email_format_check (db-level constraint, #57) ───────────────
--
-- Belt-and-braces (spec → RPC's: "drie plekken, bewust niet één gedeelde
-- bron" — db-constraint, RPC-validatie, client-helper). The RPC-level
-- invalid_email tests above prove the RPC's own validation; they say
-- nothing about whether the db-level `members_email_format_check`
-- constraint itself actually rejects a bad value, independent of the RPC.
-- These two cases write directly to the table (like
-- rls_write_protection.test.sql does to prove the REVOKE), bypassing the
-- RPC entirely, to prove the constraint itself holds. `authenticated`
-- could never reach this path anyway — the blanket REVOKE on members
-- (0001_init.sql, proven in rls_write_protection.test.sql) blocks it first
-- — but this file's fixture inserts above already run with broader
-- privileges than `authenticated` (no `set local role authenticated` in
-- this file), which is exactly the "any future write path that bypasses
-- the RPCs" scenario the migration's own comment names as the reason the
-- constraint exists.

select throws_ok(
  $$ insert into members (name, role, email) values ('Ongeldige Email Insert', 'lid', 'niet-een-email') $$,
  '23514',
  'new row for relation "members" violates check constraint "members_email_format_check"',
  'members_email_format_check rejects a direct insert with an invalid email format'
);

select throws_ok(
  $$ update members set email = 'ook-ongeldig' where id = '00000000-0000-0000-0000-0000000002a5' $$,
  '23514',
  'new row for relation "members" violates check constraint "members_email_format_check"',
  'members_email_format_check rejects a direct update with an invalid email format'
);

-- ── list_members_admin (ADR 0004, migratie 0009) ─────────────────────────
--
-- members.email is column-level REVOKEd voor authenticated sinds migratie
-- 0009 (zie hieronder) — deze RPC is de enige leesweg. Zelfde
-- actorcheck-vorm/fixtures als de rest van dit bestand.

-- 41) actor_not_found, variant A: auth.uid() matches no members row at all.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000283');
select throws_ok(
  $$ select * from list_members_admin() $$,
  'P0001', 'no_bar_session',
  'list_members_admin rejects a caller whose auth.uid() matches no members row'
);

-- 42) actor_not_found, variant B: caller resolves to a real members row, but
-- it's archived.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000282');
select throws_ok(
  $$ select * from list_members_admin() $$,
  'P0001', 'no_bar_role',
  'list_members_admin rejects a caller whose members row is archived'
);

-- 43) no_admin_role
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000281');
select throws_ok(
  $$ select * from list_members_admin() $$,
  'P0001', 'no_admin_role',
  'list_members_admin rejects a caller whose role is bardienst, not beheerder'
);

select pg_temp.act_as_user('00000000-0000-0000-0000-000000000280');

-- 44) happy path: beheerder-sessie krijgt de ledenlijst terug.
select lives_ok(
  $$ select * from list_members_admin() $$,
  'list_members_admin succeeds for a beheerder session'
);

-- 45)-47) bevestigt dat de RPC de email-kolom daadwerkelijk teruggeeft
-- (niet stilzwijgend weglaat) — vergeleken met wat eerdere tests in dit
-- bestand op diezelfde rijen zetten (test 38/39), plus een rij die nooit
-- een email had.
select is(
  (select email from list_members_admin() where id = '00000000-0000-0000-0000-0000000002a5'),
  'gewijzigd@test.local',
  'list_members_admin returns the email set earlier by update_member_email'
);

select is(
  (select email from list_members_admin() where id = '00000000-0000-0000-0000-0000000002a6'),
  null,
  'list_members_admin returns null for a member whose email was wiped'
);

select is(
  (select email from list_members_admin() where id = '00000000-0000-0000-0000-0000000002a1'),
  null,
  'list_members_admin returns null for a member that never had an email set'
);

-- 48)-49) list_members_admin pin_hash-scrub (migratie
-- 0011_list_members_admin_pin_hash_scrub.sql, restbeperking #42): pin_hash
-- moet altijd null zijn in het resultaat, ook voor een lid met een
-- daadwerkelijk gezette PIN (LB Pin Scrub Target hierboven) — has_pin blijft
-- wél true, want die generated column leest de ruwe kolom in de tabel zelf,
-- niet wat deze RPC teruggeeft. Geen throws_ok: dit is geen weigering maar
-- een scrub op een geslaagde aanroep, zelfde soort test als 45)-47)
-- hierboven voor email.
select is(
  (select pin_hash from list_members_admin() where id = '00000000-0000-0000-0000-0000000002a8'),
  null,
  'list_members_admin scrubs pin_hash to null even for a member with a set pin (migration 0011)'
);

select is(
  (select has_pin from list_members_admin() where id = '00000000-0000-0000-0000-0000000002a8'),
  true,
  'list_members_admin still reports has_pin = true for that member (migration 0011)'
);

-- ── mark_member_invite_sent (#24, docs/features/lid-account-invite.md,
--    migratie 0012, herzien — was mark_member_invited) ───────────────────
--
-- Zelfde actorcheckvorm/fixtures als de rest van dit bestand. Herzien
-- contract t.o.v. de oude mark_member_invited: geen p_auth_user_id-parameter
-- meer, en de happy path bewijst nu expliciet dat auth_user_id ongewijzigd
-- null blijft — dat is precies Bug 1's fix (de "uitgenodigd, nog geen
-- account"-tussenstaat moet bereikbaar zijn/blijven, spec → herzieningsblok).
-- Kan, net als de oude versie, maar één keer succesvol tegen dezelfde
-- target-rij draaien (een tweede aanroep zou already_linked opleveren) — de
-- happy-path-test roept de RPC daarom precies één keer aan en legt het volle
-- geretourneerde resultaat in een temp table vast.

-- 50) actor_not_found, variant A: auth.uid() matches no members row at all.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000283');
select throws_ok(
  $$ select mark_member_invite_sent('00000000-0000-0000-0000-0000000002a9') $$,
  'P0001', 'no_bar_session',
  'mark_member_invite_sent rejects a caller whose auth.uid() matches no members row'
);

-- 51) no_admin_role: caller resolves to a real, active member, but not beheerder.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000281');
select throws_ok(
  $$ select mark_member_invite_sent('00000000-0000-0000-0000-0000000002a9') $$,
  'P0001', 'no_admin_role',
  'mark_member_invite_sent rejects a caller whose role is bardienst, not beheerder'
);

-- From here on, act as the admin fixture.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000280');

-- 52) member_not_found
select throws_ok(
  $$ select mark_member_invite_sent('00000000-0000-0000-0000-0000000002ff') $$,
  'P0001', 'member_not_found',
  'mark_member_invite_sent rejects a member id that does not exist'
);

-- 53) already_linked: the target already has an auth_user_id (LB Staff
-- Fixture, linked to auth.users ...281 in the Fixtures section above) — the
-- guard against overwriting an existing link (spec → RPC's, "Guard tegen
-- dubbele koppeling", behouden op expliciet verzoek van Bram bij Bug 1's fix).
select throws_ok(
  $$ select mark_member_invite_sent('00000000-0000-0000-0000-000000000291') $$,
  'P0001', 'already_linked',
  'mark_member_invite_sent rejects a member that already has an auth_user_id'
);

-- 54) happy path: sets invited_at on an eligible, unlinked member, and
-- returns a row with pin_hash scrubbed to null (spec → RPC's: "Verplicht:
-- zelfde pin_hash-scrub als de andere `returns members`-RPC's") — and,
-- expliciet (dit is de kern van de RPC-splitsing/Bug-1-fix): auth_user_id
-- blijft null, zowel in het geretourneerde resultaat als op de tabel zelf.
select lives_ok(
  $$ create temp table lmis_result as
     select * from mark_member_invite_sent('00000000-0000-0000-0000-0000000002a9') $$,
  'mark_member_invite_sent succeeds for a beheerder sending an invite to an eligible, unlinked member'
);

select ok(
  (select invited_at is not null from lmis_result),
  'mark_member_invite_sent returns a non-null invited_at'
);

select is(
  (select auth_user_id from lmis_result),
  null,
  'mark_member_invite_sent returns auth_user_id = null (Bug 1 fix: sending an invite never links an account)'
);

select is(
  (select pin_hash from lmis_result),
  null,
  'mark_member_invite_sent scrubs pin_hash to null in its returned row, even though the target member has a real pin set'
);

select ok(
  (select invited_at is not null from members where id = '00000000-0000-0000-0000-0000000002a9'),
  'the target member''s invited_at is persisted (non-null)'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000002a9'),
  null,
  'the target member''s auth_user_id stays null on the table (Bug 1 fix), only link_invited_member_account may set it'
);

select is(
  (select crypt('9999', pin_hash) = pin_hash from members where id = '00000000-0000-0000-0000-0000000002a9'),
  true,
  'the target member''s real pin_hash on the table is untouched by mark_member_invite_sent (only the returned row is scrubbed)'
);

-- 55) regressie: de kolomtoevoeging in list_members_admin() (migratie 0012)
-- mag de bestaande pin_hash-scrub-garantie (migratie 0011, test 48-49
-- hierboven) niet breken, en moet de nieuwe invited_at-kolom ook
-- daadwerkelijk teruggeven voor het lid dat hierboven zojuist uitgenodigd is.
select ok(
  (select invited_at is not null from list_members_admin() where id = '00000000-0000-0000-0000-0000000002a9'),
  'list_members_admin returns a non-null invited_at for the member invited by mark_member_invite_sent (migration 0012)'
);

select is(
  (select pin_hash from list_members_admin() where id = '00000000-0000-0000-0000-0000000002a9'),
  null,
  'list_members_admin still scrubs pin_hash to null after the 0012 column addition (regression guard)'
);

-- ── link_invited_member_account (#24, docs/features/lid-account-invite.md,
--    migratie 0012, nieuwe RPC) ───────────────────────────────────────────
--
-- Andere actor dan de rest van deze RPC-familie: geen beheerder-sessie, geen
-- auth.uid() -> members-actorcheck. De "sessie" hier is die van het
-- uitgenodigde lid zelf, geïdentificeerd via auth.email() (gematcht tegen
-- members.email, case-insensitief) i.p.v. auth.uid() -> members.auth_user_id
-- (spec → RPC's punt 2). De test-simulatie zet daarom, naast het bestaande
-- request.jwt.claim.sub (voor auth.uid(), het id dat bij een match
-- daadwerkelijk aan auth_user_id toegewezen wordt), ook
-- request.jwt.claim.email (voor auth.email(), de matchsleutel) — zelfde
-- GUC-gebaseerde simulatie als request.jwt.claim.sub elders in dit bestand,
-- nu voor Postgres' auth.email()-implementatie
-- (current_setting('request.jwt.claim.email', true)). Geen foutcodes voor
-- deze RPC (spec → RPC's punt 2: "Geen foutcodes... stille no-op, nooit een
-- fout") — elk niet-happy-path-geval hieronder gebruikt daarom lives_ok/
-- is(... is null) i.p.v. throws_ok.

-- 56) happy path: exact één match (case-insensitief — het opgeslagen
-- e-mailadres LB Link Happy Target heeft gemengd hoofdlettergebruik, de
-- sessie-claim hieronder is lowercase), auth_user_id null, invited_at
-- gezet. Koppelt auth_user_id aan het session-uid en scrubt pin_hash in het
-- geretourneerde resultaat.
select pg_temp.act_as_user('00000000-0000-0000-0000-000000000284');
select set_config('request.jwt.claim.email', 'link-happy@test.local', true);
select lives_ok(
  $$ create temp table lima_happy_result as
     select * from link_invited_member_account() $$,
  'link_invited_member_account succeeds for a session whose email matches exactly one eligible member'
);

select is(
  (select auth_user_id from lima_happy_result),
  '00000000-0000-0000-0000-000000000284'::uuid,
  'link_invited_member_account returns the newly linked auth_user_id (the session''s own auth.uid())'
);

select is(
  (select pin_hash from lima_happy_result),
  null,
  'link_invited_member_account scrubs pin_hash to null in its returned row, even though the target member has a real pin set'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000002aa'),
  '00000000-0000-0000-0000-000000000284'::uuid,
  'the target member''s auth_user_id is persisted correctly, matched case-insensitively on email'
);

select is(
  (select crypt('1111', pin_hash) = pin_hash from members where id = '00000000-0000-0000-0000-0000000002aa'),
  true,
  'the target member''s real pin_hash on the table is untouched by link_invited_member_account (only the returned row is scrubbed)'
);

-- 57) geen match, variant 1: no members row has this email at all (never
-- saved, unrelated address) — silent null, no error, no change to any row.
select set_config('request.jwt.claim.email', 'link-nomatch@test.local', true);
select is(
  (select link_invited_member_account() is null),
  true,
  'link_invited_member_account returns null when no member has a matching email at all'
);

-- 58) geen match, variant 2: a member has this email, but is already linked
-- (auth_user_id is not null) — the ordinary re-login case (spec →
-- Randgevallen "Een al-gekoppeld lid logt gewoon opnieuw in").
select set_config('request.jwt.claim.email', 'link-alreadylinked@test.local', true);
select is(
  (select link_invited_member_account() is null),
  true,
  'link_invited_member_account returns null when the matching member is already linked'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000002ab'),
  '00000000-0000-0000-0000-000000000285'::uuid,
  'the already-linked member''s auth_user_id is unchanged by the no-op call'
);

-- 59) geen match, variant 3: a member has this email, is unlinked, but was
-- never invited (invited_at is null) — the extra "invited_at is not null"
-- defense-in-depth guard (spec → RPC's punt 2).
select set_config('request.jwt.claim.email', 'link-neverinvited@test.local', true);
select is(
  (select link_invited_member_account() is null),
  true,
  'link_invited_member_account returns null when the matching member was never actually invited (invited_at is null)'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000002ac'),
  null,
  'the never-invited member''s auth_user_id stays null after the no-op call'
);

-- 60) meerdere matches: an email collision (two eligible members share the
-- same email) — silent null, no koppeling to either row (spec →
-- Randgevallen "E-mailcollision bij het koppelen").
select set_config('request.jwt.claim.email', 'link-collision@test.local', true);
select is(
  (select link_invited_member_account() is null),
  true,
  'link_invited_member_account returns null on an email collision (more than one eligible match)'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000002ad'),
  null,
  'the first colliding member''s auth_user_id stays null after the no-op call'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000002ae'),
  null,
  'the second colliding member''s auth_user_id stays null after the no-op call'
);

-- 61) geen e-mailclaim op de sessie: auth.email() resolves to null (spec →
-- RPC's punt 2: defensief, "zou niet moeten voorkomen voor een geslaagde
-- e-mail-login, maar defensief") — silent null, no error.
select set_config('request.jwt.claim.email', '', true);
select is(
  (select link_invited_member_account() is null),
  true,
  'link_invited_member_account returns null when the session has no email claim at all'
);

-- ── column-level REVOKE op members.email (ADR 0004, migratie 0009) ──────
--
-- Bewijst de REVOKE zelf, los van list_members_admin's bestaan (spec →
-- Randgevallen → "Negatieve tests"). De exacte Postgres-boodschap voor een
-- column-level permission-fout is in deze sandbox niet tegen een echte
-- Postgres geverifieerd (geen lokale Docker/Supabase-stack beschikbaar) —
-- daarom alleen de SQLSTATE geasserteerd (message-argument NULL, pgTAP
-- slaat de boodschap-vergelijking dan over) i.p.v. tekst te gokken, precies
-- de valkuil die rls_write_protection.test.sql's eigen commentaar al
-- documenteert (issue #2: een gegokte boodschap faalt zelfs als de REVOKE
-- zelf correct is). CI bevestigt dat de query daadwerkelijk wordt
-- geweigerd.
set local role authenticated;
select throws_ok(
  $$ select email from members limit 1 $$,
  '42501',
  NULL,
  'select on members.email is blocked for authenticated (column-level REVOKE, migration 0009)'
);

-- ── column-level REVOKE op members.pin_hash (migratie 0010, #42) ────────
--
-- Zelfde soort bewijs als de email-REVOKE-test hierboven, nu voor pin_hash
-- (0010_pin_hash_kolombeveiliging.sql) — zie die migratie's eigen
-- uitgebreide commentaar voor waarom een kale column-level REVOKE niet
-- vanzelfsprekend werkt (een eerdere, kale versie van precies deze REVOKE
-- bleek zonder een voorafgaande tabel-brede REVOKE geen effect te hebben) en
-- hoe dit nu wél empirisch geverifieerd is. Zelfde voorzichtigheid als de
-- email-test hierboven: alleen de SQLSTATE geasserteerd (message-argument
-- NULL), de exacte Postgres-foutmelding niet gegokt (zie ook
-- rls_write_protection.test.sql's eigen geschiedenis met dat probleem). Nog
-- steeds `authenticated` sinds `set local role` hierboven, geen nieuwe
-- rolwissel nodig.
select throws_ok(
  $$ select pin_hash from members limit 1 $$,
  '42501',
  NULL,
  'select on members.pin_hash is blocked for authenticated (column-level REVOKE, migration 0010)'
);

select * from finish();
rollback;
