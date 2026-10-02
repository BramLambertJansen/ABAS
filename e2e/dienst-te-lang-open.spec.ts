import { test, expect, type Page } from "@playwright/test";
import { USER, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

/**
 * De melding "Dienst staat nog open" (docs/features/dienst-te-lang-open.md →
 * Testgevallen → Functionele e2e): de vier gedragingen die in React-state
 * zitten en dus niet unit-testbaar zijn (de pure beslissing zelf staat in
 * test/dienstTeLangOpen.test.ts).
 *
 * Elke test mockt Supabase via `page.route()`, zelfde aanpak als
 * e2e/bestelling-terugdraaien.spec.ts: de login, de REST-lezingen en, sinds
 * dienst-per-sessie (ADR 0016), de bar-sessie (`my_bar_state` met een
 * bevestigde sessie in modus bar en een eigen dienst). Zo bepaalt de test
 * zelf `started_at`, en raakt hij de ene gedeelde open dienst van de echte
 * database niet — die is van het `describe.serial`-block in
 * e2e/a11y.spec.ts, dat parallel aan dit bestand kan draaien. De browserklok
 * loopt via `page.clock`, zodat een uur snooze in een seconde voorbij is.
 */

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const SHIFT_ID = "00000000-0000-4000-8000-0000000000d1";
const TOM = { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom Willems" };
const ANNA = { id: "00000000-0000-4000-8000-0000000000d3", name: "Anna de Vries" };

/** Een sessie die voor de verschoven browserklok niet verlopen is: de
 *  auto-refresh van auth-js vuurt bij elke klokspong, en mag dan geen
 *  refresh-lus beginnen. */
function longLivedSession() {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  return { ...fakeSession(), expires_in: exp - Math.floor(Date.now() / 1000), expires_at: exp };
}

async function mockBar(page: Page, startedAt: string) {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, longLivedSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(route, 200, {
      id: SHIFT_ID,
      started_at: startedAt,
      members: { name: TOM.name },
      activity_types: { name: "Training" },
    })
  );
  await page.route(/\/rest\/v1\/shift_members(\?|$)/, (route) =>
    json(route, 200, [
      { member_id: TOM.id, added_at: startedAt, members: { name: TOM.name } },
    ])
  );
  await page.route(/\/rest\/v1\/products(\?|$)/, (route) =>
    json(route, 200, [
      { id: "00000000-0000-4000-8000-0000000000e1", name: "Pils", category: "Bier", price_cents: 250 },
    ])
  );
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) =>
    json(route, 200, [{ id: ANNA.id, name: ANNA.name, balance_cents: 1240 }])
  );
  await page.route(/\/rest\/v1\/app_settings(\?|$)/, (route) =>
    json(route, 200, { negative_limit_cents: 0, low_balance_threshold_cents: 1000 })
  );
}

/** Zet de mocks met een dienst die `openForMs` geleden startte, logt in en
 *  komt op de Verkoop-tab. De sessie is een bevestigde bar-sessie met deze
 *  dienst als eigen dienst; de login loopt via het (gemockte) `/beheer`-
 *  formulier, en een bar-sessie stuurt `/beheer` door naar `/`. De klok is
 *  vóór de eerste navigatie geïnstalleerd en loopt tot een `fastForward`
 *  gewoon mee. */
async function openBar(page: Page, openForMs: number) {
  await page.clock.install();
  const startedAt = new Date(Date.now() - openForMs).toISOString();
  await mockBar(page, startedAt);
  const sessie = await mockBarSessie(page, {
    naam: TOM.name,
    rol: "bardienst",
    voorgeregistreerd: "bar",
    bevestigd: true,
    shift: { id: SHIFT_ID, startedAt, startedByName: TOM.name, activityTypeName: "Training" },
  });
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page
    .getByRole("tab", { name: "Verkoop" })
    .waitFor({ state: "visible", timeout: 15_000 });
  return sessie;
}

function melding(page: Page) {
  return page.getByRole("dialog", { name: "Dienst staat nog open" });
}

/** Geen melding, ook niet na een korte wachttijd: een render na de tick
 *  mag niet net na de assertie alsnog binnenkomen. */
