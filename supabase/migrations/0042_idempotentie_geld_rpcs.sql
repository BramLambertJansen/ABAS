-- Idempotentie voor de geld-RPC's (#143, docs/features/idempotentie-geld-rpcs.md,
-- ADR 0023): place_order, top_up en create_member krijgen een optionele
-- client-sleutel `p_request_id`. Een herhaald verzoek met dezelfde sleutel,
-- hetzelfde lid en dezelfde opdracht geeft het eerdere resultaat terug in
-- plaats van een tweede boeking.
--
-- Volgorde in elke RPC (bindend): 1. guards, ongewijzigd (require_*, en voor
-- top_up self_top_up_forbidden); 2. sleutel claimen (`insert ... on conflict
-- do nothing`); 3. zelf geclaimd: gewone uitvoering zoals voorheen; faalt die,
-- dan rolt de claim mee terug; 4. sleutel bestond al: zelfde rpc + lid +
-- vingerafdruk -> oorspronkelijk resultaat, zónder de state-checks (dienst
-- open, saldo, limiet, served_by) opnieuw te doen; anders
-- `request_id_conflict` (één code voor alle drie de gevallen).
--
-- Zonder `p_request_id` (null) is het gedrag identiek aan 0029.
--
-- De functielichamen zijn 1-op-1 overgenomen uit 0029; nieuw zijn de
-- parameter, de declaraties v_hash/v_result_id/v_key, het claimblok en het
-- expliciete `id` in de insert (de id wordt vooraf bepaald zodat
-- `idempotency_keys.result_id` bij de claim al gevuld kan zijn).

-- ── Tabel ────────────────────────────────────────────────────────────────
--
-- Zelfde patroon als client_errors (0025): RLS aan, géén policies, rechten
-- ingetrokken; alleen de security-definer-RPC's hieronder lezen en schrijven.
-- Alleen ids en een hash, geen persoonsgegevens.
create table idempotency_keys (
  request_id uuid primary key,
  rpc text not null check (rpc in ('place_order', 'top_up', 'create_member')),
  actor_member_id uuid not null references members(id),
  payload_hash text not null,
  result_id uuid not null,
  created_at timestamptz not null default now()
);

comment on table idempotency_keys is
  'Client-sleutels van geld-RPC''s (docs/features/idempotentie-geld-rpcs.md, ADR 0023). Alleen via place_order/top_up/create_member; geen leesrecht voor enige API-rol. Rijen ouder dan 30 dagen ruimt purge_idempotency_keys() dagelijks op (pg_cron).';

create index idempotency_keys_created_at_idx on idempotency_keys (created_at);

alter table idempotency_keys enable row level security;
revoke all on idempotency_keys from authenticated, anon;

-- ── Oude signaturen droppen ──────────────────────────────────────────────
--
-- Een nieuwe signatuur met `create or replace` is een tweede overload, en
-- twee overloads geven bij PostgREST PGRST203 op alle bar-verkoop (precedent:
-- 0008 voor create_member). Dus eerst expliciet droppen.
drop function if exists place_order(uuid, uuid, jsonb, uuid);
drop function if exists top_up(uuid, uuid, integer, text, uuid);
drop function if exists create_member(text, integer, text);

-- ── top_up ───────────────────────────────────────────────────────────────

create or replace function top_up(
  p_shift_id uuid,
  p_member_id uuid,
  p_amount_cents integer,
  p_method text,
  p_served_by uuid,
  p_request_id uuid default null
)
returns top_ups
language plpgsql
security definer
set search_path = public
as $$
declare
  -- €500. Als losse constante in het functielichaam in plaats van een magic
  -- number in de vergelijking, zodat de grens één plek heeft om te wijzigen.
  -- De client kent dezelfde waarde als TOP_UP_MAX_CENTS (src/features/
  -- opwaarderen/messages.ts) om de knop al vóór de aanroep te blokkeren — dit
  -- is de afdwinging, dat is de UX.
  c_max_amount_cents constant integer := 50000;
  v_session bar_sessions;
  v_top_up top_ups;
  -- 0042: idempotentiesleutel (ADR 0023).
  v_hash text;
  v_result_id uuid := gen_random_uuid();
  v_key idempotency_keys;
