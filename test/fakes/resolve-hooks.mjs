/**
 * Resolve-hook voor test/beheerCallback.test.ts (geregistreerd via
 * node:module → register(), geen dependency). Node kent de tsconfig-alias
 * `@/` niet, en de callback-route importeert zijn Supabase-client via die
 * alias — hier wordt precies die ene import (plus de best-effort
 * koppel-RPC) omgeleid naar een nep-module in test/fakes/, zodat de route
 * zelf ongewijzigd en zonder database getest kan worden. `next/server`
 * heeft geen exports-map; Node vindt alleen `next/server.js`.
 */
const FAKES = {
  "@/lib/supabase/server": new URL("./supabaseServer.ts", import.meta.url).href,
  "@/lib/linkInvitedMemberAccount": new URL("./linkInvitedMemberAccount.ts", import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in FAKES) {
    return { url: FAKES[specifier], shortCircuit: true };
  }
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  return nextResolve(specifier, context);
}
