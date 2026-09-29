/**
 * Client-fouten centraal loggen (#94, docs/features/foutlogging.md, ADR 0015).
 *
 * Sinds #93 toont elke hook in src/hooks/queries/ een korte foutcode op het
 * scherm, maar de ruwe fout ging alleen naar `console.error` — en op een
 * bar-tablet kijkt niemand in die console. `reportClientError` schrijft
 * daarnaast een allowlist-regel naar `client_errors` via de RPC
 * `log_client_error` (0025_client_errors.sql); lezen gebeurt in Supabase
 * Studio.
 *
 * Wat er wél meegaat: hook, `kind`/`code` uit `classifyLoadError`
 * (loadErrors.ts), het pad zonder query-string, een telling en de build-SHA.
 * Wat er nooit meegaat: `message`, `details`/`hint`, stack, RPC-argumenten,
 * of wie er ingelogd is — een door de client aangeleverde tekst bewijst
 * niets en kan PII bevatten (spec → beslissing 2). De RPC valideert
 * dezelfde formaten; wat hier afkapt is alleen om geen zinloze aanroep te
 * doen.
 *
 * Geen `@supabase/*`-import en geen `supabase/client`/`portalClient`-import
 * hier: de hook geeft zijn eigen client mee (check:arch staat portalClient.ts
 * alleen in portal-bestanden toe, ADR 0009).
 */

import { classifyLoadError, type LoadErrorKind } from "./loadErrors.ts";

/** Herhalingen binnen dit venster tellen op in plaats van een eigen rij. */
export const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/** Bovengrens van `client_errors.occurrences` (0025). */
export const MAX_OCCURRENCES = 10000;

// Zelfde formaten als de check-constraints en de validatie in
// log_client_error (0025_client_errors.sql).
const HOOK_RE = /^use[A-Za-z]{1,60}$/;
const PATH_RE = /^\/[a-z/-]{0,100}$/;
const BUILD_RE = /^[0-9a-f]{7,40}$/;

/** Exact de argumenten van `log_client_error`, niets meer. */
export type ClientErrorPayload = {
  p_hook: string;
  p_kind: LoadErrorKind;
  p_code: string | null;
  p_path: string;
  p_occurrences: number;
  p_build: string | null;
};

/**
 * Alleen tekens die de RPC accepteert: query-string en fragment eraf, alles
 * buiten `a-z`, `/` en `-` weg (dus geen cijfers, `@` of `.`), afgekapt op
 * de lengte van het tabelformaat. Geen app-route heeft een dynamisch
 * segment met een id, dus in de praktijk verandert dit niets aan een echt
 * pad.
 */
export function sanitizePath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? "";
  const cleaned = withoutQuery.toLowerCase().replace(/[^a-z/-]/g, "");
  const rooted = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  return rooted.slice(0, 101);
}

/** `null` voor alles wat geen (afgekorte) Git-SHA is, ook een lege env. */
export function sanitizeBuild(build: string | undefined | null): string | null {
  return typeof build === "string" && BUILD_RE.test(build) ? build : null;
}

/**
 * Pure payload-bouwer: allowlist plus `classifyLoadError`. `err` wordt
 * alleen geclassificeerd, nooit doorgegeven. `null` als de hooknaam niet
 * aan het formaat voldoet (dan zou de RPC hem toch weigeren).
 */
export function buildClientErrorPayload(
  hook: string,
  err: unknown,
  pathname: string,
  build: string | undefined | null,
  occurrences = 1,
): ClientErrorPayload | null {
  if (!HOOK_RE.test(hook)) return null;
  const { kind, code } = classifyLoadError(err);
  const path = sanitizePath(pathname);
  return {
    p_hook: hook,
    p_kind: kind,
    p_code: code,
    p_path: PATH_RE.test(path) ? path : "/",
    p_occurrences: clampOccurrences(occurrences),
    p_build: sanitizeBuild(build),
  };
}

function clampOccurrences(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), MAX_OCCURRENCES);
}

// ── Dedupe ─────────────────────────────────────────────────────────────────

type DedupeEntry = { windowStart: number; pending: number };

/** Per (hook, kind, code); in geheugen per pagina-load. */
export type DedupeState = Map<string, DedupeEntry>;

export function createDedupeState(): DedupeState {
  return new Map();
}

export function dedupeKey(p: Pick<ClientErrorPayload, "p_hook" | "p_kind" | "p_code">): string {
  return `${p.p_hook}|${p.p_kind}|${p.p_code ?? ""}`;
}

