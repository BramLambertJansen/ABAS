-- Bestelling terugdraaien — docs/features/bestelling-terugdraaien.md.
--
-- Een hele bestelling terugdraaien boekt `orders.total_cents` terug op het
-- saldo van het lid en legt vast wie het deed en waarom. De bestelling zelf
-- blijft ongewijzigd staan (historie wordt nooit herschreven, zelfde idee
-- als order_lines.unit_cents); de terugdraaiing is een eigen rij in
-- `order_reversals`, en een bestelling met zo'n rij telt niet meer mee als
-- omzet.
--
-- Twee wegen, twee RPC's — elk volgt een bestaand patroon, geen nieuw
-- autorisatiemodel:
--   * reverse_order_at_bar: de gedeelde bar-tablet-sessie, alleen tijdens
--     een open dienst en alleen voor bestellingen van díe dienst. Wie het
--     deed komt uit de actieve bezetting, precies zoals `served_by` bij
--     place_order/top_up (CLAUDE.md → "served_by komt uit de bezetting").
--   * reverse_order_as_admin: een beheerder in de eigen e-mailsessie
--     (ADR 0002), elke bestelling, ook uit een afgesloten dienst. Zelfde
--     auth.uid()-actorcheck als set_member_archived (0010).
--
-- Het bedrag komt in beide gevallen uit de database, nooit van de client:
-- die stuurt alleen een order-id, een reden en (op de bar) wie het deed.

create table order_reversals (
  -- Primary key op order_id: "hooguit één keer teruggedraaid" is een
  -- databasegarantie, niet alleen een check in de RPC.
  order_id uuid primary key references orders(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  reversed_by uuid not null references members(id),
  via text not null check (via in ('bar', 'beheer')),
  -- De open dienst waarin op de bar is teruggedraaid; null via beheer.
  shift_id uuid references shifts(id),
  -- Kopie van orders.total_cents op het moment van terugdraaien — wat er
  -- werkelijk teruggeboekt is, los van de bestelling zelf leesbaar.
  refunded_cents integer not null check (refunded_cents >= 0),
  created_at timestamptz not null default now()
);

alter table order_reversals enable row level security;

-- Zelfde leesregel als orders (0015): niet-lid-rollen en de gedeelde
-- device-sessie lezen alles, een lid alleen de terugdraaiingen van de eigen
-- bestellingen. caller_owns_order() bestaat al sinds 0015.
create policy order_reversals_select on order_reversals for select to authenticated
  using (
    not caller_is_lid()
    or caller_owns_order(order_id)
  );

-- Geldtabel: schrijven uitsluitend via de RPC's hieronder.
revoke insert, update, delete on order_reversals from authenticated;

-- ── reverse_order_at_bar ────────────────────────────────────────────────

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

-- ── reverse_order_as_admin ──────────────────────────────────────────────

create or replace function reverse_order_as_admin(
  p_order_id uuid,
  p_reason text
)
returns order_reversals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_order orders;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reversal order_reversals;
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

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
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

  if v_order.member_id is not null then
    update members set balance_cents = balance_cents + v_order.total_cents
      where id = v_order.member_id;
  end if;

  insert into order_reversals (order_id, reason, reversed_by, via, shift_id, refunded_cents)
  values (p_order_id, v_reason, v_actor.id, 'beheer', null,
          case when v_order.member_id is null then 0 else v_order.total_cents end)
  returning * into v_reversal;

  return v_reversal;
end;
$$;

-- Alleen voor een ingelogde sessie. Een nieuwe functie krijgt van Postgres
-- EXECUTE voor PUBLIC (en via Supabase's default privileges voor anon);
-- 0018 zet de default voor nieuwe functies al uit, maar net als 0019 hier
-- expliciet — supabase/tests/rpc_execute_grants.test.sql bewaakt het.
grant execute on function reverse_order_at_bar(uuid, uuid, text, uuid), reverse_order_as_admin(uuid, text)
  to authenticated;
revoke execute on function reverse_order_at_bar(uuid, uuid, text, uuid), reverse_order_as_admin(uuid, text)
  from public;
revoke execute on function reverse_order_at_bar(uuid, uuid, text, uuid), reverse_order_as_admin(uuid, text)
  from anon;
