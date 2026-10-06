-- Transactional receipts and negative authorization tests, ADR 0023.
create extension if not exists pgtap with schema extensions;
begin;
select plan(36);
create function pg_temp.act_as_bar(p_member uuid, p_shift uuid default null, p_session uuid default null)
returns void
language plpgsql
as $fn$
declare
  v_auth uuid;
  v_session uuid;
begin
  select auth_user_id into v_auth from members where id = p_member;
  if v_auth is null then
    v_auth := p_member;
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      v_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_auth::text || '@bar.test.local', crypt('not-used', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}'
    ) on conflict (id) do nothing;
    update members set auth_user_id = v_auth where id = p_member;
  end if;
  insert into bar_sessions (auth_session_id, member_id, mode)
  values (coalesce(p_session, p_member), p_member, 'bar')
  on conflict (auth_session_id) do nothing;
  select id into v_session from bar_sessions where auth_session_id = coalesce(p_session, p_member);
  if p_shift is not null then
    insert into shift_sessions (shift_id, bar_session_id)
    values (p_shift, v_session)
    on conflict do nothing;
  end if;
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_auth::text, 'session_id', coalesce(p_session, p_member)::text)::text,
    true
  );
end;
$fn$;
insert into members(id,name,role,balance_cents) values
('00000000-0000-4000-8000-000000009101','Receipt bar','bardienst',0),
('00000000-0000-4000-8000-000000009103','Receipt colleague','bardienst',0),
('00000000-0000-4000-8000-000000009102','Receipt target','lid',5000);
insert into shifts(id,started_by) values ('00000000-0000-4000-8000-000000009110','00000000-0000-4000-8000-000000009101');
insert into shift_members(shift_id,member_id) values ('00000000-0000-4000-8000-000000009110','00000000-0000-4000-8000-000000009101'),('00000000-0000-4000-8000-000000009110','00000000-0000-4000-8000-000000009103');
insert into products(id,name,price_cents,category) values ('00000000-0000-4000-8000-000000009120','Receipt product',300,'test');
select pg_temp.act_as_bar('00000000-0000-4000-8000-000000009101','00000000-0000-4000-8000-000000009110');
select is((top_up_once('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101')).id, (top_up_once('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101')).id, 'top-up retries return the same row');

select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009102'), 5100, 'top-up changes balance once');

select is((select count(*) from top_ups where member_id = '00000000-0000-4000-8000-000000009102'), 1::bigint, 'top-up writes one transaction');

