-- Negatieve tests voor 0018_rpc_execute_alleen_authenticated.sql: geen
-- enkele RPC in `public` is aanroepbaar zonder sessie. Run met
-- `npm run db:test` (= `supabase test db`, vereist `supabase start` /
-- Docker lokaal).
--
-- Dit bestand bestaat omdat de rest van de suite een blinde vlek had. Elke
-- andere test hier draait als `authenticated` (of als superuser met een
-- gesimuleerde `auth.uid()`), en toetst dus wat een ingelogde aanroeper mag.
-- Niemand keek ooit naar wat een *sessieloze* aanroeper mag — en dat bleek
-- sinds 0001_init.sql: alles. Zie 0018's kop voor de volledige analyse.
--
-- Twee soorten assertie, bewust beide:
--
--   1. Een tellende assertie over álle functies in `public`. Die dekt ook
--      een RPC die er morgen bij komt — precies het geval waarin een
--      handgetypte lijst stilzwijgend incompleet raakt. Faalt zo'n functie
--      hier, dan is de fix één `revoke` in de migratie die 'm toevoegt.
--   2. Een handvol benoemde functies, zodat een falende run meteen laat
--      zien wáár het over gaat in plaats van alleen "er zijn er 3 te veel".
--
-- `has_function_privilege()` is hier het juiste instrument en niet een
-- echte aanroep als `anon`: het leest de ACL rechtstreeks, zonder dat de
-- test de functie daadwerkelijk hoeft uit te voeren (wat voor
-- `place_order`/`top_up` geld zou verplaatsen).

create extension if not exists pgtap with schema extensions;

begin;
select plan(38);

-- ── 1) Niets in public is uitvoerbaar zonder sessie ──────────────────────

select is(
  (select count(*)::integer
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'geen enkele functie in public is uitvoerbaar door de anon-rol'
);

-- PUBLIC apart van anon: een `revoke ... from anon` alleen zou de
-- PUBLIC-grant laten staan, en dan is anon nog steeds uitvoerbaar via
-- PUBLIC. Andersom net zo. Beide kanten hebben dus een eigen assertie.
select is(
  (select count(*)::integer
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and has_function_privilege('public', p.oid, 'EXECUTE')),
  0,
  'geen enkele functie in public is uitvoerbaar door PUBLIC'
);

-- ── 2) De geldpaden met naam en toenaam ──────────────────────────────────
--
-- Dit zijn de vier waar een sessieloze aanroep daadwerkelijk geld of
-- attributie raakt: place_order/top_up schrijven saldo, start_shift is het
-- enige echte authenticatiemoment in de bar-flow, end_shift sluit 'm af.

select ok(
  not has_function_privilege('anon', 'public.place_order(uuid,uuid,jsonb,uuid)', 'EXECUTE'),
  'place_order is niet aanroepbaar zonder sessie'
);

select ok(
  not has_function_privilege('anon', 'public.top_up(uuid,uuid,integer,text,uuid)', 'EXECUTE'),
  'top_up is niet aanroepbaar zonder sessie'
);

select ok(
  not has_function_privilege('anon', 'public.start_shift(uuid)', 'EXECUTE'),
  'start_shift is niet aanroepbaar zonder sessie'
);

select ok(
  not has_function_privilege('anon', 'public.end_shift(uuid)', 'EXECUTE'),
  'end_shift is niet aanroepbaar zonder sessie'
);

-- ── 3) De intrekking mag niet te ver gaan ────────────────────────────────
--
-- De keerzijde van bovenstaande: als de revoke per ongeluk ook
-- `authenticated` zou raken, valt de hele app om (elke hook in
-- src/hooks/queries/ roept een van deze aan) — en dat zou uit de
-- assertie's hierboven niet blijken. Vandaar beide richtingen.

select ok(
  has_function_privilege('authenticated', 'public.place_order(uuid,uuid,jsonb,uuid)', 'EXECUTE'),
  'place_order blijft aanroepbaar voor een ingelogde sessie'
);

select ok(
  has_function_privilege('authenticated', 'public.top_up(uuid,uuid,integer,text,uuid)', 'EXECUTE'),
  'top_up blijft aanroepbaar voor een ingelogde sessie'
);

