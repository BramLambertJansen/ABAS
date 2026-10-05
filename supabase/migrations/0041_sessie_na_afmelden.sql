-- Een token van een beëindigde sessie leest en schrijft niets meer
-- (docs/features/sessie-na-afmelden.md, ADR 0022; item M1 "JWT na
-- afmelden").
--
-- Een access token blijft voor PostgREST geldig tot `jwt_expiry` (3600 s),
-- ook als de rij in `auth.sessions` al weg is: na uitloggen,
-- wachtwoordherstel, wachtwoordwijziging (GoTrue beëindigt dan de andere
-- sessies), koppelen (0040, stap 9) of de Auth-admin-API. Tot nu toe keken
-- de leespolicies, `require_session` en de guardvrije client-RPC's niet
-- naar die rij. Een bar-rol met zo'n token las alle leden met saldo, en het
-- token op de bartablet kon na een wachtwoordherstel elders nog een uur
-- bestellen en opwaarderen.
--
-- Nu:
--   * één helper, caller_session_alive(), is de enige definitie van
--     "levend" (keuze 2);
--   * elke leespolicy die niet `using (true)` is, eist een levende sessie,
--     als initplan vóór de bestaande expressie (keuze 3);
--   * require_session weigert met `session_ended` (keuze 4), en daarmee elke
--     RPC achter een `require_*`;
--   * de guardvrije client-RPC's eisen een levende sessie (keuze 5);
--     log_client_error en de RLS-helpers bewust niet (keuze 6);
--   * een bar-sessie waarvan de Auth-sessie verdween, sluit binnen een
--     minuut via een cron-job, met sluitreden `elders_uitgelogd` (keuze 7).
--
-- Geen object op het `auth`-schema (ADR 0022 → Beslissing 6): we lezen
-- `auth.sessions` (zoals 0040) en verwijderen er rijen uit (zoals 0034).
--
-- Volgorde: een policy verwijst naar de helper, dus die eerst.

-- ── 1. caller_session_alive() ────────────────────────────────────────────
--
-- "Levend" is: er bestaat een rij in `auth.sessions` met `id` = de
-- `session_id`-claim en `user_id` = auth.uid() (ADR 0022 → Beslissing 1).
-- Een ontbrekende, lege of misvormde claim telt als "niet levend", nooit als
-- fout: zelfde `invalid_text_representation`-vangnet als
-- register_bar_session. `not_after` en `aal` tellen niet (ADR 0022 →
-- Verworpen).
--
-- SECURITY DEFINER: `authenticated` heeft geen leesrecht op `auth.sessions`.
-- STABLE en parameterloos, zodat een policy hem als `(select
-- caller_session_alive())` één keer per statement evalueert (initplan),
-- zoals caller_has_bar_role (0039).
create or replace function caller_session_alive()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null then
    return false;
  end if;

  return exists (
    select 1 from auth.sessions
     where id = v_session_id and user_id = auth.uid()
  );
end;
$$;

comment on function caller_session_alive() is
  'True als de Auth-sessie uit het token (session_id-claim) nog in auth.sessions staat en van auth.uid() is. De enige definitie van "levend" (ADR 0022 → Beslissing 1). Ontbrekende, lege of misvormde claim: false, nooit een fout. Gebruikt door de leespolicies, require_session en de guardvrije client-RPC''s.';

-- Een policy wordt geëvalueerd met de rechten van de aanroeper (zelfde
-- reden als caller_has_bar_role, 0039).
grant execute on function caller_session_alive() to authenticated;
revoke execute on function caller_session_alive() from public, anon;

-- ── 2. Leespolicies ──────────────────────────────────────────────────────
--
-- Elke leespolicy die niet `using (true)` is: de sessievoorwaarde vóóraan,
-- als conjunctie, de huidige expressie ongewijzigd erachter (ADR 0022 →
-- Beslissing 2). Geldt voor de brede tak én de eigen-rij-tak. Namen blijven
-- gelijk (check:rls en de tests vinden ze op naam). De globale tabellen uit
-- ADR 0019 (`products`, `app_settings`, `shifts`, `shift_members`,
-- `activity_types`) blijven open. Gate: rls_leespolicies.test.sql.

drop policy members_select on members;
create policy members_select on members for select to authenticated
  using ((select caller_session_alive())
         and ((select caller_has_bar_role()) or auth_user_id = auth.uid()));

drop policy orders_select on orders;
create policy orders_select on orders for select to authenticated
  using ((select caller_session_alive())
         and ((select caller_has_bar_role()) or member_id = caller_member_id()));

drop policy order_lines_select on order_lines;
create policy order_lines_select on order_lines for select to authenticated
  using ((select caller_session_alive())
         and ((select caller_has_bar_role()) or caller_owns_order(order_id)));

drop policy top_ups_select on top_ups;
create policy top_ups_select on top_ups for select to authenticated
  using ((select caller_session_alive())
         and ((select caller_has_bar_role()) or member_id = caller_member_id()));

drop policy order_reversals_select on order_reversals;
create policy order_reversals_select on order_reversals for select to authenticated
  using ((select caller_session_alive())
         and ((select caller_has_bar_role()) or caller_owns_order(order_id)));

-- De `exists (...)` letterlijk uit 0027.
drop policy bar_sessions_select on bar_sessions;
create policy bar_sessions_select on bar_sessions for select to authenticated
  using (
    (select caller_session_alive())
    and exists (
      select 1 from members m
      where m.auth_user_id = auth.uid()
        and not m.archived
        and m.role in ('bardienst', 'beheerder')
    )
  );

drop policy shift_sessions_select on shift_sessions;
create policy shift_sessions_select on shift_sessions for select to authenticated
  using (
    (select caller_session_alive())
    and exists (
      select 1 from members m
      where m.auth_user_id = auth.uid()
        and not m.archived
        and m.role in ('bardienst', 'beheerder')
    )
  );

drop policy admin_notifications_select on admin_notifications;
create policy admin_notifications_select on admin_notifications for select to authenticated
  using (
    (select caller_session_alive())
    and exists (
      select 1 from members m
      where m.auth_user_id = auth.uid()
        and not m.archived
        and m.role = 'beheerder'
    )
  );

-- ── 3. require_session: `session_ended` bij een dode Auth-sessie ─────────
--
-- Body uit 0028, plus één controle direct ná de `ended_at`-check en vóór
-- `session_inactive` (keuze 4). Volgorde van de codes: no_bar_session,
-- session_ended, session_inactive, wrong_mode, no_bar_role (of
-- no_admin_role). Elke RPC met een `require_*` erft dit, ook
-- touch_bar_session, end_bar_session en check_beheer_session.
create or replace function require_session(
  p_modes text[],
  p_beheerder boolean default false,
  p_touch boolean default true
)
returns bar_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_session bar_sessions;
  v_member members;
begin
  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null then
    raise exception 'no_bar_session' using errcode = 'P0001';
  end if;

  select * into v_session from bar_sessions where auth_session_id = v_session_id;
  if not found then
    raise exception 'no_bar_session' using errcode = 'P0001';
  end if;
  if v_session.ended_at is not null then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;
  -- 0041 (ADR 0022 → Beslissing 3): de Auth-sessie uit het token bestaat
  -- nog. Anders is de bar-sessie elders beëindigd (uitloggen,
  -- wachtwoordherstel, wachtwoordwijziging); de cron-job
  -- close_signed_out_bar_sessions legt dat binnen een minuut vast, maar dit
  -- token mag nu al niets meer.
  if not caller_session_alive() then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;
  if now() - v_session.last_activity_at > bar_inactivity_limit() then
    raise exception 'session_inactive' using errcode = 'P0001';
  end if;
  if not (v_session.mode = any (p_modes)) then
    raise exception 'wrong_mode' using errcode = 'P0001';
  end if;

  -- De rol wordt bij elke aanroep opnieuw gelezen (besloten, vraag 21): een
  -- gearchiveerd lid of een lid dat `lid` werd, wordt meteen geweigerd. De
  -- auth-koppeling wordt mee gecontroleerd: de sessie moet nog steeds van het
  -- account zijn dat bij dit lid hoort.
  select * into v_member from members where id = v_session.member_id;
  if not found
     or v_member.archived
     or v_member.role not in ('bardienst', 'beheerder')
     or v_member.auth_user_id is distinct from auth.uid() then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
  if p_beheerder and v_member.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  if p_touch then
    update bar_sessions set last_activity_at = now()
      where id = v_session.id and ended_at is null
      returning * into v_session;
    if not found then
      -- Tussen lezen en schrijven door een andere transactie beëindigd.
      raise exception 'session_ended' using errcode = 'P0001';
    end if;
  end if;

  return v_session;
end;
$$;

-- Intern: voor geen enkele API-rol (0028); expliciet herhaald.
revoke execute on function require_session(text[], boolean, boolean)
  from public, anon, authenticated, service_role;

-- ── 4. register_bar_session: via de helper ───────────────────────────────
--
-- Body uit 0040. De inline `exists (... auth.sessions ...)` wordt de helper;
-- foutcodes en volgorde ongewijzigd: claim-parse en `no_bar_session` ervoor,
-- dan `session_ended`.
create or replace function register_bar_session(p_mode text)
returns bar_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_member members;
  v_session bar_sessions;
begin
  if p_mode is null or p_mode not in ('bar', 'beheer') then
    raise exception 'invalid_mode' using errcode = 'P0001';
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null then
    raise exception 'no_bar_session' using errcode = 'P0001';
  end if;

  -- 0040 (ADR 0020 → Beslissing 8), sinds 0041 via de helper (ADR 0022 →
  -- Beslissing 1): de Auth-sessie uit het token bestaat nog.
  if not caller_session_alive() then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;

  select * into v_member from members where auth_user_id = auth.uid() and not archived;
  if not found or v_member.role not in ('bardienst', 'beheerder') then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
  if p_mode = 'beheer' and v_member.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;
  -- 0034 (ADR 0017 → Beslissing 1): beheer komt uit "wachtwoord én factor".
  if p_mode = 'beheer' then
    if not member_has_verified_factor(v_member.auth_user_id) then
      raise exception 'mfa_not_enrolled' using errcode = 'P0001';
    end if;
    if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
      raise exception 'aal2_required' using errcode = 'P0001';
    end if;
  end if;

  select * into v_session from bar_sessions where auth_session_id = v_session_id;
  if found then
    -- Anders kan een inactief gesloten sessie zich meteen opnieuw registreren.
    if v_session.ended_at is not null then
      raise exception 'session_ended' using errcode = 'P0001';
    end if;
    if v_session.member_id <> v_member.id then
      raise exception 'no_bar_role' using errcode = 'P0001';
    end if;
    if v_session.mode <> p_mode then
      raise exception 'mode_locked' using errcode = 'P0001';
    end if;
    return v_session;
  end if;

  insert into bar_sessions (auth_session_id, member_id, mode)
  values (v_session_id, v_member.id, p_mode)
  returning * into v_session;
  return v_session;
end;
$$;

-- `create or replace` behoudt de grants (0028); expliciet herhaald.
revoke execute on function register_bar_session(text) from public, anon;
grant execute on function register_bar_session(text) to authenticated;

-- ── 5. set_own_pin: via de helper ────────────────────────────────────────
--
-- Body uit 0040. Geen claim of geen levende sessie → `actor_not_found`
-- (ongewijzigd), vóór de `wrong_mode`-check.
create or replace function set_own_pin(p_pin text)
returns members
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session_id uuid;
  v_actor members;
  v_member members;
begin
  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  -- 0040 (ADR 0020 → Beslissing 8), sinds 0041 via de helper (ADR 0022 →
  -- Beslissing 1): de Auth-sessie uit het token bestaat nog.
  if v_session_id is null or not caller_session_alive() then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;

  -- 0032: niet vanuit een geregistreerde bar-sessie (bar of beheer).
  if exists (select 1 from bar_sessions where auth_session_id = v_session_id) then
    raise exception 'wrong_mode' using errcode = 'P0001';
  end if;

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

-- `create or replace` behoudt de grants (0018/0032); expliciet herhaald.
revoke execute on function set_own_pin(text) from public, anon;
grant execute on function set_own_pin(text) to authenticated;

-- ── 6. update_own_name: eist een levende sessie ──────────────────────────
--
-- Body uit 0026. Een dode sessie → `actor_not_found`, als eerste controle:
-- bestaande code, die usePortalUpdateOwnName.ts al afhandelt.
create or replace function update_own_name(p_name text)
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
  -- 0041 (ADR 0022 → Beslissing 4).
  if not caller_session_alive() then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;

  select * into v_actor
  from members
  where auth_user_id = auth.uid() and not archived;

  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  update members set name = v_name where id = v_actor.id
    returning * into v_member;

  -- Zelfde scrub als 0010/0014: de return is `members`, en zonder deze regel
  -- zou de bcrypt-hash van een 4-cijferige PIN naar de client lekken.
  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- `create or replace` behoudt de grants (0026); expliciet herhaald.
grant execute on function update_own_name(text) to authenticated;
revoke execute on function update_own_name(text) from public, anon;

-- ── 7. list_own_transactions: eist een levende sessie ────────────────────
--
-- Body uit 0024. Een dode sessie → 0 rijen, zoals RLS: `and (select
-- caller_session_alive())` in beide `where`-clausules. Return type
-- ongewijzigd, dus `create or replace`.
create or replace function list_own_transactions()
returns table (
  id uuid,
  kind text,
  created_at timestamptz,
  amount_cents integer,
  method text,
  server_name text,
  reversed boolean,
  reversal_reason text,
  reversed_via text,
  reversed_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    'bestelling'::text as kind,
    o.created_at,
    o.total_cents as amount_cents,
    null::text as method,
    coalesce(server.name, 'onbekend') as server_name,
    (r.order_id is not null) as reversed,
    r.reason as reversal_reason,
    r.via as reversed_via,
    reverser.name as reversed_by_name
  from orders o
  join members server on server.id = o.served_by
  left join order_reversals r on r.order_id = o.id
  left join members reverser on reverser.id = r.reversed_by
  where o.member_id = caller_member_id()
    and (select caller_session_alive())

  union all

  select
    t.id,
    'opwaardering'::text as kind,
    t.created_at,
    t.amount_cents,
    t.method,
    coalesce(server.name, 'onbekend') as server_name,
    false as reversed,
    null::text as reversal_reason,
    null::text as reversed_via,
    null::text as reversed_by_name
  from top_ups t
  join members server on server.id = t.served_by
  where t.member_id = caller_member_id()
    and (select caller_session_alive())

  order by created_at desc;
$$;

comment on function list_own_transactions() is
  'Alle bestellingen en opwaarderingen van de aanroepende sessie (via caller_member_id()), nieuwste eerst, inclusief de naam van wie bediende/terugdraaide. SECURITY DEFINER exclusief om die naam te kunnen lezen ondanks members_select (ADR 0007/0010) — filtert zelf altijd op de eigen member_id, geeft nooit een andere sessie iets terug. Een token van een beëindigde Auth-sessie krijgt 0 rijen (ADR 0022). Zie docs/features/portal-dashboard.md → RPC''s.';

-- `create or replace` behoudt de grants (0024); expliciet herhaald.
grant execute on function list_own_transactions() to authenticated;
revoke execute on function list_own_transactions() from public, anon;

-- ── 8. my_bar_state: `{"session": null}` bij een dode sessie ─────────────
--
-- Body uit 0037. Een dode sessie met een open bar-sessie krijgt dezelfde
-- lege toestand als "geen claim", zonder naam of rol. De bar toont dan al
-- "Je bent uitgelogd" en logt lokaal uit (BarSessieProvider.tsx). Een al
-- gesloten bar-sessie houdt haar sluitreden; zie de toelichting in de body.
create or replace function my_bar_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_session bar_sessions;
  v_member members;
  v_status text;
  v_result jsonb;
  v_own_shift jsonb;
  v_last_left jsonb;
  v_other_shift jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_admin jsonb;
  v_left_shift_open boolean;
  v_resumable boolean;
begin
  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null then
    return jsonb_build_object('session', null);
  end if;

  select * into v_session from bar_sessions where auth_session_id = v_session_id;
  if not found then
    return jsonb_build_object('session', null);
  end if;

  -- 0041 (ADR 0022 → Beslissing 4): een token van een beëindigde
  -- Auth-sessie met een nog open bar-sessie krijgt dezelfde lege toestand
  -- als "geen claim", zonder naam of rol. Een al gesloten bar-sessie houdt
  -- haar sluitreden: close_bar_session_internal verwijdert bij elke
  -- sluiting de Auth-sessie (0034), en de tablet heeft `end_reason` en
  -- `left_shift_open` nodig voor de melding (afgemeld, inactief,
  -- rol gewijzigd, beheerder geworden; spec → Randgevallen: ongewijzigd).
  -- Zo'n sessie leert verder niets over diensten (status <> 'active').
  if v_session.ended_at is null and not caller_session_alive() then
    return jsonb_build_object('session', null);
  end if;

  select * into v_member from members where id = v_session.member_id;

  v_status := case
    when v_session.ended_at is not null then 'ended'
    when now() - v_session.last_activity_at > bar_inactivity_limit() then 'inactive'
    when v_member.id is null
      or v_member.archived
      or v_member.role not in ('bardienst', 'beheerder')
      or v_member.auth_user_id is distinct from auth.uid() then 'no_role'
    else 'active'
  end;

  -- Ging deze sessie weg terwijl de dienst open bleef? Voor de tekst
  -- "De dienst loopt nog; een beheerder heeft een melding gekregen."
  select exists (
    select 1 from shift_sessions ss
    join shifts s on s.id = ss.shift_id
    where ss.bar_session_id = v_session.id
      and ss.left_at is not null
      and ss.left_reason in ('uitgelogd', 'inactief', 'afgemeld', 'geen_bar_rol', 'beheerder_geworden')
      and s.ended_at is null
  ) into v_left_shift_open;

  -- 0034: mag deze sessie na "browser dicht en weer open" hervat worden?
  -- Niet voor een beheersessie (ADR 0016 → Beslissing 8), en niet voor de
  -- bar-sessie van een beheerder zonder geverifieerde tweede factor: zo'n
  -- sessie kan zelf een factor toevoegen en daarmee beheer krijgen (ADR 0017
  -- → Beslissing 1). De client beslist hiermee tussen het hervatscherm en
  -- `end_bar_session(false, 'niet_hervat')`.
  v_resumable := not (
    v_session.mode = 'beheer'
    or (
      v_session.mode = 'bar'
      and v_member.role = 'beheerder'
      and not member_has_verified_factor(v_member.auth_user_id)
    )
  );

  v_result := jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'member_id', v_session.member_id,
      'member_name', v_member.name,
      'member_role', v_member.role,
      'mode', v_session.mode,
      'status', v_status,
      'end_reason', v_session.end_reason,
      'started_at', v_session.started_at,
      'last_activity_at', v_session.last_activity_at,
      'left_shift_open', v_left_shift_open,
      'resumable', coalesce(v_resumable, false)
    )
  );

  -- Verder alleen data voor een actieve sessie: een gesloten of inactieve
  -- sessie leert niets over diensten.
  if v_status <> 'active' then
    return v_result;
  end if;

  select jsonb_build_object(
           'id', s.id,
           'started_by_name', sm.name,
           'started_at', s.started_at,
           'activity_type_name', a.name
         )
    into v_own_shift
    from shift_sessions ss
    join shifts s on s.id = ss.shift_id
    join members sm on sm.id = s.started_by
    left join activity_types a on a.id = s.activity_type_id
    where ss.bar_session_id = v_session.id and ss.left_at is null;

  v_result := v_result || jsonb_build_object('shift', v_own_shift);

  if v_own_shift is null then
    -- Waarom de laatste koppeling eindigde (alleen de redenen waarbij de
    -- sessie ingelogd blijft), voor de melding "overgenomen" of "afgesloten
    -- door beheerder". De client onthoudt zelf dat de melding getoond is.
    select jsonb_build_object('shift_id', ss.shift_id, 'reason', ss.left_reason, 'left_at', ss.left_at)
      into v_last_left
      from shift_sessions ss
      where ss.bar_session_id = v_session.id
        and ss.left_at is not null
        and ss.left_reason in ('overgenomen', 'afgesloten_door_beheerder')
      order by ss.left_at desc
      limit 1;
    v_result := v_result || jsonb_build_object('last_left', v_last_left);
  end if;

  -- Fase 1 is stand (a): één open dienst. Een sessie in modus `bar` zonder
  -- eigen dienst ziet die dienst als hij elders loopt, met wie er ingelogd
  -- is, of dat het een wees-dienst is.
  if v_session.mode = 'bar' and v_own_shift is null then
    select jsonb_build_object(
             'id', s.id,
             'started_by_name', sm.name,
             'started_at', s.started_at,
             'activity_type_name', a.name,
             'orphan', not exists (
               select 1 from shift_sessions x where x.shift_id = s.id and x.left_at is null
             ),
             'sessions', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'member_name', xm.name,
                        'last_activity_at', xb.last_activity_at
                      ) order by xb.last_activity_at desc)
               from shift_sessions x
               join bar_sessions xb on xb.id = x.bar_session_id
               join members xm on xm.id = xb.member_id
               where x.shift_id = s.id and x.left_at is null
             ), '[]'::jsonb),
             'in_bezetting', exists (
               select 1 from shift_members y
               where y.shift_id = s.id and y.member_id = v_session.member_id
             )
           )
      into v_other_shift
      from shifts s
      join members sm on sm.id = s.started_by
      left join activity_types a on a.id = s.activity_type_id
      where s.ended_at is null
      order by s.started_at desc
      limit 1;
    v_result := v_result || jsonb_build_object('other_shift', v_other_shift);
  end if;

  -- Voor een beheerder: de openstaande meldingen, in beide modi.
  if v_member.role = 'beheerder' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'reason', n.reason,
             'shift_id', n.shift_id,
             'created_at', n.created_at,
             'member_name', nm.name,
             'started_by_name', sm.name,
             'started_at', s.started_at,
             'activity_type_name', a.name
           ) order by n.created_at), '[]'::jsonb)
      into v_notifications
      from admin_notifications n
      join shifts s on s.id = n.shift_id
      join members sm on sm.id = s.started_by
      left join activity_types a on a.id = s.activity_type_id
      left join bar_sessions nb on nb.id = n.bar_session_id
      left join members nm on nm.id = nb.member_id
      where n.resolved_at is null;
    v_result := v_result || jsonb_build_object('notifications', v_notifications);

    -- Het beheeroverzicht (`/beheer`): open diensten met hun koppelingen en de
    -- actieve bar-sessies.
    if v_session.mode = 'beheer' then
      v_admin := jsonb_build_object(
        'shifts', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', s.id,
                   'started_by_name', sm.name,
                   'started_at', s.started_at,
                   'activity_type_name', a.name,
                   'sessions', coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'bar_session_id', xb.id,
                              'member_name', xm.name,
                              'last_activity_at', xb.last_activity_at
                            ) order by xb.last_activity_at desc)
                     from shift_sessions x
                     join bar_sessions xb on xb.id = x.bar_session_id
                     join members xm on xm.id = xb.member_id
                     where x.shift_id = s.id and x.left_at is null
                   ), '[]'::jsonb)
                 ) order by s.started_at desc)
          from shifts s
          join members sm on sm.id = s.started_by
          left join activity_types a on a.id = s.activity_type_id
          where s.ended_at is null
        ), '[]'::jsonb),
        'sessions', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', b.id,
                   'member_name', bm.name,
                   'mode', b.mode,
                   'started_at', b.started_at,
                   'last_activity_at', b.last_activity_at,
                   'shift_id', (
                     select x.shift_id from shift_sessions x
                     where x.bar_session_id = b.id and x.left_at is null
                   ),
                   'is_own', b.id = v_session.id
                 ) order by b.last_activity_at desc)
          from bar_sessions b
          join members bm on bm.id = b.member_id
          where b.ended_at is null
            and now() - b.last_activity_at <= bar_inactivity_limit()
        ), '[]'::jsonb)
      );
      v_result := v_result || jsonb_build_object('admin', v_admin);
    end if;
  end if;

  return v_result;
