-- De eigen limiet op de server-side bar-login (0035, atomair sinds 0036;
-- docs/features/login-rate-limit.md, ADR 0017 → Beslissing 3). Wat hier
-- vastligt:
--
--   * elke bucket weigert bij de grens en laat eronder door;
--   * pogingen buiten het venster tellen niet;
--   * `wachtwoord_lid` laat na een minuut weer één poging door;
--   * een geweigerde reserve schrijft geen rij, ook niet in de buckets die
--     nog ruimte hadden; een toegestane schrijft per bucket één rij;
--   * release verwijdert alleen de opgegeven rijen, en een vrijgegeven
--     reservering telt niet meer;
--   * reserve weigert ongelijke arrays, een dubbele of onbekende bucket en
--     een lege sleutel;
--   * de oude login_throttle_allowed/login_throttle_record bestaan niet meer;
--   * reserve neemt een advisory lock op (bucket, sleutel-hash), tot het
--     einde van de transactie (besloten 5: gelijktijdige pogingen staan
--     achter elkaar; pgTAP heeft één verbinding, dus het lock zelf is het
--     bewijs);
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
select plan(65);

create function pg_temp.h(p_key text) returns text
language sql immutable as $fn$ select encode(extensions.digest(p_key, 'sha256'), 'hex') $fn$;

-- n eerdere (foute) pogingen voor (bucket, sleutel), `p_ago` geleden. Als
-- eigenaar rechtstreeks in de tabel: de functie onder test is reserve.
create function pg_temp.seed(p_bucket text, p_key text, p_n integer, p_ago interval default '0 seconds')
returns void
language sql
as $fn$
  insert into login_throttle (bucket, key_hash, at)
  select p_bucket, pg_temp.h(p_key), now() - p_ago from generate_series(1, p_n);
$fn$;

-- Eén bucket reserveren; true = toegestaan (en dan staat er een rij bij).
create function pg_temp.r(p_bucket text, p_key text) returns boolean
language sql
as $fn$ select allowed from login_throttle_reserve(array[p_bucket], array[p_key]) $fn$;

create function pg_temp.n(p_bucket text, p_key text) returns integer
language sql
as $fn$ select count(*)::integer from login_throttle where bucket = p_bucket and key_hash = pg_temp.h(p_key) $fn$;

-- De test draait als eigenaar; `vergeten_totaal` heeft één vaste sleutel
-- ('*'), dus eerst de rijen van andere suites daarvoor weg.
delete from login_throttle where bucket = 'vergeten_totaal';

-- ── wachtwoord_ip: 5 foute in 10 minuten ─────────────────────────────────

select pg_temp.seed('wachtwoord_ip', 'lt-ip-w', 4);
select ok(pg_temp.r('wachtwoord_ip', 'lt-ip-w'), 'wachtwoord_ip: na 4 foute pogingen nog toegestaan');
select is(pg_temp.n('wachtwoord_ip', 'lt-ip-w'), 5, 'wachtwoord_ip: de toegestane poging is als rij gereserveerd');
select ok(not pg_temp.r('wachtwoord_ip', 'lt-ip-w'), 'wachtwoord_ip: met 5 in het venster geweigerd');
select is(pg_temp.n('wachtwoord_ip', 'lt-ip-w'), 5, 'wachtwoord_ip: een geweigerde poging schrijft geen rij');
select ok(pg_temp.r('wachtwoord_ip', 'lt-ip-w-ander'), 'wachtwoord_ip: een ander IP telt apart');
update login_throttle set at = now() - interval '11 minutes'
  where bucket = 'wachtwoord_ip' and key_hash = pg_temp.h('lt-ip-w');
select ok(pg_temp.r('wachtwoord_ip', 'lt-ip-w'), 'wachtwoord_ip: pogingen ouder dan 10 minuten tellen niet');
select pg_temp.seed('wachtwoord_ip', 'lt-ip-w2', 5, '9 minutes');
select ok(not pg_temp.r('wachtwoord_ip', 'lt-ip-w2'), 'wachtwoord_ip: 5 pogingen van 9 minuten geleden tellen nog');

-- ── pin_ip: 5 foute in 10 minuten, los van wachtwoord_ip ─────────────────

