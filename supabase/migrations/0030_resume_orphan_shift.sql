-- Dienst per sessie, vraag 24 (ii): een bardienst uit de bezetting van een
-- wees-dienst pakt hem na opnieuw inloggen weer op
-- (docs/features/dienst-per-sessie.md → Zoals gebouwd, ADR 0016).
--
-- Een wees-dienst is een open dienst zonder actieve koppeling in
-- shift_sessions (inactiviteit, uitloggen met "open laten", afmelden,
-- rolwijziging). Wie in `shift_members` van die dienst staat, mag hem hervatten:
-- de sessie krijgt een nieuwe koppeling en de beheerdermelding is opgelost.
-- Een dienst met een actieve koppeling elders blijft onaantastbaar (12d): dan
-- is de weigering `shift_not_orphan`. Buiten de bezetting: `not_in_shift_crew`.
--
-- served_by en de attributie veranderen niet: de bezetting van de dienst blijft
-- zoals hij was, en er komt niemand bij.
--
-- Volgorde van de checks: de guard eerst (require_bar_session), dan de
-- toestand van de eigen sessie, dan de dienst (bestaat en is open), dan de
-- bezetting, dan pas of de dienst wees is. Zo leert wie niet in de bezetting
-- staat niets over de koppelingen van een dienst.

create or replace function resume_orphan_shift(p_shift_id uuid)
returns shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bar_sessions;
  v_shift shifts;
begin
  v_session := require_bar_session();

  -- Zelfde lock als start_shift en admin_take_over_shift: hervatten, overnemen,
  -- starten en afsluiten lopen na elkaar. Twee bezettingsleden die tegelijk
  -- hervatten: de tweede ziet een actieve koppeling en krijgt shift_not_orphan.
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

  if not exists (
    select 1 from shift_members
    where shift_id = p_shift_id and member_id = v_session.member_id
  ) then
    raise exception 'not_in_shift_crew' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from shift_sessions where shift_id = p_shift_id and left_at is null
  ) then
    raise exception 'shift_not_orphan' using errcode = 'P0001';
  end if;

  -- Een sessie die eerder in deze dienst werkte (bv. overgenomen door een
  -- beheerder die daarna uitlogde) heeft al een rij: die gaat weer open.
  insert into shift_sessions (shift_id, bar_session_id)
  values (p_shift_id, v_session.id)
  on conflict (shift_id, bar_session_id)
    do update set joined_at = now(), left_at = null, left_reason = null;

  update admin_notifications
    set resolved_at = now(), resolved_by = v_session.member_id
    where shift_id = p_shift_id and resolved_at is null;

  return v_shift;
end;
$$;

-- Alleen `authenticated` (0018): een nieuwe functie krijgt standaard EXECUTE
-- voor PUBLIC. supabase/tests/rpc_execute_grants.test.sql bewaakt het.
revoke execute on function resume_orphan_shift(uuid) from public, anon;
grant execute on function resume_orphan_shift(uuid) to authenticated;
