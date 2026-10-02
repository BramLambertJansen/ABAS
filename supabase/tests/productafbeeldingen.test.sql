-- Productafbeeldingen (docs/features/productafbeeldingen.md, 0038, ADR 0018).
--
--   * de bucket `product-images` staat zoals besloten (publiek, alleen WebP,
--     1 MB);
--   * invariant over álle buckets: storage.objects heeft geen schrijfpolicy
--     (ADR 0018 → punt 1), dus ook een beheerder in de sterkste sessie (modus
--     beheer, aal2) en anon kunnen niet rechtstreeks schrijven;
--   * products.image_path is niet rechtstreeks te schrijven;
--   * set_product_image: guards, pad- en bestaanscheck, en het vorige pad als
--     antwoord.
--
-- Objecten voor de testopzet worden als `postgres` in storage.objects gezet
-- (in de app doet de Storage-API dat). Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(31);

-- ── Sessie-helper (zelfde vorm als beheer_rpcs_modus.test.sql) ─────────────
-- Registreert voor het lid van `p_auth_user` een sessie in `p_mode` en zet de
-- JWT-claims, met `p_aal` als aal-claim.
create function pg_temp.act_as(p_auth_user uuid, p_mode text, p_aal text)
returns void
language plpgsql
as $fn$
declare
  v_member uuid;
begin
  select id into v_member from members where auth_user_id = p_auth_user;
  if v_member is not null then
    insert into bar_sessions (auth_session_id, member_id, mode)
    values (p_auth_user, v_member, p_mode)
    on conflict (auth_session_id) do update set mode = excluded.mode;
  end if;
  perform set_config('request.jwt.claim.sub', p_auth_user::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_auth_user::text, 'session_id', p_auth_user::text, 'aal', p_aal)::text,
    true
  );
end;
$fn$;

create function pg_temp.geen_sessie()
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a999', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-00000000a999', 'session_id',
      '00000000-0000-0000-0000-00000000a998', 'aal', 'aal2')::text,
    true
  );
end;
$fn$;

-- ── Fixtures ──────────────────────────────────────────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-00000000a010', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pa-admin@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pa-bar@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-00000000a012', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pa-admin-bar@test.local', crypt('x', gen_salt('bf')), now(),
   now(), now(), '{"provider":"email","providers":["email"]}', '{}');

insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-00000000a020', 'PA Admin', 'beheerder', null, 0, false,
   '00000000-0000-0000-0000-00000000a010'),
  ('00000000-0000-0000-0000-00000000a021', 'PA Bar', 'bardienst', null, 0, false,
   '00000000-0000-0000-0000-00000000a011'),
  ('00000000-0000-0000-0000-00000000a022', 'PA Admin Bar', 'beheerder', null, 0, false,
   '00000000-0000-0000-0000-00000000a012');

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-00000000a030', 'PA Pils', 'Bier', 250, false),
  ('00000000-0000-0000-0000-00000000a031', 'PA Oud', 'Bier', 250, true);

-- Drie objecten onder het eerste product, één onder het tweede.
insert into storage.objects (bucket_id, name) values
  ('product-images', 'products/00000000-0000-0000-0000-00000000a030/11111111-1111-4111-8111-111111111111.webp'),
  ('product-images', 'products/00000000-0000-0000-0000-00000000a030/22222222-2222-4222-8222-222222222222.webp'),
  ('product-images', 'products/00000000-0000-0000-0000-00000000a031/33333333-3333-4333-8333-333333333333.webp');

-- ── Bucket ───────────────────────────────────────────────────────────────

select is(
  (select row(public, file_size_limit, allowed_mime_types)::text
     from storage.buckets where id = 'product-images'),
  row(true, 1048576::bigint, array['image/webp']::text[])::text,
  'bucket product-images: publiek, 1 MB, alleen image/webp'
);

-- ── Invariant: geen schrijfpolicy op storage.objects (ADR 0018) ──────────

