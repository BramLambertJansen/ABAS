import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — server-only, bypasses RLS entirely. A
 * third, own file alongside client.ts/server.ts (not an extra mode on
 * either), per ADR 0006 → Beslissing: this is the ONLY file allowed to read
 * `SUPABASE_SECRET_KEY`/construct a client with it. `check:arch` already
 * allows this (it scans by directory prefix — every file under
 * src/lib/supabase/ may import the SDK — not a fixed two-file allowlist),
 * but the split from client.ts/server.ts is a deliberate discipline choice,
 * not something the gate forces: a single function that sometimes uses the
 * publishable key and sometimes the secret key would make "does this bypass
 * RLS" a property of an argument instead of the import itself.
 *
 * The `import "server-only"` marker above makes `next build` fail on any
 * import from client code, also an indirect one (via barLogin.ts,
 * inviteMember.ts, productImage.ts, …), and `check:arch` checks the same
 * thing transitively (ADR 0021). Only used for
 * `supabase.auth.admin.*` calls (currently `inviteUserByEmail`) and, once
 * the aanroeper is already authorized (see src/lib/inviteMember.ts), a
 * plain read of the target member — never for a `members` write, which
 * always goes back through a session-bound RPC call (ADR 0006 → Beslissing
 * punt 3, `auth.uid()` is empty on this client).
 *
 * Second kind of use (ADR 0018): Storage writes — uploading and removing
 * objects in the `product-images` bucket from src/lib/productImage.ts, after
 * that file has verified the caller with the session-bound client.
 * storage.objects has no write policy for any API role, so this client is
 * the only way in. The reference in the database (`products.image_path`)
 * still goes through a session-bound RPC (`set_product_image`), never
 * through this client.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
