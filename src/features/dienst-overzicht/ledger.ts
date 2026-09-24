import type { LedgerEntry } from "@/hooks/queries/useShiftLedger";

/**
 * Pure logica achter de transactielijst op het Dienst-scherm
 * (docs/features/dienst-overzicht.md → Transactielijst): zoeken, filteren
 * op medewerker, groeperen per uur. Geen React, geen Supabase — getest in
 * test/ledger.test.ts. Bedragen worden hier alleen opgeteld voor weergave
 * (de uur-kop), nooit ergens heen gestuurd.
 */

export const ALL_PEOPLE = "alle";

export type LedgerGroup = {
  /** Uniek per lokaal uurvak: datum + uur + UTC-offset. Alleen het uur is
   *  niet genoeg — een dienst die langer dan 24 uur open staat, of het
   *  dubbele uur bij de overgang naar wintertijd, zou dan boekingen uit
   *  verschillende uren samenvoegen. */
  key: string;
  /** "21" — het uur (lokale tijd) van alle boekingen in deze groep. */
  hour: string;
  /** "21:00 – 22:00" */
  label: string;
  entries: LedgerEntry[];
  orderCount: number;
  turnoverCents: number;
};

/** "21:05" in lokale tijd. */
export function clockLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Filtert op medewerker (`servedById`, of `ALL_PEOPLE`) en op een
 *  zoekterm die matcht op lidnaam, productnaam of soort boeking —
 *  hoofdletterongevoelig, zelfde substring-aanpak als het ontwerp. */
export function filterLedger(
  entries: LedgerEntry[],
  { query, personId }: { query: string; personId: string }
): LedgerEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (personId !== ALL_PEOPLE && entry.servedById !== personId) return false;
    if (!q) return true;
    const haystack = [
      entry.memberName ?? "losse verkoop",
      entry.kind,
      ...entry.productNames,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Een verkoop die meetelt als omzet: niet teruggedraaid
 *  (docs/features/bestelling-terugdraaien.md → Omzet). */
export function countsAsSale(entry: LedgerEntry): boolean {
  return entry.kind === "verkoop" && entry.reversal === null;
}

/** Groepeert opeenvolgende boekingen van hetzelfde uur. Verwacht de lijst
 *  al gesorteerd (nieuwste eerst, zoals useShiftLedger() hem levert).
 *  Teruggedraaide bestellingen blijven in de groep staan, maar tellen niet
 *  mee in omzet en aantal. */
export function groupByHour(entries: LedgerEntry[]): LedgerGroup[] {
  const groups: LedgerGroup[] = [];
  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const hour = String(d.getHours()).padStart(2, "0");
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${hour}-${d.getTimezoneOffset()}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const next = String((Number(hour) + 1) % 24).padStart(2, "0");
      group = {
        key,
        hour,
        label: `${hour}:00 – ${next}:00`,
        entries: [],
        orderCount: 0,
        turnoverCents: 0,
      };
      groups.push(group);
    }
    group.entries.push(entry);
    if (countsAsSale(entry)) {
      group.orderCount += 1;
      group.turnoverCents += entry.amountCents;
    }
  }
  return groups;
}

/** De keuzes voor het medewerkerfilter: iedereen die in deze dienst iets
 *  heeft geboekt, alfabetisch, met het aantal boekingen erbij. */
export function peopleWithCounts(
  entries: LedgerEntry[]
): { id: string; name: string; count: number }[] {
  const byId = new Map<string, { id: string; name: string; count: number }>();
  for (const entry of entries) {
    const existing = byId.get(entry.servedById);
    if (existing) existing.count += 1;
    else
      byId.set(entry.servedById, {
        id: entry.servedById,
        name: entry.servedByName,
        count: 1,
      });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

/** Aantal bestellingen ("bonnen") per medewerker, voor het
 *  bezettingsblok rechts. Opwaarderingen en teruggedraaide bestellingen
 *  tellen niet mee. */
export function ordersPerMember(entries: LedgerEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!countsAsSale(entry)) continue;
    counts.set(entry.servedById, (counts.get(entry.servedById) ?? 0) + 1);
  }
  return counts;
}

/** "45 min" / "2u 05m" — hoe lang de dienst al loopt. */
export function durationLabel(startedAtIso: string, nowMs: number): string {
  const minutes = Math.max(
    0,
    Math.round((nowMs - Date.parse(startedAtIso)) / 60000)
  );
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}u ${String(minutes % 60).padStart(2, "0")}m`;
}
