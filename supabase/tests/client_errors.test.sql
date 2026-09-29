-- Negatieve tests voor 0025_client_errors.sql (#94,
-- docs/features/foutlogging.md → Tests en gates, ADR 0015). Run met
-- `npm run db:test` (= `supabase test db`, vereist `supabase start` /
-- Docker lokaal).
--
-- Draait voor de rechten-assertions als `authenticated` (niet als
-- superuser), zelfde vorm als rls_write_protection.test.sql en
-- bar_rpcs_weigeren_lid.test.sql: zo loopt elke aanroep door dezelfde
-- tabel- en EXECUTE-grants als een echte sessie. Fixtures en de
-- retentietest draaien als superuser (de eigenaar), die als enige
-- purge_client_errors() mag uitvoeren.
--
-- Wat dit bewijst:
--   1. `authenticated` kan client_errors niet lezen of direct beschrijven;
--   2. log_client_error weigert elk veld buiten het formaat, zodat er geen
--      e-mailadres, bedrag of id in kan;
--   3. een lid-sessie kán melden (bewust anders dan 0023) en er wordt geen
--      uid opgeslagen;
--   4. retentie: 91 dagen oud gaat weg, 89 dagen blijft; er is precies één
--      cron-job met het verwachte schema; `authenticated` kan de opruiming
--      niet zelf uitvoeren.
-- `anon` zonder EXECUTE staat in rpc_execute_grants.test.sql.

create extension if not exists pgtap with schema extensions;

begin;
select plan(60);

-- ── Fixtures (als superuser) ─────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000006a0', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'client-errors-lid@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-0000000006b0', 'Client-errors Lid', 'lid', null, 1000, false,
   '00000000-0000-0000-0000-0000000006a0');

-- Leeg beginnen, zodat de tellingen hieronder alleen over deze test gaan.
delete from client_errors;

-- ── 1) Geen directe toegang voor authenticated ───────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006a0', true);
set local role authenticated;

select throws_ok(
  $$ select * from client_errors $$,
  '42501', 'permission denied for table client_errors',
  'select op client_errors is geblokkeerd voor authenticated'
);

select throws_ok(
  $$ insert into client_errors (hook, kind, path, occurrences)
     values ('useMembers', 'server', '/', 1) $$,
  '42501', 'permission denied for table client_errors',
  'insert op client_errors is geblokkeerd voor authenticated (alleen via log_client_error)'
);

select throws_ok(
  $$ update client_errors set occurrences = 1 $$,
  '42501', 'permission denied for table client_errors',
  'update op client_errors is geblokkeerd voor authenticated'
);

select throws_ok(
  $$ delete from client_errors $$,
  '42501', 'permission denied for table client_errors',
  'delete op client_errors is geblokkeerd voor authenticated'
);

-- ── 2) Een lid-sessie kán melden ─────────────────────────────────────────
--
-- Bewust anders dan 0023 (bar-RPC's weigeren een lid): een portal-lid moet
-- zijn leesfout kunnen melden.

select lives_ok(
  $$ select log_client_error('usePortalBalance', 'server', '42P01', '/portal', 1, null) $$,
  'een lid-sessie kan een fout melden'
);

select lives_ok(
  $$ select log_client_error('useMembers', 'network', null, '/', 3,
                             '0123456789abcdef0123456789abcdef01234567') $$,
  'code null en een volledige 40-tekens-SHA als build zijn geldig'
);

select lives_ok(
  $$ select log_client_error('useAlleLeden', 'server', 'PGRST200', '/beheer/leden', 10000, 'abc1234') $$,
  'PostgREST-code, pad met slash, occurrences 10000 en een korte SHA zijn geldig'
);

-- ── 3) Ongeldige invoer wordt geweigerd ──────────────────────────────────

