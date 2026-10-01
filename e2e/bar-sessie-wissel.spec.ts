import { test, expect, type Page } from "@playwright/test";
import { USER, SESSION_ID, fakeSession, json, loginMetWachtwoord, mockBarSessie } from "./helpers/supabaseMock";

// Alleen UI-races: de database/auth-acceptatie staat in de live tests in
// a11y.spec.ts en supabase/tests. Hier sturen we bewust auth-events uit een
// ander tabblad terwijl een netwerkantwoord nog onderweg is.
const ANDER = { ...USER, id: "00000000-0000-4000-8000-000000000002", email: "sanne@aurora.local" };
const ANDERE_SESSIE = "00000000-0000-4000-8000-0000000000e2";

async function wisselSessie(page: Page, session: ReturnType<typeof fakeSession>, bevestigd = false) {
  await page.evaluate(({ session, bevestigd }) => {
    const cookie = document.cookie.split("; ").find((c) => c.startsWith("sb-") && c.includes("-auth-token"));
    if (!cookie) throw new Error("Supabase auth-cookie ontbreekt");
    const storageKey = cookie.split("=")[0].replace(/\.\d+$/, "");
    // Een echt ander tabblad heeft de gedeelde cookies al vervangen vóór
    // het SIGNED_IN-event. Nieuwe hooks moeten dus ook de nieuwe login lezen.
    for (const c of document.cookie.split("; ")) {
      if (c.startsWith(storageKey)) document.cookie = `${c.split("=")[0]}=; Path=/; Max-Age=0`;
    }
    const encoded = btoa(JSON.stringify(session)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    document.cookie = `${storageKey}=base64-${encoded}; Path=/; SameSite=Lax`;
    if (bevestigd) {
      const claim = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      document.cookie = `abas_bar_bevestigd=${claim.session_id}; Path=/; SameSite=Strict`;
    }
    const channel = new BroadcastChannel(storageKey);
    channel.postMessage({ event: "SIGNED_IN", session });
    channel.close();
  }, { session, bevestigd });
}

async function mockLogin(page: Page) {
  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession({ aal: "aal1" })));
  await page.route(/\/rest\/v1\//, (route) => json(route, 200, []));
  const sessie = await mockBarSessie(page);
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const ander = route.request().url().includes(ANDER.id);
    const row = { name: ander ? "Sanne Bakker" : "Femke Bos", role: "beheerder" };
    return json(route, 200, route.request().headers().accept?.includes("vnd.pgrst.object") ? row : [row]);
  });
  return sessie;
}

test("accountwissel en een nieuwe sessie van hetzelfde account wissen de vorige MFA-stap", async ({ page }) => {
  await mockLogin(page);
  await loginMetWachtwoord(page, USER.email, "password");
  const code = page.getByRole("heading", { name: "Code uit je authenticator-app" });
  await page.getByRole("button", { name: /^Beheer/ }).click();
  await expect(code).toBeVisible();

  await wisselSessie(page, fakeSession({ user: ANDER, aal: "aal1", sessionId: ANDERE_SESSIE }));
  await expect(page.getByText(/Sanne Bakker/)).toBeVisible();
  await expect(code).toHaveCount(0);
  await page.getByRole("button", { name: /^Beheer/ }).click();
  await expect(code).toBeVisible();

  await wisselSessie(page, fakeSession({ user: ANDER, aal: "aal1", sessionId: SESSION_ID }));
  await expect(page.getByRole("button", { name: /^Bar/ })).toBeVisible();
  await expect(code).toHaveCount(0);
});

test("een verouderde ledenlookup herstelt geen beheerrol na een nieuwer antwoord", async ({ page }) => {
  await mockLogin(page);
  await loginMetWachtwoord(page, USER.email, "password");
  await expect(page.getByRole("button", { name: /^Beheer/ })).toBeVisible();
  let eerste = true;
  let vrijgeven!: () => void;
  const wacht = new Promise<void>((resolve) => { vrijgeven = resolve; });
  let ontvangen!: () => void;
  const onderweg = new Promise<void>((resolve) => { ontvangen = resolve; });
  await page.route(/\/rest\/v1\/members(\?|$)/, async (route) => {
    const oud = eerste;
    eerste = false;
    if (oud) { ontvangen(); await wacht; }
    return json(route, 200, { name: "Femke Bos", role: oud ? "beheerder" : "bardienst" });
  });
  // Zelfde identiteit en sessie: de provider blijft bestaan; de hook moet
  // de volgorde van deze overlappende profielreads zelf bewaken.
  await wisselSessie(page, fakeSession({ aal: "aal1" }));
  await onderweg;
  await wisselSessie(page, fakeSession({ aal: "aal1" }));
  await expect(page.getByRole("button", { name: /^Bar/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Beheer/ })).toHaveCount(0);
  const oudAntwoord = page.waitForResponse(/\/rest\/v1\/members/);
  vrijgeven();
  await oudAntwoord;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("button", { name: /^Bar/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Beheer/ })).toHaveCount(0);
});