begin
  -- Vóór alle andere checks, zodat een buitenstaander niets leert over
  -- diensten of leden uit de foutcode.
  v_session := require_shift_session(p_shift_id);

  -- A4 (besloten, alle standen): nooit een opwaardering naar het lid van de
  -- ingelogde sessie. Een bardienst die alleen staat, laat dit een collega of
  -- een beheerder doen.
  if p_member_id = v_session.member_id then
    raise exception 'self_top_up_forbidden' using errcode = 'P0001';
  end if;

  -- 0042: sleutel claimen, ná de guards (ADR 0023). Bij een bestaande sleutel
  -- met dezelfde rpc, hetzelfde lid en dezelfde opdracht: het oorspronkelijke
  -- resultaat, zonder de state-checks hieronder opnieuw te doen en zonder iets
  -- te boeken. Anders request_id_conflict.
  if p_request_id is not null then
    v_hash := encode(sha256(convert_to(
      format('top_up|%s|%s|%s|%s|%s',
        p_shift_id, p_member_id, p_amount_cents, p_method, p_served_by),
      'UTF8')), 'hex');
    insert into idempotency_keys (request_id, rpc, actor_member_id, payload_hash, result_id)
    values (p_request_id, 'top_up', v_session.member_id, v_hash, v_result_id)
    on conflict (request_id) do nothing;
    if not found then
      select * into v_key from idempotency_keys where request_id = p_request_id;
      if v_key.rpc = 'top_up'
         and v_key.actor_member_id = v_session.member_id
         and v_key.payload_hash = v_hash then
        select * into v_top_up from top_ups where id = v_key.result_id;
        return v_top_up;
      end if;
      raise exception 'request_id_conflict' using errcode = 'P0001';
    end if;
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

  insert into top_ups (id, shift_id, member_id, amount_cents, method, served_by, bar_session_id)
  values (v_result_id, p_shift_id, p_member_id, p_amount_cents, p_method, p_served_by, v_session.id)
  returning * into v_top_up;

  return v_top_up;
end;
$$;

comment on function top_up(uuid, uuid, integer, text, uuid, uuid) is
  'Opwaarderen aan de bar (dienst-sessie, A4, €500). p_request_id optioneel: herhaling met dezelfde sleutel en opdracht geeft het oorspronkelijke resultaat zonder tweede boeking; andere opdracht/lid/rpc: request_id_conflict (ADR 0023).';

revoke execute on function top_up(uuid, uuid, integer, text, uuid, uuid) from public, anon;
grant execute on function top_up(uuid, uuid, integer, text, uuid, uuid) to authenticated;

-- ── place_order ──────────────────────────────────────────────────────────

