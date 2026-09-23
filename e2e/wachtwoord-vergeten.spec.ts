import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * docs/features/wachtwoord-vergeten.md — gedrag (niet a11y; de axe-scans
 * van dezelfde schermen staan in e2e/a11y.spec.ts). Dekt de Schermflow en
 * de Randgevallen-tabel met de Supabase Auth-endpoints gemockt via
 * `page.route()`: de browser-client (src/lib/supabase/client.ts) praat
 * rechtstreeks met `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/...`, dus welke
 * host dat ook is (lokale stack in CI, of een nep-URL lokaal) — het pad
 * matcht. Geen echte database of mail nodig; wat hier níét te toetsen is
 * (de echte Supabase-mail, de dashboard-wachtwoordregels, het
 * apparaat-onafhankelijke verifyOtp tegen echte GoTrue) staat in het
 * Tester-rapport van PR #69 als handmatige controle.
 *
 * Supabase-foutbodies volgen de API-versie 2024-01-01 (`code` + `msg`),
 * met de header waaraan auth-js die versie herkent — zonder die header
 * leest auth-js `code` niet en zou de weak_password-/same_password-mapping
 * hier onterecht falen.
 */

const AUTH_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "x-supabase-api-version",
  "content-type": "application/json",
  "x-supabase-api-version": "2024-01-01",
};

const VALID_PASSWORD = "Aurora#2026";

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "femke.bos@aurora.local",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ sub: USER.id, aud: "authenticated", role: "authenticated", exp, email: USER.email }),
    "nep-handtekening",
  ].join(".");
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "nep-refresh-token",
    user: USER,
  };
}

/** De eigen `role="alert"` van het scherm — niet Next.js' route-announcer. */
function alertOf(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, headers: AUTH_HEADERS, body: JSON.stringify(body) });
}

type AuthMock = {
  verify: Array<Record<string, unknown>>;
  updateUser: Array<Record<string, unknown>>;
  logout: number;
  recover: Array<{ url: string; body: Record<string, unknown> }>;
};

/**
 * Onderschept de vier auth-calls van deze feature. Elke `respond*` krijgt
 * het volgnummer van de aanroep (0, 1, ...), zodat een test een eerste
 * poging kan laten falen en een tweede laten slagen.
 */
async function mockAuth(
  page: Page,
  handlers: {
    verify?: (n: number) => [number, unknown];
    updateUser?: (n: number) => [number, unknown];
    recover?: (n: number) => [number, unknown] | "abort";
    logoutStatus?: number;
  } = {}
): Promise<AuthMock> {
  const calls: AuthMock = { verify: [], updateUser: [], logout: 0, recover: [] };

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
    const [status, body] = handlers.updateUser?.(n) ?? [200, USER];
    return json(route, status, body);
  });

  await page.route(/\/auth\/v1\/logout(\?|$)/, async (route) => {
    calls.logout += 1;
    const status = handlers.logoutStatus ?? 204;
    if (status === 204) return route.fulfill({ status, headers: AUTH_HEADERS, body: "" });
    return json(route, status, { code: "unexpected_failure", msg: "logout mislukt" });
  });

  await page.route(/\/auth\/v1\/recover(\?|$)/, async (route) => {
    const n = calls.recover.length;
    calls.recover.push({ url: route.request().url(), body: route.request().postDataJSON() });
    const result = handlers.recover?.(n) ?? [200, {}];
    if (result === "abort") return route.abort("connectionfailed");
    return json(route, result[0], result[1]);
  });

  return calls;
}

// ---------------------------------------------------------------------------
// Stap 3 — /beheer/wachtwoord-herstellen
// ---------------------------------------------------------------------------

const RESET_URL = "/beheer/wachtwoord-herstellen?token_hash=hash-uit-mail&type=recovery";
const LINK_INVALID = "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.";

async function fillPasswords(page: Page, password: string, repeat = password) {
  await page.getByLabel("Nieuw wachtwoord").fill(password);
  await page.getByLabel("Herhaal wachtwoord").fill(repeat);
}

