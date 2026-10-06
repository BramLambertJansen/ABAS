-- Supplementary negative and edge-case tests for the transactional receipts of
-- ADR 0024 / migration 0043 (docs/features/geldverzoeken-idempotent.md). Test-only:
-- no migration or RPC is changed. Complements money_requests.test.sql; same
-- fixture style (rows inserted directly, sessions via a pg_temp helper).
create extension if not exists pgtap with schema extensions;
begin;
select plan(119);
-- Registers (once) and activates a session for p_member in p_mode and sets the
-- JWT claims. A session is linked to at most one active shift, so p_shift is
-- only inserted when given. Auth user and Auth session are created on demand.
create function pg_temp.act_as(p_member uuid, p_mode text, p_session uuid default null, p_shift uuid default null, p_aal text default 'aal2')
returns void
language plpgsql
as $fn$
declare
  v_auth uuid;
  v_sid uuid := coalesce(p_session, p_member);
  v_bar uuid;
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
  values (v_sid, p_member, p_mode)
  on conflict (auth_session_id) do nothing;
  select id into v_bar from bar_sessions where auth_session_id = v_sid;
  if p_shift is not null then
    insert into shift_sessions (shift_id, bar_session_id) values (p_shift, v_bar)
    on conflict do nothing;
  end if;
  insert into auth.sessions(id, user_id, created_at, updated_at)
  values (v_sid, v_auth, now(), now())
  on conflict (id) do nothing;
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth::text, 'session_id', v_sid::text, 'aal', p_aal)::text, true);
end;
$fn$;

insert into members(id,name,role,balance_cents) values
('00000000-0000-4000-8000-000000009301','Aanv bar','bardienst',0),
('00000000-0000-4000-8000-000000009302','Aanv target','lid',5000),
('00000000-0000-4000-8000-000000009303','Aanv colleague','bardienst',0),
('00000000-0000-4000-8000-000000009304','Aanv off-shift','bardienst',0),
('00000000-0000-4000-8000-000000009305','Aanv poor','lid',0),
('00000000-0000-4000-8000-000000009306','Aanv admin','beheerder',0),
('00000000-0000-4000-8000-000000009307','Aanv admin2','beheerder',0),
('00000000-0000-4000-8000-000000009308','Aanv target2','lid',0),
('00000000-0000-4000-8000-000000009309','Aanv bar D','bardienst',0);
insert into shifts(id,started_by) values ('00000000-0000-4000-8000-000000009310','00000000-0000-4000-8000-000000009301'),('00000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009301'),('00000000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009309');
insert into shift_members(shift_id,member_id) values ('00000000-0000-4000-8000-000000009310','00000000-0000-4000-8000-000000009301'),('00000000-0000-4000-8000-000000009310','00000000-0000-4000-8000-000000009303'),('00000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009301'),('00000000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009309');
insert into products(id,name,price_cents,category) values ('00000000-0000-4000-8000-000000009320','Aanv product 1',300,'test'),('00000000-0000-4000-8000-000000009321','Aanv product 2',200,'test');
-- Deterministic limit: a member may not go below EUR 0.
update app_settings set negative_limit_cents = 0;
-- 1. place_order_once: any changed field under the same key is a conflict
select pg_temp.act_as('00000000-0000-4000-8000-000000009301', 'bar', null, '00000000-0000-4000-8000-000000009310', 'aal2');
select lives_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'order books under a fresh key');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009321","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'changed product cannot reuse key');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":2}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'changed qty cannot reuse key');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009305', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'changed member cannot reuse key');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009303')$t$, 'P0001', 'request_id_conflict', 'changed served_by cannot reuse key');
-- A session is in one shift at a time: move A to shift S2 to reach the receipt check there.
update shift_sessions set left_at = now(), left_reason = 'uitgelogd'
 where shift_id = '00000000-0000-4000-8000-000000009310' and bar_session_id = (select id from bar_sessions where member_id = '00000000-0000-4000-8000-000000009301');
insert into shift_sessions(shift_id, bar_session_id)
  select '00000000-0000-4000-8000-000000009311', id from bar_sessions where member_id = '00000000-0000-4000-8000-000000009301';
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009311', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'changed shift cannot reuse key');
update shift_sessions set left_at = now(), left_reason = 'uitgelogd'
 where shift_id = '00000000-0000-4000-8000-000000009311' and bar_session_id = (select id from bar_sessions where member_id = '00000000-0000-4000-8000-000000009301');
