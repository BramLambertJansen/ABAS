/**
 * Is `id` het enige actieve activiteitstype
 * (docs/features/beheerformulieren-catalogus.md, besluit 9 en 11)? Afgeleid van
 * de geladen lijst; de server beslist, dit stuurt alleen de waarschuwing.
 */
export function isLaatsteActieveType(
  types: ReadonlyArray<{ id: string; archived: boolean }>,
  id: string
): boolean {
  const actief = types.filter((t) => !t.archived);
  return actief.length === 1 && actief[0].id === id;
}
