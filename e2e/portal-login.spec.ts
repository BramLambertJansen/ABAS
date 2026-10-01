import { test, expect, type Page } from "@playwright/test";
import {
  SUPABASE_HEADERS,
  alertOf,
  fakeSession,
  json,
  portalLoginMetWachtwoord,
} from "./helpers/supabaseMock";
import { FEMKE, WACHTWOORD_FEMKE, logInOpBar } from "./helpers/barLogin";
import { supabaseStatus } from "./helpers/supabaseAdmin";

/**
 * docs/features/portal-login.md (#15) — gedrag van `/portal`'s inlogscherm,
 * `/auth/callback` en `/portal/wachtwoord-herstellen`. Niet a11y (die scans
 * staan in e2e/a11y.spec.ts, uitgebreid voor dezelfde nieuwe schermen).
 *
 * Twee soorten test in dit bestand:
 *
 *   1. "gemockt" — zelfde aanpak als e2e/wachtwoord-vergeten.spec.ts: de
 *      browser-client (src/lib/supabase/portalClient.ts) praat rechtstreeks
 *      met `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/...`, hier onderschept via
 *      `page.route()`. Geen live backend nodig — dit dekt het UI-gedrag
 *      (methode-keuze, neutrale meldingen, focus, wachtwoord-herstel-
 *      validatie) onafhankelijk van of er een echte Supabase-stack draait.
 *   2. "live backend" — net als e2e/a11y.spec.ts's "stateful bar-shell
 *      scenarios": vereist een echte, lokale Supabase-stack (`supabase
 *      start`, gevuld met `supabase/seed.sql`) en de bouwstenen die
 *      `src/lib/barLogin.ts` nodig heeft (SUPABASE_SECRET_KEY).
 *      Dit is de enige manier om de dingen te bewijzen die niet vanuit de
 *      browser te mocken zijn: de server-side bar-login (acceptatiecriterium
 *      4) en `src/app/auth/callback/
 *      route.ts`'s server-side sessie-uitwisseling — beide draaien in het
 *      Next.js-serverproces zelf, niet als een browser-`fetch`/XHR die
 *      `page.route()` kan onderscheppen. Voor de magic-link-kant van die
 *      route wordt hier, in plaats van een echte mail te lezen, een geldige
 *      `token_hash` opgehaald via Supabase's eigen Admin API
 *      (`/auth/v1/admin/generate_link`, met de lokale `SERVICE_ROLE_KEY` uit
 *      `supabase status`) — exact het "handmatig samengestelde
 *      ?token_hash=&type=&next=-URL"-testpatroon dat de spec zelf noemt
 *      (Schermflow → `/auth/callback` → "Verificatieafhankelijkheid").
 */

/**
 * Tester-bevinding (niet #15-specifiek, zie het volledige testrapport):
 * `next start` normaliseert een inkomende `Host: 127.0.0.1:<poort>` binnen
 * een Route Handler naar `localhost:<poort>` in `request.url` — reproduceerbaar
 * op zowel het nieuwe `src/app/auth/callback/route.ts` als het al langer
 * bestaande `src/app/(bar)/beheer/callback/route.ts` (dus geen regressie van
 * deze PR). Een `NextResponse.redirect(new URL(destination, request.url))`
 * springt daardoor van `127.0.0.1` naar `localhost` — twee verschillende
 * origins voor de browser, dus een host-only cookie (geen expliciete
 * `Domain`) die vlak vóór die redirect gezet is, gaat onderweg verloren.
 * `playwright.config.ts`'s `baseURL` is `127.0.0.1:3100`; deze test file
 * gebruikt daarom expliciet `localhost` zodat elke request/redirect in dit
 * bestand op hetzelfde host blijft — een test-omgevingskeuze, geen wijziging
 * aan de app zelf.
 */
test.use({ baseURL: "http://localhost:3100" });

// ---------------------------------------------------------------------------
// Live-backend bouwstenen
// ---------------------------------------------------------------------------

