-- Dienst per sessie, stap 2: guards, sessie-RPC's, PIN-login en beheerder-
-- ingrepen (docs/features/dienst-per-sessie.md → RPC's, ADR 0016).
--
-- Drie soorten functies:
--
--   * Guards en interne helpers (require_*, bar_pin_state, *_internal, ...):
--     geen EXECUTE voor enige API-rol. Ze worden alleen aangeroepen door
--     SECURITY DEFINER-functies die als eigenaar draaien.
--   * Server-only functies voor de login vóór er een sessie is
--     (verify_bar_pin, register_bar_session_server, record_bar_password_login,
--     bar_login_options): alleen `service_role` (ADR 0016 → Beslissing 6).
--   * RPC's voor een ingelogde sessie (register_bar_session, touch_bar_session,
--     end_bar_session, my_bar_state, admin_*): `authenticated`.
--
-- Elke functie trekt EXECUTE in voor PUBLIC/anon (0018). De bar-RPC's zelf
-- (start_shift, place_order, ...) en de beheer-RPC's staan in 0029.

create extension if not exists pgcrypto;

-- ── Vaste waarden ────────────────────────────────────────────────────────

-- Inactiviteit: 60 minuten, een vaste waarde (besloten, vraag 7/24). Eén plek,
-- gebruikt door de guard, my_bar_state en de cron-job. De client spiegelt de
-- waarde voor de UX (src/lib/barSessie.ts), zoals TOP_UP_MAX_CENTS.
create or replace function bar_inactivity_limit()
returns interval
language sql
immutable
as $$
  select interval '60 minutes';
$$;

-- ── De guards ────────────────────────────────────────────────────────────

-- Kern van alle guards. `p_modes`: in welke modus(sen) de sessie mag staan;
-- `p_beheerder`: het lid moet rol beheerder hebben; `p_touch`: bij succes de
-- hartslag zetten. Volgorde van de checks is de volgorde uit de spec:
-- no_bar_session, session_ended, session_inactive, wrong_mode, no_bar_role
-- (of no_admin_role). Staat vóór alle andere checks in elke RPC, zodat een
-- buitenstaander niets leert over diensten.
--
-- De hartslag (`last_activity_at`) blijft alleen staan als de hele RPC slaagt:
-- een `raise` verderop draait de update in dezelfde transactie terug. Dat is
-- ook de reden dat het einde van een inactieve sessie hier NIET wordt
-- vastgelegd: dat zou met dezelfde `raise` verdwijnen. Daarvoor is
-- close_inactive_bar_sessions().
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

-- Bar-RPC's zonder dienst-id (start_shift, en de bar-kant van de
-- beheerder-ingrepen): een sessie in modus `bar`.
create or replace function require_bar_session()
returns bar_sessions
language plpgsql
security definer
set search_path = public
as $$
begin
  return require_session(array['bar']);
end;
$$;

-- Bar-RPC's met een `p_shift_id`: een sessie in modus `bar` mét een actieve
-- koppeling met die dienst. Dit is de allowlist die de A2-denylist
-- (`caller_is_lid()`, 0023) vervangt.
create or replace function require_shift_session(p_shift_id uuid)
returns bar_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
begin
  v_session := require_session(array['bar']);
  if not exists (
    select 1 from shift_sessions
    where shift_id = p_shift_id
      and bar_session_id = v_session.id
      and left_at is null
  ) then
    raise exception 'session_not_on_shift' using errcode = 'P0001';
  end if;
  return v_session;
end;
$$;

-- Beheer-RPC's: een sessie in modus `beheer` van een beheerder (besloten,
-- vraag 11). Komt vóór de ADR 0002-actorcheck, die blijft bestaan.
create or replace function require_beheer_session()
returns bar_sessions
language plpgsql
security definer
set search_path = public
as $$
begin
  return require_session(array['beheer'], true);
end;
$$;

