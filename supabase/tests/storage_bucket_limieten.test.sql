-- Invariant: elke bucket heeft een werkzame type- en groottelimiet
-- (docs/features/tabelrechten-api-rollen.md → Gates, invariant 2, Besluit 3;
-- ADR 0018 → punt 3). Run met `npm run db:test`.
--
-- Toetst de stand na alle migraties, in de database: ook een latere
-- `update storage.buckets`, of een `insert into "storage"."buckets"` die de
-- lexicale bucketregel van check:rls niet herkent. Een eigen bestand, zodat
-- de testbucket zonder limieten die productafbeeldingen_negatief.test.sql in
-- zijn eigen transactie aanmaakt, hier niet meetelt.
--
-- Streng (Besluit 3): een limiet van 0, een lege lijst of een wildcard laten
-- een bucket in de praktijk zonder beperking. `image/*` laat bv. SVG toe,
-- en dat kan op een publieke bucket script uitvoeren.
--
-- Niet gedekt: een bucket die iemand op het gehoste project via het dashboard
-- aanpast (spec → Buiten scope).

create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

select is(
  (select coalesce(array_agg(id order by id), '{}') from storage.buckets
    where file_size_limit is null or file_size_limit <= 0),
  '{}'::text[],
  'elke bucket heeft een file_size_limit groter dan 0'
);

select is(
  (select coalesce(array_agg(id order by id), '{}') from storage.buckets
    where allowed_mime_types is null or cardinality(allowed_mime_types) = 0),
  '{}'::text[],
  'elke bucket heeft een niet-lege allowed_mime_types'
);

select is(
  (select coalesce(array_agg(id order by id), '{}') from storage.buckets b
    where exists (select 1 from unnest(b.allowed_mime_types) as m(type)
                   where strpos(m.type, '*') > 0)),
  '{}'::text[],
  'geen bucket staat een mime-type met een wildcard toe (geen image/*, geen */*)'
);

-- Zonder deze check zou een lege storage.buckets de drie asserties
-- hierboven stil groen laten.
select ok(
  exists (select 1 from storage.buckets where id = 'product-images'),
  'de bucket product-images bestaat (de tellende asserties lopen niet over een lege tabel)'
);

select * from finish();
rollback;
