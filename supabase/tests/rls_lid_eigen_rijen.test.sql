-- Negatieve tests voor de leespolicies op members/orders/order_lines/
-- top_ups/order_reversals: 0015_lid_leest_alleen_eigen_rijen.sql (App-review
-- 2026-09-21, ADR 0007), 0020 (order_reversals) en
-- 0039_leespolicies_allowlist.sql (ADR 0019). Brede leestoegang heeft alleen
-- een actieve bar-rol (gekoppeld, rol bardienst of beheerder, niet
-- gearchiveerd); iedereen anders, ook een gearchiveerde bar-rol, leest
-- alleen de eigen rijen, en een account zonder gekoppeld lid leest niets.
-- Run met `npm run db:test` (= `supabase test db`, vereist
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
-- Sinds 0041 (ADR 0022) eist elke leespolicy ook een levende Auth-sessie:
-- de claims gaan via request.jwt.claims met `sub` én `session_id`, en elk
-- account heeft een rij in auth.sessions. De dode sessie zelf toetst
-- sessie_na_afmelden.test.sql.
--
-- Sinds 0039 (ADR 0019) legt blok 3 vast dat een account zonder gekoppeld
-- lid uit de vijf tabellen niets leest; vóór 0039 las zo'n account alles
-- (de denylist `not caller_is_lid()`), wat dit bestand toen als gewenst
-- gedrag vastlegde voor de inmiddels vervallen device-sessie (ADR 0016).
--
-- **Geen absolute rij-aantallen in dit bestand.** De eerste versie hiervan
-- assereerde "een bardienst ziet 4 leden" en dergelijke, wat lokaal tegen
-- een lege database klopte maar in CI faalde (run 35696784506): `db:test`
-- draait daar tegen een database die `supabase start` al met
-- `supabase/seed.sql` heeft gevuld (5 leden) én waar `check:a11y` vlak
-- daarvoor doorheen is gelopen — die start echte diensten, dus `shifts` en
-- `shift_members` zijn dan ook niet leeg. Elke "ziet alles"-assertie
-- vergelijkt daarom met het werkelijke tabeltotaal, vastgelegd als
-- superuser vóór de rolwissel. Dat is bovendien een sterkere bewering dan
-- een hardgecodeerd getal: hij zegt letterlijk "deze sessie ziet de hele
-- tabel", niet "deze sessie ziet er toevallig vier". "Ziet niets" is wél
-- absoluut 0: dat verandert door geen enkele seed-rij.

create extension if not exists pgtap with schema extensions;

begin;
select plan(45);

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
  -- Nooit door een members-rij gerefereerd: account zonder gekoppeld lid
  -- (verkeerd uitgenodigd, self-signup, oud device-account).
  ('00000000-0000-0000-0000-0000000002a3', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-device@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000002a4', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-gearch-bardienst@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000002a5', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-beheerder@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-0000000002a6', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-gearch-beheerder@test.local',
   crypt('not-used', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}');

-- Zeven leden: twee leden mét eigen account (A en B — A is de aanroeper in
-- het eerste blok, B is het lid dat onzichtbaar moet blijven), één
-- actieve bardienst mét account, één lid zónder account, een gearchiveerde
-- bardienst (blok 4), een actieve beheerder (blok 2b) en een gearchiveerde
-- beheerder (blok 5).
insert into members (id, name, role, pin_hash, balance_cents, archived, auth_user_id) values
  ('00000000-0000-0000-0000-0000000002b0', 'RLS Lid A',     'lid',       null, 1000, false, '00000000-0000-0000-0000-0000000002a0'),
  ('00000000-0000-0000-0000-0000000002b1', 'RLS Lid B',     'lid',       null, 2000, false, '00000000-0000-0000-0000-0000000002a1'),
  ('00000000-0000-0000-0000-0000000002b2', 'RLS Bardienst', 'bardienst', crypt('1234', gen_salt('bf')), 0, false, '00000000-0000-0000-0000-0000000002a2'),
  ('00000000-0000-0000-0000-0000000002b3', 'RLS Lid Zonder Account', 'lid', null, 300, false, null),
  ('00000000-0000-0000-0000-0000000002b4', 'RLS Gearchiveerde Bardienst', 'bardienst', null, 400, true, '00000000-0000-0000-0000-0000000002a4'),
  ('00000000-0000-0000-0000-0000000002b5', 'RLS Beheerder', 'beheerder', null, 0, false, '00000000-0000-0000-0000-0000000002a5'),
  ('00000000-0000-0000-0000-0000000002b6', 'RLS Gearchiveerde Beheerder', 'beheerder', null, 0, true, '00000000-0000-0000-0000-0000000002a6');

insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000002c0', 'RLS Test Pils', 'Bier', 250, false);

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b2');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b2');

-- Vier bestellingen: één van lid A, één van lid B, één gastverkoop
-- (member_id null — hoort bij niemand en moet dus voor géén enkel lid
-- zichtbaar zijn, zie 0015's comment op de orders-policy), en één van de
-- gearchiveerde bardienst (blok 4: "ziet alleen eigen" ≠ "ziet niets").
insert into orders (id, shift_id, member_id, served_by, total_cents) values
  ('00000000-0000-0000-0000-0000000002e0', '00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b0', '00000000-0000-0000-0000-0000000002b2', 250),
  ('00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b1', '00000000-0000-0000-0000-0000000002b2', 500),
  ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-0000000002d0', null,                                   '00000000-0000-0000-0000-0000000002b2', 250),
  ('00000000-0000-0000-0000-0000000002e3', '00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b4', '00000000-0000-0000-0000-0000000002b2', 250);

insert into order_lines (order_id, product_id, qty, unit_cents) values
  ('00000000-0000-0000-0000-0000000002e0', '00000000-0000-0000-0000-0000000002c0', 1, 250),
  ('00000000-0000-0000-0000-0000000002e1', '00000000-0000-0000-0000-0000000002c0', 2, 250),
  ('00000000-0000-0000-0000-0000000002e2', '00000000-0000-0000-0000-0000000002c0', 1, 250),
  ('00000000-0000-0000-0000-0000000002e3', '00000000-0000-0000-0000-0000000002c0', 1, 250);

-- Terugdraaiingen (0020): één van lid A, één van lid B, één van de
-- gearchiveerde bardienst.
insert into order_reversals (order_id, reason, reversed_by, via, shift_id, refunded_cents) values
  ('00000000-0000-0000-0000-0000000002e0', 'rls test', '00000000-0000-0000-0000-0000000002b2', 'bar', '00000000-0000-0000-0000-0000000002d0', 250),
  ('00000000-0000-0000-0000-0000000002e1', 'rls test', '00000000-0000-0000-0000-0000000002b2', 'bar', '00000000-0000-0000-0000-0000000002d0', 500),
  ('00000000-0000-0000-0000-0000000002e3', 'rls test', '00000000-0000-0000-0000-0000000002b2', 'bar', '00000000-0000-0000-0000-0000000002d0', 250);

insert into top_ups (shift_id, member_id, amount_cents, method, served_by) values
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b0', 1000, 'cash', '00000000-0000-0000-0000-0000000002b2'),
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b1', 2000, 'cash', '00000000-0000-0000-0000-0000000002b2'),
  ('00000000-0000-0000-0000-0000000002d0', '00000000-0000-0000-0000-0000000002b4', 500,  'cash', '00000000-0000-0000-0000-0000000002b2');

-- ── Referentietotalen (als superuser, vóór de rolwissel) ─────────────────
--
-- RLS geldt niet voor een superuser, dus dit zijn de werkelijke aantallen
-- in de tabel — inclusief wat seed.sql en een eerdere check:a11y-run
-- hebben achtergelaten. Transactie-lokale GUC's (`set_config(..., true)`),
-- dus ze verdwijnen met de rollback en overleven de rolwissels hieronder.
select set_config('abas.n_members',       (select count(*)::text from members),       true);
select set_config('abas.n_orders',        (select count(*)::text from orders),        true);
select set_config('abas.n_order_lines',   (select count(*)::text from order_lines),   true);
select set_config('abas.n_top_ups',       (select count(*)::text from top_ups),       true);
select set_config('abas.n_shifts',        (select count(*)::text from shifts),        true);
select set_config('abas.n_shift_members', (select count(*)::text from shift_members), true);
select set_config('abas.n_products',      (select count(*)::text from products),      true);
select set_config('abas.n_order_reversals', (select count(*)::text from order_reversals), true);

-- De rijen die lid A toebehoren — waartegen de beperkte kant gemeten wordt.
-- Ook dit als referentie in plaats van een vast getal, zodat dit bestand
-- niet stilletjes verkeerd wordt als seed.sql ooit een bestelling toevoegt.
select set_config('abas.n_orders_lid_a', (
  select count(*)::text from orders where member_id = '00000000-0000-0000-0000-0000000002b0'), true);
select set_config('abas.n_order_lines_lid_a', (
  select count(*)::text from order_lines ol join orders o on o.id = ol.order_id
   where o.member_id = '00000000-0000-0000-0000-0000000002b0'), true);
select set_config('abas.n_order_reversals_lid_a', (
  select count(*)::text from order_reversals r join orders o on o.id = r.order_id
   where o.member_id = '00000000-0000-0000-0000-0000000002b0'), true);
select set_config('abas.n_top_ups_lid_a', (
  select count(*)::text from top_ups where member_id = '00000000-0000-0000-0000-0000000002b0'), true);

-- Idem voor de gearchiveerde bardienst …02b4 (blok 4).
select set_config('abas.n_orders_gearch', (
  select count(*)::text from orders where member_id = '00000000-0000-0000-0000-0000000002b4'), true);
select set_config('abas.n_order_lines_gearch', (
  select count(*)::text from order_lines ol join orders o on o.id = ol.order_id
   where o.member_id = '00000000-0000-0000-0000-0000000002b4'), true);
select set_config('abas.n_order_reversals_gearch', (
  select count(*)::text from order_reversals r join orders o on o.id = r.order_id
   where o.member_id = '00000000-0000-0000-0000-0000000002b4'), true);
select set_config('abas.n_top_ups_gearch', (
  select count(*)::text from top_ups where member_id = '00000000-0000-0000-0000-0000000002b4'), true);

-- ── Blok 1: als lid A ────────────────────────────────────────────────────

-- Een levende Auth-sessie per account (id = het auth-id): elke leespolicy
-- en de guardvrije RPC's eisen haar (0041, ADR 0022).
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000002a0', '00000000-0000-0000-0000-0000000002a0', now(), now()),
  ('00000000-0000-0000-0000-0000000002a2', '00000000-0000-0000-0000-0000000002a2', now(), now()),
  ('00000000-0000-0000-0000-0000000002a5', '00000000-0000-0000-0000-0000000002a5', now(), now()),
  ('00000000-0000-0000-0000-0000000002a3', '00000000-0000-0000-0000-0000000002a3', now(), now()),
  ('00000000-0000-0000-0000-0000000002a4', '00000000-0000-0000-0000-0000000002a4', now(), now()),
  ('00000000-0000-0000-0000-0000000002a6', '00000000-0000-0000-0000-0000000002a6', now(), now());

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a0","session_id":"00000000-0000-0000-0000-0000000002a0"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  1,
  'een lid ziet precies één members-rij (de eigen), ongeacht hoeveel er zijn'
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
  current_setting('abas.n_orders_lid_a')::integer,
  'een lid ziet precies de eigen bestellingen, niet die van lid B en niet de gastverkoop'
);

select is(
  (select count(*)::integer from orders where id = '00000000-0000-0000-0000-0000000002e2'),
  0,
  'een gastverkoop (orders.member_id is null) hoort bij niemand en is voor geen enkel lid zichtbaar'
);

select is(
  (select count(*)::integer from order_lines),
  current_setting('abas.n_order_lines_lid_a')::integer,
  'een lid ziet alleen de orderregels van de eigen bestellingen'
);

select is(
  (select count(*)::integer from top_ups),
  current_setting('abas.n_top_ups_lid_a')::integer,
  'een lid ziet alleen de eigen opwaarderingen'
);

select is(
  (select count(*)::integer from order_reversals),
  current_setting('abas.n_order_reversals_lid_a')::integer,
  'een lid ziet alleen de terugdraaiingen van de eigen bestellingen (0020)'
);

-- Bewuste reikwijdte-beslissing (Bram, app-review 2026-09-21): shifts en
-- shift_members blijven ook voor een lid leesbaar — wie welke dienst
-- draaide is binnen de vereniging geen privégegeven. Vastgelegd als
-- gewenst gedrag, zodat een latere dichtzetting een expliciete keuze is en
-- geen stille regressie van deze migratie.
select is(
  (select count(*)::integer from shifts),
  current_setting('abas.n_shifts')::integer,
  'shifts blijft volledig leesbaar voor een lid (bewuste reikwijdte, niet beperkt door 0015)'
);

select is(
  (select count(*)::integer from shift_members),
  current_setting('abas.n_shift_members')::integer,
  'shift_members blijft volledig leesbaar voor een lid (bewuste reikwijdte, niet beperkt door 0015)'
);

reset role;

-- ── Blok 2: als actieve bardienst ───────────────────────────────────────
-- Actieve bar-rol: brede tak van de allowlist (0039, ADR 0019). Een
-- bardienst-sessie moet exact zien wat ze vóór 0015/0039 zag. Zou de
-- policy per ongeluk óók actieve bar-rollen raken, dan valt het hele
-- verkoopscherm om (useMembers/useShiftSummary lezen alle leden en alle
-- orders).

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a2","session_id":"00000000-0000-0000-0000-0000000002a2"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  current_setting('abas.n_members')::integer,
  'een actieve bardienst ziet alle leden'
);

