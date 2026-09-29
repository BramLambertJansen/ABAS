/**
 * Client-logica rond de persoonlijke bar-sessie (docs/features/
 * dienst-per-sessie.md, ADR 0016). Puur en zonder React of Supabase, zodat
 * `node --test` haar zonder nep-modules draait (test/barSessie.test.ts).
 *
 * De database is de waarheid: elke bar- en beheer-RPC weigert een sessie die
 * beëindigd, inactief, in de verkeerde modus of niet aan de dienst gekoppeld
 * is (require_session, 0028). Wat hier staat is de UX-helft daarvan: de
 * inactiviteitstijd als spiegel (zelfde verdeling als TOP_UP_MAX_CENTS), de
 * hartslag-throttle, het onthouden van "hervat bevestigd" en de herkenning
 * van de zes sessiecodes die overal één centrale afhandeling krijgen.
 *
 * Relatieve imports met `.ts`: dit bestand wordt ook door src/lib/
 * clientErrors.ts geladen, dat buiten Next.js (node --test) draait.
 */

/** Vaste inactiviteitstijd: 60 minuten (besloten, vraag 7/24). Spiegel van
 *  `bar_inactivity_limit()` in 0028; de guard in de database is de
 *  afdwinging, dit is de UX. */
export const BAR_INACTIVITY_LIMIT_MS = 60 * 60 * 1000;

/** Een tik of toets op een bar- of beheerscherm zet hooguit één keer per
 *  minuut een hartslag (`touch_bar_session`). */
export const HEARTBEAT_MIN_INTERVAL_MS = 60 * 1000;

/** Hoe vaak een actief scherm de toestand (`my_bar_state`) ververst. Dat is
 *  geen hartslag (de RPC schrijft niet): zo verschijnt "Je dienst is
 *  overgenomen" of een nieuwe beheerdermelding zonder dat iemand iets
 *  aanraakt. */
export const STATE_POLL_INTERVAL_MS = 30 * 1000;

// ── Sessiecodes ──────────────────────────────────────────────────────────

/** De zes foutcodes van de guards (0028): deze sessie kan niet (meer) in
 *  deze dienst werken. Bekende domeinuitkomsten, geen fouten: ze worden niet
 *  naar `client_errors` gelogd maar centraal afgehandeld. `no_bar_role`
 *  betekent sinds 0028 "het lid van deze bar-sessie is gearchiveerd of heeft
 *  geen bar-rol meer" (voorheen: "dit is een lid-sessie"). */
export const SESSION_ERROR_CODES = [
  "no_bar_session",
  "session_ended",
  "session_inactive",
  "wrong_mode",
  "no_bar_role",
  "session_not_on_shift",
] as const;

export type SessionErrorCode = (typeof SESSION_ERROR_CODES)[number];

/** Exacte vergelijking, geen prefix of hoofdletters — zelfde regel als de
 *  domeincodes in de hooks. */
export function isSessionErrorCode(value: unknown): value is SessionErrorCode {
  return typeof value === "string" && (SESSION_ERROR_CODES as readonly string[]).includes(value);
}

/** De sessiecode in een fout (PostgREST-fout of gegooide Error), of `null`. */
export function sessionCodeFromError(err: unknown): SessionErrorCode | null {
  if (typeof err !== "object" || err === null) return null;
  try {
    const message = (err as { message?: unknown }).message;
    return isSessionErrorCode(message) ? message : null;
  } catch {
    // Een vijandige fout met een `message`-getter die gooit: geen sessiecode.
    return null;
  }
}

/** De inline foutregel bij een sessiecode: leeg. De melding zelf ("Je bent
 *  uitgelogd", "Je dienst is overgenomen", ...) toont de centrale afhandeling
 *  (BarSessieProvider); een tweede tekst op het scherm eronder zou dezelfde
 *  gebeurtenis twee keer vertellen. */
export const SESSION_CODE_INLINE_MESSAGE = "";

export const SESSION_CODE_EVENT = "abas:bar-sessiecode";

/**
 * Meldt een sessiecode aan de centrale afhandeling (BarSessieProvider), die
 * de toestand ververst en zo nodig de melding toont. Een hook roept dit aan
 * in plaats van een eigen inline melding per scherm. Buiten de browser een
 * no-op.
 */
export function notifySessionCode(code: SessionErrorCode): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SessionErrorCode>(SESSION_CODE_EVENT, { detail: code }));
}

