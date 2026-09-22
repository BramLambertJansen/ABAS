-- Activiteittypes per dienst (issue #18, docs/features/activiteittypes.md).
-- Nieuwe, beheerder-beheerbare lookup-tabel (1-op-1 het `products`-patroon
-- zonder `category`/`price_cents`), een nieuwe kolom op `shifts`, en drie
-- nieuwe beheerder-only RPC's (ADR 0002-vorm, 1-op-1 gekopieerd van
-- create_product/update_product_price/set_product_archived,
-- 0005_assortimentbeheer.sql). Raakt daarnaast `start_shift` (0001_init.sql)
-- — zie onderaan dit bestand voor die wijziging en waarom die niet zomaar
-- een `create or replace` op de bestaande functie kan zijn.
--
-- Opeenvolgend na 0014_pin_zelfbediening.sql, de hoogste bestaande migratie
-- op dit moment (0013 is bewust gereserveerd/overgeslagen, zie
-- supabase/migrations/). 0001_init.sql zelf wordt niet aangepast, zelfde
-- patroon als alle eerdere migraties.

create table activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false
);

alter table activity_types enable row level security;

create policy activity_types_select on activity_types
  for select to authenticated using (true);

-- Belt-and-braces, zelfde symmetrie-redenering als products
-- (0005_assortimentbeheer.sql) — functioneel een no-op (er is toch geen
-- insert/update/delete-policy voor authenticated), maakt alleen expliciet
-- dat dit niet per ongeluk via een toekomstige policy openschuift.
revoke insert, update, delete on activity_types from authenticated;

-- Standaard-rijen, in de migratie zelf (echte productiedata, geen
-- supabase/seed.sql-fixture) — zie spec → Datamodel voor waarom: een lege
-- activity_types-lijst zou het starten van de allereerste dienst kunnen
-- blokkeren zodra dat verplicht is. Vier typen die het ontwerp zelf als
-- startset gebruikte (designs/Bar App.dc.html regel 1580–1585,
-- ACTIVITY_TYPES). Een beheerder kan deze hernoemen/archiveren/aanvullen
-- zoals elk ander activiteittype — startpunt, geen vaste lijst.
insert into activity_types (name) values
  ('Training'),
  ('Wedstrijddag'),
  ('Toernooi'),
  ('Overig / vrij barren');

-- Nullable op schemaniveau, ook al is "verplicht" het antwoord op de
-- eerder openstaande vraag (zie spec → Datamodel/"Beantwoorde vraag") —
-- een `not null`-constraint zou met terugwerkende kracht falen op elke
-- shifts-rij die vóór deze migratie al bestond. "Verplicht" wordt
-- uitsluitend in start_shift afgedwongen voor nieuwe diensten vanaf nu.
-- Geen `on delete cascade`, geen delete-optie — archiveren, nooit
-- verwijderen (zelfde products/members-patroon); de foreign key hieronder
-- blokkeert sowieso een delete van een gebruikt type.
alter table shifts add column activity_type_id uuid references activity_types(id);

-- ── Beheerder-only RPC's ─────────────────────────────────────────────────
-- Alle drie verifiëren de aanroeper via auth.uid() -> members.auth_user_id
-- -> role = 'beheerder', per ADR 0002. `select * into v_actor` (nooit een
-- kolom-subset) — zie ADR 0002 → "Post-implementatie fix" voor waarom een
-- subset de rolcheck stil laat falen.

create or replace function create_activity_type(p_name text)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_type activity_types;
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

  insert into activity_types (name, archived) values (v_name, false)
    returning * into v_type;

  return v_type;
end;
$$;

