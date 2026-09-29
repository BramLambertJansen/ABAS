-- Zelfbediening: elk lid wijzigt de eigen naam vanuit de portal
-- (docs/features/portal-profiel.md → RPC's, issue #17, ADR 0012).
--
-- Zelfde vorm als set_own_pin (0014): geen doel-id-parameter, de aanroeper
-- wordt via auth.uid() herleid, dus de functie kan per constructie alleen
-- de eigen rij schrijven. supabase/tests/update_own_name.test.sql legt het
-- ene argument vast (pg_proc.pronargs = 1), zodat een latere "handige"
-- p_member_id-toevoeging rood wordt.
--
-- Actorcheck: het verplichte `select * into v_actor`-patroon uit ADR 0002 →
-- "Post-implementatie fix". Geen rij (gedeelde bar-tablet-device-sessie,
-- ongekoppelde auth.users-rij, gearchiveerd lid) → actor_not_found.
--
-- Geen rolcheck: lid, bardienst en beheerder mogen alle drie de eigen naam
-- wijzigen (spec → besluit 2: vrij, geen spoor, geen logboekregel).
--
-- Validatie letterlijk als update_member_name (0007): trim, null of leeg →
-- invalid_name. Geen maximumlengte en geen uniciteitseis, want die heeft
-- update_member_name ook niet.
--
-- Geen schemawijziging. Raakt alleen members.name; balance_cents blijft
-- onder de REVOKE update uit 0001_init.sql.
--
-- `extensions` hoeft niet in de search_path: geen pgcrypto nodig.

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

-- Uitsluitend `authenticated` (CLAUDE.md → Architectuurbeslissingen, 0018).
-- supabase/tests/rpc_execute_grants.test.sql bewaakt dit generiek.
grant execute on function update_own_name(text) to authenticated;
revoke execute on function update_own_name(text) from public;
revoke execute on function update_own_name(text) from anon;
