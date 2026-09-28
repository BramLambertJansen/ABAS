-- Bar-RPC's weigeren een lid-sessie (A2 uit docs/features/bar-rpc-autorisatie.md).
--
-- top_up, place_order en reverse_order_at_bar controleerden alleen dát er een
-- sessie is (0018), niet wélke. Sinds portal-login (#15, 0022) kan een lid
-- inloggen, en alles wat die RPC's nodig hebben is voor een lid leesbaar: het
-- eigen members.id (ADR 0007), een open shift_id en een served_by uit
-- shifts/shift_members (`using (true)`). Gevolg: een lid kon zichzelf
-- onbeperkt opwaarderen (de €500 uit 0016 geldt per aanroep) en de eigen
-- bestellingen terugdraaien.
--
-- A2 is een denylist op `caller_is_lid()` (0015). De gedeelde device-sessie
-- (geen members-rij) en bardienst/beheerder vallen erbuiten en werken als
-- voorheen. Voldoende zolang publieke signup op het gehoste project uit staat
-- — anders heeft een zelf aangemaakt account ook geen members-rij en lijkt het
-- op de tablet. Bram heeft bevestigd dat signup uit staat (2026-09-28). A3
-- (expliciet device-account, allowlist) vervangt dit later.
--
-- Functielichamen zijn 1-op-1 overgenomen uit 0016/0017/0020 met alleen de
-- guard erbij. Zelfde signatuur, dus de grants (0001/0018/0020) blijven staan;
-- rpc_execute_grants.test.sql bewaakt dat.

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
  -- €500. Als losse constante in het functielichaam in plaats van een magic
  -- number in de vergelijking, zodat de grens één plek heeft om te wijzigen
  -- en in de foutafhandeling hieronder herbruikbaar blijft. De client kent
  -- dezelfde waarde als TOP_UP_MAX_CENTS (src/features/opwaarderen/
  -- messages.ts) om de knop al vóór de aanroep te blokkeren — dit is de
  -- afdwinging, dat is de UX.
  c_max_amount_cents constant integer := 50000;
  v_top_up top_ups;
begin
  -- 0023: bar-RPC's zijn niet voor een lid-sessie (A2,
  -- docs/features/bar-rpc-autorisatie.md). Vóór alle andere checks, zodat
  -- een lid niets leert over diensten of bestellingen uit de foutcode.
  if caller_is_lid() then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if not is_shift_member(p_shift_id, p_served_by) then
    raise exception 'served_by_not_on_shift' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_amount_cents > c_max_amount_cents then
    raise exception 'amount_exceeds_max' using errcode = 'P0001';
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
  -- De enige lezing van elke productprijs, vastgelegd op het moment van
  -- valideren. Alles wat daarna naar order_lines geschreven wordt komt
  -- hieruit, nooit opnieuw uit `products`.
  v_resolved jsonb := '[]'::jsonb;
  v_member members;
  v_negative_limit integer;
  v_order orders;
begin
  -- 0023: bar-RPC's zijn niet voor een lid-sessie (A2,
  -- docs/features/bar-rpc-autorisatie.md). Vóór alle andere checks, zodat
  -- een lid niets leert over diensten of bestellingen uit de foutcode.
  if caller_is_lid() then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
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
    v_resolved := v_resolved || jsonb_build_object(
      'product_id', v_product.id,
      'qty', v_qty,
      'unit_cents', v_product.price_cents
    );
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

  insert into order_lines (order_id, product_id, qty, unit_cents)
  select
    v_order.id,
    (r->>'product_id')::uuid,
    (r->>'qty')::integer,
    (r->>'unit_cents')::integer
  from jsonb_array_elements(v_resolved) as r;

  return v_order;
end;
$$;

create or replace function reverse_order_at_bar(
  p_order_id uuid,
  p_shift_id uuid,
  p_reason text,
  p_reversed_by uuid
)
returns order_reversals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reversal order_reversals;
begin
  -- 0023: bar-RPC's zijn niet voor een lid-sessie (A2,
  -- docs/features/bar-rpc-autorisatie.md). Vóór alle andere checks, zodat
  -- een lid niets leert over diensten of bestellingen uit de foutcode.
  if caller_is_lid() then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;

  -- `for update`: twee gelijktijdige terugdraaiingen van dezelfde bestelling
  -- wachten op elkaar, en de tweede ziet daarna de reversal-rij van de
  -- eerste (already_reversed hieronder). De primary key is de backstop.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.shift_id <> p_shift_id then
    raise exception 'order_not_in_shift' using errcode = 'P0001';
  end if;
  if not is_shift_member(p_shift_id, p_reversed_by) then
    raise exception 'reversed_by_not_on_shift' using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;
  if exists (select 1 from order_reversals where order_id = p_order_id) then
    raise exception 'already_reversed' using errcode = 'P0001';
  end if;

  -- Ook naar een inmiddels gearchiveerd lid: het geld is van het lid.
  -- member_id null (gastverkoop) heeft geen saldo om terug te boeken.
  if v_order.member_id is not null then
    update members set balance_cents = balance_cents + v_order.total_cents
      where id = v_order.member_id;
  end if;

  insert into order_reversals (order_id, reason, reversed_by, via, shift_id, refunded_cents)
  values (p_order_id, v_reason, p_reversed_by, 'bar', p_shift_id,
          case when v_order.member_id is null then 0 else v_order.total_cents end)
  returning * into v_reversal;

  return v_reversal;
end;
$$;
