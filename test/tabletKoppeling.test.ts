import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * Tests voor src/lib/tabletKoppeling.ts (docs/features/tablet-koppelen.md →
 * Testplan → Unit). `server-only` wordt via de resolve-hook omgeleid naar
 * de lege module die Next.js server-side ook gebruikt. Web Crypto is in
 * Node 22 globaal.
 *
 * Constant-time vergelijken is hier niet te bewijzen; dat blijft een
 * reviewpunt (geen `===` op secret, code of `sig`).
 */
register("./fakes/resolve-hooks.mjs", import.meta.url);

const {
  KOPPELCOOKIE_MAX_AGE_S,
  KOPPELCOOKIE_VERVERS_NA_S,
  MAX_KLOKVERSCHIL_S,
  SECRET_MIN_LENGTE,
  besluitDeviceSessie,
  controleerCode,
  geldigSecret,
  isCrossSiteNavigatie,
  isPadVrijgesteld,
  koppelcookieOpties,
  koppelpadNaarStart,
  maakKoppelcookie,
  moetKoppelcookieVerversen,
  normaliseerCode,
  soortSessie,
  verifieerKoppelcookie,
} = await import("../src/lib/tabletKoppeling.ts");

// 26 tekens base32, zelfde vorm als het CI-secret.
const SECRET = "ABASCITESTSECRETONLYLOKAAL";
const SECRET_GEGROEPEERD = "ABASC-ITEST-SECRE-TONLY-LOKAA-L";
const ANDER_SECRET = "ZZZZZ22222ZZZZZ77777ZZZZZQ";
const NU = 1_790_000_000;

function vervangDeel(waarde: string, index: number, nieuw: (deel: string) => string): string {
  const delen = waarde.split(".");
  delen[index] = nieuw(delen[index]);
  return delen.join(".");
}

/** Wisselt één base64url-teken, zodat het formaat klopt maar de inhoud niet. */
function flipTeken(deel: string, positie = 0): string {
  const teken = deel[positie] === "A" ? "B" : "A";
  return deel.slice(0, positie) + teken + deel.slice(positie + 1);
}

async function cookie(secret = SECRET, nu = NU): Promise<string> {
  const waarde = await maakKoppelcookie(secret, nu);
  assert.ok(waarde, "ondertekenen met een geldig secret levert een waarde");
  return waarde;
}

// --- Secret en normalisatie ----------------------------------------------

test("normaliseerCode: hoofdletterongevoelig, streepjes en spaties tellen niet", () => {
  assert.equal(normaliseerCode("abasc-itest secre\tTONLY-lokaa-l"), SECRET);
  assert.equal(normaliseerCode(" - "), "");
});

test("geldigSecret: 26 tekens base32 is de minimumlengte; gegroepeerd mag", () => {
  assert.equal(SECRET_MIN_LENGTE, 26);
  assert.equal(geldigSecret(SECRET), SECRET);
  assert.equal(geldigSecret(SECRET_GEGROEPEERD), SECRET);
  assert.equal(geldigSecret(SECRET.toLowerCase()), SECRET);
  assert.equal(geldigSecret(SECRET + "AB"), SECRET + "AB");
});

test("geldigSecret: ontbrekend, te kort of buiten base32 → null", () => {
  assert.equal(geldigSecret(undefined), null);
  assert.equal(geldigSecret(null), null);
  assert.equal(geldigSecret(""), null);
  assert.equal(geldigSecret(SECRET.slice(0, 25)), null);
  // 0, 1, 8 en 9 zitten niet in base32 (RFC 4648).
  assert.equal(geldigSecret("0" + SECRET.slice(1)), null);
  assert.equal(geldigSecret(SECRET.slice(0, 25) + "!"), null);
});

// --- Ondertekenen en verifiëren --------------------------------------------

test("ondertekenen → verifiëren slaagt met hetzelfde secret, ook gegroepeerd geschreven", async () => {
  const waarde = await cookie();
  assert.match(waarde, /^v1\.\d+\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await verifieerKoppelcookie(waarde, SECRET, NU), true);
  assert.equal(await verifieerKoppelcookie(waarde, SECRET_GEGROEPEERD, NU), true);
});

test("het secret staat niet in het cookie en twee uitgiftes zijn verschillend", async () => {
  const a = await cookie();
  const b = await cookie();
  assert.ok(!a.includes(SECRET));
  assert.notEqual(a, b);
});

test("verifiëren faalt met een ander secret (rotatie)", async () => {
  assert.equal(await verifieerKoppelcookie(await cookie(), ANDER_SECRET, NU), false);
});

