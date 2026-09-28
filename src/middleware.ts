import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  KOPPELCOOKIE_NAAM,
  barDeviceSecretUitEnv,
  besluitDeviceSessie,
  isCrossSiteNavigatie,
  isPadVrijgesteld,
  koppelcookieOpties,
  koppelpadNaarStart,
  maakKoppelcookie,
  moetKoppelcookieVerversen,
  soortSessie,
  verifieerKoppelcookie,
  type DeviceSessieBesluit,
} from "@/lib/tabletKoppeling";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Two unrelated jobs share this one file because Next.js only runs a single
 * middleware per project: the /design auth gate (see designPreviewGate
 * below) short-circuits first for that one route tree, everything else
 * falls through to the bar-tablet device login below.
 *
 * Shared bar-tablet device login (issue #32), only on a gekoppelde tablet
 * (docs/features/tablet-koppelen.md, ADR 0011). `shells/bar`'s RLS
 * policies only grant `authenticated` — without a session, every read this
 * shell's hooks (src/hooks/queries/) make is rejected. This is that
 * sign-in step: docs/ARCHITECTURE.md → "Shared bar-tablet session
 * mechanism". Since ADR 0011 it only happens for a browser that sends a
 * valid `abas_tablet` cookie (set by the server action on /koppel after the
 * BAR_DEVICE_SECRET code was entered). The full decision matrix — who gets
 * signed in, signed out, redirected to /koppel or reloaded same-site — is
 * the pure `besluitDeviceSessie()` in src/lib/tabletKoppeling.ts, unit-
 * tested there; this function only gathers its inputs and carries out the
 * result.
 *
 * Signing out is ALWAYS `signOut({ scope: "local" })`, never the default
 * `global`: a global sign-out revokes every session of the device account,
 * including the real tablet's, so a visitor with an old device cookie could
 * take the bar down mid-shift (verplicht reviewpunt, spec → Middleware).
 *
 * Cookie-based, via @supabase/ssr — the same session this sets is what
 * src/lib/supabase/{client,server}.ts read, so no hook needs to know this
 * exists. `shells/portal` is excluded by the matcher below: members
 * authenticate themselves there (magic link/password), no device account.
 *
 * Narrow, deliberate exception to "only src/lib/supabase/ imports the SDK"
 * (see scripts/check-arch.mjs) — middleware has its own request/response
 * cookie API, distinct from `next/headers`' `cookies()` that server.ts
 * relies on, so it can't reuse that helper.
 *
 * Everything touching Supabase is wrapped so a broken or absent Supabase
 * config degrades to "no session established, let the request through"
 * instead of a hard 500 on every route — the affected screens already have
 * their own error states (see e.g. useOpenShift). A gekoppelde tablet with
 * an unreachable Supabase therefore keeps those error states and is not
 * sent to /koppel. A missing/invalid BAR_DEVICE_SECRET makes every
 * koppeling invalid: fails closed.
 */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/design")) {
    return designPreviewGate(request);
  }

  const pad = request.nextUrl.pathname;
  const nu = Math.floor(Date.now() / 1000);
  const secret = barDeviceSecretUitEnv();
  const koppelcookie = request.cookies.get(KOPPELCOOKIE_NAAM)?.value;
  const koppelingGeldig = await verifieerKoppelcookie(koppelcookie, secret, nu);

  // Every cookie @supabase/ssr sets (sign-in, sign-out, token refresh
  // during getSession()) — kept so it can be carried over onto a redirect
  // or reload response too, not only onto `response`. Dropping a refreshed
  // session cookie there would lose the rotated refresh token.
  const gezetteCookies: CookieToSet[] = [];
  let response = NextResponse.next({ request });
  let besluit: DeviceSessieBesluit = "doorlaten";

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          // Cookies set here must land on both `request` (so *this* same
          // request's downstream Server Components — which read via
          // next/headers' cookies(), see server.ts — see the session
          // immediately) and `response` (so the browser gets it for the
          // next request). Standard @supabase/ssr middleware pattern.
          setAll(cookiesToSet: CookieToSet[]) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            gezetteCookies.push(...cookiesToSet);
            response = NextResponse.next({ request });
            for (const { name, value, options } of gezetteCookies) {
              response.cookies.set(name, value, options ?? {});
            }
          },
        },
      }
    );

    // getSession() reads cookies without a round-trip to Supabase — fine
    // here: it only decides what this middleware does for this browser.
    // A forged cookie only changes that decision for the forger's own
    // browser; PostgREST still verifies the JWT on every actual query.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    besluit = besluitDeviceSessie({
      sessie: soortSessie(
        session !== null,
        session?.user.email,
        process.env.SUPABASE_DEVICE_EMAIL
      ),
      koppelcookieAanwezig: koppelcookie !== undefined,
      koppelingGeldig,
      padVrijgesteld: isPadVrijgesteld(pad),
      crossSiteNavigatie: isCrossSiteNavigatie(request.headers),
    });

    if (besluit === "device-inloggen") {
      const email = process.env.SUPABASE_DEVICE_EMAIL;
      const password = process.env.SUPABASE_DEVICE_PASSWORD;
      if (email && password) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          // signInWithPassword() resolves with `error` for a rejected
          // login (wrong/disabled credentials) — it doesn't throw, so
          // the catch below never sees this. Without checking it
          // explicitly, a wrong device password failed silently.
          console.error("middleware: device sign-in rejected:", error.message);
        }
      }
    } else if (
      besluit === "uitloggen-en-doorlaten" ||
      besluit === "uitloggen-en-naar-koppelen"
    ) {
      // scope "local", NEVER global — see the header comment.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.error("middleware: device sign-out failed:", error.message);
      }
    }
  } catch (err) {
    // Missing/invalid Supabase config, network failure — none of these
    // should ever crash a page load. Log for whoever's debugging, fall
    // through to the unauthenticated response; the affected screen's own
    // error state takes it from there.
    console.error("middleware: device sign-in failed:", err);
  }

  let uitkomst: NextResponse;
  if (besluit === "same-site-herladen") {
    uitkomst = sameSiteHerladen();
  } else if (besluit === "naar-koppelen" || besluit === "uitloggen-en-naar-koppelen") {
    uitkomst = redirectNaar(request, "/koppel");
  } else if (koppelpadNaarStart(pad, koppelingGeldig)) {
    uitkomst = redirectNaar(request, "/");
  } else {
    uitkomst = response;
  }
  if (uitkomst !== response) {
    for (const { name, value, options } of gezetteCookies) {
      uitkomst.cookies.set(name, value, options ?? {});
    }
  }

  // Glijdende looptijd (spec → open vraag 1): a tablet in use gets a fresh
  // cookie at most once a day, so it never expires.
  if (koppelingGeldig && koppelcookie && moetKoppelcookieVerversen(koppelcookie, nu)) {
    try {
      const nieuw = await maakKoppelcookie(secret, nu);
      if (nieuw) {
        uitkomst.cookies.set(
          KOPPELCOOKIE_NAAM,
          nieuw,
          koppelcookieOpties(request.nextUrl.protocol === "https:")
        );
      }
    } catch (err) {
      console.error("middleware: koppelcookie verversen mislukt:", err);
    }
  }

  return uitkomst;
}

