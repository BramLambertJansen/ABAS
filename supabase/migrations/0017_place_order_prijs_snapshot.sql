-- `place_order` las elke productprijs twee keer (App-review 2026-09-21).
--
-- De versie uit 0001_init.sql had twee lussen over `p_lines`: de eerste
-- valideerde de regels en telde `v_total` op uit `products.price_cents`, de
-- tweede deed ná de `insert into orders` een *nieuwe* `select` op diezelfde
-- producten om `order_lines.unit_cents` te vullen.
--
-- Onder READ COMMITTED — de standaard-isolatie, en dus wat elke
-- RPC-aanroep hier gebruikt — krijgt elk statement in een transactie een
-- verse snapshot. Een `update_product_price` die tussen die twee lussen
-- commit levert daarmee een bestelling op waarin `orders.total_cents` de
-- oude prijs weerspiegelt en `order_lines.unit_cents` de nieuwe: het lid is
-- op bedrag A afgeschreven terwijl de regels bedrag B verantwoorden. Precies
-- de invariant die `unit_cents` had moeten garanderen (CLAUDE.md → Domein,
-- "Prijswijzigingen raken historie niet. `order_lines.unit_cents` bevriest
-- de prijs op het moment van bestellen") — er wordt dan wel íets bevroren,
-- alleen niet dezelfde prijs als waarop is afgerekend.
--
-- Het venster is microseconden breed en vereist een beheerder die op exact
-- dat moment een prijs wijzigt, dus dit is geen waargenomen incident. Het is
-- wel een geldboekhouding die niet meer optelt, en dat is niet iets om op
-- waarschijnlijkheid af te doen.
--
-- Empirisch bevestigd vóór het schrijven van deze fix (lokale Postgres 16
-- met gestubde auth-schema's, zelfde aanpak als 0011's verificatie — geen
-- Docker/Supabase-CLI beschikbaar in die sandbox). Beide vormen van de
-- functie gekopieerd met een `pg_sleep(2)` op exact de plek van het venster,
-- en een tweede sessie die halverwege `update products set price_cents` doet,
-- van 250 naar 300, op een bestelling van 4 stuks:
--
--   oude vorm  -> orders.total_cents = 1000, som(order_lines) = 1200
--   nieuwe vorm -> orders.total_cents = 1000, som(order_lines) = 1000
--
-- Oftewel: het lid werd voor €10,00 afgeschreven terwijl de orderregels
-- €12,00 verantwoordden. Geen theoretische redenering over snapshots dus,
-- maar een reproduceerbaar verschil.
--
-- Fix: de prijs wordt nog één keer gelezen. De eerste lus legt per regel
-- het opgeloste product vast (`v_resolved`, een jsonb-accumulator met
-- product_id/qty/unit_cents), en de order_lines worden daar in één
-- `insert ... select` uit geschreven — geen tweede tabelbevraging, dus geen
-- tweede snapshot. `v_total` en `unit_cents` komen daarmee per constructie
-- uit dezelfde lezing.
--
-- Twee bijvangsten van dezelfde herschrijving, allebei in de weggevallen
-- tweede lus: die selecteerde zonder `and not archived` (waar de eerste lus
-- dat wél doet) en zonder `if not found`-guard, zodat een product dat
-- tussen de lussen verdween tot een NOT NULL-schending op `order_lines`
-- leidde in plaats van tot `product_not_available`. Beide bestaan niet meer
-- nu er maar één lezing is.
--
-- jsonb als accumulator, geen array van een composite type: `p_lines` is al
-- jsonb en `jsonb_array_elements` staat al in deze functie, dus dit voegt
-- geen nieuw mechanisme toe aan een RPC waar de geldlogica in leeft.
--
-- Geen wijziging aan de volgorde van de controles, de foutcodes, de
-- `for update`-lock op het lid, of de negatieflimiet-berekening — alleen de
-- tweede prijs-lezing verdwijnt. `create or replace` met identieke
-- signatuur, dus de grant uit 0001_init.sql blijft staan.

create or replace function place_order(
  p_shift_id uuid,
  p_member_id uuid,
  p_lines jsonb,
  p_served_by uuid
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_product products;
  v_qty integer;
  v_total integer := 0;
  -- De enige lezing van elke productprijs, vastgelegd op het moment van
  -- valideren. Alles wat daarna naar order_lines geschreven wordt komt
  -- hieruit, nooit opnieuw uit `products`.
  v_resolved jsonb := '[]'::jsonb;
  v_member members;
  v_negative_limit integer;
  v_order orders;
begin
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if not is_shift_member(p_shift_id, p_served_by) then
    raise exception 'served_by_not_on_shift' using errcode = 'P0001';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  -- Validate lines and compute the server-side total before writing
  -- anything — never trust a client-sent price or total.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_qty' using errcode = 'P0001';
    end if;
    select * into v_product from products
      where id = (v_line->>'product_id')::uuid and not archived;
    if not found then
      raise exception 'product_not_available' using errcode = 'P0001';
    end if;
    v_total := v_total + v_product.price_cents * v_qty;
    v_resolved := v_resolved || jsonb_build_object(
      'product_id', v_product.id,
      'qty', v_qty,
      'unit_cents', v_product.price_cents
    );
  end loop;

  if p_member_id is not null then
    select * into v_member from members where id = p_member_id and not archived
      for update;
    if not found then
      raise exception 'member_not_found' using errcode = 'P0001';
    end if;
    select negative_limit_cents into v_negative_limit from app_settings;
    if v_member.balance_cents - v_total < -v_negative_limit then
      raise exception 'insufficient_balance' using errcode = 'P0001';
    end if;
    update members set balance_cents = balance_cents - v_total where id = p_member_id;
  end if;

  insert into orders (shift_id, member_id, served_by, total_cents)
  values (p_shift_id, p_member_id, p_served_by, v_total)
  returning * into v_order;

  insert into order_lines (order_id, product_id, qty, unit_cents)
  select
    v_order.id,
    (r->>'product_id')::uuid,
    (r->>'qty')::integer,
    (r->>'unit_cents')::integer
  from jsonb_array_elements(v_resolved) as r;

  return v_order;
end;
$$;
