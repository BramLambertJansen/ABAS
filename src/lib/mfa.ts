/**
 * De tweede factor (TOTP) voor beheerders (docs/features/
 * beheer-tweede-factor.md, ADR 0017). Beheer eist een sessie met aal2; de
 * factor stel je in de portal in, de code vraagt de app vóór beheer en vóór
 * een wachtwoordwijziging als het account een factor heeft.
 *
 * Geen `@supabase/*`-import: de hooks per shell geven hun eigen `auth`-client
 * mee (`client` in de bar-shell, `portalClient` in de portal; ADR 0009). De
 * functies zijn structureel getypt, zodat `node --test` ze met een nep-client
 * draait (test/mfa.test.ts). De teksten staan hier letterlijk uit de spec →
 * Teksten, omdat het gedeelde code-component (src/components/CodeInvoer.tsx)
 * in beide shells draait.
 */

/** Zes cijfers, zoals elke authenticator-app toont. */
export const CODE_LENGTH = 6;

/** De uitkomst van een code-invoer, als die niet slaagt. */
export type CodeFout = "invalid_code" | "rate_limited" | "unknown";

export const TWEESTAP_TEKSTEN = {
  rij: "Tweestapsverificatie",
  aan: "Aan",
  uit: "Uit",
  rijUitleg:
    "Nodig om in beheer te komen. Je gebruikt een app zoals Google Authenticator of Microsoft Authenticator.",
  stap1Titel: "Tweestapsverificatie instellen",
  stap1Uitleg: "Scan deze code met je authenticator-app. Lukt scannen niet, typ dan deze sleutel over:",
  stap1Knop: "Volgende",
  stap2Titel: "Code invoeren",
  stap2Uitleg: "Voer de 6 cijfers in die je app nu toont.",
  stap2Knop: "Bevestigen",
  toast: "Tweestapsverificatie ingesteld",
  foutCode: "onjuiste code — probeer het opnieuw",
  foutTeVaak: "te veel pogingen — probeer het over een paar minuten opnieuw",
  modusKeuzeTitel: "Code uit je authenticator-app",
  beheerZonderFactor: "Stel eerst tweestapsverificatie in via de portal (Account).",
  wachtwoordCodeStap: "Voer eerst de code uit je authenticator-app in.",
} as const;

/** Voor een onverwachte fout: dezelfde algemene regel als elders in de app. */
export const FOUT_OVERIG = "er ging iets mis, probeer het opnieuw";

export function codeFoutTekst(fout: CodeFout): string {
  switch (fout) {
    case "invalid_code":
      return TWEESTAP_TEKSTEN.foutCode;
    case "rate_limited":
      return TWEESTAP_TEKSTEN.foutTeVaak;
    case "unknown":
      return FOUT_OVERIG;
  }
}

type AuthErrorLike = { status?: number; code?: string; message?: string } | null | undefined;

/**
 * Een fout van Supabase Auth bij `challenge`/`verify` → `CodeFout`. Een foute
 * code geeft `mfa_verification_failed` (422); de limiet op pogingen is die van
 * Supabase Auth (`FactorVerify`, per IP) en geeft 429.
 */
export function toCodeFout(error: AuthErrorLike): CodeFout {
  if (!error) return "unknown";
  if (error.status === 429 || error.code === "over_request_rate_limit") return "rate_limited";
  if (error.code === "mfa_verification_failed") return "invalid_code";
  if (error.status === 422 && /invalid totp code/i.test(error.message ?? "")) return "invalid_code";
  return "unknown";
}

/** Zes cijfers, niets anders. */
export function isGeldigeCode(code: string): boolean {
  return new RegExp(`^[0-9]{${CODE_LENGTH}}$`).test(code);
}

// ── Factoren ─────────────────────────────────────────────────────────────

export type FactorLike = { id: string; factor_type?: string; status?: string };

/** Het id van de geverifieerde TOTP-factor, of `null`. */
export function geverifieerdeTotp(factors: readonly FactorLike[] | null | undefined): string | null {
  return factors?.find((f) => f.factor_type === "totp" && f.status === "verified")?.id ?? null;
}

/** De niet-afgemaakte TOTP-factoren: die gaan eerst weg bij een nieuwe
 *  poging, zodat instellen altijd opnieuw kan. */
export function onafgemaakteTotp(factors: readonly FactorLike[] | null | undefined): string[] {
  return (factors ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified").map((f) => f.id);
}

/** Moet deze sessie eerst de code geven? Ja als het account een factor heeft
 *  (`nextLevel = 'aal2'`) en de sessie nog aal1 is. */
export function codeNodig(aal: { currentLevel?: string | null; nextLevel?: string | null } | null): boolean {
  return aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
}

// ── Met een client ───────────────────────────────────────────────────────

type Uitkomst<T> = { data: T | null; error: AuthErrorLike };

/** Het deel van `supabase.auth.mfa` dat hier nodig is. */
export type MfaApi = {
  listFactors(): PromiseLike<Uitkomst<{ all: FactorLike[] }>>;
  getAuthenticatorAssuranceLevel(): PromiseLike<
    Uitkomst<{ currentLevel: string | null; nextLevel: string | null }>
  >;
  challengeAndVerify(params: { factorId: string; code: string }): PromiseLike<Uitkomst<unknown>>;
};

export type MfaStatus =
  | { ok: true; factorId: string | null; aal2: boolean }
  | { ok: false };

/** Heeft het account een geverifieerde factor, en is de sessie al aal2? */
export async function leesMfaStatus(mfa: MfaApi): Promise<MfaStatus> {
  const [factoren, aal] = await Promise.all([mfa.listFactors(), mfa.getAuthenticatorAssuranceLevel()]);
  if (factoren.error || aal.error || !factoren.data) return { ok: false };
  return {
    ok: true,
    factorId: geverifieerdeTotp(factoren.data.all),
    aal2: aal.data?.currentLevel === "aal2",
  };
}

/** Moet de sessie eerst de code geven? Bij een fout: nee (dan beslist
 *  Supabase Auth zelf, met `insufficient_aal`). */
export async function sessieNodigCode(mfa: MfaApi): Promise<boolean> {
  const { data, error } = await mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return codeNodig(data);
}

/**
 * De code van de geverifieerde TOTP-factor controleren (`challenge` +
 * `verify`). Na succes is dezelfde sessie aal2; het `session_id` blijft
 * gelijk. `null` bij succes, anders de fout.
 */
export async function verifieerCode(mfa: MfaApi, code: string): Promise<CodeFout | null> {
  if (!isGeldigeCode(code)) return "invalid_code";
  const factoren = await mfa.listFactors();
  if (factoren.error || !factoren.data) return "unknown";
  const factorId = geverifieerdeTotp(factoren.data.all);
  if (!factorId) return "unknown";
  const { error } = await mfa.challengeAndVerify({ factorId, code });
  return error ? toCodeFout(error) : null;
}
