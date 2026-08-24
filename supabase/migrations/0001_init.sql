-- ABAS — initial schema.
-- Implements CLAUDE.md → Architectuurbeslissingen + docs/ARCHITECTURE.md
-- "Money & attribution" and "Dienst & bezetting" exactly:
--   * money moves only via the RPCs at the bottom of this file
--   * money tables are REVOKEd from `authenticated` — direct writes are
--     impossible, not just discouraged
--   * `served_by` is validated against the active shift's roster
--     server-side; PIN is checked only when starting a shift
--   * order_lines.unit_cents freezes price at order time
--
-- Single organization (Aurora only) — no org_id / multi-tenant scoping,
-- see docs/ARCHITECTURE.md "Money & attribution" → Settled.

create extension if not exists pgcrypto;

-- ── Roles ────────────────────────────────────────────────────────────────
-- Exactly three, per CLAUDE.md → Domein. Do not add barmanager/boekhouder
-- here without an ADR — the prototype had them, this rebuild deliberately
-- doesn't.
create type member_role as enum ('lid', 'bardienst', 'beheerder');

-- ── Core tables ──────────────────────────────────────────────────────────

create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role member_role not null default 'lid',
  -- null for a 'lid' who has never been given bar/beheer access. Hashed
  -- with pgcrypto's crypt()/gen_salt('bf') — never stored or compared in
  -- plaintext. See docs/ARCHITECTURE.md "Money & attribution" → Still open
  -- (PIN storage) — this is the assumed implementation, not yet reviewed.
  pin_hash text,
  balance_cents integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Single-row settings table (the `id boolean primary key default true
-- check (id)` trick — only one row can ever exist).
create table app_settings (
  id boolean primary key default true check (id),
  -- Beheerder-managed, systemwide (not per-lid). €0 is a valid value and
  -- behaves as "never negative" — see CLAUDE.md → Domein.
  negative_limit_cents integer not null default 0 check (negative_limit_cents >= 0),
  -- Fixed/systemwide low-balance warning threshold, NOT a beheerder
  -- setting per CLAUDE.md → Domein (€10).
  low_balance_threshold_cents integer not null default 1000
);
insert into app_settings (id) values (true);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price_cents integer not null check (price_cents > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- A "dienst". Starting one is the one real authentication event — see
-- docs/ARCHITECTURE.md "Dienst & bezetting".
create table shifts (
  id uuid primary key default gen_random_uuid(),
  started_by uuid not null references members(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- The "bezetting" — who's on a shift. Adding someone here requires no PIN
-- or confirmation from them (CLAUDE.md → Architectuurbeslissingen).
-- Changeable mid-shift, not fixed at start (docs/ARCHITECTURE.md, settled).
create table shift_members (
  shift_id uuid not null references shifts(id),
  member_id uuid not null references members(id),
  added_at timestamptz not null default now(),
  primary key (shift_id, member_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id),
  -- null = guest/pin sale, no balance touched (see place_order below).
  member_id uuid references members(id),
  served_by uuid not null references members(id),
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now()
);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  product_id uuid not null references products(id),
  qty integer not null check (qty > 0),
  -- Frozen at order time — later price changes never touch this row. See
  -- CLAUDE.md → Domein "Prijswijzigingen raken historie niet."
  unit_cents integer not null check (unit_cents > 0)
);

create table top_ups (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id),
  member_id uuid not null references members(id),
  amount_cents integer not null check (amount_cents > 0),
  method text not null,
  served_by uuid not null references members(id),
  created_at timestamptz not null default now()
);

-- ── RLS: every table, no exceptions (check:rls) ─────────────────────────

alter table members enable row level security;
alter table app_settings enable row level security;
alter table products enable row level security;
alter table shifts enable row level security;
alter table shift_members enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table top_ups enable row level security;

-- Read access: single-tenant, so any authenticated session (today: the
-- one per-tablet device account, see docs/ARCHITECTURE.md) can read
-- everything. Tighten per-row (e.g. a portal member reading only their own
-- row) when the portal shell is actually specced — not yet.
create policy members_select on members for select to authenticated using (true);
create policy app_settings_select on app_settings for select to authenticated using (true);
create policy products_select on products for select to authenticated using (true);
create policy shifts_select on shifts for select to authenticated using (true);
create policy shift_members_select on shift_members for select to authenticated using (true);
create policy orders_select on orders for select to authenticated using (true);
create policy order_lines_select on order_lines for select to authenticated using (true);
create policy top_ups_select on top_ups for select to authenticated using (true);

-- Writes: nothing is granted to `authenticated` on any table above — no
-- insert/update/delete policy exists for that role on any of them. Belt and
-- braces beyond RLS (RLS can be bypassed by a table owner/superuser; REVOKE
-- cannot) on the tables where that matters most:
revoke insert, update, delete on members, orders, order_lines, top_ups, shifts, shift_members from authenticated;

-- ── RPCs — the only way any of the above gets written ───────────────────

create or replace function is_shift_member(p_shift_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shift_members
    where shift_id = p_shift_id and member_id = p_member_id
  );
$$;

create or replace function start_shift(p_member_id uuid, p_pin text)
returns shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member members;
  v_shift shifts;
begin
  select * into v_member from members where id = p_member_id and not archived;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if v_member.role not in ('bardienst', 'beheerder') then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
  if v_member.pin_hash is null or crypt(p_pin, v_member.pin_hash) <> v_member.pin_hash then
    raise exception 'invalid_pin' using errcode = 'P0001';
  end if;

  insert into shifts (started_by) values (p_member_id) returning * into v_shift;
  insert into shift_members (shift_id, member_id) values (v_shift.id, p_member_id);
  return v_shift;
end;
$$;

create or replace function end_shift(p_shift_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update shifts set ended_at = now() where id = p_shift_id and ended_at is null;
$$;

create or replace function add_shift_member(p_shift_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from members
    where id = p_member_id and not archived and role in ('bardienst', 'beheerder')
  ) then
    raise exception 'member_not_eligible' using errcode = 'P0001';
  end if;
  insert into shift_members (shift_id, member_id)
  values (p_shift_id, p_member_id)
  on conflict do nothing;
end;
$$;

create or replace function remove_shift_member(p_shift_id uuid, p_member_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from shift_members where shift_id = p_shift_id and member_id = p_member_id;
$$;

-- p_lines: jsonb array of {"product_id": uuid, "qty": int}. Client sends
-- product ids and quantities only — never a price or a total. p_member_id
-- null = guest/pin sale (no balance touched, just revenue).
create or replace function place_order(
  p_shift_id uuid,
  p_member_id uuid,
  p_lines jsonb,
  p_served_by uuid
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_product products;
  v_qty integer;
  v_total integer := 0;
  v_member members;
  v_negative_limit integer;
  v_order orders;
begin
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if not is_shift_member(p_shift_id, p_served_by) then
    raise exception 'served_by_not_on_shift' using errcode = 'P0001';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  -- Validate lines and compute the server-side total before writing
  -- anything — never trust a client-sent price or total.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_qty' using errcode = 'P0001';
    end if;
    select * into v_product from products
      where id = (v_line->>'product_id')::uuid and not archived;
    if not found then
      raise exception 'product_not_available' using errcode = 'P0001';
    end if;
    v_total := v_total + v_product.price_cents * v_qty;
  end loop;

  if p_member_id is not null then
    select * into v_member from members where id = p_member_id and not archived
      for update;
    if not found then
      raise exception 'member_not_found' using errcode = 'P0001';
    end if;
    select negative_limit_cents into v_negative_limit from app_settings;
    if v_member.balance_cents - v_total < -v_negative_limit then
      raise exception 'insufficient_balance' using errcode = 'P0001';
    end if;
    update members set balance_cents = balance_cents - v_total where id = p_member_id;
  end if;

  insert into orders (shift_id, member_id, served_by, total_cents)
  values (p_shift_id, p_member_id, p_served_by, v_total)
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line->>'qty')::integer;
    select * into v_product from products where id = (v_line->>'product_id')::uuid;
    insert into order_lines (order_id, product_id, qty, unit_cents)
    values (v_order.id, v_product.id, v_qty, v_product.price_cents);
  end loop;

  return v_order;
end;
$$;

create or replace function top_up(
  p_shift_id uuid,
  p_member_id uuid,
  p_amount_cents integer,
  p_method text,
  p_served_by uuid
)
returns top_ups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top_up top_ups;
begin
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if not is_shift_member(p_shift_id, p_served_by) then
    raise exception 'served_by_not_on_shift' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if not exists (select 1 from members where id = p_member_id and not archived) then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  update members set balance_cents = balance_cents + p_amount_cents where id = p_member_id;

  insert into top_ups (shift_id, member_id, amount_cents, method, served_by)
  values (p_shift_id, p_member_id, p_amount_cents, p_method, p_served_by)
  returning * into v_top_up;

  return v_top_up;
end;
$$;

grant execute on function start_shift, end_shift, add_shift_member, remove_shift_member,
  place_order, top_up, is_shift_member to authenticated;
