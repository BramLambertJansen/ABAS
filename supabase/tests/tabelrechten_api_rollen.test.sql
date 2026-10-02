-- Invariant: API-rollen hebben geen tabelrechten die RLS omzeilen
-- (docs/features/tabelrechten-api-rollen.md → Gates, invariant 1; ADR 0019;
-- migratie 0039). Run met `npm run db:test`.
--
-- Zelfde opbouw als rpc_execute_grants.test.sql, dat hetzelfde probleem voor
-- functies bewaakt:
--
--   1. Tellende asserties over de catalogus. Die dekken ook een tabel die er
--      morgen bij komt. Ze geven de lijst van overtreders terug, niet alleen
--      een aantal.
--   2. Benoemde checks, zodat een rode run meteen laat zien waar het zit.
--
-- `has_table_privilege`, `has_any_column_privilege` en
-- `has_sequence_privilege` lezen de ACL rechtstreeks (inclusief wat via
-- PUBLIC of een rollidmaatschap binnenkomt), zonder iets te legen.
--
-- `service_role` en `postgres` vallen bewust buiten de tellende asserties
-- (spec → "service_role: niet aanraken", ADR 0019 → punt 4). Sectie 4 toetst
-- juist dat `service_role` zijn rechten houdt.

create extension if not exists pgtap with schema extensions;

begin;
select plan(22);

-- Elke relatie in public die een API-rol zou kunnen raken: tabellen,
-- gepartitioneerde tabellen, views, materialized views, foreign tables.
-- Ook een relatie van een extensie telt mee: die valt buiten de `alter
-- default privileges` van 0039, en dan hoort deze invariant rood te worden.
create temp view api_relaties as
  select c.oid, c.relname::text as naam
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'p', 'v', 'm', 'f');

-- ── 1) public: geen TRUNCATE, TRIGGER of REFERENCES voor API-rollen ──────
--
-- REFERENCES via `has_any_column_privilege`: dat recht kan ook per kolom
-- bestaan, en `has_table_privilege` ziet alleen het tabelbrede recht.

select is(
  (select coalesce(array_agg(format('%s: %s %s', r.naam, g.rol, p.recht)
                             order by r.naam, g.rol, p.recht), '{}')
     from api_relaties r
     cross join (values ('public'), ('anon'), ('authenticated')) as g(rol)
     cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(recht)
    where case p.recht
            when 'REFERENCES' then has_any_column_privilege(g.rol, r.oid, p.recht)
            else has_table_privilege(g.rol, r.oid, p.recht)
          end),
  '{}'::text[],
  'geen relatie in public geeft PUBLIC, anon of authenticated TRUNCATE, TRIGGER of REFERENCES'
);

-- ── 2) storage: TRUNCATE is geblokkeerd door de guard ────────────────────
--
-- Op de storage-tabellen (van supabase_storage_admin) kan 0039 de rechten
-- niet intrekken; daar staat een BEFORE TRUNCATE-guard (ADR 0019 → punt 3).
-- Elke storage-tabel waarop anon of authenticated TRUNCATE heeft, moet die
-- guard hebben, ingeschakeld, vóór, per statement. Een Supabase-upgrade
-- die een storage-tabel toevoegt, maakt dit rood tot de guard erop staat.
-- tgtype: 1 = per rij, 2 = before, 32 = truncate.

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relnamespace = 'storage'::regnamespace
      and c.relkind in ('r', 'p')
      and (has_table_privilege('anon', c.oid, 'TRUNCATE')
           or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))
      and not exists (
        select 1 from pg_trigger t
         where t.tgrelid = c.oid
           and t.tgfoid = to_regprocedure('public.forbid_api_role_truncate()')
           and t.tgenabled in ('O', 'A')
           and t.tgtype & 32 <> 0
           and t.tgtype & 2 <> 0
           and t.tgtype & 1 = 0)),
  '{}'::text[],
  'elke storage-tabel waarop anon of authenticated TRUNCATE heeft, heeft de BEFORE TRUNCATE-guard'
);