select throws_ok($test$select top_up_once('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 200, 'cash', '00000000-0000-4000-8000-000000009101')$test$, 'P0001', 'request_id_conflict', 'changed amount cannot reuse key');

select throws_ok($test$select top_up_once('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009103', 100, 'cash', '00000000-0000-4000-8000-000000009101')$test$, 'P0001', 'request_id_conflict', 'changed member cannot reuse key');

select throws_ok($test$select place_order_once('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', '[{"product_id":"00000000-0000-4000-8000-000000009120","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009101')$test$, 'P0001', 'request_id_conflict', 'another operation cannot reuse key');

select throws_ok($test$select top_up_once('00000000-0000-4000-8000-000000009202', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 0, 'cash', '00000000-0000-4000-8000-000000009101')$test$, 'P0001', 'invalid_amount', 'failed booking is rejected');

select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009202'), 0::bigint, 'failed transaction leaves no receipt');

select lives_ok($test$select top_up_once('00000000-0000-4000-8000-000000009202', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101')$test$, 'same key may succeed after a rollback');

select is((place_order_once('00000000-0000-4000-8000-000000009203', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', '[{"product_id":"00000000-0000-4000-8000-000000009120","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009101')).id, (place_order_once('00000000-0000-4000-8000-000000009203', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', '[{"product_id":"00000000-0000-4000-8000-000000009120","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009101')).id, 'order replay returns same id');

select is((select count(*) from orders where member_id = '00000000-0000-4000-8000-000000009102'), 1::bigint, 'order writes once');

select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009102'), 4900, 'order debits once');

update products set price_cents = 999 where id = '00000000-0000-4000-8000-000000009120';
select is((place_order_once('00000000-0000-4000-8000-000000009203', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', '[{"product_id":"00000000-0000-4000-8000-000000009120","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009101')).total_cents, 300, 'replay preserves original server price');

select lives_ok($test$select top_up_once('00000000-0000-4000-8000-000000009204', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101')$test$, 'new key permits a new intentional booking');

select pg_temp.act_as_bar('00000000-0000-4000-8000-000000009103', '00000000-0000-4000-8000-000000009110');
select throws_ok($test$select top_up_once('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101')$test$, 'P0001', 'request_id_conflict', 'other actor cannot replay receipt');

select pg_temp.act_as_bar('00000000-0000-4000-8000-000000009101', '00000000-0000-4000-8000-000000009110');
delete from shift_members where member_id = '00000000-0000-4000-8000-000000009101' and shift_id = '00000000-0000-4000-8000-000000009110';
select throws_ok($test$select top_up_once('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101')$test$, 'P0001', 'served_by_not_on_shift', 'replay still checks attribution');
insert into shift_members(shift_id,member_id) values ('00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009101');

update bar_sessions set ended_at = now(), end_reason = 'uitgelogd' where member_id = '00000000-0000-4000-8000-000000009101';
select throws_ok($test$select place_order_once('00000000-0000-4000-8000-000000009203', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', '[{"product_id":"00000000-0000-4000-8000-000000009120","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009101')$test$, 'P0001', 'session_ended', 'ended session cannot replay');

update members set role = 'beheerder' where id = '00000000-0000-4000-8000-000000009101';
insert into bar_sessions(auth_session_id, member_id, mode) values ('00000000-0000-4000-8000-000000009130', '00000000-0000-4000-8000-000000009101', 'beheer');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000009101', 'session_id', '00000000-0000-4000-8000-000000009130', 'aal', 'aal2')::text, true);
select is((create_member_once('00000000-0000-4000-8000-000000009205', 'Retry member', 400, null)).id, (create_member_once('00000000-0000-4000-8000-000000009205', 'Retry member', 400, null)).id, 'member replay returns same id');

select is((select count(*) from members where name = 'Retry member'), 1::bigint, 'one member created');

select is((create_member_once('00000000-0000-4000-8000-000000009205', 'Retry member', 400, null)).balance_cents, 400, 'starting balance preserved');

select is((create_member_once('00000000-0000-4000-8000-000000009205', 'Retry member', 400, null)).pin_hash, null::text, 'member replay never returns pin hash');

select throws_ok($test$select create_member_once('00000000-0000-4000-8000-000000009205', 'Other name', 400, null)$test$, 'P0001', 'request_id_conflict', 'changed name cannot reuse key');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000009101', 'session_id', '00000000-0000-4000-8000-000000009130', 'aal', 'aal1')::text, true);
select throws_ok($test$select create_member_once('00000000-0000-4000-8000-000000009205', 'Retry member', 400, null)$test$, 'P0001', 'aal2_required', 'replay still requires second factor');

set local role authenticated;
select throws_ok('select * from money_requests', '42501', null, 'authenticated cannot read receipts');

select throws_ok('delete from money_requests', '42501', null, 'authenticated cannot remove receipts');

select throws_ok($test$select read_money_request('00000000-0000-4000-8000-000000009205', 'create_member', '[]')$test$, '42501', null, 'internal helper is not executable');

set local role anon;
select throws_ok($test$select top_up_once('00000000-0000-4000-8000-000000009201', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101')$test$, '42501', null, 'anonymous cannot call wrapper');

set local role service_role;
select throws_ok('select * from money_requests', '42501', null, 'service role has no receipt table grant');
reset role;
-- Recovery of a bar booking remains available to a bardienst, without
-- silently requiring beheerder privileges in the shared session guard.
update members set role = 'bardienst' where id = '00000000-0000-4000-8000-000000009101';
select pg_temp.act_as_bar('00000000-0000-4000-8000-000000009101', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009140');
select is((inspect_money_request('00000000-0000-4000-8000-000000009201', 'top_up', jsonb_build_array('00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101'), false))->>'status', 'completed', 'new session can inspect old completed request');
select is((inspect_money_request('00000000-0000-4000-8000-000000009206', 'top_up', jsonb_build_array('00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101'), false))->>'status', 'missing', 'absent receipt is not evidence of failure');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009206'), 0::bigint, 'read-only missing lookup creates no receipt');
select is((inspect_money_request('00000000-0000-4000-8000-000000009206', 'top_up', jsonb_build_array('00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101'), true))->>'status', 'cancelled', 'explicit cancellation records terminal proof');
select throws_ok($test$select top_up_once('00000000-0000-4000-8000-000000009206', '00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101')$test$, 'P0001', 'request_cancelled', 'late request cannot book after cancellation');
select is((select count(*) from top_ups where member_id = '00000000-0000-4000-8000-000000009102'), 3::bigint, 'cancellation did not add a financial row');
select is((inspect_money_request('00000000-0000-4000-8000-000000009201', 'top_up', jsonb_build_array('00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101'), true))->>'status', 'completed', 'cancelling an already booked request returns success, never reverses money');
select pg_temp.act_as_bar('00000000-0000-4000-8000-000000009103', '00000000-0000-4000-8000-000000009110');
select throws_ok($test$select inspect_money_request('00000000-0000-4000-8000-000000009206', 'top_up', jsonb_build_array('00000000-0000-4000-8000-000000009110', '00000000-0000-4000-8000-000000009102', 100, 'cash', '00000000-0000-4000-8000-000000009101'), false)$test$, 'P0001', 'request_id_conflict', 'other actor cannot inspect cancellation proof');
select * from finish();
rollback;
