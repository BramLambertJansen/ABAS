/**
 * Gedeeld tussen de twee `set_own_pin`-hooks (`useSetOwnPin.ts` voor
 * `/beheer` → "Mijn account", `usePortalSetOwnPin.ts` voor de portal) en
 * hun schermen — docs/features/portal-profiel.md → Hooks → "Duplicatie
 * voorkomen". De hooks zelf blijven losse bestanden (cookie-isolatie, ADR
 * 0009); alles wat niet aan de client hangt staat hier.
 */

/** Zelfde 4-cijferige formaat als `set_own_pin` (0014) en de PinPad. */
export const PIN_PATTERN = /^[0-9]{4}$/;

/** Foutcodes die `set_own_pin` (0014_pin_zelfbediening.sql) werkelijk
 *  geeft. Al het andere valt terug op "unknown". */
export type SetOwnPinErrorCode =
  | "invalid_pin_format"
  | "actor_not_found"
  | "no_bar_role"
  | "unknown";

export function toSetOwnPinErrorCode(message: string | undefined): SetOwnPinErrorCode {
  if (
    message === "invalid_pin_format" ||
    message === "actor_not_found" ||
    message === "no_bar_role"
  ) {
    return message;
  }
  return "unknown";
}

export function setOwnPinErrorMessage(code: SetOwnPinErrorCode): string {
  switch (code) {
    case "invalid_pin_format":
      return "een pincode is 4 cijfers";
    case "actor_not_found":
      return "dit account is niet gekoppeld aan een lid — log opnieuw in";
    case "no_bar_role":
      return "dit account kan geen pincode instellen — vraag een beheerder";
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}
