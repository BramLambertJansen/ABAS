import type { LogboekEntry } from "@/hooks/queries/useLogboek";
// Relatief pad mét expliciete `.ts`-extensie, niet de gebruikelijke `@/lib/
// money` — dit bestand wordt (zoals src/features/verkoop/cart.ts en
// src/features/dienst-overzicht/ledger.ts) rechtstreeks door Node's
// ingebouwde testrunner geladen (test/logboek.test.ts), die de
// bundler-alias niet kent (zie test/money.test.ts se toelichting). Voor
// Next.js/`tsc` (moduleResolution "bundler", `allowImportingTsExtensions`)
// werkt dit pad identiek aan het alias-pad.
import { formatCents } from "../../lib/money.ts";
import { methodLabel } from "../../lib/betaalmethode.ts";
import { dagKop, dagSleutel, klokTijd } from "../../lib/date.ts";

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
  // Aandacht = de terugdraai-gebeurtenissen (besluit 10 van
  // logboek-chronologisch-reikwijdte.md); de verkoop zelf valt er niet onder.
  if (filter === "aandacht") return entry.kind === "terugdraaiing";
  // "alles" en "geld": bewust identiek (Bram, #19) — alle gebeurtenissen.
  return true;
}

/** "12:05" in Nederlandse tijd (vaste zone, niet het apparaat). */
export const clockLabel = klokTijd;

export type LogboekRow = {
  tag: "SALDO" | "LET OP";
  action: string;
  detail: string;
  /** Verkoop die later is teruggedraaid: zichtbaar label "Teruggedraaid"
   *  (een status, geen gebeurtenis en geen bedrag). */
  statusLabel: string | null;
};

export const TERUGGEDRAAID_LABEL = "Teruggedraaid";

function joinDelen(delen: (string | null | undefined)[]): string {
  return delen.filter((d): d is string => !!d && d.trim().length > 0).join(" · ");
}

/** De categorietag + actie-/detailtekst voor één rij. Een terugdraaiing is
 *  een eigen gebeurtenis (LET OP) met de terugdraaier als actor; haar
 *  bedrag is `refunded_cents` zoals de database het levert. `nu` bepaalt
 *  alleen of het jaar in de verwijzing naar de oorspronkelijke bestelling
 *  staat. */
export function describeRow(entry: LogboekEntry, nu: Date): LogboekRow {
  if (entry.kind === "terugdraaiing" && entry.reversal) {
    const { reversal } = entry;
    const viaLabel = reversal.via === "bar" ? "bar" : "beheer";
    const verwijzing = reversal.originalCreatedAt
      ? `Bestelling van ${dagKop(reversal.originalCreatedAt, nu)} ${klokTijd(
          reversal.originalCreatedAt
        )} · ${entry.memberName ?? "Losse verkoop"}`
      : null;
    return {
      tag: "LET OP",
      action: "Bestelling teruggedraaid",
      detail: joinDelen([
        reversal.reason,
        `door ${entry.actorName} via ${viaLabel}`,
        `${formatCents(reversal.refundedCents)} teruggeboekt`,
        verwijzing,
      ]),
      statusLabel: null,
    };
  }
  if (entry.kind === "opwaardering") {
    return {
      tag: "SALDO",
      action: "Saldo opgewaardeerd",
      detail: joinDelen([
        `+${formatCents(entry.amountCents)}`,
        methodLabel(entry.method),
        entry.memberName ?? "onbekend",
      ]),
      statusLabel: null,
    };
  }
  return {
    tag: "SALDO",
    action: "Bestelling op saldo",
    detail: `${entry.itemCount} ${entry.itemCount === 1 ? "item" : "items"} · ${
      entry.memberName ?? "Losse verkoop"
    }`,
    statusLabel: entry.reversed ? TERUGGEDRAAID_LABEL : null,
  };
}

export type LogboekDag = { key: string; label: string; entries: LogboekEntry[] };

/** Groepeert aaneengesloten gebeurtenissen met dezelfde dag (Europe/
 *  Amsterdam). Verwacht de lijst al gesorteerd (nieuwste eerst) en
 *  herordent niet. */
