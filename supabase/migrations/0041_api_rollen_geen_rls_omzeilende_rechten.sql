-- API-rollen krijgen geen tabelrechten die RLS omzeilen
-- (docs/features/tabelrechten-api-rollen.md, Bram 2026-10-02; ADR 0022).
--
-- De standaardrechten van Supabase geven elke nieuwe tabel `arwdDxt` voor
-- `anon`, `authenticated` en `service_role`. Onze migraties trokken
-- `insert, update, delete` in en soms `select`, maar TRUNCATE (`D`),
-- REFERENCES (`x`) en TRIGGER (`t`) bijna nooit (alleen 0027). TRUNCATE
-- leegt een tabel zonder RLS en zonder rij-triggers; TRIGGER laat de rol een
-- bestaande triggerfunctie aan een tabel hangen (bv. een die elke insert in
-- `orders` weigert). Geen API-pad naar een van beide: dit is
-- defense-in-depth tegen wie willekeurige SQL als die rol kan draaien.
--
-- Zelfde opbouw als 0018 (functies): intrekken voor wat er is, `alter
-- default privileges` voor wat komt, en een tellende pgTAP-invariant die het
-- echt afdwingt (supabase/tests/tabelrechten_api_rollen.test.sql).
--
-- `service_role` blijft bewust ongemoeid (spec → "service_role: niet
-- aanraken", ADR 0022 → punt 4).

-- ── 1. public: intrekken voor wat er is ─────────────────────────────────

revoke truncate, references, trigger on all tables in schema public
  from public, anon, authenticated;

-- Breed (spec → Besluit 2): `anon` houdt op geen enkele relatie in `public`
-- nog een recht. Alle policies zijn `to authenticated`, dus `anon` las en
-- schreef hier al niets; RLS is daarmee niet langer de enige laag. Een
-- latere `create policy` zonder `to`-clausule (die geldt voor PUBLIC) opent
-- daardoor niets voor de publishable key. Een `select` als `anon` geeft
-- voortaan `permission denied` (42501) in plaats van nul rijen; de app leest
-- nergens een tabel zonder sessie.
revoke all on all tables in schema public from anon;

-- Alle functies die schrijven zijn `security definer` en draaien als
-- `postgres`; geen enkele aanroeper heeft een sequence-recht nodig.
-- `UPDATE` op een sequence maakt `setval` mogelijk.
revoke all on all sequences in schema public from public, anon, authenticated;

-- ── 2. public en storage: intrekken voor wat komt ───────────────────────
--
-- Zonder `for role` geldt dit voor de standaardrechten van `postgres`, de
-- rol die onze migraties draait. Belt-and-braces, geen vervanging van de
-- invariant: een relatie die een andere rol aanmaakt (bv. `supabase_admin`
-- voor een extensie in `public`) valt erbuiten, en dan wordt de invariant
-- rood. In `storage` maken wij geen tabellen aan; de regels dichten daar
-- een gat dat er vandaag niet is. Supabase' eigen storage-tabellen (van
-- `supabase_storage_admin`) raken ze niet.

alter default privileges in schema public
  revoke truncate, references, trigger on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all on tables from anon;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;

alter default privileges in schema storage
  revoke truncate, references, trigger on tables from public, anon, authenticated;
alter default privileges in schema storage
  revoke all on tables from anon;
alter default privileges in schema storage
  revoke all on sequences from public, anon, authenticated;

-- ── 3. storage: bewust géén revoke ──────────────────────────────────────
--
-- De storage-tabellen zijn van `supabase_storage_admin`, en die rol gaf
-- `anon` en `authenticated` hun rechten. `postgres` is geen lid van die rol
-- en heeft alleen rechten met grant option. Een `revoke` door een
-- niet-eigenaar trekt alleen in wat die rol zelf gaf: zo'n regel meldt
-- `REVOKE` zonder fout en verandert niets. Een regel die niets doet en toch
-- "revoke" heet, is erger dan geen regel (spec → Migratie 0041 punt 3).

-- ── 4. storage: de BEFORE TRUNCATE-guard (spec → Besluit 1, ADR 0022 → 3) ─
--
-- `postgres` heeft wél TRIGGER (met grant option) op de storage-tabellen, en
-- een statement-trigger gaat af vóór de tabel geleegd wordt. Hetzelfde
-- mechanisme als Supabase' eigen `storage.protect_delete`. Dit is de enige
-- wijziging die wij aan een tabel van Supabase maken.
--
-- security invoker: de functie leest alleen `current_user`, en moet juist de
-- rol van de aanroeper zien. Een triggerfunctie heeft bij het afgaan geen
-- EXECUTE van de aanroeper nodig, dus EXECUTE gaat voor elke API-rol dicht
-- (ingedeeld als `intern` in supabase/tests/rpc_catalogus.test.sql).

create function forbid_api_role_truncate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'truncate_forbidden' using errcode = 'P0001',
      detail = format('%I.%I mag niet geleegd worden door %I',
                      tg_table_schema, tg_table_name, current_user);
  end if;
  return null;
end;
$$;

revoke execute on function forbid_api_role_truncate() from public, anon, authenticated, service_role;

-- De lijst komt uit de catalogus van de database waartegen de migratie
-- draait, niet uit een handgetypte lijst (spec → Migratie 0041 punt 4):
-- lokaal en in CI zijn dat `objects`, `buckets` en `buckets_analytics`, maar
-- de storage-versie van het gehoste project kan andere tabellen hebben. Elke
-- tabel in `storage` waarop `anon` of `authenticated` TRUNCATE heeft, krijgt
-- de guard. Heeft `postgres` op zo'n tabel geen TRIGGER, dan faalt de
-- migratie hier, en dat is de bedoeling: dan geldt de terugval uit de spec
-- (Besluit 1, optie B), en die loopt via de Architect.
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as tabel
      from pg_class c
     where c.relnamespace = 'storage'::regnamespace
       and c.relkind in ('r', 'p')
       and (has_table_privilege('anon', c.oid, 'TRUNCATE')
            or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))
     order by c.relname
  loop
    execute format(
      'create trigger forbid_api_role_truncate before truncate on %s '
      'for each statement execute function public.forbid_api_role_truncate()',
      r.tabel
    );
  end loop;
end $$;