end;
$$;

-- `create or replace` behoudt de grants (0028); expliciet herhaald.
revoke execute on function my_bar_state() from public, anon;
grant execute on function my_bar_state() to authenticated;

-- ── 9. link_member_account_internal: eist een levende sessie ─────────────
--
-- Body uit 0040. Na stap 2 (het lezen van `v_session_id`): een dode sessie
-- koppelt niet (stille no-op, zoals elke andere afwijking daar). Koppelen
-- maakt iets dat langer leeft dan het token (ADR 0020 → Beslissing 8, ADR
-- 0022 → Beslissing 4). De wrappers veranderen niet.

create or replace function link_member_account_internal(p_role text)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_session_id uuid;
  v_amr jsonb;
  v_email text;
  v_confirmed_at timestamptz;
  v_match_count int;
  v_member_id uuid;
  v_member members;
begin
  -- 1. Een ingelogde gebruiker.
  v_uid := auth.uid();
  if v_uid is null then
    return null;
  end if;

  -- 2. De eigen Auth-sessie, nodig om in stap 9 alle andere te beëindigen.
  --    Zelfde vangnet als register_bar_session (0034).
  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null then
    return null;
  end if;

  -- 2b. 0041 (ADR 0022 → Beslissing 4): de Auth-sessie uit het token
  --     bestaat nog. Een token van een al beëindigde sessie koppelt niet.
  if not caller_session_alive() then
    return null;
  end if;

  -- 3. Bewijs van mailbezit (keuze 1): de sessie kwam tot stand via een
  --    token uit een mail aan dit adres. Supabase Auth legt per sessie de
  --    methoden vast en ondertekent ze in het JWT als
  --    `amr: [{"method": ..., "timestamp": ...}]`. Onze callbacks gebruiken
  --    `verifyOtp` met `token_hash` (ADR 0008); dat geeft voor elk type
  --    `otp` (GoTrue verify.go:185 GET, :285 POST), ook bij herstel en
  --    adreswijziging. Geen lek: ook die bewijzen mailbezit van dit adres.
  --    Alleen PKCE (`?code=`) neemt de methode uit de flow state
  --    (token.go:256): `invite`, `magiclink`, `email/signup`, en ook
  --    `recovery`/`email_change`. Die laatste twee staan bewust niet in de
  --    lijst; een PKCE-flow die ze nodig heeft, voegt ze bewust toe (ADR
  --    0020 → Beslissing 7).
  v_amr := auth.jwt() -> 'amr';
  if v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    return null;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_amr) e
     where e ->> 'method' in ('invite', 'magiclink', 'otp', 'email/signup')
  ) then
    return null;
  end if;

  -- 4. Adres en bevestiging uit de bron (keuze 5). Geen controle op
  --    `encrypted_password`: GoTrue zet zelf een tijdelijk wachtwoord bij het
  --    openen van de uitnodiging (verify.go:317-329), dus een wachtwoord
  --    zegt niets. Stap 8 wist het.
  select email, email_confirmed_at
    into v_email, v_confirmed_at
    from auth.users
   where id = v_uid;
  if not found
     or v_email is null
     or v_confirmed_at is null then
    return null;
  end if;

  -- 5. Al gekoppeld: no-op. Zonder deze stap gooit de unique-constraint op
  --    auth_user_id een fout, en de RPC mag nooit gooien.
  if exists (select 1 from members where auth_user_id = v_uid) then
    return null;
  end if;

  -- 6. Precies één kandidaat. Twee queries: min() bestaat niet voor uuid
  --    (0012).
  select count(*) into v_match_count
    from members
   where invited_auth_user_id = v_uid
     and auth_user_id is null
     and invited_at is not null
     and not archived
     and lower(email) = lower(v_email)
     and (p_role is null or role::text = p_role);
  if v_match_count <> 1 then
    return null;
  end if;

  select id into v_member_id
    from members
   where invited_auth_user_id = v_uid
     and auth_user_id is null
     and invited_at is not null
     and not archived
     and lower(email) = lower(v_email)
     and (p_role is null or role::text = p_role);

  -- 7. Koppelen.
  update members
    set auth_user_id = v_uid
    where id = v_member_id
    returning * into v_member;

  -- 8. Wachtwoord en MFA-factoren wissen (keuze 3): na de koppeling komt
  --    alleen de bewijzende sessie binnen. Wat ervoor op het account stond
  --    (het GoTrue-tijdelijke wachtwoord bij het openen van de uitnodiging,
  --    verify.go:317, of een wachtwoord of TOTP-factor van een ander) is
  --    weg. De delete op auth.mfa_factors cascadeert naar
  --    auth.mfa_challenges. Zelfde soort DML op het auth-schema als 0034
  --    (auth.sessions). Alleen op dit pad, dat echt koppelt; elke no-op
  --    hierboven raakt niets aan.
  update auth.users
     set encrypted_password = ''
   where id = v_uid;

  delete from auth.mfa_factors
   where user_id = v_uid;

  -- 9. Alle andere Auth-sessies van dit account eindigen (keuze 4): een
  --    sessie van vóór de koppeling is niet aantoonbaar van de eigenaar.
  --    Precedent: close_bar_session_internal (0034). Een token van een hier
  --    verwijderde sessie kan daarna geen bar-sessie registreren en geen PIN
  --    zetten: register_bar_session en set_own_pin eisen de rij in
  --    auth.sessions (ADR 0020 → Beslissing 8, sectie 8 en 9 hieronder).
  delete from auth.sessions
   where user_id = v_uid
     and id <> v_session_id;

  -- 10. Verplicht: zelfde pin_hash-scrub als elke `returns members`-RPC.
  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- Intern: voor geen enkele API-rol (0040); expliciet herhaald.
