-- Dienst per sessie, review-fix B2 (Bram, 2026-09-30): de invite-route
-- controleert de sessie vóór hij een mail verstuurt.
--
-- src/lib/inviteMember.ts roept `inviteUserByEmail` aan met de
-- service-role-client, en pas daarna `mark_member_invite_sent`, die
-- `require_beheer_session()` doet (0029). Een beheerder in een sessie in
-- modus `bar` kon zo een uitnodiging laten versturen; alleen de registratie
-- ervan werd geweigerd. Deze functie laat de server dezelfde voorwaarde
-- vooraf controleren.
--
-- `check_beheer_session()`: precies de voorwaarde van
-- `require_beheer_session()` (een sessie in modus `beheer` van een
-- beheerder), met dezelfde foutcodes, maar zonder hartslag: alleen lezen.
-- De hartslag zet `mark_member_invite_sent` daarna zelf.

create or replace function check_beheer_session()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_session(array['beheer'], true, false);
end;
$$;

-- Alleen `authenticated` (0018): een nieuwe functie krijgt standaard EXECUTE
-- voor PUBLIC. supabase/tests/rpc_execute_grants.test.sql bewaakt het.
revoke execute on function check_beheer_session() from public, anon;
grant execute on function check_beheer_session() to authenticated;
