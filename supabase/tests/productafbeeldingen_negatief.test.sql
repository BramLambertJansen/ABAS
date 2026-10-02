-- Productafbeeldingen, negatieve aanvulling (Tester, PR #146) op
-- productafbeeldingen.test.sql. Zelfde migratie (0038), zelfde ADR (0018).
--
-- Wat hier bij komt, en waarom:
--
--   * catalogus-invarianten naast "geen schrijfpolicy op storage.objects":
--     ook geen op storage.buckets (een insert-policy daar zou een bucket
--     zonder limieten mogelijk maken), geen SECURITY DEFINER-functie in het
--     storage-schema voor een API-rol, en geen functie in public die zelf
--     naar storage.objects of storage.buckets schrijft. Samen: de enige weg
--     naar een schrijfactie is de Storage-API met de service-role-sleutel;
--   * de delete-weigering in productafbeeldingen.test.sql komt van Supabase'
--     trigger storage.protect_delete, niet van RLS. Die trigger is met één
--     set_config uit te zetten, door elke rol. Hier staat dat óók dan RLS
--     niets laat verwijderen;
--   * de bucket zelf: geen API-rol kan hem aanpassen (bv. SVG toestaan of de
--     limiet weghalen), toevoegen of verwijderen;
--   * de rol `lid` (portal-sessie, en een rechtstreeks geïnserte
--     beheer-sessie), anon zonder EXECUTE, en een bardienst die het
--     sessie-id van een beheerder meestuurt;
--   * meer ongeldige paden (hoofdletters, een regeleinde aan het eind,
--     leeg, een voorloop-/, geen uuid) en een object met hetzelfde pad in
--     een andere bucket;
--   * een geweigerde aanroep laat een bestaande afbeelding staan, en
--     set_product_image raakt alleen image_path.
--
-- De sessie-gebonden faalmodi (session_ended, session_inactive, een
-- gearchiveerd lid) staan voor set_product_image in beheer_rpcs_modus.test.sql,
-- met de andere beheer-RPC's. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(40);

-- ── Sessie-helper (zelfde vorm als productafbeeldingen.test.sql) ───────────
-- `p_session`: het sessie-id in de JWT, standaard het auth-id zelf. Een ander
-- id laat een aanroeper het sessie-id van iemand anders meesturen.
create function pg_temp.act_as(
  p_auth_user uuid, p_mode text, p_aal text, p_session uuid default null
)
returns void
language plpgsql
as $fn$
declare
  v_member uuid;
begin
  if p_session is null then
    select id into v_member from members where auth_user_id = p_auth_user;
    if v_member is not null and p_mode is not null then
      insert into bar_sessions (auth_session_id, member_id, mode)
      values (p_auth_user, v_member, p_mode)
      on conflict (auth_session_id) do update set mode = excluded.mode;
    end if;
  end if;
  perform set_config('request.jwt.claim.sub', p_auth_user::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_auth_user::text,
      'session_id', coalesce(p_session, p_auth_user)::text,
      'aal', p_aal
    )::text,
    true
  );
end;
$fn$;

-- ── Fixtures ──────────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000ab010', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pan-admin@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000ab011', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pan-bar@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000ab012', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pan-lid@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-0000000ab020', 'PAN Admin', 'beheerder', null, 0, false,
   '00000000-0000-0000-0000-0000000ab010'),
  ('00000000-0000-0000-0000-0000000ab021', 'PAN Bar', 'bardienst', null, 0, false,
   '00000000-0000-0000-0000-0000000ab011'),
  ('00000000-0000-0000-0000-0000000ab022', 'PAN Lid', 'lid', null, 0, false,
   '00000000-0000-0000-0000-0000000ab012');

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000ab030', 'PAN Pils', 'Bier', 250, false);

-- Een tweede bucket, alleen voor de testopzet: een object met precies het
-- pad van een productafbeelding, maar niet in product-images.
insert into storage.buckets (id, name, public) values ('pan-ander', 'pan-ander', false);

insert into storage.objects (bucket_id, name) values
  ('product-images', 'products/00000000-0000-0000-0000-0000000ab030/11111111-1111-4111-8111-111111111111.webp'),
  ('pan-ander',      'products/00000000-0000-0000-0000-0000000ab030/77777777-7777-4777-8777-777777777777.webp');

-- ── Catalogus-invarianten (ADR 0018 → punt 1) ────────────────────────────

select is(
  (select coalesce(array_agg(policyname::text order by policyname), '{}') from pg_policies
    where schemaname = 'storage' and tablename = 'buckets'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  '{}'::text[],
  'storage.buckets heeft geen schrijfpolicy: geen API-rol maakt of wijzigt een bucket'
);

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'storage' and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  '{}'::text[],
  'geen SECURITY DEFINER-functie in storage is uitvoerbaar voor anon of authenticated'
);

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+storage\s*\.\s*(objects|buckets)\M'),
  '{}'::text[],
  'geen functie in public schrijft zelf naar storage.objects of storage.buckets'
);

