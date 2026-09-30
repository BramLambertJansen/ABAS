-- Beheer eist een tweede factor (aal2), het einde van een bar-sessie trekt
-- ook de Auth-sessie in, en de PIN werkt niet voor een beheerder zonder
-- factor (docs/features/beheer-tweede-factor.md, ADR 0017 → Beslissing 1
-- en 2).
--
-- Wat hier verandert:
--
--   * member_has_verified_factor: interne helper, leest auth.mfa_factors.
--   * require_beheer_session / check_beheer_session: daarnaast aal2, anders
--     `aal2_required`. Elke beheer-RPC gaat via require_beheer_session.
--   * register_bar_session('beheer'): na de rolcontrole `mfa_not_enrolled`
--     (geen geverifieerde factor) en `aal2_required` (sessie is aal1).
--     Modus `bar` blijft zonder code.
--   * my_bar_state: `session.resumable`.
--   * close_bar_session_internal: verwijdert ook de rij in auth.sessions,
--     voor elke sluitreden.
--   * bar_pin_state: `pin_needs_mfa` voor een beheerder zonder factor, zodat
--     verify_bar_pin die code teruggeeft zonder de foutteller op te hogen;
--     bar_login_options krijgt de vlag `pin_needs_mfa`.
--
-- Ongewijzigd (besloten, 8): admin_end_shift, admin_take_over_shift en
-- admin_end_bar_session vragen modus `bar` of `beheer` en rol beheerder,
-- geen aal2. Geen enkele geld-RPC verandert; bar-RPC's kijken niet naar aal.
--
-- `create or replace` behoudt de grants van een bestaande functie. Nieuwe
-- functies trekken EXECUTE expliciet in (0018); bar_login_options wordt
-- opnieuw aangemaakt (andere uitvoerkolommen) en krijgt zijn grants opnieuw.

-- ── Helper: heeft dit account een geverifieerde TOTP-factor? ─────────────

create or replace function member_has_verified_factor(p_auth_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_auth_user_id is not null and exists (
    select 1 from auth.mfa_factors f
    where f.user_id = p_auth_user_id
      and f.factor_type::text = 'totp'
      and f.status::text = 'verified'
  );
$$;

revoke execute on function member_has_verified_factor(uuid)
  from public, anon, authenticated, service_role;

-- ── Beheer eist aal2 ─────────────────────────────────────────────────────

-- De aal van een sessie daalt niet bij verversen, dus in de praktijk is dit
-- een tweede slot achter register_bar_session. De controle staat ná die van
-- require_session: een sessie in de verkeerde modus krijgt nog steeds
-- `wrong_mode`. De `raise` draait de hartslag van require_session terug.
create or replace function require_beheer_session()
returns bar_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
begin
  v_session := require_session(array['beheer'], true);
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'aal2_required' using errcode = 'P0001';
  end if;
  return v_session;
end;
$$;

-- Zelfde voorwaarde als require_beheer_session (0031), zonder hartslag.
create or replace function check_beheer_session()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_session(array['beheer'], true, false);
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'aal2_required' using errcode = 'P0001';
  end if;
end;
$$;

-- ── register_bar_session: beheer vraagt een factor en aal2 ───────────────

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

-- ── Einde van een bar-sessie: ook de Auth-sessie weg ─────────────────────

-- Na het sluiten van de bar_sessions-rij verdwijnt de rij in auth.sessions
-- (ADR 0017 → Beslissing 2). Daarna weigert Supabase Auth dat token bij
-- /auth/v1/user en bij verversen. Geldt voor elke reden, dus ook via
-- end_bar_session, end_member_bar_sessions, admin_end_bar_session en
-- close_inactive_bar_sessions. Ontbreekt de rij, dan is dat geen fout.
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
  -- `niet_hervat` heeft geen eigen koppelingsreden: voor de dienst is het
  -- hetzelfde als uitloggen zonder de dienst te sluiten.
  v_reason text := case when p_end_reason = 'niet_hervat' then 'uitgelogd' else p_end_reason end;
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

-- ── PIN: niet voor een beheerder zonder factor ───────────────────────────

-- De versie uit 0033, met één toevoeging vlak vóór `ok`: een beheerder
-- zonder geverifieerde factor krijgt `pin_needs_mfa`. Alleen als de PIN
-- anders zou werken (vertrouwd apparaat, PIN, geen lockout): zonder
-- vertrouwd apparaat blijft het antwoord `pin_not_available`, dus de rol
-- lekt alleen op een apparaat waar dit lid al eens inlogde.
create or replace function bar_pin_state(p_device_token_hash text, p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member members;
  v_device bar_devices;
begin
  select * into v_member from members where id = p_member_id and not archived;
  if not found or v_member.role not in ('bardienst', 'beheerder') then
    return 'not_allowed';
  end if;
  if v_member.auth_user_id is null then
    return 'no_account';
  end if;

  if p_device_token_hash is null then
    return 'pin_not_available';
  end if;
  select * into v_device from bar_devices where token_hash = p_device_token_hash;
  if not found or v_device.revoked_at is not null then
    return 'pin_not_available';
  end if;
  if not exists (
    select 1 from bar_device_members
    where device_id = v_device.id
      and member_id = p_member_id
      and revoked_at is null
      and last_login_at >= now() - interval '30 days'
  ) then
    return 'pin_not_available';
  end if;

  if v_member.pin_hash is null then
    return 'pin_not_available';
  end if;
  if exists (
    select 1 from pin_failures where member_id = p_member_id and locked_at is not null
  ) then
    return 'pin_locked';
  end if;
  -- 0034 (ADR 0017 → Beslissing 1): een PIN-sessie kan het wachtwoord van
  -- een account zonder factor wijzigen. Voor een beheerder is de PIN er dus
  -- pas als hij een factor heeft.
  if v_member.role = 'beheerder' and not member_has_verified_factor(v_member.auth_user_id) then
    return 'pin_needs_mfa';
  end if;
  return 'ok';
end;
$$;

-- Andere uitvoerkolommen, dus opnieuw aanmaken. `pin_needs_mfa`: de PIN zou
-- werken, maar dit is een beheerder zonder tweede factor (voor de tekst).
drop function bar_login_options(text, uuid);
create function bar_login_options(p_device_token_hash text, p_member_id uuid)
returns table (pin_available boolean, pin_locked boolean, pin_needs_mfa boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_state text := bar_pin_state(p_device_token_hash, p_member_id);
begin
  return query select v_state = 'ok', v_state = 'pin_locked', v_state = 'pin_needs_mfa';
end;
$$;

revoke execute on function bar_login_options(text, uuid) from public, anon, authenticated;
grant execute on function bar_login_options(text, uuid) to service_role;

-- ── my_bar_state: `session.resumable` ────────────────────────────────────

-- De versie uit 0028, met alleen het veld `resumable` erbij.
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
      and ss.left_reason in ('uitgelogd', 'inactief', 'afgemeld', 'geen_bar_rol')
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

