-- Dienst per sessie, besluit Bram 2026-09-30 (vraag 27): het PIN-vertrouwen
-- geldt per lid per apparaat.
--
-- Tot nu toe hing het verval van 30 dagen aan `bar_devices.last_seen_at`,
-- die elke login op het apparaat verlengde, van wie ook. Een lid dat één
-- keer met het wachtwoord op een tablet inlogde, bleef daar zo met de PIN
-- binnenkomen zolang een ander lid er om de paar weken inlogde. Nu: de PIN
-- van lid X werkt op apparaat D alleen als X zelf in de laatste 30 dagen op
-- D heeft ingelogd (wachtwoord of PIN). Elke login van X op D verlengt
-- alleen X's vertrouwen op D. Het apparaatcookie blijft zoals het is.
--
-- `bar_device_members.last_login_at`: de laatste login (wachtwoord of PIN)
-- van dit lid op dit apparaat. Bestaande rijen krijgen de laatste
-- wachtwoordlogin (`password_login_at`): de enige login waarvan zeker is dat
-- hij van dit lid was.
--
-- De drie functies hieronder zijn de versies uit 0028 met alleen die
-- wijziging; `create or replace` behoudt hun grants (alleen service_role
-- voor verify_bar_pin en record_bar_password_login, niemand voor
-- bar_pin_state).

alter table bar_device_members add column last_login_at timestamptz;
update bar_device_members set last_login_at = password_login_at;
alter table bar_device_members
  alter column last_login_at set not null,
  alter column last_login_at set default now();

comment on column bar_device_members.last_login_at is
  'Laatste login (wachtwoord of PIN) van dit lid op dit apparaat. De PIN werkt hier tot 30 dagen daarna (bar_pin_state, 0033).';
comment on column bar_devices.last_seen_at is
  'Laatste login op dit apparaat, van welk lid ook. Alleen informatief: het PIN-vertrouwen staat per lid in bar_device_members.last_login_at (0033).';