-- Het gedrag, niet alleen de catalogus. Binnen de transactie van de test:
-- zou de guard niet afgaan, dan rolt het einde van dit bestand het terug.
set local role authenticated;
select throws_ok(
  $$ truncate storage.objects $$,
  'P0001', 'truncate_forbidden',
  'authenticated kan storage.objects niet legen'
);
reset role;

set local role anon;
select throws_ok(
  $$ truncate storage.objects $$,
  'P0001', 'truncate_forbidden',
  'anon kan storage.objects niet legen'
);
reset role;

-- De guard weigert alleen API-rollen. service_role (en de eigenaar, en
-- postgres) gaan erdoor (spec → Migratie 0039 punt 4). Als laatste in deze
-- sectie: hierna is storage.objects binnen deze transactie leeg.
set local role service_role;
select lives_ok(
  $$ truncate storage.objects $$,
  'service_role wordt niet door de guard tegengehouden'
);
reset role;

-- ── 3) De geldtabellen, met naam ─────────────────────────────────────────
--
-- De MONEY_TABLES uit scripts/check-rls.mjs. Sectie 1 dekt ze al; hier
-- staan ze benoemd, zodat een rode run zegt over welke tabel het gaat.

select is(
  (select coalesce(array_agg(format('%s %s', g.rol, p.recht) order by g.rol, p.recht), '{}')
     from (values ('anon'), ('authenticated')) as g(rol)
     cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(recht)
    where case p.recht
            when 'REFERENCES' then has_any_column_privilege(g.rol, 'public.orders', p.recht)
            else has_table_privilege(g.rol, 'public.orders', p.recht)
          end),
  '{}'::text[],
  'orders: geen TRUNCATE, TRIGGER of REFERENCES voor anon en authenticated'
);

select is(
  (select coalesce(array_agg(format('%s %s', g.rol, p.recht) order by g.rol, p.recht), '{}')
     from (values ('anon'), ('authenticated')) as g(rol)
     cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(recht)
    where case p.recht
            when 'REFERENCES' then has_any_column_privilege(g.rol, 'public.order_lines', p.recht)
            else has_table_privilege(g.rol, 'public.order_lines', p.recht)
          end),
  '{}'::text[],
  'order_lines: geen TRUNCATE, TRIGGER of REFERENCES voor anon en authenticated'
);

select is(
  (select coalesce(array_agg(format('%s %s', g.rol, p.recht) order by g.rol, p.recht), '{}')
     from (values ('anon'), ('authenticated')) as g(rol)
     cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(recht)
    where case p.recht
            when 'REFERENCES' then has_any_column_privilege(g.rol, 'public.top_ups', p.recht)
            else has_table_privilege(g.rol, 'public.top_ups', p.recht)
          end),
  '{}'::text[],
  'top_ups: geen TRUNCATE, TRIGGER of REFERENCES voor anon en authenticated'
);

select is(
  (select coalesce(array_agg(format('%s %s', g.rol, p.recht) order by g.rol, p.recht), '{}')
     from (values ('anon'), ('authenticated')) as g(rol)
     cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(recht)
    where case p.recht
            when 'REFERENCES' then has_any_column_privilege(g.rol, 'public.order_reversals', p.recht)
            else has_table_privilege(g.rol, 'public.order_reversals', p.recht)
          end),
  '{}'::text[],
  'order_reversals: geen TRUNCATE, TRIGGER of REFERENCES voor anon en authenticated'
);

select is(
  (select coalesce(array_agg(format('%s %s', g.rol, p.recht) order by g.rol, p.recht), '{}')
     from (values ('anon'), ('authenticated')) as g(rol)
     cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(recht)
    where case p.recht
            when 'REFERENCES' then has_any_column_privilege(g.rol, 'public.members', p.recht)
            else has_table_privilege(g.rol, 'public.members', p.recht)
          end),
  '{}'::text[],
  'members: geen TRUNCATE, TRIGGER of REFERENCES voor anon en authenticated'
);