test("verifiëren faalt bij een gewijzigde sig, iat of nonce", async () => {
  const waarde = await cookie();
  assert.equal(await verifieerKoppelcookie(vervangDeel(waarde, 3, flipTeken), SECRET, NU), false);
  assert.equal(
    await verifieerKoppelcookie(vervangDeel(waarde, 1, (iat) => String(Number(iat) - 1)), SECRET, NU),
    false
  );
  assert.equal(await verifieerKoppelcookie(vervangDeel(waarde, 2, flipTeken), SECRET, NU), false);
});

test("verifiëren faalt bij een verkeerde versieprefix", async () => {
  const waarde = await cookie();
  assert.equal(await verifieerKoppelcookie(vervangDeel(waarde, 0, () => "v2"), SECRET, NU), false);
  assert.equal(await verifieerKoppelcookie(vervangDeel(waarde, 0, () => "V1"), SECRET, NU), false);
});

test("verifiëren faalt bij te weinig of te veel delen", async () => {
  const waarde = await cookie();
  const delen = waarde.split(".");
  assert.equal(await verifieerKoppelcookie(delen.slice(0, 3).join("."), SECRET, NU), false);
  assert.equal(await verifieerKoppelcookie(`${waarde}.extra`, SECRET, NU), false);
  assert.equal(await verifieerKoppelcookie(`${waarde}.`, SECRET, NU), false);
});

test("verifiëren faalt bij een lege of ontbrekende waarde", async () => {
  assert.equal(await verifieerKoppelcookie("", SECRET, NU), false);
  assert.equal(await verifieerKoppelcookie(undefined, SECRET, NU), false);
  assert.equal(await verifieerKoppelcookie(null, SECRET, NU), false);
});

test("verifiëren faalt bij niet-base64url in nonce of sig", async () => {
  const waarde = await cookie();
  const nietBase64url = (deel: string) => "+" + deel.slice(1);
  assert.equal(await verifieerKoppelcookie(vervangDeel(waarde, 2, nietBase64url), SECRET, NU), false);
  assert.equal(await verifieerKoppelcookie(vervangDeel(waarde, 3, nietBase64url), SECRET, NU), false);
  assert.equal(
    await verifieerKoppelcookie(vervangDeel(waarde, 3, (sig) => sig + "="), SECRET, NU),
    false
  );
});

test("verifiëren faalt bij een niet-numerieke iat", async () => {
  const waarde = await cookie();
  for (const iat of ["abc", "", "-1", "1e9", " 1790000000", "01790000000", "1790000000.5"]) {
    assert.equal(
      await verifieerKoppelcookie(vervangDeel(waarde, 1, () => iat), SECRET, NU),
      false,
      `iat ${JSON.stringify(iat)}`
    );
  }
});

test("iat: tot 5 minuten in de toekomst is klokverschil, daarna geweigerd", async () => {
  const net = await cookie(SECRET, NU + MAX_KLOKVERSCHIL_S);
  assert.equal(await verifieerKoppelcookie(net, SECRET, NU), true);
  const teVer = await cookie(SECRET, NU + MAX_KLOKVERSCHIL_S + 1);
  assert.equal(await verifieerKoppelcookie(teVer, SECRET, NU), false);
});

test("iat: ouder dan 400 dagen is verlopen, ook als de browser het cookie nog meestuurt", async () => {
  assert.equal(KOPPELCOOKIE_MAX_AGE_S, 400 * 24 * 60 * 60);
  const waarde = await cookie(SECRET, NU);
  assert.equal(await verifieerKoppelcookie(waarde, SECRET, NU + KOPPELCOOKIE_MAX_AGE_S), true);
  assert.equal(await verifieerKoppelcookie(waarde, SECRET, NU + KOPPELCOOKIE_MAX_AGE_S + 1), false);
});

test("een secret dat ontbreekt of te kort is: verifiëren altijd false, ondertekenen weigert", async () => {
  const waarde = await cookie();
  for (const secret of [undefined, null, "", SECRET.slice(0, 25)]) {
    assert.equal(await maakKoppelcookie(secret, NU), null);
    assert.equal(await verifieerKoppelcookie(waarde, secret, NU), false);
  }
});

// --- Glijdende looptijd en cookie-opties -----------------------------------

test("verversen: pas na een dag, dus hooguit één keer per dag", async () => {
  const waarde = await cookie(SECRET, NU);
  assert.equal(moetKoppelcookieVerversen(waarde, NU), false);
  assert.equal(moetKoppelcookieVerversen(waarde, NU + KOPPELCOOKIE_VERVERS_NA_S - 1), false);
  assert.equal(moetKoppelcookieVerversen(waarde, NU + KOPPELCOOKIE_VERVERS_NA_S), true);
  assert.equal(moetKoppelcookieVerversen("onzin", NU + KOPPELCOOKIE_VERVERS_NA_S), false);
});

