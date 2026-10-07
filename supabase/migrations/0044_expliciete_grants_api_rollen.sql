-- 0044 — Expliciete grants voor de API-rollen (ADR 0025 → roadmap 0.1a).
--
-- Het gehoste project geeft vanaf 2026-10-30 geen automatische grants meer
-- op nieuwe objecten. Lokaal en in CI bootst supabase/config.toml
-- (`auto_expose_new_tables = false`) dat na; daar krijgen ook alle
-- bestaande objecten hun standaardrechten niet meer. Deze migratie legt de
-- rechten vast die productie via die standaardrechten al heeft, zodat lokaal,
-- CI en productie gelijk lopen.
--
-- Afgeleid, niet met de hand gekozen: een dump van alle rechten van anon,
-- authenticated, service_role en PUBLIC op schema public (tabellen,
-- kolommen, sequences, functies) na migratie 0043, eenmaal zonder en eenmaal
-- met de vlag (2026-10-07). Dit is precies het verschil (131 rechten); er
-- kwam niets bij dat zonder vlag ontbrak. Op productie is elke regel een
-- no-op. Revokes uit eerdere migraties (0018, 0042) staan er dus bewust niet
-- in terug: anon krijgt niets, PUBLIC geen EXECUTE.

-- authenticated leest deze tabellen via RLS (ADR 0019/0022).
grant select on table public.activity_types to authenticated;
grant select on table public.admin_notifications to authenticated;
grant select on table public.app_settings to authenticated;
grant select on table public.bar_sessions to authenticated;
grant select on table public.order_lines to authenticated;
grant select on table public.order_reversals to authenticated;
grant select on table public.orders to authenticated;
grant select on table public.products to authenticated;
grant select on table public.shift_members to authenticated;
grant select on table public.shift_sessions to authenticated;
grant select on table public.shifts to authenticated;
grant select on table public.top_ups to authenticated;

-- service_role: server-side code in src/lib/ (bar-login, rate limit, invite, opslag).
grant delete, insert, select, update on table public.activity_types to service_role;
grant delete, insert, select, update on table public.admin_notifications to service_role;
grant delete, insert, select, update on table public.app_settings to service_role;
grant delete, insert, select, update on table public.bar_device_members to service_role;
grant delete, insert, select, update on table public.bar_devices to service_role;
grant delete, insert, select, update on table public.bar_sessions to service_role;
grant delete, insert, select, update on table public.client_errors to service_role;
grant delete, insert, select, update on table public.login_throttle to service_role;
grant delete, insert, select, update on table public.members to service_role;
grant delete, insert, select, update on table public.order_lines to service_role;
grant delete, insert, select, update on table public.order_reversals to service_role;
grant delete, insert, select, update on table public.orders to service_role;
grant delete, insert, select, update on table public.pin_failures to service_role;
grant delete, insert, select, update on table public.products to service_role;
grant delete, insert, select, update on table public.shift_members to service_role;
grant delete, insert, select, update on table public.shift_sessions to service_role;
grant delete, insert, select, update on table public.shifts to service_role;
grant delete, insert, select, update on table public.top_ups to service_role;
grant select, usage on sequence public.client_errors_id_seq to service_role;
grant select, usage on sequence public.login_throttle_id_seq to service_role;

-- service_role: EXECUTE op functies (o.a. de OpenAPI-weergave van check:deployment).
grant execute on function public.add_shift_member(uuid,uuid) to service_role;
grant execute on function public.admin_end_bar_session(uuid) to service_role;
grant execute on function public.admin_end_shift(uuid) to service_role;
grant execute on function public.admin_take_over_shift(uuid) to service_role;
grant execute on function public.caller_has_bar_role() to service_role;
grant execute on function public.caller_member_id() to service_role;
grant execute on function public.caller_owns_order(uuid) to service_role;
grant execute on function public.caller_session_alive() to service_role;
grant execute on function public.check_beheer_session() to service_role;
grant execute on function public.create_activity_type(text) to service_role;
grant execute on function public.create_member(text,integer,text) to service_role;
grant execute on function public.create_product(text,text,integer) to service_role;
grant execute on function public.end_bar_session(boolean,text) to service_role;
grant execute on function public.end_shift(uuid) to service_role;
grant execute on function public.is_shift_member(uuid,uuid) to service_role;
grant execute on function public.link_invited_member_account() to service_role;
grant execute on function public.link_lid_member_account() to service_role;
grant execute on function public.list_members_admin() to service_role;
grant execute on function public.list_own_transactions() to service_role;
grant execute on function public.log_client_error(text,text,text,text,integer,text) to service_role;
grant execute on function public.mark_member_invite_sent(uuid,uuid) to service_role;
grant execute on function public.my_bar_state() to service_role;
grant execute on function public.place_order(uuid,uuid,jsonb,uuid) to service_role;
grant execute on function public.register_bar_session(text) to service_role;
grant execute on function public.remove_shift_member(uuid,uuid) to service_role;
grant execute on function public.resume_orphan_shift(uuid) to service_role;
grant execute on function public.reverse_order_as_admin(uuid,text) to service_role;
grant execute on function public.reverse_order_at_bar(uuid,uuid,text,uuid) to service_role;
grant execute on function public.set_activity_type_archived(uuid,boolean) to service_role;
grant execute on function public.set_member_archived(uuid,boolean) to service_role;
grant execute on function public.set_member_role(uuid,text) to service_role;
grant execute on function public.set_own_pin(text) to service_role;
grant execute on function public.set_product_archived(uuid,boolean) to service_role;
grant execute on function public.set_product_image(uuid,text) to service_role;
grant execute on function public.start_shift(uuid) to service_role;
grant execute on function public.top_up(uuid,uuid,integer,text,uuid) to service_role;
grant execute on function public.touch_bar_session() to service_role;
grant execute on function public.update_activity_type_name(uuid,text) to service_role;
grant execute on function public.update_member_email(uuid,text) to service_role;
grant execute on function public.update_member_name(uuid,text) to service_role;
grant execute on function public.update_negative_limit(integer) to service_role;
grant execute on function public.update_own_name(text) to service_role;
grant execute on function public.update_product_price(uuid,integer) to service_role;
