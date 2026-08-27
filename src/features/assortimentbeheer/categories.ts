/** The six category chips from the wireframe (designs/Bar App.dc.html,
 *  regel 1472) — a UI choice, not a schema constraint (`products.category`
 *  stays a free-text column, see docs/features/assortimentbeheer.md →
 *  Datamodel). No vrij tekstveld in this first build. */
export const PRODUCT_CATEGORIES = [
  "Bier",
  "Fris",
  "Wijn",
  "Snacks",
  "Sterke drank",
  "Warm",
] as const;
