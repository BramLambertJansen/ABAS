/**
 * Resolve-hook voor test/barRoleMessages.test.ts (geregistreerd via
 * node:module → register(), geen dependency; zelfde aanpak als
 * resolve-hooks.mjs). Node kent de tsconfig-alias `@/` niet; de
 * messages-modules importeren src/lib/staff.ts en src/lib/money.ts via die
 * alias. Hier wijst `@/x` naar het échte `src/x.ts` — geen nep-module, de
 * test moet juist de echte NO_BAR_ROLE_SESSION_MESSAGE zien.
 */
const SRC = new URL("../../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC).href, context);
  }
  return nextResolve(specifier, context);
}
