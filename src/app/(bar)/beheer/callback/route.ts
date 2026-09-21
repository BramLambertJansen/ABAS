import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkInvitedMemberAccount } from "@/lib/linkInvitedMemberAccount";

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
 *
 * (Herzien, 2026-09-21, PR #62-review, Bug 1-fix): ná een geslaagde
 * exchangeCodeForSession(), vóór de redirect, roept deze route
 * onvoorwaardelijk `link_invited_member_account()` aan met de zojuist tot
 * stand gekomen sessie — docs/features/lid-account-invite.md →
 * "Koppelmechanisme bij acceptatie". Best-effort: draait op *elke* geslaagde
 * /beheer-login (niet alleen invite-acceptaties, ADR 0002/0003), een fout of
 * no-op-resultaat verandert niets aan de bestaande redirect-flow.
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
    } else {
      // Best-effort, nooit blokkerend (spec → "Koppelmechanisme bij
      // acceptatie"): geen wijziging aan de redirect hieronder, ongeacht wat
      // deze RPC teruggeeft of gooit — een gewone her-login van een al
      // gekoppeld lid raakt deze RPC ook, en moet stil een no-op blijven.
      // De aanroep zelf leeft in src/lib/ (check:policy) — deze route mag
      // geen rechtstreekse supabase.rpc()-aanroep bevatten.
      await linkInvitedMemberAccount(supabase);
    }
  }

  return NextResponse.redirect(new URL("/beheer", request.url));
}