revoke execute on function
  bar_inactivity_limit(),
  require_session(text[], boolean, boolean),
  require_bar_session(),
  require_shift_session(uuid),
  require_beheer_session()
  from public, anon, authenticated, service_role;

-- ── Interne helpers voor het einde van diensten en sessies ───────────────

-- Sluit een dienst voor iedereen: `ended_at`, alle actieve koppelingen en de
-- openstaande meldingen voor deze dienst.
create or replace function end_shift_internal(
  p_shift_id uuid,
  p_left_reason text,
  p_resolved_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update shifts set ended_at = now() where id = p_shift_id and ended_at is null;
  update shift_sessions set left_at = now(), left_reason = p_left_reason
    where shift_id = p_shift_id and left_at is null;
  update admin_notifications set resolved_at = now(), resolved_by = p_resolved_by
    where shift_id = p_shift_id and resolved_at is null;
end;
$$;

-- "Eén regel voor meldingen": een melding ontstaat altijd als een open dienst
-- zijn laatste actieve koppeling verliest, ongeacht de oorzaak.
create or replace function notify_orphan_shift(
  p_shift_id uuid,
  p_bar_session_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from shifts where id = p_shift_id and ended_at is null)
     and not exists (
       select 1 from shift_sessions where shift_id = p_shift_id and left_at is null
     ) then
    insert into admin_notifications (kind, reason, shift_id, bar_session_id)
    values ('dienst_zonder_sessie', p_reason, p_shift_id, p_bar_session_id)
    on conflict do nothing;
  end if;
end;
$$;

-- Beëindigt een sessie met al wat daaraan hangt: de koppeling (reden volgt
-- de sluitreden van de sessie) en een melding voor elke dienst die daardoor
-- wees wordt. Doet niets voor een al beëindigde sessie.
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
  -- `niet_hervat` is alleen een sluitreden voor een beheersessie, die nooit
  -- een koppeling heeft; de mapping is er voor de volledigheid.
  v_reason text := case when p_end_reason = 'niet_hervat' then 'uitgelogd' else p_end_reason end;
  v_shift_id uuid;
begin
  update bar_sessions
    set ended_at = now(), end_reason = p_end_reason, ended_by = p_ended_by
    where id = p_bar_session_id and ended_at is null;
  if not found then
    return;
  end if;

  for v_shift_id in
    update shift_sessions set left_at = now(), left_reason = v_reason
      where bar_session_id = p_bar_session_id and left_at is null
      returning shift_id
  loop
    perform notify_orphan_shift(v_shift_id, p_bar_session_id, v_reason);
  end loop;
end;
$$;

-- Archiveren of rol → `lid`: alle actieve bar-sessies van dit lid eindigen
-- meteen (`geen_bar_rol`) en het PIN-vertrouwen op alle apparaten vervalt
-- (besloten, vraag 27). De guard weigert zo'n sessie ook zonder deze stap al
-- (vraag 21); dit zorgt dat de melding er meteen is.
create or replace function end_member_bar_sessions(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from bar_sessions where member_id = p_member_id and ended_at is null
  loop
    perform close_bar_session_internal(v_id, 'geen_bar_rol');
  end loop;
  update bar_device_members set revoked_at = now()
    where member_id = p_member_id and revoked_at is null;
end;
$$;

revoke execute on function
  end_shift_internal(uuid, text, uuid),
  notify_orphan_shift(uuid, uuid, text),
  close_bar_session_internal(uuid, text, uuid),
  end_member_bar_sessions(uuid)
  from public, anon, authenticated, service_role;

-- ── Sessie registreren, hartslag, uitloggen ──────────────────────────────

-- Door ModusKeuze op `/beheer` na een e-maillogin (browser → Supabase, dus de
-- server kon geen sessie registreren). Een sessie krijgt één modus en houdt
-- die (ADR 0003: modus wisselen = uitloggen). Zo komt een PIN-sessie, die als
-- `bar` is geregistreerd, nooit in beheer.
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

-- De hartslag: elke tik of toets op een bar- of beheerscherm (hooguit één per
-- minuut, client-kant). Werkt in beide modi. De guard doet het schrijfwerk.
create or replace function touch_bar_session()
returns bar_sessions
language plpgsql
security definer
set search_path = public
as $$
begin
  return require_session(array['bar', 'beheer']);
end;
$$;

-- Uitloggen (besloten, vraag 17). Heeft de sessie een open dienst:
-- `p_close_shift = true` sluit de dienst zoals end_shift; `false` laat hem
-- open, sluit de koppeling (`uitgelogd`) en maakt bij een wees-dienst een
-- melding. `p_reason` is `uitgelogd`, of `niet_hervat` voor een beheersessie
-- die na "browser dicht en weer open" niet wordt hervat (ADR 0016 →
-- Beslissing 8). Geen hartslag: uitloggen is geen activiteit. Daarna roept de
-- client `signOut({ scope: "local" })` aan.
create or replace function end_bar_session(
  p_close_shift boolean,
  p_reason text default 'uitgelogd'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
  v_shift_id uuid;
begin
  if p_reason is null or p_reason not in ('uitgelogd', 'niet_hervat') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  v_session := require_session(array['bar', 'beheer'], false, false);

  select shift_id into v_shift_id from shift_sessions
    where bar_session_id = v_session.id and left_at is null;
  if v_shift_id is not null and coalesce(p_close_shift, false) then
    perform end_shift_internal(v_shift_id, 'dienst_afgesloten');
  end if;

  perform close_bar_session_internal(v_session.id, p_reason);
end;
$$;

-- De leesbron voor de opvolger van useOpenShift (werktitel `useMijnDienst`).
-- Een RPC en geen select, omdat "welke sessie ben ik" alleen server-side
-- bekend is. Schrijft niet (geen hartslag): het hervatscherm moet de toestand
-- kunnen lezen vóór iemand "Verder" heeft getikt. Werkt voor élke
-- `authenticated` aanroeper: een sessie zonder bar-sessie krijgt
-- `{"session": null}` en niets over diensten.
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
      'left_shift_open', v_left_shift_open
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

-- ── Beheerderingrepen (ADR 0016 → Beslissing 5) ──────────────────────────

-- Een dienst afsluiten vanaf een ander apparaat (besloten, 12a): vanuit
-- bar-modus én vanuit beheer. Sluit de dienst voor alle koppelingen.
create or replace function admin_end_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
  v_actor members;
begin
  v_session := require_session(array['bar', 'beheer']);

  select * into v_actor from members where auth_user_id = auth.uid() and not archived;
  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;

  perform end_shift_internal(p_shift_id, 'afgesloten_door_beheerder', v_actor.id);
end;
$$;

-- Overnemen (besloten, 12a en 12b): alleen vanuit bar-modus, want het vraagt
-- een bar-sessie op het nieuwe apparaat. De bestaande koppeling krijgt
-- `overgenomen`, de beheerder krijgt een nieuwe koppeling en komt in de
-- bezetting. `shifts.started_by` blijft wie hem startte.
create or replace function admin_take_over_shift(p_shift_id uuid)
returns shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
  v_actor members;
  v_shift shifts;
begin
  v_session := require_bar_session();

  select * into v_actor from members where auth_user_id = auth.uid() and not archived;
  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  -- Zelfde lock als start_shift: overnemen en starten/afsluiten lopen na
  -- elkaar.
  perform pg_advisory_xact_lock(hashtext('start_shift'));

  if exists (
    select 1 from shift_sessions where bar_session_id = v_session.id and left_at is null
  ) then
    raise exception 'session_has_shift' using errcode = 'P0001';
  end if;

  select * into v_shift from shifts where id = p_shift_id and ended_at is null for update;
  if not found then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;

  update shift_sessions set left_at = now(), left_reason = 'overgenomen'
    where shift_id = p_shift_id and left_at is null;
  insert into shift_sessions (shift_id, bar_session_id) values (p_shift_id, v_session.id);
  insert into shift_members (shift_id, member_id) values (p_shift_id, v_actor.id)
    on conflict do nothing;
  update admin_notifications set resolved_at = now(), resolved_by = v_actor.id
    where shift_id = p_shift_id and resolved_at is null;

  return v_shift;
end;
$$;

-- Apparaat afmelden (besloten, 12c; verloren of gestolen tablet). De sessie
-- stopt meteen, de koppeling eindigt (`afgemeld`), bij een wees-dienst komt er
-- een melding, en het PIN-vertrouwen van dat apparaat vervalt (vraag 27).
create or replace function admin_end_bar_session(p_bar_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
  v_actor members;
  v_target bar_sessions;
begin
  v_session := require_session(array['bar', 'beheer']);

  select * into v_actor from members where auth_user_id = auth.uid() and not archived;
  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  select * into v_target from bar_sessions where id = p_bar_session_id;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  if v_target.ended_at is not null then
    raise exception 'session_ended' using errcode = 'P0001';
  end if;

  perform close_bar_session_internal(v_target.id, 'afgemeld', v_actor.id);

  if v_target.device_id is not null then
    update bar_devices set revoked_at = now()
      where id = v_target.device_id and revoked_at is null;
  end if;
end;
$$;

-- ── Inactiviteit: de cron-job ────────────────────────────────────────────

-- Legt het einde van een te lang inactieve sessie vast (boekhouding) en maakt
-- de beheerdermelding. De guard hangt niet van deze job af: valt pg_cron uit,
-- dan weigeren de RPC's nog steeds, alleen de melding komt later.
create or replace function close_inactive_bar_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from bar_sessions
    where ended_at is null
      and now() - last_activity_at > bar_inactivity_limit()
  loop
    perform close_bar_session_internal(v_id, 'inactief');
  end loop;
end;
$$;

revoke execute on function close_inactive_bar_sessions()
  from public, anon, authenticated, service_role;

-- Elke minuut, met een jobnaam zodat een herhaalde `cron.schedule` de job
-- bijwerkt in plaats van een tweede aan te maken (patroon uit 0025).
select cron.schedule(
  'close_inactive_bar_sessions',
  '* * * * *',
  'select close_inactive_bar_sessions()'
);

-- ── De login vóór er een sessie is (alleen service_role) ─────────────────

-- Wat een PIN-login voor dit lid op dit apparaat nu zou doen. Gedeeld door
-- bar_login_options en verify_bar_pin, zodat "kan het?" en "doe het" nooit
-- uit elkaar lopen. Uitkomsten: not_allowed, no_account, pin_not_available,
-- pin_locked, ok.
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

  -- Zonder (geldig) vertrouwd apparaat is het antwoord altijd hetzelfde,
  -- ook als het lid geen PIN heeft: iemand buiten een vertrouwd apparaat
  -- leert niet of een lid een PIN heeft.
  if p_device_token_hash is null then
    return 'pin_not_available';
  end if;
  select * into v_device from bar_devices where token_hash = p_device_token_hash;
  if not found
     or v_device.revoked_at is not null
     -- Het vertrouwen geldt 30 dagen en elke login verlengt het (vraag 27).
     or v_device.last_seen_at < now() - interval '30 days' then
    return 'pin_not_available';
  end if;
  if not exists (
    select 1 from bar_device_members
    where device_id = v_device.id and member_id = p_member_id and revoked_at is null
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
  return 'ok';
end;
$$;

-- Inlogopties voor een naam. `pin_available`: het apparaat is vertrouwd voor
-- dit lid, het lid heeft een PIN en de PIN is niet geblokkeerd.
-- `pin_locked`: alleen waar voor een vertrouwd apparaat, voor de tekst.
create or replace function bar_login_options(p_device_token_hash text, p_member_id uuid)
returns table (pin_available boolean, pin_locked boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_state text := bar_pin_state(p_device_token_hash, p_member_id);
begin
  return query select v_state = 'ok', v_state = 'pin_locked';
end;
$$;

-- De PIN-login (B1/B2). Geeft een rij terug in plaats van een fout te
-- raisen: een `raise` draait de teller van de foute poging in dezelfde
-- transactie terug, en dan is de lockout waardeloos. `result_code`:
-- ok | not_allowed | no_account | pin_not_available | pin_locked |
-- invalid_pin (met `attempts_left`). Alleen bij `ok` zijn
-- `member_auth_user_id` en `trusted_device_id` gevuld; alle andere antwoorden
-- zijn codes zonder verdere informatie.
create or replace function verify_bar_pin(
  p_device_token_hash text,
  p_member_id uuid,
  p_pin text
)
returns table (
  result_code text,
  member_auth_user_id uuid,
  trusted_device_id uuid,
  attempts_left integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- Na 5 foute PIN-pogingen is de PIN van dat lid geblokkeerd, op alle
  -- apparaten (besloten, vraag 25). Foute wachtwoorden tellen niet mee: de
  -- namenlijst is openbaar, dus dan kan iedereen elke bardienst buitensluiten.
  c_max_failures constant integer := 5;
  -- Kostenfactor van de PIN-hash (B1, besloten vraag 26).
  c_bcrypt_cost constant integer := 12;
  v_state text;
  v_member members;
  v_device bar_devices;
  v_failures pin_failures;
  v_count integer;
  v_cost integer;
begin
  v_state := bar_pin_state(p_device_token_hash, p_member_id);
  if v_state <> 'ok' then
    return query select v_state, null::uuid, null::uuid, null::integer;
    return;
  end if;

  select * into v_member from members where id = p_member_id;
  select * into v_device from bar_devices where token_hash = p_device_token_hash;

  -- Per lid na elkaar: gelijktijdige pogingen omzeilen de teller niet.
  insert into pin_failures (member_id) values (p_member_id) on conflict do nothing;
  select * into v_failures from pin_failures where member_id = p_member_id for update;
  if v_failures.locked_at is not null then
    return query select 'pin_locked'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if p_pin is null or crypt(p_pin, v_member.pin_hash) <> v_member.pin_hash then
    v_count := v_failures.failed_count + 1;
    update pin_failures
      set failed_count = v_count,
          last_failed_at = now(),
          locked_at = case when v_count >= c_max_failures then now() else null end
      where member_id = p_member_id;
    if v_count >= c_max_failures then
      return query select 'pin_locked'::text, null::uuid, null::uuid, null::integer;
    else
      return query select 'invalid_pin'::text, null::uuid, null::uuid, c_max_failures - v_count;
    end if;
    return;
  end if;

  update pin_failures set failed_count = 0, last_failed_at = null
    where member_id = p_member_id;

  -- Herhashen met de nieuwe kostenfactor als de bestaande lager is: nu kent
  -- de server de PIN, dus niemand hoeft hem opnieuw in te stellen.
  v_cost := substring(v_member.pin_hash from '^\$2[abxy]?\$([0-9]{2})\$')::integer;
  if v_cost is null or v_cost < c_bcrypt_cost then
    update members set pin_hash = crypt(p_pin, gen_salt('bf', c_bcrypt_cost))
      where id = p_member_id;
  end if;

  -- Elke login verlengt het vertrouwen van het apparaat.
  update bar_devices set last_seen_at = now() where id = v_device.id;

  return query select 'ok'::text, v_member.auth_user_id, v_device.id, null::integer;
end;
$$;

-- Na een geslaagde wachtwoordlogin via de namenlijst: de PIN-blokkade van dit
-- lid vervalt (besloten, vraag 25), en het apparaat wordt vertrouwd voor dit
-- lid. Geeft het id van het apparaat terug; `null` als het apparaat is
-- ingetrokken (afgemeld) — dan geeft de server een nieuw cookie uit en roept
-- dit opnieuw aan met de nieuwe hash. Een ingetrokken apparaat blijft dus
-- voor altijd ingetrokken. Is het token onbekend, dan wordt het apparaat
-- aangemaakt.
create or replace function record_bar_password_login(
  p_device_token_hash text,
  p_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device bar_devices;
begin
  if p_device_token_hash is null or p_device_token_hash = '' then
    raise exception 'invalid_device' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from members
    where id = p_member_id and not archived and role in ('bardienst', 'beheerder')
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update pin_failures
    set failed_count = 0, last_failed_at = null, locked_at = null
    where member_id = p_member_id;

  select * into v_device from bar_devices where token_hash = p_device_token_hash for update;
  if not found then
    insert into bar_devices (token_hash) values (p_device_token_hash)
      returning * into v_device;
  elsif v_device.revoked_at is not null then
    return null;
  else
    update bar_devices set last_seen_at = now() where id = v_device.id;
  end if;

  insert into bar_device_members (device_id, member_id, password_login_at)
  values (v_device.id, p_member_id, now())
  on conflict (device_id, member_id)
    do update set password_login_at = now(), revoked_at = null;

  return v_device.id;
end;
$$;

-- Door de namenlijstlogin, direct na het aanmaken van de Supabase-sessie en
-- vóór de browser de tokens krijgt. Altijd modus `bar`: een PIN-sessie komt
-- daardoor nooit in beheer.
create or replace function register_bar_session_server(
  p_auth_session_id uuid,
  p_member_id uuid,
  p_device_id uuid
)
returns bar_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member members;
  v_session bar_sessions;
begin
  if p_auth_session_id is null then
    raise exception 'no_bar_session' using errcode = 'P0001';
  end if;

  select * into v_member from members where id = p_member_id and not archived;
  if not found or v_member.role not in ('bardienst', 'beheerder') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_member.auth_user_id is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;

  insert into bar_sessions (auth_session_id, member_id, mode, device_id)
  values (p_auth_session_id, p_member_id, 'bar', p_device_id)
  on conflict (auth_session_id) do nothing
  returning * into v_session;

  if v_session.id is null then
    select * into v_session from bar_sessions where auth_session_id = p_auth_session_id;
    if v_session.ended_at is not null then
      raise exception 'session_ended' using errcode = 'P0001';
    end if;
  end if;
  return v_session;
end;
$$;

-- ── Rechten ──────────────────────────────────────────────────────────────
--
-- Nieuwe functies krijgen van Postgres standaard EXECUTE voor PUBLIC en van
-- Supabase's default privileges voor anon, authenticated en service_role
-- (0018). Expliciet dichtzetten; supabase/tests/rpc_execute_grants.test.sql
-- bewaakt het voor élke functie.

-- Alleen de server-side loginflow (service_role).
revoke execute on function
  bar_pin_state(text, uuid),
  bar_login_options(text, uuid),
  verify_bar_pin(text, uuid, text),
  record_bar_password_login(text, uuid),
  register_bar_session_server(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  bar_login_options(text, uuid),
  verify_bar_pin(text, uuid, text),
  record_bar_password_login(text, uuid),
  register_bar_session_server(uuid, uuid, uuid)
  to service_role;
-- bar_pin_state is een interne helper: ook niet voor service_role.
revoke execute on function bar_pin_state(text, uuid) from service_role;

-- Voor een ingelogde sessie.
revoke execute on function
  register_bar_session(text),
  touch_bar_session(),
  end_bar_session(boolean, text),
  my_bar_state(),
  admin_end_shift(uuid),
  admin_take_over_shift(uuid),
  admin_end_bar_session(uuid)
  from public, anon;
grant execute on function
  register_bar_session(text),
  touch_bar_session(),
  end_bar_session(boolean, text),
  my_bar_state(),
  admin_end_shift(uuid),
  admin_take_over_shift(uuid),
  admin_end_bar_session(uuid)
  to authenticated;
