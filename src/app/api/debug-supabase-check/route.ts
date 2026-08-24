import { debugSupabaseCheck } from "@/lib/debug-supabase-check";

// TEMPORARY — see src/lib/debug-supabase-check.ts.
export async function GET() {
  const supabaseError = await debugSupabaseCheck();

  return Response.json({
    envPresent: {
      url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      publishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    },
    supabaseError,
  });
}