/**
 * Registreert één optreden op `now` (ms). Geeft het aantal terug dat nú
 * gemeld moet worden, of `null` als het binnen het lopende venster valt en
 * alleen optelt. De eerste melding gaat direct (1); herhalingen binnen
 * {@link DEDUPE_WINDOW_MS} tellen op en gaan mee met de eerste melding ná
 * het venster, die zelf een nieuw venster start. Wat openstaat als de
 * pagina sluit gaat verloren — geen persistente buffer.
 */
export function registerOccurrence(state: DedupeState, key: string, now: number): number | null {
  const entry = state.get(key);
  if (!entry) {
    state.set(key, { windowStart: now, pending: 0 });
    return 1;
  }
  if (now - entry.windowStart < DEDUPE_WINDOW_MS) {
    entry.pending += 1;
    return null;
  }
  const count = clampOccurrences(entry.pending + 1);
  state.set(key, { windowStart: now, pending: 0 });
  return count;
}

/**
 * Een melding die niet aankwam: de telling loopt door. De optredens gaan
 * mee met de eerstvolgende melding na het venster — geen herhaalpoging.
 */
export function restoreOccurrences(state: DedupeState, key: string, occurrences: number): void {
  const entry = state.get(key);
  if (!entry) return;
  entry.pending = Math.min(entry.pending + occurrences, MAX_OCCURRENCES);
}

// ── Versturen ──────────────────────────────────────────────────────────────

/**
 * Het deel van een Supabase-client dat hier nodig is. Structureel getypt,
 * zodat src/lib/ geen `@supabase/*` hoeft te importeren.
 */
export type ClientErrorRpcClient = {
  rpc(fn: "log_client_error", args: ClientErrorPayload): PromiseLike<{ error: unknown }>;
};

/**
 * De client van de hook, of de `createClient`-functie zelf: in een
 * `catch` kan het aanmaken van de client juist de fout zijn geweest, en dan
 * moet ook dát hier gevangen worden in plaats van in de hook te gooien.
 */
export type ClientErrorClientSource = ClientErrorRpcClient | (() => ClientErrorRpcClient);

const dedupeState = createDedupeState();

// Next.js vervangt `process.env.NEXT_PUBLIC_*` bij de build door de waarde
// (next.config.mjs zet hem uit VERCEL_GIT_COMMIT_SHA); lokaal/CI leeg.
const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA;

function currentPathname(): string {
  return typeof window !== "undefined" ? window.location.pathname : "/";
}

/**
 * `console.error` voor lokaal debuggen, daarna fire-and-forget
 * `log_client_error`. Blokkeert niet, gooit nooit, en een mislukte melding
 * wordt niet opnieuw gemeld (geen lus). Alleen voor onverwachte fouten —
 * een domeinuitkomst die een RPC bewust teruggeeft (`insufficient_balance`
 * en dergelijke) hoort hier niet.
 */
export function reportClientError(client: ClientErrorClientSource, hook: string, err: unknown): void {
  logLocalError(hook, err);
  try {
    const payload = buildClientErrorPayload(hook, err, currentPathname(), BUILD);
    if (!payload) return;
    const key = dedupeKey(payload);
    const occurrences = registerOccurrence(dedupeState, key, Date.now());
    if (occurrences === null) return;
    payload.p_occurrences = occurrences;

    const restore = () => restoreOccurrences(dedupeState, key, occurrences);
    let pending: PromiseLike<{ error: unknown }>;
    try {
      const rpcClient = typeof client === "function" ? client() : client;
      pending = rpcClient.rpc("log_client_error", payload);
    } catch {
      // Synchroon falen (factory of rpc gooit): de telling is al
      // geregistreerd, dus teruggeven — anders valt deze fout 5 minuten weg.
      restore();
      return;
    }
    Promise.resolve(pending).then(
      ({ error }) => {
        if (error) restore();
      },
      restore,
    );
  } catch {
    // Nooit de hook laten vallen op het melden van zijn eigen fout.
  }
}

/**
 * Alleen `console.error`, voor hooks buiten scope (pre-sessie-hooks en
 * `signOut`-takken): daar is geen `authenticated`-sessie, dus de RPC zou
 * toch geweigerd worden (ADR 0015). Bestaat zodat de check:policy-regel
 * "geen kale `console.error` in src/hooks/queries/" overal kan gelden.
 */
export function logLocalError(label: string, err: unknown): void {
  console.error(`${label}:`, err);
}
