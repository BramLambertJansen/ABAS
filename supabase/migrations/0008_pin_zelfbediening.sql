-- Zelfbediening: elk bardienst/beheerder-lid zet de eigen PIN-snelkoppeling
-- zelf aan of uit. docs/features/auth-methode-per-lid.md (#42), ADR 0004
-- (wachtwoord verplicht, PIN optioneel en niet-exclusief, ADR 0003 →
-- Beslissing 1 geamendeerd) → RPC's.
--
-- Geen schemawijziging: geen nieuwe kolom, geen nieuw enum. `pin_hash is not
-- null` is en blijft de volledige "heeft PIN"-vlag (0001_init.sql) — dit
-- ticket voegt alleen een RPC toe die die kolom namens de ingelogde
-- gebruiker zelf zet/leegt.
--
-- Actorcheck is lichter dan ADR 0002's beheerder-only vorm
-- (create_member/update_member_name/set_member_archived/set_member_role,
-- 0005/0007): elk niet-gearchiveerd bardienst- of beheerder-lid mag hiermee
-- bij *zichzelf* schrijven, geen `role = 'beheerder'`-eis. Nog steeds
-- hetzelfde `select * into v_actor` (niet een kolom-subset) — verplicht
-- patroon voor een row-typed PL/pgSQL-doelvariabele, zie ADR 0002 →
-- "Post-implementatie fix".
--
-- Geen zelfreferentie-guard nodig (in tegenstelling tot
-- set_member_role/set_member_archived): een lid kan zichzelf hiermee nooit
-- buitensluiten — wachtwoord-login blijft altijd bruikbaar, en zelfs het
-- uitzetten van de eigen PIN kan nooit de sessie breken waarmee deze RPC
-- wordt aangeroepen (die sessie kwam al via wachtwoord tot stand). Geen
-- `auth_user_id is not null`-check nodig als voorwaarde om een PIN aan te
-- zetten: de aanroeper bewijst dat al door deze RPC via een
-- `authenticated`-sessie met een geldige `auth.uid()` te bereiken.
--
-- start_shift blijft ongewijzigd (0001_init.sql) — PIN-login moet gewoon
-- blijven werken zolang pin_hash is not null, ongeacht of er ook een
-- wachtwoord bestaat. set_member_auth_method (het either/or-model uit een
-- eerdere conceptspec) wordt niet gebouwd, zie ADR 0004/de spec → RPC's.

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
    return v_member;
  end if;

  -- Zelfde 4-cijferige formaat als de bestaande PinPad
  -- (docs/features/dienst-starten.md).
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin_format' using errcode = 'P0001';
  end if;

  update members set pin_hash = crypt(p_pin, gen_salt('bf')) where id = v_actor.id
    returning * into v_member;

  return v_member;
end;
$$;

grant execute on function set_own_pin to authenticated;