export function groepeerPerDag(entries: LogboekEntry[], nu: Date): LogboekDag[] {
  const groepen: LogboekDag[] = [];
  for (const entry of entries) {
    const key = dagSleutel(entry.createdAt);
    let groep = groepen[groepen.length - 1];
    if (!groep || groep.key !== key) {
      groep = { key, label: dagKop(entry.createdAt, nu), entries: [] };
      groepen.push(groep);
    }
    groep.entries.push(entry);
  }
  return groepen;
}

/** Zoeken over lidnaam, wie de boeking deed, productnamen en de getoonde
 *  actie-tekst (spec → Schermflow §2) — hoofdletterongevoelig, substring. */
function matchesQuery(entry: LogboekEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // Alleen de actietekst telt, niet de datumverwijzing: `nu` is hier
  // irrelevant.
  const { action } = describeRow(entry, new Date(entry.createdAt));
  // De actor van een terugdraaiing is de terugdraaier; de oorspronkelijke
  // verkoper komt nergens in voor.
  const haystack = [
    entry.memberName ?? "losse verkoop",
    entry.actorName,
    ...entry.productNames,
    action,
    entry.reversal?.reason ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Combineert chip + zoekterm over de al opgehaalde (org-brede, meest recente) 
 *  entries — geen server-side filterparameter (spec → RPC's/leeshook). */
export function filterLogboek(
  entries: LogboekEntry[],
  { query, filter }: { query: string; filter: LogboekFilterId }
): LogboekEntry[] {
  return entries.filter((entry) => matchesChip(entry, filter) && matchesQuery(entry, query));
}

export type LogboekReikwijdte = { beperkt: boolean; limit: number };

/** "1 handeling" / "42 handelingen" / "3 van 42 handelingen"; bij een
 *  beperkt resultaat met "meest recente {limit}" erbij. */
export function countLabel(
  filteredCount: number,
  totalCount: number,
  { beperkt, limit }: LogboekReikwijdte = { beperkt: false, limit: 0 }
): string {
  if (beperkt) {
    return filteredCount === totalCount
      ? `meest recente ${limit} handelingen`
      : `${filteredCount} van de meest recente ${limit}`;
  }
  if (filteredCount === totalCount) {
    return totalCount === 1 ? "1 handeling" : `${totalCount} handelingen`;
  }
  return `${filteredCount} van ${totalCount} handelingen`;
}

export const REIKWIJDTE_TEKST = "Verkopen, opwaarderingen en terugdraaiingen van alle diensten.";

/** De reikwijdteregel onder de kop; bij `beperkt` zegt dezelfde regel dat
 *  er maar `limit` handelingen doorzocht zijn. */
export function reikwijdteTekst({ beperkt, limit }: LogboekReikwijdte): string {
  if (!beperkt) return REIKWIJDTE_TEKST;
  return `${REIKWIJDTE_TEKST} Alleen de meest recente ${limit} handelingen. Zoeken en filteren werkt alleen binnen die ${limit}.`;
}

export type LogboekEmptyState = { title: string; hint: string } | null;

/** Welke lege staat (indien enige) getoond wordt. Assortiment/Leden hebben
 *  geen databron en zeggen dat eerlijk, ook als er wél andere gebeurtenissen
 *  bestaan: geen belofte voor later. */
export function logboekEmptyState(
  filter: LogboekFilterId,
  filteredCount: number,
  totalCount: number,
  { beperkt, limit }: LogboekReikwijdte = { beperkt: false, limit: 0 }
): LogboekEmptyState {
  if (filter === "assortiment") {
    return {
      title: "Nog niet geregistreerd",
      hint: "Wijzigingen aan het assortiment worden nog niet in het logboek vastgelegd.",
    };
  }
  if (filter === "leden") {
    return {
      title: "Nog niet geregistreerd",
      hint: "Wijzigingen aan leden worden nog niet in het logboek vastgelegd.",
    };
  }
  if (filteredCount > 0) return null;
  if (totalCount === 0) {
    return {
      title: "Nog niets vastgelegd",
      hint: "Verkopen, opwaarderingen en terugdraaiingen komen hier te staan, met naam en tijd erbij.",
    };
  }
  return {
    title: "Niets gevonden",
    hint: beperkt
      ? `Niets gevonden in de meest recente ${limit} handelingen. Oudere staan niet in dit overzicht.`
      : "Andere filter of zoekterm probeert het opnieuw",
  };
}