select is(
  (select count(*)::integer from orders),
  current_setting('abas.n_orders')::integer,
  'een actieve bardienst ziet alle bestellingen, inclusief de gastverkoop'
);

select is(
  (select count(*)::integer from order_lines),
  current_setting('abas.n_order_lines')::integer,
  'een actieve bardienst ziet alle bestelregels'
);

select is(
  (select count(*)::integer from top_ups),
  current_setting('abas.n_top_ups')::integer,
  'een actieve bardienst ziet alle opwaarderingen'
);

select is(
  (select count(*)::integer from order_reversals),
  current_setting('abas.n_order_reversals')::integer,
  'een actieve bardienst ziet alle terugdraaiingen (het Dienst-scherm heeft ze nodig)'
);

reset role;

-- ── Blok 2b: als actieve beheerder ───────────────────────────────────────
-- Beheerder is een superset van bardienst: ook brede tak.

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a5","session_id":"00000000-0000-0000-0000-0000000002a5"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  current_setting('abas.n_members')::integer,
  'een actieve beheerder ziet alle leden'
);

select is(
  (select count(*)::integer from orders),
  current_setting('abas.n_orders')::integer,
  'een actieve beheerder ziet alle bestellingen, inclusief de gastverkoop'
);

select is(
  (select count(*)::integer from order_lines),
  current_setting('abas.n_order_lines')::integer,
  'een actieve beheerder ziet alle bestelregels'
);