-- kind
select throws_ok(
  $$ select log_client_error('useMembers', 'other', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een onbekende kind wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', null, null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'kind null wordt geweigerd'
);

-- code
select throws_ok(
  $$ select log_client_error('useMembers', 'server', 'jan@example.com', '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een code die geen SQLSTATE/PostgREST-code is (bv. een e-mailadres) wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', '42p01', '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een code met kleine letters wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', 'PGRST2000', '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een te lange PostgREST-code wordt geweigerd'
);

-- hook
select throws_ok(
  $$ select log_client_error('fetchMembers', 'server', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een hook zonder use-prefix wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useSaldo1250', 'server', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een hook met cijfers (bv. een bedrag) wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('use' || repeat('A', 61), 'server', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een hook langer dan use + 60 letters wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error(null, 'server', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'hook null wordt geweigerd'
);

-- occurrences
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', 0, null) $$,
  'P0001', 'invalid_client_error',
  'occurrences 0 wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', 10001, null) $$,
  'P0001', 'invalid_client_error',
  'occurrences boven 10000 wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', null, null) $$,
  'P0001', 'invalid_client_error',
  'occurrences null wordt geweigerd'
);

-- path
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/beheer/leden/123', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een path met cijfers wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/jan@example', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een path met @ wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/jan.example', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een path met . wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/portal?email=x', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een path met query-string wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, 'portal', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een path zonder leidende slash wordt geweigerd'
);

-- build
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', 1, 'not-a-sha') $$,
  'P0001', 'invalid_client_error',
  'een build die geen hex is wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', 1, 'ABC1234') $$,
  'P0001', 'invalid_client_error',
  'een build met hoofdletters wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', 1, 'abc12') $$,
  'P0001', 'invalid_client_error',
  'een build korter dan 7 tekens wordt geweigerd'
);

-- Aanvullende grensgevallen (Tester, #94): de regexen zijn verankerd en
-- hoofdlettergevoelig; een lege string is geen `null`.
select throws_ok(
  $$ select log_client_error('useMembers', 'Network', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'kind is hoofdlettergevoelig (Network wordt geweigerd)'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', '', '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een lege code wordt geweigerd (alleen null betekent geen code)'
);
select throws_ok(
  $$ select log_client_error('use', 'server', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een hook die alleen uit use bestaat wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('use Members', 'server', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een hook met een spatie wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('use_members', 'server', null, '/', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een hook met een underscore wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', -1, null) $$,
  'P0001', 'invalid_client_error',
  'negatieve occurrences wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/Portal', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een path met hoofdletters wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/beheer/leden#jan', 1, null) $$,
  'P0001', 'invalid_client_error',
  'een path met fragment wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/' || repeat('a', 101), 1, null) $$,
  'P0001', 'invalid_client_error',
  'een path langer dan 101 tekens wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, null, 1, null) $$,
  'P0001', 'invalid_client_error',
  'path null wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', 1, repeat('a', 41)) $$,
  'P0001', 'invalid_client_error',
  'een build langer dan 40 tekens wordt geweigerd'
);
select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', 1, '') $$,
  'P0001', 'invalid_client_error',
  'een lege build wordt geweigerd (alleen null betekent geen build)'
);

-- Een lid dat net gemeld heeft kan zijn eigen melding niet teruglezen.
select throws_ok(
  $$ select count(*) from client_errors where hook = 'usePortalBalance' $$,
  '42501', 'permission denied for table client_errors',
  'een lid-sessie kan na het melden de rij niet teruglezen'
);

-- ── 4) Er wordt geen uid opgeslagen ──────────────────────────────────────

-- Opruimen alleen door de eigenaar.
select throws_ok(
  $$ select purge_client_errors() $$,
  '42501', 'permission denied for function purge_client_errors',
  'authenticated kan purge_client_errors niet uitvoeren'
);

reset role;

select is(
  (select count(*)::integer from client_errors),
  3,
  'precies de drie geldige meldingen staan in client_errors, geen van de geweigerde'
);

-- Twee kanten: de kolommen zijn exact de allowlist (dus geen uid-, member-
-- of message-kolom), en de uid van de meldende sessie komt in geen enkel
-- veld van de opgeslagen rijen voor.
select is(
  (select array_agg(column_name::text order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'client_errors'),
  array['id', 'created_at', 'hook', 'kind', 'code', 'path', 'occurrences', 'build'],
  'client_errors heeft alleen de allowlist-kolommen (geen actor, geen message)'
);

select is(
  (select count(*)::integer from client_errors c
    where to_jsonb(c)::text like '%00000000-0000-0000-0000-0000000006a0%'
       or to_jsonb(c)::text like '%00000000-0000-0000-0000-0000000006b0%'),
  0,
  'de auth-uid en member-id van de meldende sessie worden niet opgeslagen'
);

-- Catalogus (Tester, #94): geen policies (dus ook geen die later per
-- ongeluk iets toelaat), RLS aan, en de RPC is een SECURITY DEFINER met
-- vaste search_path. Geen trigger die er stilletjes iets bij schrijft.
select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'client_errors'),
  0,
  'client_errors heeft geen enkele RLS-policy'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.client_errors'::regclass),
  'RLS staat aan op client_errors'
);

