-- Kern-AC van docs/features/portal-profiel.md (#17) → Testplan → "db:test —
-- kern-AC over de shells heen": een PIN die het lid zelf zet via
-- set_own_pin (0014, vanuit de portal of vanuit /beheer → "Mijn account",
-- de database ziet geen verschil) is precies de PIN die start_shift (0021)
-- op het bar-tablet accepteert, en na uitzetten niet meer. Run met
-- `npm run db:test` (= `supabase test db`, vereist `supabase start` /
-- Docker lokaal).
--
-- Alles binnen deze teruggedraaide transactie, zodat de
-- één-open-dienst-guard van 0021 geen andere test raakt.

create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

-- ── Fixtures ──────────────────────────────────────────────────────────

-- Een eventueel openstaande dienst (bv. achtergelaten door de e2e-suite
-- tegen dezelfde lokale database) sluiten, anders geeft stap 1 de
-- shift_already_open-fout van 0021 in plaats van een dienst. Zelfde aanpak
-- als start_shift.test.sql.
update shifts set ended_at = now() where ended_at is null;

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000310', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sopss-bardienst-fixture@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

-- Bewust zonder PIN: zoals een bardienst die de PIN pas in de portal zet.
insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-000000000320', 'SOPSS Bardienst', 'bardienst', null, 0, false,
   '00000000-0000-0000-0000-000000000310');

insert into activity_types (id, name, archived) values
  ('00000000-0000-0000-0000-0000000003b0', 'SOPSS Activity Fixture', false);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000310', true);

-- ── Vóór set_own_pin: geen PIN, dus geen dienst ───────────────────────

select throws_ok(
  $$ select start_shift('00000000-0000-0000-0000-000000000320', '4821', '00000000-0000-0000-0000-0000000003b0') $$,
  'P0001', 'invalid_pin',
  'start_shift weigert een bardienst zonder PIN'
);

-- ── 1) set_own_pin → start_shift met dezelfde PIN slaagt ──────────────

select lives_ok(
  $$ select set_own_pin('4821') $$,
  'de bardienst zet de eigen PIN via set_own_pin'
);

-- 2) een andere PIN wordt geweigerd (vóór de geslaagde start, anders zou
-- de één-open-dienst-guard eerst afgaan).
select throws_ok(
  $$ select start_shift('00000000-0000-0000-0000-000000000320', '1234', '00000000-0000-0000-0000-0000000003b0') $$,
  'P0001', 'invalid_pin',
  'start_shift weigert een andere PIN dan die via set_own_pin is gezet'
);

select is(
  (select (start_shift('00000000-0000-0000-0000-000000000320', '4821', '00000000-0000-0000-0000-0000000003b0')).started_by),
  '00000000-0000-0000-0000-000000000320'::uuid,
  'start_shift accepteert de PIN die via set_own_pin is gezet en geeft een dienst terug'
);

-- De zojuist gestarte dienst sluiten, zodat stap 3 op de PIN-check stuit
-- en niet op de één-open-dienst-guard.
update shifts set ended_at = now() where ended_at is null;

-- ── 3) set_own_pin(null) → start_shift met de oude PIN faalt ──────────

select lives_ok(
  $$ select set_own_pin(null) $$,
  'de bardienst zet de eigen PIN uit via set_own_pin(null)'
);

select throws_ok(
  $$ select start_shift('00000000-0000-0000-0000-000000000320', '4821', '00000000-0000-0000-0000-0000000003b0') $$,
  'P0001', 'invalid_pin',
  'start_shift weigert de oude PIN nadat die via set_own_pin(null) is uitgezet'
);

select is(
  (select count(*)::integer from shifts where ended_at is null),
  0,
  'na de geweigerde start staat er geen open dienst'
);

select * from finish();
rollback;
