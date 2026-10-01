import { formatCents } from "@/lib/money";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import type { TopUpErrorCode } from "@/hooks/queries/useTopUp";

/** Harde bovengrens per contante opwaardering, afgedwongen server-side door
 *  `top_up` (0016_top_up_maximumbedrag.sql → `amount_exceeds_max`). Deze
 *  constante is de *UX*-helft daarvan: hij blokkeert de boeken-knop en
 *  benoemt de grens, zodat een te hoog bedrag niet pas ná een RPC-aanroep
 *  zichtbaar wordt. De afdwinging zelf staat in de migratie en blijft gelden
 *  ook als deze waarde ooit uit de pas loopt. Besloten 2026-09-21 (Bram,
 *  app-review), zie docs/features/opwaarderen.md → Besloten. */
export const TOP_UP_MAX_CENTS = 50000;

/** Boven dit bedrag komt er een expliciete bevestigingsstap vóór de
 *  RPC-aanroep. Bewust lager dan TOP_UP_MAX_CENTS: de cap vangt de typefout
 *  van drie nullen af (nooit bevestigbaar), deze drempel vangt de legitieme
 *  maar ongebruikelijke grote opwaardering af (bardienst bevestigt bewust).
 *  Zonder correctiepad in de app (saldocorrectie hoort bij #13, zie
 *  Expliciet buiten scope) is een vergissing hierboven alleen met directe
 *  databasetoegang terug te draaien — vandaar de tussenstap. */
export const TOP_UP_CONFIRM_THRESHOLD_CENTS = 10000;

/** A4 (besloten, alle standen): nooit een opwaardering naar het lid van de
 *  ingelogde sessie. Dezelfde tekst als inline regel bij het kiezen van jezelf
 *  (vóór het boeken, zoals de €500) en als foutmelding van `top_up`
 *  (`self_top_up_forbidden`). De RPC dwingt het af, dit is de UX. */
export const SELF_TOP_UP_MESSAGE =
  "je kunt jezelf niet opwaarderen — laat een collega of een beheerder dit doen";

/** Inline melding bij een bedrag boven de harde grens. Geen foutcode-
 *  melding: dit staat er al vóórdat er iets aangeroepen is, als uitleg bij
 *  de uitgeschakelde boeken-knop. */
export function topUpAmountTooHighMessage(): string {
  return `maximaal ${formatCents(TOP_UP_MAX_CENTS)} per opwaardering`;
}

/** Copy van de bevestigingsstap boven TOP_UP_CONFIRM_THRESHOLD_CENTS. */
export function topUpConfirmQuestion(
  amountCents: number,
  memberName: string
): string {
  return `Je waardeert ${formatCents(amountCents)} op bij ${memberName}. Klopt dat?`;
}

/** `top_up`-foutcode → Nederlandse melding, exact zoals
 *  docs/features/opwaarderen.md → Randgevallen ("RPC-foutcodes van top_up")
 *  voorschrijft. Zelfde switch-vorm als placeOrderErrorMessage
 *  (src/features/verkoop/messages.ts). */
export function topUpErrorMessage(code: TopUpErrorCode): string {
  // De zes sessiecodes (dienst-per-sessie) krijgen één centrale melding, geen
  // inline regel per scherm.
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  switch (code) {
    case "self_top_up_forbidden":
      return SELF_TOP_UP_MESSAGE;
    case "served_by_not_on_shift":
      return "degene die je koos staat niet meer in de bezetting — kies opnieuw";
    case "member_not_found":
      return "dit lid bestaat niet meer of is gearchiveerd — kies een ander lid";
    case "invalid_amount":
      return "vul een geldig bedrag in";
    // Server-fallback: de client-guard hoort dit al te voorkomen (de
    // boeken-knop staat uit boven TOP_UP_MAX_CENTS). Eigen tekst i.p.v.
    // invalid_amount's "vul een geldig bedrag in" — het bedrag is niet
    // ongeldig, het is te hoog, en de melding moet de grens noemen.
    case "amount_exceeds_max":
      return topUpAmountTooHighMessage();
    case "shift_not_open":
      return "de dienst is niet meer actief — herlaad het scherm";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

/** Vaste bedrag-chips, Besloten 2026-08-29 (docs/features/opwaarderen.md →
 *  Besloten) — geen tegenhanger in het ontwerp (dat laat topupChips
 *  ongevuld). */
export const AMOUNT_CHIPS_CENTS = [500, 1000, 2000, 5000];
