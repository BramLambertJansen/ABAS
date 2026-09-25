import { NextResponse, type NextRequest } from "next/server";
import { createClient as createBarServerClient } from "@/lib/supabase/server";
import { createClient as createPortalServerClient } from "@/lib/supabase/portalServer";
import { linkInvitedMemberAccount } from "@/lib/linkInvitedMemberAccount";
import { linkLidMemberAccount } from "@/lib/linkLidMemberAccount";

/**
 * Gedeelde mail-callback voor zowel `/beheer` als `/portal` — docs/features/
 * portal-login.md → Schermflow → `/auth/callback` ("Besloten door Bram
 * (2026-09-25)", punt 3). Shell-onwetend by design: leeft niet onder
 * `src/app/portal/`/`src/app/(bar)/`/enige `src/shells/*`-map. Supabase kent
 * maar één Magic Link-sjabloon per project, dus die kan maar naar één URL
 * linken — deze route bevat zelf de vertakking naar `/beheer` of `/portal`.
 *
 * De enige plek in de codebase die zowel `@/lib/supabase/server` als
 * `@/lib/supabase/portalServer` mag importeren (ADR 0009 → Aanvulling,
 * `scripts/check-arch.mjs`) — nodig omdat de cliëntkeuze (welke cookienaam
 * de zo meteen tot stand komende sessie krijgt) vóór de sessie-uitwisseling
 * al vast moet staan: `@supabase/ssr` persisteert de sessie als bijeffect
 * van `verifyOtp`/`exchangeCodeForSession` zelf, naar de cookienaam van de
 * client waarmee die aanroep gebeurt. Binnen deze route wordt nooit meer dan
 * één van de twee clients voor dezelfde request gebruikt — gekozen op basis
 * van `next`, vóór de uitwisseling, en diezelfde instantie daarna ook voor
 * de koppel-RPC-aanroepen.
 *
 * **`?next=bar`/`?next=portal`, strikte allowlist.** Meegegeven door de
 * aanvragende pagina via `emailRedirectTo` (`useBeheerLogin.ts`/
 * `usePortalLogin.ts`), niet hier verzonnen. Elke andere waarde — of een
 * ontbrekende `next` (bv. een mail verstuurd vóórdat het Dashboard-sjabloon
 * is omgezet) — valt terug op `bar`, hetzelfde gedrag als `/beheer/callback`
 * vandaag altijd al had. Geen open redirect: alleen de twee letterlijke
 * waarden worden herkend, de bestemming zelf is een vast pad
 * (`/beheer`/`/portal`), nooit een uit de request overgenomen URL.
 *
 * Ná een geslaagde uitwisseling roept deze route best-effort **allebei** de
 * koppel-RPC's aan (`linkInvitedMemberAccount`/`linkLidMemberAccount`),
 * ongeacht `next` — `next` is alleen een UX-vertakking, geen
 * autorisatiebeslissing; elke RPC's eigen, harde `role`-filter bepaalt of er
 * iets te koppelen valt (spec → Schermflow → `/auth/callback`).
 *
 * Redirect altijd naar de gekozen bestemming, ongeacht de uitkomst van de
 * uitwisseling of de koppel-RPC's — fout gelogd, niet getoond, zelfde
 * "land regardless"-patroon als `/beheer/callback` vandaag.
 *
 * Naast `?code=` (PKCE) ook `?token_hash=&type=` (ADR 0008), zelfde vorm als
 * `/beheer/callback`.
 *
 * `src/app/(bar)/beheer/callback/route.ts` blijft, ongewijzigd, backward-
 * compat naast deze route bestaan (spec → Betrokken shell(s), punt 3) — geen
 * refactor, geen gedeelde helper.
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
  const nextParam = request.nextUrl.searchParams.get("next");

  // Strikte allowlist — alleen deze twee letterlijke waarden, al het andere
  // (inclusief ontbrekend) valt terug op "bar".
  const next = nextParam === "portal" ? "portal" : "bar";
  const destination = next === "portal" ? "/portal" : "/beheer";

  if (code || (tokenHash && isTokenHashType(type))) {
    // Cliëntkeuze vóór de sessie-uitwisseling (zie bestandscomment hierboven
    // voor waarom dit niet omgekeerd kan).
    const supabase =
      next === "portal" ? await createPortalServerClient() : await createBarServerClient();

    const { error } =
      tokenHash && isTokenHashType(type)
        ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        : await supabase.auth.exchangeCodeForSession(code as string);

    if (error) {
      console.error("auth/callback: session exchange failed:", error.message);
      // Land back on de bestemming regardless — usePortalSession()/
      // useBeheerSession() resolven naar "signed-out" (er kwam geen sessie
      // tot stand) en het inlogformulier toont weer, zelfde fallback als
      // elke andere mislukte login.
    } else {
      // Best-effort, nooit blokkerend — ongeacht `next` worden allebei de
      // koppel-RPC's geprobeerd (zie bestandscomment). Elke aanroep is een
      // stille no-op wanneer niet van toepassing.
      await linkInvitedMemberAccount(supabase);
      await linkLidMemberAccount(supabase);
    }
  }

  return NextResponse.redirect(new URL(destination, request.url));
}