test("cookie-opties: HttpOnly, SameSite=Strict, Path=/, Max-Age 400 dagen, Secure alleen op https", () => {
  assert.deepEqual(koppelcookieOpties(true), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: true,
    maxAge: KOPPELCOOKIE_MAX_AGE_S,
  });
  assert.equal(koppelcookieOpties(false).secure, false);
  assert.ok(!("domain" in koppelcookieOpties(true)));
});

// --- Codecontrole ----------------------------------------------------------

test("codecontrole: de juiste code, ook met de normalisatievarianten", async () => {
  for (const invoer of [
    SECRET,
    SECRET_GEGROEPEERD,
    SECRET.toLowerCase(),
    "abasc itest secre tonly lokaa l",
    `  ${SECRET_GEGROEPEERD.toLowerCase()}  `,
  ]) {
    assert.equal(await controleerCode(invoer, SECRET), "ok", invoer);
  }
  // Het secret zelf mag in de env ook gegroepeerd staan.
  assert.equal(await controleerCode(SECRET, SECRET_GEGROEPEERD), "ok");
});

test("codecontrole: verkeerde code, lege code en één teken verschil worden geweigerd", async () => {
  assert.equal(await controleerCode(ANDER_SECRET, SECRET), "ongeldige_code");
  assert.equal(await controleerCode("", SECRET), "ongeldige_code");
  assert.equal(await controleerCode(" - ", SECRET), "ongeldige_code");
  assert.equal(await controleerCode(SECRET.slice(0, 25) + "B", SECRET), "ongeldige_code");
  assert.equal(await controleerCode(SECRET.slice(0, 25), SECRET), "ongeldige_code");
  assert.equal(await controleerCode(SECRET + "A", SECRET), "ongeldige_code");
});

test("codecontrole zonder geldig secret: niet_geconfigureerd, ook met een 'passende' code", async () => {
  const kort = SECRET.slice(0, 25);
  assert.equal(await controleerCode(kort, kort), "niet_geconfigureerd");
  assert.equal(await controleerCode(SECRET, undefined), "niet_geconfigureerd");
  assert.equal(await controleerCode("", ""), "niet_geconfigureerd");
});

// --- Middleware-hulpfuncties -----------------------------------------------

test("vrijgestelde paden: /koppel, /beheer(/**), /auth/**; de rest is bar-shell", () => {
  for (const pad of ["/koppel", "/beheer", "/beheer/", "/beheer/callback", "/auth/callback"]) {
    assert.equal(isPadVrijgesteld(pad), true, pad);
  }
  for (const pad of ["/", "/koppel/iets", "/beheerder", "/auth", "/authx", "/verkoop", "/koppelen"]) {
    assert.equal(isPadVrijgesteld(pad), false, pad);
  }
});

test("cross-site navigatie: alleen Sec-Fetch-Site cross-site én Sec-Fetch-Mode navigate", () => {
  const h = (site?: string, mode?: string) => {
    const headers = new Headers();
    if (site) headers.set("sec-fetch-site", site);
    if (mode) headers.set("sec-fetch-mode", mode);
    return headers;
  };
  assert.equal(isCrossSiteNavigatie(h("cross-site", "navigate")), true);
  assert.equal(isCrossSiteNavigatie(h("same-origin", "navigate")), false);
  assert.equal(isCrossSiteNavigatie(h("same-site", "navigate")), false);
  assert.equal(isCrossSiteNavigatie(h("none", "navigate")), false);
  assert.equal(isCrossSiteNavigatie(h("cross-site", "cors")), false);
  assert.equal(isCrossSiteNavigatie(h()), false);
});

test("soortSessie: device hoofdletterongevoelig op SUPABASE_DEVICE_EMAIL, anders persoonlijk", () => {
  assert.equal(soortSessie(false, undefined, "device@aurora.local"), "geen");
  assert.equal(soortSessie(true, "Device@Aurora.local", "device@aurora.local"), "device");
  assert.equal(soortSessie(true, "femke.bos@aurora.local", "device@aurora.local"), "persoonlijk");
  assert.equal(soortSessie(true, "device@aurora.local", undefined), "persoonlijk");
  assert.equal(soortSessie(true, undefined, "device@aurora.local"), "persoonlijk");
});

// --- besluitDeviceSessie: elke rij uit de tabel -----------------------------

