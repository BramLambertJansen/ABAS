-- Promotie naar beheerder beëindigt de bar-sessies (docs/features/
-- beheer-tweede-factor.md → RPC's → `set_member_role`, besloten 11; Bram
-- 2026-10-01; ADR 0017).
--
-- Een lopende PIN-sessie (aal1) van een bardienst die beheerder wordt, is
-- daarna de sessie van een beheerder zonder factor: die kan zonder huidig
-- wachtwoord het wachtwoord wijzigen of zelf een factor toevoegen, en zo
-- beheer krijgen. Daarom eindigen bij die promotie meteen alle actieve
-- bar-sessies van het lid, met de sluitreden `beheerder_geworden`:
--
--   * via close_bar_session_internal ook de koppelingen
--     (`left_reason = 'beheerder_geworden'`), een melding bij een
--     wees-dienst, en de Auth-sessie van elke bar-sessie (0034);
--   * het PIN-vertrouwen op alle apparaten vervalt, zoals bij archiveren;
--   * een portal-sessie van het lid blijft staan (die hoort niet bij een
--     bar-sessie).
--
-- end_member_bar_sessions krijgt de sluitreden als parameter; de oude
-- signatuur met één parameter vervalt (geen overload). Daarom worden ook
-- set_member_archived en set_member_role opnieuw aangemaakt.

-- ── Sluitreden `beheerder_geworden` ──────────────────────────────────────

alter table bar_sessions drop constraint bar_sessions_end_reason_check;
alter table bar_sessions add constraint bar_sessions_end_reason_check check (
  end_reason in ('uitgelogd', 'inactief', 'afgemeld', 'geen_bar_rol', 'niet_hervat', 'beheerder_geworden')
);

alter table shift_sessions drop constraint shift_sessions_left_reason_check;
alter table shift_sessions add constraint shift_sessions_left_reason_check check (
  left_reason in (
    'dienst_afgesloten', 'afgesloten_door_beheerder', 'uitgelogd',
    'inactief', 'overgenomen', 'afgemeld', 'geen_bar_rol', 'beheerder_geworden'
  )
);

alter table admin_notifications drop constraint admin_notifications_reason_check;
alter table admin_notifications add constraint admin_notifications_reason_check check (
  reason in ('inactief', 'uitgelogd', 'afgemeld', 'geen_bar_rol', 'beheerder_geworden')
);

-- ── end_member_bar_sessions(p_member_id, p_reason) ──────────────────────

drop function end_member_bar_sessions(uuid);

-- Alle actieve bar-sessies van dit lid eindigen meteen, met de opgegeven
-- reden, en het PIN-vertrouwen op alle apparaten vervalt:
--   geen_bar_rol        archiveren of rol → `lid` (vraag 21/27, 0028);
--   beheerder_geworden  rol → `beheerder` (ADR 0017, besloten 11).
create function end_member_bar_sessions(p_member_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_reason is null or p_reason not in ('geen_bar_rol', 'beheerder_geworden') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  for v_id in
    select id from bar_sessions where member_id = p_member_id and ended_at is null
  loop
    perform close_bar_session_internal(v_id, p_reason);
  end loop;
  update bar_device_members set revoked_at = now()
    where member_id = p_member_id and revoked_at is null;
end;
$$;

-- Intern: voor geen enkele API-rol (0018, zoals 0028).
revoke execute on function end_member_bar_sessions(uuid, text)
  from public, anon, authenticated, service_role;

-- ── set_member_archived / set_member_role ────────────────────────────────

-- De versies uit 0029, met de sluitreden als parameter. set_member_role
-- beëindigt daarnaast de sessies bij een promotie naar beheerder.
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
  -- 0037: de sluitreden is nu een parameter.
  if v_member.archived or v_member.role = 'lid' then
    perform end_member_bar_sessions(p_member_id, 'geen_bar_rol');
  end if;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

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
  v_oude_rol member_role;
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
  v_oude_rol := v_member.role;

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
  -- 0037 (ADR 0017, besloten 11): een lid dat beheerder wordt (en het nog niet
  -- was) ook, met `beheerder_geworden`. Zo wordt een lopende aal1-sessie van
  -- een bardienst geen beheerder-zonder-factor-sessie. Beheerder → beheerder
  -- doet niets.
  if v_member.archived or v_member.role = 'lid' then
    perform end_member_bar_sessions(p_member_id, 'geen_bar_rol');
  elsif v_member.role = 'beheerder' and v_oude_rol <> 'beheerder' then
    perform end_member_bar_sessions(p_member_id, 'beheerder_geworden');
  end if;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- ── my_bar_state: `left_shift_open` kent `beheerder_geworden` ───────────

-- De versie uit 0034; alleen de lijst van sluitredenen bij
-- `left_shift_open` krijgt `beheerder_geworden` erbij.
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
