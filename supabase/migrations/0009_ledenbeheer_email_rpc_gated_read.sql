-- ADR 0004: members.email is PII die niet via de brede members_select-policy
-- leesbaar mag blijven (die geldt voor elke `authenticated`-sessie,
-- inclusief de gedeelde bar-tablet-sessie). Column-level REVOKE + een
-- SECURITY DEFINER-RPC met dezelfde ADR-0002-actorcheck als de overige
-- beheerder-only RPC's in dit bestand/0007/0008.
revoke select (email) on members from authenticated;

create or replace function list_members_admin()
returns setof members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
begin
  select * into v_actor
  from members
  where auth_user_id = auth.uid() and not archived;

  if v_actor.id is null then
    raise exception 'actor_not_found' using errcode = 'P0001';
  end if;
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  return query select * from members order by name asc;
end;
$$;

grant execute on function list_members_admin to authenticated;
