import type { ReverseOrderErrorCode } from "@/hooks/queries/useReverseOrder";

/** Maximale lengte van de reden, gelijk aan de check in
 *  0020_bestelling_terugdraaien.sql. De server dwingt het af; dit is de
 *  UX-helft (maxLength op het veld), zelfde verdeling als TOP_UP_MAX_CENTS. */
export const REVERSE_REASON_MAX_LENGTH = 200;

/** Foutcode → vaste Nederlandse melding, zoals
 *  docs/features/bestelling-terugdraaien.md → Foutcodes voorschrijft.
 *  Zelfde switch-vorm als topUpErrorMessage. */
export function reverseOrderErrorMessage(code: ReverseOrderErrorCode): string {
  switch (code) {
    case "shift_not_open":
      return "deze dienst is al afgesloten — terugdraaien kan nu alleen nog via beheer";
    case "order_not_in_shift":
      return "deze bestelling hoort niet bij de open dienst — terugdraaien kan alleen via beheer";
    case "reversed_by_not_on_shift":
      return "wie terugdraait staat niet (meer) in de bezetting — kies opnieuw";
    case "actor_not_found":
      return "je sessie hoort niet bij een lid — log opnieuw in";
    case "no_admin_role":
      return "alleen een beheerder kan dit doen";
    case "order_not_found":
      return "deze bestelling bestaat niet meer";
    case "reason_required":
      return "vul een reden in";
    case "reason_too_long":
      return `de reden mag maximaal ${REVERSE_REASON_MAX_LENGTH} tekens zijn`;
    case "already_reversed":
      return "deze bestelling is al teruggedraaid";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}
