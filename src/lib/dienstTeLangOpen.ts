/**
 * Pure beslislogica achter de melding "Dienst staat nog open"
 * (docs/features/dienst-te-lang-open.md → Pure logica). Geen React, geen
 * Supabase, geen `Date.now()`: "nu" komt binnen als argument, zodat dit met
 * vaste tijdstippen te testen is (test/dienstTeLangOpen.test.ts).
 *
 * Tijdmodel: `startedAtIso` is `shifts.started_at` van de server, `nowMs`
 * de klok van het tablet. Rekenen op absolute milliseconden, dus los van
 * tijdzone en zomer-/wintertijd.
 */

/** Drempel: 6 uur na `started_at` (spec → besluit 1, vaste constante). */
export const SHIFT_OPEN_WARNING_AFTER_MS = 6 * 60 * 60 * 1000;

/** Rust na "Nog bezig": één uur, gerekend vanaf de tik (besluiten 3 en 6). */
export const SHIFT_OPEN_SNOOZE_MS = 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

function elapsedMs(startedAtIso: string, nowMs: number): number {
  return nowMs - Date.parse(startedAtIso);
}

/** Hele uren sinds de start (naar beneden afgerond), nooit onder 0 — een
 *  tabletklok die achterloopt op de server geeft vlak na de start anders
 *  een negatief getal (spec → Tijdbron, klokverschil). */
export function openHours(startedAtIso: string, nowMs: number): number {
  return Math.max(0, Math.floor(elapsedMs(startedAtIso, nowMs) / HOUR_MS));
}

/** Of de melding aan de beurt is. Of er intussen een andere overlay open
 *  is, hoort hier bewust niet in (spec → Pure logica). Beide grenzen zijn
 *  inclusief (≥). */
export function shouldWarn({
  startedAtIso,
  nowMs,
  snoozedAtMs,
}: {
  startedAtIso: string;
  nowMs: number;
  snoozedAtMs: number | null;
}): boolean {
  if (elapsedMs(startedAtIso, nowMs) < SHIFT_OPEN_WARNING_AFTER_MS) return false;
  return snoozedAtMs === null || nowMs - snoozedAtMs >= SHIFT_OPEN_SNOOZE_MS;
}