select is(
  (select coalesce(array_agg(policyname::text order by policyname), '{}') from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  '{}'::text[],
  'storage.objects heeft voor geen enkele bucket een schrijfpolicy'
);

-- ── Direct schrijven naar Storage: geweigerd ─────────────────────────────

-- De sterkste sessie die er is: een beheerder in modus beheer met aal2.
select pg_temp.act_as('00000000-0000-0000-0000-00000000a010', 'beheer', 'aal2');
set local role authenticated;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('product-images', 'products/00000000-0000-0000-0000-00000000a030/44444444-4444-4444-8444-444444444444.webp') $$,
  '42501',
  null,
  'authenticated (beheer, aal2) kan geen object rechtstreeks toevoegen'
);

-- Zonder policy raakt een update 0 rijen in plaats van te falen; dat
-- er niets veranderde, toetst de telling na de pogingen hieronder.
select lives_ok(
  $$ update storage.objects set name = name || '.x' where bucket_id = 'product-images' $$,
  'authenticated (beheer, aal2): een update raakt geen enkel object'
);

select throws_ok(
  $$ delete from storage.objects where bucket_id = 'product-images' $$,
  '42501',
  null,
  'authenticated (beheer, aal2) kan geen object rechtstreeks verwijderen'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'product-images'),
  0,
  'authenticated ziet geen objecten via de API (geen select-policy)'
);

select throws_ok(
  $$ update products set image_path = null where id = '00000000-0000-0000-0000-00000000a030' $$,
  '42501',
  'permission denied for table products',
  'authenticated kan products.image_path niet rechtstreeks schrijven'
);

reset role;
set local role anon;

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('product-images', 'products/00000000-0000-0000-0000-00000000a030/55555555-5555-4555-8555-555555555555.webp') $$,
  '42501',
  null,
  'anon kan geen object rechtstreeks toevoegen'
);

-- Zonder policy raakt een update 0 rijen in plaats van te falen; dat
-- er niets veranderde, toetst de telling na de pogingen hieronder.
select lives_ok(
  $$ update storage.objects set name = name || '.x' where bucket_id = 'product-images' $$,
  'anon: een update raakt geen enkel object'
);

select throws_ok(
  $$ delete from storage.objects where bucket_id = 'product-images' $$,
  '42501',
  null,
  'anon kan geen object rechtstreeks verwijderen'
);

reset role;

select is(
  (select array_agg(name order by name) from storage.objects
    where bucket_id = 'product-images'),
  array[
    'products/00000000-0000-0000-0000-00000000a030/11111111-1111-4111-8111-111111111111.webp',
    'products/00000000-0000-0000-0000-00000000a030/22222222-2222-4222-8222-222222222222.webp',
    'products/00000000-0000-0000-0000-00000000a031/33333333-3333-4333-8333-333333333333.webp'
  ],
  'na de pogingen staan precies de drie objecten er nog, ongewijzigd'
);

-- ── set_product_image: guards ────────────────────────────────────────────

select pg_temp.geen_sessie();
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-00000000a030', null) $$,
  'P0001', 'no_bar_session',
  'zonder geregistreerde sessie: no_bar_session'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a012', 'bar', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-00000000a030', null) $$,
  'P0001', 'wrong_mode',
  'een beheerder in modus bar (PIN-sessie): wrong_mode'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a010', 'beheer', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-00000000a030', null) $$,
  'P0001', 'aal2_required',
  'een beheersessie op aal1: aal2_required'
);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a011', 'beheer', 'aal2');
set local role authenticated;
select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-00000000a030', null) $$,
  'P0001', 'no_admin_role',
  'een bardienst: no_admin_role'
);
reset role;

select is(
  (select image_path from products where id = '00000000-0000-0000-0000-00000000a030'),
  null,
  'na de geweigerde aanroepen is image_path nog leeg'
);

-- ── set_product_image: invoer ────────────────────────────────────────────

select pg_temp.act_as('00000000-0000-0000-0000-00000000a010', 'beheer', 'aal2');
set local role authenticated;

select throws_ok(
  $$ select set_product_image(gen_random_uuid(), null) $$,
  'P0001', 'product_not_found',
  'onbekend product: product_not_found'
);

