-- start_shift weigert een tweede open dienst — issue #29.
--
-- Er is hooguit één open dienst tegelijk op de gedeelde bar-tablet-sessie
-- (docs/ARCHITECTURE.md → "Shared bar-tablet session mechanism";
-- useOpenShift.ts leest "de" open dienst). Tot nu toe hield alleen de UI
-- dat in stand: DienstStarten.tsx toont het startscherm alleen als er geen
-- open dienst is. Twee tikken die elkaar precies overlappen (of een tweede
-- tabblad) konden toch twee open diensten opleveren. Nu weigert de RPC het
-- zelf, met een eigen foutcode `shift_already_open`, vóór de lid/PIN-checks
-- (zoals het issue voorstelt).
--
-- Alleen een `exists`-check is niet genoeg voor precies die race: onder
-- READ COMMITTED zien twee gelijktijdige aanroepen allebei nog geen open
-- dienst en voegen allebei een rij in. Daarom eerst een transactie-advisory-
-- lock, zodat gelijktijdige start_shift-aanroepen na elkaar lopen; de
-- tweede ziet dan de dienst van de eerste. Het lock komt vrij aan het eind
-- van de transactie, dus ook bij een fout (foute PIN e.d.).
--
-- Bewust géén partiële unique index op `shifts where ended_at is null`:
-- start_shift is het enige schrijfpad naar `shifts` (directe inserts zijn
-- voor authenticated/anon ingetrokken, zie rls_write_protection.test.sql),
-- en zo'n index zou een bestaande dubbele open dienst op productie de
-- migratie laten breken, plus elke pgTAP-fixture die meerdere open diensten
-- inzet.
--
-- Zelfde signatuur als 0019, dus `create or replace` vervangt de functie
-- in place en houdt de bestaande grants (alleen authenticated, 0018/0019);
-- rpc_execute_grants.test.sql blijft dat bewaken.

create or replace function start_shift(
  p_member_id uuid,
  p_pin text,
  p_activity_type_id uuid
)
returns shifts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_member members;
  v_activity_type activity_types;
  v_shift shifts;
begin
  perform pg_advisory_xact_lock(hashtext('start_shift'));
  if exists (select 1 from shifts where ended_at is null) then
    raise exception 'shift_already_open' using errcode = 'P0001';
  end if;

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