-- ── 4) De intrekking mag niet te ver gaan ────────────────────────────────
--
-- Zoals sectie 3 van rpc_execute_grants: raakt een intrekking per ongeluk
-- `authenticated` of `service_role`, dan valt de app om, en dat blijkt niet
-- uit de asserties hierboven.

select ok(has_table_privilege('authenticated', 'public.orders', 'SELECT'),
  'authenticated houdt select op orders');
select ok(has_table_privilege('authenticated', 'public.top_ups', 'SELECT'),
  'authenticated houdt select op top_ups');
select ok(has_table_privilege('authenticated', 'public.products', 'SELECT'),
  'authenticated houdt select op products');
select ok(has_table_privilege('authenticated', 'public.shifts', 'SELECT'),
  'authenticated houdt select op shifts');
select ok(has_table_privilege('authenticated', 'public.bar_sessions', 'SELECT'),
  'authenticated houdt select op bar_sessions');

-- Aangevuld: members is voor authenticated kolomgewijs leesbaar (0009/0010);
-- elke sessiehook (useBeheerSession, usePortalSession) leest name en role.
select ok(
  has_column_privilege('authenticated', 'public.members', 'name', 'SELECT')
  and has_column_privilege('authenticated', 'public.members', 'role', 'SELECT'),
  'authenticated houdt de kolomgewijze select op members (name, role)'
);

select ok(
  has_table_privilege('service_role', 'public.login_throttle', 'INSERT')
  and has_table_privilege('service_role', 'public.login_throttle', 'DELETE'),
  'service_role houdt insert en delete op login_throttle'
);
select ok(
  has_table_privilege('service_role', 'public.client_errors', 'INSERT')
  and has_table_privilege('service_role', 'public.client_errors', 'DELETE'),
  'service_role houdt insert en delete op client_errors'
);
select ok(
  has_table_privilege('service_role', 'public.bar_devices', 'INSERT')
  and has_table_privilege('service_role', 'public.bar_devices', 'DELETE'),
  'service_role houdt insert en delete op bar_devices'
);

-- Aangevuld: de namenlijst van de bar en de actorchecks van de server lezen
-- members met de service-role-client (src/lib/barLogin.ts, inviteMember.ts).
select ok(
  has_table_privilege('service_role', 'public.members', 'SELECT'),
  'service_role houdt select op members (namenlijst van de bar)'
);

-- ── 5) Breed: anon heeft niets in public, niemand heeft een sequence ─────
--
-- Spec → Besluit 2. Alle policies zijn `to authenticated`; met deze
-- invariant opent een latere policy zonder `to`-clausule (die geldt voor
-- PUBLIC) niets voor de publishable key. Kolomrechten apart, via
-- `has_any_column_privilege`: een kolomgewijze grant aan anon telt ook.

select is(
  (select coalesce(array_agg(format('%s: %s %s', r.naam, g.rol, p.recht)
                             order by r.naam, g.rol, p.recht), '{}')
     from api_relaties r
     cross join (values ('public'), ('anon')) as g(rol)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                        ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(recht)
    where has_table_privilege(g.rol, r.oid, p.recht)
       or (p.recht in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
           and has_any_column_privilege(g.rol, r.oid, p.recht))),
  '{}'::text[],
  'PUBLIC en anon hebben geen enkel recht op een relatie in public, ook niet per kolom'
);

select is(
  (select coalesce(array_agg(format('%s: %s %s', c.relname, g.rol, p.recht)
                             order by c.relname, g.rol, p.recht), '{}')
     from pg_class c
     cross join (values ('public'), ('anon'), ('authenticated')) as g(rol)
     cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p(recht)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'S'
      and has_sequence_privilege(g.rol, c.oid, p.recht)),
  '{}'::text[],
  'PUBLIC, anon en authenticated hebben geen enkel recht op een sequence in public'
);

select * from finish();
rollback;
