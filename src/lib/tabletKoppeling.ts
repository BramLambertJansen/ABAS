import "server-only";

/**
 * Tablet koppelen (docs/features/tablet-koppelen.md, ADR 0011): de gedeelde
 * device-sessie komt alleen tot stand op een browser die een geldig
 * koppelcookie `abas_tablet` meestuurt. Dit bestand bevat alles wat daarvoor
 * nodig is behalve de request/response-afhandeling zelf: het secret lezen en
 * valideren, het cookie ondertekenen en verifiëren, de ingevoerde code
 * controleren, en de pure beslisfunctie voor `src/middleware.ts`.
 *
 * `import "server-only"`: `BAR_DEVICE_SECRET` mag nooit in een clientbundel
 * belanden; een import vanuit clientcode geeft een buildfout. Alleen Web
 * Crypto (`crypto.subtle`), geen `node:crypto`: dezelfde code draait in de
 * middleware (Edge) en in de server-actie (Node).
 *
 * Reviewpunt (ADR 0011 → Gevolgen): nergens `===` op secret, code of
 * handtekening. Vergelijken gebeurt via `crypto.subtle.verify`, dat in
 * constante tijd vergelijkt.
 */

export const KOPPELCOOKIE_NAAM = "abas_tablet";

/** Chromium begrenst elke cookievervaldatum op 400 dagen (open vraag 1). */
export const KOPPELCOOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

/** Glijdende looptijd: hooguit één keer per dag een nieuw cookie. */
export const KOPPELCOOKIE_VERVERS_NA_S = 24 * 60 * 60;

/** Toegestaan klokverschil voor een `iat` in de toekomst. */
export const MAX_KLOKVERSCHIL_S = 5 * 60;

/**
 * Formaat van `BAR_DEVICE_SECRET` (open vraag 4): 26 tekens base32
 * (RFC 4648, A–Z en 2–7), 26 × 5 = 130 bit. Groepjes met streepjes of
 * spaties en hoofd-/kleine letters maken niet uit.
 */
export const SECRET_MIN_LENGTE = 26;
const BASE32 = /^[A-Z2-7]+$/;

const VERSIE = "v1";
const SLEUTEL_LABEL = "abas-tablet-cookie-sleutel-v1";
const NONCE_BYTES = 16;

const encoder = new TextEncoder();

