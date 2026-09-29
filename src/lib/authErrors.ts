/**
 * Gedeeld tussen de auth-hooks (useBeheerLogin, useWachtwoordHerstellen,
 * de usePortal*-varianten), hun schermen en de uitnodigingsfout in
 * LidBeherenOverlay. Supabase Auth heeft geen vaste
 * foutvocabulaire zoals de RPC's; herkenning gaat best-effort op de tekst.
 */
export const RATE_LIMITED_MESSAGE =
  "te veel pogingen — probeer het over een paar minuten opnieuw";

export function isRateLimitedMessage(message: string | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("too many");
}

/**
 * Uitkomsten van `supabase.auth.updateUser({ password })` die een scherm
 * afhandelt — gedeeld door de twee herstelflows
 * (`useWachtwoordHerstellen.ts`, `usePortalWachtwoordHerstellen.ts`) en
 * "Wachtwoord wijzigen" in de portal (`usePortalWachtwoordWijzigen.ts`,
 * docs/features/portal-profiel.md → Hooks). De hooks zelf blijven losse
 * bestanden (cookie-isolatie, ADR 0009); alleen deze mapping is gedeeld.
 *
 * `reauth_required`: `reauthentication_needed`/`reauthentication_not_valid`
 * zijn de codes die `@supabase/auth-js` kent voor een wachtwoordwijziging
 * die Supabase "Secure password change" tegenhoudt (sessie buiten het
 * venster). Geen nonce-flow (portal-profiel.md → besluit 3).
 */
export type PasswordUpdateErrorCode =
  | "weak_password"
  | "same_password"
  | "reauth_required"
  | "rate_limited"
  | "unknown";

export function toPasswordUpdateErrorCode(error: {
  code?: string;
  message?: string;
}): PasswordUpdateErrorCode {
  if (error.code === "weak_password") return "weak_password";
  if (error.code === "same_password") return "same_password";
  if (
    error.code === "reauthentication_needed" ||
    error.code === "reauthentication_not_valid"
  ) {
    return "reauth_required";
  }
  if (isRateLimitedMessage(error.message)) return "rate_limited";
  return "unknown";
}

/** Teksten uit docs/features/wachtwoord-vergeten.md → Randgevallen, plus
 *  `reauth_required` uit portal-profiel.md → Schermflow §2 (goedgekeurd
 *  door Bram, 2026-09-28). */
export function passwordUpdateErrorMessage(code: PasswordUpdateErrorCode): string {
  switch (code) {
    case "weak_password":
      return "Dit wachtwoord voldoet niet aan de eisen.";
    case "same_password":
      return "Kies een ander wachtwoord dan je huidige.";
    case "reauth_required":
      return "log opnieuw in en probeer het nog eens";
    case "rate_limited":
      return RATE_LIMITED_MESSAGE;
    case "unknown":
      return "er ging iets mis, probeer het opnieuw";
  }
}
