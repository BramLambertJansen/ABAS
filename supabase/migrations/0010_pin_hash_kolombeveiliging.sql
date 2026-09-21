-- Beveiligingsfix na Reviewer-bevinding op #42 (commit fc07c62, branch
-- claude/next-ticket-8gwda6): pin_hash (bcrypt-hash van een 4-cijferige PIN)
-- kwam bij de client terecht — zowel via rechtstreekse `select`s
-- (useAlleLeden.ts/useBeheerSession.ts) als via RPC's die de volledige
-- `members`-rij teruggeven (create_member/update_member_name/
-- set_member_archived/set_member_role uit 0007_ledenbeheer.sql, set_own_pin
-- uit 0014_pin_zelfbediening.sql, update_member_email uit
-- 0008_ledenbeheer_email.sql — allemaal `returns members`, PostgREST
-- serialiseert dan élke kolom). Zie
-- docs/features/auth-methode-per-lid.md → "Beveiligingsfix na
-- Reviewer-bevinding (Architect, 2026-09-19)" voor de volledige analyse en
-- afweging van alternatieven.
--
-- Geen heroverweging van ADR 0005 of van wat `pin_hash is not null` betekent
-- ("heeft PIN aan") — alleen hoe die betekenis de client bereikt verandert:
-- via de nieuwe `has_pin` generated column in plaats van de ruwe kolom.
--
-- Nieuwe migratie, geen wijziging van 0007/0008 zelf — zelfde append-only
-- conventie als de rest van supabase/migrations/ (bv.
-- 0002_fix_start_shift_pgcrypto_search_path.sql is ook een fix op
-- 0001_init.sql via een nieuwe migratie).
--
-- Hernummerd van 0009 naar 0010 bij het mergen van `main` (2026-09-20):
-- main claimde 0009 intussen zelf voor een ongerelateerde migratie
-- (0009_ledenbeheer_email_rpc_gated_read.sql, issue #57/PR #59). Die
-- migratie deed, voor `members.email`, exact hetzelfde soort kale
-- `revoke select (<kolom>) on members from authenticated` als deze migratie
-- oorspronkelijk deed voor `pin_hash` — en dat bleek in een echte
-- `db:test`-run tegen een live Postgres geen effect te hebben ("caught: no
-- exception, wanted: 42501", zie ADR 0004 → "Correctie (Bram, na een echte
-- db:test-run in CI, PR #59)"). Oorzaak: `authenticated` heeft via
-- Supabase's platform-brede default-privileges al een *tabel-niveau*
-- SELECT-grant op `members` — een column-level REVOKE kan alleen intrekken
-- wat ooit expliciet op column-niveau gegeven is, nooit iets dat via een
-- bredere tabel-grant al toegankelijk is. Onze eigen kale
-- `revoke select (pin_hash) ...` is nooit tegen een echte database
-- geverifieerd (db:test kon in deze sandbox niet draaien) en had
-- vermoedelijk exact hetzelfde probleem — vandaar dat deze migratie nu het
-- bewezen patroon volgt in plaats van dat aan te nemen.

-- 1. Generated column: één plek die "heeft PIN" definieert, leesbaar zonder
--    de ruwe hash bloot te geven. Moet vóór de GRANT hieronder staan, want
--    die GRANT-lijst noemt deze kolom.
alter table members
  add column has_pin boolean generated always as (pin_hash is not null) stored;

-- 2. pin_hash daadwerkelijk ontoegankelijk maken voor `authenticated`, plus
--    de nieuwe has_pin-kolom zichtbaar maken.
--
--    Empirisch geverifieerd tegen een echte lokale Postgres 16 (niet
--    aangenomen — zie de migratie-intro hierboven voor waarom "aannemen"
--    hier al eerder misging): column-level GRANT en REVOKE zijn allebei
--    *additief/subtractief op zichzelf*, niet een "laatste statement wint"-
--    vervanging van een kolomlijst. Concreet, in volgorde:
--    a) Vóór 0009_ledenbeheer_email_rpc_gated_read.sql had `authenticated`
--       toegang tot heel `members` via Supabase's platform-brede
--       tabel-niveau default-grant. Tegen zo'n tabel-brede grant heeft een
--       column-level REVOKE geen effect (de oorspronkelijke bug, zie
--       migratie-intro) — bevestigd: `revoke select (pin_hash) on members
--       from authenticated` vóór 0009 zou dus NIET gewerkt hebben.
--    b) 0009_ledenbeheer_email_rpc_gated_read.sql deed
--       `revoke select on members from authenticated;` (de hele tabel-brede
--       grant ingetrokken) gevolgd door een eigen
--       `grant select (id, name, role, pin_hash, balance_cents, archived,
--       created_at, auth_user_id) on members to authenticated;` — dat is nu
--       een *column-level* grant, en noemt `pin_hash` expliciet.
--    c) Na 0009 is `pin_hash` dus weer leesbaar via die column-level grant.
--       Een latere `grant select (<lijst zonder pin_hash>) on members to
--       authenticated;` alléén (zonder expliciete REVOKE) trekt die
--       eerdere, expliciete column-level toegang NIET in — GRANT voegt
--       privileges toe, het vervangt nooit een eerder gegeven kolomlijst.
--       Geverifieerd: na zo'n her-grant zonder aparte REVOKE bleef
--       `select pin_hash from members` als `authenticated` gewoon slagen.
--    d) De enige manier om `pin_hash` nu, ná stap (b), weer dicht te maken:
--       een expliciete `revoke select (pin_hash) on members from
--       authenticated;` — en dát werkt hier wél (in tegenstelling tot vóór
--       0009), omdat er nu een column-level grant bestaat om exact tegen in
--       te trekken, in plaats van een bredere tabel-grant waar niets
--       column-level tegenover staat om te revoken.
revoke select (pin_hash) on members from authenticated;

