-- Ledenbeheer — optioneel e-mailveld (#57), docs/features/ledenbeheer-email.md.
--
-- Vervolgticket op ledenbeheer.md (#13, PR #55): dat ticket bouwde geen
-- e-mailveld bij het aanmaken/bewerken van een lid (zie spec-intro). Deze
-- migratie voegt alleen de kolom en de opslag-RPC's toe — geen
-- `inviteUserByEmail`-gedrag, dat is #24 (docs/ARCHITECTURE.md →
-- "Lid-accounts").
--
-- `members` staat al sinds 0001_init.sql in de blanket-REVOKE (regel 137) —
-- geen nieuwe REVOKE hier, exact zoals 0007_ledenbeheer.sql dat voor de
-- eerdere vier RPC's al noteerde.

-- ── Datamodel ────────────────────────────────────────────────────────────

-- Nullable, geen default, net als auth_user_id (0005_assortimentbeheer.sql).
-- Geen unique-constraint, bewust anders dan auth_user_id — zie spec →
-- Datamodel voor de motivatie (geen technische 1-op-1-noodzaak, en een
-- reëel domeinscenario dat dit ticket niet mag uitsluiten).
alter table members add column email text;

-- Db-level formaat-check, als extra laag naast de RPC-validatie hieronder —
-- zelfde soort verdediging-in-de-tabel als
-- products.price_cents integer not null check (price_cents > 0)
-- (0001_init.sql). Minimaal patroon, geen volledige RFC 5322-validatie (spec
-- → RPC's).
alter table members add constraint members_email_format_check
  check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ── RPC's ────────────────────────────────────────────────────────────────

-- create_member krijgt een derde, optionele parameter p_email. Postgres
-- behandelt create_member(text, integer) en create_member(text, integer,
-- text) als verschillende functies (overload op argumentenaantal, ook al
-- heeft de derde parameter een default) — een kale `create or replace` zou
-- de 2-parameterversie laten bestaan naast de nieuwe 3-parameterversie, wat
-- een dubbelzinnige overload oplevert. Eerst droppen, dan opnieuw aanmaken.
-- (Geen dependent objects op create_member — geen view/andere functie roept
-- 'm aan — dus geen `cascade` nodig.)
drop function if exists create_member(text, integer);

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

  v_balance_cents := coalesce(p_starting_balance_cents, 0);
  if v_balance_cents < 0 then
    raise exception 'invalid_starting_balance' using errcode = 'P0001';
  end if;

  -- Leeg/whitespace-only -> null ("geen e-mailadres", het normale geval —
  -- zie Randgevallen). Niet-leeg moet een minimaal e-mailformaat matchen.
  v_email := nullif(trim(p_email), '');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;

  insert into members (name, role, balance_cents, pin_hash, auth_user_id, archived, email)
  values (v_name, 'lid', v_balance_cents, null, null, false, v_email)
  returning * into v_member;

  return v_member;
end;
$$;

-- Het grant hierboven op create_member is niet impliciet meegegaan met de
-- drop + nieuwe create hierboven (een drop + create is een nieuw
-- database-object) — expliciet opnieuw zetten.
grant execute on function create_member to authenticated;

-- Nieuwe, losse RPC voor het wijzigen van het e-mailadres van een bestaand
-- lid — zelfde "één RPC per losse schrijfactie"-patroon als
-- update_member_name naast create_member.
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

  return v_member;
end;
$$;

grant execute on function update_member_email to authenticated;
