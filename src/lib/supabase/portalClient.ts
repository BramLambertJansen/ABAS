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
const PORTAL_COOKIE = "sb-portal-v2-auth-token";

/**
 * Lokale opruiming van de portal-sessie voor als `auth.signOut()` een `{error}`
 * teruggeeft vóór auth-js `_removeSession()` bereikt (sessionError, bv. een
 * mislukte token-refresh zonder netwerk). Wist alleen de eigen, geïsoleerde
 * portal-cookie (ook de `.0`/`.1`-chunks), nooit die van bar/beheer (ADR 0009).
 */
export function wisPortalSessieLokaal() {
  for (const kv of document.cookie.split(";")) {
    const naam = (kv.split("=")[0] ?? "").trim();
    if (naam === PORTAL_COOKIE || naam.startsWith(PORTAL_COOKIE + ".")) {
      document.cookie = `${naam}=; Max-Age=0; path=/`;
    }
  }
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: PORTAL_COOKIE,
        path: "/",
      },
    }
  );
}