select pg_temp.seed('pin_ip', 'lt-ip-p', 4);
select ok(pg_temp.r('pin_ip', 'lt-ip-p'), 'pin_ip: na 4 foute PIN''s nog toegestaan');
select ok(not pg_temp.r('pin_ip', 'lt-ip-p'), 'pin_ip: met 5 in het venster geweigerd');
select ok(pg_temp.r('wachtwoord_ip', 'lt-ip-p'), 'pin_ip blokkeert wachtwoord_ip op hetzelfde IP niet');
select pg_temp.seed('wachtwoord_ip', 'lt-ip-p2', 5);
select ok(pg_temp.r('pin_ip', 'lt-ip-p2'), 'wachtwoord_ip blokkeert pin_ip op hetzelfde IP niet');
update login_throttle set at = now() - interval '11 minutes'
  where bucket = 'pin_ip' and key_hash = pg_temp.h('lt-ip-p');
select ok(pg_temp.r('pin_ip', 'lt-ip-p'), 'pin_ip: pogingen ouder dan 10 minuten tellen niet');

-- ── wachtwoord_lid: ≥ 10 in 15 minuten én de laatste < 1 minuut ──────────

select pg_temp.seed('wachtwoord_lid', 'lt-lid-1', 9, '5 minutes');
select ok(pg_temp.r('wachtwoord_lid', 'lt-lid-1'), 'wachtwoord_lid: na 9 foute pogingen nog toegestaan');
select ok(not pg_temp.r('wachtwoord_lid', 'lt-lid-1'), 'wachtwoord_lid: 10 foute pogingen, de laatste net → geweigerd');
update login_throttle set at = now() - interval '61 seconds'
  where bucket = 'wachtwoord_lid' and key_hash = pg_temp.h('lt-lid-1') and at = now();
select ok(pg_temp.r('wachtwoord_lid', 'lt-lid-1'), 'wachtwoord_lid: na een minuut weer één poging toegestaan');
select ok(not pg_temp.r('wachtwoord_lid', 'lt-lid-1'), 'wachtwoord_lid: na die ene poging weer een minuut geweigerd');
select ok(pg_temp.r('wachtwoord_lid', 'lt-lid-2'), 'wachtwoord_lid: een ander lid telt apart');
select pg_temp.seed('wachtwoord_lid', 'lt-lid-3', 10, '16 minutes');
select pg_temp.seed('wachtwoord_lid', 'lt-lid-3', 1, '5 seconds');
select ok(pg_temp.r('wachtwoord_lid', 'lt-lid-3'), 'wachtwoord_lid: pogingen ouder dan 15 minuten tellen niet');

-- ── vergeten_lid: 1 aanvraag per 15 minuten ──────────────────────────────

select ok(pg_temp.r('vergeten_lid', 'lt-lid-v'), 'vergeten_lid: eerste aanvraag toegestaan');
select ok(not pg_temp.r('vergeten_lid', 'lt-lid-v'), 'vergeten_lid: een tweede aanvraag meteen daarna → geweigerd');
update login_throttle set at = now() - interval '14 minutes'
  where bucket = 'vergeten_lid' and key_hash = pg_temp.h('lt-lid-v');
select ok(not pg_temp.r('vergeten_lid', 'lt-lid-v'), 'vergeten_lid: een aanvraag van 14 minuten geleden → geweigerd');
update login_throttle set at = now() - interval '16 minutes'
  where bucket = 'vergeten_lid' and key_hash = pg_temp.h('lt-lid-v');
select ok(pg_temp.r('vergeten_lid', 'lt-lid-v'), 'vergeten_lid: na 15 minuten weer toegestaan');

-- ── vergeten_ip: 5 aanvragen per uur ─────────────────────────────────────

select pg_temp.seed('vergeten_ip', 'lt-ip-v', 4, '50 minutes');
select ok(pg_temp.r('vergeten_ip', 'lt-ip-v'), 'vergeten_ip: na 4 aanvragen nog toegestaan');
select ok(not pg_temp.r('vergeten_ip', 'lt-ip-v'), 'vergeten_ip: met 5 in het laatste uur geweigerd');
update login_throttle set at = now() - interval '61 minutes'
  where bucket = 'vergeten_ip' and key_hash = pg_temp.h('lt-ip-v') and at = now() - interval '50 minutes';
