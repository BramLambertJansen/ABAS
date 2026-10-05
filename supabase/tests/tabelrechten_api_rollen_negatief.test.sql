-- Negatieve gedragstests bij invariant 1 (tabelrechten_api_rollen.test.sql)
-- (docs/features/tabelrechten-api-rollen.md; ADR 0022; migratie 0041).
-- Run met `npm run db:test`.
--
-- De invariant leest de catalogus. Dit bestand doet wat een aanvaller zou
-- doen: als `anon` en `authenticated` echt proberen te legen, een trigger aan
-- te hangen, te lezen en sequences te verzetten, en toetst dat het faalt.
-- Plus de randen van de storage-guard (omzeilen via cascade, `only`,
-- uitschakelen, weghalen, replica-modus, rolwissel) en de default privileges
-- voor een tabel die na 0041 wordt aangemaakt.
--
-- Alles binnen de transactie van de test: wat hier toch zou slagen, rolt het
-- einde van dit bestand terug.

create extension if not exists pgtap with schema extensions;

begin;
select plan(36);

-- ── Hulpmiddelen (bestaan alleen binnen deze transactie) ─────────────────

-- Een triggerfunctie waarop beide API-rollen EXECUTE hebben. Zo ligt een
-- geweigerde `create trigger` aantoonbaar aan het tabelrecht TRIGGER, en
-- niet aan een ontbrekend EXECUTE op de functie.
create function public.tst_noop_trigger() returns trigger
language plpgsql as $$ begin return null; end $$;
grant execute on function public.tst_noop_trigger() to anon, authenticated;

-- Probeert als de aanroepende rol (security invoker) op elke tabel in
-- public te legen of er een trigger aan te hangen. Geeft de tabellen terug
-- waar dat NIET op een rechtenfout (42501) stuitte: gelukt, of gestrand op
-- iets anders (dan met de SQLSTATE erbij, bv. 0A000 voor een foreign key,
-- wat betekent dat de rechtencheck al gepasseerd was). Een gelukte poging
-- wordt meteen teruggedraaid via een eigen fout in het subblok.
create function public.tst_niet_geweigerd(p_actie text) returns text[]
language plpgsql as $$
declare
  r record;
  v text[] := '{}';
begin
  for r in
    select c.relname::text as naam
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
     order by c.relname
  loop
    begin
      if p_actie = 'truncate' then
        execute format('truncate public.%I', r.naam);
      else
        execute format(
          'create trigger tst_aanval before insert on public.%I '
          'for each statement execute function public.tst_noop_trigger()', r.naam);
      end if;
      v := v || r.naam;
      raise exception using errcode = 'P0099';
    exception
      when insufficient_privilege then null;
      when sqlstate 'P0099' then null;
      when others then v := v || format('%s (%s)', r.naam, sqlstate);
    end;
  end loop;
  return v;
end $$;
grant execute on function public.tst_niet_geweigerd(text) to anon, authenticated;

-- Zelfde idee voor storage: elke tabel waarop de rol TRUNCATE heeft, moet
-- geweigerd worden: door de guard (P0001 truncate_forbidden), of doordat een
-- tabel die via cascade meekomt geen TRUNCATE geeft (42501; zo is
-- storage.buckets voor authenticated al onleegbaar via
-- s3_multipart_uploads). Alleen slagen telt als fout. `cascade`,
-- omdat zonder cascade een foreign key (objects → buckets) al vóór de
-- BEFORE TRUNCATE-triggers weigert, en dan bewijst de poging niets over de
-- guard. Met cascade gaan de triggers van alle geraakte tabellen af.
create function public.tst_storage_niet_geweigerd() returns text[]
language plpgsql as $$
declare
  r record;
  v text[] := '{}';