select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-00000000a030',
       'products/00000000-0000-0000-0000-00000000a031/33333333-3333-4333-8333-333333333333.webp') $$,
  'P0001', 'invalid_image_path',
  'een pad onder een ander product: invalid_image_path'
);

select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-00000000a030',
       'products/00000000-0000-0000-0000-00000000a030/11111111-1111-4111-8111-111111111111.png') $$,
  'P0001', 'invalid_image_path',
  'een andere extensie: invalid_image_path'
);

select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-00000000a030',
       'products/00000000-0000-0000-0000-00000000a030/../00000000-0000-0000-0000-00000000a031/33333333-3333-4333-8333-333333333333.webp') $$,
  'P0001', 'invalid_image_path',
  'een pad met ../: invalid_image_path'
);

select throws_ok(
  $$ select set_product_image('00000000-0000-0000-0000-00000000a030',
       'products/00000000-0000-0000-0000-00000000a030/99999999-9999-4999-8999-999999999999.webp') $$,
  'P0001', 'image_not_found',
  'een geldig pad zonder object: image_not_found'
);

-- ── set_product_image: de gewone gevallen ────────────────────────────────

select is(
  set_product_image('00000000-0000-0000-0000-00000000a030',
    'products/00000000-0000-0000-0000-00000000a030/11111111-1111-4111-8111-111111111111.webp'),
  null,
  'eerste keer zetten: er was geen vorig pad'
);

select is(
  (select image_path from products where id = '00000000-0000-0000-0000-00000000a030'),
  'products/00000000-0000-0000-0000-00000000a030/11111111-1111-4111-8111-111111111111.webp',
  'het pad staat op het product'
);

select is(
  set_product_image('00000000-0000-0000-0000-00000000a030',
    'products/00000000-0000-0000-0000-00000000a030/11111111-1111-4111-8111-111111111111.webp'),
  'products/00000000-0000-0000-0000-00000000a030/11111111-1111-4111-8111-111111111111.webp',
  'hetzelfde pad opnieuw zetten geeft dat pad terug (no-op)'
);

select is(
  set_product_image('00000000-0000-0000-0000-00000000a030',
    'products/00000000-0000-0000-0000-00000000a030/22222222-2222-4222-8222-222222222222.webp'),
  'products/00000000-0000-0000-0000-00000000a030/11111111-1111-4111-8111-111111111111.webp',
  'vervangen geeft het vorige pad terug'
);

select is(
  (select image_path from products where id = '00000000-0000-0000-0000-00000000a030'),
  'products/00000000-0000-0000-0000-00000000a030/22222222-2222-4222-8222-222222222222.webp',
  'na vervangen staat het nieuwe pad op het product'
);

select is(
  set_product_image('00000000-0000-0000-0000-00000000a030', null),
  'products/00000000-0000-0000-0000-00000000a030/22222222-2222-4222-8222-222222222222.webp',
  'weghalen geeft het vorige pad terug'
);

select is(
  (select image_path from products where id = '00000000-0000-0000-0000-00000000a030'),
  null,
  'na weghalen is image_path leeg'
);

select is(
  set_product_image('00000000-0000-0000-0000-00000000a030', null),
  null,
  'weghalen zonder afbeelding: null terug (idempotent)'
);

select is(
  set_product_image('00000000-0000-0000-0000-00000000a031',
    'products/00000000-0000-0000-0000-00000000a031/33333333-3333-4333-8333-333333333333.webp'),
  null,
  'een gearchiveerd product mag een afbeelding krijgen'
);

reset role;

-- ── De kolom zelf: de constraint houdt een pad van een ander product tegen ─

select throws_ok(
  $$ update products
        set image_path = 'products/00000000-0000-0000-0000-00000000a031/33333333-3333-4333-8333-333333333333.webp'
      where id = '00000000-0000-0000-0000-00000000a030' $$,
  '23514',
  null,
  'ook buiten de RPC om past alleen een pad onder het eigen product (check-constraint)'
);

select * from finish();
rollback;
