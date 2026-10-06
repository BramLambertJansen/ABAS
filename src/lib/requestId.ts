/**
 * Idempotentiesleutel per gebruikersintentie voor de geld-RPC's
 * (docs/features/idempotentie-geld-rpcs.md, ADR 0023): `place_order`,
 * `top_up` en `create_member` krijgen `p_request_id` mee, zodat een herhaald
 * verzoek met dezelfde bedoeling op de server hetzelfde resultaat geeft in
 * plaats van een tweede boeking.
 *
 * Eén bewuste actie is één sleutel, hergebruikt bij elke herpoging van
 * dezelfde opdracht; een andere opdracht krijgt een nieuwe sleutel. De
 * vingerafdruk hieronder kiest alleen *welke uuid* wordt hergebruikt: het is
 * geen bedrag en geen boekhoudkundige berekening, en de server dedupliceert
 * nooit op inhoud, alleen op de sleutel (en controleert zelf of de opdracht
 * bij de sleutel past).
 *
 * Het geheugen leeft in de hook (fase 1, besluit 6): een paginaherlaad
 * verliest de sleutel.
 */

/** Een uuid v4. `crypto.randomUUID()` bestaat alleen in een veilige context;
 *  `getRandomValues` ook op een bar-tablet die over gewoon http bereikt
 *  wordt. */
export function nieuweSleutel(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** De uitkomst van een poging, voor het geheugen: `onbekend` (netwerk- of
 *  onverwachte fout: de server kan het verzoek wél verwerkt hebben) houdt de
 *  sleutel vast; `definitief` (succes of een bekende domeinfout, waarbij de
 *  server alles terugdraaide) vergeet hem. */
export type PogingUitkomst = "onbekend" | "definitief";

export type SleutelGeheugen = {
  /** De sleutel voor deze opdracht: dezelfde als bij de vorige poging zolang
   *  de opdracht gelijk is en er geen definitieve uitkomst was, anders een
   *  nieuwe. */
  voorOpdracht(opdracht: readonly unknown[]): string;
  /** Meld de uitkomst van de poging die `voorOpdracht` bediende. */
  afgerond(uitkomst: PogingUitkomst): void;
};

export function maakSleutelGeheugen(genereer: () => string = nieuweSleutel): SleutelGeheugen {
  let huidige: { vingerafdruk: string; sleutel: string } | null = null;
  return {
    voorOpdracht(opdracht) {
      const vingerafdruk = JSON.stringify(opdracht);
      if (huidige === null || huidige.vingerafdruk !== vingerafdruk) {
        huidige = { vingerafdruk, sleutel: genereer() };
      }
      return huidige.sleutel;
    },
    afgerond(uitkomst) {
      if (uitkomst === "definitief") huidige = null;
    },
  };
}