begin
  for r in
    select c.relname::text as naam
      from pg_class c
     where c.relnamespace = 'storage'::regnamespace
       and c.relkind in ('r', 'p')
       and has_table_privilege(current_user, c.oid, 'TRUNCATE')
     order by c.relname
  loop
    begin
      execute format('truncate storage.%I cascade', r.naam);
      v := v || r.naam;
      raise exception using errcode = 'P0099';
    exception
      when sqlstate 'P0099' then null;
      -- Een tabel die via cascade meekomt en waarop de rol geen TRUNCATE
      -- heeft: ook geweigerd, dus goed.
      when insufficient_privilege then null;
      when raise_exception then
        if sqlerrm <> 'truncate_forbidden' then
          v := v || format('%s (P0001 %s)', r.naam, sqlerrm);
        end if;
      when others then v := v || format('%s (%s)', r.naam, sqlstate);
    end;
  end loop;
  return v;
end $$;
grant execute on function public.tst_storage_niet_geweigerd() to anon, authenticated;

-- Telt mee in sectie 3: een rij in storage.buckets, zodat `truncate
-- storage.buckets` als postgres aantoonbaar iets leegt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tst-guard', 'tst-guard', false, 1024, array['image/webp']);

-- ── 1) public: legen en een trigger aanhangen, als aanvaller ─────────────

set local role authenticated;
select is(public.tst_niet_geweigerd('truncate'), '{}'::text[],
  'authenticated kan geen enkele tabel in public legen (42501 op elke tabel)');
select is(public.tst_niet_geweigerd('trigger'), '{}'::text[],
  'authenticated kan aan geen enkele tabel in public een trigger hangen (42501 op elke tabel)');

-- De aanval die de Architect vond, letterlijk: een bestaande triggerfunctie
-- van Supabase (waarop authenticated EXECUTE heeft) aan orders hangen,
-- waarna elke place_order faalt.
select ok(has_function_privilege('authenticated', 'storage.protect_delete()', 'EXECUTE'),
  'voorwaarde: authenticated heeft EXECUTE op storage.protect_delete(), dus alleen het tabelrecht houdt de aanval tegen');
select throws_ok(
  $$ create trigger blokkeer_bar before insert on public.orders
       for each statement execute function storage.protect_delete() $$,
  '42501', 'permission denied for table orders',
  'authenticated kan storage.protect_delete() niet aan public.orders hangen (de bar kan niet stilgelegd worden)'
);
select throws_ok(
  $$ create trigger blokkeer_opwaarderen before insert on public.top_ups
       for each statement execute function storage.protect_delete() $$,
  '42501', 'permission denied for table top_ups',
  'authenticated kan geen trigger aan public.top_ups hangen'
);
select throws_ok(
  $$ create trigger blokkeer_regels before insert on public.order_lines
       for each statement execute function storage.protect_delete() $$,
  '42501', 'permission denied for table order_lines',
  'authenticated kan geen trigger aan public.order_lines hangen'
);
select throws_ok($$ truncate public.orders $$, '42501', 'permission denied for table orders',
  'authenticated kan public.orders niet legen');
select throws_ok($$ truncate public.top_ups $$, '42501', 'permission denied for table top_ups',
  'authenticated kan public.top_ups niet legen');
select throws_ok($$ truncate public.members cascade $$, '42501', 'permission denied for table members',
  'authenticated kan public.members ook met cascade niet legen');
reset role;

set local role anon;
select is(public.tst_niet_geweigerd('truncate'), '{}'::text[],
  'anon kan geen enkele tabel in public legen (42501 op elke tabel)');
select is(public.tst_niet_geweigerd('trigger'), '{}'::text[],
  'anon kan aan geen enkele tabel in public een trigger hangen (42501 op elke tabel)');
reset role;

-- ── 2) anon leest niets meer, en niemand verzet een sequence ─────────────
--
-- Spec → Besluit 2: een `select` als anon geeft `permission denied` in
-- plaats van nul rijen. Dat is de laag onder RLS: een latere policy zonder
-- `to`-clausule opent hier niets.

-- Precies de "policy per ongeluk" uit 0027 en Besluit 2: een policy zonder
-- `to`-clausule geldt voor PUBLIC, dus ook voor anon. Met de tabelrechten
-- van vóór 0041 stond products dan open voor de publishable key.
create policy tst_per_ongeluk_open on public.products for select using (true);