create or replace function place_order(
  p_shift_id uuid,
  p_member_id uuid,
  p_lines jsonb,
  p_served_by uuid,
  p_request_id uuid default null
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
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
  -- 0042: idempotentiesleutel (ADR 0023).
  v_hash text;
  v_result_id uuid := gen_random_uuid();
  v_key idempotency_keys;
begin
  -- Vóór alle andere checks, zodat een buitenstaander niets leert over
  -- diensten of bestellingen uit de foutcode.
  v_session := require_shift_session(p_shift_id);

  -- 0042: sleutel claimen, ná de guard (ADR 0023). De vingerafdruk hasht de
  -- intentie (dienst, lid, served_by, regels als product_id:qty gesorteerd),
  -- nooit een prijs of totaal. Alleen tekstbewerkingen, geen casts: een
  -- misvormde regel moet hieronder nog steeds zijn gewone fout geven.
  -- Bij een bestaande sleutel met dezelfde rpc, hetzelfde lid en dezelfde
  -- opdracht: het oorspronkelijke resultaat, zonder de state-checks hieronder
  -- opnieuw te doen en zonder iets te boeken. Anders request_id_conflict.
  if p_request_id is not null then
    v_hash := encode(sha256(convert_to(
      format('place_order|%s|%s|%s|%s',
        p_shift_id, p_member_id, p_served_by,
        case when jsonb_typeof(p_lines) = 'array' then
          coalesce((
            select string_agg(format('%s:%s', lower(l->>'product_id'), l->>'qty'), ','
                              order by format('%s:%s', lower(l->>'product_id'), l->>'qty'))
              from jsonb_array_elements(p_lines) as l
          ), '')
        else '' end),
      'UTF8')), 'hex');
    insert into idempotency_keys (request_id, rpc, actor_member_id, payload_hash, result_id)
    values (p_request_id, 'place_order', v_session.member_id, v_hash, v_result_id)
    on conflict (request_id) do nothing;
    if not found then
      select * into v_key from idempotency_keys where request_id = p_request_id;
      if v_key.rpc = 'place_order'
         and v_key.actor_member_id = v_session.member_id
         and v_key.payload_hash = v_hash then
        select * into v_order from orders where id = v_key.result_id;
        return v_order;
      end if;
      raise exception 'request_id_conflict' using errcode = 'P0001';
    end if;
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

  insert into orders (id, shift_id, member_id, served_by, total_cents, bar_session_id)
  values (v_result_id, p_shift_id, p_member_id, p_served_by, v_total, v_session.id)
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

comment on function place_order(uuid, uuid, jsonb, uuid, uuid) is
  'Bestelling plaatsen aan de bar (dienst-sessie). p_request_id optioneel: herhaling met dezelfde sleutel en opdracht geeft de oorspronkelijke bestelling zonder tweede boeking; andere opdracht/lid/rpc: request_id_conflict (ADR 0023).';

revoke execute on function place_order(uuid, uuid, jsonb, uuid, uuid) from public, anon;
grant execute on function place_order(uuid, uuid, jsonb, uuid, uuid) to authenticated;

-- ── create_member ────────────────────────────────────────────────────────

create or replace function create_member(
  p_name text,
  p_starting_balance_cents integer,
  p_email text default null,
  p_request_id uuid default null
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
  v_email text;
  v_member members;
  -- 0042: idempotentiesleutel (ADR 0023).
  v_hash text;
  v_result_id uuid := gen_random_uuid();
  v_key idempotency_keys;
begin
  -- 0029: beheer-RPC's eisen een sessie in modus `beheer` (dienst-per-sessie,
  -- ADR 0016 → Beslissing 8). Vóór de ADR 0002-actorcheck, die blijft bestaan.
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

  -- 0042: sleutel claimen, ná de guards (ADR 0023). Vingerafdruk: getrimde
  -- naam, startsaldo (null = 0) en genormaliseerd e-mailadres, met dezelfde
  -- trim/null-regel als hieronder. Bij een bestaande sleutel met dezelfde rpc,
  -- hetzelfde lid en dezelfde opdracht: het huidige lid terug (pin_hash null),
  -- zonder een tweede lid aan te maken. Anders request_id_conflict.
  if p_request_id is not null then
    v_hash := encode(sha256(convert_to(
      format('create_member|%s|%s|%s',
        trim(p_name), coalesce(p_starting_balance_cents, 0), coalesce(nullif(trim(p_email), ''), '')),
      'UTF8')), 'hex');
    insert into idempotency_keys (request_id, rpc, actor_member_id, payload_hash, result_id)
    values (p_request_id, 'create_member', v_actor.id, v_hash, v_result_id)
    on conflict (request_id) do nothing;
    if not found then
      select * into v_key from idempotency_keys where request_id = p_request_id;
      if v_key.rpc = 'create_member'
         and v_key.actor_member_id = v_actor.id
         and v_key.payload_hash = v_hash then
        select * into v_member from members where id = v_key.result_id;
        v_member.pin_hash := null;
        return v_member;
      end if;
      raise exception 'request_id_conflict' using errcode = 'P0001';
    end if;
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

  -- Leeg/whitespace-only -> null ("geen e-mailadres", het normale geval).
  -- Niet-leeg moet een minimaal e-mailformaat matchen — ongewijzigd
  -- overgenomen uit 0008_ledenbeheer_email.sql.
  v_email := nullif(trim(p_email), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  insert into members (id, name, role, balance_cents, pin_hash, auth_user_id, archived, email)
  values (v_result_id, v_name, 'lid', v_balance_cents, null, null, false, v_email)
  returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

comment on function create_member(text, integer, text, uuid) is
  'Lid aanmaken (beheer). p_request_id optioneel: herhaling met dezelfde sleutel en opdracht geeft het eerder aangemaakte lid zonder tweede lid; andere opdracht/lid/rpc: request_id_conflict (ADR 0023).';

revoke execute on function create_member(text, integer, text, uuid) from public, anon;
grant execute on function create_member(text, integer, text, uuid) to authenticated;

-- ── Retentie: 30 dagen, via pg_cron ──────────────────────────────────────
--
-- Patroon van purge_client_errors (0025): de opruimlogica in een eigen
-- functie die niemand behalve de eigenaar mag uitvoeren; de job draait als
-- eigenaar. Een herhaling na de bewaartermijn is een nieuwe boeking
-- (spec → Randgevallen).
create or replace function purge_idempotency_keys()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from idempotency_keys where created_at < now() - interval '30 days';
end;
$$;

comment on function purge_idempotency_keys() is
  'Verwijdert idempotency_keys-rijen ouder dan 30 dagen. Alleen voor de eigenaar (pg_cron-job purge_idempotency_keys); geen EXECUTE voor enige API-rol.';

revoke execute on function purge_idempotency_keys() from public;
revoke execute on function purge_idempotency_keys() from anon;
revoke execute on function purge_idempotency_keys() from authenticated;
revoke execute on function purge_idempotency_keys() from service_role;

create extension if not exists pg_cron;

-- Dagelijks om 03:00 (pg_cron rekent in UTC), met een jobnaam zodat een
-- herhaalde `cron.schedule` de job bijwerkt in plaats van een tweede aan te
-- maken.
select cron.schedule(
  'purge_idempotency_keys',
  '0 3 * * *',
  'select purge_idempotency_keys()'
);
