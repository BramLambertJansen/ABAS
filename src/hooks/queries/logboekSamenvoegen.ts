import type { LogboekEntry } from "./useLogboek";

/**
 * Pure samenvoeglogica van `useLogboek` (apart bestand zodat Node's
 * testrunner het kan laden zonder Supabase; zelfde reden als
 * `features/logboek/logboek.ts`). Geen bedragen: er wordt niets opgeteld.
 */

/** React-key en identiteit van een gebeurtenis: het soort hoort erbij, want
 *  een terugdraaiing en zijn verkoop delen het order-id. */
export function logboekKey(entry: Pick<LogboekEntry, "kind" | "id">): string {
  return `${entry.kind}:${entry.id}`;
}

/** Nieuwste eerst. Bij een gelijk tijdstip: een terugdraaiing boven zijn
 *  eigen verkoop (zelfde order-id), en voor de rest het grootste id eerst, zodat
 *  de volgorde deterministisch is. */
export function vergelijkLogboek(a: LogboekEntry, b: LogboekEntry): number {
  const verschil = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (verschil !== 0) return verschil;
  if (a.id === b.id && a.kind !== b.kind) {
    if (a.kind === "terugdraaiing") return -1;
    if (b.kind === "terugdraaiing") return 1;
  }
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
}

/** Voegt de bronnen samen, sorteert en kapt af op de nieuwste `limit`.
 *  Elke bron moet `limit + 1` nieuwste rijen leveren: `beperkt` is dan exact
 *  (`true` als er méér dan `limit` gebeurtenissen bestaan). */
export function voegLogboekSamen(
  bronnen: LogboekEntry[][],
  limit: number
): { entries: LogboekEntry[]; beperkt: boolean } {
  const alle = bronnen.flat().sort(vergelijkLogboek);
  return { entries: alle.slice(0, limit), beperkt: alle.length > limit };
}
