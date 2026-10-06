/**
 * Betaalmethode zoals de gebruiker hem ziet. Vandaag is alles wat in
 * `top_ups.method` staat "cash" (opwaarderen.md: uitsluitend contant); deze
 * mapping bestaat zodat de rauwe database-waarde nooit op het scherm komt en
 * een toekomstige tweede methode niet als "cash" verschijnt.
 */
export function methodLabel(method: string | null): string {
  if (!method) return "";
  return method === "cash" ? "contant" : method;
}
