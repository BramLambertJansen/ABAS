-- Client-fouten centraal loggen (#94, docs/features/foutlogging.md). Zie
-- docs/adr/0012-client-fouten-via-rpc-zonder-actor.md voor waarom dit een
-- schrijf-RPC is die open staat voor elke `authenticated` (ook een lid),
-- bewust zonder actor, en bewust zonder `anon`-uitzondering op 0018.
--
-- Sinds #93 toont elke lees-hook een korte foutcode op het scherm, maar de
-- ruwe fout ging alleen naar `console.error` — en op een bar-tablet kijkt
-- niemand in die console. Deze tabel maakt een fout terug te vinden zonder
-- dat iemand hem meldt: welke hook, welke code, welke build, wanneer.
-- Lezen gebeurt alleen via Supabase Studio (postgres-rol, buiten RLS); er is
-- geen leesscherm en geen lees-RPC (spec → beslissing 7).
--
-- Restrisico dat de spec benoemt: de log deelt het foutdomein met Supabase.
-- Een totale storing, of een ontbrekende migratie van déze tabel, wordt niet
-- gelogd; een #67-achtige fout in een andere tabel of functie wel.

-- ── Tabel ────────────────────────────────────────────────────────────────
--
-- Alleen allowlist-velden, elk met een strak formaat, zodat er ook via een
-- directe RPC-aanroep geen e-mailadres, bedrag of id in kan. Bewust géén
-- kolom voor auth.uid(), member-id, naam, e-mail, saldo, RPC-argumenten,
-- message/details/hint, stack, IP of user-agent (spec → Datamodel,
-- beslissing 2). `usePortal*` in `hook` impliceert de portal; geen aparte
-- shell-kolom.
--
-- `code`: zelfde vorm als SAFE_CODE_RE in src/lib/loadErrors.ts — Postgres
-- SQLSTATE (5 tekens) of PostgREST (`PGRST` + 3 cijfers).
-- `path`: geen cijfers, `@` of `.` — geen app-route heeft een dynamisch
-- segment met een id, dus een pad met cijfers is geen pad uit deze app.
-- `build`: de Git-SHA uit NEXT_PUBLIC_BUILD_SHA (next.config.mjs), `null`
-- lokaal/CI.
create table client_errors (
  id bigint generated always as identity primary key,
  -- Servertijd, niet de klok van de tablet.
  created_at timestamptz not null default now(),
  hook text not null check (hook ~ '^use[A-Za-z]{1,60}$'),
  kind text not null check (kind in ('network', 'server')),
  code text check (code ~ '^([0-9A-Z]{5}|PGRST[0-9]{3})$'),
  path text not null check (path ~ '^/[a-z/-]{0,100}$'),
  occurrences integer not null check (occurrences between 1 and 10000),
  build text check (build ~ '^[0-9a-f]{7,40}$')
);

comment on table client_errors is
  'Onverwachte client-fouten uit src/hooks/queries/ (docs/features/foutlogging.md, ADR 0012). Append-only, alleen via log_client_error(); lezen alleen via Studio. Geen actor, geen vrij tekstveld. Rijen ouder dan 90 dagen ruimt purge_client_errors() dagelijks op (pg_cron).';

-- Voor de dagelijkse opruiming (created_at < now() - 90 dagen) en voor
-- "wat ging er gisteravond mis" in Studio.
create index client_errors_created_at_idx on client_errors (created_at);

-- Zelfde patroon als de geldtabellen: RLS aan, géén policies, en de
-- tabelrechten expliciet ingetrokken. Schrijven kan alleen via de
-- SECURITY DEFINER-RPC hieronder; lezen alleen als postgres (Studio).
alter table client_errors enable row level security;
revoke all on client_errors from authenticated, anon;

-- ── RPC: log_client_error ────────────────────────────────────────────────
--
-- Valideert alle grenzen van de tabel zelf: de client kapt ook af, maar de
-- RPC is de waarheid. Ongeldige invoer geeft één vaste code
-- (`invalid_client_error`), die src/lib/clientErrors.ts negeert — geen
-- per-veld-foutcode, want niemand handelt die af.
--
-- Bewust géén caller_is_lid()-weigering (anders dan 0023): een portal-lid
-- moet zijn leesfout kunnen melden. Geen bar-RPC, geen geld, en `void`
-- lekt niets terug. Bewust géén auth.uid() in de insert (ADR 0012).
create or replace function log_client_error(
  p_hook text,
  p_kind text,
  p_code text,
  p_path text,
  p_occurrences integer,
  p_build text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_hook is null or p_hook !~ '^use[A-Za-z]{1,60}$'
     or p_kind is null or p_kind not in ('network', 'server')
     or (p_code is not null and p_code !~ '^([0-9A-Z]{5}|PGRST[0-9]{3})$')
     or p_path is null or p_path !~ '^/[a-z/-]{0,100}$'
     or p_occurrences is null or p_occurrences not between 1 and 10000
     or (p_build is not null and p_build !~ '^[0-9a-f]{7,40}$')
  then
    raise exception 'invalid_client_error' using errcode = 'P0001';
  end if;

  insert into client_errors (hook, kind, code, path, occurrences, build)
  values (p_hook, p_kind, p_code, p_path, p_occurrences, p_build);
end;
$$;

comment on function log_client_error(text, text, text, text, integer, text) is
  'Schrijft één client-fout in client_errors (docs/features/foutlogging.md, ADR 0012). Voor elke authenticated sessie, ook een lid; slaat geen actor op. Ongeldige invoer: invalid_client_error.';

-- Alleen voor een ingelogde sessie, zelfde patroon als elke RPC sinds 0018:
-- een nieuwe functie krijgt van Postgres standaard EXECUTE voor PUBLIC (en
-- via Supabase's default privileges voor anon). Bewust géén
-- anon-uitzondering: fouten van vóór het inloggen worden niet gelogd
-- (ADR 0012). supabase/tests/rpc_execute_grants.test.sql bewaakt dit.
grant execute on function log_client_error(text, text, text, text, integer, text) to authenticated;
revoke execute on function log_client_error(text, text, text, text, integer, text) from public;
revoke execute on function log_client_error(text, text, text, text, integer, text) from anon;

-- ── Retentie: 90 dagen, via pg_cron ──────────────────────────────────────
--
-- Automatisch, omdat handmatig opruimen bij een vrijwilligersclub er niet
-- van komt (spec → beslissing 6). Eerste gebruik van pg_cron in deze
-- codebase. De opruimlogica zit in een eigen functie in plaats van als
-- losse SQL-tekst in de job, zodat supabase/tests/client_errors.test.sql
-- hem direct kan uitvoeren en de job-definitie niets los te typen heeft.
create or replace function purge_client_errors()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from client_errors where created_at < now() - interval '90 days';
end;
$$;

comment on function purge_client_errors() is
  'Verwijdert client_errors-rijen ouder dan 90 dagen. Alleen voor de eigenaar (pg_cron-job purge_client_errors); geen EXECUTE voor enige API-rol.';

-- EXECUTE voor niemand behalve de eigenaar: ook niet voor authenticated of
-- service_role (Supabase's default privileges geven die beide anders
-- automatisch). De cron-job draait als de eigenaar.
revoke execute on function purge_client_errors() from public;
revoke execute on function purge_client_errors() from anon;
revoke execute on function purge_client_errors() from authenticated;
revoke execute on function purge_client_errors() from service_role;

create extension if not exists pg_cron;

-- Dagelijks om 03:00 (pg_cron rekent in UTC): buiten elke bardienst. Met
-- een jobnaam, zodat een herhaalde `cron.schedule` de job bijwerkt in
-- plaats van een tweede aan te maken.
select cron.schedule(
  'purge_client_errors',
  '0 3 * * *',
  'select purge_client_errors()'
);
