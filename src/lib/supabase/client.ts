import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. This file (and server.ts alongside it) is the
 * ONLY place allowed to import @supabase/supabase-js or @supabase/ssr —
 * enforced by `npm run check:arch`. Everything else goes through
 * src/hooks/queries/ or src/lib/, never `supabase.from()`/`.rpc()` directly
 * in a feature or shell component. See CLAUDE.md → Architectuurbeslissingen.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
