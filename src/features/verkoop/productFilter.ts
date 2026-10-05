/** Filter van het assortiment (docs/features/verkoop.md → Schermflow §1):
 *  een zoekterm (case-insensitive substring op naam, over alle categorieën)
 *  wint van de categorie zolang hij niet leeg is; zonder zoekterm geldt de
 *  categorie (`null` is "Alle"). Een zoekterm met alleen spaties telt als
 *  leeg. De UI wist de zoekterm bij een categorieklik, dus beide zijn zelden
 *  tegelijk gevuld; de functie blijft eenduidig voor het geval dat wel. */
export function filterProducten<P extends { name: string; category: string }>(
  producten: P[],
  zoekterm: string,
  categorie: string | null
): P[] {
  const term = zoekterm.trim().toLowerCase();
  if (term) return producten.filter((p) => p.name.toLowerCase().includes(term));
  return producten.filter((p) => categorie === null || p.category === categorie);
}
