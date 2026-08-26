-- Negative-test coverage for place_order, per tester.md: happy path plus
-- every identified way it must refuse (insufficient balance beyond the
-- negative limit, served_by not on the active shift's roster). Run with
-- `npm run db:test` (= `supabase test db`, needs `supabase start` / Docker
-- locally).

create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

-- ── Fixtures ──────────────────────────────────────────────────────────
-- Pin the negative limit explicitly rather than relying on the migration's
-- default (0) — supabase/seed.sql overrides it to 1500 for local dev, and
-- this test's "exceeds the limit" case silently stopped being true under
-- that value (order stayed within -1500) until CI's first real run against
-- Postgres caught it (issue #2). Self-contained now: this test doesn't
-- care what seed.sql does elsewhere.
update app_settings set negative_limit_cents = 0;

insert into products (id, name, category, price_cents) values
  ('00000000-0000-0000-0000-000000000001', 'Test Pils', 'Bier', 250);

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000010', 'Shift Starter', 'bardienst', crypt('1234', gen_salt('bf')), 500, false),
  ('00000000-0000-0000-0000-000000000011', 'Not On Shift',  'bardienst', crypt('1234', gen_salt('bf')), 500, false),
  ('00000000-0000-0000-0000-000000000012', 'Buying Member', 'lid',       null,                          300, false);

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010');

-- ── 1) happy path ─────────────────────────────────────────────────────
select lives_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'place_order succeeds for a roster member with sufficient balance'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000012'),
  50,
  'balance decremented by the order total (300 - 250 = 50)'
);

select is(
  (select ol.unit_cents from order_lines ol join orders o on o.id = ol.order_id
     where o.member_id = '00000000-0000-0000-0000-000000000012'),
  250,
  'order_lines.unit_cents freezes the product price at order time'
);

-- ── 2) insufficient balance beyond the negative limit (default €0) ─────
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":5}]'::jsonb,
       '00000000-0000-0000-0000-000000000010'::uuid
     ) $$,
  'P0001', 'insufficient_balance',
  'place_order rejects an order that would exceed the negative-balance limit'
);

-- ── 3) served_by not on the shift's roster ──────────────────────────────
select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-000000000020'::uuid,
       '00000000-0000-0000-0000-000000000012'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-000000000011'::uuid
     ) $$,
  'P0001', 'served_by_not_on_shift',
  'place_order rejects a served_by id that is not on the shift roster'
);

select * from finish();
rollback;
