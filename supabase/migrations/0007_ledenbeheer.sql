-- Ledenbeheer (member CRUD), docs/features/ledenbeheer.md — geen
-- issuenummer toegewezen op het moment van bouwen (zie spec-intro).
--
-- Geen schemawijziging: alle kolommen die dit ticket nodig heeft bestaan al
-- (`name`, `role`, `balance_cents`, `archived`, `0001_init.sql`). `members`
-- staat ook al sinds diezelfde migratie in de blanket-REVOKE (regel 137) —
-- geen nieuwe REVOKE hier, in tegenstelling tot #14's `products`-REVOKE (zie
-- spec → Datamodel, expliciet vermeld zodat dit niet per ongeluk dubbel
-- toegevoegd wordt).
--
-- Vier nieuwe beheerder-only RPC's (create_member/update_member_name/
-- set_member_archived/set_member_role), 1-op-1 gekopieerd van
-- create_product/update_product_price/set_product_archived
-- (0005_assortimentbeheer.sql) / update_negative_limit
-- (0006_negatieve_saldolimiet.sql)'s ADR-0002-actorcheck-vorm — inclusief
-- het `select * into v_actor` (niet een kolom-subset) post-implementatie-
-- patroon, zie ADR 0002 → "Post-implementatie fix" voor waarom dat verplicht
-- is bij een row-typed PL/pgSQL-variabele.

create or replace function create_member(
  p_name text,
  p_starting_balance_cents integer
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_balance_cents integer;
  v_member members;
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

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  -- Geen startsaldo (null) is het normale geval -> 0. Negatief mag nooit —
  -- dat is wat de negatieflimiet-instelling regelt voor *bestellen*, niet
  -- voor aanmaken (spec → RPC's).
  v_balance_cents := coalesce(p_starting_balance_cents, 0);
  if v_balance_cents < 0 then
    raise exception 'invalid_starting_balance' using errcode = 'P0001';
  end if;

  insert into members (name, role, balance_cents, pin_hash, auth_user_id, archived)
  values (v_name, 'lid', v_balance_cents, null, null, false)
  returning * into v_member;

  return v_member;
end;
$$;

create or replace function update_member_name(
  p_member_id uuid,
  p_name text
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_member members;
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

  -- Geen eis dat het lid niet gearchiveerd is — een gearchiveerd lid blijft
  -- naam-bewerkbaar, zelfde redenering als update_product_price op een
  -- gearchiveerd product (spec → Randgevallen).
  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  update members set name = v_name where id = p_member_id
    returning * into v_member;

  return v_member;
end;
$$;

create or replace function set_member_archived(
  p_member_id uuid,
  p_archived boolean
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_member members;
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

  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  -- Zelfreferentie-guard, nieuw t.o.v. het assortimentbeheer-precedent: een
  -- beheerder die zichzelf archiveert zou zichzelf bij de eerstvolgende
  -- RPC-aanroep als actor_not_found buitensluiten, zonder RPC-pad terug (spec
  -- → Randgevallen "self_archive_forbidden"). Alleen bij het daadwerkelijk
  -- archiveren van de eigen rij blokkeren — de eigen rij terugzetten
  -- (p_archived = false) kan sowieso niet voorkomen zolang de actor-check
  -- hierboven al `not archived` eist, maar wordt hier niet apart uitgesloten.
  if p_member_id = v_actor.id and p_archived then
    raise exception 'self_archive_forbidden' using errcode = 'P0001';
  end if;

  -- Client stuurt de expliciete eindstaat (geen toggle) — idempotent, zelfde
  -- verdraagzaamheid als set_product_archived.
  update members set archived = p_archived where id = p_member_id
    returning * into v_member;

  return v_member;
end;
$$;

create or replace function set_member_role(
  p_member_id uuid,
  p_role text
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_role text;
  v_member members;
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

  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  -- Client stuurt de gewenste rol als tekst, niet als member_role — een
  -- ongeldige waarde moet een nette Nederlandse boodschap opleveren, niet
  -- een rauwe Postgres-enum-castfout (spec → RPC's, zelfde reden als
  -- create_product's p_price_cents-voorvalidatie).
  v_role := trim(p_role);
  if v_role is null or v_role not in ('lid', 'bardienst', 'beheerder') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;

  -- Zelfreferentie-guard, zelfde soort risico als self_archive_forbidden
  -- hierboven: een beheerder die de eigen rol verlaagt zou zichzelf bij de
  -- eerstvolgende RPC-aanroep/login als no_admin_role buitensluiten, zonder
  -- RPC-pad terug (spec → Randgevallen "self_demote_forbidden"). Dezelfde
  -- rol opnieuw sturen ('beheerder' -> 'beheerder') is geen degradatie en
  -- valt samen met de idempotentie hieronder, dus niet geblokkeerd.
  if p_member_id = v_actor.id and v_role <> 'beheerder' then
    raise exception 'self_demote_forbidden' using errcode = 'P0001';
  end if;

  -- Update alleen members.role — raakt nooit pin_hash/balance_cents/archived
  -- of shift_members/is_shift_member() (spec → Randgevallen). Idempotent:
  -- v_role gelijk aan de huidige rol slaagt gewoon, geen wijziging.
  update members set role = v_role::member_role where id = p_member_id
    returning * into v_member;

  return v_member;
end;
$$;

grant execute on function create_member, update_member_name, set_member_archived, set_member_role
  to authenticated;
