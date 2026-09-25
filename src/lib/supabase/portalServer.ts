import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Portal-only server Supabase client (Server Components/Route Handlers
 * under `src/app/portal/`, plus the one named exception below) — ADR 0009.
 * Same `cookieOptions` as `portalClient.ts`; same import restriction (see
 * that file's header and `scripts/check-arch.mjs`).
 *
 * `path: "/portal"` on the cookie is independent of which route *sets* it —
 * `src/app/auth/callback/route.ts` (outside `/portal`) is allowed to call
 * this and still have the browser store/scope the cookie correctly, because
 * `Set-Cookie`'s `path` attribute governs which *requests* carry the cookie
 * back, not which route wrote it (ADR 0009 → Aanvulling).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: "sb-portal-auth-token",
        path: "/portal",
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