select is(
  (select count(*)::integer from top_ups),
  current_setting('abas.n_top_ups')::integer,
  'een actieve beheerder ziet alle opwaarderingen'
);

select is(
  (select count(*)::integer from order_reversals),
  current_setting('abas.n_order_reversals')::integer,
  'een actieve beheerder ziet alle terugdraaiingen'
);

reset role;

-- ── Blok 3: als account zonder gekoppeld lid ─────────────────────────────
-- Verkeerd uitgenodigd adres, self-signup via de portal, oud
-- device-account. Vóór 0039 las zo'n account via de denylist
-- `not caller_is_lid()` alles; sinds ADR 0019 niets uit de vijf tabellen.
-- De globale tabellen (shifts, products, …) blijven leesbaar (ADR 0019,
-- keuze 6 in docs/features/leespolicies-allowlist.md).

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a3","session_id":"00000000-0000-0000-0000-0000000002a3"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  0,
  'een account zonder gekoppeld lid ziet geen enkele members-rij (ADR 0019)'
);

select is(
  (select count(*)::integer from orders),
  0,
  'een account zonder gekoppeld lid ziet geen enkele bestelling'
);

select is(
  (select count(*)::integer from order_lines),
  0,
  'een account zonder gekoppeld lid ziet geen enkele bestelregel'
);

