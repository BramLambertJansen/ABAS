-- Gate: leespolicies zijn een allowlist (ADR 0019,
-- docs/features/leespolicies-allowlist.md → keuze 5). Run met
-- `npm run db:test`.
--
-- "Brede leestoegang alleen voor een actieve bar-rol" is een regel die bij
-- elke nieuwe tabel terugkomt. Volgens CLAUDE.md → "Regel over regels" hoort
-- hij in een gate en niet in CLAUDE.md. Deze test leest de werkelijke
-- policy-expressies uit `pg_policies` (zoals Postgres ze na alle migraties
-- kent), geen regex over migratiebestanden waarin de oude denylist-vorm
-- historisch blijft staan.
--
--   1. Geen enkele leespolicy heeft een denylist-tak (`not caller_…()`): dat
--      was de vorm uit 0015/0020 die elk account zonder gekoppeld lid alles
--      liet lezen.
--   2. De tabellen met een `using (true)`-leespolicy zijn exact de globale
--      tabellen (ADR 0019, keuze 6). Een nieuwe tabel met `using (true)` laat
--      deze test falen; is hij echt globaal, zet hem dan hieronder op de
--      lijst, met reden.
--   3. De vijf tabellen met namen of bedragen per lid hebben in elke
--      leespolicy de allowlist-helper `caller_has_bar_role()`. Vangt een
--      latere migratie die er één terugzet naar `true` of een andere vorm.
--   4. Elke leespolicy die niet `using (true)` is, bevat de sessiehelper
--      `caller_session_alive()` (ADR 0022 → Beslissing 2): een token van een
--      beëindigde Auth-sessie leest niets meer. Een nieuwe tabel krijgt de
--      vorm `using ((select caller_session_alive()) and (<expressie>))`. Dat
--      het een conjunctie is en geen `or`-tak, bewijzen de gedragstests in
--      sessie_na_afmelden.test.sql (blok 2).

create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

select is_empty(
  $$
    select tablename || '.' || policyname
      from pg_policies
     where schemaname = 'public'
       and cmd in ('SELECT', 'ALL')
       and qual ~* '\mNOT\s+caller_'
  $$,
  'geen leespolicy met een denylist-tak (ADR 0019)'
);

-- Globaal, met reden (ADR 0007 → Reikwijdte, ADR 0019 → keuze 6): geen
-- namen of bedragen per lid. shifts/shift_members bevatten alleen uuid's
-- en tijdstippen, die zonder members niets over een persoon zeggen;
-- products, app_settings en activity_types zijn verenigingsbrede
-- instellingen en assortiment.
select set_eq(
  $$
    select distinct tablename::text
      from pg_policies
     where schemaname = 'public'
       and cmd in ('SELECT', 'ALL')
       and qual = 'true'
  $$,
  array['activity_types', 'app_settings', 'products', 'shift_members', 'shifts'],
  'nieuwe tabel met using (true): is hij echt globaal? Zo ja, zet hem hier op de lijst, met reden (ADR 0019)'
);

select set_eq(
  $$
    select tablename::text
      from pg_policies
     where schemaname = 'public'
       and cmd in ('SELECT', 'ALL')
       and tablename in ('members', 'orders', 'order_lines', 'top_ups', 'order_reversals')
     group by tablename
    having bool_and(qual like '%caller_has_bar_role()%')
  $$,
  array['members', 'orders', 'order_lines', 'top_ups', 'order_reversals'],
  'elke leespolicy op members/orders/order_lines/top_ups/order_reversals gaat via caller_has_bar_role() (ADR 0019)'
);

select is_empty(
  $$
    select tablename || '.' || policyname
      from pg_policies
     where schemaname = 'public'
       and cmd in ('SELECT', 'ALL')
       and qual <> 'true'
       and qual not like '%caller_session_alive()%'
  $$,
  'elke leespolicy die niet using (true) is, eist een levende Auth-sessie via caller_session_alive() (ADR 0022)'
);

select * from finish();
rollback;
