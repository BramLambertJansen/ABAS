import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Portal-only server Supabase client (Server Components/Route Handlers
 * under `src/app/portal/`, plus the one named exception below) — ADR 0009.
 * Same `cookieOptions` as `portalClient.ts`; same import restriction (see
 * that file's header and `scripts/check-arch.mjs`).
 *
 * `path: "/"` (ADR 0009 → Wijziging) so `/auth/callback` (outside `/portal`)
 * receives the PKCE `code_verifier` cookie and can exchange the code.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: "sb-portal-auth-token",
        path: "/",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Parameters<typeof cookieStore.set>[2];
          }[]
        ) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options ?? {});
            }
          } catch {
            // Called from a Server Component that can't set cookies — same
            // fallback as src/lib/supabase/server.ts.
          }
        },
      },
    }
  );
}
