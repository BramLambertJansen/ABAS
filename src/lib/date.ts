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

const timeFormatter = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });

/** ISO-timestamp → kloktijd ("14:05"), display-only. Voor "sinds {tijd}" en
 *  "laatst actief om {tijd}" in de dienst-per-sessie-schermen (docs/features/
 *  dienst-per-sessie.md → Teksten). */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}
