-- Productafbeeldingen (docs/features/productafbeeldingen.md, Bram
-- 2026-10-02; ADR 0018). De eerste bestandsopslag in ABAS.
--
--   * products.image_path: het pad binnen de bucket, nooit een volledige URL
--     (die hangt af van de omgeving). `null` is geen afbeelding. De REVOKE
--     op products uit 0005 dekt de nieuwe kolom vanzelf.
--   * bucket `product-images`: publiek (Besluit 5), alleen WebP (de server
--     codeert elke upload opnieuw, Besluit 6), 1 MB per opgeslagen object.
--     In een migratie en niet in config.toml, zodat lokaal en het gehoste
--     project gelijk lopen (ADR 0018 → punt 3).
--   * geen enkele policy op storage.objects (ADR 0018 → punt 1): schrijven
--     kan alleen de service-role-client in src/lib/productImage.ts, na
--     verificatie van de beheersessie.
--   * set_product_image: zet of wist de verwijzing, met dezelfde guards als
--     update_product_price (0029), en geeft het vorige pad terug zodat de
--     server-actie weet welk object weg mag.

-- ── products.image_path ─────────────────────────────────────────────────

-- Vorm `products/<id van deze rij>/<uuid>.webp`, kleine letters zoals
-- uuid::text en crypto.randomUUID() ze geven. Het eerste uuid moet het id
-- van de eigen rij zijn: een pad van een ander product kan hier niet staan.
alter table products add column image_path text;
alter table products add constraint products_image_path_check check (
  image_path is null
  or image_path ~ (
    '^products/' || id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  )
);

-- ── Bucket ───────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 1048576, array['image/webp']);

-- ── set_product_image ────────────────────────────────────────────────────

create function set_product_image(
  p_product_id uuid,
  p_image_path text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_product products;
begin
  -- Zelfde volgorde als update_product_price (0029): eerst de sessie in
  -- modus beheer met aal2, dan de ADR 0002-actorcheck.
  perform require_beheer_session();
  select * into v_actor
  from members
  where auth_user_id = auth.uid() and not archived;

  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  -- `for update`: twee gelijktijdige vervangingen lopen achter elkaar, en
  -- elke aanroep krijgt zijn eigen voorganger terug (spec → Randgevallen).
  -- Een gearchiveerd product mag een afbeelding krijgen, net als een prijs.
  select * into v_product from products where id = p_product_id for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  if p_image_path is not null then
    if p_image_path !~ (
      '^products/' || p_product_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
    ) then
      raise exception 'invalid_image_path' using errcode = 'P0001';
    end if;
    -- Het object moet echt in de bucket staan: een rechtstreekse aanroep
    -- kan zo niet naar niets of naar een verzonnen pad wijzen.
    if not exists (
      select 1 from storage.objects
       where bucket_id = 'product-images' and name = p_image_path
    ) then
      raise exception 'image_not_found' using errcode = 'P0001';
    end if;
  end if;

  -- Dezelfde waarde opnieuw zetten is een no-op: de aanroeper krijgt dan
  -- het eigen pad terug en ruimt niets op.
  if v_product.image_path is distinct from p_image_path then
    update products set image_path = p_image_path where id = p_product_id;
  end if;

  return v_product.image_path;
end;
$$;

-- Zoals 0018: nooit voor PUBLIC of anon, alleen voor authenticated. De
-- guard hierboven eist daarbovenop een beheersessie.
revoke execute on function set_product_image(uuid, text) from public, anon;
grant execute on function set_product_image(uuid, text) to authenticated;
