/**
 * Het contract tussen de client-hook `useBarLogin` en de server-only
 * loginflow (src/lib/barLogin.ts, de Route Handlers onder
 * src/app/(bar)/inloggen/) — docs/features/dienst-per-sessie.md → Inloggen op
 * de bar. Alleen types en pure vertalingen; geen server-code, zodat een
 * client-bestand dit mag importeren.
 */

/** Een lid uit de openbare namenlijst: naam en rol, verder niets. */
export type BarNaam = {
  id: string;
  name: string;
  role: "bardienst" | "beheerder";
};

export type BarLoginOpties = {
  /** PIN mogelijk: vertrouwd apparaat, een PIN en geen lockout. */
  pinAvailable: boolean;
  /** PIN geblokkeerd na te veel foute pogingen (alleen voor de tekst). */
  pinLocked: boolean;
};

export type WachtwoordLoginFout =
  | "invalid_credentials"
  | "not_allowed"
  | "no_account"
  | "rate_limited"
  | "unknown";

export type PinLoginFout =
  | "pin_not_available"
  | "invalid_pin"
  | "pin_locked"
  | "not_allowed"
  | "no_account"
  | "rate_limited"
  | "unknown";

export type WachtwoordLoginResultaat = { ok: true } | { ok: false; code: WachtwoordLoginFout };

export type PinLoginResultaat =
  | { ok: true }
  | { ok: false; code: PinLoginFout; attemptsLeft?: number };

const WACHTWOORD_FOUTEN: readonly string[] = [
  "invalid_credentials",
  "not_allowed",
  "no_account",
  "rate_limited",
  "unknown",
];

const PIN_FOUTEN: readonly string[] = [
  "pin_not_available",
  "invalid_pin",
  "pin_locked",
  "not_allowed",
  "no_account",
  "rate_limited",
  "unknown",
];

export function toWachtwoordFout(value: unknown): WachtwoordLoginFout {
  return typeof value === "string" && WACHTWOORD_FOUTEN.includes(value)
    ? (value as WachtwoordLoginFout)
    : "unknown";
}

export function toPinFout(value: unknown): PinLoginFout {
  return typeof value === "string" && PIN_FOUTEN.includes(value)
    ? (value as PinLoginFout)
    : "unknown";
}

/** `verify_bar_pin.result_code` → foutcode voor de client. `ok` is geen fout
 *  en komt hier niet in; onbekende waarden zijn `unknown`. */
export function pinResultaatNaarFout(resultCode: unknown): PinLoginFout {
  return toPinFout(resultCode === "ok" ? "unknown" : resultCode);
}