-- has_pin bestond niet toen 0009 zijn kolomlijst samenstelde, dus die staat
-- er niet in en moet hier alsnog expliciet bij. De overige kolommen
-- hieronder staan al in 0009's grant (stap b hierboven) — opnieuw noemen is
-- overbodig maar onschadelijk (GRANT is idempotent) en maakt deze migratie
-- zelfstandig leesbaar zonder 0009 erbij te hoeven pakken.
grant select (
  id, name, role, balance_cents, archived, created_at, auth_user_id, has_pin
) on members to authenticated;

-- 3. Scrub pin_hash vlak vóór elke return die een volledige members-rij
--    teruggeeft — nodig ongeacht of stap 2 hierboven werkt: een
--    `security definer`-RPC's eigen `select`/`returning *` leest als
--    functie-eigenaar, niet als `authenticated`, en is dus nooit onderhevig
--    aan de kolomtoegang van de aanroepende rol. `create or replace
--    function` met identieke signatuur/returntype — geen drop function,
--    dus geen her-grant nodig — behalve voor create_member, zie hieronder.

-- create_member's handtekening is op `main` (0008_ledenbeheer_email.sql)
-- gewijzigd naar drie parameters (p_name, p_starting_balance_cents,
-- p_email default null) — dat is voor Postgres een ander functie-object dan
-- de oorspronkelijke tweeparameterversie uit 0007_ledenbeheer.sql (die
-- 0008_ledenbeheer_email.sql zelf al met een expliciete
-- `drop function if exists create_member(text, integer)` opruimde). Deze
-- migratie redefinieert daarom de huidige, daadwerkelijk aangeroepen
-- drie-parameterversie (functielichaam verder ongewijzigd overgenomen uit
-- 0008_ledenbeheer_email.sql, alleen de pin_hash-scrub toegevoegd) — niet de
-- allang-vervangen tweeparameterversie, die anders als dode, nooit
-- aangeroepen functie zou terugkomen terwijl de écht actieve versie
-- ongescrubd zou blijven.
create or replace function create_member(
  p_name text,
  p_starting_balance_cents integer,
  p_email text default null
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
  v_email text;
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

  -- Leeg/whitespace-only -> null ("geen e-mailadres", het normale geval).
  -- Niet-leeg moet een minimaal e-mailformaat matchen — ongewijzigd
  -- overgenomen uit 0008_ledenbeheer_email.sql.
  v_email := nullif(trim(p_email), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  insert into members (name, role, balance_cents, pin_hash, auth_user_id, archived, email)
  values (v_name, 'lid', v_balance_cents, null, null, false, v_email)
  returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;

-- Het grant hierboven op create_member is niet impliciet meegegaan met de
-- create or replace hierboven — dat verandert wel de body maar niet de
-- eerder gezette grants voor deze exacte signatuur, dus in principe
-- overbodig, maar expliciet opnieuw zetten kan geen kwaad en maakt deze
-- migratie zelfstandig leesbaar zonder 0008_ledenbeheer_email.sql erbij te
-- hoeven raadplegen voor "staat de grant er nog wel".
grant execute on function create_member(text, integer, text) to authenticated;

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

-- update_member_email (main, 0008_ledenbeheer_email.sql) heeft dezelfde
-- vorm als de vijf hierboven — beheerder-actorcheck, `returning * into
-- v_member; return v_member;` zonder scrub — en lekt dus pin_hash op
-- dezelfde manier. Niet in de oorspronkelijke Reviewer-bevinding genoemd
-- omdat deze RPC nog niet bestond toen dat ticket geschreven werd; hier
-- alsnog gescrubd om dezelfde reden als de andere vijf. Functielichaam
-- verder ongewijzigd overgenomen uit 0008_ledenbeheer_email.sql.
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

  update members set email = v_email where id = p_member_id
    returning * into v_member;

  v_member.pin_hash := null;
  return v_member;
end;
$$;
