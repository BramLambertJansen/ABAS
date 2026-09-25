import { createBrowserClient } from "@supabase/ssr";

/**
 * Portal-only browser Supabase client — ADR 0009 (cookie-isolatie). Naast
 * client.ts/server.ts (bar/beheer), niet een variant erop: een eigen,
 * expliciete cookienaam zodat een portal-sessie nooit de gedeelde
 * bar-tablet-device-sessie (of andersom) kan lezen/overschrijven. Zie ADR
 * 0009 → Beslissing voor de volledige motivatie/verworpen alternatieven.
 *
 * `path: "/portal"`: de browser stuurt dit cookie sowieso nooit mee naar een
 * bar/beheer-request, in plaats van alleen "de portal-client zoekt er
 * toevallig niet naar" (ADR 0009).
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
        name: "sb-portal-auth-token",
        path: "/portal",
      },
    }
  );
}
