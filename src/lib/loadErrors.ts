/**
 * Gedeelde foutmelding voor de lees-hooks in src/hooks/queries/ (#68).
 * Tot 2026-09-28 eindigde elke fout daar op "Controleer de verbinding.",
 * ook toen de verbinding prima was en PostgREST een schemafout gaf
 * (incident #67, ontbrekende migratie) — dat stuurde bardienst en debugger
 * de verkeerde kant op.
 *
 * Twee categorieën, zelfde principe als voorheen: nooit de ruwe fout
 * (bericht, URL, stack) op het scherm. Wel de korte foutcode van
 * Postgres/PostgREST (`42P01`, `PGRST200`, `42501`), zodat een
 * bardienstlid hem kan doorgeven — dat is een vaste vocabulaire zonder
 * gebruikers- of servergegevens. De ruwe fout blijft voor console.error in
 * de hook zelf.
 */

export type LoadErrorKind = "network" | "server";

// Postgres SQLSTATE (5 tekens) of PostgREST (`PGRST` + 3 cijfers). Alles
// wat daar niet op lijkt komt niet op het scherm.
const SAFE_CODE_RE = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/;

// Browsers verschillen in de tekst van een mislukte fetch: Chrome "Failed
// to fetch", Firefox "NetworkError when attempting to fetch resource",
// Safari "Load failed". postgrest-js zet bij een mislukte fetch
// "TypeError: <die tekst>" in `message`, met een lege `code`.
const NETWORK_MESSAGE_RE = /failed to fetch|networkerror|load failed|network request failed|fetch failed|timed? ?out/i;

function field(err: unknown, key: string): unknown {
  return typeof err === "object" && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

export function classifyLoadError(err: unknown): { kind: LoadErrorKind; code: string | null } {
  const rawCode = field(err, "code");
  const code = typeof rawCode === "string" && rawCode !== "" ? rawCode : null;
  // Een code betekent dat de server heeft geantwoord: de verbinding werkt.
  if (code) return { kind: "server", code: SAFE_CODE_RE.test(code) ? code : null };

  const name = field(err, "name");
  const message = field(err, "message");
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    (typeof message === "string" && NETWORK_MESSAGE_RE.test(message))
  ) {
    return { kind: "network", code: null };
  }
  // Onbekend (bv. een bug in de mapping na een geslaagde query): niet de
  // verbinding de schuld geven.
  return { kind: "server", code: null };
}

/** `what` is de eerste zin, bv. "Kan de ledenlijst niet laden." */
export function loadErrorMessage(what: string, err: unknown): string {
  const { kind, code } = classifyLoadError(err);
  if (kind === "network") return `${what} Controleer de verbinding.`;
  const suffix = code ? ` (code ${code})` : "";
  return `${what} Er ging iets mis aan de serverkant — meld dit bij de beheerder${suffix}.`;
}
