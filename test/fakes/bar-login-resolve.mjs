/**
 * Resolve-hook voor test/barLogin.test.ts (geregistreerd via node:module →
 * register(), zelfde aanpak als resolve-hooks.mjs). src/lib/barLogin.ts draait
 * ongewijzigd; alleen de Supabase-clients en `next/headers` gaan naar
 * nep-modules in test/fakes/. De overige `@/`-imports (apparaat, authErrors,
 * barLoginTypes) wijzen naar de échte modules in src/lib/.
 */
const FAKES = {
  "@/lib/supabase/server": new URL("./supabaseServerLogin.ts", import.meta.url).href,
  "@/lib/supabase/admin": new URL("./supabaseAdmin.ts", import.meta.url).href,
  "next/headers": new URL("./nextHeaders.ts", import.meta.url).href,
};
const SRC = new URL("../../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier in FAKES) {
    return { url: FAKES[specifier], shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC).href, context);
  }
  return nextResolve(specifier, context);
}