-- ── EXECUTE op set_product_image ─────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'set_product_image(uuid, text)', 'EXECUTE'),
  'set_product_image is niet uitvoerbaar voor anon'
);
select ok(
  not has_function_privilege('public', 'set_product_image(uuid, text)', 'EXECUTE'),
  'set_product_image is niet uitvoerbaar voor PUBLIC'
);
select ok(
  has_function_privilege('authenticated', 'set_product_image(uuid, text)', 'EXECUTE'),
  'set_product_image is uitvoerbaar voor authenticated (de guard doet de rest)'
);

set local role anon;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030', null) $$,
  '42501',
  'permission denied for function set_product_image',
  'anon: een aanroep van set_product_image wordt geweigerd vóór de functie draait'
);
reset role;

-- ── De rol lid ───────────────────────────────────────────────────────────

-- Een portal-sessie: geen bar_sessions-rij.
select pg_temp.act_as('00000000-0000-0000-0000-0000000ab012', null, 'aal1');
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030', null) $$,
  'P0001', 'no_bar_session',
  'een lid in een portal-sessie: no_bar_session'
);
reset role;

-- Een rechtstreeks geïnserte beheer-sessie met aal2 (register_bar_session laat
-- dit niet toe): de rol telt, niet de sessie.
select pg_temp.act_as('00000000-0000-0000-0000-0000000ab012', 'beheer', 'aal2');
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030', null) $$,
  'P0001', 'no_bar_role',
  'een lid, ook in een beheer-sessie met aal2: no_bar_role'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('product-images', 'products/00000000-0000-0000-0000-0000000ab030/44444444-4444-4444-8444-444444444444.webp') $$,
  '42501',
  null,
  'een lid kan geen object rechtstreeks toevoegen'
);
select lives_ok(
  $$ update storage.objects set name = name || '.x' $$,
  'een lid: een update op storage.objects raakt niets (geen policy)'
);
select throws_ok(
  $$ delete from storage.objects $$,
  '42501',
  null,
  'een lid kan geen object rechtstreeks verwijderen'
);
reset role;

-- ── Delete zonder de trigger van Supabase ────────────────────────────────
-- storage.protect_delete weigert elke delete, behalve als
-- storage.allow_delete_query op 'true' staat; die instelling kan elke rol
-- zetten. Dan moet RLS het nog tegenhouden.

select pg_temp.act_as('00000000-0000-0000-0000-0000000ab010', 'beheer', 'aal2');
set local role authenticated;
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok(
  $$ delete from storage.objects $$,
  'authenticated (beheer, aal2), trigger uitgezet: de delete faalt niet ...'
);
reset role;
set local role anon;
select lives_ok(
  $$ delete from storage.objects $$,
  'anon, trigger uitgezet: de delete faalt niet ...'
);
reset role;
select set_config('storage.allow_delete_query', 'false', true);

select is(
  (select count(*)::int from storage.objects
    where name like 'products/00000000-0000-0000-0000-0000000ab030/%'),
  2,
  '... maar RLS liet niets verwijderen, en de updates hierboven veranderden niets'
);

-- ── De bucket zelf ───────────────────────────────────────────────────────

set local role authenticated;
select throws_ok(
  $$ insert into storage.buckets (id, name, public) values ('pan-eigen', 'pan-eigen', true) $$,
  '42501',
  null,
  'authenticated (beheer, aal2) kan geen bucket toevoegen'
);
select lives_ok(
  $$ update storage.buckets
        set allowed_mime_types = array['image/svg+xml'], file_size_limit = null, public = false
      where id = 'product-images' $$,
  'authenticated: een update van de bucketinstellingen faalt niet ...'
);
select throws_ok(
  $$ delete from storage.buckets where id = 'product-images' $$,
  '42501',
  null,
  'authenticated kan de bucket niet verwijderen'
);
reset role;

set local role anon;
select throws_ok(
  $$ insert into storage.buckets (id, name, public) values ('pan-anon', 'pan-anon', true) $$,
  '42501',
  null,
  'anon kan geen bucket toevoegen'
);
select lives_ok(
  $$ update storage.buckets set allowed_mime_types = null where id = 'product-images' $$,
  'anon: een update van de bucketinstellingen faalt niet ...'
);
reset role;

select is(
  (select row(public, file_size_limit, allowed_mime_types)::text
     from storage.buckets where id = 'product-images'),
  row(true, 1048576::bigint, array['image/webp']::text[])::text,
  '... maar de bucket staat nog precies zoals de migratie hem zette'
);

-- ── Een geleend sessie-id ────────────────────────────────────────────────
-- De bardienst stuurt het sessie-id van de beheer-sessie van de beheerder
-- mee (die sessie bestaat en is actief, zie hierboven). require_session
-- controleert dat de sessie bij auth.uid() hoort.

