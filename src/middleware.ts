import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Het oude koppelcookie van "tablet koppelen" (ADR 0011, vervangen door ADR
 * 0016). Het nieuwe apparaatcookie `abas_apparaat` is een ander cookie met een
 * andere betekenis en wordt niet hergebruikt; dit oude wordt bij de eerste
 * request weggehaald.
 */
const OUD_KOPPELCOOKIE_NAAM = "abas_tablet";

/**
 * Two unrelated jobs share this one file because Next.js only runs a single
 * middleware per project: the /design auth gate (see designPreviewGate
 * below) short-circuits first for that one route tree, everything else gets
 * the ordinary Supabase session refresh.
 *
 * Session refresh (`@supabase/ssr`'s standard middleware pattern): a bar or
 * beheer session lives in cookies, and its access token expires after
 * `jwt_expiry`. `getSession()` refreshes it when needed and this carries the
 * rotated cookies onto the response, so the browser and the Server
 * Components/Route Handlers of the same request see the same session. Since
 * dienst-per-sessie (ADR 0016) the middleware never signs anyone in: there is
 * no shared device account anymore, everyone logs in personally on the
 * namenlijst (src/lib/barLogin.ts) or via `/beheer`.
 *
 * Everything touching Supabase is wrapped so a broken or absent Supabase
 * config degrades to "let the request through" instead of a hard 500 on
 * every route — the affected screens have their own error states.
 *
 * Narrow, deliberate exception to "only src/lib/supabase/ imports the SDK"
 * (see scripts/check-arch.mjs) — middleware has its own request/response
 * cookie API, distinct from `next/headers`' `cookies()` that server.ts
 * relies on, so it can't reuse that helper. `shells/portal` is excluded by
 * the matcher below: it has its own cookie (ADR 0009).
 */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/design")) {
    return designPreviewGate(request);
  }

  // Every cookie @supabase/ssr sets (token refresh during getSession()) —
  // kept so it lands on `response`. Dropping a refreshed session cookie would
  // lose the rotated refresh token.
  const gezetteCookies: CookieToSet[] = [];
  let response = NextResponse.next({ request });

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
          // next/headers' cookies(), see server.ts — see the refreshed
          // session immediately) and `response` (so the browser gets it for
          // the next request). Standard @supabase/ssr middleware pattern.
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

    // getSession() reads the cookies and refreshes an expired access token;
    // it doesn't decide anything here. PostgREST still verifies the JWT on
    // every actual query, and every bar RPC checks the registered session.
    await supabase.auth.getSession();
  } catch (err) {
    // Missing/invalid Supabase config, network failure — none of these
    // should ever crash a page load. The affected screen's own error state
    // takes it from there.
    console.error("middleware: session refresh failed:", err);
  }

  if (request.cookies.has(OUD_KOPPELCOOKIE_NAAM)) {
    response.cookies.set(OUD_KOPPELCOOKIE_NAAM, "", { path: "/", maxAge: 0 });
  }

  return response;
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