test.describe("wachtwoord herstellen — link ongeldig zonder de server te raken", () => {
  for (const [name, path] of [
    ["zonder token_hash", "/beheer/wachtwoord-herstellen"],
    ["zonder type", "/beheer/wachtwoord-herstellen?token_hash=abc"],
    ["met type=email (magic link, geen herstel)", "/beheer/wachtwoord-herstellen?token_hash=abc&type=email"],
    ["met type=RECOVERY (hoofdletters)", "/beheer/wachtwoord-herstellen?token_hash=abc&type=RECOVERY"],
    ["met lege token_hash", "/beheer/wachtwoord-herstellen?token_hash=&type=recovery"],
  ] as const) {
    test(`${name} → direct "link verlopen", geen formulier, geen verifyOtp`, async ({ page }) => {
      const calls = await mockAuth(page);
      await page.goto(path);

      await expect(alertOf(page)).toHaveText(LINK_INVALID);
      await expect(page.getByLabel("Nieuw wachtwoord")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Wachtwoord opslaan" })).toHaveCount(0);

      const nieuweLink = page.getByRole("link", { name: "Nieuwe link aanvragen" });
      await expect(nieuweLink).toHaveAttribute("href", "/beheer?wachtwoord=vergeten");
      expect(calls.verify).toHaveLength(0);
    });
  }

  test("'Nieuwe link aanvragen' opent op /beheer direct de aanvraagweergave", async ({ page }) => {
    await mockAuth(page);
    await page.goto("/beheer/wachtwoord-herstellen");
    await page.getByRole("link", { name: "Nieuwe link aanvragen" }).click();

    await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeVisible();
    await expect(page).toHaveURL(/\/beheer$/);
    await expect(page.getByRole("button", { name: "Stuur herstellink" })).toBeVisible();
  });
});

test("openen van de herstellink wisselt het token niet in (mailscanner-bescherming)", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await page.goto(RESET_URL);
  await expect(page.getByRole("heading", { name: "Nieuw wachtwoord instellen" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.waitForLoadState("networkidle");

  expect(calls.verify).toHaveLength(0);
  expect(calls.updateUser).toHaveLength(0);
});

test("opslaan-knop pas actief als alle regels voldaan zijn en beide velden gelijk", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto(RESET_URL);
  const opslaan = page.getByRole("button", { name: "Wachtwoord opslaan" });
  const herhaal = page.getByLabel("Herhaal wachtwoord");

  await expect(opslaan).toBeDisabled();

  // Eén regel onvoldaan per geval (lengte, kleine letter, hoofdletter,
  // cijfer, leesteken), telkens met gelijke velden.
  for (const zwak of ["Aa1!xyz", "AURORA#2026", "aurora#2026", "Aurora#abcd", "Aurora2026x"]) {
    await fillPasswords(page, zwak);
    await expect(opslaan, `${zwak} zou onvoldoende moeten zijn`).toBeDisabled();
  }

  // Sterk, maar ongelijk.
  await fillPasswords(page, VALID_PASSWORD, `${VALID_PASSWORD}x`);
  await expect(opslaan).toBeDisabled();
  await expect(page.getByText("de wachtwoorden zijn niet gelijk")).toBeVisible();
  await expect(herhaal).toHaveAttribute("aria-invalid", "true");

  await fillPasswords(page, VALID_PASSWORD);
  await expect(opslaan).toBeEnabled();
  await expect(page.getByText("de wachtwoorden zijn niet gelijk")).toHaveCount(0);
  await expect(herhaal).toHaveAttribute("aria-invalid", "false");
});

test("checklist: per regel 'voldaan'/'nog niet' voor schermlezers, gekoppeld via aria-describedby", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto(RESET_URL);
  const veld = page.getByLabel("Nieuw wachtwoord");

  await expect(veld).toHaveAttribute("autocomplete", "new-password");
  await expect(page.getByLabel("Herhaal wachtwoord")).toHaveAttribute("autocomplete", "new-password");

  const describedBy = await veld.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  const checklist = page.locator(`[id="${describedBy}"]`);
  await expect(checklist.getByRole("listitem")).toHaveCount(5);
  await expect(checklist).not.toContainText("voldaan:");

  await veld.fill("abc");
  await expect(checklist.getByRole("listitem").filter({ hasText: "een kleine letter" })).toContainText(
    "voldaan:"
  );
  await expect(checklist.getByRole("listitem").filter({ hasText: "een hoofdletter" })).toContainText(
    "nog niet:"
  );

  await veld.fill(VALID_PASSWORD);
  for (const item of await checklist.getByRole("listitem").all()) {
    await expect(item).toContainText("voldaan:");
  }
});

test("happy path: verifyOtp → updateUser → signOut → /beheer?wachtwoord=gewijzigd", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await page.goto(RESET_URL);
  await fillPasswords(page, VALID_PASSWORD);
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();

  // De ?wachtwoord=gewijzigd-param wordt na het lezen uit de URL gehaald
  // (Reviewer B1), dus de melding is het bewijs dat hij aankwam.
  await expect(
    page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
  ).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/beheer$/);

  expect(calls.verify).toEqual([
    expect.objectContaining({ token_hash: "hash-uit-mail", type: "recovery" }),
  ]);
  expect(calls.updateUser).toEqual([expect.objectContaining({ password: VALID_PASSWORD })]);
  expect(calls.logout).toBe(1);

  // BeheerLogin: melding bovenaan (role=status), methode Wachtwoord gekozen.
  await expect(
    page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
  ).toHaveText("Je wachtwoord is gewijzigd. Log in met je nieuwe wachtwoord.");
  await expect(page.locator('input[value="password"]')).toBeChecked();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("signOut faalt serverside → toch terug naar het inlogscherm met de melding (besluit 2)", async ({
  page,
}) => {
  // auth-js verwijdert de lokale sessie ook als /logout faalt; de hook
  // negeert de signOut-fout en stuurt door. Deze test legt vast dat een
  // mislukte uitlog de gebruiker niet op het herstelscherm laat hangen.
  const calls = await mockAuth(page, { logoutStatus: 500 });
  await page.goto(RESET_URL);
  await fillPasswords(page, VALID_PASSWORD);
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();

  // De ?wachtwoord=gewijzigd-param wordt na het lezen uit de URL gehaald
  // (Reviewer B1), dus de melding is het bewijs dat hij aankwam.
  await expect(
    page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
  ).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/beheer$/);
  expect(calls.logout).toBe(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
  ).toBeVisible();
});

