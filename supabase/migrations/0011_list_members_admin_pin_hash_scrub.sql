-- Restbeperking uit #42, opgelost na expliciet akkoord van Bram: main's
-- `list_members_admin()` (0009_ledenbeheer_email_rpc_gated_read.sql, #57)
-- deed `return query select * from members order by name asc;` zonder scrub
-- en lekte zo de ruwe bcrypt `pin_hash` naar elke beheerder-sessie die de
-- Ledentab opende — dezelfde soort kwetsbaarheid als de zes RPC's die
-- 0010_pin_hash_kolombeveiliging.sql al scrubt (create_member/
-- update_member_name/set_member_archived/set_member_role/set_own_pin/
-- update_member_email), voor dezelfde reden: een `security definer`-RPC's
-- eigen `select`/`return query` leest als functie-eigenaar, niet als
-- `authenticated`, en is dus nooit onderhevig aan de kolomtoegang die
-- 0009/0010 op tabelniveau instelden (zie 0010's intro). Bewust niet
-- opgelost in 0010 zelf, op instructie destijds ("main's functie, niet
-- dubbel definiëren") — gedocumenteerd als openstaande restbeperking in
-- docs/features/auth-methode-per-lid.md → "Niet gewijzigd door deze fix".
--
-- Andere vorm dan de zes RPC's in 0010: die scrubben een losse
-- `v_member`-variabele (`v_member.pin_hash := null;`) na een enkele
-- insert/update-`returning * into`. `list_members_admin()` retourneert
-- `setof members` via `return query select * from members ...` — er is geen
-- enkele rij-variabele om na afloop te muteren. `returns setof members`
-- betekent dat elke rij van de `return query`-select positioneel op de
-- kolommen van `members` moet passen (aantal en type, niet per se de namen)
-- — een kolom gewoon weglaten zou dus een kolomaantal-mismatch geven, geen
-- optie. In plaats daarvan wordt de select een expliciete kolommenlijst,
-- met `null::text as pin_hash` op exact de plek waar `pin_hash` in
-- `members` staat, zodat elke geretourneerde rij nog steeds voldoet aan het
-- `setof members`-contract maar de kolom zelf nooit de echte hash bevat.
--
-- Identieke signatuur/returntype (`list_members_admin()`, `returns setof
-- members`) -> `create or replace function`, geen `drop function`, dus ook
-- geen her-`grant execute` nodig (0009's grant blijft gewoon staan).
--
-- Empirisch geverifieerd tegen een lokale Postgres 16 (geen Docker/
-- Supabase-CLI/pgTAP beschikbaar in deze sandbox, zelfde beperking als
-- 0010): de volledige migratieketen 0001 t/m deze migratie toegepast op een
-- verse database met gestubde `auth.uid()`/`auth.users`, een beheerder-lid
-- met een echte bcrypt `pin_hash` aangemaakt, en `select * from
-- list_members_admin()` als `authenticated` met een geldige beheerder-JWT-
-- sub uitgevoerd: het `pin_hash`-veld in het resultaat is `null`, `has_pin`
-- blijft `true`, en de overige kolommen (inclusief `email`, dat nog steeds
-- via de kolomtoegang uit 0009 wordt teruggegeven) komen ongewijzigd mee.
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
      has_pin
    from members
    order by name asc;
end;
$$;
