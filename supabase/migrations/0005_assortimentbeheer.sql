-- Assortimentbeheer (issue #14, docs/features/assortimentbeheer.md).
-- Two independent pieces, per the spec:
--   1. `members.auth_user_id` — the column ADR 0002/0003's beheer-sessie
--      mechanism needs (auth.uid() -> a specific members row), planned
--      under issue #24's "Lid-accounts" but built here, minimally, per the
--      spec's own decision (see spec intro + ADR 0003 → scope-splitsing).
--      `unique`: an auth.users row identifies at most one members row —
--      the actor-check below does `select ... into` without STRICT, which
--      would otherwise silently pick one of several matching rows instead
--      of failing loudly. Multiple members with a null auth_user_id is
--      still fine (a lid without e-mail never gets one) — `unique` allows
--      any number of NULLs, only non-null values must be distinct.
--   2. create_product/update_product_price/set_product_archived — the
--      three beheerder-only RPCs, each following ADR 0002's auth.uid()
--      actor-check (no more p_actor_member_id/p_actor_pin, that was ADR
--      0001, superseded).
--
-- New, sequentially-numbered migration — 0004 on `main` is already
-- `0004_revoke_app_settings_writes.sql` (unrelated, merged after this
-- branch started), so this is 0005. 0001_init.sql itself is never edited,
-- same pattern as 0002/0003/0004.

alter table members add column auth_user_id uuid unique references auth.users(id);

-- Belt-and-braces REVOKE for products, for symmetry with the money tables'
-- REVOKE in 0001_init.sql (regel 133-137) — functionally a no-op today (no
-- insert/update/delete policy exists for `authenticated` on `products`
-- either, so RLS already blocks this), it only makes explicit that this
-- can't quietly open back up via a future policy without someone also
-- having to revert this REVOKE. See spec → Datamodel.
revoke insert, update, delete on products from authenticated;

-- ── Beheerder-only RPCs ──────────────────────────────────────────────────
-- All three verify the caller via auth.uid() -> members.auth_user_id ->
-- role = 'beheerder', per ADR 0002. Same two error codes ADR 0001 already
-- used (actor_not_found, no_admin_role) — no invalid_pin anymore, Supabase
-- Auth already verified the identity at /beheer's login step.
--
-- Actor lookup below is `select * into v_actor` (v_actor is `members`,
-- a full-row-typed variable), not `select id, role into v_actor` — the
-- latter left v_actor.role unset (null) for a matching row, so
-- `v_actor.role <> 'beheerder'` evaluated to null, not true, and the IF
-- never fired: any bardienst caller with a linked auth_user_id passed the
-- role check silently. Caught by a real db:test run (assortimentbeheer.test.sql,
-- "rejects a caller whose role is bardienst" — tests 2/9/20), not visible
-- from check:rls or reading the code casually.

create or replace function create_product(
  p_name text,
  p_category text,
  p_price_cents integer
)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_category text;
  v_product products;
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

  v_category := trim(p_category);
  if v_category is null or v_category = '' then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;

  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;

  insert into products (name, category, price_cents, archived)
  values (v_name, v_category, p_price_cents, false)
  returning * into v_product;

  return v_product;
end;
$$;

create or replace function update_product_price(
  p_product_id uuid,
  p_price_cents integer
)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_product products;
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

  -- No "not archived" requirement here — a gearchiveerd product stays
  -- price-editable, see spec → Randgevallen.
  select * into v_product from products where id = p_product_id;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;

  -- Only price_cents — never touches order_lines/orders, so already-frozen
  -- unit_cents on existing order_lines rows stay exactly as they were (spec
  -- → Randgevallen "Regressietest prijs-freeze").
  update products set price_cents = p_price_cents where id = p_product_id
    returning * into v_product;

  return v_product;
end;
$$;

create or replace function set_product_archived(
  p_product_id uuid,
  p_archived boolean
)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_product products;
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

  select * into v_product from products where id = p_product_id;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  -- Client sends the explicit desired end state, not a toggle — same style
  -- as place_order's explicit p_lines (spec → RPC's). Idempotent: setting
  -- an already-archived product to archived again just succeeds, same
  -- tolerance as add_shift_member's `on conflict do nothing`.
  update products set archived = p_archived where id = p_product_id
    returning * into v_product;

  return v_product;
end;
$$;

grant execute on function create_product, update_product_price, set_product_archived
  to authenticated;
