import { test, expect, type Page } from "@playwright/test";
import { SUPABASE_HEADERS, USER, alertOf, fakeSession, json } from "./helpers/supabaseMock";

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
 * Mock-bouwstenen (headers, nep-sessie, alertOf) staan in
 * e2e/helpers/supabaseMock.ts, gedeeld met e2e/ledenbeheer-invite.spec.ts.
 */

const VALID_PASSWORD = "Aurora#2026";

type AuthMock = {
  verify: Array<Record<string, unknown>>;
  updateUser: Array<Record<string, unknown>>;
  logout: number;
  recover: Array<{ url: string; body: Record<string, unknown> }>;
  otp: Array<Record<string, unknown>>;
  token: Array<{ url: string; body: Record<string, unknown> }>;
};

/**
 * Onderschept de auth-calls van deze feature (plus `otp` en `token`, de
 * magic link en de wachtwoordlogin van het inlogformulier zelf). Elke `respond*` krijgt
 * het volgnummer van de aanroep (0, 1, ...), zodat een test een eerste
 * poging kan laten falen en een tweede laten slagen.
 */
async function mockAuth(
  page: Page,
  handlers: {
    verify?: (n: number) => [number, unknown];
    updateUser?: (n: number) => [number, unknown];
    recover?: (n: number) => [number, unknown] | "abort";
    otp?: (n: number) => [number, unknown];
    token?: (n: number) => [number, unknown];
    logoutStatus?: number;
  } = {}
): Promise<AuthMock> {
  const calls: AuthMock = {
    verify: [],
    updateUser: [],
    logout: 0,
    recover: [],
    otp: [],
    token: [],
  };

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
    if (status === 204) return route.fulfill({ status, headers: SUPABASE_HEADERS, body: "" });
    return json(route, status, { code: "unexpected_failure", msg: "logout mislukt" });
  });

  await page.route(/\/auth\/v1\/recover(\?|$)/, async (route) => {
    const n = calls.recover.length;
    calls.recover.push({ url: route.request().url(), body: route.request().postDataJSON() });
    const result = handlers.recover?.(n) ?? [200, {}];
    if (result === "abort") return route.abort("connectionfailed");
    return json(route, result[0], result[1]);
  });

  await page.route(/\/auth\/v1\/otp(\?|$)/, async (route) => {
    const n = calls.otp.length;
    calls.otp.push(route.request().postDataJSON());
    const [status, body] = handlers.otp?.(n) ?? [200, {}];
    return json(route, status, body);
  });

  // signInWithPassword (grant_type=password). Zonder handler: een
  // invalid_credentials-weigering — een geslaagde login zou BeheerLogin
  // unmounten, en geen enkele test hier heeft dat nodig.
  await page.route(/\/auth\/v1\/token(\?|$)/, async (route) => {
    const n = calls.token.length;
    calls.token.push({ url: route.request().url(), body: route.request().postDataJSON() });
    const [status, body] = handlers.token?.(n) ?? [
      400,
      { code: "invalid_credentials", msg: "Invalid login credentials" },
    ];
    return json(route, status, body);
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

// Geen e-mail-enumeratie (spec → besluit 4): elke fout, ook een rate
// limit (zie de test daaronder), geeft exact dezelfde melding als een
// geslaagde aanvraag.
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

// Besloten door Bram (2026-09-23, Reviewer PR #69): ook een rate limit geeft
// de neutrale melding. GoTrue raakt de mail-limiet alleen bij een bestaand
// adres; "te veel pogingen" zou dus verraden dat het adres een account heeft.
for (const [name, body] of [
  ["projectbrede mail-limiet", { code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }],
  [
    "throttle per adres",
    { code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 42 seconds." },
  ],
] as const) {
  test(`aanvragen, ${name} (429) → dezelfde neutrale melding, geen 'te veel pogingen'`, async ({
    page,
  }) => {
    const calls = await mockAuth(page, { recover: () => [429, body] });
    await openForgotFromLogin(page, "femke.bos@aurora.local");
    await page.getByRole("button", { name: "Stuur herstellink" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "Als er een account bij femke.bos@aurora.local hoort, hebben we een link gestuurd om een nieuw wachtwoord in te stellen."
    );
    await expect(page.getByText("te veel pogingen")).toHaveCount(0);
    expect(calls.recover).toHaveLength(1);
  });
}

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

// #72 — hetzelfde focuspatroon op de magic-link-weergaven van het formulier.
test("focus volgt 'Stuur inloglink' en 'Andere inlogmethode'", async ({ page }) => {
  const calls = await mockAuth(page);
  await page.goto("/beheer");
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });

  await page.getByLabel("E-mailadres").fill("femke.bos@aurora.local");
  await page.getByRole("button", { name: "Stuur inloglink" }).click();
  await expect(page.getByRole("status").filter({ hasText: "We hebben een inloglink gestuurd" })).toBeFocused();
  expect(calls.otp).toHaveLength(1);

  await page.getByRole("button", { name: "Andere inlogmethode" }).click();
  await expect(page.getByLabel("E-mailadres")).toBeFocused();
});

/**
 * Tester (#72) — randgevallen rond dezelfde fix. `focusAfterSwitch` wordt
 * in `onSubmit` ook gezet als de magic link daarna mislukt, en nooit
 * teruggezet; deze tests leggen vast dat dat geen latere focussprong geeft
 * en dat de focus alleen verhuist wanneer de weergave echt wisselt.
 */
const MAGIC_LINK_SENT = "We hebben een inloglink gestuurd";

/**
 * De foutregel ín het inlogformulier. Niet alertOf(): op een tablet (en in
 * CI) logt de middleware /beheer in als het gedeelde device-account, en dan
 * staat er boven het formulier nog een tweede alert ("Dit account is niet
 * gekoppeld aan een lid").
 */
function formulierAlert(page: Page) {
  return page.locator("form").getByRole("alert");
}

async function openLogin(page: Page) {
  await page.goto("/beheer");
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 15_000 });
}

