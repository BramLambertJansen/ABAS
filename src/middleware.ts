import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
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
  const response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: { name: string; value: string; options?: CookieOptions }[]
          ) {
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
        await supabase.auth.signInWithPassword({ email, password });
      }
    }
  } catch (err) {
    // Missing/invalid Supabase config, network failure, wrong device
    // credentials — none of these should ever crash a page load. Log for
    // whoever's debugging, fall through to the unauthenticated response;
    // the affected screen's own error state takes it from there.
    console.error("middleware: device sign-in failed:", err);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!portal|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|apple-touch-icon.png).*)",
  ],
};
