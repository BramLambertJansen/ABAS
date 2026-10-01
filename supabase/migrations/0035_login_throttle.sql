-- Eigen limiet op de server-side bar-login (docs/features/login-rate-limit.md,
-- ADR 0017 → Beslissing 3).
--
-- De routes onder src/app/(bar)/inloggen/ loggen server-side in, dus Supabase
-- Auth ziet het IP-adres van Vercel en niet dat van de gebruiker. Deze tabel
-- telt pogingen per IP-adres van de gebruiker en per lid, vóór er een
-- aanroep naar Supabase Auth gaat. Wachtwoord en PIN tellen alleen foute
-- pogingen; "wachtwoord vergeten" telt aanvragen (Bram, 2026-09-30).
--
-- Er staan geen ruwe IP-adressen of lid-id's in de tabel: alleen de sha256
-- (hex) van de sleutel. De limieten staan vast per bucket in
-- login_throttle_allowed; een aanroeper kiest geen eigen waarde.

create table login_throttle (
  id bigint generated always as identity primary key,
  bucket text not null check (
    bucket in (
      'wachtwoord_ip', 'pin_ip', 'wachtwoord_lid',
      'vergeten_lid', 'vergeten_ip', 'vergeten_totaal'
    )
  ),
  -- sha256 (hex) van de sleutel: IP, member_id of '*'.
  key_hash text not null,
  at timestamptz not null default now()
);

create index login_throttle_bucket_key_at_idx on login_throttle (bucket, key_hash, at);

comment on table login_throttle is
  'Pogingen op de server-side bar-login per bucket en sleutel-hash (docs/features/login-rate-limit.md, ADR 0017). Alleen via login_throttle_allowed/login_throttle_record (service_role). Rijen ouder dan 24 uur ruimt purge_login_throttle() op (pg_cron).';

-- RLS aan, geen policies: geen API-rol leest of schrijft hier. De server
-- gebruikt de functies hieronder (service_role).
alter table login_throttle enable row level security;
revoke all on login_throttle from anon, authenticated;

-- ── Lezen: mag er nog een poging? ────────────────────────────────────────

-- Leest alleen. Waarden besloten door Bram (2026-09-30):
--   wachtwoord_ip   IP         foute wachtwoorden  ≥ 5 in 10 minuten
--   pin_ip          IP         foute PIN's         ≥ 5 in 10 minuten
--   wachtwoord_lid  member_id  foute wachtwoorden  ≥ 10 in 15 minuten én de
--                                                  laatste < 1 minuut geleden
--   vergeten_lid    member_id  aanvragen           ≥ 1 in 15 minuten
--   vergeten_ip     IP         aanvragen           ≥ 5 in 1 uur
--   vergeten_totaal '*'        aanvragen           ≥ 20 in 1 uur
-- `wachtwoord_lid` is een rem, geen lockout: na de tiende foute poging kan er
-- één per minuut.
create or replace function login_throttle_allowed(p_bucket text, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_count integer;
  v_last timestamptz;
begin
  if p_key is null or p_key = '' then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;
  v_hash := encode(digest(p_key, 'sha256'), 'hex');

  case p_bucket
    when 'wachtwoord_ip', 'pin_ip' then
      select count(*) into v_count from login_throttle
        where bucket = p_bucket and key_hash = v_hash and at > now() - interval '10 minutes';
      return v_count < 5;
    when 'wachtwoord_lid' then
      select count(*), max(at) into v_count, v_last from login_throttle
        where bucket = p_bucket and key_hash = v_hash and at > now() - interval '15 minutes';
      return not (v_count >= 10 and v_last > now() - interval '1 minute');
    when 'vergeten_lid' then
      select count(*) into v_count from login_throttle
        where bucket = p_bucket and key_hash = v_hash and at > now() - interval '15 minutes';
      return v_count < 1;
    when 'vergeten_ip' then
      select count(*) into v_count from login_throttle
        where bucket = p_bucket and key_hash = v_hash and at > now() - interval '1 hour';
      return v_count < 5;
    when 'vergeten_totaal' then
      select count(*) into v_count from login_throttle
        where bucket = p_bucket and key_hash = v_hash and at > now() - interval '1 hour';
      return v_count < 20;
    else
      raise exception 'invalid_bucket' using errcode = 'P0001';
  end case;
end;
$$;

-- ── Schrijven: een poging registreren ────────────────────────────────────

create or replace function login_throttle_record(p_bucket text, p_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_bucket is null or p_bucket not in (
    'wachtwoord_ip', 'pin_ip', 'wachtwoord_lid',
    'vergeten_lid', 'vergeten_ip', 'vergeten_totaal'
  ) then
    raise exception 'invalid_bucket' using errcode = 'P0001';
  end if;
  if p_key is null or p_key = '' then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;
  insert into login_throttle (bucket, key_hash)
  values (p_bucket, encode(digest(p_key, 'sha256'), 'hex'));
end;
$$;

-- ── Opschonen: rijen ouder dan 24 uur ────────────────────────────────────

-- Het langste venster is een uur; 24 uur laat ruimte om na te kijken. Valt
-- pg_cron uit, dan groeit de tabel, maar de limiet werkt nog (telling per
-- venster).
create or replace function purge_login_throttle()
returns void
language sql
security definer
set search_path = public
as $$
  delete from login_throttle where at < now() - interval '24 hours';
$$;

-- ── Rechten ──────────────────────────────────────────────────────────────
--
-- Alleen de server-side loginflow (service_role), zoals verify_bar_pin
-- (0028). Nieuwe functies krijgen standaard EXECUTE voor PUBLIC (0018);
-- supabase/tests/rpc_execute_grants.test.sql bewaakt het.
revoke execute on function
  login_throttle_allowed(text, text),
  login_throttle_record(text, text)
  from public, anon, authenticated;
grant execute on function
  login_throttle_allowed(text, text),
  login_throttle_record(text, text)
  to service_role;

-- De opschoonfunctie is alleen voor de eigenaar (de cron-job).
revoke execute on function purge_login_throttle()
  from public, anon, authenticated, service_role;

create extension if not exists pg_cron;

-- Elk uur, met een jobnaam zodat een herhaalde `cron.schedule` de job
-- bijwerkt in plaats van een tweede aan te maken (patroon uit 0025).
select cron.schedule(
  'purge_login_throttle',
  '23 * * * *',
  'select purge_login_throttle()'
);
