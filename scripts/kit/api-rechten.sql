-- Rechten van de API-rollen op schema public, één regel per recht:
--   soort|object|rol|recht   (soort: table, column, sequence, function, schema)
-- Gebruikt om migratie 0044 af te leiden (ADR 0025 → roadmap 0.1a): draai
-- het op een database met alle migraties, eenmaal zonder en eenmaal met
-- `auto_expose_new_tables = false`, en vergelijk:
--   psql "$DB_URL" -At -f scripts/kit/api-rechten.sql | sort > a.txt
-- Een nieuwe migratie die een object maakt, geeft zelf expliciet de
-- rechten; de twee dumps horen dan gelijk te blijven.
with rollen(r) as (values ('anon'),('authenticated'),('service_role'),('PUBLIC')),
rel as (
  select case c.relkind when 'S' then 'sequence' else 'table' end as soort,
         'public.' || quote_ident(c.relname) as obj, a.grantee, a.privilege_type
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault((case when c.relkind='S' then 's' else 'r' end)::"char", c.relowner))) a
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','S','f')
),
col as (
  select 'column' as soort, 'public.' || quote_ident(c.relname) || '(' || quote_ident(att.attname) || ')' as obj, a.grantee, a.privilege_type
  from pg_class c join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped and att.attacl is not null
  cross join lateral aclexplode(att.attacl) a
  where c.relnamespace = 'public'::regnamespace
),
fun as (
  select 'function' as soort, p.oid::regprocedure::text as obj, a.grantee, a.privilege_type
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
  where p.pronamespace = 'public'::regnamespace
),
sch as (
  select 'schema', 'public', a.grantee, a.privilege_type from pg_namespace n cross join lateral aclexplode(n.nspacl) a where n.nspname='public'
),
alles as (select * from rel union all select * from col union all select * from fun union all select * from sch)
select soort || '|' || obj || '|' || case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee) end || '|' || privilege_type
from alles
where (case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee) end) in (select r from rollen)
order by 1;
