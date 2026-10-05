-- CLI-created 20261005133018, renumbered per check:migrations (0042).
-- Approved 2026-10-05: docs/features/geldverzoeken-idempotent.md, ADR 0023.
-- Additive wrappers preserve the old RPCs for the currently deployed app.
create table money_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  operation text not null check (operation in ('place_order', 'top_up', 'create_member')),
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table money_requests enable row level security;
revoke all on money_requests from public, anon, authenticated, service_role;

-- Caller holds the same transaction lock until both booking and receipt commit.
create function read_money_request(p_request_id uuid, p_operation text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_receipt money_requests;
begin
  if p_request_id is null or auth.uid() is null then
    raise exception 'invalid_request_id' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('abas-money:' || p_request_id::text, 0));
  select * into v_receipt from money_requests where request_id = p_request_id;
  if not found then return null; end if;
  if v_receipt.actor_id <> auth.uid() or v_receipt.operation <> p_operation
    or v_receipt.payload_hash <> encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex') then
    raise exception 'request_id_conflict' using errcode = 'P0001';
  end if;
  return v_receipt.result;
end;
$$;

create function remember_money_request(p_request_id uuid, p_operation text, p_payload jsonb, p_result jsonb)
returns void language sql security definer set search_path = public as $$
  insert into money_requests(request_id, actor_id, operation, payload_hash, result)
  values (p_request_id, auth.uid(), p_operation,
    encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex'), p_result);
$$;
revoke execute on function read_money_request(uuid, text, jsonb),
  remember_money_request(uuid, text, jsonb, jsonb) from public, anon, authenticated, service_role;

create function place_order_once(p_request_id uuid, p_shift_id uuid, p_member_id uuid, p_lines jsonb, p_served_by uuid)
returns orders language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_order orders;
  v_payload jsonb := jsonb_build_array(p_shift_id, p_member_id, p_lines, p_served_by);
begin
  -- Auth/session and attribution still apply before replaying a receipt.
  perform require_shift_session(p_shift_id);
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if not is_shift_member(p_shift_id, p_served_by) then
    raise exception 'served_by_not_on_shift' using errcode = 'P0001';
  end if;
  v_result := read_money_request(p_request_id, 'place_order', v_payload);
  if v_result is not null then
    select * into v_order from jsonb_populate_record(null::orders, v_result);
    return v_order;
  end if;
  v_order := place_order(p_shift_id, p_member_id, p_lines, p_served_by);
  perform remember_money_request(p_request_id, 'place_order', v_payload, to_jsonb(v_order));
  return v_order;
end;
$$;

create function top_up_once(p_request_id uuid, p_shift_id uuid, p_member_id uuid, p_amount_cents integer, p_method text, p_served_by uuid)
returns top_ups language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_session bar_sessions; v_top_up top_ups;
  v_payload jsonb := jsonb_build_array(p_shift_id, p_member_id, p_amount_cents, p_method, p_served_by);
begin
  v_session := require_shift_session(p_shift_id);
  if p_member_id = v_session.member_id then
    raise exception 'self_top_up_forbidden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if not is_shift_member(p_shift_id, p_served_by) then
    raise exception 'served_by_not_on_shift' using errcode = 'P0001';
  end if;
  v_result := read_money_request(p_request_id, 'top_up', v_payload);
  if v_result is not null then
    select * into v_top_up from jsonb_populate_record(null::top_ups, v_result);
    return v_top_up;
  end if;
  v_top_up := top_up(p_shift_id, p_member_id, p_amount_cents, p_method, p_served_by);
  perform remember_money_request(p_request_id, 'top_up', v_payload, to_jsonb(v_top_up));
  return v_top_up;
end;
$$;

create function create_member_once(p_request_id uuid, p_name text, p_starting_balance_cents integer, p_email text default null)
returns members language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_actor members; v_member members;
  v_payload jsonb := jsonb_build_array(p_name, p_starting_balance_cents, p_email);
begin
  perform require_beheer_session();
  select * into v_actor from members where auth_user_id = auth.uid() and not archived;
  if v_actor.id is null then raise exception 'actor_not_found' using errcode = 'P0001'; end if;
  if v_actor.role <> 'beheerder' then raise exception 'no_admin_role' using errcode = 'P0001'; end if;
  v_result := read_money_request(p_request_id, 'create_member', v_payload);
  if v_result is not null then
    select * into v_member from jsonb_populate_record(null::members, v_result);
    v_member.pin_hash := null;
    return v_member;
  end if;
  v_member := create_member(p_name, p_starting_balance_cents, p_email);
  v_member.pin_hash := null;
  perform remember_money_request(p_request_id, 'create_member', v_payload, to_jsonb(v_member));
  return v_member;
end;
$$;
revoke execute on function place_order_once(uuid, uuid, uuid, jsonb, uuid),
  top_up_once(uuid, uuid, uuid, integer, text, uuid),
  create_member_once(uuid, text, integer, text) from public, anon;
grant execute on function place_order_once(uuid, uuid, uuid, jsonb, uuid),
  top_up_once(uuid, uuid, uuid, integer, text, uuid),
  create_member_once(uuid, text, integer, text) to authenticated, service_role;
