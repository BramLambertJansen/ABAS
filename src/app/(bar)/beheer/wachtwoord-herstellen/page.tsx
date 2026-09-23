import { WachtwoordHerstellen } from "@/features/assortimentbeheer/WachtwoordHerstellen";

/**
 * Thin routing wrapper only — same pattern as src/app/(bar)/beheer/page.tsx.
 * Landingsplek van de Reset Password-mail (docs/features/
 * wachtwoord-vergeten.md → De mail, ADR 0008). Alleen `type=recovery` is
 * geldig; al het andere toont direct "link verlopen of al gebruikt".
 */
export default async function WachtwoordHerstellenPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  const tokenHash = token_hash && type === "recovery" ? token_hash : null;
  return <WachtwoordHerstellen tokenHash={tokenHash} />;
}