select ok(
  has_function_privilege('authenticated', 'public.start_shift(uuid)', 'EXECUTE'),
  'start_shift blijft aanroepbaar voor een ingelogde sessie'
);

select ok(
  has_function_privilege('authenticated', 'public.list_members_admin()', 'EXECUTE'),
  'list_members_admin blijft aanroepbaar voor een ingelogde sessie'
);

-- De drie RLS-helpers uit 0015 zijn een geval apart: hun EXECUTE wordt niet
-- door applicatiecode gebruikt maar door de policy-expressies zelf, die met
-- de rechten van de aanroepende rol worden geëvalueerd. Zonder deze grant
-- faalt élke select op members/orders/order_lines/top_ups met "permission
-- denied for function caller_is_lid" — een stuk minder voor de hand liggend
-- dan een gewone RPC die niet meer werkt, dus expliciet vastgelegd.
select ok(
  has_function_privilege('authenticated', 'public.caller_is_lid()', 'EXECUTE'),
  'caller_is_lid blijft uitvoerbaar voor authenticated (nodig voor de RLS-policies uit 0015)'
);

-- Added for 0020_bestelling_terugdraaien.sql: both reversal RPCs move money.
select ok(
  not has_function_privilege('anon', 'public.reverse_order_at_bar(uuid,uuid,text,uuid)', 'EXECUTE'),
  'reverse_order_at_bar is niet aanroepbaar zonder sessie'
);

select ok(
  not has_function_privilege('anon', 'public.reverse_order_as_admin(uuid,text)', 'EXECUTE'),
  'reverse_order_as_admin is niet aanroepbaar zonder sessie'
);

select ok(
  has_function_privilege('authenticated', 'public.reverse_order_at_bar(uuid,uuid,text,uuid)', 'EXECUTE'),
  'reverse_order_at_bar blijft aanroepbaar voor een ingelogde sessie'
);

select ok(
  has_function_privilege('authenticated', 'public.reverse_order_as_admin(uuid,text)', 'EXECUTE'),
  'reverse_order_as_admin blijft aanroepbaar voor een ingelogde sessie'
);

