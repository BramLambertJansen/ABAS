/** ISO-timestamp → korte NL-datum ("21 sep 2026"), display-only — zelfde
 *  Intl-gebaseerde aanpak als money.ts's formatCents(). Gebruikt door
 *  LidBeherenOverlay.tsx's invitedAt-statusregel (docs/features/
 *  lid-account-invite.md → Leeshook/UI-wijzigingen). */
const formatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string): string {
  return formatter.format(new Date(iso));
}
