import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two unrelated jobs share this one file because Next.js only runs a single
 * middleware per project: the /design auth gate (see designPreviewGate
 * below) short-circuits first for that one route tree, everything else
 * falls through to the bar-tablet device login below.
 *
 * Shared bar-tablet device login (issue #32). `shells/bar`'s RLS policies
 * only grant `authenticated` — without a session, every read this shell's
 * hooks (src/hooks/queries/) make is rejected, no matter how correct the
 * PIN/RPC logic is. This is that missing sign-in step:
 * docs/ARCHITECTURE.md → "Shared bar-tablet session mechanism".
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
 * Middleware runs on *every* matched request, including ones with no
 * Supabase env configured at all (e.g. this repo's own CI, which has none
 * — see check:a11y in .github/workflows/ci.yml). `createServerClient`
 * throws synchronously in that case; unhandled, that took the whole app
 * down (every route, every request) rather than just leaving a screen in
 * its own "can't load" state. Everything below is wrapped so a broken or
 * absent Supabase config degrades to "no session established" instead of
 * a hard 500 — the affected screens already have their own error states
 * (see e.g. useOpenShift) for exactly that case.
 */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/design")) {
    return designPreviewGate(request);
  }

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
          // next/headers' cookies(), see server.ts — see the session
          // immediately) and `response` (so the browser gets it for the
          // next request). Setting only the response, as an earlier
          // version of this file did, means a fresh sign-in wouldn't take
          // effect until a second page load. Standard @supabase/ssr
          // middleware pattern, not something specific to this app.
          setAll(
            cookiesToSet: { name: string; value: string; options?: CookieOptions }[]
          ) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options ?? {});
            }
          },
        },
      }
    );

    // getSession() reads cookies without a round-trip to Supabase — fine
    // here, this is only "is there any session to work with at all", not
    // a security check. Whatever the session grants is still enforced by
    // RLS server-side on every actual query, same as any other session.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
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
          // explicitly, a wrong device password failed silently: no log,
          // no session, every subsequent request just retried forever
          // with no visible sign anything was wrong.
          console.error("middleware: device sign-in rejected:", error.message);
        }
      }
    }
  } catch (err) {
    // Missing/invalid Supabase config, network failure — none of these
    // should ever crash a page load. Log for whoever's debugging, fall
    // through to the unauthenticated response; the affected screen's own
    // error state takes it from there.
    console.error("middleware: device sign-in failed:", err);
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
