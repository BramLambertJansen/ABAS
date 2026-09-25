-- Negative-test coverage for `link_lid_member_account()`
-- (supabase/migrations/0022_lid_account_koppelen.sql,
-- docs/features/portal-login.md → "Ledenkoppeling voor rol `lid`"). Run with
-- `npm run db:test` (= `supabase test db`, vereist `supabase start` /
-- Docker lokaal).
--
-- Zelfde actorpatroon als `link_invited_member_account`
-- (supabase/tests/ledenbeheer.test.sql → "link_invited_member_account"):
-- geen `auth.uid() -> members`-actorcheck, de "sessie" hier is die van het
-- inloggende lid zelf, geïdentificeerd via `auth.email()`
-- (`request.jwt.claim.email`, case-insensitief gematcht) en gekoppeld via
-- `auth.uid()` (`request.jwt.claim.sub`). Geen foutcodes voor deze RPC (spec:
-- "stille no-op, nooit een fout") — elk niet-happy-path-geval hieronder
-- gebruikt daarom `lives_ok`/`is(... is null)` i.p.v. `throws_ok`.
--
-- De belangrijkste test in dit bestand is het bevoegdheidslek-scenario (spec
-- → "Ledenkoppeling voor rol `lid`", punt 2): een e-mailadres dat matcht met
-- een `bardienst`- of `beheerder`-rij (in plaats van `lid`) mag NOOIT
-- gekoppeld worden via deze RPC, ook niet als die rij verder aan alle
-- overige voorwaarden voldoet (unlinked, invited_at gezet) — zonder die
-- harde rolfilter zou de laagdrempelige, geen-beheerder-sessie-vereisende
-- portal-route een weg worden om een bardienst/beheerder-account te
-- koppelen buiten `/beheer/callback`'s eigen pad om.

create extension if not exists pgtap with schema extensions;

begin;
select plan(18);

-- ── Fixtures ──────────────────────────────────────────────────────────

-- auth.users: sessies die de tests hieronder simuleren.
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  -- (...380): de sessie van het lid zelf, ná een geslaagde
  -- exchangeCodeForSession()/verifyOtp() — dit is het auth.uid() dat de
  -- happy-path-test daadwerkelijk aan een lid koppelt.
  ('00000000-0000-0000-0000-000000000380', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lak-session-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  -- (...381): al gekoppeld aan een ánder lid (LAK Already Linked Target
  -- hieronder) — auth_user_id heeft een unique-constraint
  -- (0005_assortimentbeheer.sql), dus dit moet een eigen, ongebruikt id zijn.
  ('00000000-0000-0000-0000-000000000381', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lak-alreadylinked-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

-- Target rijen — elk een eigen email/invited_at/auth_user_id/role-combinatie,
-- één per geval dat de spec expliciet noemt.
insert into members (id, name, role, pin_hash, balance_cents, archived, email, invited_at, auth_user_id) values
  -- Happy path: precies één match, role lid. Gemengd hoofdlettergebruik in
  -- het opgeslagen e-mailadres, bewust anders dan de sessie-claim hieronder
  -- (lowercase) — bewijst de case-insensitieve match. Echte pin_hash zodat de
  -- scrub-assertion niet vacuous is (zelfde reden als elders in de suite,
  -- ook al heeft een echte `lid` in de praktijk nooit een pincode,
  -- CLAUDE.md → "Dienst & bezetting").
  ('00000000-0000-0000-0000-0000000003a0', 'LAK Happy Target', 'lid',
   crypt('1111', gen_salt('bf')), 0, false, 'Lak-Happy@Test.Local', now(), null),
  -- Geen match, variant 1: al gekoppeld (gewone her-login van een al
  -- gekoppeld lid).
  ('00000000-0000-0000-0000-0000000003a1', 'LAK Already Linked Target', 'lid',
   null, 0, false, 'lak-alreadylinked@test.local', now(), '00000000-0000-0000-0000-000000000381'),
  -- Geen match, variant 2: nooit uitgenodigd (invited_at is null) — de
  -- "extra, goedkope verdedigingslaag" uit de RPC zelf.
  ('00000000-0000-0000-0000-0000000003a2', 'LAK Never Invited Target', 'lid',
   null, 0, false, 'lak-neverinvited@test.local', null, null),
  -- E-mailcollision: twee lid-rijen met hetzelfde e-mailadres, allebei
  -- eligible.
  ('00000000-0000-0000-0000-0000000003a3', 'LAK Collision Target One', 'lid',
   null, 0, false, 'lak-collision@test.local', now(), null),
  ('00000000-0000-0000-0000-0000000003a4', 'LAK Collision Target Two', 'lid',
   null, 0, false, 'lak-collision@test.local', now(), null),
  -- KRITIEK — bevoegdheidslek: een bardienst-rij, verder in elk opzicht
  -- eligible (unlinked, invited_at gezet), mag NOOIT gekoppeld worden door
  -- deze RPC (harde `role = 'lid'`-filter, spec → punt 2).
  ('00000000-0000-0000-0000-0000000003a5', 'LAK Bardienst Privilege Escalation Target', 'bardienst',
   null, 0, false, 'lak-bardienst-escalation@test.local', now(), null),
  -- Zelfde bevoegdheidslek, nu voor beheerder — de rol met de hoogste
  -- rechten in dit domein, dus expliciet ook zijn eigen test, niet
  -- verondersteld "hetzelfde als bardienst" zonder bewijs.
  ('00000000-0000-0000-0000-0000000003a6', 'LAK Beheerder Privilege Escalation Target', 'beheerder',
   null, 0, false, 'lak-beheerder-escalation@test.local', now(), null);

-- ── Kritiek: bevoegdheidslek — bardienst/beheerder wordt nooit gekoppeld ──

-- 1) bardienst: matcht op elk ander criterium (unlinked, invited_at gezet),
-- maar role <> 'lid' -> stille no-op, geen koppeling.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000380', true);
select set_config('request.jwt.claim.email', 'lak-bardienst-escalation@test.local', true);
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null for an otherwise-eligible bardienst-role member (never escalates beyond role=lid)'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000003a5'),
  null,
  'the bardienst target''s auth_user_id stays null — no privilege escalation via this RPC'
);

