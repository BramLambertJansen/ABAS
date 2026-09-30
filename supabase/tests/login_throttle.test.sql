-- De eigen limiet op de server-side bar-login (0035, docs/features/
-- login-rate-limit.md, ADR 0017 → Beslissing 3). Wat hier vastligt:
--
--   * elke bucket weigert bij de grens en laat eronder door;
--   * pogingen buiten het venster tellen niet;
--   * `wachtwoord_lid` laat na een minuut weer één poging door;
--   * sleutels staan alleen als sha256 in de tabel, en tellen per sleutel;
--   * de functies zijn alleen voor service_role, niet voor anon/authenticated;
--   * de tabel is niet leesbaar of schrijfbaar voor anon/authenticated;
--   * de opschoonfunctie is voor niemand en haalt rijen ouder dan 24 uur weg.
--
-- `now()` staat binnen de transactie stil, dus "eerder" is hier een rij met
-- een oudere `at`. Andere suites (e2e) kunnen rijen achterlaten: elke
-- sleutel hieronder is uniek voor dit bestand. Run met `npm run db:test`.

create extension if not exists pgtap with schema extensions;

begin;
select plan(47);

-- n registraties voor (bucket, sleutel), daarna `at` zetten op nu - p_ago.
create function pg_temp.record_n(p_bucket text, p_key text, p_n integer, p_ago interval default '0 seconds')
returns void
language plpgsql
as $fn$
begin
  for i in 1..p_n loop
    perform login_throttle_record(p_bucket, p_key);
  end loop;
  update login_throttle set at = now() - p_ago
    where bucket = p_bucket
      and key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex')
      and at = now();
end;
$fn$;

-- De test draait als eigenaar; `vergeten_totaal` heeft één vaste sleutel
-- ('*'), dus eerst de rijen van andere suites daarvoor weg.
delete from login_throttle where bucket = 'vergeten_totaal';

-- ── wachtwoord_ip: 5 foute in 10 minuten ─────────────────────────────────

select ok(login_throttle_allowed('wachtwoord_ip', 'lt-ip-w'), 'wachtwoord_ip: zonder pogingen toegestaan');
select pg_temp.record_n('wachtwoord_ip', 'lt-ip-w', 4);
select ok(login_throttle_allowed('wachtwoord_ip', 'lt-ip-w'), 'wachtwoord_ip: na 4 foute pogingen nog toegestaan');
select pg_temp.record_n('wachtwoord_ip', 'lt-ip-w', 1);
select ok(not login_throttle_allowed('wachtwoord_ip', 'lt-ip-w'), 'wachtwoord_ip: na 5 foute pogingen geweigerd');
select ok(login_throttle_allowed('wachtwoord_ip', 'lt-ip-w-ander'), 'wachtwoord_ip: een ander IP telt apart');
update login_throttle set at = now() - interval '11 minutes'
  where key_hash = encode(extensions.digest('lt-ip-w', 'sha256'), 'hex');
select ok(login_throttle_allowed('wachtwoord_ip', 'lt-ip-w'), 'wachtwoord_ip: pogingen ouder dan 10 minuten tellen niet');
select pg_temp.record_n('wachtwoord_ip', 'lt-ip-w2', 5, '9 minutes');
select ok(not login_throttle_allowed('wachtwoord_ip', 'lt-ip-w2'), 'wachtwoord_ip: 5 pogingen van 9 minuten geleden tellen nog');

-- ── pin_ip: 5 foute in 10 minuten, los van wachtwoord_ip ─────────────────

select pg_temp.record_n('pin_ip', 'lt-ip-p', 4);
select ok(login_throttle_allowed('pin_ip', 'lt-ip-p'), 'pin_ip: na 4 foute PIN''s nog toegestaan');
select pg_temp.record_n('pin_ip', 'lt-ip-p', 1);
select ok(not login_throttle_allowed('pin_ip', 'lt-ip-p'), 'pin_ip: na 5 foute PIN''s geweigerd');
select ok(login_throttle_allowed('wachtwoord_ip', 'lt-ip-p'), 'pin_ip blokkeert wachtwoord_ip op hetzelfde IP niet');
select pg_temp.record_n('wachtwoord_ip', 'lt-ip-p2', 5);
select ok(login_throttle_allowed('pin_ip', 'lt-ip-p2'), 'wachtwoord_ip blokkeert pin_ip op hetzelfde IP niet');
update login_throttle set at = now() - interval '11 minutes'
  where bucket = 'pin_ip' and key_hash = encode(extensions.digest('lt-ip-p', 'sha256'), 'hex');
