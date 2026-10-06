import { parseEuroToCents } from "./money.ts";

/**
 * Gedeeld beleid voor opslaan, sluiten en gelijktijdige acties
 * (docs/features/opslaan-sluiten-pending.md, #126). Alleen pure logica en
 * teksten; de React-kant staat in `src/hooks/useOpslaanBlokkade.ts`,
 * `src/components/OpslaanSectie.tsx` en `src/components/Overlay.tsx`.
 */

/** Hoe lang een verzoek pending mag zijn voor `closeBlocked` valt en de
 *  uitkomst als onbekend geldt (besloten door Bram: 30 seconden). */
export const PENDING_TIMEOUT_MS = 30_000;

// Teksten uit de spec (vraag D, goedgekeurd als uitgangspunt).
export const OPSLAAN_BEZIG_TEKST = "Opslaan…";
export const WACHT_OP_ANDERE_WIJZIGING_TEKST = "wacht tot de lopende wijziging klaar is";
export const WEGGOOIEN_VRAAG = "Niet-opgeslagen wijziging weggooien?";
export const WEGGOOIEN_KNOP = "Weggooien";
export const WEGGOOIEN_TERUG_KNOP = "Terug";

/** Onbekende financiële uitkomst: expliciet herstel met dezelfde bewaarde
 * UUID. Een ontbrekende receipt sluit een vertraagd verzoek niet uit;
 * alleen een bevestigde receipt of annuleringsbewijs geeft zekerheid. */
export const ONBEKENDE_UITKOMST_GELD_TEKST =
  "De uitkomst is onbekend. Controleer het eerdere resultaat, rond dezelfde actie veilig af of annuleer de onbevestigde actie definitief.";
/** Historische tekst uit T06; huidige geldacties gebruiken serverherstel. */
export const GECONTROLEERD_KNOP = "Ik heb gecontroleerd";

/** Zelfde situatie bij een beheeractie zonder geld (time-out). */
export const ONBEKENDE_UITKOMST_TEKST =
  "De uitkomst is onbekend. Controleer eerst de actuele gegevens voordat je opnieuw probeert.";

/** Serialisatie per object: er loopt hoogstens één schrijfactie tegelijk. */
export function isBezig(...pending: boolean[]): boolean {
  return pending.some(Boolean);
}

/** Mag een actie nu starten? Niet als er een andere (of dezelfde) loopt. */
export function magActieStarten(bezig: boolean): boolean {
  return !bezig;
}

/** Tekstveld (naam, e-mail): onopgeslagen als het afwijkt van de laatst
 *  opgeslagen waarde (na trimmen). */
export function isTekstOnopgeslagen(invoer: string, opgeslagen: string): boolean {
  return invoer.trim() !== opgeslagen.trim();
}

/** Rol: onopgeslagen als de keuze afwijkt van de huidige rol. */
export function isKeuzeOnopgeslagen<T>(keuze: T, opgeslagen: T): boolean {
  return keuze !== opgeslagen;
}

/** Prijs: onopgeslagen als het veld niet leeg is en niet gelijk aan de
 *  huidige prijs (een onleesbare invoer telt als ingevuld). */
export function isPrijsOnopgeslagen(invoer: string, huidigeCenten: number): boolean {
  if (invoer.trim() === "") return false;
  return parseEuroToCents(invoer) !== huidigeCenten;
}

/** Nieuw lid/product: elk ingevuld veld is onopgeslagen. `null` en `undefined`
 *  (nog geen categorie gekozen) tellen als leeg. */
export function isNieuwOnopgeslagen(velden: ReadonlyArray<string | null | undefined>): boolean {
  return velden.some((veld) => veld != null && veld.trim() !== "");
}

/** Zichtbare opslagstatus van één sectie in een groot formulier
 *  (docs/features/beheerformulieren-catalogus.md, besluit 5). */
export type SectieStatus = "onopgeslagen" | "opgeslagen" | null;

/** Een fout vervangt de status (de foutregel staat bij de sectie zelf);
 *  anders wint "niet opgeslagen" van "opgeslagen" zodra de invoer weer
 *  afwijkt; "opgeslagen" blijft staan tot de invoer wijzigt (de aanroeper
 *  wist `gelukt` dan) of de dialoog sluit. */
export function sectieStatus(opties: {
  onopgeslagen: boolean;
  gelukt: boolean;
  fout: boolean;
}): SectieStatus {
  if (opties.fout) return null;
  if (opties.onopgeslagen) return "onopgeslagen";
  if (opties.gelukt) return "opgeslagen";
  return null;
}
