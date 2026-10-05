import { PENDING_REQUEST_MESSAGE, REQUEST_STORAGE_MESSAGE } from "@/lib/moneyRequest";
import { formatCents } from "@/lib/money";
import { SESSION_CODE_INLINE_MESSAGE, isSessionErrorCode } from "@/lib/barSessie";
import { ONBEKENDE_UITKOMST_GELD_TEKST } from "@/lib/opslaan";
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
  // De zes sessiecodes (dienst-per-sessie) krijgen één centrale melding, geen
  // inline regel per scherm.
  if (isSessionErrorCode(code)) return SESSION_CODE_INLINE_MESSAGE;
  switch (code) {
    case "pending_request":
    case "request_id_conflict":
    case "invalid_request_id":
      return PENDING_REQUEST_MESSAGE;
    case "request_storage_unavailable":
      return REQUEST_STORAGE_MESSAGE;
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
      return "er ging iets mis, probeer het opnieuw";
    case "unknown":
      // Netwerk- of onbekende fout: de server kan de bestelling al hebben
      // verwerkt. Geen "probeer opnieuw" (docs/features/opslaan-sluiten-pending.md,
      // besluit C); de overlay toont daarbij de controlestap.
      return ONBEKENDE_UITKOMST_GELD_TEKST;
  }
}

export const EMPTY_ROSTER_MESSAGE =
  "Afrekenen bij een lege bezetting is nog niet zinvol — voeg jezelf of een collega toe aan de bezetting via de Dienst-tab.";

/** Resultaatregel bij een zoekterm in het assortiment (D3, docs/features/
 *  invoerfeedback-zoeken-filters.md): de zoekterm zoekt over alle categorieën.
 *  Het enkelvoud ("1 product") is grammatica, geen andere formulering. */
export function zoekResultaatTekst(aantal: number, zoekterm: string): string {
  if (aantal === 0) return `Geen producten voor "${zoekterm}"`;
  return `${aantal} ${aantal === 1 ? "product" : "producten"} voor "${zoekterm}" in alle categorieën`;
}

/** Na "wissel" met een gevuld mandje: wat er gebeurt als je een ander lid kiest. */
export function lidwisselAankondiging(stuks: number): string {
  return `De bestelling (${stuks} stuks) staat nog klaar. Kies je een ander lid, dan wordt de bestelling geleegd.`;
}

/** Inline bevestiging bij het kiezen van een ander lid met een gevuld mandje. */
export function lidwisselBevestigVraag(naam: string): string {
  return `Bestelling wissen en verder met ${naam}?`;
}
