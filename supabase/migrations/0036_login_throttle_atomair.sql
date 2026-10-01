-- Atomaire loginlimiet (docs/features/login-rate-limit.md → besloten 5,
-- Bram 2026-10-01; ADR 0017 → Beslissing 3).
--
-- 0035 las eerst (`login_throttle_allowed`) en schreef pas na de poging
-- (`login_throttle_record`). Parallelle verzoeken zagen dan allemaal nog een
-- lege teller: met 50 gelijktijdige foute wachtwoorden telde de limiet van 5
-- niet. Nu reserveert één functie de poging atomair: lock per (bucket,
-- sleutel), tellen, en bij ruimte meteen een voorlopige rij schrijven. Telt
-- de uitkomst niet (geslaagd, ander fout), dan geeft de server de reservering
-- weer vrij. "Alleen foute pogingen tellen" blijft dus gelden.
--
-- De oude twee functies vervallen, zodat er geen niet-atomaire weg overblijft.

drop function if exists login_throttle_allowed(text, text);
drop function if exists login_throttle_record(text, text);

comment on table login_throttle is
  'Pogingen op de server-side bar-login per bucket en sleutel-hash (docs/features/login-rate-limit.md, ADR 0017). Alleen via login_throttle_reserve/login_throttle_release (service_role). Rijen ouder dan 24 uur ruimt purge_login_throttle() op (pg_cron).';

-- ── Reserveren: controleren en schrijven in één transactie ───────────────

-- Waarden besloten door Bram (2026-09-30), ongewijzigd uit 0035:
--   wachtwoord_ip   IP         foute wachtwoorden  ≥ 5 in 10 minuten
--   pin_ip          IP         foute PIN's         ≥ 5 in 10 minuten
--   wachtwoord_lid  member_id  foute wachtwoorden  ≥ 10 in 15 minuten én de
--                                                  laatste < 1 minuut geleden
--   vergeten_lid    member_id  aanvragen           ≥ 1 in 15 minuten
--   vergeten_ip     IP         aanvragen           ≥ 5 in 1 uur
--   vergeten_totaal '*'        aanvragen           ≥ 20 in 1 uur
--
-- Volgorde, en waarom die klopt bij gelijktijdige aanroepen:
--   1. invoer controleren en per paar de sha256 van de sleutel berekenen;
--   2. per paar een advisory xact lock, gesorteerd op (bucket, key_hash):
--      twee aanroepen met dezelfde paren wachten op elkaar en deadlocken
--      niet. Het lock geldt tot het einde van de transactie (de RPC);
--   3. pas dan tellen, in een eigen statement. De functie is volatile, dus
--      onder read committed krijgt elk statement een nieuwe snapshot en ziet
--      de telling de rijen die de vorige houder van het lock schreef — ook
--      de voorlopige rijen van pogingen die nog lopen;
--   4. is een bucket vol: niets schrijven, `allowed = false`. Anders per paar
--      één rij en de ids terug.
create or replace function login_throttle_reserve(p_buckets text[], p_keys text[])
returns table (allowed boolean, reservation_ids bigint[])
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_n integer := coalesce(cardinality(p_buckets), 0);
  v_paar record;
  v_count integer;
  v_last timestamptz;
  v_vol boolean := false;
  v_ids bigint[] := '{}';
  v_id bigint;
begin
  -- 1. Invoer: even lang, 1 tot 3 paren, geen bucket dubbel.
  if v_n <> coalesce(cardinality(p_keys), 0) or v_n < 1 or v_n > 3 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(p_buckets) as b(bucket)
    where b.bucket is null or b.bucket not in (
      'wachtwoord_ip', 'pin_ip', 'wachtwoord_lid',
      'vergeten_lid', 'vergeten_ip', 'vergeten_totaal'
    )
  ) then
    raise exception 'invalid_bucket' using errcode = 'P0001';
  end if;
  if (select count(distinct b) from unnest(p_buckets) as b) <> v_n then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_keys) as k(sleutel) where k.sleutel is null or k.sleutel = '') then
    raise exception 'invalid_key' using errcode = 'P0001';
  end if;

  -- 2. Locks in een vaste volgorde.
  for v_paar in
    select p.bucket, encode(digest(p.sleutel, 'sha256'), 'hex') as key_hash
      from unnest(p_buckets, p_keys) as p(bucket, sleutel)
     order by 1, 2
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('login_throttle:' || v_paar.bucket || ':' || v_paar.key_hash, 0)
    );
  end loop;

  -- 3. Tellen, ná alle locks.
  for v_paar in
    select p.bucket, encode(digest(p.sleutel, 'sha256'), 'hex') as key_hash
      from unnest(p_buckets, p_keys) as p(bucket, sleutel)
  loop
    case v_paar.bucket
      when 'wachtwoord_ip', 'pin_ip' then
        select count(*) into v_count from login_throttle t
          where t.bucket = v_paar.bucket and t.key_hash = v_paar.key_hash
            and t.at > now() - interval '10 minutes';
        v_vol := v_vol or v_count >= 5;
      when 'wachtwoord_lid' then
        select count(*), max(t.at) into v_count, v_last from login_throttle t
          where t.bucket = v_paar.bucket and t.key_hash = v_paar.key_hash
            and t.at > now() - interval '15 minutes';
        v_vol := v_vol or (v_count >= 10 and v_last > now() - interval '1 minute');
      when 'vergeten_lid' then
        select count(*) into v_count from login_throttle t
          where t.bucket = v_paar.bucket and t.key_hash = v_paar.key_hash
            and t.at > now() - interval '15 minutes';
        v_vol := v_vol or v_count >= 1;
      when 'vergeten_ip' then
        select count(*) into v_count from login_throttle t
          where t.bucket = v_paar.bucket and t.key_hash = v_paar.key_hash
            and t.at > now() - interval '1 hour';
        v_vol := v_vol or v_count >= 5;
      when 'vergeten_totaal' then
        select count(*) into v_count from login_throttle t
          where t.bucket = v_paar.bucket and t.key_hash = v_paar.key_hash
            and t.at > now() - interval '1 hour';
        v_vol := v_vol or v_count >= 20;
    end case;
  end loop;

  -- 4. Uitkomst: vol → niets schrijven, ook niet in de buckets met ruimte.
  if v_vol then
    return query select false, '{}'::bigint[];
    return;
  end if;

  for v_paar in
    select p.bucket, encode(digest(p.sleutel, 'sha256'), 'hex') as key_hash
      from unnest(p_buckets, p_keys) with ordinality as p(bucket, sleutel, i)
     order by p.i
  loop
    insert into login_throttle (bucket, key_hash)
    values (v_paar.bucket, v_paar.key_hash)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return query select true, v_ids;
end;
$$;

-- ── Vrijgeven: een poging die niet telt ──────────────────────────────────

-- Onbekende of al verwijderde ids zijn geen fout; een lege of null-array doet
-- niets.
create or replace function login_throttle_release(p_reservation_ids bigint[])
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from login_throttle where id = any(coalesce(p_reservation_ids, '{}'));
$$;

-- ── Rechten ──────────────────────────────────────────────────────────────
--
-- Alleen de server-side loginflow (service_role), zoals 0035. Nieuwe
-- functies krijgen standaard EXECUTE voor PUBLIC (0018);
-- supabase/tests/rpc_execute_grants.test.sql bewaakt het.
revoke execute on function
  login_throttle_reserve(text[], text[]),
  login_throttle_release(bigint[])
  from public, anon, authenticated;
grant execute on function
  login_throttle_reserve(text[], text[]),
  login_throttle_release(bigint[])
  to service_role;
