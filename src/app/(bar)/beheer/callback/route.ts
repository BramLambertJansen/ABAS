import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Completes a `/beheer` magic-link login (see
 * src/hooks/queries/useBeheerLogin.ts → signInWithMagicLink,
 * emailRedirectTo). `@supabase/ssr`'s browser/server client pair uses the
 * PKCE flow — the e-mail link points here with a `?code=...` query param,
 * which this route exchanges server-side for a real session (cookie-based,
 * via src/lib/supabase/server.ts, the same session src/middleware.ts and
 * every hook in src/hooks/queries/ read). That session **replaces** the
 * shared bar-tablet device session in this browser (ADR 0002 → Beslissing),
 * exactly like the password path already does client-side.
 *
 * A route handler, not a Server Component — exchangeCodeForSession() needs
 * to set cookies, which only a Route Handler/Server Action can do (Server
 * Components can only read them, see src/lib/supabase/server.ts's own
 * comment on that).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("beheer/callback: exchangeCodeForSession failed:", error.message);
      // Land back on /beheer regardless — useBeheerSession() resolves to
      // "signed-out" (no session was established) and the login form shows
      // again, same "formulier blijft staan" fallback as any other failed
      // login (docs/features/assortimentbeheer.md → Randgevallen).
    }
  }

  return NextResponse.redirect(new URL("/beheer", request.url));
}
