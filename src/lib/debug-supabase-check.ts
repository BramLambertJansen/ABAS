import { createClient } from "@/lib/supabase/server";

/**
 * TEMPORARY — connectivity smoke test only, not a feature. Confirms the
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY pair set
 * in Vercel actually authenticates against the project. Delete after use,
 * along with src/app/api/debug-supabase-check/route.ts.
 */
export async function debugSupabaseCheck() {
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").select("*").limit(1);
  return error ? { message: error.message, code: error.code } : null;
}
