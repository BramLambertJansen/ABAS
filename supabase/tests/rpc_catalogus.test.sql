-- Gate: elke functie in `public` is bewust ingedeeld, en de indeling klopt
-- met de rechten en de guards. Run met `npm run db:test`.
--
-- Vervangt twee regels die tot 2026-10-01 in CLAUDE.md stonden en die geen
-- script controleerde:
--
--   * "interne functies (verify_bar_pin, de guards, de cron-job) zijn voor
--     geen enkele API-rol uitvoerbaar, of alleen voor service_role";
--   * "die RPC's eisen daarbovenop een geregistreerde bar-sessie" — elke
--     RPC die de client mag aanroepen loopt via een `require_*`-guard.
--
-- Werkt op de catalogus, niet op een handgetypte lijst van "wat er nu is":
-- een functie die morgen bij komt en in geen van de drie lijsten hieronder
-- staat, laat test 1 falen. De fix is dan een bewuste keuze in welke lijst
-- ze hoort — en daarmee welke rechten en welke guard ze moet hebben.
--
-- `rpc_execute_grants.test.sql` dekt anon/PUBLIC al voor álle functies;
-- dit bestand gaat over `authenticated` en `service_role`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

create temp table catalogus (naam text primary key, klasse text not null,
  guardvrij_omdat text) on commit drop;

-- ── De indeling ──────────────────────────────────────────────────────────
--
-- client:  uitvoerbaar voor `authenticated` (de app roept ze aan, of een
--          RLS-policy evalueert ze met de rechten van de aanroeper).
-- server:  alleen `service_role` — server-side code in src/lib/ met de
--          service-role-client (bar-login, rate limit).
-- intern:  geen enkele API-rol; alleen aanroepbaar vanuit andere functies
--          of de cron-job.
--
-- `guardvrij_omdat` is alleen voor client-functies die géén `require_*`
-- aanroepen, en zegt waarom dat mag. Een nieuwe uitzondering hoort bij
-- review uitgelegd te worden, niet hier stilletjes bijgeschreven.
insert into catalogus values
  -- client, met guard
  ('add_shift_member',          'client', null),
  ('admin_end_bar_session',     'client', null),
  ('admin_end_shift',           'client', null),
  ('admin_take_over_shift',     'client', null),
  ('check_beheer_session',      'client', null),
  ('create_activity_type',      'client', null),
  ('create_member',             'client', null),
  ('create_product',            'client', null),
  ('end_bar_session',           'client', null),
  ('end_shift',                 'client', null),
  ('list_members_admin',        'client', null),
  ('mark_member_invite_sent',   'client', null),
  ('place_order',               'client', null),
  ('remove_shift_member',       'client', null),
  ('resume_orphan_shift',       'client', null),
  ('reverse_order_as_admin',    'client', null),
  ('reverse_order_at_bar',      'client', null),
  ('set_activity_type_archived','client', null),
  ('set_member_archived',       'client', null),
  ('set_member_role',           'client', null),
  ('set_product_archived',      'client', null),
  ('set_product_image',         'client', null),
  ('start_shift',               'client', null),
  ('top_up',                    'client', null),
  ('touch_bar_session',         'client', null),
  ('update_activity_type_name', 'client', null),
  ('update_member_email',       'client', null),
  ('update_member_name',        'client', null),
  ('update_negative_limit',     'client', null),
  ('update_product_price',      'client', null),
  -- client, zonder guard
  ('caller_is_lid',             'client', 'RLS-helper: zegt alleen iets over de aanroeper zelf'),
  ('caller_member_id',          'client', 'RLS-helper: zegt alleen iets over de aanroeper zelf'),
  ('caller_owns_order',         'client', 'RLS-helper: zegt alleen iets over de aanroeper zelf'),
  ('is_shift_member',           'client', 'RLS-helper voor shift_members'),
  ('link_invited_member_account','client','portal: koppelt de eigen auth-user op het eigen e-mailadres'),
  ('link_lid_member_account',   'client', 'portal: koppelt de eigen auth-user op het eigen e-mailadres'),
  ('list_own_transactions',     'client', 'portal: alleen eigen rijen, via caller_member_id'),
  ('log_client_error',          'client', 'foutlogging: elke sessie, geen data van anderen'),
  ('my_bar_state',              'client', 'leest de eigen bar-sessie; geen sessie = lege toestand'),
  ('register_bar_session',      'client', 'maakt de sessie aan die de guards daarna eisen; controleert zelf aal2 voor beheer'),
  ('set_own_pin',               'client', 'portal: eigen PIN, weigert een bar-sessie zelf (wrong_mode)'),
  ('update_own_name',           'client', 'portal: eigen naam'),
  -- server
  ('bar_login_options',         'server', null),
  ('login_throttle_release',    'server', null),
  ('login_throttle_reserve',    'server', null),
  ('record_bar_password_login', 'server', null),
  ('register_bar_session_server','server', null),
  ('verify_bar_pin',            'server', null),
  -- intern
  ('bar_inactivity_limit',      'intern', null),
  ('bar_pin_state',             'intern', null),
  ('close_bar_session_internal','intern', null),
  ('close_inactive_bar_sessions','intern', null),
  ('end_member_bar_sessions',   'intern', null),
  ('end_shift_internal',        'intern', null),
  ('forbid_api_role_truncate',  'intern', null),  -- 0039: BEFORE TRUNCATE-guard op storage (ADR 0019)
  ('member_has_verified_factor','intern', null),
  ('notify_orphan_shift',       'intern', null),
  ('purge_client_errors',       'intern', null),
  ('purge_login_throttle',      'intern', null),
  ('require_bar_session',       'intern', null),
  ('require_beheer_session',    'intern', null),
  ('require_session',           'intern', null),
  ('require_shift_session',     'intern', null);