const basis = {
  koppelcookieAanwezig: true,
  crossSiteNavigatie: false,
} as const;

test("rij 1: geen sessie + geldige koppeling → device-inloggen (vrijgesteld of niet)", () => {
  for (const padVrijgesteld of [true, false]) {
    assert.equal(
      besluitDeviceSessie({ ...basis, sessie: "geen", koppelingGeldig: true, padVrijgesteld }),
      "device-inloggen"
    );
  }
});

test("rij 2: geen sessie + geen koppeling + vrijgesteld pad → doorlaten", () => {
  for (const koppelcookieAanwezig of [true, false]) {
    assert.equal(
      besluitDeviceSessie({
        ...basis,
        koppelcookieAanwezig,
        sessie: "geen",
        koppelingGeldig: false,
        padVrijgesteld: true,
      }),
      "doorlaten"
    );
  }
});

test("rij 3: geen sessie + geen koppeling + bar-pad → naar-koppelen", () => {
  for (const koppelcookieAanwezig of [true, false]) {
    assert.equal(
      besluitDeviceSessie({
        ...basis,
        koppelcookieAanwezig,
        sessie: "geen",
        koppelingGeldig: false,
        padVrijgesteld: false,
      }),
      "naar-koppelen"
    );
  }
});

test("rij 4: device-sessie + geldige koppeling → doorlaten (vrijgesteld of niet)", () => {
  for (const padVrijgesteld of [true, false]) {
    assert.equal(
      besluitDeviceSessie({ ...basis, sessie: "device", koppelingGeldig: true, padVrijgesteld }),
      "doorlaten"
    );
  }
});

test("rij 5: device-sessie + geen koppeling + vrijgesteld pad → uitloggen-en-doorlaten", () => {
  for (const koppelcookieAanwezig of [true, false]) {
    assert.equal(
      besluitDeviceSessie({
        ...basis,
        koppelcookieAanwezig,
        sessie: "device",
        koppelingGeldig: false,
        padVrijgesteld: true,
      }),
      "uitloggen-en-doorlaten"
    );
  }
});

test("rij 6: device-sessie + geen koppeling + bar-pad → uitloggen-en-naar-koppelen", () => {
  for (const koppelcookieAanwezig of [true, false]) {
    assert.equal(
      besluitDeviceSessie({
        ...basis,
        koppelcookieAanwezig,
        sessie: "device",
        koppelingGeldig: false,
        padVrijgesteld: false,
      }),
      "uitloggen-en-naar-koppelen"
    );
  }
});

test("rij 7: persoonlijke sessie → altijd doorlaten", () => {
  for (const koppelingGeldig of [true, false]) {
    for (const padVrijgesteld of [true, false]) {
      assert.equal(
        besluitDeviceSessie({ ...basis, sessie: "persoonlijk", koppelingGeldig, padVrijgesteld }),
        "doorlaten"
      );
    }
  }
});

test("cross-site navigatie zonder koppelcookie op een bar-pad → herladen in plaats van uitloggen", () => {
  for (const sessie of ["geen", "device", "persoonlijk"] as const) {
    assert.equal(
      besluitDeviceSessie({
        sessie,
        koppelcookieAanwezig: false,
        koppelingGeldig: false,
        padVrijgesteld: false,
        crossSiteNavigatie: true,
      }),
      "same-site-herladen",
      sessie
    );
  }
});

test("cross-site navigatie: niet herladen op een vrijgesteld pad of als het cookie wél meekomt", () => {
  // Magic link naar /beheer/callback: vrijgesteld, gewone tabel.
  assert.equal(
    besluitDeviceSessie({
      sessie: "geen",
      koppelcookieAanwezig: false,
      koppelingGeldig: false,
      padVrijgesteld: true,
      crossSiteNavigatie: true,
    }),
    "doorlaten"
  );
  // Cookie aanwezig maar ongeldig: geen herlaadlus, gewoon de tabel.
  assert.equal(
    besluitDeviceSessie({
      sessie: "device",
      koppelcookieAanwezig: true,
      koppelingGeldig: false,
      padVrijgesteld: false,
      crossSiteNavigatie: true,
    }),
    "uitloggen-en-naar-koppelen"
  );
});

test("extra regel: /koppel met een geldige koppeling → naar /", () => {
  assert.equal(koppelpadNaarStart("/koppel", true), true);
  assert.equal(koppelpadNaarStart("/koppel", false), false);
  assert.equal(koppelpadNaarStart("/", true), false);
  assert.equal(koppelpadNaarStart("/beheer", true), false);
});
