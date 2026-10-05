import { createBrowserClient } from "@supabase/ssr";

/**
 * Portal-only browser Supabase client — ADR 0009 (cookie-isolatie). Naast
 * client.ts/server.ts (bar/beheer), niet een variant erop: een eigen,
 * expliciete cookienaam zodat een portal-sessie nooit de gedeelde
 * bar-tablet-device-sessie (of andersom) kan lezen/overschrijven. Zie ADR
 * 0009 → Beslissing voor de volledige motivatie/verworpen alternatieven.
 *
 * `path: "/"` (ADR 0009 → Wijziging): de PKCE-`code_verifier` moet ook
 * `/auth/callback` bereiken, buiten `/portal`. De isolatie zit in de
 * cookienaam; bar/beheer leest alleen zijn eigen naam.
 *
 * Alleen te importeren vanuit `src/app/portal/`, `src/shells/portal/` of
 * `src/features/portal-login/` — met precies één, met bestandspad genoemde
 * uitzondering: `src/app/auth/callback/route.ts` (zie `scripts/check-arch.mjs`
 * en ADR 0009 → "Aanvulling").
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: "sb-portal-v2-auth-token",
        path: "/",
      },
    }
  );
}