/** Hoofdletterongevoelig; streepjes en witruimte tellen niet mee. */
export function normaliseerCode(invoer: string): string {
  return invoer.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Het genormaliseerde secret, of `null` als het ontbreekt of niet aan het
 * formaat voldoet (te kort, of tekens buiten base32 — dan klopt de
 * entropieberekening van 5 bit per teken niet meer). `null` betekent overal:
 * dicht. Geen koppeling, geen device-sessie.
 */
export function geldigSecret(secret: string | undefined | null): string | null {
  if (!secret) return null;
  const genormaliseerd = normaliseerCode(secret);
  if (genormaliseerd.length < SECRET_MIN_LENGTE || !BASE32.test(genormaliseerd)) {
    return null;
  }
  return genormaliseerd;
}

let configuratiefoutGemeld = false;

/**
 * `process.env.BAR_DEVICE_SECRET`, met precies één `console.error` per
 * serverinstantie als het ontbreekt of ongeldig is (spec → Configuratie).
 * Het secret zelf wordt nooit gelogd.
 */
export function barDeviceSecretUitEnv(): string | undefined {
  const secret = process.env.BAR_DEVICE_SECRET;
  if (geldigSecret(secret) === null && !configuratiefoutGemeld) {
    configuratiefoutGemeld = true;
    console.error(
      `tablet koppelen: BAR_DEVICE_SECRET ontbreekt of is ongeldig (minstens ${SECRET_MIN_LENGTE} tekens base32) — koppelen en device-inloggen staan uit`
    );
  }
  return secret;
}

function naarBase64url(bytes: Uint8Array): string {
  let binair = "";
  for (const byte of bytes) binair += String.fromCharCode(byte);
  return btoa(binair).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function vanBase64url(tekst: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(tekst)) return null;
  const opgevuld =
    tekst.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((tekst.length + 3) % 4);
  try {
    return Uint8Array.from(atob(opgevuld), (teken) => teken.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacSleutel(sleutel: Uint8Array<ArrayBuffer>, gebruik: KeyUsage[]) {
  return crypto.subtle.importKey("raw", sleutel, { name: "HMAC", hash: "SHA-256" }, false, gebruik);
}

/**
 * `K = HMAC-SHA-256(secret, "abas-tablet-cookie-sleutel-v1")`: het secret
 * zelf staat nooit in het cookie en wordt niet rechtstreeks als sleutel
 * gebruikt.
 */
async function cookieSleutel(secret: string): Promise<CryptoKey> {
  const basis = await hmacSleutel(encoder.encode(secret), ["sign"]);
  const afgeleid = new Uint8Array(
    await crypto.subtle.sign("HMAC", basis, encoder.encode(SLEUTEL_LABEL))
  );
  return hmacSleutel(afgeleid, ["sign", "verify"]);
}

function teOndertekenen(iat: string, nonce: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`abas-tablet|${VERSIE}|${iat}|${nonce}`);
}

/**
 * Een nieuwe cookiewaarde `v1.<iat>.<nonce>.<sig>`, of `null` als het secret
 * ongeldig is (ondertekenen weigert). `nu` in seconden sinds epoch.
 */
export async function maakKoppelcookie(
  secret: string | undefined | null,
  nu: number
): Promise<string | null> {
  const geldig = geldigSecret(secret);
  if (geldig === null) return null;

  const iat = String(Math.floor(nu));
  const nonce = naarBase64url(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
  const sleutel = await cookieSleutel(geldig);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", sleutel, teOndertekenen(iat, nonce))
  );
  return `${VERSIE}.${iat}.${nonce}.${naarBase64url(sig)}`;
}

type OntledenCookie = { iat: string; iatGetal: number; nonce: string; sig: Uint8Array<ArrayBuffer> };

function ontleedKoppelcookie(waarde: string): OntledenCookie | null {
  const delen = waarde.split(".");
  if (delen.length !== 4) return null;
  const [versie, iat, nonce, sigTekst] = delen;
  if (versie !== VERSIE) return null;
  // Decimaal, zonder voorloopnullen of teken: één schrijfwijze per moment.
  if (!/^(0|[1-9][0-9]{0,15})$/.test(iat)) return null;
  // 16 bytes → 22 tekens, 32 bytes (SHA-256) → 43 tekens, zonder opvulling.
  if (!/^[A-Za-z0-9_-]{22}$/.test(nonce)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(sigTekst)) return null;
  const sig = vanBase64url(sigTekst);
  if (sig === null || sig.length !== 32) return null;
  return { iat, iatGetal: Number(iat), nonce, sig };
}

/**
 * Klopt de cookiewaarde? Formaat exact, handtekening via
 * `crypto.subtle.verify` (constante tijd), `iat` niet meer dan 5 minuten in
 * de toekomst en niet ouder dan de looptijd van 400 dagen. Dat laatste
 * handhaaft de browser ook via `Max-Age`, maar de server vertrouwt daar
 * niet op: een gekopieerd cookie heeft geen vervaldatum meer.
 */
export async function verifieerKoppelcookie(
  waarde: string | undefined | null,
  secret: string | undefined | null,
  nu: number
): Promise<boolean> {
  const geldig = geldigSecret(secret);
  if (geldig === null || !waarde) return false;

  const cookie = ontleedKoppelcookie(waarde);
  if (cookie === null) return false;
  if (cookie.iatGetal > nu + MAX_KLOKVERSCHIL_S) return false;
  if (nu - cookie.iatGetal > KOPPELCOOKIE_MAX_AGE_S) return false;

  try {
    const sleutel = await cookieSleutel(geldig);
    return await crypto.subtle.verify(
      "HMAC",
      sleutel,
      cookie.sig,
      teOndertekenen(cookie.iat, cookie.nonce)
    );
  } catch {
    return false;
  }
}

/**
 * Hoort een (al geverifieerd) cookie ververst te worden? Hooguit één keer
 * per dag, zodat een tablet in gebruik nooit verloopt (open vraag 1).
 */
export function moetKoppelcookieVerversen(waarde: string, nu: number): boolean {
  const cookie = ontleedKoppelcookie(waarde);
  if (cookie === null) return false;
  return nu - cookie.iatGetal >= KOPPELCOOKIE_VERVERS_NA_S;
}

/**
 * Cookie-opties voor `abas_tablet`. `secure` staat aan zodra het verzoek
 * via https binnenkomt (op Vercel altijd); lokaal en in CI op
 * `http://127.0.0.1` uit. Geen `__Host-`-prefix: zie spec → Het
 * koppelcookie.
 */
export function koppelcookieOpties(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    secure,
    maxAge: KOPPELCOOKIE_MAX_AGE_S,
  };
}

export type CodeUitkomst = "ok" | "ongeldige_code" | "niet_geconfigureerd";

/**
 * Klopt de ingevoerde koppelcode? Beide waarden worden genormaliseerd, met
 * dezelfde (eenmalige, willekeurige) sleutel ge-HMAC'd, en de uitkomsten
 * vergeleken via `crypto.subtle.verify`: constante tijd, geen `===` op de
 * strings.
 */
export async function controleerCode(
  invoer: string,
  secret: string | undefined | null
): Promise<CodeUitkomst> {
  const geldig = geldigSecret(secret);
  if (geldig === null) return "niet_geconfigureerd";

  const code = normaliseerCode(invoer);
  if (code.length === 0) return "ongeldige_code";

  const sleutel = (await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])) as CryptoKey;
  const macVanSecret = await crypto.subtle.sign("HMAC", sleutel, encoder.encode(geldig));
  const klopt = await crypto.subtle.verify("HMAC", sleutel, macVanSecret, encoder.encode(code));
  return klopt ? "ok" : "ongeldige_code";
}