-- 2) beheerder: dezelfde bescherming, los getest.
select set_config('request.jwt.claim.email', 'lak-beheerder-escalation@test.local', true);
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null for an otherwise-eligible beheerder-role member (never escalates beyond role=lid)'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000003a6'),
  null,
  'the beheerder target''s auth_user_id stays null — no privilege escalation via this RPC'
);

-- ── Happy path ────────────────────────────────────────────────────────

-- 3) exact één match (case-insensitief), auth_user_id null, invited_at
-- gezet, role lid. Koppelt auth_user_id aan het session-uid en scrubt
-- pin_hash in het geretourneerde resultaat.
select set_config('request.jwt.claim.email', 'lak-happy@test.local', true);
select lives_ok(
  $$ create temp table lak_happy_result as
     select * from link_lid_member_account() $$,
  'link_lid_member_account succeeds for a session whose email matches exactly one eligible lid-role member'
);

select is(
  (select auth_user_id from lak_happy_result),
  '00000000-0000-0000-0000-000000000380'::uuid,
  'link_lid_member_account returns the newly linked auth_user_id (the session''s own auth.uid())'
);

select is(
  (select pin_hash from lak_happy_result),
  null,
  'link_lid_member_account scrubs pin_hash to null in its returned row, even though the target member has a real pin_hash set'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000003a0'),
  '00000000-0000-0000-0000-000000000380'::uuid,
  'the target member''s auth_user_id is persisted correctly, matched case-insensitively on email'
);

select is(
  (select crypt('1111', pin_hash) = pin_hash from members where id = '00000000-0000-0000-0000-0000000003a0'),
  true,
  'the target member''s real pin_hash on the table is untouched by link_lid_member_account (only the returned row is scrubbed)'
);

-- ── Geen match ────────────────────────────────────────────────────────

-- 4) geen match, variant 0: geen enkele rij heeft dit e-mailadres.
select set_config('request.jwt.claim.email', 'lak-nomatch@test.local', true);
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null when no member has a matching email at all'
);

-- 5) geen match, variant 1: e-mailadres matcht, maar auth_user_id is al
-- gezet (gewone her-login van een al gekoppeld lid).
select set_config('request.jwt.claim.email', 'lak-alreadylinked@test.local', true);
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null when the matching member is already linked'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000003a1'),
  '00000000-0000-0000-0000-000000000381'::uuid,
  'the already-linked member''s auth_user_id is unchanged by the no-op call'
);

-- 6) geen match, variant 2: e-mailadres matcht, unlinked, maar nooit
-- uitgenodigd (invited_at is null).
select set_config('request.jwt.claim.email', 'lak-neverinvited@test.local', true);
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null when the matching member was never actually invited (invited_at is null)'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000003a2'),
  null,
  'the never-invited member''s auth_user_id stays null after the no-op call'
);

-- 7) meerdere matches: e-mailcollision tussen twee eligible lid-rijen.
select set_config('request.jwt.claim.email', 'lak-collision@test.local', true);
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null on an email collision (more than one eligible match)'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000003a3'),
  null,
  'the first colliding member''s auth_user_id stays null after the no-op call'
);

select is(
  (select auth_user_id from members where id = '00000000-0000-0000-0000-0000000003a4'),
  null,
  'the second colliding member''s auth_user_id stays null after the no-op call'
);

-- 8) geen e-mailclaim op de sessie: auth.email() resolves to null -> stille
-- no-op, geen crash (spec: "stille no-op, geen crash").
select set_config('request.jwt.claim.email', '', true);
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null when the session has no email claim at all'
);

select * from finish();
rollback;