set local role anon;
select throws_ok($$ select 1 from public.products where true $$, '42501', 'permission denied for table products',
  'een latere policy zonder to-clausule opent public.products niet voor anon');
select throws_ok($$ select 1 from public.orders $$, '42501', 'permission denied for table orders',
  'anon kan public.orders niet lezen (rechtenfout, niet nul rijen)');
select throws_ok($$ select 1 from public.members $$, '42501', 'permission denied for table members',
  'anon kan public.members niet lezen');
select throws_ok($$ select 1 from public.products $$, '42501', 'permission denied for table products',
  'anon kan public.products niet lezen');
select throws_ok($$ select 1 from public.app_settings $$, '42501', 'permission denied for table app_settings',
  'anon kan public.app_settings niet lezen');
select throws_ok(
  $$ insert into public.orders (shift_id, member_id, served_by, total_cents)
     values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1) $$,
  '42501', 'permission denied for table orders',
  'anon kan niet in public.orders schrijven (rechtenfout vóór RLS)'
);
select throws_ok($$ select nextval('public.client_errors_id_seq') $$,
  '42501', 'permission denied for sequence client_errors_id_seq',
  'anon kan client_errors_id_seq niet ophogen');
reset role;

set local role authenticated;
select throws_ok($$ select nextval('public.client_errors_id_seq') $$,
  '42501', 'permission denied for sequence client_errors_id_seq',
  'authenticated kan client_errors_id_seq niet ophogen');
select throws_ok($$ select setval('public.login_throttle_id_seq', 1) $$,
  '42501', 'permission denied for sequence login_throttle_id_seq',
  'authenticated kan login_throttle_id_seq niet terugzetten (setval)');
reset role;

-- ── 3) De storage-guard: randen en omwegen ───────────────────────────────

set local role authenticated;
select is(public.tst_storage_niet_geweigerd(), '{}'::text[],
  'authenticated: geen enkele storage-tabel is te legen, ook niet met cascade (guard of ontbrekend recht)');
select throws_ok($$ truncate only storage.objects $$, 'P0001', 'truncate_forbidden',
  'authenticated kan storage.objects ook met ONLY niet legen');
select throws_ok(
  $$ alter table storage.objects disable trigger forbid_api_role_truncate $$,
  '42501', null,
  'authenticated kan de guard op storage.objects niet uitschakelen'
);
select throws_ok(
  $$ drop trigger forbid_api_role_truncate on storage.objects $$,
  '42501', null,
  'authenticated kan de guard van storage.objects niet weghalen'
);
select throws_ok(
  $$ set session_replication_role = replica $$,
  '42501', null,
  'authenticated kan niet naar replica-modus (die zou triggers overslaan)'
);
select throws_ok(
  $$ create or replace function public.forbid_api_role_truncate() returns trigger
       language plpgsql as $f$ begin return null; end $f$ $$,
  '42501', null,
  'authenticated kan de guardfunctie niet vervangen'
);
-- Niet hier getoetst: `set role service_role` als authenticated. Postgres
-- toetst SET ROLE tegen de sessiegebruiker, en die is in pgTAP `postgres`,
-- dus de test zou niets bewijzen. Via PostgREST is de sessiegebruiker
-- `authenticator`, dat lid is van service_role: wie daar willekeurige SQL
-- kan draaien, staat buiten het model van deze guard (ADR 0022).
reset role;

set local role anon;
select is(public.tst_storage_niet_geweigerd(), '{}'::text[],
  'anon: geen enkele storage-tabel is te legen, ook niet met cascade (guard of ontbrekend recht)');
select throws_ok(
  $$ drop trigger forbid_api_role_truncate on storage.objects $$,
  '42501', null,
  'anon kan de guard van storage.objects niet weghalen'
);
reset role;

-- De guard moet de rol van de aanroeper zien. Als security definer zou hij
-- als postgres draaien, `current_user` is dan nooit anon of authenticated,
-- en de guard laat alles door zonder dat de catalogusassertie het merkt.
select ok(
  (select not p.prosecdef
      and exists (select 1 from unnest(p.proconfig) as c(s) where c.s like 'search_path=%')
     from pg_proc p
    where p.oid = 'public.forbid_api_role_truncate()'::regprocedure),
  'de guard is security invoker en zet een vaste search_path'
);