-- Added for 0022_lid_account_koppelen.sql (#15, docs/features/portal-login.md):
-- named checks naast the blanket "geen enkele functie in public"-assertions
-- above (die dekken deze functie al automatisch, maar een falende run zou
-- daar alleen "er zijn er N te veel" tonen, niet wélke — vandaar ook hier
-- een benoemde check, zelfde stijl als list_members_admin/reverse_order_*).
select ok(
  not has_function_privilege('anon', 'public.link_lid_member_account()', 'EXECUTE'),
  'link_lid_member_account is niet aanroepbaar zonder sessie'
);

select ok(
  has_function_privilege('authenticated', 'public.link_lid_member_account()', 'EXECUTE'),
  'link_lid_member_account blijft aanroepbaar voor een ingelogde sessie'
);

-- Added for 0025_client_errors.sql (#94, docs/features/foutlogging.md,
-- ADR 0015): bewust géén anon-uitzondering — fouten van vóór het inloggen
-- worden niet gelogd. purge_client_errors() is voor niemand behalve de
-- eigenaar, ook niet voor authenticated.
select ok(
  not has_function_privilege('anon', 'public.log_client_error(text,text,text,text,integer,text)', 'EXECUTE'),
  'log_client_error is niet aanroepbaar zonder sessie'
);

select ok(
  has_function_privilege('authenticated', 'public.log_client_error(text,text,text,text,integer,text)', 'EXECUTE'),
  'log_client_error blijft aanroepbaar voor een ingelogde sessie'
);

select ok(
  not has_function_privilege('authenticated', 'public.purge_client_errors()', 'EXECUTE'),
  'purge_client_errors is niet aanroepbaar voor een ingelogde sessie'
);

-- purge_client_errors() ook benoemd voor anon, PUBLIC en service_role
-- (Tester, #94): 0025 trekt het voor alle vier expliciet in, en
-- service_role valt buiten de tellende asserties van sectie 1.
select ok(
  not has_function_privilege('anon', 'public.purge_client_errors()', 'EXECUTE'),
  'purge_client_errors is niet aanroepbaar zonder sessie'
);

select ok(
  not has_function_privilege('public', 'public.purge_client_errors()', 'EXECUTE'),
  'purge_client_errors is niet aanroepbaar via PUBLIC'
);

select ok(
  not has_function_privilege('service_role', 'public.purge_client_errors()', 'EXECUTE'),
  'purge_client_errors is niet aanroepbaar voor service_role (alleen de eigenaar via pg_cron)'
);

-- Added for 0027–0029 (dienst per sessie, docs/features/dienst-per-sessie.md,
-- ADR 0016). Drie soorten, elk met eigen assertie naast de tellende
-- asserties van sectie 1 (die dekken ze al, maar tonen alleen "er zijn er N te
-- veel"):
--   * interne functies (guards, helpers, cron-job): geen EXECUTE voor enige
--     API-rol;
--   * server-only functies voor de login vóór er een sessie is: alleen
--     service_role;
--   * RPC's voor een ingelogde sessie: authenticated, niet anon.
select ok(
  not exists (
    select 1
      from unnest(array[
        'public.bar_inactivity_limit()',
        'public.require_session(text[],boolean,boolean)',
        'public.require_bar_session()',
        'public.require_shift_session(uuid)',
        'public.require_beheer_session()',
        'public.end_shift_internal(uuid,text,uuid)',
        'public.notify_orphan_shift(uuid,uuid,text)',
        'public.close_bar_session_internal(uuid,text,uuid)',
        'public.end_member_bar_sessions(uuid,text)',
        'public.bar_pin_state(text,uuid)',
        'public.close_inactive_bar_sessions()',
        -- 0034/0035 (ADR 0017)
        'public.member_has_verified_factor(uuid)',
        'public.purge_login_throttle()'
      ]) as f(sig)
     where has_function_privilege('anon', f.sig, 'EXECUTE')
        or has_function_privilege('authenticated', f.sig, 'EXECUTE')
        or has_function_privilege('service_role', f.sig, 'EXECUTE')
  ),
  'de guards, interne helpers en de cron-job zijn voor geen enkele API-rol uitvoerbaar'
);

select ok(
  not exists (
    select 1
      from unnest(array[
        'public.verify_bar_pin(text,uuid,text)',
        'public.record_bar_password_login(text,uuid)',
        'public.bar_login_options(text,uuid)',
        'public.register_bar_session_server(uuid,uuid,uuid)',
        -- 0035/0036 (ADR 0017): de eigen loginlimiet, atomair
        'public.login_throttle_reserve(text[],text[])',
        'public.login_throttle_release(bigint[])'
      ]) as f(sig)
     where has_function_privilege('anon', f.sig, 'EXECUTE')
        or has_function_privilege('authenticated', f.sig, 'EXECUTE')
        or not has_function_privilege('service_role', f.sig, 'EXECUTE')
  ),
  'de login-functies vóór een sessie zijn alleen voor service_role uitvoerbaar (niet anon, niet authenticated)'
);

select ok(
  not exists (
    select 1
      from unnest(array[
        'public.register_bar_session(text)',
        'public.touch_bar_session()',
        'public.end_bar_session(boolean,text)',
        'public.my_bar_state()',
        'public.admin_end_shift(uuid)',
        'public.admin_take_over_shift(uuid)',
        'public.admin_end_bar_session(uuid)',
        'public.resume_orphan_shift(uuid)',
        'public.start_shift(uuid)'
      ]) as f(sig)
     where has_function_privilege('anon', f.sig, 'EXECUTE')
        or has_function_privilege('public', f.sig, 'EXECUTE')
        or not has_function_privilege('authenticated', f.sig, 'EXECUTE')
  ),
  'de sessie-RPC''s en start_shift zijn voor authenticated uitvoerbaar en niet voor anon of PUBLIC'
);

select ok(
  not has_function_privilege('anon', 'public.verify_bar_pin(text,uuid,text)', 'EXECUTE'),
  'verify_bar_pin is niet aanroepbaar zonder sessie (anders is de PIN brute-forcebaar met alleen de publieke key)'
);

select ok(
  not has_function_privilege('anon', 'public.my_bar_state()', 'EXECUTE'),
  'my_bar_state is niet aanroepbaar zonder sessie'
);

select ok(
  not has_function_privilege('anon', 'public.admin_take_over_shift(uuid)', 'EXECUTE'),
  'admin_take_over_shift is niet aanroepbaar zonder sessie'
);

select ok(
  not has_function_privilege('anon', 'public.admin_end_bar_session(uuid)', 'EXECUTE'),
  'admin_end_bar_session is niet aanroepbaar zonder sessie'
);

-- 0030: resume_orphan_shift, alleen voor authenticated.
select ok(
  not has_function_privilege('anon', 'public.resume_orphan_shift(uuid)', 'EXECUTE'),
  'resume_orphan_shift is niet aanroepbaar zonder sessie (anon)'
);
select ok(
  not has_function_privilege('public', 'public.resume_orphan_shift(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.resume_orphan_shift(uuid)', 'EXECUTE'),
  'resume_orphan_shift: EXECUTE ingetrokken voor PUBLIC, alleen authenticated mag'
);

-- De beheer-RPC's uit 0029 (`create or replace`) behouden hun grants.
select ok(
  not exists (
    select 1
      from unnest(array[
        'public.create_product(text,text,integer)',
        'public.update_product_price(uuid,integer)',
        'public.set_product_archived(uuid,boolean)',
        'public.update_negative_limit(integer)',
        'public.create_member(text,integer,text)',
        'public.update_member_name(uuid,text)',
        'public.set_member_archived(uuid,boolean)',
        'public.set_member_role(uuid,text)',
        'public.update_member_email(uuid,text)',
        'public.mark_member_invite_sent(uuid)',
        'public.list_members_admin()',
        'public.create_activity_type(text)',
        'public.update_activity_type_name(uuid,text)',
        'public.set_activity_type_archived(uuid,boolean)',
        'public.reverse_order_as_admin(uuid,text)'
      ]) as f(sig)
     where has_function_privilege('anon', f.sig, 'EXECUTE')
        or has_function_privilege('public', f.sig, 'EXECUTE')
        or not has_function_privilege('authenticated', f.sig, 'EXECUTE')
  ),
  'de beheer-RPC''s zijn na 0029 nog steeds voor authenticated uitvoerbaar en niet voor anon of PUBLIC'
);

select ok(
  has_function_privilege('authenticated', 'public.set_own_pin(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_own_pin(text)', 'EXECUTE'),
  'set_own_pin blijft een RPC voor een ingelogde sessie (de portal)'
);

-- 0031: check_beheer_session, de controle vooraf van de invite-route.
select ok(
  not has_function_privilege('anon', 'public.check_beheer_session()', 'EXECUTE')
  and not has_function_privilege('public', 'public.check_beheer_session()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.check_beheer_session()', 'EXECUTE'),
  'check_beheer_session: EXECUTE ingetrokken voor PUBLIC en anon, alleen authenticated mag'
);

-- 0034 (ADR 0017): bar_login_options is opnieuw aangemaakt (extra kolom
-- pin_needs_mfa) en krijgt zijn grants opnieuw; member_has_verified_factor is
-- een interne helper.
select ok(
  not has_function_privilege('public', 'public.bar_login_options(text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.bar_login_options(text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.bar_login_options(text,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.bar_login_options(text,uuid)', 'EXECUTE'),
  'bar_login_options (0034): alleen service_role, niet PUBLIC, anon of authenticated'
);

-- 0036 (ADR 0017, besloten 5): de atomaire throttle-functies alleen voor de
-- server; de oude, niet-atomaire van 0035 bestaan niet meer.
select ok(
  not has_function_privilege('public', 'public.login_throttle_reserve(text[],text[])', 'EXECUTE')
  and not has_function_privilege('public', 'public.login_throttle_release(bigint[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.login_throttle_reserve(text[],text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.login_throttle_release(bigint[])', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.login_throttle_reserve(text[],text[])', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.login_throttle_release(bigint[])', 'EXECUTE')
  and to_regprocedure('public.login_throttle_allowed(text,text)') is null
  and to_regprocedure('public.login_throttle_record(text,text)') is null,
  'login_throttle_reserve/release (0036): niet voor PUBLIC, anon of authenticated; allowed/record weg'
);

select ok(
  to_regprocedure('public.start_shift(uuid,text,uuid)') is null,
  'de oude start_shift met PIN bestaat niet meer'
);

select * from finish();
rollback;