update shift_sessions set left_at = null, left_reason = null
 where shift_id = '00000000-0000-4000-8000-000000009310' and bar_session_id = (select id from bar_sessions where member_id = '00000000-0000-4000-8000-000000009301');
select is((select count(*) from orders where member_id = '00000000-0000-4000-8000-000000009302'), 1::bigint, 'conflicting orders booked nothing');
select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009302'), 4700, 'conflicting orders debited nothing');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009401'), 1::bigint, 'conflicts leave the original receipt only');
-- 11. Documented strictness: the payload fingerprint is the text of a jsonb array, so
-- the ORDER OF ORDER LINES is part of the identity. Same lines in another order under one
-- key is a conflict (deliberate: a retry resends the identical payload; a changed payload
-- is a different request). Key order inside one line is not significant (jsonb normalises
-- object keys), so a client that re-serialises a line still replays.
select lives_ok($t$select place_order_once('00000000-0000-4000-8000-000000009402', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1},{"product_id":"00000000-0000-4000-8000-000000009321","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'two-line order books');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009402', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009321","qty":1},{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'reordered lines are a conflict (deliberately strict)');
select is((place_order_once('00000000-0000-4000-8000-000000009402', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1},{"product_id":"00000000-0000-4000-8000-000000009321","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')).id, (place_order_once('00000000-0000-4000-8000-000000009402', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"qty":1,"product_id":"00000000-0000-4000-8000-000000009320"},{"qty":1,"product_id":"00000000-0000-4000-8000-000000009321"}]'::jsonb, '00000000-0000-4000-8000-000000009301')).id, 'key order inside a line is not significant');
select is((select count(*) from orders where member_id = '00000000-0000-4000-8000-000000009302'), 2::bigint, 'strictness test booked one extra order only');
select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009302'), 4200, 'two-line order debited once');
-- 2. Other actor / other operation under an existing key
select lives_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'top-up books under a fresh key');
select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009302'), 4300, 'top-up credited');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'same actor: place_order cannot reuse a top_up key');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'same actor: top_up cannot reuse a place_order key');
select pg_temp.act_as('00000000-0000-4000-8000-000000009303', 'bar', null, '00000000-0000-4000-8000-000000009310', 'aal2');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'other actor cannot replay an order receipt');
select pg_temp.act_as('00000000-0000-4000-8000-000000009306', 'beheer', '00000000-0000-4000-8000-000000009351', null, 'aal2');
select lives_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 100, null)$t$, 'member creation books under a fresh key');
select pg_temp.act_as('00000000-0000-4000-8000-000000009307', 'beheer', '00000000-0000-4000-8000-000000009352', null, 'aal2');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 100, null)$t$, 'P0001', 'request_id_conflict', 'other admin cannot replay a member receipt');
select pg_temp.act_as('00000000-0000-4000-8000-000000009306', 'bar', '00000000-0000-4000-8000-000000009354', '00000000-0000-4000-8000-000000009310', 'aal2');
select lives_ok($t$select top_up_once('00000000-0000-4000-8000-000000009405', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'admin in bar mode tops up under a key');
select pg_temp.act_as('00000000-0000-4000-8000-000000009306', 'beheer', '00000000-0000-4000-8000-000000009351', null, 'aal2');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009405', 'Aanv lid', 100, null)$t$, 'P0001', 'request_id_conflict', 'same actor: create_member cannot reuse a top_up key');
-- 3. create_member_once: changed input, invalid input, wrong mode
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 100, 'c@d.nl')$t$, 'P0001', 'request_id_conflict', 'changed e-mail cannot reuse key');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 150, null)$t$, 'P0001', 'request_id_conflict', 'changed starting balance cannot reuse key');
select is((select count(*) from members where name = 'Aanv lid'), 1::bigint, 'conflicts created no extra member');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009406', 'Aanv neg', -1, null)$t$, 'P0001', 'invalid_starting_balance', 'negative starting balance rejected');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009406'), 0::bigint, 'rejected negative balance leaves no receipt');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009407', '   ', 0, null)$t$, 'P0001', 'invalid_name', 'blank name rejected');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009407'), 0::bigint, 'rejected blank name leaves no receipt');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009408', 'Aanv mail', 0, 'bad')$t$, 'P0001', 'invalid_email', 'malformed e-mail rejected');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009408'), 0::bigint, 'rejected e-mail leaves no receipt');
select lives_ok($t$select create_member_once('00000000-0000-4000-8000-000000009407', 'Aanv leeg', 0, null)$t$, 'same key succeeds after a rejected attempt');
select throws_ok($t$select create_member_once(null, 'Aanv null', 0, null)$t$, 'P0001', 'invalid_request_id', 'null key rejected for create_member_once');
select pg_temp.act_as('00000000-0000-4000-8000-000000009301', 'bar', null, '00000000-0000-4000-8000-000000009310', 'aal2');
select throws_ok($t$select place_order_once(null, '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'invalid_request_id', 'null key rejected for place_order_once');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 100, null)$t$, 'P0001', 'wrong_mode', 'bar session cannot create a member (existing key)');
select pg_temp.act_as('00000000-0000-4000-8000-000000009306', 'bar', '00000000-0000-4000-8000-000000009354', '00000000-0000-4000-8000-000000009310', 'aal2');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 100, null)$t$, 'P0001', 'wrong_mode', 'admin in bar mode cannot create a member');
select pg_temp.act_as('00000000-0000-4000-8000-000000009301', 'beheer', '00000000-0000-4000-8000-000000009353', null, 'aal2');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 100, null)$t$, 'P0001', 'no_admin_role', 'bardienst in a beheer session cannot create a member');
select is((select count(*) from members where name = 'Aanv lid'), 1::bigint, 'refused calls created no member');
-- 4. place_order_once: insufficient balance leaves no receipt; same key works after top-up
select pg_temp.act_as('00000000-0000-4000-8000-000000009301', 'bar', null, '00000000-0000-4000-8000-000000009310', 'aal2');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009409', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009305', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'insufficient_balance', 'order beyond the limit is rejected');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009409'), 0::bigint, 'rejected order leaves no receipt');
select is((select count(*) from orders where member_id = '00000000-0000-4000-8000-000000009305'), 0::bigint, 'rejected order booked nothing');
select lives_ok($t$select top_up_once('00000000-0000-4000-8000-000000009410', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009305', 500, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'top-up for the poor member');
select lives_ok($t$select place_order_once('00000000-0000-4000-8000-000000009409', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009305', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'same key succeeds after top-up');
select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009305'), 200, 'balance after top-up and order');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009409'), 1::bigint, 'successful retry stored its receipt');
-- 5. top_up_once: EUR 500 cap and self top-up still apply next to receipts
select lives_ok($t$select top_up_once('00000000-0000-4000-8000-000000009411', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009308', 50000, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'exactly EUR 500 is accepted');
select is((top_up_once('00000000-0000-4000-8000-000000009411', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009308', 50000, 'cash', '00000000-0000-4000-8000-000000009301')).amount_cents, 50000, 'replay of the EUR 500 receipt returns it');
select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009308'), 50000, 'EUR 500 credited once');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009411', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009308', 50001, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'request_id_conflict', 'existing key with an amount above the cap is a conflict');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009412', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009308', 50001, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'amount_exceeds_max', 'fresh key above the cap is rejected');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009412'), 0::bigint, 'over-cap attempt leaves no receipt');
select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009308'), 50000, 'over-cap attempts credited nothing');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009301', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'self_top_up_forbidden', 'existing key cannot be used for a self top-up');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009413', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009301', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'self_top_up_forbidden', 'fresh key cannot be used for a self top-up');
select is((select count(*) from money_requests where request_id = '00000000-0000-4000-8000-000000009413'), 0::bigint, 'self top-up leaves no receipt');
-- 6. Guards still apply when the key already exists
select pg_temp.act_as('00000000-0000-4000-8000-000000009304', 'bar', null, null, 'aal2');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'session_not_on_shift', 'bardienst not on the shift cannot replay a top-up');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'session_not_on_shift', 'bardienst not on the shift cannot replay an order');
select pg_temp.act_as('00000000-0000-4000-8000-000000009306', 'beheer', '00000000-0000-4000-8000-000000009351', null, 'aal2');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'wrong_mode', 'beheer session cannot call place_order_once');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'wrong_mode', 'beheer session cannot call top_up_once');
select pg_temp.act_as('00000000-0000-4000-8000-000000009302', 'bar', null, '00000000-0000-4000-8000-000000009310', 'aal2');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'no_bar_role', 'lid session cannot replay an order');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'no_bar_role', 'lid session cannot replay a top-up');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009390', true);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000009390', 'session_id', '00000000-0000-4000-8000-000000009391')::text, true);
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'no_bar_session', 'outsider without a bar session cannot replay an order');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'no_bar_session', 'outsider without a bar session cannot replay a top-up');
update shift_sessions set left_at = now(), left_reason = 'uitgelogd'
 where shift_id = '00000000-0000-4000-8000-000000009310' and bar_session_id = (select id from bar_sessions where member_id = '00000000-0000-4000-8000-000000009303');