function redirectNaar(request: NextRequest, pad: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pad;
  url.search = "";
  return NextResponse.redirect(url, 307);
}

/**
 * `SameSite=Strict` doesn't send `abas_tablet` on a cross-site navigation
 * (a link from a mail or chat), and a 3xx back to the same URL stays
 * cross-site for SameSite. A meta refresh is a navigation from a document
 * on our own site, so the reload is same-origin and the cookie comes along.
 * No loop: the second request has `Sec-Fetch-Site: same-origin`. The page
 * carries no information and opens no session (spec → Randgevallen →
 * "Externe link").
 */
function sameSiteHerladen(): NextResponse {
  return new NextResponse(
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0"></head><body></body></html>',
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
}

/**
 * Auth gate for /design (docs/ARCHITECTURE.md → Bronmateriaal, "Open" — this
 * closes it). Not tied to Supabase/member auth: /design is a build-tool
 * preview of the design bundle, not a member- or beheerder-facing feature,
 * and no beheerder-role check exists yet anywhere else in the app to hang
 * this off — inventing one just to gate a prototype viewer would be
 * backwards. A single shared HTTP Basic Auth password is the smallest thing
 * that actually closes the hole, matching what the route protects: a design
 * mockup, not money or member data.
 *
 * `next dev` stays ungated — this exists for agents and Bram to look at
 * while building, and requiring a password there would just be friction
 * against its own purpose. Only a production build (`next build && next
 * start`, i.e. every real deploy including Vercel preview/production)
 * enforces it, and if DESIGN_PREVIEW_PASSWORD isn't set there, the route
 * 404s rather than silently staying open.
 */
function designPreviewGate(request: NextRequest): NextResponse {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const password = process.env.DESIGN_PREVIEW_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const suppliedPassword = readBasicAuthPassword(request.headers.get("authorization"));
  if (suppliedPassword === password) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ABAS design preview", charset="UTF-8"' },
  });
}

function readBasicAuthPassword(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const spaceIndex = authHeader.indexOf(" ");
  if (spaceIndex === -1) return null;
  // HTTP auth-scheme tokens are case-insensitive (RFC 7235) — a
  // standards-compliant client may send "basic" or "BASIC".
  if (authHeader.slice(0, spaceIndex).toLowerCase() !== "basic") return null;

  try {
    // atob() decodes base64 to a "binary string" — one JS char per byte,
    // Latin-1-style — but browsers encode Basic credentials as UTF-8 bytes
    // first. Reading atob()'s output directly would mangle any non-ASCII
    // character in the password, so re-decode those bytes as UTF-8 instead.
    // (atob, not Buffer: middleware runs on the Edge runtime, which has no
    // Node `Buffer` global.)
    const binary = atob(authHeader.slice(spaceIndex + 1));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const separator = decoded.indexOf(":");
    return separator === -1 ? decoded : decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    "/((?!portal|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|apple-touch-icon.png).*)",
  ],
};
