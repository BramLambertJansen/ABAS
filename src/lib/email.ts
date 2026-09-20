/** Minimale "ziet eruit als een e-mailadres"-check, zelfde eenvoudige
 *  patroon als de RPC's/db-constraint (docs/features/ledenbeheer-email.md
 *  → RPC's) — geen uitputtende RFC 5322-validatie. Alleen aanroepen met een
 *  al-getrimde, niet-lege waarde: een lege/whitespace-only invoer is "geen
 *  e-mailadres" (geldig, want optioneel), niet "ongeldig formaat". */
export function isValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