select ok(pg_temp.r('vergeten_ip', 'lt-ip-v'), 'vergeten_ip: aanvragen ouder dan een uur tellen niet');

-- ── vergeten_totaal: 20 aanvragen per uur, voor iedereen samen ───────────

select pg_temp.seed('vergeten_totaal', '*', 19, '30 minutes');
select ok(pg_temp.r('vergeten_totaal', '*'), 'vergeten_totaal: na 19 aanvragen nog toegestaan');
select ok(not pg_temp.r('vergeten_totaal', '*'), 'vergeten_totaal: met 20 in het laatste uur geweigerd');
update login_throttle set at = now() - interval '61 minutes'
  where bucket = 'vergeten_totaal' and at = now() - interval '30 minutes';
select ok(pg_temp.r('vergeten_totaal', '*'), 'vergeten_totaal: aanvragen ouder dan een uur tellen niet');

-- ── Buckets tellen apart ──────────────────────────────────────────────────

select pg_temp.seed('vergeten_ip', 'lt-ip-mix', 5);
select ok(pg_temp.r('wachtwoord_ip', 'lt-ip-mix') and pg_temp.r('pin_ip', 'lt-ip-mix'),
  'aanvragen voor vergeten_ip tellen niet mee in wachtwoord_ip of pin_ip');

-- ── Meerdere buckets in één poging ────────────────────────────────────────

select pg_temp.seed('wachtwoord_ip', 'lt-ip-m', 5);
select is(
  (select row(allowed, reservation_ids)::text
     from login_throttle_reserve(array['wachtwoord_ip', 'wachtwoord_lid'], array['lt-ip-m', 'lt-lid-m'])),
  row(false, '{}'::bigint[])::text,
  'een volle bucket weigert de hele poging, zonder reserveringen'
);
select is(pg_temp.n('wachtwoord_lid', 'lt-lid-m'), 0,
  'een geweigerde poging schrijft ook niets in de bucket die nog ruimte had');

create temp table res as
  select * from login_throttle_reserve(
    array['vergeten_lid', 'vergeten_ip', 'vergeten_totaal'], array['lt-lid-m3', 'lt-ip-m3', '*']);
select ok((select allowed from res), 'drie buckets met ruimte: toegestaan');
select is(
  (select array_agg(t.bucket || ':' || t.key_hash order by r.i)
     from res, unnest(res.reservation_ids) with ordinality as r(id, i)
     join login_throttle t on t.id = r.id),
  array['vergeten_lid:' || pg_temp.h('lt-lid-m3'), 'vergeten_ip:' || pg_temp.h('lt-ip-m3'),
        'vergeten_totaal:' || pg_temp.h('*')],
  'per bucket één rij, de ids in de volgorde van de buckets'
);

-- ── Vrijgeven ─────────────────────────────────────────────────────────────

select pg_temp.seed('pin_ip', 'lt-ip-r', 4);
create temp table res_r as select * from login_throttle_reserve(array['pin_ip'], array['lt-ip-r']);
select is(pg_temp.n('pin_ip', 'lt-ip-r'), 5, 'stap: de vijfde poging is gereserveerd');
select lives_ok($$ select login_throttle_release((select reservation_ids from res_r)) $$,
  'stap: de reservering wordt vrijgegeven');
select is(pg_temp.n('pin_ip', 'lt-ip-r'), 4, 'release verwijdert alleen de opgegeven rij');
select ok(pg_temp.r('pin_ip', 'lt-ip-r'), 'een vrijgegeven reservering telt niet meer');
select lives_ok($$ select login_throttle_release(array[-1, -2]::bigint[]) $$, 'release met onbekende ids is geen fout');
select lives_ok($$ select login_throttle_release((select reservation_ids from res_r)) $$,
  'release van een al vrijgegeven reservering is geen fout');
select lives_ok($$ select login_throttle_release('{}'::bigint[]) $$, 'release met een lege array doet niets');

-- ── Ongeldige invoer ──────────────────────────────────────────────────────