/** Genereert een échte, geldige `token_hash` voor een magic link — zonder
 *  een mail te versturen/lezen (`supabase/config.toml` heeft hier lokaal
 *  geen aangepast mailsjabloon voor `{{ .RedirectTo }}&token_hash=...`, zie
 *  de spec's eigen "Verificatieafhankelijkheid"-paragraaf: dat is een
 *  ná-deploy Dashboard-stap, geen code). Supabase's Admin API levert dat
 *  token rechtstreeks. */
async function generateMagicLinkTokenHash(email: string): Promise<string> {
  const { apiUrl, serviceRoleKey } = supabaseStatus();
  const res = await fetch(`${apiUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) {
    throw new Error(`generate_link mislukt (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { hashed_token: string };
  return body.hashed_token;
}

// Sinds #16 (docs/features/portal-dashboard.md) is de ingelogde staat
// `PortalDashboard`, niet langer de "Welkom, {naam}"-placeholder — de
// header toont de voornaam ("Hoi {firstName}"), zie PortalDashboard.tsx.
const dashboardHeading = (page: Page, firstName: string) =>
  page.getByRole("heading", { name: `Hoi ${firstName}` });

test.describe("live backend (echte lokale Supabase, supabase/seed.sql)", () => {
  /**
   * Acceptatiecriterium 4 (ADR 0009) — het kernscenario van deze hele spec:
   * een bar-sessie (sinds dienst-per-sessie, ADR 0016, een persoonlijke sessie
   * die op de namenlijst is aangemaakt en in de cookies van de bar staat) mag
   * nooit als ingelogde staat op `/portal` verschijnen. Logt eerst in op de
   * bar (zelfde manier als e2e/a11y.spec.ts's stateful bar-shell scenario's),
   * dan pas `/portal`.
   */
  test("bar-sessie op / toont geen ingelogde staat op /portal", async ({ page }) => {
    await logInOpBar(page, FEMKE, WACHTWOORD_FEMKE);
    // De login zet de sessie server-side in de cookies; wacht tot de bar-
    // schermen klaar zijn, dan is de sessie er zeker.
    await page.getByRole("button", { name: "Uitloggen" }).waitFor({ state: "visible", timeout: 15_000 });

    await page.goto("/portal");
    const emailVeld = page.locator('input[type="email"]');
    await emailVeld.waitFor({ state: "visible", timeout: 15_000 });

    // Geen "Hoi …"-staat (signed-in) en geen deniedMessage-alert (dat
    // zou immers ook een — zij het geweigerde — sessie veronderstellen):
    // gewoon het kale inlogformulier, alsof er geen sessie bestaat, exact
    // wat usePortalSession() voor `sb-portal-auth-token`-afwezigheid hoort
    // te rapporteren.
    await expect(page.getByRole("heading", { name: /^Hoi / })).toHaveCount(0);
    await expect(page.getByText("Dit account is niet gekoppeld aan een lid.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stuur mij een inloglink" })).toBeVisible();
  });

  /**
   * Het wachtwoordpad, met de seed-fixture die de Developer toevoegde (Anna
   * de Vries, `supabase/seed.sql`) — een echte `lid`-rol member met een
   * gekoppelde `auth_user_id` én een gezet wachtwoord.
   */
  test("wachtwoordpad: Anna de Vries logt in en komt op de ingelogde staat", async ({ page }) => {
    await portalLoginMetWachtwoord(page, "anna.de.vries@aurora.local", "local-lid-dev-only");

    await expect(dashboardHeading(page, "Anna")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Ingelogd als anna.de.vries@aurora.local.")).toBeVisible();
  });

  /**
   * Magic link, via een echt (Admin-API-gegenereerd, zie
   * generateMagicLinkTokenHash) `token_hash` naar `/auth/callback?next=
   * portal` — bewijst de volledige serverside-keten (portalServer.ts,
   * link_lid_member_account, redirect) tegen de échte database, niet alleen
   * de RPC in isolatie (dat doet supabase/tests/lid_account_koppelen.test.sql
   * al). Zelfde account (Anna de Vries) als de wachtwoordtest hierboven —
   * samen bewijzen deze twee tests acceptatiecriterium 3 ("beide paden
   * leiden naar hetzelfde lid-account").
   */
  test("magic link (echte token_hash via /auth/callback) landt op hetzelfde lid-account", async ({
    page,
  }) => {
    const tokenHash = await generateMagicLinkTokenHash("anna.de.vries@aurora.local");
    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=magiclink&next=portal`);

    await expect(page).toHaveURL(/\/portal$/);
    await expect(dashboardHeading(page, "Anna")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Ingelogd als anna.de.vries@aurora.local.")).toBeVisible();
  });

  /**
   * Rolzichtbaarheid — een sessie die wél bestaat maar niet naar een
   * `members`-record herleidt toont de neutrale `denied`-melding, geen
   * "Hoi …". Sinds ADR 0012 (docs/features/portal-profiel.md, #17, besluit
   * 1) is een bardienst-account op de portal gewoon `signed-in` (zie de test
   * hieronder); de `denied`-staat wordt daarom gedekt met het ongekoppelde
   * seed-account (`auth.users` zonder `members`-rij, `supabase/seed.sql`).
   */
  test("een ongekoppeld account op /portal krijgt de neutrale 'niet gekoppeld'-melding, geen toegang", async ({
    page,
  }) => {
    await portalLoginMetWachtwoord(page, "e2e.ongekoppeld@aurora.local", "local-e2e-ongekoppeld-dev-only");

    await expect(
      page.getByText("Dit account is niet gekoppeld aan een lid.")
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Hoi / })).toHaveCount(0);
    // Het inlogformulier blijft bruikbaar — geen dead end. Nog steeds methode
    // Wachtwoord (deniedMessage wist de gekozen methode niet), dus de
    // knoptekst is "Inloggen", niet de magic-link-tekst.
    await expect(page.getByRole("button", { name: "Inloggen" })).toBeVisible();
  });

  /**
   * ADR 0012 → Gevolgen, testverwachting: een bardienst-sessie op `/portal`
   * ziet alleen de eigen data, ook al leest die sessie via RLS álle
   * `members`/`orders`/`top_ups`. Sanne Bakker (seed: €21,00, zelf geen
   * bestellingen of opwaarderingen — ze draaide wel een bestelling van Anna
   * de Vries terug) mag dus alleen haar eigen saldo zien, en een lege
   * transactielijst. Alleen lezen, dus het gedeelde seedlid mag hier.
   */
  test("een bardienst-account op /portal is signed-in en ziet alleen het eigen saldo en de eigen transacties", async ({
    page,
  }) => {
    await portalLoginMetWachtwoord(page, "sanne.bakker@aurora.local", "local-bardienst-dev-only");

    await expect(dashboardHeading(page, "Sanne")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Dit account is niet gekoppeld aan een lid.")).toHaveCount(0);
    await expect(page.getByText("HUIDIG SALDO")).toBeVisible();
    await expect(page.getByText(/21,00/).first()).toBeVisible();

    await page.getByRole("tab", { name: "Transacties" }).click();
    await expect(page.getByText("Nog geen transacties")).toBeVisible({ timeout: 15_000 });
    // Anna de Vries' seedtransacties (bestelling, opwaardering, terugdraaiing)
    // mogen hier nooit verschijnen.
    await expect(page.getByText("Bestelling", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Opgewaardeerd", { exact: true })).toHaveCount(0);
  });

  /**
   * `/auth/callback` met een ongeldige/verbruikte `token_hash` mag nooit
   * crashen of vastlopen — "land regardless" (spec → Schermflow →
   * `/auth/callback`). Landt gewoon op `/portal`, signed-out (er kwam geen
   * sessie tot stand).
   */
  test("/auth/callback met een ongeldige token_hash landt alsnog op /portal, signed-out", async ({
    page,
  }) => {
    await page.goto("/auth/callback?token_hash=niet-een-geldig-token&type=magiclink&next=portal");

    await expect(page).toHaveURL(/\/portal$/);
    const emailVeld = page.locator('input[type="email"]');
    await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Hoi / })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Gemockt — geen live backend nodig
// ---------------------------------------------------------------------------

type AuthMock = {
  otp: Array<{ url: string; body: Record<string, unknown> }>;
  token: Array<{ url: string; body: Record<string, unknown> }>;
  recover: Array<{ url: string; body: Record<string, unknown> }>;
  verify: Array<Record<string, unknown>>;
  updateUser: Array<Record<string, unknown>>;
  logout: number;
};

async function mockAuth(
  page: Page,
  handlers: {
    otp?: (n: number) => [number, unknown];
    token?: (n: number) => [number, unknown];
    recover?: (n: number) => [number, unknown] | "abort";
    verify?: (n: number) => [number, unknown];
    updateUser?: (n: number) => [number, unknown];
    logoutStatus?: number;
  } = {}
): Promise<AuthMock> {
  const calls: AuthMock = { otp: [], token: [], recover: [], verify: [], updateUser: [], logout: 0 };

  await page.route(/\/auth\/v1\/otp(\?|$)/, async (route) => {
    const n = calls.otp.length;
    calls.otp.push({ url: route.request().url(), body: route.request().postDataJSON() });
    const [status, body] = handlers.otp?.(n) ?? [200, {}];
    return json(route, status, body);
  });

  // signInWithPassword (grant_type=password). Zonder handler: een
  // invalid_credentials-weigering, zelfde default als
  // e2e/wachtwoord-vergeten.spec.ts's mockAuth.
  await page.route(/\/auth\/v1\/token(\?|$)/, async (route) => {
    const n = calls.token.length;
    calls.token.push({ url: route.request().url(), body: route.request().postDataJSON() });
    const [status, body] = handlers.token?.(n) ?? [
      400,
      { code: "invalid_credentials", msg: "Invalid login credentials" },
    ];
    return json(route, status, body);
  });

  await page.route(/\/auth\/v1\/recover(\?|$)/, async (route) => {
    const n = calls.recover.length;
    calls.recover.push({ url: route.request().url(), body: route.request().postDataJSON() });
    const result = handlers.recover?.(n) ?? [200, {}];
    if (result === "abort") return route.abort("connectionfailed");
    return json(route, result[0], result[1]);
  });

  await page.route(/\/auth\/v1\/verify(\?|$)/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const n = calls.verify.length;
    calls.verify.push(route.request().postDataJSON());
    const [status, body] = handlers.verify?.(n) ?? [200, fakeSession()];
    return json(route, status, body);
  });

  await page.route(/\/auth\/v1\/user(\?|$)/, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    const n = calls.updateUser.length;
    calls.updateUser.push(route.request().postDataJSON());
    const [status, body] = handlers.updateUser?.(n) ?? [500, { code: "unexpected_failure", msg: "niet gemockt" }];
    return json(route, status, body);
  });

  await page.route(/\/auth\/v1\/logout(\?|$)/, async (route) => {
    calls.logout += 1;
    const status = handlers.logoutStatus ?? 204;
    if (status === 204) return route.fulfill({ status, headers: SUPABASE_HEADERS, body: "" });
    return json(route, status, { code: "unexpected_failure", msg: "logout mislukt" });
  });

  return calls;
}

async function openPortalLogin(page: Page) {
  await page.goto("/portal");
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });
}

test.describe("gemockt — methode-keuze", () => {
  test("magic link is de standaardmethode; wachtwoordveld en 'vergeten?' alleen bij Wachtwoord", async ({
    page,
  }) => {
    await mockAuth(page);
    await openPortalLogin(page);

    await expect(page.locator('input[value="magic_link"]')).toBeChecked();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Wachtwoord vergeten?" })).toHaveCount(0);

    await page.locator('label:has(input[value="password"])').click();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Wachtwoord vergeten?" })).toBeVisible();
  });
});

test.describe("gemockt — neutrale magic-link-melding (issue #70-patroon)", () => {
  // Elke uitkomst van signInWithOtp — geslaagd, onbekend adres (Supabase
  // geeft ook dan 200 terug bij shouldCreateUser: true), rate limit,
  // serverfout — moet exact dezelfde melding geven. Geen tekst mag ooit
  // verraden of het adres al bekend was (spec → Schermflow, "Neutrale
  // melding voor magic link").
  for (const [naam, result] of [
    ["geslaagd", [200, {}]],
    ["rate limit (429)", [429, { code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }]],
    ["serverfout (500)", [500, { code: "unexpected_failure", msg: "Error sending magic link" }]],
  ] as const) {
    test(`${naam} → "Als er een account bij … hoort, hebben we een inloglink gestuurd."`, async ({
      page,
    }) => {
      const calls = await mockAuth(page, { otp: () => result as [number, unknown] });
      await openPortalLogin(page);

      await page.getByLabel("E-mailadres").fill("iemand@aurora.local");
      await page.getByRole("button", { name: "Stuur mij een inloglink" }).click();

      await expect(page.getByRole("status")).toHaveText(
        "Als er een account bij iemand@aurora.local hoort, hebben we een inloglink gestuurd."
      );
      expect(calls.otp).toHaveLength(1);
    });
  }

  test("shouldCreateUser: true en emailRedirectTo=/auth/callback?next=portal worden daadwerkelijk verstuurd", async ({
    page,
  }) => {
    const calls = await mockAuth(page);
    await openPortalLogin(page);

    await page.getByLabel("E-mailadres").fill("nieuw@aurora.local");
    await page.getByRole("button", { name: "Stuur mij een inloglink" }).click();
    await expect(page.getByRole("status")).toContainText("hebben we een inloglink gestuurd");

    expect(calls.otp).toHaveLength(1);
    expect(calls.otp[0].body).toEqual(
      expect.objectContaining({ email: "nieuw@aurora.local", create_user: true })
    );
    const redirectTo = new URL(calls.otp[0].url).searchParams.get("redirect_to");
    const origin = new URL(page.url()).origin;
    expect(redirectTo).toBe(`${origin}/auth/callback?next=portal`);
  });

  test("'Andere inlogmethode' verbergt de melding en toont weer het formulier", async ({ page }) => {
    await mockAuth(page);
    await openPortalLogin(page);
    await page.getByLabel("E-mailadres").fill("iemand@aurora.local");
    await page.getByRole("button", { name: "Stuur mij een inloglink" }).click();
    await expect(page.getByRole("status")).toContainText("hebben we een inloglink gestuurd");

    await page.getByRole("button", { name: "Andere inlogmethode" }).click();
    await expect(page.getByRole("button", { name: "Stuur mij een inloglink" })).toBeVisible();
    await expect(page.getByLabel("E-mailadres")).toBeFocused();
  });
});

test.describe("gemockt — wachtwoordpad (lekt niet, issue #70)", () => {
  test("mislukte wachtwoordlogin: 'onjuist e-mailadres of wachtwoord', geen accountbestaan gelekt", async ({
    page,
  }) => {
    const calls = await mockAuth(page);
    await openPortalLogin(page);

    await page.getByLabel("E-mailadres").fill("wie-dan-ook@aurora.local");
    await page.locator('label:has(input[value="password"])').click();
    await page.locator('input[type="password"]').fill("fout-wachtwoord");
    await page.getByRole("button", { name: "Inloggen" }).click();

    await expect(alertOf(page)).toHaveText("onjuist e-mailadres of wachtwoord");
    expect(calls.token).toHaveLength(1);
    // Geen "verstuurd"-melding, geen enumeratie — puur de generieke fout.
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("onbekende serverfout bij wachtwoordlogin → generieke melding", async ({ page }) => {
    await mockAuth(page, { token: () => [500, { code: "unexpected_failure", msg: "boom" }] });
    await openPortalLogin(page);

    await page.getByLabel("E-mailadres").fill("iemand@aurora.local");
    await page.locator('label:has(input[value="password"])').click();
    await page.locator('input[type="password"]').fill("iets");
    await page.getByRole("button", { name: "Inloggen" }).click();

    await expect(alertOf(page)).toHaveText("er ging iets mis, probeer het opnieuw");
  });
});

test.describe("gemockt — wachtwoord vergeten (aanvragen)", () => {
  async function openForgot(page: Page, email: string) {
    await openPortalLogin(page);
    await page.getByLabel("E-mailadres").fill(email);
    await page.locator('label:has(input[value="password"])').click();
    await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
    await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeVisible();
  }

  test("aanvragen: neutrale melding, redirectTo naar /portal/wachtwoord-herstellen", async ({
    page,
  }) => {
    const calls = await mockAuth(page);
    await openForgot(page, "anna.de.vries@aurora.local");

    await page.getByRole("button", { name: "Stuur herstellink" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Als er een account bij anna.de.vries@aurora.local hoort, hebben we een link gestuurd"
    );

    expect(calls.recover).toHaveLength(1);
    const redirectTo = new URL(calls.recover[0].url).searchParams.get("redirect_to");
    const origin = new URL(page.url()).origin;
    expect(redirectTo).toBe(`${origin}/portal/wachtwoord-herstellen`);
  });

  // Geen e-mail-enumeratie: elke uitkomst, ook een netwerkfout/rate limit,
  // geeft dezelfde melding (zelfde besluit als wachtwoord-vergeten.md
  // besluit 4, hier voor de portal-variant).
  for (const [naam, result] of [
    ["onbekend adres (200 {})", [200, {}]],
    ["rate limit (429)", [429, { code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }]],
    ["netwerkfout", "abort"],
  ] as const) {
    test(`aanvragen, ${naam} → dezelfde neutrale melding`, async ({ page }) => {
      await mockAuth(page, { recover: () => result as [number, unknown] | "abort" });
      await openForgot(page, "wie@example.org");
      await page.getByRole("button", { name: "Stuur herstellink" }).click();

      await expect(page.getByRole("status")).toHaveText(
        "Als er een account bij wie@example.org hoort, hebben we een link gestuurd om een nieuw wachtwoord in te stellen."
      );
    });
  }
});

test.describe("gemockt — focus volgt het wisselen tussen weergaven (WCAG 2.4.3)", () => {
  test("magic link versturen → focus op de meldingstekst; terug → focus op e-mailveld", async ({
    page,
  }) => {
    const calls = await mockAuth(page);
    await openPortalLogin(page);
    await page.getByLabel("E-mailadres").fill("iemand@aurora.local");
    await page.getByRole("button", { name: "Stuur mij een inloglink" }).click();

    await expect(page.getByRole("status").filter({ hasText: "hebben we een inloglink" })).toBeFocused();
    expect(calls.otp).toHaveLength(1);

    await page.getByRole("button", { name: "Andere inlogmethode" }).click();
    await expect(page.getByLabel("E-mailadres")).toBeFocused();
  });

  test("'Wachtwoord vergeten?' → focus op de kop; '← terug naar inloggen' → focus op e-mailveld", async ({
    page,
  }) => {
    await mockAuth(page);
    await openPortalLogin(page);
    await page.locator('label:has(input[value="password"])').click();

    await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
    await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeFocused();

    await page.getByRole("button", { name: "← terug naar inloggen" }).click();
    await expect(page.getByLabel("E-mailadres")).toBeFocused();
  });
});

test.describe("gemockt — /portal/wachtwoord-herstellen", () => {
  const RESET_URL = "/portal/wachtwoord-herstellen?token_hash=hash-uit-mail&type=recovery";
  const LINK_INVALID = "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.";

  for (const [naam, path] of [
    ["zonder token_hash", "/portal/wachtwoord-herstellen"],
    ["zonder type", "/portal/wachtwoord-herstellen?token_hash=abc"],
    ["met type=email (magic link, geen herstel)", "/portal/wachtwoord-herstellen?token_hash=abc&type=email"],
    ["met lege token_hash", "/portal/wachtwoord-herstellen?token_hash=&type=recovery"],
  ] as const) {
    test(`${naam} → direct "link verlopen", geen formulier, geen verifyOtp`, async ({ page }) => {
      const calls = await mockAuth(page);
      await page.goto(path);

      await expect(alertOf(page)).toHaveText(LINK_INVALID);
      await expect(page.getByLabel("Nieuw wachtwoord")).toHaveCount(0);
      const nieuweLink = page.getByRole("link", { name: "Nieuwe link aanvragen" });
      await expect(nieuweLink).toHaveAttribute("href", "/portal?wachtwoord=vergeten");
      expect(calls.verify).toHaveLength(0);
    });
  }

  test("happy path: verifyOtp → updateUser → signOut → /portal?wachtwoord=gewijzigd", async ({
    page,
  }) => {
    const calls = await mockAuth(page, {
      updateUser: () => [200, {}],
    });
    await page.goto(RESET_URL);
    await page.getByLabel("Nieuw wachtwoord").fill("Aurora#2026");
    await page.getByLabel("Herhaal wachtwoord").fill("Aurora#2026");
    await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/portal$/);

    expect(calls.verify).toEqual([
      expect.objectContaining({ token_hash: "hash-uit-mail", type: "recovery" }),
    ]);
    expect(calls.updateUser).toEqual([expect.objectContaining({ password: "Aurora#2026" })]);
    expect(calls.logout).toBe(1);
    await expect(page.locator('input[value="password"]')).toBeChecked();
  });

  test("verifyOtp faalt (verlopen/al gebruikt) → 'link verlopen', geen updateUser", async ({
    page,
  }) => {
    const calls = await mockAuth(page, {
      verify: () => [403, { code: "otp_expired", msg: "Email link is invalid or has expired" }],
    });
    await page.goto(RESET_URL);
    await page.getByLabel("Nieuw wachtwoord").fill("Aurora#2026");
    await page.getByLabel("Herhaal wachtwoord").fill("Aurora#2026");
    await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();

    await expect(alertOf(page)).toHaveText(LINK_INVALID);
    expect(calls.verify).toHaveLength(1);
    expect(calls.updateUser).toHaveLength(0);
    expect(calls.logout).toBe(0);
  });

  for (const [naam, status, body, melding] of [
    [
      "weak_password",
      422,
      { code: "weak_password", msg: "Password should contain...", weak_password: { reasons: ["characters"] } },
      "Dit wachtwoord voldoet niet aan de eisen.",
    ],
    [
      "same_password",
      422,
      { code: "same_password", msg: "New password should be different from the old password." },
      "Kies een ander wachtwoord dan je huidige.",
    ],
  ] as const) {
    test(`updateUser weigert met ${naam} → "${melding}"`, async ({ page }) => {
      const calls = await mockAuth(page, {
        updateUser: () => [status, body],
      });
      await page.goto(RESET_URL);
      await page.getByLabel("Nieuw wachtwoord").fill("Aurora#2026");
      await page.getByLabel("Herhaal wachtwoord").fill("Aurora#2026");
      await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();

      await expect(alertOf(page)).toHaveText(melding);
      await expect(page).toHaveURL(RESET_URL);
      expect(calls.logout).toBe(0);
    });
  }

  test("'Nieuwe link aanvragen' opent op /portal direct de aanvraagweergave", async ({ page }) => {
    await mockAuth(page);
    await page.goto("/portal/wachtwoord-herstellen");
    await page.getByRole("link", { name: "Nieuwe link aanvragen" }).click();

    await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeVisible();
    await expect(page).toHaveURL(/\/portal$/);
  });
});

test.describe("gemockt — ?wachtwoord=-param op /portal", () => {
  test("/portal?wachtwoord=vergeten opent direct de aanvraagweergave", async ({ page }) => {
    await mockAuth(page);
    await page.goto("/portal?wachtwoord=vergeten");
    await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("/portal?wachtwoord=gewijzigd toont de melding en kiest methode Wachtwoord", async ({
    page,
  }) => {
    await mockAuth(page);
    await page.goto("/portal?wachtwoord=gewijzigd");
    await expect(
      page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[value="password"]')).toBeChecked();
  });

  test("de param wordt uit de URL gehaald — een herlaadactie toont de melding niet opnieuw", async ({
    page,
  }) => {
    await mockAuth(page);
    await page.goto("/portal?wachtwoord=gewijzigd");
    await expect(
      page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/portal$/);

    await page.reload();
    await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.getByText("Je wachtwoord is gewijzigd.")).toHaveCount(0);
  });
});
