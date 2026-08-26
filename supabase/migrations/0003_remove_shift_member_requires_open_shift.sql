-- Fixes a real gap in remove_shift_member (0001_init.sql, regel 212–219):
-- it was a kale `delete` with no check that the shift is still open, unlike
-- add_shift_member (0001_init.sql, regel 197–199), which already guards on
-- `shift_not_open`. That's a gap against #7's own acceptance criteria
-- ("toevoegen/verwijderen buiten een actieve dienst wordt geweigerd") —
-- today that only held for adding. See docs/features/bezetting-beheren.md →
-- RPC's for the full rationale.
--
-- This is a fix to an already-merged RPC, not a new one — no ADR needed,
-- it closes a gap against an already-settled principle rather than
-- introducing anything new. Same reason this is a new, sequentially
-- numbered migration rather than editing 0001_init.sql directly: that's the
-- existing pattern in this repo for a fix on a merged RPC (see
-- 0002_fix_start_shift_pgcrypto_search_path.sql).
--
-- Moves to `language plpgsql` (from `language sql`) — needed for the
-- conditional `raise`, same as add_shift_member. `create or replace
-- function` keeps the existing name/signature, so the existing
-- `grant execute` from 0001_init.sql still applies — no new grant needed.

create or replace function remove_shift_member(p_shift_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  delete from shift_members where shift_id = p_shift_id and member_id = p_member_id;
end;
$$;