revoke execute on function link_member_account_internal(text)
  from public, anon, authenticated, service_role;

-- ── 10. Sluitreden `elders_uitgelogd` ────────────────────────────────────
--
-- De lijst uit 0037 plus `elders_uitgelogd`: de data laat zien dat de
-- sessie niet op de bar zelf beëindigd is (keuze 7). Voor `shift_sessions`
-- en `admin_notifications` geen nieuwe reden; zie stap 11.
alter table bar_sessions drop constraint bar_sessions_end_reason_check;
alter table bar_sessions add constraint bar_sessions_end_reason_check check (
  end_reason in (
    'uitgelogd', 'inactief', 'afgemeld', 'geen_bar_rol', 'niet_hervat',
    'beheerder_geworden', 'elders_uitgelogd'
  )
);

-- ── 11. close_bar_session_internal: `elders_uitgelogd` → `uitgelogd` ─────
--
-- Body uit 0034. Na het sluiten van de bar_sessions-rij verdwijnt de rij in
-- auth.sessions (ADR 0017 → Beslissing 2); ontbreekt die al (zoals bij
-- `elders_uitgelogd`), dan doet de delete niets. `niet_hervat` en
-- `elders_uitgelogd` hebben geen eigen koppelingsreden: voor de dienst en
-- de beheerdermelding is het hetzelfde als uitloggen zonder de dienst te
-- sluiten ("{naam} is uitgelogd zonder af te sluiten.").
create or replace function close_bar_session_internal(
  p_bar_session_id uuid,
  p_end_reason text,
  p_ended_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := case
    when p_end_reason in ('niet_hervat', 'elders_uitgelogd') then 'uitgelogd'
    else p_end_reason
  end;
  v_shift_id uuid;
  v_auth_session_id uuid;
begin
  update bar_sessions
    set ended_at = now(), end_reason = p_end_reason, ended_by = p_ended_by
    where id = p_bar_session_id and ended_at is null
    returning auth_session_id into v_auth_session_id;
  if not found then
    return;
  end if;

  delete from auth.sessions where id = v_auth_session_id;

  for v_shift_id in
    update shift_sessions set left_at = now(), left_reason = v_reason
      where bar_session_id = p_bar_session_id and left_at is null
      returning shift_id
  loop
    perform notify_orphan_shift(v_shift_id, p_bar_session_id, v_reason);
  end loop;
end;
$$;

comment on function close_bar_session_internal(uuid, text, uuid) is
  'Sluit één bar-sessie (ended_at, end_reason), verwijdert de bijbehorende Auth-sessie en beëindigt de koppelingen aan diensten, met een beheerdermelding bij een wees-dienst. niet_hervat en elders_uitgelogd tellen voor koppeling en melding als uitgelogd (ADR 0022). Doet niets bij een al gesloten sessie. Intern.';

-- Intern: voor geen enkele API-rol (0028); expliciet herhaald.
revoke execute on function close_bar_session_internal(uuid, text, uuid)
  from public, anon, authenticated, service_role;

-- ── 12. close_signed_out_bar_sessions(): de cron-job ─────────────────────
--
-- Een open bar-sessie zonder rij in auth.sessions is elders beëindigd
-- (uitloggen, wachtwoordherstel, wachtwoordwijziging, admin-API). Of het
-- token nog iets mag, hangt niet van deze job af: require_session weigert
-- al (stap 3). De job regelt de boekhouding: `ended_at`, de koppeling en de
-- beheerdermelding (ADR 0022 → Beslissing 5).
--
-- Een eigen functie, niet in close_inactive_bar_sessions: die naam zou dan
-- niet meer kloppen, en de tests van de inactiviteitsjob hoeven niets te
-- weten van auth.sessions. Geen trigger op auth.sessions (ADR 0022 →
-- Beslissing 6): die zou in de transactie van GoTrue lopen.
create or replace function close_signed_out_bar_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select b.id from bar_sessions b
    where b.ended_at is null
      and not exists (
        select 1 from auth.sessions s where s.id = b.auth_session_id
      )
  loop
    perform close_bar_session_internal(v_id, 'elders_uitgelogd');
  end loop;
end;
$$;

comment on function close_signed_out_bar_sessions() is
  'Sluit elke open bar-sessie waarvan de Auth-sessie niet meer in auth.sessions staat, met sluitreden elders_uitgelogd (via close_bar_session_internal: koppeling en melding als uitgelogd). Alleen voor de eigenaar (pg_cron-job close_signed_out_bar_sessions, elke minuut); geen EXECUTE voor enige API-rol (ADR 0022).';

revoke execute on function close_signed_out_bar_sessions()
  from public, anon, authenticated, service_role;

-- Elke minuut, met een jobnaam zodat een herhaalde `cron.schedule` de job
-- bijwerkt in plaats van een tweede aan te maken (patroon uit 0025/0028).
select cron.schedule(
  'close_signed_out_bar_sessions',
  '* * * * *',
  'select close_signed_out_bar_sessions()'
);
