import type { LogboekEntry } from "@/hooks/queries/useLogboek";
// Relatief pad mét expliciete `.ts`-extensie, niet de gebruikelijke `@/lib/
// money` — dit bestand wordt (zoals src/features/verkoop/cart.ts en
// src/features/dienst-overzicht/ledger.ts) rechtstreeks door Node's
// ingebouwde testrunner geladen (test/logboek.test.ts), die de
// bundler-alias niet kent (zie test/money.test.ts se toelichting). Voor
// Next.js/`tsc` (moduleResolution "bundler", `allowImportingTsExtensions`)
// werkt dit pad identiek aan het alias-pad.
import { formatCents } from "../../lib/money.ts";

/**
 * Pure logica achter het Logboek-scherm (docs/features/logboek.md →
 * Schermflow / Datamodel): zoeken, filterchips, de actie-/detailtekst per
 * rij, en welke lege staat getoond wordt. Geen React, geen Supabase.
 */

export type LogboekFilterId = "alles" | "aandacht" | "geld" | "assortiment" | "leden";

/** Alle vijf chips zichtbaar (Bram's besluit, docs/features/logboek.md →
 *  "Besloten door Bram", punt 3) — Assortiment en Leden leveren nooit
 *  resultaten op, ze hebben vandaag geen databron (zie Datamodel aldaar). */
export const LOGBOEK_FILTERS: { id: LogboekFilterId; label: string }[] = [
  { id: "alles", label: "Alles" },
  { id: "aandacht", label: "Aandacht" },
  { id: "geld", label: "Geld" },
  { id: "assortiment", label: "Assortiment" },
  { id: "leden", label: "Leden" },
];

/** Filters zonder databron: altijd leeg, nooit een foutmelding (spec →
 *  Randgevallen: "Assortiment-/Leden-filter aangetikt"). */
const FILTERS_WITHOUT_DATABRON = new Set<LogboekFilterId>(["assortiment", "leden"]);

function matchesChip(entry: LogboekEntry, filter: LogboekFilterId): boolean {
  if (FILTERS_WITHOUT_DATABRON.has(filter)) return false;
  if (filter === "aandacht") return entry.reversal !== null;
  // "alles" en "geld": elke opgehaalde entry is al een geldbeweging (er is
  // geen andere soort entry in deze hook) — zie Datamodel.
  return true;
}

/** "12:05" in lokale tijd. */
export function clockLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type LogboekRow = {
  tag: "SALDO" | "LET OP";
  action: string;
  detail: string;
};

/** De categorietag + actie-/detailtekst voor één rij (spec → Schermflow
 *  §4). Een teruggedraaide bestelling krijgt de "LET OP"-tag en toont
 *  reden/wie/via in plaats van de itemtelling — precies de velden die
 *  `LogboekEntry.reversal` draagt. */
export function describeRow(entry: LogboekEntry): LogboekRow {
  if (entry.reversal) {
    const viaLabel = entry.reversal.via === "bar" ? "bar" : "beheer";
    return {
      tag: "LET OP",
      action: "Bestelling teruggedraaid",
      detail: `${entry.reversal.reason} · ${entry.reversal.reversedByName} · via ${viaLabel}`,
    };
  }
  if (entry.kind === "opwaardering") {
    return {
      tag: "SALDO",
      action: "Saldo opgewaardeerd",
      detail: `+${formatCents(entry.amountCents)} · ${entry.method ?? ""} · ${
        entry.memberName ?? "onbekend"
      }`,
    };
  }
  return {
    tag: "SALDO",
    action: "Bestelling op saldo",
    detail: `${entry.itemCount} ${entry.itemCount === 1 ? "item" : "items"} · ${
      entry.memberName ?? "Losse verkoop"
    }`,
  };
}

/** Zoeken over lidnaam, wie de boeking deed, productnamen en de getoonde
 *  actie-tekst (spec → Schermflow §2) — hoofdletterongevoelig, substring. */
function matchesQuery(entry: LogboekEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { action } = describeRow(entry);
  const haystack = [
    entry.memberName ?? "losse verkoop",
    entry.servedByName,
    ...entry.productNames,
    action,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Combineert chip + zoekterm over de al opgehaalde (org-brede, max 200)
 *  entries — geen server-side filterparameter (spec → RPC's/leeshook). */
export function filterLogboek(
  entries: LogboekEntry[],
  { query, filter }: { query: string; filter: LogboekFilterId }
): LogboekEntry[] {
  return entries.filter((entry) => matchesChip(entry, filter) && matchesQuery(entry, query));
}

/** "1 handeling" / "42 handelingen" / "3 van 42 handelingen" — kop-telling
 *  (spec → Schermflow §1, ontwerp regel 3116–3118). */
export function countLabel(filteredCount: number, totalCount: number): string {
  if (filteredCount === totalCount) {
    return totalCount === 1 ? "1 handeling" : `${totalCount} handelingen`;
  }
  return `${filteredCount} van ${totalCount} handelingen`;
}

export type LogboekEmptyState = { title: string; hint: string } | null;

/** Welke lege staat (indien enige) getoond wordt (spec → Schermflow §5,
 *  Randgevallen). Assortiment/Leden tonen altijd de "geen databron"-lege
 *  staat, ook als er org-breed wel andere boekingen bestaan — dat is geen
 *  "niets gevonden", er is domweg geen databron (spec → Randgevallen). */
export function logboekEmptyState(
  filter: LogboekFilterId,
  filteredCount: number,
  totalCount: number
): LogboekEmptyState {
  if (FILTERS_WITHOUT_DATABRON.has(filter)) {
    return {
      title: "Nog niets vastgelegd",
      hint: "elke handeling in de app komt hier te staan, met naam en tijd erbij",
    };
  }
  if (filteredCount > 0) return null;
  if (totalCount === 0) {
    return {
      title: "Nog niets vastgelegd",
      hint: "elke handeling in de app komt hier te staan, met naam en tijd erbij",
    };
  }
  return {
    title: "Niets gevonden",
    hint: "Andere filter of zoekterm probeert het opnieuw",
  };
}