test("een late modusregistratie bevestigt niet de sessie van de vorige gebruiker", async ({ page }) => {
  const sessie = await mockLogin(page);
  let eerste = true;
  let vrijgeven!: () => void;
  const wacht = new Promise<void>((resolve) => { vrijgeven = resolve; });
  let ontvangen!: () => void;
  const onderweg = new Promise<void>((resolve) => { ontvangen = resolve; });
  await page.route(/\/rpc\/register_bar_session/, async (route) => {
    if (eerste) { eerste = false; ontvangen(); await wacht; }
    else sessie.modus = "bar";
    return json(route, 200, {});
  });
  await loginMetWachtwoord(page, USER.email, "password");
  await page.getByRole("button", { name: /^Bar/ }).click();
  await onderweg;
  await wisselSessie(page, fakeSession({ user: ANDER, sessionId: ANDERE_SESSIE }));
  await page.getByRole("button", { name: /^Bar/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Uitloggen", exact: true })).toBeVisible();
  const oudAntwoord = page.waitForResponse(/\/rpc\/register_bar_session/);
  vrijgeven();
  await oudAntwoord;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "abas_bar_bevestigd")?.value).toBe(ANDERE_SESSIE);
});

test("een serverafmelding blijft na lokaal uitloggen zichtbaar", async ({ page }) => {
  const sessie = await mockLogin(page);
  sessie.modus = "bar";
  let gesloten = false;
  await page.route(/\/rpc\/my_bar_state/, (route) => gesloten ? json(route, 200, {
    session: {
      id: SESSION_ID, member_id: USER.id, member_name: "Femke Bos", member_role: "beheerder", mode: "bar",
      status: "ended", end_reason: "afgemeld", started_at: new Date().toISOString(), last_activity_at: new Date().toISOString(),
    },
  }) : route.fallback());
  await loginMetWachtwoord(page, USER.email, "password");
  await page.getByRole("button", { name: "Verder", exact: true }).click();
  await expect(page.getByText("Ingelogd als Femke Bos")).toBeVisible();
  gesloten = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const melding = page.getByRole("dialog", { name: "Je bent afgemeld" });
  await expect(melding).toBeVisible();
  await melding.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("Ingelogd als Femke Bos")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Uitloggen", exact: true })).toHaveCount(0);
});

test("een oud pollantwoord sluit de nieuwe persoonlijke sessie niet af", async ({ page }) => {
  await mockLogin(page);
  let naam = "Femke Bos";
  let vertraag = false;
  let vrijgeven!: () => void;
  const wacht = new Promise<void>((resolve) => { vrijgeven = resolve; });
  let ontvangen!: () => void;
  const onderweg = new Promise<void>((resolve) => { ontvangen = resolve; });
  await page.route(/\/rest\/v1\/rpc\/my_bar_state(\?|$)/, async (route) => {
    const oudeNaam = naam;
    const oud = vertraag;
    if (oud) {
      vertraag = false;
      ontvangen();
      await wacht;
    }
    return json(route, 200, {
      session: {
        id: oudeNaam === "Femke Bos" ? SESSION_ID : ANDERE_SESSIE,
        member_id: oudeNaam === "Femke Bos" ? USER.id : ANDER.id,
        member_name: oudeNaam, member_role: "bardienst", mode: "bar",
        status: oud ? "ended" : "active", end_reason: oud ? "afgemeld" : null,
        started_at: new Date().toISOString(), last_activity_at: new Date().toISOString(),
        resumable: true,
      },
    });
  });
  await loginMetWachtwoord(page, USER.email, "password");
  await page.getByRole("button", { name: "Verder", exact: true }).click();
  await expect(page.getByText("Ingelogd als Femke Bos")).toBeVisible();
  vertraag = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await onderweg;

  naam = "Sanne Bakker";
  await wisselSessie(page, fakeSession({ user: ANDER, sessionId: ANDERE_SESSIE }), true);
  await expect(page.getByText("Ingelogd als Sanne Bakker")).toBeVisible();
  const oudAntwoord = page.waitForResponse(/\/rpc\/my_bar_state/);
  vrijgeven();
  await oudAntwoord;
  // Door een volgende geldige poll te wachten, is ook de verwerking van het
  // vertraagde antwoord voorbij; geen vaste sleep of direct negatieve check.
  const nieuwePoll = page.waitForResponse(/\/rpc\/my_bar_state/);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await nieuwePoll;
  await expect(page.getByText("Ingelogd als Sanne Bakker")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
});
