-- Negatieve tests voor 0015_lid_leest_alleen_eigen_rijen.sql (App-review
-- 2026-09-21, ADR 0007): een sessie die naar een members-rij met rol `lid`
-- herleidt mag alleen de eigen rijen lezen uit members/orders/order_lines/
-- top_ups. Run met `npm run db:test` (= `supabase test db`, vereist
-- `supabase start` / Docker lokaal).
--
-- Dit is het eerste testbestand in deze repo dat een *lees*-policy toetst in
-- plaats van een REVOKE of een RPC-actorcheck. Twee gevolgen voor de vorm:
--
--   1. `set local role authenticated` is hier verplicht, niet optioneel.
--      De bestaande actorcheck-tests (ledenbeheer/assortimentbeheer/…)
--      draaien als superuser en simuleren alleen `auth.uid()` via
--      request.jwt.claim.sub — dat volstaat daar, omdat de check in de
--      RPC-body zit. RLS-policies worden voor een superuser helemaal niet
--      geëvalueerd, dus zonder rolwissel zou élke assertie hieronder
--      slagen, ook met de policies verwijderd.
--   2. Fixtures moeten vóór de rolwissel staan (`authenticated` mag niet
--      schrijven, zie rls_write_protection.test.sql) en de rol wordt tussen
--      de blokken teruggezet met `reset role`.
--
-- De auth.users-fixturevorm en de request.jwt.claim.sub-simulatie van
-- auth.uid() zijn 1-op-1 overgenomen uit ledenbeheer.test.sql /
-- assortimentbeheer.test.sql — zie assortimentbeheer.test.sql voor de twee
-- aannames die alle auth.uid()-tests in deze repo delen.
--
-- Wat hier bewust *niet* getoetst wordt: de gedeelde bar-tablet-device-
-- sessie afschermen. Die houdt volle leestoegang (dat is precies wat het
-- "orphan session"-blok onderaan vastlegt als gewenst gedrag, niet als gat)
-- — zie 0015's kop en docs/adr/0007. Het dichtzetten daarvan hangt aan #15.

create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

-- ── Fixtures (als superuser, vóór de rolwissel) ──────────────────────────

insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000002a0', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-lid-a@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-lid-b@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000002a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-bardienst@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  -- Nooit door een members-rij gerefereerd: simuleert de gedeelde
  -- bar-tablet-device-sessie (een echte auth-sessie zonder gekoppeld lid).
  ('00000000-0000-0000-0000-0000000002a3', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-device@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

-- Vier leden: twee leden mét eigen account (A en B — A is de aanroeper in
-- het eerste blok, B is het lid dat onzichtbaar moet blijven), één
-- bardienst mét account, en één lid zónder account (alleen aanwezig om de
-- totaaltelling van een onbeperkte sessie op 4 te zetten).
insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-0000000002b0', 'RLS Lid A',     'lid',       null, 1000, false, '00000000-0000-0000-0000-0000000002a0'),
  ('00000000-0000-0000-0000-0000000002b1', 'RLS Lid B',     'lid',       null, 2000, false, '00000000-0000-0000-0000-0000000002a1'),
  ('00000000-0000-0000-0000-0000000002b2', 'RLS Bardienst', 'bardienst', crypt('1234', gen_salt('bf')), 0, false, '00000000-0000-0000-0000-0000000002a2'),
  ('00000000-0000-0000-0000-0000000002b3', 'RLS Lid Zonder Account', 'lid', null, 300, false, null);

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000002c0', 'RLS Test Pils', 'Bier', 250, false);

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b2');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b2');

