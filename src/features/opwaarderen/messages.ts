import type { TopUpErrorCode } from "@/hooks/queries/useTopUp";

/** `top_up`-foutcode → Nederlandse melding, exact zoals
 *  docs/features/opwaarderen.md → Randgevallen ("RPC-foutcodes van top_up")
 *  voorschrijft. Zelfde switch-vorm als placeOrderErrorMessage
 *  (src/features/verkoop/messages.ts). */
export function topUpErrorMessage(code: TopUpErrorCode): string {
  switch (code) {
    case "served_by_not_on_shift":
      return "degene die je koos staat niet meer in de bezetting — kies opnieuw";
    case "member_not_found":
      return "dit lid bestaat niet meer of is gearchiveerd — kies een ander lid";
    case "invalid_amount":
      return "vul een geldig bedrag in";
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