select ok(login_throttle_allowed('pin_ip', 'lt-ip-p'), 'pin_ip: pogingen ouder dan 10 minuten tellen niet');

-- ── wachtwoord_lid: ≥ 10 in 15 minuten én de laatste < 1 minuut ──────────

select pg_temp.record_n('wachtwoord_lid', 'lt-lid-1', 9, '5 minutes');
select ok(login_throttle_allowed('wachtwoord_lid', 'lt-lid-1'), 'wachtwoord_lid: na 9 foute pogingen nog toegestaan');
select pg_temp.record_n('wachtwoord_lid', 'lt-lid-1', 1, '10 seconds');
select ok(not login_throttle_allowed('wachtwoord_lid', 'lt-lid-1'), 'wachtwoord_lid: 10 foute pogingen, de laatste net → geweigerd');
update login_throttle set at = now() - interval '61 seconds'
  where bucket = 'wachtwoord_lid' and key_hash = encode(extensions.digest('lt-lid-1', 'sha256'), 'hex')
    and at = now() - interval '10 seconds';
select ok(login_throttle_allowed('wachtwoord_lid', 'lt-lid-1'), 'wachtwoord_lid: na een minuut weer één poging toegestaan');
select pg_temp.record_n('wachtwoord_lid', 'lt-lid-1', 1, '5 seconds');
select ok(not login_throttle_allowed('wachtwoord_lid', 'lt-lid-1'), 'wachtwoord_lid: na die ene poging weer een minuut geweigerd');
select ok(login_throttle_allowed('wachtwoord_lid', 'lt-lid-2'), 'wachtwoord_lid: een ander lid telt apart');
select pg_temp.record_n('wachtwoord_lid', 'lt-lid-3', 10, '16 minutes');
select pg_temp.record_n('wachtwoord_lid', 'lt-lid-3', 1, '5 seconds');
select ok(login_throttle_allowed('wachtwoord_lid', 'lt-lid-3'), 'wachtwoord_lid: pogingen ouder dan 15 minuten tellen niet');

-- ── vergeten_lid: 1 aanvraag per 15 minuten ──────────────────────────────

select ok(login_throttle_allowed('vergeten_lid', 'lt-lid-v'), 'vergeten_lid: eerste aanvraag toegestaan');
select pg_temp.record_n('vergeten_lid', 'lt-lid-v', 1, '14 minutes');
select ok(not login_throttle_allowed('vergeten_lid', 'lt-lid-v'), 'vergeten_lid: een aanvraag van 14 minuten geleden → geweigerd');
update login_throttle set at = now() - interval '16 minutes'
  where bucket = 'vergeten_lid' and key_hash = encode(extensions.digest('lt-lid-v', 'sha256'), 'hex');
select ok(login_throttle_allowed('vergeten_lid', 'lt-lid-v'), 'vergeten_lid: na 15 minuten weer toegestaan');

-- ── vergeten_ip: 5 aanvragen per uur ─────────────────────────────────────

select pg_temp.record_n('vergeten_ip', 'lt-ip-v', 4, '50 minutes');
select ok(login_throttle_allowed('vergeten_ip', 'lt-ip-v'), 'vergeten_ip: na 4 aanvragen nog toegestaan');
select pg_temp.record_n('vergeten_ip', 'lt-ip-v', 1);
select ok(not login_throttle_allowed('vergeten_ip', 'lt-ip-v'), 'vergeten_ip: na 5 aanvragen in het laatste uur geweigerd');
update login_throttle set at = now() - interval '61 minutes'
  where bucket = 'vergeten_ip' and key_hash = encode(extensions.digest('lt-ip-v', 'sha256'), 'hex')
    and at = now() - interval '50 minutes';
select ok(login_throttle_allowed('vergeten_ip', 'lt-ip-v'), 'vergeten_ip: aanvragen ouder dan een uur tellen niet');

-- ── vergeten_totaal: 20 aanvragen per uur, voor iedereen samen ───────────

select pg_temp.record_n('vergeten_totaal', '*', 19, '30 minutes');
select ok(login_throttle_allowed('vergeten_totaal', '*'), 'vergeten_totaal: na 19 aanvragen nog toegestaan');
select pg_temp.record_n('vergeten_totaal', '*', 1);
select ok(not login_throttle_allowed('vergeten_totaal', '*'), 'vergeten_totaal: na 20 aanvragen in het laatste uur geweigerd');
update login_throttle set at = now() - interval '61 minutes'
  where bucket = 'vergeten_totaal' and at = now() - interval '30 minutes';
select ok(login_throttle_allowed('vergeten_totaal', '*'), 'vergeten_totaal: aanvragen ouder dan een uur tellen niet');

