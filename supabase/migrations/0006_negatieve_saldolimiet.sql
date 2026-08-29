-- Negatieve-saldolimiet instellen (issue #11,
-- docs/features/negatieve-saldolimiet.md). Geen schemawijziging —
-- `app_settings.negative_limit_cents` bestaat al sinds 0001_init.sql
-- (`integer not null default 0 check (negative_limit_cents >= 0)`) en is al
-- sinds 0004_revoke_app_settings_writes.sql `REVOKE`d voor
-- insert/update/delete van `authenticated`. `place_order` leest en handhaaft
-- deze kolom ook al ongewijzigd. Deze migratie voegt alleen het schrijfpad
-- toe dat vandaag ontbrak: één beheerder-only RPC.
--
-- 1-op-1 gekopieerd van create_product/update_product_price/
-- set_product_archived (0005_assortimentbeheer.sql)'s ADR-0002-actorcheck-
-- vorm, niet gegeneraliseerd naar een gedeelde helper — zelfde
-- "geen vroegtijdige extractie zonder een derde onafhankelijke reden"-
-- afweging als elders in deze codebase (zie spec → RPC's).

create or replace function update_negative_limit(p_negative_limit_cents integer)
returns app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_settings app_settings;
begin
  select * into v_actor
  from members
  where auth_user_id = auth.uid() and not archived;

  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  if p_negative_limit_cents is null or p_negative_limit_cents < 0 then
    raise exception 'invalid_negative_limit' using errcode = 'P0001';
  end if;

  update app_settings set negative_limit_cents = p_negative_limit_cents
    returning * into v_settings;

  return v_settings;
end;
$$;

grant execute on function update_negative_limit to authenticated;
