import { PortalWachtwoordHerstellen } from "@/features/portal-login/PortalWachtwoordHerstellen";

/**
 * Thin routing wrapper only — same pattern as
 * src/app/(bar)/beheer/wachtwoord-herstellen/page.tsx. Landingsplek van de
 * Reset Password-mail (docs/features/portal-login.md → Schermflow →
 * "Wachtwoord vergeten", ADR 0008). Alleen `type=recovery` is geldig; al het
 * andere toont direct "link verlopen of al gebruikt".
 */
export default async function PortalWachtwoordHerstellenPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  const tokenHash = token_hash && type === "recovery" ? token_hash : null;
  return <PortalWachtwoordHerstellen tokenHash={tokenHash} />;
}
