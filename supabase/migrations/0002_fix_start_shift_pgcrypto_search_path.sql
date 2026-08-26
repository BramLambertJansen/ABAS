-- Fixes a real bug in start_shift (0001_init.sql), caught by CI's first
-- actual run of `npm run db:test` against a real Postgres (issue #2):
-- `crypt()` (pgcrypto) lives in the `extensions` schema on Supabase, not
-- `public`. start_shift's `set search_path = public` — correct for keeping
-- a SECURITY DEFINER function from resolving unqualified names to
-- something an attacker-controlled search_path could hijack — also hides
-- `crypt()` from itself, so *every* start_shift call (right PIN or wrong)
-- failed with "function crypt(text, text) does not exist" instead of
-- actually checking the PIN. Top-level test fixtures (`insert into members
-- ... crypt('1234', gen_salt('bf'))`) never hit this because a plain psql
-- session's default search_path already includes `extensions`.
--
-- Fix: add `extensions` to this function's search_path explicitly, rather
-- than schema-qualifying every crypt() call — same effect, less
-- error-prone if pgcrypto ever gets re-pointed at a different schema.

create or replace function start_shift(p_member_id uuid, p_pin text)
returns shifts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_member members;
  v_shift shifts;
begin
  select * into v_member from members where id = p_member_id and not archived;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  if v_member.role not in ('bardienst', 'beheerder') then
    raise exception 'no_bar_role' using errcode = 'P0001';
  end if;
  if v_member.pin_hash is null or crypt(p_pin, v_member.pin_hash) <> v_member.pin_hash then
    raise exception 'invalid_pin' using errcode = 'P0001';
  end if;

  insert into shifts (started_by) values (p_member_id) returning * into v_shift;
  insert into shift_members (shift_id, member_id) values (v_shift.id, p_member_id);
  return v_shift;
end;
$$;
