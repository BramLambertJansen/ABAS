import { test, expect, type Page } from "@playwright/test";
import {
  USER,
  alertOf,
  fakeSession,
  json,
  loginMetWachtwoord,
  mockBarSessie,
} from "./helpers/supabaseMock";

/**
 * #73 — de uitnodigingsfout `rate_limited` in LidBeherenOverlay toont de
 * gedeelde RATE_LIMITED_MESSAGE (src/lib/authErrors.ts). Zonder echte
 * database: dezelfde aanpak als e2e/wachtwoord-vergeten.spec.ts — de
 * browser praat rechtstreeks met `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/...`
 * en `/rest/v1/...`, en met de eigen route `/beheer/invite`; alle drie
 * worden hier via `page.route()` gemockt. Wat dit níét toetst: of
 * src/lib/inviteMember.ts een echte GoTrue-rate-limit ook daadwerkelijk als
 * `rate_limited` teruggeeft — dat is serverside en valt buiten de browser.
 *
 * Dit bewaakt het gedrag (welke tekst de gebruiker ziet), niet dat de tekst
 * uit de gedeelde constante komt: een letterlijke kopie met dezelfde tekst
 * blijft hier groen. Die koppeling is reviewwerk (CLAUDE.md → duplicatie).
 */

const RATE_LIMITED_TEXT = "te veel pogingen — probeer het over een paar minuten opnieuw";

const LID = {
  id: "00000000-0000-4000-8000-0000000000aa",
  name: "Joris de Vries",
  role: "bardienst",
  balance_cents: 1250,
  archived: false,
  auth_user_id: null,
  has_pin: false,
  email: "joris@aurora.local",
  invited_at: null,
};

/** `invite` = [HTTP-status, body]. De echte route geeft een fout uit
 *  sendMemberInvite() met status 200 terug ({ ok: false, errorCode }); alleen
 *  een ongeldige aanvraag of een exception geeft 400/500. */
async function mockBeheerder(page: Page, invite: [number, unknown]) {
  const inviteCalls: Array<Record<string, unknown>> = [];

  await page.route(/\/auth\/v1\/token(\?|$)/, (route) => json(route, 200, fakeSession()));

  // Alles onder /rest/v1 wat deze test niet specifiek nodig heeft: leeg.
  await page.route(/\/rest\/v1\//, (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? null : []);
  });
  // useBeheerSession: members-rij, alleen voor de nep-beheerder (USER). Een
  // andere sessie hoort bij geen lid, net als in het echt.
  await page.route(/\/rest\/v1\/members(\?|$)/, (route) => {
    const isBeheerder = route.request().url().includes(`auth_user_id=eq.${USER.id}`);
    const row = isBeheerder ? { name: "Femke Bos", role: "beheerder", has_pin: false } : null;
    const accept = route.request().headers()["accept"] ?? "";
    return json(route, 200, accept.includes("vnd.pgrst.object") ? row : row ? [row] : []);
  });
  await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/, (route) => json(route, 200, [LID]));
  // Sinds dienst-per-sessie registreert de keuze "Beheer" de sessie (ADR 0016).
  await mockBarSessie(page);

  await page.route(/\/beheer\/invite(\?|$)/, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    inviteCalls.push(route.request().postDataJSON());
    return json(route, invite[0], invite[1]);
  });

  return inviteCalls;
}

async function openLidBeheren(page: Page) {
  await loginMetWachtwoord(page, USER.email, "Aurora#2026");

  await page.getByRole("button", { name: "Beheer" }).click();
  await page.getByRole("tab", { name: "Leden" }).click();
  await page.getByRole("button", { name: LID.name }).click();
  await expect(page.getByRole("button", { name: "Invite versturen" })).toBeVisible();
}

test("invite: rate_limited → de gedeelde 'te veel pogingen'-tekst (#73)", async ({ page }) => {
  const calls = await mockBeheerder(page, [200, { ok: false, errorCode: "rate_limited" }]);
  await openLidBeheren(page);

  await page.getByRole("button", { name: "Invite versturen" }).click();

  await expect(alertOf(page)).toHaveText(RATE_LIMITED_TEXT);
  expect(calls).toEqual([{ memberId: LID.id }]);
  // Mislukt: geen "uitgenodigd op …", knop blijft bruikbaar voor een nieuwe poging.
  await expect(page.getByText("nog niet uitgenodigd")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite versturen" })).toBeEnabled();
});

test("invite: andere fout (unknown) → géén 'te veel pogingen'-tekst", async ({ page }) => {
  await mockBeheerder(page, [500, { ok: false, errorCode: "iets_onbekends" }]);
  await openLidBeheren(page);

  await page.getByRole("button", { name: "Invite versturen" }).click();

  await expect(alertOf(page)).toHaveText("er ging iets mis, probeer het opnieuw");
  await expect(page.getByText("te veel pogingen")).toHaveCount(0);
});