select is(
  (select count(*)::integer from top_ups),
  0,
  'een account zonder gekoppeld lid ziet geen enkele opwaardering'
);

select is(
  (select count(*)::integer from order_reversals),
  0,
  'een account zonder gekoppeld lid ziet geen enkele terugdraaiing'
);

select is(
  (select count(*)::integer from shifts),
  current_setting('abas.n_shifts')::integer,
  'shifts blijft globaal leesbaar, ook zonder gekoppeld lid (ADR 0019, keuze 6)'
);

select is(
  (select count(*)::integer from products),
  current_setting('abas.n_products')::integer,
  'products blijft globaal leesbaar, ook zonder gekoppeld lid (ADR 0019, keuze 6)'
);

reset role;

-- ── Blok 4: als gearchiveerde bardienst ──────────────────────────────────
-- Vóór 0039 viel een gearchiveerde bar-rol in de brede tak
-- (`caller_is_lid()` negeerde `archived`). Nu: alleen de eigen rijen, net
-- als een lid — de eigen historie blijft in de portal zichtbaar.

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a4","session_id":"00000000-0000-0000-0000-0000000002a4"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  1,
  'een gearchiveerde bardienst ziet precies één members-rij'
);

select is(
  (select name from members),
  'RLS Gearchiveerde Bardienst',
  'de enige zichtbare members-rij van een gearchiveerde bardienst is de eigen rij'
);

