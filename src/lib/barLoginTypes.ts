/**
 * Het contract tussen de client-hook `useBarLogin` en de server-only
 * loginflow (src/lib/barLogin.ts, de Route Handlers onder
 * src/app/(bar)/inloggen/) — docs/features/dienst-per-sessie.md → Inloggen op
 * de bar. Alleen types en pure vertalingen; geen server-code, zodat een
 * client-bestand dit mag importeren.
 */

/** Een lid uit de openbare namenlijst: id en naam, verder niets. Sinds ADR
 *  0017 zonder rol, zodat beheerders van buitenaf niet als doelwit te
 *  herkennen zijn (docs/features/login-rate-limit.md → Namenlijst zonder
 *  rol). */
export type BarNaam = {
  id: string;
  name: string;
};

export type BarLoginOpties = {
  /** PIN mogelijk: vertrouwd apparaat, een PIN en geen lockout. */
  pinAvailable: boolean;
  /** PIN geblokkeerd na te veel foute pogingen (alleen voor de tekst). */
  pinLocked: boolean;
  /** De PIN zou werken, maar dit is een beheerder zonder tweede factor (ADR
   *  0017; alleen voor de tekst). */
  pinNeedsMfa: boolean;
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
  | "pin_needs_mfa"
  | "not_allowed"
  | "no_account"
  | "rate_limited"
  | "unknown";

export type WachtwoordLoginResultaat = { ok: true } | { ok: false; code: WachtwoordLoginFout };

export type PinLoginResultaat =
  | { ok: true }
  | { ok: false; code: PinLoginFout; attemptsLeft?: number };

/** "Wachtwoord vergeten": altijd neutraal (ADR 0013). `limited`: er ging
 *  geen mail, want de eigen limiet is bereikt (docs/features/
 *  login-rate-limit.md → `POST /inloggen/vergeten`). */
export type VergetenResultaat = { ok: true; limited: boolean };

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
  "pin_needs_mfa",
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
