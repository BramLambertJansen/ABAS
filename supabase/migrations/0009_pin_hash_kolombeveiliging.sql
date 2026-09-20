-- Beveiligingsfix na Reviewer-bevinding op #42 (commit fc07c62, branch
-- claude/next-ticket-8gwda6): pin_hash (bcrypt-hash van een 4-cijferige PIN)
-- kwam bij de client terecht — zowel via rechtstreekse `select`s
-- (useAlleLeden.ts/useBeheerSession.ts) als via vijf RPC's die de volledige
-- `members`-rij teruggeven (create_member/update_member_name/
-- set_member_archived/set_member_role uit 0007_ledenbeheer.sql, set_own_pin
-- uit 0008_pin_zelfbediening.sql — allemaal `returns members`, PostgREST
-- serialiseert dan élke kolom). Zie
-- docs/features/auth-methode-per-lid.md → "Beveiligingsfix na
-- Reviewer-bevinding (Architect, 2026-09-19)" voor de volledige analyse en
-- afweging van alternatieven.
--
-- Geen heroverweging van ADR 0004 of van wat `pin_hash is not null` betekent
-- ("heeft PIN aan") — alleen hoe die betekenis de client bereikt verandert:
-- via de nieuwe `has_pin` generated column in plaats van de ruwe kolom.
--
-- Nieuwe migratie, geen wijziging van 0007/0008 zelf — zelfde append-only
-- conventie als de rest van supabase/migrations/ (bv.
-- 0002_fix_start_shift_pgcrypto_search_path.sql is ook een fix op
-- 0001_init.sql via een nieuwe migratie).

-- 1. Generated column: één plek die "heeft PIN" definieert, leesbaar zonder
--    de ruwe hash bloot te geven.
alter table members
  add column has_pin boolean generated always as (pin_hash is not null) stored;

-- 2. Kolomniveau-REVOKE: het technische slot. Werkt naast de bestaande
--    tabelbrede members_select-RLS-policy (0001_init.sql regel 124) — RLS
--    bepaalt welke *rijen* zichtbaar zijn, dit bepaalt welke *kolom*
--    onzichtbaar blijft. Raakt start_shift/andere security definer-RPC's se
--    interne gebruik van pin_hash niet (die lezen de tabel als
--    functie-eigenaar, niet als authenticated).
revoke select (pin_hash) on members from authenticated;

-- 3. Scrub pin_hash vlak vóór elke return die een volledige members-rij
--    teruggeeft. `create or replace function` met identieke
--    signatuur/returntype — geen drop function, dus geen her-grant nodig.

create or replace function create_member(
  p_name text,
  p_starting_balance_cents integer
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_balance_cents integer;
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

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  -- Geen startsaldo (null) is het normale geval -> 0. Negatief mag nooit —
  -- dat is wat de negatieflimiet-instelling regelt voor *bestellen*, niet
  -- voor aanmaken (spec → RPC's).
  v_balance_cents := coalesce(p_starting_balance_cents, 0);
  if v_balance_cents < 0 then
    raise exception 'invalid_starting_balance' using errcode = 'P0001';
  end if;

  insert into members (name, role, balance_cents, pin_hash, auth_user_id, archived)
  values (v_name, 'lid', v_balance_cents, null, null, false)
  returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

create or replace function update_member_name(
  p_member_id uuid,
  p_name text
)
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
  if v_actor.role <> 'beheerder' then
    raise exception 'no_admin_role' using errcode = 'P0001';
  end if;

  -- Geen eis dat het lid niet gearchiveerd is — een gearchiveerd lid blijft
  -- naam-bewerkbaar, zelfde redenering als update_product_price op een
  -- gearchiveerd product (spec → Randgevallen).
  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  update members set name = v_name where id = p_member_id
    returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

create or replace function set_member_archived(
  p_member_id uuid,
  p_archived boolean
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

  -- Zelfreferentie-guard, nieuw t.o.v. het assortimentbeheer-precedent: een
  -- beheerder die zichzelf archiveert zou zichzelf bij de eerstvolgende
  -- RPC-aanroep als actor_not_found buitensluiten, zonder RPC-pad terug (spec
  -- → Randgevallen "self_archive_forbidden"). Alleen bij het daadwerkelijk
  -- archiveren van de eigen rij blokkeren — de eigen rij terugzetten
  -- (p_archived = false) kan sowieso niet voorkomen zolang de actor-check
  -- hierboven al `not archived` eist, maar wordt hier niet apart uitgesloten.
  if p_member_id = v_actor.id and p_archived then
    raise exception 'self_archive_forbidden' using errcode = 'P0001';
  end if;

  -- Client stuurt de expliciete eindstaat (geen toggle) — idempotent, zelfde
  -- verdraagzaamheid als set_product_archived.
  update members set archived = p_archived where id = p_member_id
    returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

create or replace function set_member_role(
  p_member_id uuid,
  p_role text
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_role text;
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

  -- Client stuurt de gewenste rol als tekst, niet als member_role — een
  -- ongeldige waarde moet een nette Nederlandse boodschap opleveren, niet
  -- een rauwe Postgres-enum-castfout (spec → RPC's, zelfde reden als
  -- create_product's p_price_cents-voorvalidatie).
  v_role := trim(p_role);
  if v_role is null or v_role not in ('lid', 'bardienst', 'beheerder') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;

  -- Zelfreferentie-guard, zelfde soort risico als self_archive_forbidden
  -- hierboven: een beheerder die de eigen rol verlaagt zou zichzelf bij de
  -- eerstvolgende RPC-aanroep/login als no_admin_role buitensluiten, zonder
  -- RPC-pad terug (spec → Randgevallen "self_demote_forbidden"). Dezelfde
  -- rol opnieuw sturen ('beheerder' -> 'beheerder') is geen degradatie en
  -- valt samen met de idempotentie hieronder, dus niet geblokkeerd.
  if p_member_id = v_actor.id and v_role <> 'beheerder' then
    raise exception 'self_demote_forbidden' using errcode = 'P0001';
  end if;

  -- Update alleen members.role — raakt nooit pin_hash/balance_cents/archived
  -- of shift_members/is_shift_member() (spec → Randgevallen). Idempotent:
  -- v_role gelijk aan de huidige rol slaagt gewoon, geen wijziging.
  update members set role = v_role::member_role where id = p_member_id
    returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

create or replace function set_own_pin(p_pin text)
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

  -- Zelfde foutcode-naam als start_shift gebruikt voor hetzelfde soort
  -- afwijzing — een lid-rol lid heeft geen bar-PIN-concept.
  if v_actor.role not in ('bardienst', 'beheerder') then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;

  -- p_pin null = PIN uitzetten. Geen bevestigingsstap nodig hier (die hoort
  -- client-side thuis, spec → Schermflow stap 6): uitzetten kan nooit een
  -- lid buitensluiten.
  if p_pin is null then
    update members set pin_hash = null where id = v_actor.id
      returning * into v_member;
    v_member.pin_hash := null;
    return v_member;
  end if;

  -- Zelfde 4-cijferige formaat als de bestaande PinPad
  -- (docs/features/dienst-starten.md).
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin_format' using errcode = 'P0001';
  end if;

  update members set pin_hash = crypt(p_pin, gen_salt('bf')) where id = v_actor.id
    returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;
