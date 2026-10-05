/**
 * Pure logica achter herstelbare leesfouten en actuele portaldata
 * (docs/features/leesfouten-herstel-actuele-data.md, T08 · #128): wanneer een
 * terugkeer naar het scherm ververst, het "Bijgewerkt om"-label, de vaste
 * teksten en de state-overgangen van de stale-while-revalidate-machine in de
 * portal-leeshooks. Geen React, geen Supabase, en nooit een bedrag: saldo en
 * transacties worden getoond zoals de server ze levert.
 */

/** Datum, maandgroep en klokkijd volgen altijd de Nederlandse klok, niet de
 *  tijdzone van het apparaat of de CI-runner (besluit 4, docs/features/
 *  portaltransacties-consistent.md): een boeking van 00:30 op 1 oktober hoort
 *  onder oktober, ook op een apparaat in een andere zone. */
export const PORTAL_TIME_ZONE = "Europe/Amsterdam";

/** Terugkeer ververst alleen als de laatste geslaagde lezing zo oud is
 *  (besluit 3). Geldt niet voor de knop, `online` of een tabwissel. */
export const MIN_VERVERS_INTERVAL_MS = 30_000;

export const VERVERS_TEKSTEN = {
  opnieuwProberen: "Opnieuw proberen",
  opnieuwProberenBezig: "Opnieuw proberen…",
  verversen: "Verversen",
  verversenBezig: "Bezig met verversen…",
} as const;

const tijdFormatter = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: PORTAL_TIME_ZONE,
});

/** "14:32" in Nederlandse tijd; `null` bij een ontbrekende of ongeldige waarde. */
export function tijdLabel(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return tijdFormatter.format(date);
}

/** "Bijgewerkt om 14:32"; `null` als er (nog) geen geldig tijdstip is. */
export function bijgewerktLabel(ms: number | null | undefined): string | null {
  const tijd = tijdLabel(ms);
  return tijd === null ? null : `Bijgewerkt om ${tijd}`;
}

/** "Verversen mislukt. Je ziet de gegevens van 14:32." (zonder tijd: zonder tweede zin). */
export function verversMisluktTekst(ms: number | null | undefined): string {
  const tijd = tijdLabel(ms);
  return tijd === null
    ? "Verversen mislukt."
    : `Verversen mislukt. Je ziet de gegevens van ${tijd}.`;
}

export type VerversBron = "zichtbaar" | "online";

/**
 * De beslisregel voor terugkeer (`visibilitychange` naar zichtbaar) en
 * verbindingherstel (`online`), besluit 3: een lopende lezing wordt nooit
 * opnieuw gestart; `online` ververst altijd; terugkeer alleen als er nog
 * nooit geladen is, de laatste poging mislukte, of de laatste geslaagde
 * lezing `minIntervalMs` of ouder is.
 */
export function moetVerversen(params: {
  laatsteSuccesMs: number | null;
  nuMs: number;
  minIntervalMs: number;
  bezig: boolean;
  laatsteMislukt: boolean;
  bron: VerversBron;
}): boolean {
  if (params.bezig) return false;
  if (params.bron === "online") return true;
  if (params.laatsteSuccesMs === null) return true;
  if (params.laatsteMislukt) return true;
  return params.nuMs - params.laatsteSuccesMs >= params.minIntervalMs;
}

/** Wat de portal-leeshooks laten zien over de laatste (achtergrond)lezing. */
export type VerversInfo = {
  /** Een lezing loopt (eerste ronde, retry vanuit fout of verversing). */
  bezig: boolean;
  /** Een verversing vanuit `ready` mislukte; de oude data blijft staan. */
  mislukt: boolean;
  /** Klokstand van het apparaat bij de laatste geslaagde lezing. */
  bijgewerktOp: number | null;
  /** Klasse-tekst (`loadErrorMessage`) bij `mislukt`, anders `null`. */
  message: string | null;
};

export type LezingState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; bezig: boolean }
  | {
      status: "ready";
      data: T;
      bijgewerktOp: number;
      bezig: boolean;
      mislukt: boolean;
      message: string | null;
    };

/** Begin van een ronde: vanuit `ready` blijft de data staan, vanuit `error`
 *  blijft de foutregel (met de knop) staan; alleen de eerste ronde is `loading`. */
export function lezingGestart<T>(state: LezingState<T>): LezingState<T> {
  if (state.status === "ready") return { ...state, bezig: true };
  if (state.status === "error") return { ...state, bezig: true };
  return state;
}

export function lezingGeslaagd<T>(data: T, nuMs: number): LezingState<T> {
  return { status: "ready", data, bijgewerktOp: nuMs, bezig: false, mislukt: false, message: null };
}

/** Een mislukte verversing vanuit `ready` houdt data en `ready`; een
 *  mislukte eerste ronde of retry is `error`. */
export function lezingMislukt<T>(state: LezingState<T>, message: string): LezingState<T> {
  if (state.status === "ready") return { ...state, bezig: false, mislukt: true, message };
  return { status: "error", message, bezig: false };
}

export function verversInfo<T>(state: LezingState<T>): VerversInfo {
  if (state.status === "ready") {
    return {
      bezig: state.bezig,
      mislukt: state.mislukt,
      bijgewerktOp: state.bijgewerktOp,
      message: state.message,
    };
  }
  return {
    bezig: state.status === "error" ? state.bezig : true,
    mislukt: false,
    bijgewerktOp: null,
    message: null,
  };
}

/** Laatste-request-wint (zelfde patroon als `useMijnDienst`): een antwoord
 *  van een oudere ronde, of van na `annuleer()` (unmount), telt niet. */
export type RondeGuard = {
  start: () => number;
  isActueel: (ronde: number) => boolean;
  annuleer: () => void;
};

export function maakRondeGuard(): RondeGuard {
  let huidig = 0;
  return {
    start: () => ++huidig,
    isActueel: (ronde) => ronde === huidig,
    annuleer: () => {
      huidig++;
    },
  };
}
