/**
 * Resolve-hook voor test/beheerCallback.test.ts (geregistreerd via
 * node:module → register(), geen dependency). Node kent de tsconfig-alias
 * `@/` niet, en de callback-route importeert zijn Supabase-client via die
 * alias — hier wordt precies die ene import (plus de best-effort
 * koppel-RPC) omgeleid naar een nep-module in test/fakes/, zodat de route
 * zelf ongewijzigd en zonder database getest kan worden. `next/server`
 * heeft geen exports-map; Node vindt alleen `next/server.js`.
 *
 * server-only is een expliciete dependency (ADR 0021). Een test die een
 * gemarkeerde module echt laadt, gebruikt dezelfde lege module als Next.js
 * server-side. Geen globale react-server-conditie: die verandert React zelf.
 */
const FAKES = {
  "@/lib/supabase/server": new URL("./supabaseServer.ts", import.meta.url).href,
  "@/lib/linkInvitedMemberAccount": new URL("./linkInvitedMemberAccount.ts", import.meta.url).href,
};

const NEXT_ALIASES = {
  "server-only": "next/dist/compiled/server-only/empty.js",
  "next/server": "next/server.js",
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in FAKES) {
    return { url: FAKES[specifier], shortCircuit: true };
  }
  if (specifier in NEXT_ALIASES) {
    return nextResolve(NEXT_ALIASES[specifier], context);
  }
  return nextResolve(specifier, context);
}