create or replace function bar_pin_state(p_device_token_hash text, p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member members;
  v_device bar_devices;
begin
  select * into v_member from members where id = p_member_id and not archived;
  if not found or v_member.role not in ('bardienst', 'beheerder') then
    return 'not_allowed';
  end if;
  if v_member.auth_user_id is null then
    return 'no_account';
  end if;

  -- Zonder (geldig) vertrouwd apparaat is het antwoord altijd hetzelfde,
  -- ook als het lid geen PIN heeft: iemand buiten een vertrouwd apparaat
  -- leert niet of een lid een PIN heeft.
  if p_device_token_hash is null then
    return 'pin_not_available';
  end if;
  select * into v_device from bar_devices where token_hash = p_device_token_hash;
  if not found or v_device.revoked_at is not null then
    return 'pin_not_available';
  end if;
  -- 0033: het vertrouwen geldt per lid per apparaat, 30 dagen sinds de
  -- laatste login van dít lid op dít apparaat (vraag 27, Bram 2026-09-30).
  -- De login van een ander lid verlengt het niet.
  if not exists (
    select 1 from bar_device_members
    where device_id = v_device.id
      and member_id = p_member_id
      and revoked_at is null
      and last_login_at >= now() - interval '30 days'
  ) then
    return 'pin_not_available';
  end if;

  if v_member.pin_hash is null then
    return 'pin_not_available';
  end if;
  if exists (
    select 1 from pin_failures where member_id = p_member_id and locked_at is not null
  ) then
    return 'pin_locked';
  end if;
  return 'ok';
end;
$$;

create or replace function verify_bar_pin(
  p_device_token_hash text,
  p_member_id uuid,
  p_pin text
)
returns table (
  result_code text,
  member_auth_user_id uuid,
  trusted_device_id uuid,
  attempts_left integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- Na 5 foute PIN-pogingen is de PIN van dat lid geblokkeerd, op alle
  -- apparaten (besloten, vraag 25). Foute wachtwoorden tellen niet mee: de
  -- namenlijst is openbaar, dus dan kan iedereen elke bardienst buitensluiten.
  c_max_failures constant integer := 5;
  -- Kostenfactor van de PIN-hash (B1, besloten vraag 26).
  c_bcrypt_cost constant integer := 12;
  v_state text;
  v_member members;
  v_device bar_devices;
  v_failures pin_failures;
  v_count integer;
  v_cost integer;
begin
  v_state := bar_pin_state(p_device_token_hash, p_member_id);
  if v_state <> 'ok' then
    return query select v_state, null::uuid, null::uuid, null::integer;
    return;
  end if;

  select * into v_member from members where id = p_member_id;
  select * into v_device from bar_devices where token_hash = p_device_token_hash;

  -- Per lid na elkaar: gelijktijdige pogingen omzeilen de teller niet.
  insert into pin_failures (member_id) values (p_member_id) on conflict do nothing;
  select * into v_failures from pin_failures where member_id = p_member_id for update;
  if v_failures.locked_at is not null then
    return query select 'pin_locked'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if p_pin is null or crypt(p_pin, v_member.pin_hash) <> v_member.pin_hash then
    v_count := v_failures.failed_count + 1;
    update pin_failures
      set failed_count = v_count,
          last_failed_at = now(),
          locked_at = case when v_count >= c_max_failures then now() else null end
      where member_id = p_member_id;
    if v_count >= c_max_failures then
      return query select 'pin_locked'::text, null::uuid, null::uuid, null::integer;
    else
      return query select 'invalid_pin'::text, null::uuid, null::uuid, c_max_failures - v_count;
    end if;
    return;
  end if;

  update pin_failures set failed_count = 0, last_failed_at = null
    where member_id = p_member_id;

  -- Herhashen met de nieuwe kostenfactor als de bestaande lager is: nu kent
  -- de server de PIN, dus niemand hoeft hem opnieuw in te stellen.
  v_cost := substring(v_member.pin_hash from '^\$2[abxy]?\$([0-9]{2})\$')::integer;
  if v_cost is null or v_cost < c_bcrypt_cost then
    update members set pin_hash = crypt(p_pin, gen_salt('bf', c_bcrypt_cost))
      where id = p_member_id;
  end if;

  -- Elke login verlengt het vertrouwen van dit lid op dit apparaat (0033),
  -- en niet dat van andere leden. `bar_devices.last_seen_at` blijft bij als
  -- "laatst gezien", maar bepaalt het vertrouwen niet meer.
  update bar_device_members set last_login_at = now()
    where device_id = v_device.id and member_id = p_member_id;
  update bar_devices set last_seen_at = now() where id = v_device.id;

  return query select 'ok'::text, v_member.auth_user_id, v_device.id, null::integer;
end;
$$;

create or replace function record_bar_password_login(
  p_device_token_hash text,
  p_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device bar_devices;
begin
  if p_device_token_hash is null or p_device_token_hash = '' then
    raise exception 'invalid_device' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from members
    where id = p_member_id and not archived and role in ('bardienst', 'beheerder')
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update pin_failures
    set failed_count = 0, last_failed_at = null, locked_at = null
    where member_id = p_member_id;

  select * into v_device from bar_devices where token_hash = p_device_token_hash for update;
  if not found then
    insert into bar_devices (token_hash) values (p_device_token_hash)
      returning * into v_device;
  elsif v_device.revoked_at is not null then
    return null;
  else
    update bar_devices set last_seen_at = now() where id = v_device.id;
  end if;

  -- 0033: ook `last_login_at`, het vertrouwen van dit lid op dit apparaat.
  insert into bar_device_members (device_id, member_id, password_login_at, last_login_at)
  values (v_device.id, p_member_id, now(), now())
  on conflict (device_id, member_id)
    do update set password_login_at = now(), last_login_at = now(), revoked_at = null;

  return v_device.id;
end;
$$;
