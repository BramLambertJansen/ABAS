-- Lid-account aanmaken: magic-link invite via een handmatige knop (#24),
-- docs/features/lid-account-invite.md. Sluit aan op 0008_ledenbeheer_email.sql
-- (#57, members.email zelf, expliciet zonder inviteUserByEmail-gedrag) en
-- introduceert het server-side Auth-Admin-patroon uit
-- docs/adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md.
--
-- Twee onderdelen leven hier: de database-kant (deze migratie) en de
-- server-side invite-actie (src/lib/inviteMember.ts +
-- src/app/(bar)/beheer/invite/route.ts, geen SQL — inviteUserByEmail() is
-- een Supabase Auth-API-call, kan nooit binnen een SECURITY DEFINER-functie
-- draaien, zie ADR 0006).

-- ── Datamodel ────────────────────────────────────────────────────────────

-- Nullable, geen default — zelfde "optioneel, geen migratie-backfill nodig"
-- patroon als auth_user_id (0005_assortimentbeheer.sql)/email
-- (0008_ledenbeheer_email.sql). Geen PII in de zin van ADR 0004 (spec →
-- Datamodel) — geen wijziging aan de kolomtoegang-GRANT/REVOKE uit
-- 0009_ledenbeheer_email_rpc_gated_read.sql nodig.
alter table members add column invited_at timestamptz;

-- ── RPC's ────────────────────────────────────────────────────────────────

-- Legt de koppeling `members.auth_user_id` vast ná een geslaagde
-- server-side `inviteUserByEmail()`-aanroep, en zet `invited_at`. Moet
-- aangeroepen worden met de sessie-gebonden client (src/lib/supabase/
-- server.ts), nooit de service-role-client (admin.ts) — auth.uid() is
-- alleen gevuld binnen een echte, ingelogde sessie (spec → RPC's punt 1).
--
-- Geen `role in ('bardienst', 'beheerder')`-check op het doellid binnen
-- deze RPC: die eligibility-beslissing hoort bij de server-side actie (die
-- roept deze RPC pas aan nadat inviteUserByEmail() al geslaagd is), niet
-- hier opnieuw (spec → RPC's punt 1, motivatie).
create or replace function mark_member_invited(
  p_member_id uuid,
  p_auth_user_id uuid
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

  -- Guard tegen dubbele koppeling: als er al een auth_user_id staat, mag
  -- deze RPC 'm niet overschrijven — zie spec → Randgevallen "Dubbele/
  -- gelijktijdige invite-afronding".
  if v_member.auth_user_id is not null then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  update members
    set auth_user_id = p_auth_user_id, invited_at = now()
    where id = p_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als de andere zes `returns members`-
  -- RPC's (0010_pin_hash_kolombeveiliging.sql) — deze RPC retourneert ook
  -- `members`, dus zonder deze regel lekt de ruwe bcrypt-hash opnieuw naar
  -- de client.
  v_member.pin_hash := null;

  return v_member;
end;
$$;

grant execute on function mark_member_invited to authenticated;

-- list_members_admin() (0011_list_members_admin_pin_hash_scrub.sql) doet
-- `returns setof members` via een expliciete kolommenlijst, niet `select *`
-- — een nieuwe kolom op `members` zonder deze lijst bij te werken geeft een
-- kolomaantal-mismatch (spec → Datamodel). `invited_at` staat hier als
-- laatste kolom, zelfde positie als op `members` zelf (net toegevoegd via
-- `alter table ... add column` hierboven, dus fysiek de laatste kolom van
-- de tabel/composite type). Zelfde signatuur/returntype als 0011's versie
-- -> `create or replace function`, geen `drop function`/her-`grant` nodig.
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

  return query
    select
      id,
      name,
      role,
      null::text as pin_hash,
      balance_cents,
      archived,
      created_at,
      auth_user_id,
      email,
      has_pin,
      invited_at
    from members
    order by name asc;
end;
$$;
