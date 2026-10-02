/**
 * Resolve-hook voor test/productImageRoute.test.ts (geregistreerd via
 * node:module → register(), zelfde aanpak als product-image-resolve.mjs en
 * resolve-hooks.mjs). De Route Handler (src/app/(bar)/beheer/
 * productafbeelding/route.ts) én de server-actie die hij aanroept
 * (src/lib/productImage.ts) draaien ongewijzigd, inclusief de echte
 * beeldverwerking; alleen de twee Supabase-clients gaan naar dezelfde
 * nep-modules als in test/productImage.test.ts. `@/lib/productImage` wijst
 * naar het échte bestand: Node kent de tsconfig-alias niet. `next/server`
 * heeft geen exports-map; Node vindt alleen `next/server.js`.
 */
const FAKES = {
  "@/lib/supabase/server": new URL("./supabaseServerProductImage.ts", import.meta.url).href,
  "@/lib/supabase/admin": new URL("./supabaseAdminProductImage.ts", import.meta.url).href,
};

const REAL = {
  "@/lib/productImage": new URL("../../src/lib/productImage.ts", import.meta.url).href,
};

const NEXT_ALIASES = {
  "next/server": "next/server.js",
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in FAKES) {
    return { url: FAKES[specifier], shortCircuit: true };
  }
  if (specifier in REAL) {
    return nextResolve(REAL[specifier], context);
  }
  if (specifier in NEXT_ALIASES) {
    return nextResolve(NEXT_ALIASES[specifier], context);
  }
  return nextResolve(specifier, context);
}
