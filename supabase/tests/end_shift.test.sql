-- Negative/edge-test coverage for #12 (docs/features/dienst-afsluiten.md):
-- end_shift(p_shift_id uuid), unchanged since 0001_init.sql (regel 181–188)
-- but without its own pgTAP test until now — #12 is its first real UI
-- consumer (DienstAfsluitenOverlay.tsx / useEndShift.ts). Run with
-- `npm run db:test` (= `supabase test db`, needs `supabase start` / Docker
-- locally).
--
-- Testgevallen exactly per spec → Testgevallen (`db:test`):
--   1) happy path
--   2) idempotent (second call on the same shift)
--   3) non-existent shift id
--   4) closes the loop with place_order/top_up via the real end_shift path,
--      not only the fabricated already-ended-row fixture that
--      place_order.test.sql/top_up.test.sql already use
--   5) belt-and-braces REVOKE confirmation — see rls_write_protection.test.sql
--      (an `update shifts set ended_at = ...` case was added there for this
--      ticket; it was previously only proven for `insert into shifts`, not
--      `update`, so it did not already exist as claimed possible in the
--      spec — see Tester's report).

create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ── 1) Happy path ─────────────────────────────────────────────────────
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000000e0', 'ES Happy Starter', 'bardienst', crypt('1234', gen_salt('bf')), 0, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e0');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e0');

select lives_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'end_shift succeeds for an open shift'
);

select isnt(
  (select ended_at from shifts where id = '00000000-0000-0000-0000-0000000000e3'),
  null,
  'shifts.ended_at is no longer null after end_shift'
);

-- ── 2) Idempotent ────────────────────────────────────────────────────────
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000000e1', 'ES Idempotent Starter', 'bardienst', crypt('1234', gen_salt('bf')), 0, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1');

select lives_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000e2'::uuid) $$,
  'end_shift succeeds on an open shift (first call)'
);

-- Backdate the just-set ended_at to a fixed, unambiguous past value before
-- the second call. Needed because `now()` is the *transaction* timestamp in
-- Postgres — constant for every statement inside this single pgTAP
-- transaction — so a naive "call twice, compare ended_at" would trivially
-- pass even if the `where ended_at is null` guard were removed: both calls
-- would write the exact same now() value regardless. Backdating first makes
-- a broken guard observable: if the second call still performs the update,
-- ended_at jumps forward to `now()` (today), which is unambiguously
-- different from the fixed 2020 value set here.
update shifts set ended_at = '2020-01-01T00:00:00Z'::timestamptz
  where id = '00000000-0000-0000-0000-0000000000e2';

select lives_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000e2'::uuid) $$,
  'end_shift succeeds on an already-ended shift (second call) — no error, per spec'
);

select is(
  (select ended_at from shifts where id = '00000000-0000-0000-0000-0000000000e2'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'the second call does not overwrite ended_at — the "where ended_at is null" guard holds'
);

-- ── 3) Non-existent shift id ─────────────────────────────────────────────
select lives_ok(
  $$ select end_shift(gen_random_uuid()) $$,
  'end_shift does not raise for a shift id that does not exist (0 rows affected, existing void behaviour)'
);

-- ── 4) Closes the loop with place_order/top_up via the real close path ───
-- Proves AC #3 ("geen nieuwe verkopen/opwaarderingen meer mogelijk na
-- afsluiten") through end_shift itself, not only through a
-- direct-gefabriceerde already-ended shift row (which
-- place_order.test.sql/top_up.test.sql already cover separately).
insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-0000000000e4', 'ES Loop Starter', 'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-0000000000e5', 'ES Loop Buyer',   'lid',       null,                          1000, false);
insert into products (id, name, category, price_cents, archived) values
  ('00000000-0000-0000-0000-0000000000e6', 'ES Test Pils', 'Bier', 250, false);
insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e4');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e4');

select lives_ok(
  $$ select end_shift('00000000-0000-0000-0000-0000000000e7'::uuid) $$,
  'end_shift closes this shift via the real close path (member had sufficient balance, roster intact)'
);

select throws_ok(
  $$ select place_order(
       '00000000-0000-0000-0000-0000000000e7'::uuid,
       '00000000-0000-0000-0000-0000000000e5'::uuid,
       '[{"product_id":"00000000-0000-0000-0000-0000000000e6","qty":1}]'::jsonb,
       '00000000-0000-0000-0000-0000000000e4'::uuid
     ) $$,
  'P0001', 'shift_not_open',
  'place_order rejects an order against a shift closed via end_shift itself, not just a fabricated already-ended row'
);

select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-0000000000e7'::uuid,
       '00000000-0000-0000-0000-0000000000e5'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-0000000000e4'::uuid
     ) $$,
  'P0001', 'shift_not_open',
  'top_up rejects a top-up against a shift closed via end_shift itself, not just a fabricated already-ended row'
);

select * from finish();
rollback;
