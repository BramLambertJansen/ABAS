/**
 * Resolve-hook voor test/inviteMember.test.ts (geregistreerd via node:module →
 * register(), zelfde aanpak als bar-login-resolve.mjs). src/lib/inviteMember.ts
 * draait ongewijzigd; alleen de twee Supabase-clients gaan naar nep-modules
 * in test/fakes/.
 */
const FAKES = {
  "@/lib/supabase/server": new URL("./supabaseServerInvite.ts", import.meta.url).href,
  "@/lib/supabase/admin": new URL("./supabaseAdminInvite.ts", import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in FAKES) {
    return { url: FAKES[specifier], shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
