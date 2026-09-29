-- Dienst per sessie, stap 3: de bestaande RPC's eisen een geregistreerde
-- bar-sessie (docs/features/dienst-per-sessie.md → RPC's → Bestaande RPC's,
-- ADR 0016).
--
-- * De zes bar-RPC's met een `p_shift_id` (place_order, top_up,
--   reverse_order_at_bar, end_shift, add_shift_member, remove_shift_member)
--   vervangen de A2-denylist (`caller_is_lid()`, 0023) door
--   `require_shift_session(p_shift_id)`: een sessie in modus `bar` met een
--   actieve koppeling aan die dienst. Dat is de allowlist (A3/B3 uit
--   docs/features/bar-rpc-autorisatie.md). `caller_is_lid()` zelf blijft
--   bestaan: de leespolicies uit 0015 gebruiken haar.
-- * top_up krijgt A4: nooit een opwaardering naar het lid van de sessie, in
--   alle standen. De €500 uit 0016 blijft.
-- * start_shift krijgt een nieuwe signatuur zonder PIN: de login op de
--   namenlijst is de authenticatie van de starter, en de starter is het lid
--   van de sessie. De oude regel "hooguit één open dienst" (0021) blijft
--   gelden (fase 1 is stand (a)), samen met het advisory lock uit 0021. De
--   kop van 0021 ("op de gedeelde bar-tablet-sessie", "vóór de lid/PIN-
--   checks") beschrijft daarmee niet meer de geldende functie.
-- * orders, top_ups en order_reversals krijgen `bar_session_id`, door de RPC
--   zelf uit de sessie gelezen: nooit een clientparameter.
-- * Elke beheer-RPC eist een sessie in modus `beheer` (`require_beheer_session`)
--   vóór de ADR 0002-actorcheck. set_member_archived/set_member_role beëindigen
--   daarnaast de bar-sessies van een lid dat `lid` of gearchiveerd wordt.
-- * set_own_pin hasht met kostenfactor 12 (B1).
--
-- Functielichamen zijn 1-op-1 overgenomen uit de eerdere migraties; alleen de
-- guard en de genoemde uitbreidingen zijn nieuw. Zelfde signatuur (behalve
-- start_shift), dus de grants blijven staan.

-- ── start_shift: zonder PIN, de sessie is de starter ─────────────────────

drop function if exists start_shift(uuid, text, uuid);

create or replace function start_shift(p_activity_type_id uuid)
returns shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
  v_activity_type activity_types;
  v_shift shifts;
begin
  v_session := require_bar_session();

  perform pg_advisory_xact_lock(hashtext('start_shift'));
  if exists (
    select 1 from shift_sessions where bar_session_id = v_session.id and left_at is null
  ) then
    raise exception 'session_has_shift' using errcode = 'P0001';
  end if;
  if exists (select 1 from shifts where ended_at is null) then
    raise exception 'shift_already_open' using errcode = 'P0001';
  end if;

  if p_activity_type_id is null then
    raise exception 'invalid_activity_type' using errcode = 'P0001';
  end if;

  select * into v_activity_type from activity_types where id = p_activity_type_id;
  if not found then
    raise exception 'activity_type_not_found' using errcode = 'P0001';
  end if;
  if v_activity_type.archived then
    raise exception 'activity_type_archived' using errcode = 'P0001';
  end if;

  insert into shifts (started_by, activity_type_id, started_session_id)
    values (v_session.member_id, p_activity_type_id, v_session.id)
    returning * into v_shift;
  insert into shift_members (shift_id, member_id) values (v_shift.id, v_session.member_id);
  insert into shift_sessions (shift_id, bar_session_id) values (v_shift.id, v_session.id);
  return v_shift;
end;
$$;

revoke execute on function start_shift(uuid) from public, anon;
grant execute on function start_shift(uuid) to authenticated;

-- ── top_up ───────────────────────────────────────────────────────────────

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
  -- number in de vergelijking, zodat de grens één plek heeft om te wijzigen.
  -- De client kent dezelfde waarde als TOP_UP_MAX_CENTS (src/features/
  -- opwaarderen/messages.ts) om de knop al vóór de aanroep te blokkeren — dit
  -- is de afdwinging, dat is de UX.
  c_max_amount_cents constant integer := 50000;
  v_session bar_sessions;
  v_top_up top_ups;
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

  insert into top_ups (shift_id, member_id, amount_cents, method, served_by, bar_session_id)
  values (p_shift_id, p_member_id, p_amount_cents, p_method, p_served_by, v_session.id)
  returning * into v_top_up;

  return v_top_up;
end;
$$;

-- ── place_order ──────────────────────────────────────────────────────────

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
begin
  -- Vóór alle andere checks, zodat een buitenstaander niets leert over
  -- diensten of bestellingen uit de foutcode.
  v_session := require_shift_session(p_shift_id);

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

  insert into orders (shift_id, member_id, served_by, total_cents, bar_session_id)
  values (p_shift_id, p_member_id, p_served_by, v_total, v_session.id)
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

-- ── reverse_order_at_bar ─────────────────────────────────────────────────

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
  v_session bar_sessions;
  v_order orders;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reversal order_reversals;
begin
  v_session := require_shift_session(p_shift_id);

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

  insert into order_reversals (
    order_id, reason, reversed_by, via, shift_id, refunded_cents, bar_session_id
  )
  values (p_order_id, v_reason, p_reversed_by, 'bar', p_shift_id,
          case when v_order.member_id is null then 0 else v_order.total_cents end,
          v_session.id)
  returning * into v_reversal;

  return v_reversal;
end;
$$;

-- ── end_shift, add_shift_member, remove_shift_member ─────────────────────

-- Sluit ook alle koppelingen (`dienst_afgesloten`) en lost de meldingen voor
-- deze dienst op. Zonder actieve koppeling is het een fout
-- (`session_not_on_shift`), geen stille no-op meer.
create or replace function end_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_shift_session(p_shift_id);
  perform end_shift_internal(p_shift_id, 'dienst_afgesloten');
end;
$$;

create or replace function add_shift_member(p_shift_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_shift_session(p_shift_id);
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
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_shift_session(p_shift_id);
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  delete from shift_members where shift_id = p_shift_id and member_id = p_member_id;
end;
$$;

-- ── set_own_pin: kostenfactor 12 (B1) ────────────────────────────────────
--
-- Uit 0014, alleen `gen_salt('bf')` → `gen_salt('bf', 12)`. Blijft een
-- portal-RPC (ADR 0002-actorcheck, geen bar-sessie): de PIN zet je voortaan
-- alleen in de portal (spec → besluit 10).

create or replace function set_own_pin(p_pin text)
returns members
language plpgsql
security definer
set search_path = public, extensions
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

  -- Een lid met rol lid heeft geen bar-PIN-concept.
  if v_actor.role not in ('bardienst', 'beheerder') then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;

  -- p_pin null = PIN uitzetten. Geen bevestigingsstap nodig hier (die hoort
  -- client-side thuis): uitzetten kan nooit een lid buitensluiten.
  if p_pin is null then
    update members set pin_hash = null where id = v_actor.id
      returning * into v_member;
    v_member.pin_hash := null;
    return v_member;
  end if;

  -- Zelfde 4-cijferige formaat als de bestaande PinPad.
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin_format' using errcode = 'P0001';
  end if;

  update members set pin_hash = crypt(p_pin, gen_salt('bf', 12)) where id = v_actor.id
    returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- ── Beheer-RPC's: een sessie in modus `beheer` (ADR 0016 → Beslissing 8) ──
--
-- Elk van de onderstaande functies is 1-op-1 de laatste versie uit de eerdere
-- migratie (vermeld boven elke functie), met `perform
-- require_beheer_session()` als eerste statement. set_member_archived en
-- set_member_role beëindigen bovendien de bar-sessies van een lid dat `lid`
-- of gearchiveerd wordt.

-- (uit 0005_assortimentbeheer.sql)
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

-- (uit 0005_assortimentbeheer.sql)
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

-- (uit 0005_assortimentbeheer.sql)
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

-- (uit 0006_negatieve_saldolimiet.sql)
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

  if p_negative_limit_cents is null or p_negative_limit_cents < 0 then
    raise exception 'invalid_negative_limit' using errcode = 'P0001';
  end if;

  update app_settings set negative_limit_cents = p_negative_limit_cents
    returning * into v_settings;

  return v_settings;
end;
$$;

-- (uit 0010_pin_hash_kolombeveiliging.sql)
create or replace function create_member(
  p_name text,
  p_starting_balance_cents integer,
  p_email text default null
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

  insert into members (name, role, balance_cents, pin_hash, auth_user_id, archived, email)
  values (v_name, 'lid', v_balance_cents, null, null, false, v_email)
  returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- (uit 0010_pin_hash_kolombeveiliging.sql)
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

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- (uit 0010_pin_hash_kolombeveiliging.sql)
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

  -- 0029: een gearchiveerd lid of een lid dat `lid` werd, verliest meteen de
  -- actieve bar-sessies en het PIN-vertrouwen (dienst-per-sessie, vraag 21/27).
  if v_member.archived or v_member.role = 'lid' then
    perform end_member_bar_sessions(p_member_id);
  end if;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- (uit 0010_pin_hash_kolombeveiliging.sql)
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

  -- 0029: een gearchiveerd lid of een lid dat `lid` werd, verliest meteen de
  -- actieve bar-sessies en het PIN-vertrouwen (dienst-per-sessie, vraag 21/27).
  if v_member.archived or v_member.role = 'lid' then
    perform end_member_bar_sessions(p_member_id);
  end if;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- (uit 0010_pin_hash_kolombeveiliging.sql)
create or replace function update_member_email(
  p_member_id uuid,
  p_email text
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_email text;
  v_member members;
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

  -- Geen eis dat het lid niet gearchiveerd is — zelfde redenering als
  -- update_member_name (ledenbeheer.md → Randgevallen "Gearchiveerd lid,
  -- naam wijzigen").
  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  -- Leeg/whitespace-only -> null: een beheerder kan een e-mailadres ook
  -- weer verwijderen (zie Randgevallen "E-mailadres wissen").
  v_email := nullif(trim(p_email), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  update members set email = v_email where id = p_member_id
    returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- (uit 0012_lid_account_uitnodigen.sql)
create or replace function mark_member_invite_sent(
  p_member_id uuid
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

  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  -- Guard tegen een overbodige/racende herbevestiging: als het lid
  -- inmiddels al gekoppeld is, heeft "invited_at" opnieuw zetten geen zin
  -- en zou het de indruk wekken dat er zojuist weer een nieuwe invite nodig
  -- was — zelfde already_linked-guard als de vorige versie van deze RPC,
  -- hier behouden op expliciet verzoek van Bram (Bug 1-fix, blijft een
  -- zinvolle bescherming tegen een dubbele koppeling).
  if v_member.auth_user_id is not null then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  update members
    set invited_at = now()
    where id = p_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als de andere `returns members`-RPC's
  -- (0010_pin_hash_kolombeveiliging.sql) — deze RPC retourneert ook
  -- `members`, dus zonder deze regel lekt de ruwe bcrypt-hash opnieuw naar
  -- de client.
  v_member.pin_hash := null;

  return v_member;
end;
$$;

-- (uit 0012_lid_account_uitnodigen.sql)
create or replace function list_members_admin()
returns setof members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
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

  return query
    select
      id,
      name,
      role,
      null::text as pin_hash,
      balance_cents,
      archived,
      created_at,
      auth_user_id,
      email,
      has_pin,
      invited_at
    from members
    order by name asc;
end;
$$;

-- (uit 0019_activiteittypes.sql)
create or replace function create_activity_type(p_name text)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_type activity_types;
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

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  insert into activity_types (name, archived) values (v_name, false)
    returning * into v_type;

  return v_type;
end;
$$;

-- (uit 0019_activiteittypes.sql)
create or replace function update_activity_type_name(
  p_activity_type_id uuid,
  p_name text
)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_type activity_types;
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

  -- Geen eis dat het type niet gearchiveerd is — zelfde redenering als
  -- update_product_price op een gearchiveerd product: een naam corrigeren
  -- vlak voor het weer actief wordt, zonder eerst te de-archiveren.
  select * into v_type from activity_types where id = p_activity_type_id;
  if not found then
    raise exception 'activity_type_not_found' using errcode = 'P0001';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  update activity_types set name = v_name where id = p_activity_type_id
    returning * into v_type;

  return v_type;
end;
$$;

-- (uit 0019_activiteittypes.sql)
create or replace function set_activity_type_archived(
  p_activity_type_id uuid,
  p_archived boolean
)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_type activity_types;
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

  select * into v_type from activity_types where id = p_activity_type_id;
  if not found then
    raise exception 'activity_type_not_found' using errcode = 'P0001';
  end if;

  -- Client stuurt de expliciete eindstaat, idempotent — zelfde patroon als
  -- set_product_archived/set_member_archived. Bewust GEEN "laatste actieve
  -- type"-guard, zie spec → "Besloten door de Architect".
  update activity_types set archived = p_archived where id = p_activity_type_id
    returning * into v_type;

  return v_type;
end;
$$;

-- (uit 0020_bestelling_terugdraaien.sql)
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

-- Grants blijven staan bij `create or replace` met dezelfde signatuur (0018:
-- alleen authenticated). rpc_execute_grants.test.sql bewaakt het.
