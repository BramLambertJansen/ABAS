-- Negative-test coverage for `link_lid_member_account()`
-- (supabase/migrations/0022_lid_account_koppelen.sql,
-- docs/features/portal-login.md → "Ledenkoppeling voor rol `lid`"). Run with
-- `npm run db:test` (= `supabase test db`, vereist `supabase start` /
-- Docker lokaal).
--
-- Zelfde actorpatroon als `link_invited_member_account`
-- (supabase/tests/ledenbeheer.test.sql → "link_invited_member_account"):
-- geen `auth.uid() -> members`-actorcheck, de "sessie" hier is die van het
-- inloggende lid zelf. Sinds 0040 (ADR 0020,
-- docs/features/account-koppeling-bewijs.md) koppelt de RPC alleen het
-- account uit `members.invited_auth_user_id`, op het adres uit `auth.users`
-- (case-insensitief), zonder wachtwoord, met een amr-methode uit de mailbox
-- (hier `otp`, de portal-route) en een `session_id`-claim. Daarom heeft elk
-- geval een eigen account; `pg_temp.link_claims` zet de claims. De
-- randgevallen van die voorwaarden staan in account_koppeling_bewijs.test.sql.
-- Geen foutcodes voor deze RPC (spec:
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

-- auth.users: één account per geval, elk op het adres van zijn doellid,
-- bevestigd en zonder wachtwoord (de staat na een geopende uitnodiging).
--   (...380): happy path — het auth.uid() dat daadwerkelijk gekoppeld wordt.
--   (...381): al gekoppeld aan LAK Already Linked Target.
--   (...382)/(...383): gebonden aan de bardienst-/beheerder-rij.
--   (...384): op een adres zonder lid, aan niets gebonden.
--   (...385): gebonden aan het nooit-uitgenodigde lid.
--   (...386): gebonden aan beide collision-rijen.
--   (...387): gebonden aan een verder geldig lid, sessie zonder amr.
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select ('00000000-0000-0000-0000-00000000038' || v.n)::uuid,
       '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', v.email,
       '', now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}'
  from (values
    ('0', 'lak-happy@test.local'),
    ('1', 'lak-alreadylinked@test.local'),
    ('2', 'lak-bardienst-escalation@test.local'),
    ('3', 'lak-beheerder-escalation@test.local'),
    ('4', 'lak-nomatch@test.local'),
    ('5', 'lak-neverinvited@test.local'),
    ('6', 'lak-collision@test.local'),
    ('7', 'lak-noamr@test.local')
  ) as v(n, email);