test("verifyOtp faalt (verlopen/al gebruikt) → 'link verlopen', geen updateUser, niet uitgelogd-en-doorgestuurd", async ({
  page,
}) => {
  const calls = await mockAuth(page, {
    verify: () => [403, { code: "otp_expired", msg: "Email link is invalid or has expired" }],
  });
  await page.goto(RESET_URL);
  await fillPasswords(page, VALID_PASSWORD);
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();

  await expect(alertOf(page)).toHaveText(LINK_INVALID);
  await expect(page.getByLabel("Nieuw wachtwoord")).toHaveCount(0);
  expect(calls.verify).toHaveLength(1);
  expect(calls.updateUser).toHaveLength(0);
  expect(calls.logout).toBe(0);
  await expect(page).toHaveURL(RESET_URL);
});

test("verifyOtp lukt, updateUser faalt → foutmelding; tweede poging slaat verifyOtp over", async ({
  page,
}) => {
  const calls = await mockAuth(page, {
    updateUser: (n) => (n === 0 ? [500, { code: "unexpected_failure", msg: "boom" }] : [200, USER]),
  });
  await page.goto(RESET_URL);
  await fillPasswords(page, VALID_PASSWORD);
  const opslaan = page.getByRole("button", { name: "Wachtwoord opslaan" });
  await opslaan.click();

  await expect(alertOf(page)).toHaveText("er ging iets mis, probeer het opnieuw");
  // Formulier blijft staan, waarden blijven staan, knop weer bruikbaar.
  await expect(page.getByLabel("Nieuw wachtwoord")).toHaveValue(VALID_PASSWORD);
  await expect(opslaan).toBeEnabled();
  expect(calls.verify).toHaveLength(1);
  expect(calls.updateUser).toHaveLength(1);
  expect(calls.logout).toBe(0);

  await opslaan.click();
  // De ?wachtwoord=gewijzigd-param wordt na het lezen uit de URL gehaald
  // (Reviewer B1), dus de melding is het bewijs dat hij aankwam.
  await expect(
    page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
  ).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/beheer$/);
  expect(calls.verify, "tweede poging mag het verbruikte token niet opnieuw proberen").toHaveLength(1);
  expect(calls.updateUser).toHaveLength(2);
  expect(calls.logout).toBe(1);
});