-- postgres (de migraties, het dashboard) wordt niet tegengehouden. Als
-- laatste in deze sectie: hierna is storage leeg binnen deze transactie.
select lives_ok($$ truncate storage.buckets cascade $$,
  'postgres wordt niet door de guard tegengehouden (storage.buckets cascade)');
select is((select count(*) from storage.buckets where id = 'tst-guard'), 0::bigint,
  'en de truncate van postgres leegde storage.buckets echt');

-- ── 4) Een tabel van na 0041 krijgt de verkeerde rechten niet ────────────
--
-- `alter default privileges` uit 0041 (rol postgres, schema public). Een
-- nieuwe tabel met een identity-kolom (dus ook een nieuwe sequence) en een
-- view, aangemaakt zoals een volgende migratie dat doet.

create table public.tst_na_0041 (
  id bigint generated always as identity primary key,
  naam text
);
create view public.tst_na_0041_view as select id, naam from public.tst_na_0041;

select is(
  (select coalesce(array_agg(format('%s: %s %s', o.naam, g.rol, p.recht)
                             order by o.naam, g.rol, p.recht), '{}')
     from (values ('tst_na_0041'), ('tst_na_0041_view')) as o(naam)
     cross join (values ('public'), ('anon'), ('authenticated')) as g(rol)
     cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(recht)
    where has_table_privilege(g.rol, format('public.%I', o.naam), p.recht)),
  '{}'::text[],
  'een nieuwe tabel en view geven PUBLIC, anon en authenticated geen TRUNCATE, TRIGGER of REFERENCES'
);

select is(
  (select coalesce(array_agg(format('%s: %s', o.naam, p.recht) order by o.naam, p.recht), '{}')
     from (values ('tst_na_0041'), ('tst_na_0041_view')) as o(naam)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                        ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(recht)
    where has_table_privilege('anon', format('public.%I', o.naam), p.recht)),
  '{}'::text[],
  'een nieuwe tabel en view geven anon geen enkel recht'
);

select is(
  (select coalesce(array_agg(format('%s %s', g.rol, p.recht) order by g.rol, p.recht), '{}')
     from (values ('public'), ('anon'), ('authenticated')) as g(rol)
     cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p(recht)
    where has_sequence_privilege(g.rol,
            pg_get_serial_sequence('public.tst_na_0041', 'id'), p.recht)),
  '{}'::text[],
  'de sequence van een nieuwe identity-kolom geeft PUBLIC, anon en authenticated geen recht'
);

set local role authenticated;
select throws_ok($$ truncate public.tst_na_0041 $$, '42501', 'permission denied for table tst_na_0041',
  'authenticated kan een tabel van na 0041 niet legen');
reset role;

-- ── 5) Geld: 0041 verandert niets aan de geld-RPC's ──────────────────────
--
-- De motivatie in de spec ("Raakt het geld: nee") steunt erop dat deze
-- functies security definer zijn en als postgres draaien: dan raakt een
-- revoke op de API-rollen ze niet. Zou er een security invoker worden, dan
-- heeft de aanroeper na 0041 geen schrijfrecht en valt de bar om.

select is(
  (select coalesce(array_agg(f.sig order by f.sig), '{}')
     from unnest(array[
       'public.place_order(uuid,uuid,jsonb,uuid)',
       'public.top_up(uuid,uuid,integer,text,uuid)',
       'public.reverse_order_at_bar(uuid,uuid,text,uuid)',
       'public.reverse_order_as_admin(uuid,text)'
     ]) as f(sig)
     join pg_proc p on p.oid = f.sig::regprocedure
    where not p.prosecdef
       or pg_get_userbyid(p.proowner) <> 'postgres'
       or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE')),
  '{}'::text[],
  'de geld-RPC''s zijn security definer van postgres, uitvoerbaar voor authenticated en niet voor anon'
);

select * from finish();
rollback;