-- Target rijen — elk een eigen email/invited_at/auth_user_id/role-combinatie,
-- één per geval dat de spec expliciet noemt, gebonden (invited_auth_user_id)
-- aan het account van dat geval.
insert into members (id, name, role, pin_hash, balance_cents, archived, email, invited_at, auth_user_id,
                     invited_auth_user_id) values
  -- Happy path: precies één match, role lid. Gemengd hoofdlettergebruik in
  -- het opgeslagen e-mailadres, bewust anders dan auth.users (lowercase) —
  -- bewijst de case-insensitieve match. Echte pin_hash zodat de
  -- scrub-assertion niet vacuous is (zelfde reden als elders in de suite,
  -- ook al heeft een echte `lid` in de praktijk nooit een pincode,
  -- CLAUDE.md → "Dienst & bezetting").
  ('00000000-0000-0000-0000-0000000003a0', 'LAK Happy Target', 'lid',
   crypt('1111', gen_salt('bf')), 0, false, 'Lak-Happy@Test.Local', now(), null,
   '00000000-0000-0000-0000-000000000380'),
  -- Geen match, variant 1: al gekoppeld (gewone her-login van een al
  -- gekoppeld lid).
  ('00000000-0000-0000-0000-0000000003a1', 'LAK Already Linked Target', 'lid',
   null, 0, false, 'lak-alreadylinked@test.local', now(), '00000000-0000-0000-0000-000000000381',
   '00000000-0000-0000-0000-000000000381'),
  -- Geen match, variant 2: nooit uitgenodigd (invited_at is null) — de
  -- "extra, goedkope verdedigingslaag" uit de RPC zelf.
  ('00000000-0000-0000-0000-0000000003a2', 'LAK Never Invited Target', 'lid',
   null, 0, false, 'lak-neverinvited@test.local', null, null,
   '00000000-0000-0000-0000-000000000385'),
  -- E-mailcollision: twee lid-rijen met hetzelfde e-mailadres, allebei
  -- eligible en aan hetzelfde account gebonden.
  ('00000000-0000-0000-0000-0000000003a3', 'LAK Collision Target One', 'lid',
   null, 0, false, 'lak-collision@test.local', now(), null,
   '00000000-0000-0000-0000-000000000386'),
  ('00000000-0000-0000-0000-0000000003a4', 'LAK Collision Target Two', 'lid',
   null, 0, false, 'lak-collision@test.local', now(), null,
   '00000000-0000-0000-0000-000000000386'),
  -- KRITIEK — bevoegdheidslek: een bardienst-rij, verder in elk opzicht
  -- eligible (unlinked, invited_at gezet, gebonden), mag NOOIT gekoppeld
  -- worden door deze RPC (harde `role = 'lid'`-filter, spec → punt 2).
  ('00000000-0000-0000-0000-0000000003a5', 'LAK Bardienst Privilege Escalation Target', 'bardienst',
   null, 0, false, 'lak-bardienst-escalation@test.local', now(), null,
   '00000000-0000-0000-0000-000000000382'),
  -- Zelfde bevoegdheidslek, nu voor beheerder — de rol met de hoogste
  -- rechten in dit domein, dus expliciet ook zijn eigen test, niet
  -- verondersteld "hetzelfde als bardienst" zonder bewijs.
  ('00000000-0000-0000-0000-0000000003a6', 'LAK Beheerder Privilege Escalation Target', 'beheerder',
   null, 0, false, 'lak-beheerder-escalation@test.local', now(), null,
   '00000000-0000-0000-0000-000000000383'),
  -- 0040: verder geldig, maar de sessie heeft geen amr-claim (test 8).
  ('00000000-0000-0000-0000-0000000003a7', 'LAK No Amr Target', 'lid',
   null, 0, false, 'lak-noamr@test.local', now(), null,
   '00000000-0000-0000-0000-000000000387');

-- Claims van een geslaagde portal-login (verifyOtp: amr `otp`), met
-- session_id. `p_amr` null: geen amr-claim.
create function pg_temp.link_claims(p_sub uuid, p_amr text default 'otp')
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config(
    'request.jwt.claims',
    case when p_amr is null
      then json_build_object('sub', p_sub::text, 'session_id', p_sub::text)
      else json_build_object(
        'sub', p_sub::text, 'session_id', p_sub::text,
        'amr', json_build_array(json_build_object('method', p_amr, 'timestamp', 0)))
    end::text,
    true
  );
end;
$fn$;

-- ── Kritiek: bevoegdheidslek — bardienst/beheerder wordt nooit gekoppeld ──

-- 1) bardienst: matcht op elk ander criterium (unlinked, invited_at gezet),
-- maar role <> 'lid' -> stille no-op, geen koppeling.
select pg_temp.link_claims('00000000-0000-0000-0000-000000000382');
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
select pg_temp.link_claims('00000000-0000-0000-0000-000000000383');
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
select pg_temp.link_claims('00000000-0000-0000-0000-000000000380');
select lives_ok(
  $$ create temp table lak_happy_result as
     select * from link_lid_member_account() $$,
  'link_lid_member_account succeeds for the bound, confirmed, password-less account of exactly one eligible lid-role member'
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

-- 4) geen match, variant 0: geen enkel lid is aan dit account gebonden.
select pg_temp.link_claims('00000000-0000-0000-0000-000000000384');
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null when no member is bound to the account at all'
);

-- 5) geen match, variant 1: het account is al gekoppeld (gewone her-login
-- van een al gekoppeld lid).
select pg_temp.link_claims('00000000-0000-0000-0000-000000000381');
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
select pg_temp.link_claims('00000000-0000-0000-0000-000000000385');
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
select pg_temp.link_claims('00000000-0000-0000-0000-000000000386');
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

-- 8) was "geen e-mailclaim": het adres komt sinds 0040 uit auth.users. Nu:
-- een verder geldig gebonden account zonder amr-claim -> stille no-op, geen
-- crash (spec: "stille no-op, geen crash").
select pg_temp.link_claims('00000000-0000-0000-0000-000000000387', null);
select is(
  (select link_lid_member_account() is null),
  true,
  'link_lid_member_account returns null when the session has no amr claim at all'
);

select * from finish();
rollback;
