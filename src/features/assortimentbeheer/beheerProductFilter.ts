/**
 * Zoeken en statusfilter van de productenlijst in beheer
 * (docs/features/beheerformulieren-catalogus.md, besluit 7 en 11). Puur en
 * unit-getest. Zelfde normalisatie als de verkoopzoeker en `LedenLijst`:
 * trim, lowercase, substring (geen accentnormalisatie). Behoudt de volgorde
 * van de server (categorie, naam).
 */

export type BeheerProductStatus = "actief" | "uit";

export type BeheerProductFilterInvoer = { name: string; category: string; archived: boolean };

export type LeegReden = "geen-producten" | "geen-treffers" | "leeg-filter" | null;

function normaliseer(term: string): string {
  return term.trim().toLowerCase();
}

function matchtZoekterm(p: { name: string; category: string }, term: string): boolean {
  if (!term) return true;
  return p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term);
}

function matchtStatus(p: { archived: boolean }, status: BeheerProductStatus): boolean {
  return status === "uit" ? p.archived : !p.archived;
}

export function filterBeheerProducten<P extends BeheerProductFilterInvoer>(
  producten: P[],
  { query, status }: { query: string; status: BeheerProductStatus }
): P[] {
  const term = normaliseer(query);
  return producten.filter((p) => matchtZoekterm(p, term) && matchtStatus(p, status));
}

/** Tellers per chip; volgen de zoekterm. */
export function telPerStatus(
  producten: BeheerProductFilterInvoer[],
  query: string
): Record<BeheerProductStatus, number> {
  const term = normaliseer(query);
  const result: Record<BeheerProductStatus, number> = { actief: 0, uit: 0 };
  for (const p of producten) {
    if (!matchtZoekterm(p, term)) continue;
    result[p.archived ? "uit" : "actief"] += 1;
  }
  return result;
}

/** Waarom de uitkomst leeg is; `null` als er iets te tonen valt. */
export function leegReden(
  producten: BeheerProductFilterInvoer[],
  { query, status }: { query: string; status: BeheerProductStatus }
): LeegReden {
  if (producten.length === 0) return "geen-producten";
  if (filterBeheerProducten(producten, { query, status }).length > 0) return null;
  return normaliseer(query) !== "" ? "geen-treffers" : "leeg-filter";
}