select pg_temp.act_as('00000000-0000-0000-0000-0000000ab011', 'beheer', 'aal2',
  '00000000-0000-0000-0000-0000000ab010');
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030', null) $$,
  'P0001', 'no_bar_role',
  'een bardienst met het sessie-id van een beheerder: no_bar_role'
);
reset role;

-- ── Ongeldige paden ──────────────────────────────────────────────────────

select pg_temp.act_as('00000000-0000-0000-0000-0000000ab010', 'beheer', 'aal2');
set local role authenticated;

select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030',
       'products/00000000-0000-0000-0000-0000000AB030/11111111-1111-4111-8111-111111111111.webp') $$,
  'P0001', 'invalid_image_path',
  'het product-id in hoofdletters: invalid_image_path'
);
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030',
       'products/00000000-0000-0000-0000-0000000ab030/11111111-1111-4111-8111-111111111111.WEBP') $$,
  'P0001', 'invalid_image_path',
  'de extensie in hoofdletters: invalid_image_path'
);
select throws_ok(
  format($$ select set_product_image('00000000-0000-0000-0000-0000000ab030', %L) $$,
    'products/00000000-0000-0000-0000-0000000ab030/11111111-1111-4111-8111-111111111111.webp' || E'\n'),
  'P0001', 'invalid_image_path',
  'een geldig pad met een regeleinde erachter: invalid_image_path'
);
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030', '') $$,
  'P0001', 'invalid_image_path',
  'een lege string (geen null): invalid_image_path'
);
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030',
       '/products/00000000-0000-0000-0000-0000000ab030/11111111-1111-4111-8111-111111111111.webp') $$,
  'P0001', 'invalid_image_path',
  'een pad met een voorloop-/: invalid_image_path'
);
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030',
       'products/00000000-0000-0000-0000-0000000ab030/pils.webp') $$,
  'P0001', 'invalid_image_path',
  'een bestandsnaam die geen uuid is: invalid_image_path'
);
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030',
       'https://example.com/products/00000000-0000-0000-0000-0000000ab030/11111111-1111-4111-8111-111111111111.webp') $$,
  'P0001', 'invalid_image_path',
  'een volledige URL: invalid_image_path'
);
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030',
       'products/00000000-0000-0000-0000-0000000ab030/77777777-7777-4777-8777-777777777777.webp') $$,
  'P0001', 'image_not_found',
  'hetzelfde pad bestaat alleen in een andere bucket: image_not_found'
);
select throws_ok(
  $$ select set_product_image(null, null) $$,
  'P0001', 'product_not_found',
  'geen product-id: product_not_found'
);

reset role;

select is(
  (select image_path from products where id = '00000000-0000-0000-0000-0000000ab030'),
  null,
  'na alle geweigerde aanroepen is image_path nog leeg'
);

-- ── Een bestaande afbeelding blijft staan bij een weigering ──────────────

select pg_temp.act_as('00000000-0000-0000-0000-0000000ab010', 'beheer', 'aal2');
set local role authenticated;
select is(
  set_product_image('00000000-0000-0000-0000-0000000ab030',
    'products/00000000-0000-0000-0000-0000000ab030/11111111-1111-4111-8111-111111111111.webp'),
  null,
  'opzet: het product krijgt een afbeelding'
);
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030',
       'products/00000000-0000-0000-0000-0000000ab030/99999999-9999-4999-8999-999999999999.webp') $$,
  'P0001', 'image_not_found',
  'vervangen door een pad zonder object wordt geweigerd ...'
);
reset role;

select is(
  (select image_path from products where id = '00000000-0000-0000-0000-0000000ab030'),
  'products/00000000-0000-0000-0000-0000000ab030/11111111-1111-4111-8111-111111111111.webp',
  '... en de bestaande afbeelding staat er nog'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000ab011', 'beheer', 'aal2');
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030', null) $$,
  'P0001', 'no_admin_role',
  'een bardienst die de afbeelding wil weghalen: no_admin_role ...'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000ab010', 'beheer', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-0000000ab030', null) $$,
  'P0001', 'aal2_required',
  '... een beheerder op aal1 ook: aal2_required ...'
);
reset role;

select is(
  (select image_path from products where id = '00000000-0000-0000-0000-0000000ab030'),
  'products/00000000-0000-0000-0000-0000000ab030/11111111-1111-4111-8111-111111111111.webp',
  '... en de afbeelding staat er nog steeds'
);

-- ── set_product_image raakt alleen image_path ────────────────────────────

select is(
  (select row(name, category, price_cents, archived)::text
     from products where id = '00000000-0000-0000-0000-0000000ab030'),
  row('PAN Pils'::text, 'Bier'::text, 250, false)::text,
  'naam, categorie, prijs en archiefstatus zijn onveranderd'
);

select is(
  (select count(*)::int from storage.objects
    where name like 'products/00000000-0000-0000-0000-0000000ab030/%'),
  2,
  'set_product_image verwijdert of maakt zelf geen object (dat doet de server-actie)'
);

select * from finish();
rollback;
