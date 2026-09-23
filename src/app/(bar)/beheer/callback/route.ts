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
 *
 * (2026-09-23) Naast `?code=` (PKCE) accepteert deze route ook
 * `?token_hash=...&type=email` — de vorm die de Magic Link-mailtemplate van
 * het Supabase-project stuurt. PKCE werkt alleen in de browser die de link
 * aanvroeg (de code_verifier staat daar in een cookie): link aangevraagd op
 * de pc en geopend op de telefoon → exchange faalt → terug op het
 * inlogformulier. verifyOtp() met de token_hash heeft geen verifier nodig en
 * werkt dus op elk apparaat.
 */
const TOKEN_HASH_TYPES = ["email", "magiclink", "invite"] as const;
type TokenHashType = (typeof TOKEN_HASH_TYPES)[number];

function isTokenHashType(value: string | null): value is TokenHashType {
  return TOKEN_HASH_TYPES.includes(value as TokenHashType);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (code || (tokenHash && isTokenHashType(type))) {
    const supabase = await createClient();
    const { error } =
      tokenHash && isTokenHashType(type)
        ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        : await supabase.auth.exchangeCodeForSession(code as string);
    if (error) {
      console.error("beheer/callback: session exchange failed:", error.message);
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
