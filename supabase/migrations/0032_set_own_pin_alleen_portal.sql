-- Dienst per sessie, review-fix (Bram, 2026-09-30): `set_own_pin` alleen
-- vanuit de portal.
--
-- Spec → besluit 10: "de portal blijft de enige plek om de PIN te zetten".
-- Tot nu toe had `set_own_pin` alleen de ADR 0002-actorcheck, dus kon ook
-- een sessie op de bar (bijvoorbeeld een PIN-login op een onbewaakte
-- tablet) de PIN van dat lid veranderen. De portal registreert nooit een
-- bar-sessie (ADR 0009/0012); de bar en `/beheer` altijd (0028). Daarom:
-- heeft de sessie van de aanroeper een rij in `bar_sessions` (in welke modus
-- of toestand ook), dan weigert `set_own_pin` met `wrong_mode`, de guardcode
-- voor "deze actie hoort niet bij deze sessie".
--
-- De rest is 1-op-1 de versie uit 0029.

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
  -- 0032: niet vanuit een geregistreerde bar-sessie (bar of beheer).
  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is not null
     and exists (select 1 from bar_sessions where auth_session_id = v_session_id) then
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

-- `create or replace` behoudt de bestaande grants (alleen authenticated,
-- 0018); expliciet herhaald zodat deze migratie op zichzelf klopt.
revoke execute on function set_own_pin(text) from public, anon;
grant execute on function set_own_pin(text) to authenticated;
