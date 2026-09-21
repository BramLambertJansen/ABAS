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

-- ── RPC's (herzien, 2026-09-21, PR #62-review, Bug 1-fix) ──────────────────
--
-- Vóór deze herziening was er één RPC (`mark_member_invited`) die zowel
-- `invited_at` als `auth_user_id` in dezelfde update zette — waardoor de
-- door de spec beschreven tussenstaat ("uitgenodigd, nog geen account")
-- nooit bereikbaar was (`auth_user_id` werd al gezet bij het versturen, niet
-- bij het daadwerkelijk aanklikken van de invite). Gesplitst in twee RPC's
-- met elk een eigen actor: `mark_member_invite_sent` (beheerder, zet alleen
-- `invited_at`) en `link_invited_member_account` (het uitgenodigde lid
-- zelf, zet `auth_user_id`, aangeroepen vanuit
-- src/app/(bar)/beheer/callback/route.ts). Zie
-- docs/features/lid-account-invite.md → RPC's en
-- docs/adr/0006-privileged-auth-admin-calls-via-server-actie-naast-rpc.md →
-- Aanvulling.

-- Zet `invited_at` op het moment dat een beheerder de invite-knop
-- daadwerkelijk succesvol verstuurt. Zet nooit `auth_user_id` — die
-- koppeling gebeurt pas bij acceptatie, zie `link_invited_member_account`
-- hieronder. Moet aangeroepen worden met de sessie-gebonden client
-- (src/lib/supabase/server.ts), nooit de service-role-client (admin.ts) —
-- auth.uid() is alleen gevuld binnen een echte, ingelogde sessie (spec →
-- RPC's punt 1).
--
-- Geen `role in ('bardienst', 'beheerder')`-check op het doellid binnen
-- deze RPC: die eligibility-beslissing hoort bij de server-side actie (die
-- roept deze RPC pas aan nadat inviteUserByEmail() al geslaagd is), niet
-- hier opnieuw (spec → RPC's punt 1, motivatie).
create or replace function mark_member_invite_sent(
  p_member_id uuid
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

  -- Guard tegen een overbodige/racende herbevestiging: als het lid
  -- inmiddels al gekoppeld is, heeft "invited_at" opnieuw zetten geen zin
  -- en zou het de indruk wekken dat er zojuist weer een nieuwe invite nodig
  -- was — zelfde already_linked-guard als de vorige versie van deze RPC,
  -- hier behouden op expliciet verzoek van Bram (Bug 1-fix, blijft een
  -- zinvolle bescherming tegen een dubbele koppeling).
  if v_member.auth_user_id is not null then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;

  update members
    set invited_at = now()
    where id = p_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als de andere `returns members`-RPC's
  -- (0010_pin_hash_kolombeveiliging.sql) — deze RPC retourneert ook
  -- `members`, dus zonder deze regel lekt de ruwe bcrypt-hash opnieuw naar
  -- de client.
  v_member.pin_hash := null;

  return v_member;
end;
$$;

grant execute on function mark_member_invite_sent to authenticated;

-- Legt de koppeling `members.auth_user_id` vast op het moment dat het
-- uitgenodigde lid zelf de invite-link daadwerkelijk aanklikt en accepteert
-- — aangeroepen vanuit src/app/(bar)/beheer/callback/route.ts, ná een
-- geslaagde exchangeCodeForSession(), met de zojuist tot stand gekomen
-- sessie van het lid zelf (niet een beheerder-actor). Geen parameters: de
-- RPC identificeert zelf welk members-record bij de aanroepende sessie
-- hoort via auth.email() (er bestaat op dit moment per definitie nog geen
-- members.auth_user_id om op te matchen — dát is precies wat deze RPC gaat
-- zetten). Zie spec → RPC's punt 2 en ADR 0006 → Aanvulling voor de
-- volledige motivatie van dit actor-identificatiepatroon.
--
-- Geen rolcheck, geen foutcodes: dit is geen beheerder die over een ander
-- lid beslist, maar een lid dat zijn eigen, net-geaccepteerde uitnodiging
-- afrondt. Draait op elke geslaagde /beheer/callback-aanroep, niet alleen
-- verse invite-acceptaties (ADR 0002/0003) — elk onzeker of mislukt geval
-- moet dus een stille no-op zijn, nooit een raise exception, anders zou dat
-- de bestaande, ongerelateerde login-flow breken.
create or replace function link_invited_member_account()
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

  -- Geen e-mailclaim op de sessie (zou niet moeten voorkomen voor een
  -- geslaagde e-mail-login, maar defensief): stille no-op, nooit een fout
  -- — deze RPC wordt op elke /beheer/callback-aanroep getriggerd, ook voor
  -- een doodgewone her-login (zie spec → Randgevallen).
  if v_email is null then
    return null;
  end if;

  -- Case-insensitieve match: inviteUserByEmail() stuurt het e-mailadres
  -- exact door zoals opgeslagen op members.email, maar Supabase Auth
  -- normaliseert e-mailadressen op auth.users-niveau — een members.email
  -- met hoofdletters (ledenbeheer-email.md normaliseert zelf niets) zou
  -- anders nooit matchen met auth.email(). Eerste plek in deze codebase die
  -- e-mail vergelijkt voor gelijkheid, dus geen bestaand precedent om te
  -- breken.
  --
  -- Twee losse queries i.p.v. één met min(id): min() bestaat niet voor
  -- uuid (Postgres kent geen totale ordening op dat type) -- de
  -- oorspronkelijke `select count(*), min(id) into ...`-vorm faalde
  -- daardoor op *elke* aanroep, ongeacht het aantal matches (Tester-
  -- bevinding, PR #62). count(*) bepaalt of er precies één match is; de
  -- tweede select haalt die ene rij pas op als dat al vaststaat.
  select count(*) into v_match_count
  from members
  where lower(email) = lower(v_email)
    and auth_user_id is null
    -- Alleen leden die daadwerkelijk via de handmatige knop uitgenodigd
    -- zijn komen in aanmerking — extra, goedkope verdedigingslaag
    -- (verdediging-in-twee-lagen, zelfde principe als overal elders in
    -- deze RPC-familie): zonder deze eis zou een e-mailadres dat toevallig
    -- overeenkomt met member.email, maar nooit via deze feature is
    -- uitgenodigd, alsnog gekoppeld kunnen worden.
    and invited_at is not null;

  -- 0 matches (gewone her-login van een al gekoppeld lid, of een
  -- e-mailadres dat aan geen enkel members-record hangt, of nog niet
  -- uitgenodigd) of >1 matches (e-mailcollision, zie spec → Randgevallen/
  -- Architect-beslissingen) -> stille no-op, nooit een fout. Dit mag de
  -- /beheer/callback-flow nooit blokkeren.
  if v_match_count <> 1 then
    return null;
  end if;

  select id into v_member_id
  from members
  where lower(email) = lower(v_email)
    and auth_user_id is null
    and invited_at is not null;

  update members
    set auth_user_id = auth.uid()
    where id = v_member_id
    returning * into v_member;

  -- Verplicht: zelfde pin_hash-scrub als de andere `returns members`-RPC's.
  v_member.pin_hash := null;

  return v_member;
end;
$$;

grant execute on function link_invited_member_account to authenticated;

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