-- ── Buckets tellen apart ──────────────────────────────────────────────────

select pg_temp.record_n('vergeten_ip', 'lt-ip-mix', 5);
select ok(login_throttle_allowed('wachtwoord_ip', 'lt-ip-mix') and login_throttle_allowed('pin_ip', 'lt-ip-mix'),
  'aanvragen voor vergeten_ip tellen niet mee in wachtwoord_ip of pin_ip');

-- ── Ongeldige invoer ──────────────────────────────────────────────────────

select throws_ok($$ select login_throttle_allowed('onzin', 'x') $$, 'P0001', 'invalid_bucket',
  'login_throttle_allowed weigert een onbekende bucket');
select throws_ok($$ select login_throttle_record('onzin', 'x') $$, 'P0001', 'invalid_bucket',
  'login_throttle_record weigert een onbekende bucket');
select throws_ok($$ select login_throttle_record('pin_ip', null) $$, 'P0001', 'invalid_key',
  'login_throttle_record weigert een lege sleutel');

-- ── Geen ruwe sleutels in de tabel ────────────────────────────────────────

select is(
  (select count(*)::integer from login_throttle where key_hash in ('lt-ip-w', 'lt-lid-1', '*')),
  0,
  'de tabel bevat geen ruwe sleutels (IP, member_id)'
);
select ok(
  (select bool_and(key_hash ~ '^[0-9a-f]{64}$') from login_throttle),
  'elke key_hash is een sha256 in hex'
);

-- ── Opschonen ─────────────────────────────────────────────────────────────

select pg_temp.record_n('pin_ip', 'lt-ip-oud', 1, '25 hours');
select pg_temp.record_n('pin_ip', 'lt-ip-jong', 1, '23 hours');
select lives_ok($$ select purge_login_throttle() $$, 'stap: de opschoonfunctie draait');
select is(
  (select count(*)::integer from login_throttle
    where key_hash in (encode(extensions.digest('lt-ip-oud', 'sha256'), 'hex'))),
  0,
  'purge_login_throttle haalt rijen ouder dan 24 uur weg'
);
select is(
  (select count(*)::integer from login_throttle
    where key_hash in (encode(extensions.digest('lt-ip-jong', 'sha256'), 'hex'))),
  1,
  'purge_login_throttle laat jongere rijen staan'
);

-- ── Rechten: functies ─────────────────────────────────────────────────────

select ok(
  has_function_privilege('service_role', 'public.login_throttle_allowed(text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.login_throttle_record(text,text)', 'EXECUTE'),
  'de throttle-functies zijn uitvoerbaar voor service_role'
);
select ok(
  not has_function_privilege('service_role', 'public.purge_login_throttle()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.purge_login_throttle()', 'EXECUTE'),
  'purge_login_throttle is voor geen enkele API-rol uitvoerbaar'
);

set local role anon;
select throws_ok($$ select login_throttle_allowed('pin_ip', 'x') $$, '42501', null,
  'anon kan login_throttle_allowed niet aanroepen');
select throws_ok($$ select login_throttle_record('pin_ip', 'x') $$, '42501', null,
  'anon kan login_throttle_record niet aanroepen');
reset role;

set local role authenticated;
select throws_ok($$ select login_throttle_allowed('pin_ip', 'x') $$, '42501', null,
  'authenticated kan login_throttle_allowed niet aanroepen');
select throws_ok($$ select login_throttle_record('pin_ip', 'x') $$, '42501', null,
  'authenticated kan login_throttle_record niet aanroepen');

-- ── Rechten: tabel ────────────────────────────────────────────────────────

select throws_ok($$ select count(*) from login_throttle $$, '42501', null,
  'authenticated kan login_throttle niet lezen');
select throws_ok($$ insert into login_throttle (bucket, key_hash) values ('pin_ip', 'x') $$, '42501', null,
  'authenticated kan niet in login_throttle schrijven');
select throws_ok($$ delete from login_throttle $$, '42501', null,
  'authenticated kan login_throttle niet leegmaken');
reset role;

set local role anon;
select throws_ok($$ select count(*) from login_throttle $$, '42501', null,
  'anon kan login_throttle niet lezen');
select throws_ok($$ insert into login_throttle (bucket, key_hash) values ('pin_ip', 'x') $$, '42501', null,
  'anon kan niet in login_throttle schrijven');
reset role;

set local role service_role;
select lives_ok($$ select login_throttle_record('pin_ip', 'lt-ip-sr') $$,
  'service_role kan een poging registreren');
reset role;

select * from finish();
rollback;
