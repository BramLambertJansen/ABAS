-- Harde bovengrens op een contante opwaardering (App-review 2026-09-21,
-- besloten door Bram: bevestigingsstap boven €100 client-side, harde cap op
-- €500 server-side).
--
-- Aanleiding: `top_up` controleerde alleen `p_amount_cents > 0`. Een
-- bardienst die in het vrije invoerveld "5000" tikt in plaats van "50,00"
-- boekte daarmee €5.000 zonder enige tussenstap — en saldocorrectie is
-- bewust naar #13 geschoven (docs/features/opwaarderen.md → Expliciet buiten
-- scope), dus zo'n vergissing is vandaag alleen met directe
-- databasetoegang terug te draaien. De twee lagen samen: de bevestigingsstap
-- vangt de legitieme grote opwaardering af (bardienst bevestigt bewust), de
-- cap hier vangt de typefout van drie nullen af (nooit bevestigbaar).
--
-- Bewust in de RPC en niet als check-constraint op `top_ups.amount_cents`:
-- dit is een kassa-guard voor de contante balie, geen eigenschap van de
-- tabel. Online opwaarderen (#23) landt straks als een tweede schrijfpad
-- naast deze RPC (docs/features/opwaarderen.md → Expliciet buiten scope: "de
-- RPC-grens staat al zo dat een betaalprovider-webhook er later naast kan")
-- en heeft een iDEAL-betaling als bewijs — dáár is €500 geen zinvolle grens.
-- Een tabel-constraint zou die toekomstige route meebeperken zonder dat daar
-- ooit over besloten is. Zelfde afweging als de `method`-kolom, die om
-- precies dezelfde reden vrije tekst bleef (spec → Besloten, 2026-08-29).
--
-- Eigen foutcode `amount_exceeds_max`, niet het bestaande `invalid_amount`:
-- "vul een geldig bedrag in" is het verkeerde antwoord op een bedrag dat
-- prima geldig is maar te hoog — de UI moet de grens kunnen noemen. Zelfde
-- reden waarom start_shift `no_bar_role` en `invalid_pin` uit elkaar houdt.
--
-- Verder 1-op-1 de body uit 0001_init.sql; alleen het blok na de
-- invalid_amount-check is nieuw. `create or replace` met identieke
-- signatuur, dus de grant uit 0001_init.sql blijft staan.

create or replace function top_up(
  p_shift_id uuid,
  p_member_id uuid,
  p_amount_cents integer,
  p_method text,
  p_served_by uuid
)
returns top_ups
language plpgsql
security definer
set search_path = public
as $$
declare
  -- €500. Als losse constante in het functielichaam in plaats van een magic
  -- number in de vergelijking, zodat de grens één plek heeft om te wijzigen
  -- en in de foutafhandeling hieronder herbruikbaar blijft. De client kent
  -- dezelfde waarde als TOP_UP_MAX_CENTS (src/features/opwaarderen/
  -- messages.ts) om de knop al vóór de aanroep te blokkeren — dit is de
  -- afdwinging, dat is de UX.
  c_max_amount_cents constant integer := 50000;
  v_top_up top_ups;
begin
  if not exists (select 1 from shifts where id = p_shift_id and ended_at is null) then
    raise exception 'shift_not_open' using errcode = 'P0001';
  end if;
  if not is_shift_member(p_shift_id, p_served_by) then
    raise exception 'served_by_not_on_shift' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_amount_cents > c_max_amount_cents then
    raise exception 'amount_exceeds_max' using errcode = 'P0001';
  end if;
  if not exists (select 1 from members where id = p_member_id and not archived) then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;

  update members set balance_cents = balance_cents + p_amount_cents where id = p_member_id;

  insert into top_ups (shift_id, member_id, amount_cents, method, served_by)
  values (p_shift_id, p_member_id, p_amount_cents, p_method, p_served_by)
  returning * into v_top_up;

  return v_top_up;
end;
$$;
