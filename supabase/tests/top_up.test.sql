-- Negative-test coverage for top_up. Same disclosure as place_order.test.sql:
-- not executed in this environment (no Docker daemon here).

create extension if not exists pgtap with schema extensions;

begin;
select plan(3);

insert into members (id, name, role, pin_hash, balance_cents, archived) values
  ('00000000-0000-0000-0000-000000000030', 'Shift Starter', 'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000031', 'Not On Shift',  'bardienst', crypt('1234', gen_salt('bf')), 0, false),
  ('00000000-0000-0000-0000-000000000032', 'Topping Up',    'lid',       null,                          0, false);

insert into shifts (id, started_by) values
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000030');
insert into shift_members (shift_id, member_id) values
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000030');

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

select * from finish();
rollback;