select is(
  (select count(*)::integer from pg_trigger
    where tgrelid = 'public.client_errors'::regclass and not tgisinternal),
  0,
  'client_errors heeft geen triggers'
);

select ok(
  (select prosecdef and proconfig @> array['search_path=public']
     from pg_proc
    where oid = 'public.log_client_error(text,text,text,text,integer,text)'::regprocedure),
  'log_client_error is security definer met search_path=public'
);

select is(
  (select count(*)::integer from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'client_errors'
      and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0,
  'anon, authenticated en PUBLIC hebben geen enkel tabelrecht op client_errors'
);

-- De check-constraints op de tabel zelf, los van de RPC: een tweede
-- schrijver (bv. later een server-side logger) kan het formaat niet
-- omzeilen. Als superuser, dus buiten RLS en grants.
select throws_ok(
  $$ insert into client_errors (hook, kind, path, occurrences)
     values ('useMembers', 'server', '/beheer/leden/123', 1) $$,
  '23514', null,
  'de check-constraint weigert een path met cijfers ook bij een directe insert'
);

select throws_ok(
  $$ insert into client_errors (hook, kind, code, path, occurrences)
     values ('useMembers', 'server', 'jan@example.com', '/', 1) $$,
  '23514', null,
  'de check-constraint weigert een vrije-tekst-code ook bij een directe insert'
);

select throws_ok(
  $$ insert into client_errors (hook, kind, path, occurrences)
     values ('useMembers', 'server', '/', 10001) $$,
  '23514', null,
  'de check-constraint weigert occurrences boven 10000 ook bij een directe insert'
);

-- ── 4b) Geen toegang zonder sessie (anon) ────────────────────────────────
--
-- rpc_execute_grants.test.sql leest de ACL; hier een echte aanroep als
-- anon, zodat ook een grant via een andere weg (rol-lidmaatschap) opvalt.

set local role anon;

select throws_ok(
  $$ select * from client_errors $$,
  '42501', 'permission denied for table client_errors',
  'select op client_errors is geblokkeerd voor anon'
);

select throws_ok(
  $$ insert into client_errors (hook, kind, path, occurrences)
     values ('useMembers', 'server', '/', 1) $$,
  '42501', 'permission denied for table client_errors',
  'insert op client_errors is geblokkeerd voor anon'
);

select throws_ok(
  $$ select log_client_error('useMembers', 'server', null, '/', 1, null) $$,
  '42501', 'permission denied for function log_client_error',
  'anon kan log_client_error niet aanroepen'
);

select throws_ok(
  $$ select purge_client_errors() $$,
  '42501', 'permission denied for function purge_client_errors',
  'anon kan purge_client_errors niet uitvoeren'
);

reset role;

select is(
  (select count(*)::integer from client_errors),
  3,
  'na de geweigerde anon-pogingen staan er nog steeds precies drie rijen'
);

-- ── 5) Retentie: 90 dagen ────────────────────────────────────────────────

delete from client_errors;
insert into client_errors (created_at, hook, kind, code, path, occurrences, build) values
  (now() - interval '91 days', 'useMembers', 'server', null, '/', 1, null),
  (now() - interval '89 days', 'useProducts', 'server', null, '/', 1, null);

select purge_client_errors();

select is(
  (select array_agg(hook order by hook) from client_errors),
  array['useProducts'],
  'purge_client_errors verwijdert een rij van 91 dagen oud en laat een van 89 dagen staan'
);

select is(
  (select count(*)::integer from cron.job
    where command = 'select purge_client_errors()'
      and schedule = '0 3 * * *'
      and jobname = 'purge_client_errors'),
  1,
  'cron.job bevat de dagelijkse purge_client_errors-job met het verwachte schema'
);

select is(
  (select count(*)::integer from cron.job where command ilike '%purge_client_errors%'),
  1,
  'cron.job bevat precies één job voor purge_client_errors'
);

select * from finish();
rollback;
