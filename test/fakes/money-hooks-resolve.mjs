/**
 * Resolve-hook voor test/moneyHooksFoutlogging.test.ts (geregistreerd via
 * node:module → register(), geen dependency; zelfde aanpak als
 * resolve-hooks.mjs). usePlaceOrder.ts en useTopUp.ts draaien ongewijzigd;
 * alleen hun drie imports worden omgeleid naar nep-modules in test/fakes/,
 * zodat zichtbaar is of een domeinuitkomst wel of niet gemeld wordt
 * (docs/features/foutlogging.md → beslissing 3). Sinds dienst-per-sessie
 * importeren de hooks ook `@/lib/barSessie` (de zes sessiecodes en
 * `notifySessionCode`); die gaat naar een nep-module die het doorgeven
 * registreert.
 */
const FAKES = {
  "@/lib/moneyRequest": new URL("./moneyRequest.ts", import.meta.url).href,
  react: new URL("./react.ts", import.meta.url).href,
  "@/lib/supabase/client": new URL("./supabaseBrowserClient.ts", import.meta.url).href,
  "@/lib/clientErrors": new URL("./clientErrors.ts", import.meta.url).href,
  "@/lib/barSessie": new URL("./barSessie.ts", import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in FAKES) {
    return { url: FAKES[specifier], shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