test("eerste render van /beheer zet de focus nergens heen (geen autofocus)", async ({ page }) => {
  await mockAuth(page);
  await openLogin(page);
  await expect(page.getByLabel("E-mailadres")).not.toBeFocused();

  await page.goto("/beheer?wachtwoord=vergeten");
  await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).not.toBeFocused();
});

for (const [name, status, body, melding] of [
  [
    "rate limit (429)",
    429,
    { code: "over_email_send_rate_limit", msg: "email rate limit exceeded" },
    "te veel pogingen — probeer het over een paar minuten opnieuw",
  ],
  ["serverfout (500)", 500, { code: "unexpected_failure", msg: "Error sending magic link" }, "er ging iets mis, probeer het opnieuw"],
] as const) {
  test(`magic link mislukt, ${name} → formulier blijft bruikbaar, geen verstuurd-melding; tweede poging krijgt de focus`, async ({
    page,
  }) => {
    const calls = await mockAuth(page, { otp: (n) => (n === 0 ? [status, body] : [200, {}]) });
    await openLogin(page);
    const emailVeld = page.getByLabel("E-mailadres");
    const verstuurd = page.getByRole("status").filter({ hasText: MAGIC_LINK_SENT });
    const knop = page.getByRole("button", { name: "Stuur inloglink" });

    await emailVeld.fill("femke.bos@aurora.local");
    await knop.click();

    await expect(formulierAlert(page)).toHaveText(melding);
    await expect(verstuurd).toHaveCount(0);
    await expect(emailVeld).toHaveValue("femke.bos@aurora.local");
    await expect(knop).toBeEnabled();
    expect(calls.otp).toHaveLength(1);

    await knop.click();
    await expect(verstuurd).toBeFocused();
    await expect(verstuurd).toContainText("femke.bos@aurora.local");
    expect(calls.otp).toHaveLength(2);
  });
}

test("na een mislukte magic link: wisselen van methode en 'vergeten' geven geen onverwachte focussprong", async ({
  page,
}) => {
  await mockAuth(page, {
    otp: () => [500, { code: "unexpected_failure", msg: "Error sending magic link" }],
  });
  await openLogin(page);
  const emailVeld = page.getByLabel("E-mailadres");
  await emailVeld.fill("femke.bos@aurora.local");
  await page.getByRole("button", { name: "Stuur inloglink" }).click();
  await expect(formulierAlert(page)).toHaveText("er ging iets mis, probeer het opnieuw");

  // Methode wisselen: focus blijft op de gekozen radio, springt niet naar
  // het e-mailveld door een achtergebleven focusAfterSwitch.
  await page.locator('label:has(input[value="password"])').click();
  await expect(page.locator('input[value="password"]')).toBeFocused();
  await page.locator('input[type="password"]').fill("iets");
  await expect(page.locator('input[type="password"]')).toBeFocused();

  // De vergeten-flow werkt daarna precies als zonder mislukte poging.
  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeFocused();
  await page.getByRole("button", { name: "← terug naar inloggen" }).click();
  await expect(emailVeld).toBeFocused();
});