-- Drie bestellingen: één van lid A, één van lid B, één gastverkoop
-- (member_id null — hoort bij niemand en moet dus voor géén enkel lid
-- zichtbaar zijn, zie 0015's comment op de orders-policy).
insert into orders (id, shift_id, member_id, served_by, total_cents) values
  ('00000000-0000-0000-0000-0000000002e0', '00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b0', '00000000-0000-0000-0000-0000000002b2', 250),
  ('00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b1', '00000000-0000-0000-0000-0000000002b2', 500),
  ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-0000000002d0', null,                                   '00000000-0000-0000-0000-0000000002b2', 250);

insert into order_lines (order_id, product_id, qty, unit_cents) values
  ('00000000-0000-0000-0000-0000000002e0', '00000000-0000-0000-0000-0000000002c0', 1, 250),
  ('00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-0000000002c0', 2, 250),
  ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-0000000002c0', 1, 250);

insert into top_ups (shift_id, member_id, amount_cents, method, served_by) values
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b0', 1000, 'cash', '00000000-0000-0000-0000-0000000002b2'),
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b1', 2000, 'cash', '00000000-0000-0000-0000-0000000002b2');

-- ── Blok 1: als lid A ────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a0', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  1,
  'een lid ziet precies één members-rij (de eigen), niet alle vier'
);

select is(
  (select name from members),
  'RLS Lid A',
  'de enige zichtbare members-rij is de eigen rij'
);

select is(
  (select count(*)::integer from members where id = '00000000-0000-0000-0000-0000000002b1'),
  0,
  'een lid kan het saldo van een ander lid niet lezen (CLAUDE.md → Domein)'
);

select is(
  (select count(*)::integer from orders),
  1,
  'een lid ziet alleen de eigen bestelling, niet die van lid B en niet de gastverkoop'
);

select is(
  (select count(*)::integer from orders where id = '00000000-0000-0000-0000-0000000002e2'),
  0,
  'een gastverkoop (orders.member_id is null) hoort bij niemand en is voor geen enkel lid zichtbaar'
);

select is(
  (select count(*)::integer from order_lines),
  1,
  'een lid ziet alleen de orderregels van de eigen bestelling'
);

select is(
  (select count(*)::integer from top_ups),
  1,
  'een lid ziet alleen de eigen opwaarderingen'
);

-- Bewuste reikwijdte-beslissing (Bram, app-review 2026-09-21): shifts en
-- shift_members blijven ook voor een lid leesbaar — wie welke dienst
-- draaide is binnen de vereniging geen privégegeven. Vastgelegd als
-- gewenst gedrag, zodat een latere dichtzetting een expliciete keuze is en
-- geen stille regressie van deze migratie.
select is(
  (select count(*)::integer from shifts),
  1,
  'shifts blijft leesbaar voor een lid (bewuste reikwijdte, niet beperkt door 0015)'
);

select is(
  (select count(*)::integer from shift_members),
  1,
  'shift_members blijft leesbaar voor een lid (bewuste reikwijdte, niet beperkt door 0015)'
);

reset role;

-- ── Blok 2: als bardienst — ongewijzigd t.o.v. vóór 0015 ─────────────────
-- Het punt van dit blok is dat 0015 strikt beperkend is: een
-- bardienst-sessie moet exact zien wat ze vóór deze migratie zag. Zou de
-- policy per ongeluk óók bar-rollen raken, dan valt het hele verkoopscherm
-- om (useMembers/useShiftSummary lezen alle leden en alle orders).

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a2', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  4,
  'een bardienst-sessie ziet nog steeds alle leden'
);

select is(
  (select count(*)::integer from orders),
  3,
  'een bardienst-sessie ziet nog steeds alle bestellingen, inclusief de gastverkoop'
);

select is(
  (select count(*)::integer from top_ups),
  2,
  'een bardienst-sessie ziet nog steeds alle opwaarderingen'
);

reset role;

-- ── Blok 3: als sessie zonder gekoppeld lid (de gedeelde device-sessie) ──
-- Gewenst gedrag, geen gat: de bar-tablet draait op een auth-account dat
-- bewust geen members-rij heeft (docs/ARCHITECTURE.md → "Shared bar-tablet
-- session mechanism"), en het hele verkoopscherm hangt aan die brede
-- leestoegang. 0015 mag daar niets aan veranderen; het afschermen van die
-- sessie zelf is #15's werk.

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002a3', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  4,
  'de gedeelde device-sessie (geen gekoppeld lid) ziet nog steeds alle leden'
);

select is(
  (select count(*)::integer from orders),
  3,
  'de gedeelde device-sessie ziet nog steeds alle bestellingen'
);

reset role;

select * from finish();
rollback;
