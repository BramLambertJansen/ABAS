-- Negative-test coverage for top_up. Run with `npm run db:test`
-- (= `supabase test db`, needs `supabase start` / Docker locally).
--
-- Extended for docs/features/opwaarderen.md (#10): that spec's Randgevallen
-- → "RPC-foutcodes van top_up" table documents dedicated UI handling in
-- OpwaarderenOverlay.tsx for invalid_amount/member_not_found/shift_not_open,
-- on top of the pre-existing happy-path/served_by_not_on_shift coverage —
-- same "elke geïdentificeerde weigergrond" mandate as place_order.test.sql's
-- extension for #8. top_up itself didn't change for #10 — it already had
-- these guards, just not proven here yet.
--
-- Extended again for 0016_top_up_maximumbedrag.sql (App-review 2026-09-21):
-- the new `amount_exceeds_max` guard is the first weigergrond in this RPC
-- that has a boundary rather than a sign — so it gets both sides of that
-- boundary (exactly at the cap must still succeed, one cent over must not),
-- not just the rejecting half. An off-by-one here would either block a
-- legitimate €500 opwaardering or let the guard start one cent too late,
-- and neither is visible from the rejecting case alone.

create extension if not exists pgtap with schema extensions;

begin;
select plan(10);

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000030', 'Shift Starter', 'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000031', 'Not On Shift',  'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000032', 'Topping Up',    'lid',       null,                          0, false),
  ('00000000-0000-0000-0000-000000000033', 'Archived Member', 'lid',     null,                          0, true);

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000030');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000030');

-- An already-ended shift, for the shift_not_open case below.
insert into shifts (id, started_by, ended_at) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000030', now());
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000030');

-- 1) happy path
select lives_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-000000000040'::uuid,
       '00000000-0000-0000-0000-000000000032'::uuid,
       500, 'pin',
       '00000000-0000-0000-0000-000000000030'::uuid
     ) $$,
  'top_up succeeds for a roster member'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000032'),
  500,
  'balance incremented by the top-up amount'
);

-- 2) served_by not on the shift's roster
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-000000000040'::uuid,
       '00000000-0000-0000-0000-000000000032'::uuid,
       500, 'pin',
       '00000000-0000-0000-0000-000000000031'::uuid
     ) $$,
  'P0001', 'served_by_not_on_shift',
  'top_up rejects a served_by id that is not on the shift roster'
);

-- 3) invalid amount (zero)
-- Practically unreachable through the opwaarderen UI today (the chip/free
-- amount guard requires amountCents > 0 before enabling "boeken") but still
-- a server-side money rule the RPC must enforce on its own, per tester.md's
-- canonical weigergronden list ("negatief bedrag").
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-000000000040'::uuid,
       '00000000-0000-0000-0000-000000000032'::uuid,
       0, 'cash',
       '00000000-0000-0000-0000-000000000030'::uuid
     ) $$,
  'P0001', 'invalid_amount',
  'top_up rejects a zero amount'
);

-- 4) invalid amount (negative)
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-000000000040'::uuid,
       '00000000-0000-0000-0000-000000000032'::uuid,
       -500, 'cash',
       '00000000-0000-0000-0000-000000000030'::uuid
     ) $$,
  'P0001', 'invalid_amount',
  'top_up rejects a negative amount'
);

-- 5) member not found (archived)
-- Reachable per docs/features/opwaarderen.md → Randgevallen if a member is
-- archived between opening the overlay and booking; UI shows "dit lid
-- bestaat niet meer of is gearchiveerd — kies een ander lid" and returns to
-- the verkoopscherm for this exact code.
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-000000000040'::uuid,
       '00000000-0000-0000-0000-000000000033'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-000000000030'::uuid
     ) $$,
  'P0001', 'member_not_found',
  'top_up rejects a top-up for an archived member'
);

-- 6) shift not open (ended)
-- Reachable per docs/features/opwaarderen.md → Randgevallen ("shift_not_open"):
-- UI shows "de dienst is niet meer actief — herlaad het scherm" for this
-- exact code.
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-000000000041'::uuid,
       '00000000-0000-0000-0000-000000000032'::uuid,
       500, 'cash',
       '00000000-0000-0000-0000-000000000030'::uuid
     ) $$,
  'P0001', 'shift_not_open',
  'top_up rejects a top-up against a shift that has already ended'
);

-- 7) exactly at the cap — must still succeed
-- €500 (50000 cents) is the highest amount 0016_top_up_maximumbedrag.sql
-- allows, not the first one it refuses. Proving this side of the boundary
-- is what keeps the guard from silently becoming "< €500" later.
select lives_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-000000000040'::uuid,
       '00000000-0000-0000-0000-000000000032'::uuid,
       50000, 'cash',
       '00000000-0000-0000-0000-000000000030'::uuid
     ) $$,
  'top_up accepts an amount exactly at the €500 cap'
);

select is(
  (select balance_cents from members where id = '00000000-0000-0000-0000-000000000032'),
  50500,
  'balance incremented by the capped-maximum top-up (500 from case 1 + 50000)'
);

-- 8) one cent over the cap
-- The actual typefout this guard exists for is an order of magnitude worse
-- ("5000" instead of "50,00" = €5.000), but testing at cap+1 proves the
-- boundary rather than merely that some very large number is refused.
select throws_ok(
  $$ select top_up(
       '00000000-0000-0000-0000-000000000040'::uuid,
       '00000000-0000-0000-0000-000000000032'::uuid,
       50001, 'cash',
       '00000000-0000-0000-0000-000000000030'::uuid
     ) $$,
  'P0001', 'amount_exceeds_max',
  'top_up rejects an amount one cent above the €500 cap'
);

select * from finish();
rollback;