select is(
  (select count(*)::integer from orders),
  current_setting('abas.n_orders_gearch')::integer,
  'een gearchiveerde bardienst ziet alleen de eigen bestellingen'
);

select is(
  (select count(*)::integer from order_lines),
  current_setting('abas.n_order_lines_gearch')::integer,
  'een gearchiveerde bardienst ziet alleen de bestelregels van de eigen bestellingen'
);

select is(
  (select count(*)::integer from top_ups),
  current_setting('abas.n_top_ups_gearch')::integer,
  'een gearchiveerde bardienst ziet alleen de eigen opwaarderingen'
);

select is(
  (select count(*)::integer from order_reversals),
  current_setting('abas.n_order_reversals_gearch')::integer,
  'een gearchiveerde bardienst ziet alleen de terugdraaiingen van de eigen bestellingen'
);

select is(
  (select count(*)::integer from orders where id = '00000000-0000-0000-0000-0000000002e0'),
  0,
  'een gearchiveerde bardienst ziet de bestelling van lid A niet meer (was: alles)'
);

reset role;

-- ── Blok 5: als gearchiveerde beheerder ──────────────────────────────────
-- De archiefcheck van caller_has_bar_role() geldt voor beide bar-rollen,
-- niet alleen voor bardienst. Vóór 0039 viel ook een gearchiveerde
-- beheerder in de brede tak. Hij heeft zelf geen bestellingen, dus "eigen
-- rijen" is hier absoluut 0: geen seed-rij hoort bij …02b6.

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a6","session_id":"00000000-0000-0000-0000-0000000002a6"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  1,
  'een gearchiveerde beheerder ziet precies één members-rij (de eigen)'
);

select is(
  (select count(*)::integer from orders),
  0,
  'een gearchiveerde beheerder ziet geen andermans bestellingen en geen gastverkoop'
);

select is(
  (select count(*)::integer from order_lines),
  0,
  'een gearchiveerde beheerder ziet geen andermans bestelregels'
);

reset role;

-- ── Blok 6: als bardienst die naar rol 'lid' gaat ────────────────────────
-- Randgeval "rolwijziging tijdens een open sessie" (spec → Randgevallen):
-- de helper leest de rol per statement, zonder cache of JWT-claim. Dezelfde
-- sessie (…02a2) die in blok 2 alles zag, ziet na de degradatie alleen nog
-- de eigen rijen, ook al staat …02b2 nog in de bezetting van de open dienst
-- …02d0: lidmaatschap van de bezetting geeft geen leestoegang (ADR 0019 →
-- geen actieve bar-sessie, alleen rol). …02b2 heeft zelf geen bestellingen
-- of opwaarderingen.

update members set role = 'lid' where id = '00000000-0000-0000-0000-0000000002b2';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a2","session_id":"00000000-0000-0000-0000-0000000002a2"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from members),
  1,
  'een gedegradeerde bardienst ziet direct alleen nog de eigen members-rij, ook in de bezetting'
);

select is(
  (select count(*)::integer from orders),
  0,
  'een gedegradeerde bardienst ziet de bestellingen die hij zelf afrondde (served_by) niet meer'
);

select is(
  (select count(*)::integer from top_ups),
  0,
  'een gedegradeerde bardienst ziet geen andermans opwaarderingen meer'
);

reset role;

-- ── Blok 7: als anon ─────────────────────────────────────────────────────
-- De anon-key staat in elke client. Alle vijf de leespolicies zijn `to
-- authenticated`. Sinds 0042 ontbreken bovendien de tabelrechten voor
-- anon: de database weigert SELECT voordat een leespolicy wordt toegepast.
-- Dat anon de helper niet kan uitvoeren staat in rpc_execute_grants.test.sql.

set local role anon;

select throws_ok('select * from members', '42501', null, 'anon kan members niet lezen');
select throws_ok('select * from orders', '42501', null, 'anon kan orders niet lezen');
select throws_ok('select * from order_lines', '42501', null, 'anon kan order_lines niet lezen');
select throws_ok('select * from top_ups', '42501', null, 'anon kan top_ups niet lezen');
select throws_ok('select * from order_reversals', '42501', null, 'anon kan order_reversals niet lezen');

reset role;

select * from finish();
rollback;
