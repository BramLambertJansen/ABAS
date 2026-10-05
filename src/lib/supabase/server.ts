import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Supabase client (Server Components / Route Handlers / Server
 * Actions). Same rule as client.ts — this pair is the only place allowed to
 * import the Supabase SDK. See CLAUDE.md → Architectuurbeslissingen.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
            // Called from a Server Component that can't set cookies — fine
            // as long as middleware refreshes the session, which this
            // scaffold doesn't have yet (single shared device session, see
            // docs/ARCHITECTURE.md "Dienst & bezetting").
          }
        },
      },
    }
  );
}