create or replace function update_activity_type_name(
  p_activity_type_id uuid,
  p_name text
)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_name text;
  v_type activity_types;
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

  -- Geen eis dat het type niet gearchiveerd is — zelfde redenering als
  -- update_product_price op een gearchiveerd product: een naam corrigeren
  -- vlak voor het weer actief wordt, zonder eerst te de-archiveren.
  select * into v_type from activity_types where id = p_activity_type_id;
  if not found then
    raise exception 'activity_type_not_found' using errcode = 'P0001';
  end if;

  v_name := trim(p_name);
  if v_name is null or v_name = '' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  update activity_types set name = v_name where id = p_activity_type_id
    returning * into v_type;

  return v_type;
end;
$$;

create or replace function set_activity_type_archived(
  p_activity_type_id uuid,
  p_archived boolean
)
returns activity_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members;
  v_type activity_types;
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

  select * into v_type from activity_types where id = p_activity_type_id;
  if not found then
    raise exception 'activity_type_not_found' using errcode = 'P0001';
  end if;

  -- Client stuurt de expliciete eindstaat, idempotent — zelfde patroon als
  -- set_product_archived/set_member_archived. Bewust GEEN "laatste actieve
  -- type"-guard, zie spec → "Besloten door de Architect".
  update activity_types set archived = p_archived where id = p_activity_type_id
    returning * into v_type;

  return v_type;
end;
$$;

grant execute on function create_activity_type, update_activity_type_name, set_activity_type_archived
  to authenticated;

-- ── start_shift: nieuwe verplichte parameter p_activity_type_id ──────────
-- Anders dan remove_shift_member's eerdere fix (0003_...sql, zelfde naam +
-- signatuur behouden) verandert dit de parameterlijst van start_shift: van
-- (p_member_id uuid, p_pin text) naar (p_member_id uuid, p_pin text,
-- p_activity_type_id uuid). Postgres identificeert een functie op naam ÉN
-- parameterlijst samen — `create or replace function` met een andere
-- parameterlijst vervangt de bestaande 2-parameter-functie dus NIET, het
-- voegt een nieuwe, overloaded functie ernaast toe. Zonder de expliciete
-- DROP hieronder zou de oude 2-parameter start_shift (zonder
-- activiteittype-verplichting) gewoon blijven bestaan en aanroepbaar
-- blijven — wat de "verplicht"-afdwinging hieronder volledig zou omzeilen.
-- Om diezelfde reden dekt de bestaande `grant execute on function
-- start_shift, ...` uit 0001_init.sql (die destijds tegen de toen enige
-- start_shift-signatuur resolvede) de nieuwe 3-parameter-functie niet
-- automatisch — die krijgt hieronder een eigen, expliciete grant.
drop function if exists start_shift(uuid, text);

create or replace function start_shift(
  p_member_id uuid,
  p_pin text,
  p_activity_type_id uuid
)
returns shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member members;
  v_activity_type activity_types;
  v_shift shifts;
begin
  select * into v_member from members where id = p_member_id and not archived;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if v_member.role not in ('bardienst', 'beheerder') then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
  if v_member.pin_hash is null or crypt(p_pin, v_member.pin_hash) <> v_member.pin_hash then
    raise exception 'invalid_pin' using errcode = 'P0001';
  end if;

  -- "Verplicht" — de beantwoorde openstaande vraag (spec → "Beantwoorde
  -- vraag (Bram, 2026-09-22)").
  if p_activity_type_id is null then
    raise exception 'invalid_activity_type' using errcode = 'P0001';
  end if;

  select * into v_activity_type from activity_types where id = p_activity_type_id;
  if not found then
    raise exception 'activity_type_not_found' using errcode = 'P0001';
  end if;
  if v_activity_type.archived then
    raise exception 'activity_type_archived' using errcode = 'P0001';
  end if;

  insert into shifts (started_by, activity_type_id)
    values (p_member_id, p_activity_type_id)
    returning * into v_shift;
  insert into shift_members (shift_id, member_id) values (v_shift.id, p_member_id);
  return v_shift;
end;
$$;

grant execute on function start_shift(uuid, text, uuid) to authenticated;
