-- Leespolicies van denylist naar allowlist (docs/features/leespolicies-allowlist.md,
-- ADR 0019; item A van de review van 2026-10-05).
--
-- 0015 (members/orders/order_lines/top_ups) en 0020 (order_reversals) gaven
-- brede leestoegang aan iedereen die géén `lid` was: `not caller_is_lid() or
-- <eigen rij>`. Daarmee las elk authenticated-account zonder gekoppelde
-- members-rij (verkeerd uitgenodigd adres, self-signup via de portal, oud
-- device-account) alle namen, saldi, bestellingen, bestelregels,
-- opwaarderingen en terugdraaiingen, en las een gearchiveerde bardienst of
-- beheerder ook nog alles (`caller_is_lid()` negeert `archived`). De
-- rechtvaardiging, de gedeelde bar-tablet-device-sessie zonder members-rij,
-- is sinds ADR 0016 (0027) vervallen.
--
-- Nu: de brede tak vraagt een gekoppelde, niet-gearchiveerde members-rij met
-- rol bardienst of beheerder (caller_has_bar_role(), dezelfde rol- en
-- archiefcheck als require_session uit 0028; bewust géén actieve
-- bar-sessie, zie ADR 0019). Iedereen anders ziet alleen de eigen rijen
-- (ongewijzigd t.o.v. 0015/0020); een account zonder lid ziet niets.
--
-- Volgorde: eerst de helper, dan de policies, dan pas caller_is_lid()
-- droppen. Postgres registreert de afhankelijkheid van een policy op een
-- functie, dus de drop faalt als er nog iets naar verwijst. Bewust geen
-- `cascade`.

-- ── Helper ───────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER om dezelfde reden als de helpers uit 0015: een policy op
-- members kan members niet zelf bevragen (42P17), en vijf policies laten
-- afhangen van wat members_select toevallig toelaat is fragiel.
-- Parameterloos en STABLE. Een STABLE functie in een policy-qual wordt nog
-- steeds per rij aangeroepen; daarom staat de aanroep in de policies als
-- `(select caller_has_bar_role())`, zodat Postgres hem als initplan één keer
-- per statement evalueert. Geen guard: de helper zegt alleen iets over de
-- aanroeper zelf.

create or replace function caller_has_bar_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from members
    where auth_user_id = auth.uid()
      and not archived
      and role in ('bardienst', 'beheerder')
  );
$$;

comment on function caller_has_bar_role() is
  'True als de aanroepende sessie naar een niet-gearchiveerde members-rij met rol bardienst of beheerder herleidt. Allowlist voor de brede tak van de leespolicies (ADR 0019); dezelfde rol- en archiefcheck als require_session. Eist geen actieve bar-sessie.';

-- Policy-expressies worden geëvalueerd met de rechten van de aanroepende
-- rol, dus authenticated heeft EXECUTE nodig.
grant execute on function caller_has_bar_role() to authenticated;
revoke execute on function caller_has_bar_role() from public;
revoke execute on function caller_has_bar_role() from anon;

-- ── Policies ─────────────────────────────────────────────────────────────
--
-- Namen blijven gelijk, zodat check:rls en de bestaande tests ze blijven
-- vinden. De pin_hash- en email-kolom-REVOKEs (0009/0010) blijven
-- daarbovenop gelden. Gastverkoop (orders.member_id is null) valt buiten
-- elke eigen-rij-tak en is dus alleen voor een actieve bar-rol zichtbaar.

drop policy members_select on members;
create policy members_select on members for select to authenticated
  using ((select caller_has_bar_role()) or auth_user_id = auth.uid());

drop policy orders_select on orders;
create policy orders_select on orders for select to authenticated
  using ((select caller_has_bar_role()) or member_id = caller_member_id());

drop policy order_lines_select on order_lines;
create policy order_lines_select on order_lines for select to authenticated
  using ((select caller_has_bar_role()) or caller_owns_order(order_id));

drop policy top_ups_select on top_ups;
create policy top_ups_select on top_ups for select to authenticated
  using ((select caller_has_bar_role()) or member_id = caller_member_id());

drop policy order_reversals_select on order_reversals;
create policy order_reversals_select on order_reversals for select to authenticated
  using ((select caller_has_bar_role()) or caller_owns_order(order_id));

-- ── caller_is_lid() weg ──────────────────────────────────────────────────
--
-- Na de policies hierboven gebruikt niets haar nog (de bar-RPC's uit 0023
-- zijn in 0029 al zonder haar herschreven). Een helper waarvan de enige
-- zinnige toepassing de denylist-vorm is, nodigt uit tot hergebruik.

drop function caller_is_lid();

-- Het comment noemde nog "de gedeelde bar-tablet-device-sessie".
comment on function caller_member_id() is
  'members.id van de aanroepende sessie, of null voor een sessie zonder gekoppeld lid. Voor RLS-policies en zelf-scopende RPC''s (list_own_transactions); RPC''s met een actor doen hun eigen, strengere check (ADR 0002, require_session).';
