import { parseEuroToCents } from "./money.ts";
import { isValidEmailFormat } from "./email.ts";

/**
 * Welke melding hoort bij een ongeldige invoer? Alleen classificatie: de
 * waarde zelf bepaalt `parseEuroToCents` (src/lib/money.ts, de enige parser).
 * Hier wordt nooit een bedrag berekend of doorgegeven; de uitkomst is alleen
 * een soort voor de bijpassende veldmelding
 * (docs/features/invoerfeedback-zoeken-filters.md → Veldfeedback).
 */
export type BedragFout =
  | "leeg"
  | "ongeldig"
  | "teveelDecimalen"
  | "negatief"
  | "nul"
  | "tehoog";

export type BedragOpties = {
  /** Een leeg veld is geldig (optioneel veld): `leeg` wordt dan nooit gegeven. */
  optioneel?: boolean;
  /** €0 is een geldige waarde (negatieflimiet, startsaldo); anders `nul`. */
  nulToegestaan?: boolean;
  /** Boven deze grens `tehoog` (alleen een UX-melding; de RPC dwingt af). */
  maxCents?: number;
};

export type BedragFoutZonderMax = Exclude<BedragFout, "tehoog">;

// Zonder `maxCents` bestaat `tehoog` niet: dan past de uitkomst in
// `bedragFoutTekst` zonder schermspecifieke tekst.
export function bedragFout(
  invoer: string,
  opties: BedragOpties & { maxCents: number }
): BedragFout | null;
export function bedragFout(
  invoer: string,
  opties?: Omit<BedragOpties, "maxCents">
): BedragFoutZonderMax | null;
export function bedragFout(
  invoer: string,
  { optioneel = false, nulToegestaan = false, maxCents }: BedragOpties = {}
): BedragFout | null {
  const tekst = invoer.trim();
  if (tekst === "") return optioneel ? null : "leeg";

  const cents = parseEuroToCents(tekst);
  if (cents !== null) {
    if (cents === 0 && !nulToegestaan) return "nul";
    if (maxCents !== undefined && cents > maxCents) return "tehoog";
    return null;
  }

  if (/^-\s*\d+([.,]\d*)?$/.test(tekst)) return "negatief";
  if (/^\d+[.,]\d{3,}$/.test(tekst)) return "teveelDecimalen";
  return "ongeldig";
}

/** `null` voor een leeg veld (optioneel of niets te controleren): alleen een
 *  ingevuld, niet-passend adres is `ongeldig`. */
export function emailFout(invoer: string): "ongeldig" | null {
  const tekst = invoer.trim();
  if (tekst === "") return null;
  return isValidEmailFormat(tekst) ? null : "ongeldig";
}

/** Meldingen per soort, goedgekeurd door Bram (2026-10-02). `tehoog` heeft hier
 *  geen tekst: de grens hoort bij het scherm (opwaarderen), dat de bestaande
 *  melding zelf toont. */
export function bedragFoutTekst(
  soort: BedragFoutZonderMax,
  veld: "bedrag" | "prijs" = "bedrag"
): string {
  switch (soort) {
    case "leeg":
      return veld === "prijs" ? "Vul een prijs in." : "Kies een bedrag of typ er een.";
    case "ongeldig":
      return "Vul een bedrag in zoals 5 of 5,50.";
    case "teveelDecimalen":
      return "Maximaal twee decimalen, bijvoorbeeld 5,50.";
    case "negatief":
      return "Het bedrag mag niet negatief zijn.";
    case "nul":
      return "Het bedrag moet meer dan € 0 zijn.";
  }
}

export const EMAIL_ONGELDIG_TEKST =
  "Dit lijkt geen e-mailadres. Controleer het adres, bijvoorbeeld naam@voorbeeld.nl.";

/** Verplichte namen delen hetzelfde lokale feedbackcontract. */
export const NAAM_VERPLICHT_TEKST = "Vul een naam in.";
