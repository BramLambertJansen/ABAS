/**
 * Resolve-hook voor test/productImage.test.ts (geregistreerd via node:module →
 * register(), zelfde aanpak als invite-member-resolve.mjs). src/lib/
 * productImage.ts draait ongewijzigd, inclusief de echte beeldverwerking
 * (productImageProcessing.ts, `sharp`); alleen de twee Supabase-clients gaan
 * naar nep-modules in test/fakes/.
 */
const FAKES = {
  "@/lib/supabase/server": new URL("./supabaseServerProductImage.ts", import.meta.url).href,
  "@/lib/supabase/admin": new URL("./supabaseAdminProductImage.ts", import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in FAKES) {
    return { url: FAKES[specifier], shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