/**
 * Vrijgestelde paden: nooit een redirect naar `/koppel`. `/koppel` zelf,
 * `/beheer` en alles daaronder, `/auth/` en alles daaronder. Elk ander pad
 * dat door de matcher komt, is bar-shell en dus afgeschermd, ook een
 * toekomstige route.
 */
export function isPadVrijgesteld(pad: string): boolean {
  return (
    pad === "/koppel" ||
    pad === "/beheer" ||
    pad.startsWith("/beheer/") ||
    pad.startsWith("/auth/")
  );
}

/** `Sec-Fetch-Site: cross-site` én `Sec-Fetch-Mode: navigate`. */
export function isCrossSiteNavigatie(headers: Headers): boolean {
  return (
    headers.get("sec-fetch-site") === "cross-site" && headers.get("sec-fetch-mode") === "navigate"
  );
}

export type SoortSessie = "geen" | "device" | "persoonlijk";

/**
 * `"device"` als het e-mailadres van de sessie hoofdletterongevoelig gelijk
 * is aan `SUPABASE_DEVICE_EMAIL`, anders `"persoonlijk"`. Geen
 * geheimvergelijking: het e-mailadres is geen secret.
 */
export function soortSessie(
  heeftSessie: boolean,
  sessieEmail: string | undefined | null,
  deviceEmail: string | undefined | null
): SoortSessie {
  if (!heeftSessie) return "geen";
  if (sessieEmail && deviceEmail && sessieEmail.toLowerCase() === deviceEmail.toLowerCase()) {
    return "device";
  }
  return "persoonlijk";
}

export type DeviceSessieBesluit =
  | "doorlaten"
  | "device-inloggen"
  | "naar-koppelen"
  | "uitloggen-en-doorlaten"
  | "uitloggen-en-naar-koppelen"
  | "same-site-herladen";

/**
 * De beslismatrix uit de spec (→ Middleware), puur zodat hij zonder
 * request-mocks te testen is.
 *
 * Eerst de SameSite-regel: `SameSite=Strict` stuurt het cookie niet mee bij
 * een cross-site navigatie. Zonder koppelcookie op een niet-vrijgesteld pad
 * wordt de pagina dan eerst same-site herladen, in plaats van de tablet uit
 * te loggen of naar `/koppel` te sturen (spec → Randgevallen → "Externe
 * link").
 */
export function besluitDeviceSessie({
  sessie,
  koppelcookieAanwezig,
  koppelingGeldig,
  padVrijgesteld,
  crossSiteNavigatie,
}: {
  sessie: SoortSessie;
  koppelcookieAanwezig: boolean;
  koppelingGeldig: boolean;
  padVrijgesteld: boolean;
  crossSiteNavigatie: boolean;
}): DeviceSessieBesluit {
  if (crossSiteNavigatie && !koppelcookieAanwezig && !padVrijgesteld) {
    return "same-site-herladen";
  }

  switch (sessie) {
    case "persoonlijk":
      return "doorlaten";
    case "geen":
      if (koppelingGeldig) return "device-inloggen";
      return padVrijgesteld ? "doorlaten" : "naar-koppelen";
    case "device":
      if (koppelingGeldig) return "doorlaten";
      return padVrijgesteld ? "uitloggen-en-doorlaten" : "uitloggen-en-naar-koppelen";
  }
}

/**
 * Extra regel naast de matrix: op `/koppel` met een geldige koppeling valt
 * niets te koppelen, dus 307 naar `/`.
 */
export function koppelpadNaarStart(pad: string, koppelingGeldig: boolean): boolean {
  return pad === "/koppel" && koppelingGeldig;
}
