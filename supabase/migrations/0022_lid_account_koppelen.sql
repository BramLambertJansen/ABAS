-- Ledenkoppeling voor rol `lid` — docs/features/portal-login.md →
-- "Ledenkoppeling voor rol `lid`" (Besloten door Bram, 2026-09-25, punt 1:
-- "Ja, nu meebouwen"). Hergebruikt #24's bestaande machinerie
-- (0012_lid_account_uitnodigen.sql, docs/features/lid-account-invite.md):
-- `mark_member_invite_sent`'s eligibility breidt uit naar `role in
-- ('bardienst', 'beheerder', 'lid')` in src/lib/inviteMember.ts (geen
-- SQL-wijziging nodig, zie dat bestand) — deze migratie voegt alleen de
-- nieuwe RPC toe die de koppeling zelf zet voor een `lid`-rol member,
-- aangeroepen vanuit src/app/auth/callback/route.ts (naast, en onafhankelijk
-- van, het bestaande `link_invited_member_account`).
--
-- Zelfde vorm als `link_invited_member_account` (0012), met één bewust
-- verschil: een harde `role = 'lid'`-filter, zodat de laagdrempelige
-- portal-route (geen beheerder-sessie nodig, `shouldCreateUser: true`) nooit
-- een weg wordt om een bardienst/beheerder-rol te koppelen buiten
-- `/beheer/callback`'s eigen, `invited_at`-gated pad om — een
-- bevoegdheidslek, niet een randgeval (spec → "Ledenkoppeling voor rol
-- `lid`", punt 2).

create or replace function link_lid_member_account()
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_match_count int;
  v_member_id uuid;
  v_member members;
begin
  v_email := auth.email();

  -- Geen e-mailclaim op de sessie: stille no-op, nooit een fout — deze RPC
  -- draait op elke geslaagde /auth/callback-aanroep, ook een doodgewone
  -- her-login (zie spec → Randgevallen).
  if v_email is null then
    return null;
  end if;

  -- Case-insensitieve match, zelfde reden als link_invited_member_account
  -- (0012): Supabase Auth normaliseert e-mailadressen op auth.users-niveau,
  -- members.email zelf niet.
  select count(*) into v_match_count
  from members
  where lower(email) = lower(v_email)
    and auth_user_id is null
    and invited_at is not null
    -- Harde rolfilter: bewust nooit een bardienst/beheerder-rij, ook niet
    -- als het e-mailadres toevallig matcht (spec → "Ledenkoppeling voor rol
    -- `lid`", punt 2).
    and role = 'lid';

  -- 0 matches (al gekoppeld, onbekend adres, nog niet uitgenodigd, of een
  -- bardienst/beheerder-adres dat hier nooit matcht) of >1 matches
  -- (e-mailcollision) -> stille no-op, nooit een fout. Dit mag de
  -- /auth/callback-flow nooit blokkeren.
  if v_match_count <> 1 then
    return null;
  end if;

  select id into v_member_id
  from members
  where lower(email) = lower(v_email)
    and auth_user_id is null
    and invited_at is not null
    and role = 'lid';

  update members
    set auth_user_id = auth.uid()
    where id = v_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als elke andere `returns members`-RPC
  -- (0010_pin_hash_kolombeveiliging.sql).
  v_member.pin_hash := null;

  return v_member;
end;
$$;

-- Alleen voor een ingelogde sessie. 0018 zet de default voor nieuwe functies
-- al uit, maar zelfde als 0019/0020 hier expliciet —
-- supabase/tests/rpc_execute_grants.test.sql bewaakt het.
grant execute on function link_lid_member_account to authenticated;
revoke execute on function link_lid_member_account from public;
revoke execute on function link_lid_member_account from anon;
