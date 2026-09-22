-- Een `lid`-sessie mag alleen de eigen geldrijen lezen (App-review 2026-09-21,
-- ADR 0007). Sluit de tripwire die 0001_init.sql bewust open liet:
--
--   "Read access: single-tenant, so any authenticated session ... can read
--    everything. Tighten per-row (e.g. a portal member reading only their own
--    row) when the portal shell is actually specced — not yet."
--
-- Die "not yet" klopte toen: de enige accounts waren de gedeelde
-- device-sessie en bardienst/beheerder-sessies. Sinds
-- 0012_lid_account_uitnodigen.sql bestaat de machinerie om een lid wél een
-- eigen account te geven (`link_invited_member_account`, `invited_at`) —
-- vandaag nog geblokkeerd door de rol-eligibility in src/lib/inviteMember.ts,
-- maar dat is één regel applicatiecode tussen "gedeferd" en "elk lid leest
-- elk saldo". Dat is te weinig voor een regel die CLAUDE.md → Domein
-- ("Lid — ziet eigen saldo en transacties. Verder niets.") als domeinregel
-- stelt, dus die grens verhuist hier naar de database.
--
-- **Strikt beperkend, nul gedragswijziging vandaag.** Elke policy hieronder
-- heeft de vorm `not caller_is_lid() or <eigen rij>`: alleen een aanroeper
-- die daadwerkelijk naar een members-rij met rol `lid` herleidt wordt
-- beperkt. De gedeelde device-sessie (geen gekoppelde members-rij) en elke
-- bardienst/beheerder-sessie vallen in de `not caller_is_lid()`-tak en zien
-- exact wat ze eerder zagen. Geen enkele bestaande hook, RPC of e2e-flow
-- verandert van gedrag.
--
-- Reikwijdte (Bram, app-review 2026-09-21): members, orders, order_lines en
-- top_ups. `shifts`/`shift_members` blijven ook voor een lid leesbaar — wie
-- welke dienst draaide is binnen de vereniging geen privégegeven — en
-- `products`/`app_settings` sowieso (prijslijst en saldolimiet zijn publiek
-- binnen de club, en de portal heeft ze straks nodig om überhaupt iets te
-- kunnen tonen).
--
-- Dit is niet de device-sessie-hardening: die blijft openstaan voor #15
-- (docs/ARCHITECTURE.md → "Deferred: device cookie isn't scoped away from
-- shells/portal"). Deze migratie beschermt tegen een lid-account, niet tegen
-- iemand die de device-credentials in handen heeft.

-- ── Helpers ──────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER is hier geen keuze maar een noodzaak: een policy óp
-- `members` die zelf `members` bevraagt om de rol van de aanroeper te
-- bepalen zou zichzelf oproepen (infinite recursion, Postgres weigert de
-- query met 42P17). Een SECURITY DEFINER-functie draait als de eigenaar van
-- de functie — dezelfde tabel-eigenaar — en is daarmee niet onderhevig aan
-- RLS op `members`, wat de recursie breekt. Zelfde mechanisme als
-- `is_shift_member` (0001_init.sql) al gebruikt binnen place_order/top_up.
--
-- STABLE, niet VOLATILE: beide helpers lezen alleen. Voor de
-- parameterloze twee betekent dat Postgres ze per statement één keer
-- evalueert in plaats van per rij.

create or replace function caller_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from members where auth_user_id = auth.uid();
$$;

comment on function caller_member_id() is
  'members.id van de aanroepende sessie, of null voor een sessie zonder gekoppeld lid (o.a. de gedeelde bar-tablet-device-sessie). Alleen bedoeld voor RLS-policies — RPC''s doen hun eigen, strengere actorcheck (inclusief `not archived`), zie ADR 0002.';

-- Bewust géén `not archived`-eis, in tegenstelling tot de actorcheck in de
-- beheerder-RPC's: een gearchiveerd lid dat nog een sessie heeft moet zijn
-- eigen historie kunnen inzien, niet ineens die van de hele vereniging. Zou
-- `archived` hier wél meetellen, dan zou een gearchiveerd lid uit de
-- `caller_is_lid()`-tak vallen en juist méér gaan zien.
create or replace function caller_is_lid()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from members
    where auth_user_id = auth.uid() and role = 'lid'
  );
$$;

comment on function caller_is_lid() is
  'True als de aanroepende sessie naar een members-rij met rol `lid` herleidt. False voor bardienst/beheerder én voor een sessie zonder gekoppeld lid (de gedeelde device-sessie) — die laatste twee behouden de brede leestoegang uit 0001_init.sql.';

-- Aparte helper in plaats van een `exists (select 1 from orders ...)` in de
-- order_lines-policy: een tabelverwijzing bínnen een policy-expressie krijgt
-- zelf óók RLS opgelegd. Dat zou hier toevallig het goede antwoord geven
-- (orders' eigen policy beperkt een lid al tot de eigen bestellingen), maar
-- "correct omdat twee policies elkaar toevallig aanvullen" is precies het
-- soort redenering dat een latere policy-wijziging stil breekt.
create or replace function caller_owns_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from orders
    where id = p_order_id and member_id = caller_member_id()
  );
$$;

comment on function caller_owns_order(uuid) is
  'True als de bestelling aan het lid van de aanroepende sessie toebehoort. Gastverkopen (orders.member_id is null) horen bij niemand en zijn dus voor geen enkel lid zichtbaar.';

-- Policy-expressies worden geëvalueerd met de rechten van de aanroepende
-- rol, dus `authenticated` heeft EXECUTE nodig — zonder dit faalt elke
-- select op de vier tabellen hieronder met "permission denied for function".
grant execute on function caller_member_id, caller_is_lid, caller_owns_order
  to authenticated;

-- ── Policies ─────────────────────────────────────────────────────────────
--
-- `drop policy` + `create policy`, niet `alter policy`: de vier policies
-- bestaan al sinds 0001_init.sql en `create policy` is niet idempotent.
-- Namen blijven identiek zodat check:rls en de bestaande tests ze op naam
-- blijven vinden.

drop policy members_select on members;
create policy members_select on members for select to authenticated
  using (
    not caller_is_lid()
    -- Een lid ziet uitsluitend de eigen rij. `pin_hash` en `email` blijven
    -- daarbovenop kolom-REVOKEd (0009/0010) — die zijn ook op de eigen rij
    -- niet leesbaar via een directe select.
    or auth_user_id = auth.uid()
  );

drop policy orders_select on orders;
create policy orders_select on orders for select to authenticated
  using (
    not caller_is_lid()
    -- member_id is null bij een gastverkoop: die hoort bij geen enkel lid en
    -- blijft voor een lid-sessie dus onzichtbaar (null = null is nooit waar).
    or member_id = caller_member_id()
  );

drop policy order_lines_select on order_lines;
create policy order_lines_select on order_lines for select to authenticated
  using (
    not caller_is_lid()
    or caller_owns_order(order_id)
  );

drop policy top_ups_select on top_ups;
create policy top_ups_select on top_ups for select to authenticated
  using (
    not caller_is_lid()
    or member_id = caller_member_id()
  );
