// Relatief pad mét `.ts`-extensie: dit bestand wordt ook rechtstreeks door
// Node's testrunner geladen (test/date.test.ts), die de `@/`-alias niet kent.
import { PORTAL_TIME_ZONE } from "./verversen.ts";

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

// ── Vaste zone (Europe/Amsterdam) ───────────────────────────────────────
// Dag, dagkop en kloktijd van gedeelde historie (Logboek, beheer-bestel-
// lingen) volgen altijd de Nederlandse klok, niet het apparaat of de
// CI-runner (docs/features/logboek-chronologisch-reikwijdte.md, besluit 7).
// Eén zone-constante: `PORTAL_TIME_ZONE` in verversen.ts.

const dagPartsFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: PORTAL_TIME_ZONE,
});
const dagKopFormatter = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: PORTAL_TIME_ZONE,
});
const jaarFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  timeZone: PORTAL_TIME_ZONE,
});
const klokFormatter = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: PORTAL_TIME_ZONE,
});

function jaarVan(date: Date): string {
  return jaarFormatter.format(date);
}

/** Dagsleutel "yyyy-mm-dd" in Nederlandse tijd. */
export function dagSleutel(iso: string): string {
  const parts = dagPartsFormatter.formatToParts(new Date(iso));
  const waarde = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${waarde("year")}-${waarde("month")}-${waarde("day")}`;
}

/** "dinsdag 29 september", met het jaar erbij ("... 2025") als dat niet het
 *  jaar van `nu` is (beide in Nederlandse tijd). `nu` is een parameter zodat
 *  tests deterministisch zijn. */
export function dagKop(iso: string, nu: Date): string {
  const date = new Date(iso);
  const kop = dagKopFormatter.format(date);
  const jaar = jaarVan(date);
  return jaar === jaarVan(nu) ? kop : `${kop} ${jaar}`;
}

/** "14:05" in Nederlandse tijd (24-uursklok). */
export function klokTijd(iso: string): string {
  return klokFormatter.format(new Date(iso));
}