select pg_temp.act_as('00000000-0000-4000-8000-000000009303', 'bar', null, null, 'aal2');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'session_not_on_shift', 'colleague who left the shift cannot replay a top-up');
-- 7. After a real end_shift: inspect resolves, the wrapper refuses, nothing is booked twice
select pg_temp.act_as('00000000-0000-4000-8000-000000009309', 'bar', null, '00000000-0000-4000-8000-000000009312', 'aal2');
select lives_ok($t$select top_up_once('00000000-0000-4000-8000-000000009414', '00000000-0000-4000-8000-000000009312', '00000000-0000-4000-8000-000000009308', 100, 'cash', '00000000-0000-4000-8000-000000009309')$t$, 'top-up in the shift to be ended');
select end_shift('00000000-0000-4000-8000-000000009312');
select is((inspect_money_request('00000000-0000-4000-8000-000000009414', 'top_up', jsonb_build_array('00000000-0000-4000-8000-000000009312'::uuid, '00000000-0000-4000-8000-000000009308'::uuid, 100, 'cash'::text, '00000000-0000-4000-8000-000000009309'::uuid), false))->>'status', 'completed', 'inspect after end_shift reports completed');
select is((inspect_money_request('00000000-0000-4000-8000-000000009414', 'top_up', jsonb_build_array('00000000-0000-4000-8000-000000009312'::uuid, '00000000-0000-4000-8000-000000009308'::uuid, 100, 'cash'::text, '00000000-0000-4000-8000-000000009309'::uuid), false))->'result'->>'id', (select id::text from top_ups where shift_id = '00000000-0000-4000-8000-000000009312'), 'inspect after end_shift returns the booked top-up');
select is((inspect_money_request('00000000-0000-4000-8000-000000009414', 'top_up', jsonb_build_array('00000000-0000-4000-8000-000000009312'::uuid, '00000000-0000-4000-8000-000000009308'::uuid, 100, 'cash'::text, '00000000-0000-4000-8000-000000009309'::uuid), true))->>'status', 'completed', 'cancel after end_shift cannot cancel a booked request');
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009414', '00000000-0000-4000-8000-000000009312', '00000000-0000-4000-8000-000000009308', 100, 'cash', '00000000-0000-4000-8000-000000009309')$t$, 'P0001', 'session_not_on_shift', 'wrapper retry after end_shift is refused');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009415', '00000000-0000-4000-8000-000000009312', '00000000-0000-4000-8000-000000009308', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009309')$t$, 'P0001', 'session_not_on_shift', 'new order after end_shift is refused');
select is((select count(*) from top_ups where shift_id = '00000000-0000-4000-8000-000000009312'), 1::bigint, 'no second top-up after end_shift');
select is((select balance_cents from members where id = '00000000-0000-4000-8000-000000009308'), 50100, 'balance unchanged by inspect and refused retries');
-- 8. inspect_money_request: guards and input validation
select pg_temp.act_as('00000000-0000-4000-8000-000000009301', 'bar', null, '00000000-0000-4000-8000-000000009310', 'aal2');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009404', 'create_member', jsonb_build_array('Aanv lid'::text, 100, null::text), false)$t$, 'P0001', 'wrong_mode', 'bar session cannot inspect create_member');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009416', 'refund', '[]', false)$t$, 'P0001', 'invalid_request_id', 'unknown operation rejected');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009417', null, '[]', false)$t$, 'P0001', 'invalid_request_id', 'null operation rejected');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009418', 'top_up', '{}', false)$t$, 'P0001', 'invalid_request_id', 'object payload rejected');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009419', 'top_up', null, false)$t$, 'P0001', 'invalid_request_id', 'null payload rejected');
select throws_ok($t$select inspect_money_request(null, 'top_up', '[]', false)$t$, 'P0001', 'invalid_request_id', 'null key rejected');
select pg_temp.act_as('00000000-0000-4000-8000-000000009306', 'beheer', '00000000-0000-4000-8000-000000009351', null, 'aal1');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009404', 'create_member', jsonb_build_array('Aanv lid'::text, 100, null::text), false)$t$, 'P0001', 'aal2_required', 'create_member inspect needs aal2');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009401', 'place_order', '[]', false)$t$, 'P0001', 'aal2_required', 'beheer-mode inspect of any operation needs aal2');
select pg_temp.act_as('00000000-0000-4000-8000-000000009306', 'beheer', '00000000-0000-4000-8000-000000009351', null, 'aal2');
select is((inspect_money_request('00000000-0000-4000-8000-000000009404', 'create_member', jsonb_build_array('Aanv lid'::text, 100, null::text), false))->>'status', 'completed', 'admin with aal2 inspects a member receipt');
select is((inspect_money_request('00000000-0000-4000-8000-000000009404', 'create_member', jsonb_build_array('Aanv lid'::text, 100, null::text), false))->'result'->>'pin_hash', null::text, 'inspected member receipt carries no pin hash');
select is((inspect_money_request('00000000-0000-4000-8000-000000009420', 'create_member', jsonb_build_array('Cancel lid'::text, 0, null::text), true))->>'status', 'cancelled', 'admin can cancel an unbooked member creation');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009420', 'Cancel lid', 0, null)$t$, 'P0001', 'request_cancelled', 'cancelled member creation cannot be booked later');
select is((select count(*) from members where name = 'Cancel lid'), 0::bigint, 'cancelled member creation created no member');
select pg_temp.act_as('00000000-0000-4000-8000-000000009307', 'beheer', '00000000-0000-4000-8000-000000009352', null, 'aal2');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009404', 'create_member', jsonb_build_array('Aanv lid'::text, 100, null::text), false)$t$, 'P0001', 'request_id_conflict', 'other admin cannot inspect a member receipt');
-- 9. Fingerprint regression: no ambiguity from joining fields with separators
select pg_temp.act_as('00000000-0000-4000-8000-000000009306', 'beheer', '00000000-0000-4000-8000-000000009351', null, 'aal2');
select lives_ok($t$select create_member_once('00000000-0000-4000-8000-000000009421', 'Alice|100', 200, 'x@y.z')$t$, 'member with a pipe in the name');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009421', 'Alice', 100, '200|x@y.z')$t$, 'P0001', 'request_id_conflict', 'fields shifted across a separator hash differently');
select is((select count(*) from members where name in ('Alice|100', 'Alice')), 1::bigint, 'only the first variant was created');
-- 10. Privileges
select is(has_function_privilege('anon', 'top_up_once(uuid,uuid,uuid,integer,text,uuid)', 'EXECUTE'), false, 'anon cannot execute top_up_once (catalog)');
select is(has_function_privilege('anon', 'place_order_once(uuid,uuid,uuid,jsonb,uuid)', 'EXECUTE'), false, 'anon cannot execute place_order_once (catalog)');
select is(has_function_privilege('anon', 'create_member_once(uuid,text,integer,text)', 'EXECUTE'), false, 'anon cannot execute create_member_once (catalog)');
select is(has_function_privilege('anon', 'inspect_money_request(uuid,text,jsonb,boolean)', 'EXECUTE'), false, 'anon cannot execute inspect_money_request (catalog)');
select is(has_function_privilege('authenticated', 'place_order_once(uuid,uuid,uuid,jsonb,uuid)', 'EXECUTE'), true, 'authenticated can execute place_order_once (granted by 0043)');
select is(has_function_privilege('service_role', 'place_order_once(uuid,uuid,uuid,jsonb,uuid)', 'EXECUTE'), true, 'service_role can execute place_order_once (granted by 0043)');
select is(has_function_privilege('authenticated', 'top_up_once(uuid,uuid,uuid,integer,text,uuid)', 'EXECUTE'), true, 'authenticated can execute top_up_once (granted by 0043)');
select is(has_function_privilege('service_role', 'top_up_once(uuid,uuid,uuid,integer,text,uuid)', 'EXECUTE'), true, 'service_role can execute top_up_once (granted by 0043)');
select is(has_function_privilege('authenticated', 'create_member_once(uuid,text,integer,text)', 'EXECUTE'), true, 'authenticated can execute create_member_once (granted by 0043)');
select is(has_function_privilege('service_role', 'create_member_once(uuid,text,integer,text)', 'EXECUTE'), true, 'service_role can execute create_member_once (granted by 0043)');
select is(has_function_privilege('authenticated', 'inspect_money_request(uuid,text,jsonb,boolean)', 'EXECUTE'), true, 'authenticated can execute inspect_money_request (granted by 0043)');
select is(has_function_privilege('service_role', 'inspect_money_request(uuid,text,jsonb,boolean)', 'EXECUTE'), true, 'service_role can execute inspect_money_request (granted by 0043)');
select is(has_function_privilege('anon', 'read_money_request(uuid,text,jsonb)', 'EXECUTE'), false, 'anon cannot execute internal helper read_money_request');
select is(has_function_privilege('authenticated', 'read_money_request(uuid,text,jsonb)', 'EXECUTE'), false, 'authenticated cannot execute internal helper read_money_request');
select is(has_function_privilege('service_role', 'read_money_request(uuid,text,jsonb)', 'EXECUTE'), false, 'service_role cannot execute internal helper read_money_request');
select is(has_function_privilege('anon', 'remember_money_request(uuid,text,jsonb,jsonb)', 'EXECUTE'), false, 'anon cannot execute internal helper remember_money_request');
select is(has_function_privilege('authenticated', 'remember_money_request(uuid,text,jsonb,jsonb)', 'EXECUTE'), false, 'authenticated cannot execute internal helper remember_money_request');
select is(has_function_privilege('service_role', 'remember_money_request(uuid,text,jsonb,jsonb)', 'EXECUTE'), false, 'service_role cannot execute internal helper remember_money_request');
select is(has_table_privilege('anon', 'money_requests', 'SELECT,INSERT,UPDATE,DELETE'), false, 'anon has no privilege on money_requests');
select is(has_table_privilege('authenticated', 'money_requests', 'SELECT,INSERT,UPDATE,DELETE'), false, 'authenticated has no privilege on money_requests');
select is(has_table_privilege('service_role', 'money_requests', 'SELECT,INSERT,UPDATE,DELETE'), false, 'service_role has no privilege on money_requests');
set local role anon;
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, '42501', null, 'anon cannot call top_up_once');
select throws_ok($t$select place_order_once('00000000-0000-4000-8000-000000009401', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', '[{"product_id":"00000000-0000-4000-8000-000000009320","qty":1}]'::jsonb, '00000000-0000-4000-8000-000000009301')$t$, '42501', null, 'anon cannot call place_order_once');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 100, null)$t$, '42501', null, 'anon cannot call create_member_once');
select throws_ok($t$select inspect_money_request('00000000-0000-4000-8000-000000009403', 'top_up', '[]', false)$t$, '42501', null, 'anon cannot call inspect_money_request');
select throws_ok($t$select remember_money_request('00000000-0000-4000-8000-000000009422', 'top_up', '[]', '{}')$t$, '42501', null, 'anon cannot call remember_money_request');
select throws_ok('select * from money_requests', '42501', null, 'anon cannot read receipts');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
select throws_ok($t$select top_up_once('00000000-0000-4000-8000-000000009403', '00000000-0000-4000-8000-000000009310', '00000000-0000-4000-8000-000000009302', 100, 'cash', '00000000-0000-4000-8000-000000009301')$t$, 'P0001', 'no_bar_session', 'service_role without a user session is refused by the guard');
select throws_ok($t$select create_member_once('00000000-0000-4000-8000-000000009404', 'Aanv lid', 100, null)$t$, 'P0001', 'no_bar_session', 'service_role without a user session cannot create a member');
reset role;
select * from finish();
rollback;
