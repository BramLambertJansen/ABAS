-- ADR 0004: members.email is PII die niet via de brede members_select-policy
-- leesbaar mag blijven (die geldt voor elke `authenticated`-sessie,
-- inclusief de gedeelde bar-tablet-sessie). Column-level toegang + een
-- SECURITY DEFINER-RPC met dezelfde ADR-0002-actorcheck als de overige
-- beheerder-only RPC's in dit bestand/0007/0008.
--
-- Correctie t.o.v. de eerste versie van deze migratie (Bram, na een echte
-- db:test-run in CI, PR #59): een kale `revoke select (email) on members
-- from authenticated` bleek geen effect te hebben. `authenticated` heeft
-- via Supabase's platform-brede default-privileges al een *tabel-niveau*
-- SELECT-grant op `members` (noodzakelijk, anders zou de members_select
-- RLS-policy nooit iets kunnen filteren) — Postgres' privilege-model laat
-- een column-level REVOKE geen effect hebben zolang een bredere
-- table-level GRANT dezelfde toegang al dekt: een column-level REVOKE kan
-- alleen intrekken wat ooit expliciet op column-niveau gegeven is, niet
-- wat via een tabel-brede grant al bestaat. De enige manier om een kolom
-- daadwerkelijk af te schermen terwijl de rest van de tabel leesbaar
-- blijft: de tabel-brede SELECT intrekken en de overgebleven kolommen
-- expliciet, één voor één, teruggeven.
revoke select on members from authenticated;
grant select (
  id, name, role, pin_hash, balance_cents, archived, created_at, auth_user_id
) on members to authenticated;
-- `email` is bewust weggelaten uit deze lijst — dat is de daadwerkelijke
-- afscherming. `pin_hash` blijft in de lijst: was en is al niet vanuit een
-- client-hook geselecteerd (alleen server-side binnen RPC's als
-- start_shift), en dit ADR beslist bewust geen kolommen terug te draaien
-- die buiten de scope van issue #57 vallen (zie ADR 0004 → "Reikwijdte van
-- deze beslissing") — een aparte afweging voor een latere, eigen spec.

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