async function expectNoMelding(page: Page) {
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("uitstellen: de melding wacht tot Afrekenen dicht is, en komt dan meteen (besluit 7)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS - 3 * MINUTE_MS);

  // De poll van de bar-sessie (elke 30s, BarSessieProvider) mag in deze klok-
  // sprong niet antwoorden: een antwoord kan een render tussen de tick en de
  // tik forceren, en deze test meet juist die ene volgorde. Alleen de poll
  // hangt; de eerste lezing is al binnen.
  await page.route(/\/rest\/v1\/rpc\/my_bar_state(\?|$)/, () => new Promise<void>(() => {}));
  await page.route(/\/auth\/v1\/token(\?|$)/, () => new Promise<void>(() => {}));

  await page.getByRole("button", { name: /^Pils,/ }).click();
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("option", { name: /Anna de Vries/ }).click();
  await page.getByRole("button", { name: "Tik afrekenen" }).click();
  const afrekenen = page.getByRole("dialog", { name: /^Afrekenen bij/ });
  await expect(afrekenen).toBeVisible();

  await page.clock.fastForward("05:00");

  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(afrekenen).toBeVisible();

  await afrekenen.getByRole("button", { name: "annuleren" }).click();

  await expect(melding(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("race: grens en een tik op Afrekenen in dezelfde klokstap → melding pas na het sluiten (besluit 7, ADR 0014)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS - 3 * MINUTE_MS);

  await page.getByRole("button", { name: /^Pils,/ }).click();
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("option", { name: /Anna de Vries/ }).click();
  await expect(page.getByRole("button", { name: "Tik afrekenen" })).toBeEnabled();

  // De grens en de tik vallen in één synchrone JS-taak: de klok springt 5
  // minuten, `visibilitychange` (de melding leest dan de klok, besluit 5)
  // maakt de melding "aan de beurt", en nog vóór diens passieve effect de
  // teller leest, opent de tik Afrekenen. Geen timers in het spel: die zijn
  // sinds de sessiepoll (BarSessieProvider, elke 30s) niet meer de enige
  // die op dezelfde klokstap afgaan, en een render tussen tick en tik zou
  // deze volgorde verbreken zonder iets over de melding te zeggen.
  await page.clock.setSystemTime(new Date(Date.now() + 5 * MINUTE_MS));
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    const knop = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Tik afrekenen")
    );
    knop?.click();
  });

  const afrekenen = page.getByRole("dialog", { name: /^Afrekenen bij/ });
  await expect(afrekenen).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(1);

  await afrekenen.getByRole("button", { name: "annuleren" }).click();

  await expect(melding(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("annuleren in het afsluitoverzicht telt als 'Nog bezig' (besluit 8)", async ({ page }) => {
  await openBar(page, 6 * HOUR_MS + 5 * MINUTE_MS);

  await expect(melding(page)).toBeVisible();
  await melding(page).getByRole("button", { name: "Dienst afsluiten" }).click();

  const afsluiten = page.getByRole("dialog", { name: "Dienst afsluiten" });
  await expect(afsluiten).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await afsluiten.getByRole("button", { name: "annuleren" }).click();
  await expectNoMelding(page);

  await page.clock.fastForward("59:00");
  await expectNoMelding(page);

  await page.clock.fastForward("01:00");
  await expect(melding(page)).toBeVisible();
});

test("Escape telt als 'Nog bezig' (besluit 10)", async ({ page }) => {
  await openBar(page, 6 * HOUR_MS + 5 * MINUTE_MS);

  await expect(melding(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expectNoMelding(page);

  await page.clock.fastForward("59:00");
  await expectNoMelding(page);

  await page.clock.fastForward("01:00");
  await expect(melding(page)).toBeVisible();
});

test("de melding verschijnt over de Verkoop-tab heen en laat het mandje staan (besluit 4)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS - 3 * MINUTE_MS);

  await page.getByRole("button", { name: /^Pils,/ }).click();
  const mandjeregel = page.getByRole("button", { name: "Verwijder Pils uit het mandje" });
  await expect(mandjeregel).toBeVisible();

  await page.clock.fastForward("05:00");

  await expect(melding(page)).toBeVisible();
  await expect(melding(page)).toHaveAccessibleDescription(
    "Deze dienst staat al 6 uur open. Klopt dat?"
  );
  await expect(page.getByRole("tab", { name: "Verkoop" })).toHaveAttribute("aria-selected", "true");

  await melding(page).getByRole("button", { name: "Nog bezig" }).click();

  await expect(melding(page)).toBeHidden();
  await expect(mandjeregel).toBeVisible();
});

// --- Aanvullingen Tester: de negatieve gevallen en randgevallen uit de spec
// die de vier scenario's hierboven niet raken. ---

test("negatief: vóór 6 uur geen melding, op de grens wel (besluit 1)", async ({ page }) => {
  await openBar(page, 6 * HOUR_MS - 2 * MINUTE_MS);

  await expectNoMelding(page);
  await page.clock.fastForward("01:00");
  await expectNoMelding(page);

  await page.clock.fastForward("01:30");
  await expect(melding(page)).toBeVisible();
});

test("negatief: een tik op de achtergrond telt als 'Nog bezig' (besluit 10)", async ({ page }) => {
  await openBar(page, 6 * HOUR_MS + 5 * MINUTE_MS);

  await expect(melding(page)).toBeVisible();
  // Linksboven valt buiten het gecentreerde dialoogvenster, op de backdrop.
  await page.mouse.click(5, 5);
  await expectNoMelding(page);

  await page.clock.fastForward("59:00");
  await expectNoMelding(page);

  await page.clock.fastForward("01:00");
  await expect(melding(page)).toBeVisible();
});

test("snooze overleeft een tabwissel; de melding komt ook over de Dienst-tab heen (besluit 4, Randgevallen)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS + 5 * MINUTE_MS);

  await expect(melding(page)).toBeVisible();
  await melding(page).getByRole("button", { name: "Nog bezig" }).click();
  await expectNoMelding(page);

  await page.getByRole("tab", { name: "Dienst" }).click();
  await expect(page.getByRole("tab", { name: "Dienst" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Verkoop" }).click();
  await page.getByRole("tab", { name: "Dienst" }).click();
  await expectNoMelding(page);

  await page.clock.fastForward("30:00");
  await expectNoMelding(page);

  await page.clock.fastForward("30:00");
  await expect(melding(page)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Dienst" })).toHaveAttribute("aria-selected", "true");
});

test("negatief: Dienst afsluiten via de Dienst-tab houdt de melding tegen tot annuleren (besluit 7, ADR 0014)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS - 3 * MINUTE_MS);

  await page.getByRole("tab", { name: "Dienst" }).click();
  await page.getByRole("button", { name: "Dienst afsluiten", exact: true }).click();
  const afsluiten = page.getByRole("dialog", { name: "Dienst afsluiten" });
  await expect(afsluiten).toBeVisible();

  await page.clock.fastForward("05:00");
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(melding(page)).toHaveCount(0);

  await afsluiten.getByRole("button", { name: "annuleren" }).click();
  await expect(melding(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("teller: meerdere keren een overlay open en dicht vóór de grens laat de teller op 0 terugkomen (ADR 0014)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS - 3 * MINUTE_MS);

  await page.getByRole("button", { name: /^Pils,/ }).click();
  await page.getByLabel("Zoek lid op naam").fill("Anna");
  await page.getByRole("option", { name: /Anna de Vries/ }).click();

  const afrekenen = page.getByRole("dialog", { name: /^Afrekenen bij/ });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Tik afrekenen" }).click();
    await expect(afrekenen).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(afrekenen).toBeHidden();
  }

  // Een teller die bij afmelden niet (of dubbel) terugtelt, houdt de melding
  // hier voorgoed tegen of laat hem boven een open overlay verschijnen.
  await page.clock.fastForward("05:00");
  await expect(melding(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("een melding die blijft openstaan telt mee van 6 naar 7 uur, zonder dicht/open (Schermflow §1)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS + 59 * MINUTE_MS);

  await expect(melding(page)).toHaveAccessibleDescription(
    "Deze dienst staat al 6 uur open. Klopt dat?"
  );
  await page.clock.fastForward("01:30");
  await expect(melding(page)).toHaveAccessibleDescription(
    "Deze dienst staat al 7 uur open. Klopt dat?"
  );
  await expect(page.getByRole("dialog")).toHaveCount(1);
});

test("terug uit de slaapstand: visibilitychange toont de melding zonder op de tick te wachten (besluit 5)", async ({
  page,
}) => {
  await openBar(page, 6 * HOUR_MS - 10 * MINUTE_MS);

  // Klok stilzetten: vanaf hier vuurt geen enkele interval-tick meer uit
  // zichzelf, dus alleen de visibilitychange-handler kan `now` bijwerken.
  const browserNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(browserNow + MINUTE_MS);
  await expectNoMelding(page);

  // Het tablet 'sliep' een kwartier: systeemtijd verspringt, geen timers.
  await page.clock.setSystemTime(browserNow + 15 * MINUTE_MS);
  await expectNoMelding(page);

  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(melding(page)).toBeVisible();
});

test("negatief: na afsluiten vanuit de melding geen melding meer (Schermflow §3)", async ({ page }) => {
  const sessie = await openBar(page, 6 * HOUR_MS + 5 * MINUTE_MS);

  let ended = false;
  const startedAt = new Date(Date.now() - 6 * HOUR_MS - 5 * MINUTE_MS).toISOString();
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(
      route,
      200,
      ended
        ? null
        : {
            id: SHIFT_ID,
            started_at: startedAt,
            members: { name: TOM.name },
            activity_types: { name: "Training" },
          }
    )
  );
  const endShiftCalls: unknown[] = [];
  await page.route(/\/rest\/v1\/rpc\/end_shift(\?|$)/, (route) => {
    endShiftCalls.push(route.request().postDataJSON());
    ended = true;
    sessie.dienstGesloten = true;
    return json(route, 200, null);
  });

  await expect(melding(page)).toBeVisible();
  await melding(page).getByRole("button", { name: "Dienst afsluiten" }).click();
  const afsluiten = page.getByRole("dialog", { name: "Dienst afsluiten" });
  await afsluiten.getByRole("button", { name: "dienst afsluiten", exact: true }).click();

  await expect(page.getByRole("tab", { name: "Verkoop" })).toHaveCount(0, { timeout: 15_000 });
  expect(endShiftCalls).toEqual([{ p_shift_id: SHIFT_ID }]);

  await page.clock.fastForward("02:00:00");
  await expectNoMelding(page);
});

test("negatief: in beheer-modus geen melding, ook met een dienst die 7 uur openstaat (besluit 9)", async ({
  page,
}) => {
  await page.clock.install();

  const startedAt = new Date(Date.now() - 7 * HOUR_MS).toISOString();
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, longLivedSession()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => json(route, 200, USER));
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  // Zelfde members-mock als e2e/ledenbeheer-invite.spec.ts: alleen USER is
  // beheerder.
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const isBeheerder = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    const row = isBeheerder ? { name: "Femke Bos", role: "beheerder", has_pin: false } : null;
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  });
  // Er staat wél een dienst open die de drempel ruim voorbij is: zou iets in
  // beheer-modus de melding mounten, dan kreeg het deze dienst te zien.
  await page.route(/\/rest\/v1\/shifts(\?|$)/, (route) =>
    json(route, 200, {
      id: SHIFT_ID,
      started_at: startedAt,
      members: { name: TOM.name },
      activity_types: { name: "Training" },
    })
  );

  // Een beheerder kiest "Beheer": de sessie wordt in die modus geregistreerd.
  await mockBarSessie(page);

  await loginMetWachtwoord(page, USER.email, "Aurora#2026");
  await page.getByRole("button", { name: "Beheer" }).click();
  await page
    .getByRole("tablist", { name: "Beheer-navigatie" })
    .waitFor({ state: "visible", timeout: 15_000 });

  await expectNoMelding(page);
  await page.clock.fastForward("01:00:00");
  await expect(melding(page)).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Beheer-navigatie" })).toBeVisible();
});