for (const [name, status, body, melding] of [
  [
    "weak_password",
    422,
    {
      code: "weak_password",
      msg: "Password should contain at least one character of each: ...",
      weak_password: { reasons: ["characters"] },
    },
    "Dit wachtwoord voldoet niet aan de eisen.",
  ],
  [
    "same_password",
    422,
    { code: "same_password", msg: "New password should be different from the old password." },
    "Kies een ander wachtwoord dan je huidige.",
  ],
  [
    "rate limit",
    429,
    { code: "over_request_rate_limit", msg: "Request rate limit reached" },
    "te veel pogingen — probeer het over een paar minuten opnieuw",
  ],
] as const) {
  test(`updateUser weigert met ${name} → "${melding}", niet doorgestuurd`, async ({ page }) => {
    const calls = await mockAuth(page, { updateUser: () => [status, body] });
    await page.goto(RESET_URL);
    await fillPasswords(page, VALID_PASSWORD);
    await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();

    await expect(alertOf(page)).toHaveText(melding);
    await expect(page).toHaveURL(RESET_URL);
    expect(calls.logout).toBe(0);
  });
}

test("herhaal-veld enter-submit met ongeldig wachtwoord doet niets (geen verifyOtp)", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await page.goto(RESET_URL);
  await fillPasswords(page, "zwak", "zwak");
  await page.getByLabel("Herhaal wachtwoord").press("Enter");
  await page.waitForTimeout(500);
  expect(calls.verify).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Stap 1 — aanvragen op /beheer
// ---------------------------------------------------------------------------

async function openForgotFromLogin(page: Page, email?: string) {
  await page.goto("/beheer");
  const emailVeld = page.locator('input[type="email"]');
  await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
  if (email) await emailVeld.fill(email);
  await page.locator('label:has(input[value="password"])').click();
  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeVisible();
}

test("'Wachtwoord vergeten?' staat alleen bij de methode Wachtwoord", async ({ page }) => {
  await mockAuth(page);
  await page.goto("/beheer");
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });

  await page.locator('label:has(input[value="magic_link"])').click();
  await expect(page.getByRole("button", { name: "Wachtwoord vergeten?" })).toHaveCount(0);

  await page.locator('label:has(input[value="password"])').click();
  await expect(page.getByRole("button", { name: "Wachtwoord vergeten?" })).toBeVisible();
});

test("aanvragen: e-mail voorgevuld, resetPasswordForEmail met redirect naar het herstelscherm", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await openForgotFromLogin(page, "femke.bos@aurora.local");

  await expect(page.locator('input[type="email"]')).toHaveValue("femke.bos@aurora.local");
  await page.getByRole("button", { name: "Stuur herstellink" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Als er een account bij femke.bos@aurora.local hoort, hebben we een link gestuurd"
  );
  await expect(page.getByText("De link is 1 uur geldig.")).toBeVisible();

  expect(calls.recover).toHaveLength(1);
  expect(calls.recover[0].body).toEqual(expect.objectContaining({ email: "femke.bos@aurora.local" }));
  const redirectTo = new URL(calls.recover[0].url).searchParams.get("redirect_to");
  const origin = new URL(page.url()).origin;
  expect(redirectTo).toBe(`${origin}/beheer/wachtwoord-herstellen`);
});

