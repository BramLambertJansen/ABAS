-- Account koppelen alleen met bewijs van mailbezit
-- (docs/features/account-koppeling-bewijs.md, ADR 0020; item B van de review
-- van 2026-10-05).
--
-- Tot nu toe koppelden `link_invited_member_account()` (0012) en
-- `link_lid_member_account()` (0022) elk account waarvan `auth.email()`
-- overeenkwam met een uitgenodigd, nog niet gekoppeld lid. Met signup aan en
-- "Confirm email" uit kon iedereen het adres van een uitgenodigde bardienst
-- of beheerder met een eigen wachtwoord registreren, de RPC rechtstreeks
-- aanroepen en het lid aan zijn eigen account hangen.
--
-- Nu krijgt een `members`-rij alleen een `auth_user_id` als de sessie die
-- koppelt (1) via een link of code uit de mailbox tot stand kwam (`amr`),
-- (2) van het auth-account is dat de uitnodiging aanmaakte
-- (`invited_auth_user_id`), (3) een bevestigd adres heeft dat gelijk is aan
-- `members.email`; en het lid niet gearchiveerd is. Bij het koppelen worden
-- wachtwoord, MFA-factoren en alle andere sessies van het account gewist
-- (ADR 0020 → Beslissing 3). De controle zit in één interne helper; de twee
-- publieke RPC's zijn er dunne wrappers omheen (keuze 8), met dezelfde
-- signatuur.
--
-- Volgorde: kolom, backfill, list_members_admin, mark_member_invite_sent,
-- update_member_email, de helper, de wrappers.

-- ── 1. Kolom ─────────────────────────────────────────────────────────────
--
-- Geen unique: twee leden met hetzelfde adres krijgen hetzelfde id, en de
-- koppeling no-opt op "meer dan één treffer". Geen kolomrecht voor
-- `authenticated` (0009/0010 geven `select` per kolom; een nieuwe kolom valt
-- daarbuiten). Alleen de SECURITY DEFINER-RPC's zien hem.
alter table members
  add column invited_auth_user_id uuid null
    references auth.users(id) on delete set null;

-- ── 2. Backfill (keuze 9) ────────────────────────────────────────────────
--
-- Openstaande uitnodigingen van vóór deze migratie: het account dat
-- `inviteUserByEmail` aanmaakte is te herkennen aan `auth.users.invited_at`
-- (die kolom zet alleen de invite-API). Precies één treffer: invullen.
-- Anders: de uitnodiging vervalt, zodat Ledenbeheer eerlijk "nog niet
-- uitgenodigd" toont en de beheerder opnieuw kan uitnodigen. Het
-- `amr`-criterium en de reset van inloggegevens gelden bij het koppelen,
-- niet hier.
update members m
  set invited_auth_user_id = t.auth_user_id
  from (
    select mm.id as member_id,
           (array_agg(u.id))[1] as auth_user_id,
           count(*) as treffers
      from members mm
      join auth.users u
        on lower(u.email) = lower(mm.email)
       and u.invited_at is not null
     where mm.invited_at is not null
       and mm.auth_user_id is null
     group by mm.id
  ) t
  where m.id = t.member_id
    and t.treffers = 1;

update members
  set invited_at = null
  where invited_at is not null
    and auth_user_id is null
    and invited_auth_user_id is null;

-- ── 3. list_members_admin ────────────────────────────────────────────────
--
-- Body uit 0029. `returns setof members` met een expliciete kolommenlijst:
-- de nieuwe kolom moet erbij, als laatste, anders klopt het rijtype niet.
create or replace function list_members_admin()
returns setof members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
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
      invited_at,
      invited_auth_user_id
    from members
    order by name asc;
end;
$$;

-- ── 4. mark_member_invite_sent(uuid, uuid) ───────────────────────────────
--
-- Nieuwe parameter `p_auth_user_id`: het id dat `inviteUserByEmail()`
-- teruggaf (keuze 2). Alleen dat account kan het lid later koppelen. Een
-- andere signatuur, dus drop en opnieuw aanmaken (en de grants opnieuw).
drop function mark_member_invite_sent(uuid);