select throws_ok($$ select login_throttle_reserve(array['pin_ip', 'wachtwoord_ip'], array['x']) $$,
  'P0001', 'invalid_input', 'reserve weigert ongelijke arrays');
select throws_ok($$ select login_throttle_reserve('{}'::text[], '{}'::text[]) $$,
  'P0001', 'invalid_input', 'reserve weigert lege arrays');
select throws_ok($$ select login_throttle_reserve(array['pin_ip', 'pin_ip'], array['x', 'y']) $$,
  'P0001', 'invalid_input', 'reserve weigert een dubbele bucket');
select throws_ok($$ select login_throttle_reserve(array['onzin'], array['x']) $$,
  'P0001', 'invalid_bucket', 'reserve weigert een onbekende bucket');
select throws_ok($$ select login_throttle_reserve(array['pin_ip'], array['']) $$,
  'P0001', 'invalid_key', 'reserve weigert een lege sleutel');
select throws_ok($$ select login_throttle_reserve(array['pin_ip'], array[null]::text[]) $$,
  'P0001', 'invalid_key', 'reserve weigert een sleutel null');

-- ── De oude, niet-atomaire functies zijn weg ─────────────────────────────

select ok(
  to_regprocedure('public.login_throttle_allowed(text,text)') is null
  and to_regprocedure('public.login_throttle_record(text,text)') is null,
  'login_throttle_allowed en login_throttle_record bestaan niet meer'
);

-- ── Het lock (gelijktijdigheid, besloten 5) ──────────────────────────────

select pg_temp.r('pin_ip', 'lt-ip-lock');
select ok(
  exists (
    select 1
      from pg_locks l,
           lateral (select hashtextextended('login_throttle:pin_ip:' || pg_temp.h('lt-ip-lock'), 0) as k) s
     where l.locktype = 'advisory'
       and l.pid = pg_backend_pid()
       and l.granted
       and l.mode = 'ExclusiveLock'
       and l.objsubid = 1
       and l.classid = ((s.k >> 32) & 4294967295)::oid
       and l.objid = (s.k & 4294967295)::oid
  ),
  'na reserve houdt de transactie een advisory lock op (bucket, sleutel-hash)'
);

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

select pg_temp.seed('pin_ip', 'lt-ip-oud', 1, '25 hours');
select pg_temp.seed('pin_ip', 'lt-ip-jong', 1, '23 hours');
select lives_ok($$ select purge_login_throttle() $$, 'stap: de opschoonfunctie draait');
select is(pg_temp.n('pin_ip', 'lt-ip-oud'), 0, 'purge_login_throttle haalt rijen ouder dan 24 uur weg');
select is(pg_temp.n('pin_ip', 'lt-ip-jong'), 1, 'purge_login_throttle laat jongere rijen staan');

-- ── Rechten: functies ─────────────────────────────────────────────────────

select ok(
  has_function_privilege('service_role', 'public.login_throttle_reserve(text[],text[])', 'EXECUTE')
  and has_function_privilege('service_role', 'public.login_throttle_release(bigint[])', 'EXECUTE'),
  'de throttle-functies zijn uitvoerbaar voor service_role'
);
select ok(
  not has_function_privilege('service_role', 'public.purge_login_throttle()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.purge_login_throttle()', 'EXECUTE'),
  'purge_login_throttle is voor geen enkele API-rol uitvoerbaar'
);

set local role anon;
select throws_ok($$ select login_throttle_reserve(array['pin_ip'], array['x']) $$, '42501', null,
  'anon kan login_throttle_reserve niet aanroepen');
select throws_ok($$ select login_throttle_release(array[1]::bigint[]) $$, '42501', null,
  'anon kan login_throttle_release niet aanroepen');
reset role;

set local role authenticated;
select throws_ok($$ select login_throttle_reserve(array['pin_ip'], array['x']) $$, '42501', null,
  'authenticated kan login_throttle_reserve niet aanroepen');
select throws_ok($$ select login_throttle_release(array[1]::bigint[]) $$, '42501', null,
  'authenticated kan login_throttle_release niet aanroepen');

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
select lives_ok($$ select login_throttle_reserve(array['pin_ip'], array['lt-ip-sr']) $$,
  'service_role kan een poging reserveren');
reset role;

select * from finish();
rollback;