test("herhaald wisselen: verstuurd → andere methode → opnieuw versturen, focus volgt elke keer", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await openLogin(page);
  const emailVeld = page.getByLabel("E-mailadres");
  const verstuurd = page.getByRole("status").filter({ hasText: MAGIC_LINK_SENT });

  await emailVeld.fill("femke.bos@aurora.local");
  for (let ronde = 1; ronde <= 3; ronde++) {
    await page.getByRole("button", { name: "Stuur inloglink" }).click();
    await expect(verstuurd, `ronde ${ronde}: verstuurd-melding`).toBeFocused();

    await page.getByRole("button", { name: "Andere inlogmethode" }).click();
    await expect(emailVeld, `ronde ${ronde}: e-mailveld`).toBeFocused();
    // Terug in het formulier: adres en methode staan er nog.
    await expect(emailVeld).toHaveValue("femke.bos@aurora.local");
    await expect(page.locator('input[value="magic_link"]')).toBeChecked();
  }
  expect(calls.otp).toHaveLength(3);

  // Na terugkeren is ook de wachtwoordweg nog bruikbaar, incl. 'vergeten'.
  await page.locator('label:has(input[value="password"])').click();
  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await expect(page.getByRole("heading", { name: "Wachtwoord vergeten" })).toBeFocused();
});

test("magic link via Enter in het e-mailveld: verstuurd-melding krijgt de focus", async ({ page }) => {
  const calls = await mockAuth(page);
  await openLogin(page);
  await page.getByLabel("E-mailadres").fill("femke.bos@aurora.local");
  await page.getByLabel("E-mailadres").press("Enter");

  await expect(page.getByRole("status").filter({ hasText: MAGIC_LINK_SENT })).toBeFocused();
  expect(calls.otp).toHaveLength(1);
});

test("mislukte wachtwoordlogin: foutmelding, geen focussprong naar het e-mailveld of een melding", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await openLogin(page);
  const emailVeld = page.getByLabel("E-mailadres");
  const wachtwoordVeld = page.locator('input[type="password"]');

  await emailVeld.fill("femke.bos@aurora.local");
  await page.locator('label:has(input[value="password"])').click();
  await wachtwoordVeld.fill("fout-wachtwoord");
  await wachtwoordVeld.press("Enter");

  await expect(formulierAlert(page)).toHaveText("onjuist e-mailadres of wachtwoord");
  // Via het toetsenbord verstuurd: de focus blijft in het wachtwoordveld.
  await expect(wachtwoordVeld).toBeFocused();
  await expect(wachtwoordVeld).toHaveValue("fout-wachtwoord");
  expect(calls.token).toHaveLength(1);
  expect(calls.otp).toHaveLength(0);

  // Via de knop: dezelfde melding, geen verstuurd-weergave. Waar de focus
  // dan hoort staat nog open (#77, zie de fixme-test hieronder).
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect.poll(() => calls.token.length).toBe(2);
  await expect(formulierAlert(page)).toHaveText("onjuist e-mailadres of wachtwoord");
  await expect(page.getByRole("status").filter({ hasText: MAGIC_LINK_SENT })).toHaveCount(0);
});

// #77 — na een mislukte poging via de knop valt de focus nu naar <body>
// (de knop is tijdens `pending` disabled). Waar hij wél heen moet, beslist
// de Architect; deze tests gaan aan met de fix voor #77.
for (const methode of ["magic_link", "password"] as const) {
  test.fixme(`mislukte poging via de knop (${methode}): focus valt niet naar <body> (#77)`, async ({
    page,
  }) => {
    await mockAuth(page, { otp: () => [500, { code: "unexpected_failure", msg: "mislukt" }] });
    await openLogin(page);
    await page.getByLabel("E-mailadres").fill("femke.bos@aurora.local");
    if (methode === "password") {
      await page.locator('label:has(input[value="password"])').click();
      await page.locator('input[type="password"]').fill("fout-wachtwoord");
    }
    await page
      .getByRole("button", { name: methode === "password" ? "Inloggen" : "Stuur inloglink" })
      .click();
    await expect(formulierAlert(page)).not.toHaveText("");

    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });
}
