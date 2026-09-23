/**
 * Gedeeld tussen de /beheer-auth-hooks (useBeheerLogin,
 * useWachtwoordHerstellen) en hun schermen. Supabase Auth heeft geen vaste
 * foutvocabulaire zoals de RPC's; herkenning gaat best-effort op de tekst.
 */
export const RATE_LIMITED_MESSAGE =
  "te veel pogingen — probeer het over een paar minuten opnieuw";

export function isRateLimitedMessage(message: string | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("too many");
}