create function mark_member_invite_sent(
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
  v_auth_email text;
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

  -- Guard tegen een overbodige/racende herbevestiging (0012, Bug 1-fix).
  if v_member.auth_user_id is not null then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  -- 0040 (ADR 0020): het meegegeven auth-account moet op het adres van het
  -- lid staan. Vangt een race (adres gewijzigd tussen lezen en registreren)
  -- en een beheerder die via PostgREST een willekeurig id meegeeft.
  select email into v_auth_email from auth.users where id = p_auth_user_id;
  if not found
     or v_member.email is null
     or v_auth_email is null
     or lower(v_auth_email) <> lower(v_member.email) then
    raise exception 'invite_account_mismatch' using errcode = 'P0001';
  end if;

  update members
    set invited_at = now(),
        invited_auth_user_id = p_auth_user_id
    where id = p_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als de andere `returns members`-RPC's
  -- (0010_pin_hash_kolombeveiliging.sql).
  v_member.pin_hash := null;

  return v_member;
end;
$$;

revoke execute on function mark_member_invite_sent(uuid, uuid) from public, anon;
grant execute on function mark_member_invite_sent(uuid, uuid) to authenticated;

-- ── 5. update_member_email ───────────────────────────────────────────────
--
-- Body uit 0029. Nieuw (keuze 6): een ander adres (na lower(trim(...)), ook
-- wissen) wist de uitnodiging. Alleen hoofdletters wijzigen raakt hem niet.
-- Ook voor een al gekoppeld lid: één regel, geen uitzondering.
create or replace function update_member_email(
  p_member_id uuid,
  p_email text
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_email text;
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

  -- Geen eis dat het lid niet gearchiveerd is — zelfde redenering als
  -- update_member_name (ledenbeheer.md → Randgevallen "Gearchiveerd lid,
  -- naam wijzigen").
  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  -- Leeg/whitespace-only -> null: een beheerder kan een e-mailadres ook
  -- weer verwijderen (zie Randgevallen "E-mailadres wissen").
  v_email := nullif(trim(p_email), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  -- `v_member` is hier nog de oude rij.
  update members
    set email = v_email,
        invited_at = case
          when lower(coalesce(v_email, '')) = lower(coalesce(v_member.email, ''))
            then invited_at
        end,
        invited_auth_user_id = case
          when lower(coalesce(v_email, '')) = lower(coalesce(v_member.email, ''))
            then invited_auth_user_id
        end
    where id = p_member_id
    returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- ── 6. link_member_account_internal(p_role) ──────────────────────────────
--
-- Alle koppelvoorwaarden op één plek. Elke afwijking is een stille no-op
-- (`return null`), nooit een fout: de callbacks roepen de wrappers aan na
-- elke geslaagde login, ook een gewone her-login.
create or replace function link_member_account_internal(p_role text)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_session_id uuid;
  v_amr jsonb;
  v_email text;
  v_confirmed_at timestamptz;
  v_match_count int;
  v_member_id uuid;
  v_member members;
begin
  -- 1. Een ingelogde gebruiker.
  v_uid := auth.uid();
  if v_uid is null then
    return null;
  end if;

  -- 2. De eigen Auth-sessie, nodig om in stap 9 alle andere te beëindigen.
  --    Zelfde vangnet als register_bar_session (0034).
  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null then
    return null;
  end if;

  -- 3. Bewijs van mailbezit (keuze 1): de sessie kwam tot stand via een
  --    token uit een mail aan dit adres. Supabase Auth legt per sessie de
  --    methoden vast en ondertekent ze in het JWT als
  --    `amr: [{"method": ..., "timestamp": ...}]`. Onze callbacks gebruiken
  --    `verifyOtp` met `token_hash` (ADR 0008); dat geeft voor elk type
  --    `otp` (GoTrue verify.go:185 GET, :285 POST), ook bij herstel en
  --    adreswijziging. Geen lek: ook die bewijzen mailbezit van dit adres.
  --    Alleen PKCE (`?code=`) neemt de methode uit de flow state
  --    (token.go:256): `invite`, `magiclink`, `email/signup`, en ook
  --    `recovery`/`email_change`. Die laatste twee staan bewust niet in de
  --    lijst; een PKCE-flow die ze nodig heeft, voegt ze bewust toe (ADR
  --    0020 → Beslissing 7).
  v_amr := auth.jwt() -> 'amr';
  if v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    return null;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_amr) e
     where e ->> 'method' in ('invite', 'magiclink', 'otp', 'email/signup')
  ) then
    return null;
  end if;

  -- 4. Adres en bevestiging uit de bron (keuze 5). Geen controle op
  --    `encrypted_password`: GoTrue zet zelf een tijdelijk wachtwoord bij het
  --    openen van de uitnodiging (verify.go:317-329), dus een wachtwoord
  --    zegt niets. Stap 8 wist het.
  select email, email_confirmed_at
    into v_email, v_confirmed_at
    from auth.users
   where id = v_uid;
  if not found
     or v_email is null
     or v_confirmed_at is null then
    return null;
  end if;

  -- 5. Al gekoppeld: no-op. Zonder deze stap gooit de unique-constraint op
  --    auth_user_id een fout, en de RPC mag nooit gooien.
  if exists (select 1 from members where auth_user_id = v_uid) then
    return null;
  end if;

  -- 6. Precies één kandidaat. Twee queries: min() bestaat niet voor uuid
  --    (0012).
  select count(*) into v_match_count
    from members
   where invited_auth_user_id = v_uid
     and auth_user_id is null
     and invited_at is not null
     and not archived
     and lower(email) = lower(v_email)
     and (p_role is null or role::text = p_role);
  if v_match_count <> 1 then
    return null;
  end if;

  select id into v_member_id
    from members
   where invited_auth_user_id = v_uid
     and auth_user_id is null
     and invited_at is not null
     and not archived
     and lower(email) = lower(v_email)
     and (p_role is null or role::text = p_role);

  -- 7. Koppelen.
  update members
    set auth_user_id = v_uid
    where id = v_member_id
    returning * into v_member;

  -- 8. Wachtwoord en MFA-factoren wissen (keuze 3): na de koppeling komt
  --    alleen de bewijzende sessie binnen. Wat ervoor op het account stond
  --    (het GoTrue-tijdelijke wachtwoord bij het openen van de uitnodiging,
  --    verify.go:317, of een wachtwoord of TOTP-factor van een ander) is
  --    weg. De delete op auth.mfa_factors cascadeert naar
  --    auth.mfa_challenges. Zelfde soort DML op het auth-schema als 0034
  --    (auth.sessions). Alleen op dit pad, dat echt koppelt; elke no-op
  --    hierboven raakt niets aan.
  update auth.users
     set encrypted_password = ''
   where id = v_uid;

  delete from auth.mfa_factors
   where user_id = v_uid;

  -- 9. Alle andere Auth-sessies van dit account eindigen (keuze 4): een
  --    sessie van vóór de koppeling is niet aantoonbaar van de eigenaar.
  --    Precedent: close_bar_session_internal (0034). Er zijn nog geen
  --    bar_sessions (register_bar_session eist een gekoppeld lid).
  delete from auth.sessions
   where user_id = v_uid
     and id <> v_session_id;

  -- 10. Verplicht: zelfde pin_hash-scrub als elke `returns members`-RPC.
  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- Intern: voor geen enkele API-rol (zoals 0034/0037).
revoke execute on function link_member_account_internal(text)
  from public, anon, authenticated, service_role;

-- ── 7. De publieke wrappers ──────────────────────────────────────────────
--
-- Zelfde signatuur als 0012/0022, dus de callback-routes en hun TS-wrappers
-- veranderen niet. `link_lid_member_account` is nu een deelverzameling van
-- `link_invited_member_account`; weghalen valt buiten scope (keuze 8).
create or replace function link_invited_member_account()
returns members
language plpgsql
security definer
set search_path = public
as $$
begin
  return link_member_account_internal(null);
end;
$$;

create or replace function link_lid_member_account()
returns members
language plpgsql
security definer
set search_path = public
as $$
begin
  return link_member_account_internal('lid');
end;
$$;

revoke execute on function link_invited_member_account() from public, anon;
grant execute on function link_invited_member_account() to authenticated;
revoke execute on function link_lid_member_account() from public, anon;
grant execute on function link_lid_member_account() to authenticated;