// Geen e-mail-enumeratie (spec → besluit 4): elke fout behalve een rate
// limit geeft exact dezelfde melding als een geslaagde aanvraag.
for (const [name, result] of [
  ["onbekend adres (Supabase: 200 {})", [200, {}]],
  ["validatiefout", [400, { code: "validation_failed", msg: "Unable to validate email address" }]],
  ["gebruiker niet gevonden", [404, { code: "user_not_found", msg: "User not found" }]],
  ["mail versturen mislukt", [500, { code: "unexpected_failure", msg: "Error sending recovery email" }]],
  ["netwerkfout", "abort"],
] as const) {
  test(`aanvragen, ${name} → dezelfde neutrale melding`, async ({ page }) => {
    await mockAuth(page, { recover: () => result as [number, unknown] | "abort" });
    await openForgotFromLogin(page, "wie@example.org");
    await page.getByRole("button", { name: "Stuur herstellink" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "Als er een account bij wie@example.org hoort, hebben we een link gestuurd om een nieuw wachtwoord in te stellen."
    );
    await expect(page.getByText("te veel pogingen")).toHaveCount(0);
  });
}

test("aanvragen, e-mail rate limit → 'te veel pogingen', formulier blijft staan", async ({
  page,
}) => {
  const calls = await mockAuth(page, {
    recover: (n) =>
      n === 0 ? [429, { code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }] : [200, {}],
  });
  await openForgotFromLogin(page, "femke.bos@aurora.local");
  const stuur = page.getByRole("button", { name: "Stuur herstellink" });
  await stuur.click();

  await expect(alertOf(page)).toHaveText(
    "te veel pogingen — probeer het over een paar minuten opnieuw"
  );
  await expect(page.getByText("Als er een account bij")).toHaveCount(0);
  await expect(stuur).toBeEnabled();

  // Later opnieuw: nu wel de neutrale melding.
  await stuur.click();
  await expect(page.getByRole("status")).toContainText("Als er een account bij femke.bos@aurora.local");
  expect(calls.recover).toHaveLength(2);
});

test("aanvraagweergave: '← terug naar inloggen' toont weer het inlogformulier, ook na versturen", async ({
  page,
}) => {
  await mockAuth(page);
  await openForgotFromLogin(page, "femke.bos@aurora.local");

  await page.getByRole("button", { name: "← terug naar inloggen" }).click();
  await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inloggen" })).toBeVisible();

  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await page.getByRole("button", { name: "Stuur herstellink" }).click();
  await expect(page.getByRole("status")).toContainText("Als er een account bij");
  await page.getByRole("button", { name: "← terug naar inloggen" }).click();
  await expect(page.getByRole("button", { name: "Inloggen" })).toBeVisible();

  // Opnieuw openen begint met een leeg aanvraagformulier, niet met de oude melding.
  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await expect(page.getByRole("button", { name: "Stuur herstellink" })).toBeVisible();
});

test("/beheer?wachtwoord=vergeten opent direct de aanvraagweergave", async ({ page }) => {
  await mockAuth(page);
  await page.goto("/beheer?wachtwoord=vergeten");
  await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Stuur herstellink" })).toBeVisible();
});

test("/beheer?wachtwoord=gewijzigd: melding + methode Wachtwoord; 'vergeten?' verbergt de melding", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/beheer?wachtwoord=gewijzigd");
  const melding = page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." });
  await expect(melding).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('input[value="password"]')).toBeChecked();

  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await expect(melding).toHaveCount(0);
});

test("/beheer zonder of met onbekende ?wachtwoord= toont geen van beide", async ({ page }) => {
  await mockAuth(page);
  for (const path of ["/beheer", "/beheer?wachtwoord=iets"]) {
    await page.goto(path);
    await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.getByText("Je wachtwoord is gewijzigd.")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toHaveCount(0);
    await expect(page.locator('input[value="magic_link"]')).toBeChecked();
  }
});

/**
 * Reviewer B1 (PR #69): de ?wachtwoord=-param bleef in de URL staan, dus een
 * latere remount van BeheerLogin (bv. na Uitloggen) toonde de melding of de
 * aanvraagweergave opnieuw. Een herlaadactie simuleert die remount.
 */
for (const param of ["gewijzigd", "vergeten"]) {
  test(`?wachtwoord=${param} wordt uit de URL gehaald en komt na herladen niet terug`, async ({
    page,
  }) => {
    await mockAuth(page);
    await page.goto(`/beheer?wachtwoord=${param}`);
    const signaal =
      param === "gewijzigd"
        ? page.getByRole("status").filter({ hasText: "Je wachtwoord is gewijzigd." })
        : page.getByRole("heading", { name: "Wachtwoord vergeten" });
    await expect(signaal).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/beheer$/);

    await page.reload();
    await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });
    await expect(signaal).toHaveCount(0);
  });
}

/**
 * Reviewer B2 (PR #69): bij het wisselen van weergave verdween de aangeklikte
 * knop en viel de focus terug op <body> (WCAG 2.4.3).
 */
test("focus volgt het wisselen tussen inloggen, vergeten en verstuurd", async ({ page }) => {
  await mockAuth(page);
  await page.goto("/beheer");
  await page.getByText("Wachtwoord", { exact: true }).click();

  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeFocused();

  await page.getByRole("button", { name: "← terug naar inloggen" }).click();
  await expect(page.getByLabel("E-mailadres")).toBeFocused();

  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await page.getByLabel("E-mailadres").fill("femke.bos@aurora.local");
  await page.getByRole("button", { name: "Stuur herstellink" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Als er een account" })).toBeFocused();
});
