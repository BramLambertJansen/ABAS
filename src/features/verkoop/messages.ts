import { formatCents } from "@/lib/money";
import type { PlaceOrderErrorCode } from "@/hooks/queries/usePlaceOrder";

/** De onvoldoende-saldo-banner-tekst, gedeeld tussen §2 (mandje-paneel) en
 *  §3 (afrekenbevestiging) — zelfde bewoording op beide plekken per
 *  docs/features/verkoop.md → Schermflow. */
export function insufficientBalanceMessage(shortfallCents: number): string {
  return `Onvoldoende saldo — ${formatCents(shortfallCents)} tekort.`;
}

/** `place_order`-foutcode → Nederlandse melding, exact zoals
 *  docs/features/verkoop.md → Randgevallen ("RPC-foutcodes van
 *  place_order") voorschrijft. `insufficient_balance` heeft hier
 *  bewust geen eigen tekst: de afhandelaar laat in dat geval de bestaande
 *  banner (insufficientBalanceMessage) opnieuw oplichten na een
 *  ledenlijst-refetch, in plaats van een tweede, losstaande melding te
 *  tonen — zie AfrekenenOverlay.tsx. */
export function placeOrderErrorMessage(code: PlaceOrderErrorCode): string {
  switch (code) {
    case "served_by_not_on_shift":
      return "degene die je koos staat niet meer in de bezetting — kies opnieuw";
    case "member_not_found":
      return "dit lid bestaat niet meer of is gearchiveerd — kies een ander lid";
    case "product_not_available":
      return "een product in je mandje is niet meer beschikbaar — controleer je mandje";
    case "shift_not_open":
      return "de dienst is niet meer actief — herlaad het scherm";
    case "insufficient_balance":
    case "empty_order":
    case "invalid_qty":
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}

export const NO_MEMBERS_FOUND_MESSAGE = "geen leden gevonden";

export const EMPTY_ROSTER_MESSAGE =
  "Afrekenen bij een lege bezetting is nog niet zinvol — voeg jezelf of een collega toe aan de bezetting via de Dienst-tab.";