create temp view functies as
  select p.oid, p.proname as naam, p.prosecdef, p.proconfig, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     -- pgTAP zelf staat in extensions, maar voor de zekerheid:
     and not exists (select 1 from pg_depend d
                      where d.objid = p.oid and d.deptype = 'e');

-- ── 1) Niets ongeclassificeerd, niets verouderd ─────────────────────────

select is(
  (select coalesce(array_agg(naam order by naam), '{}') from functies
    where naam not in (select naam from catalogus)),
  '{}'::name[],
  'elke functie in public staat in de catalogus (nieuwe functie: kies client, server of intern)'
);

select is(
  (select coalesce(array_agg(naam order by naam), '{}') from catalogus
    where naam not in (select naam from functies)),
  '{}'::text[],
  'de catalogus noemt geen functies die niet (meer) bestaan'
);

-- ── 2) Rechten volgen de klasse ──────────────────────────────────────────

select is(
  (select coalesce(array_agg(f.naam order by f.naam), '{}') from functies f
     join catalogus c using (naam)
    where c.klasse = 'client'
      and not has_function_privilege('authenticated', f.oid, 'EXECUTE')),
  '{}'::name[],
  'elke client-functie is uitvoerbaar voor authenticated'
);

select is(
  (select coalesce(array_agg(f.naam order by f.naam), '{}') from functies f
     join catalogus c using (naam)
    where c.klasse in ('server', 'intern')
      and has_function_privilege('authenticated', f.oid, 'EXECUTE')),
  '{}'::name[],
  'geen server- of interne functie is uitvoerbaar voor authenticated'
);

select is(
  (select coalesce(array_agg(f.naam order by f.naam), '{}') from functies f
     join catalogus c using (naam)
    where (c.klasse = 'server') <> has_function_privilege('service_role', f.oid, 'EXECUTE')
      and c.klasse in ('server', 'intern')),
  '{}'::name[],
  'server-functies zijn uitvoerbaar voor service_role, interne functies niet'
);

-- ── 3) Elke client-RPC loopt via een guard ───────────────────────────────
--
-- Leest de functietekst: een aanroep van require_session, require_bar_session,
-- require_shift_session of require_beheer_session. Zegt niets over wát de
-- guard toetst — dat bewijzen de negatieve tests per RPC — alleen dat er
-- één is.

select is(
  (select coalesce(array_agg(f.naam order by f.naam), '{}') from functies f
     join catalogus c using (naam)
    where c.klasse = 'client'
      and c.guardvrij_omdat is null
      and f.prosrc !~ '\mrequire_(session|bar_session|shift_session|beheer_session)\s*\('),
  '{}'::name[],
  'elke client-functie roept een require_*-guard aan, of staat met reden als guardvrij in de catalogus'
);

-- ── 4) security definer zonder vaste search_path is een lek ──────────────

select is(
  (select coalesce(array_agg(naam order by naam), '{}') from functies
    where prosecdef
      and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c
                       where c like 'search_path=%')),
  '{}'::name[],
  'elke security definer-functie zet een eigen search_path'
);

select * from finish();
rollback;