/** Luistert naar `notifySessionCode`; geeft de afmelder terug. */
export function onSessionCode(handler: (code: SessionErrorCode) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const code = (event as CustomEvent<unknown>).detail;
    if (isSessionErrorCode(code)) handler(code);
  };
  window.addEventListener(SESSION_CODE_EVENT, listener);
  return () => window.removeEventListener(SESSION_CODE_EVENT, listener);
}

// ── Hartslag en inactiviteit ─────────────────────────────────────────────

/** Mag er nu een hartslag? `lastSentAt` is het moment van de vorige (ms),
 *  `null` als er nog geen was. */
export function shouldSendHeartbeat(
  lastSentAt: number | null,
  now: number,
  minIntervalMs: number = HEARTBEAT_MIN_INTERVAL_MS
): boolean {
  return lastSentAt === null || now - lastSentAt >= minIntervalMs;
}

/** Hoeveel ms tot de sessie inactief is, gerekend vanaf de laatste
 *  activiteit; nooit negatief. Alleen voor de UX-timer: de server bepaalt
 *  het echt. */
export function msUntilInactive(
  lastActivityAt: number,
  now: number,
  limitMs: number = BAR_INACTIVITY_LIMIT_MS
): number {
  return Math.max(0, lastActivityAt + limitMs - now);
}

// ── Hervatten na browser dicht en weer open ──────────────────────────────

/** `sessionStorage`-sleutel: bestaat alleen zolang deze browserstart duurt.
 *  Een sessie zonder deze vlag is (na browser dicht en weer open) nog niet
 *  bevestigd, en de app vraagt eerst "Verder als {naam}?". */
export const RESUME_STORAGE_KEY = "abas.bar.bevestigd";

type StorageRead = Pick<Storage, "getItem">;
type StorageWrite = Pick<Storage, "setItem" | "removeItem">;

export function isResumeConfirmed(storage: StorageRead | null | undefined): boolean {
  try {
    return storage?.getItem(RESUME_STORAGE_KEY) === "1";
  } catch {
    // Storage geblokkeerd (privémodus e.d.): liever een keer te vaak vragen.
    return false;
  }
}

export function confirmResume(storage: StorageWrite | null | undefined): void {
  try {
    storage?.setItem(RESUME_STORAGE_KEY, "1");
  } catch {
    // Zie isResumeConfirmed.
  }
}

export function clearResume(storage: StorageWrite | null | undefined): void {
  try {
    storage?.removeItem(RESUME_STORAGE_KEY);
  } catch {
    // Zie isResumeConfirmed.
  }
}

/** De `sessionStorage` van deze browserstart, of `null` buiten de browser. */
export function browserSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// ── Welke melding bij een gesloten sessie of dienst ──────────────────────

/** De redenen waarvoor de app "Je bent uitgelogd" e.d. toont
 *  (docs/features/dienst-per-sessie.md → Teksten → Meldingen bij een gesloten
 *  sessie). De teksten zelf staan in src/features/bar-sessie/teksten.ts. */
export type SessieMeldingReden =
  | "inactief"
  | "inactief_met_dienst"
  | "overgenomen"
  | "afgesloten_door_beheerder"
  | "afgemeld"
  | "rol_gewijzigd"
  | "geen_sessie";

/**
 * Welke melding hoort bij een sessie die niet meer werkt? `status` en
 * `endReason` komen uit `my_bar_state()`. Een sessie die door de gebruiker
 * zelf is beëindigd (`uitgelogd`, `niet_hervat`) krijgt geen melding: die
 * uitkomst is de eigen actie.
 */
export function sessieMeldingReden(input: {
  status: "active" | "inactive" | "ended" | "no_role";
  endReason: string | null;
  leftShiftOpen: boolean;
}): SessieMeldingReden | null {
  const { status, endReason, leftShiftOpen } = input;
  if (status === "active") return null;
  if (status === "no_role") return "rol_gewijzigd";
  if (status === "inactive") return leftShiftOpen ? "inactief_met_dienst" : "inactief";
  switch (endReason) {
    case "inactief":
      return leftShiftOpen ? "inactief_met_dienst" : "inactief";
    case "afgemeld":
      return "afgemeld";
    case "geen_bar_rol":
      return "rol_gewijzigd";
    case "uitgelogd":
    case "niet_hervat":
      return null;
    default:
      return "geen_sessie";
  }
}
