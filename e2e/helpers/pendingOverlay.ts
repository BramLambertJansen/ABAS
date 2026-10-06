import { expect, type Locator, type Page, type Route } from "@playwright/test";
import { json } from "./supabaseMock";

/**
 * Gedeelde bouwstenen voor de pending-E2E van overlays met het
 * `closeBlocked`-contract van `Overlay` (#125, #140; docs/features/
 * pending-e2e-overlays.md). Alle overlays doen dezelfde assertiereeks, dus die
 * staat hier één keer.
 *
 * De vertraging zit in de route (`await vast.poort` vóór het antwoord), niet
 * in `page.clock`: de 30 s-poll en de heartbeat van de bar-sessie blijven
 * dan buiten de teststand.
 */

/** De standaardmelding van `Overlay` na een geblokkeerde sluitpoging. */
export const MELDING = "Even wachten, de actie wordt nog verwerkt.";

/** Een poort die een mock-RPC vasthoudt tot `laatDoor()`. */
export function houdVast() {
  let release!: () => void;
  const poort = new Promise<void>((resolve) => (release = resolve));
  return { poort, laatDoor: release };
}

export type Vast = ReturnType<typeof houdVast>;

/** Indexen binnen de lijst met bereikbare elementen van de dialoog. */
export async function dialogFocusState(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const list = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])'
      )
    ).filter((el) => el.getAttribute("tabindex") !== "-1" && el.getClientRects().length > 0);
    const active = document.activeElement as HTMLElement | null;
    return {
      count: list.length,
      index: active ? list.indexOf(active) : -1,
      onContainer: active === dialog,
      inDialog: !!active && dialog.contains(active),
    };
  });
}

/** Een PostgREST-domeinfout zoals `resume_orphan_shift` in `mockBarSessie`. */
export function domeinFout(route: Route, code: string) {
  return json(route, 400, { code: "P0001", message: code, details: null, hint: null });
}

/**
 * Houdt één RPC vast tot `vast.laatDoor()` en telt de aanroepen. Registreer
 * dit ná de algemene mock van de spec (de laatst geregistreerde route wint).
 * `antwoord` geeft het antwoord ná de vrijgave.
 */
export async function vertraagRpc(
  page: Page,
  rpc: string,
  antwoord: (route: Route) => Promise<unknown> | unknown
) {
  const vast = houdVast();
  const payloads: unknown[] = [];
  await page.route(new RegExp(`/rest/v1/rpc/${rpc}(\\?|$)`), async (route) => {
    payloads.push(route.request().postDataJSON());
    await vast.poort;
    return antwoord(route);
  });
  return { vast, payloads, aanroepen: () => payloads.length };
}

/** De `role="status"`-regio van `Overlay` (altijd gemount, de laatste in de
 *  dialoog: andere statusregels, zoals "Overzicht laden…", staan erboven). */
export function overlayStatus(dialog: Locator) {
  return dialog.locator('p[role="status"]').last();
}

/**
 * Het contract (a), (b) en (c) uit het ticket, vanaf de klik op `bevestig`
 * tot en met de herhaalde sluitpogingen. De dialoog blijft daarna in de
 * pendingstand; de aanroeper laat de route door (`vast.laatDoor()`) en toetst
 * (d) en het gevolg.
 *
 * - `bevestig`: de knop die de actie start; `bevestigPending` is dezelfde knop
 *   als zijn tekst wisselt (bv. "bezig…"), standaard `bevestig`.
 * - `aanroepen`: telt de aanroepen van de vertraagde RPC.
 * - `vast`: wordt bij een mislukte assertie alsnog doorgelaten, zodat
 *   `page.close()` niet op een hangende route wacht.
 */
export async function expectGeblokkeerdTijdensPending(
  page: Page,
  dialog: Locator,
  opties: {
    bevestig: Locator;
    bevestigPending?: Locator;
    aanroepen: () => number;
    vast: Vast;
  }
) {
  const status = overlayStatus(dialog);
  const sluitknoppen = dialog.getByRole("button", { name: /^(annuleren|sluiten)$/i });
  try {
    // Voor de klik: regio gemount maar leeg, niet bezig, nog niets verstuurd.
    await expect(status).toHaveCount(1);
    await expect(status).toHaveText("");
    await expect(dialog).not.toHaveAttribute("aria-busy", "true");
    expect(opties.aanroepen()).toBe(0);

    await opties.bevestig.click();

    // (a) bezig, en (b) precies één aanroep.
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect.poll(opties.aanroepen).toBe(1);
    const pendingKnop = opties.bevestigPending ?? opties.bevestig;
    await expect(pendingKnop).toBeDisabled();
    expect(await sluitknoppen.count()).toBeGreaterThan(0);
    for (const knop of await sluitknoppen.all()) await expect(knop).toBeDisabled();

    // (c) de geklikte knop werd disabled: de focus staat op de container.
    await expect(dialog).toBeFocused();
    // Pending zonder poging: nog geen melding.
    await expect(status).toHaveText("");

    // (c) Tab en Shift+Tab blijven binnen de dialoog.
    for (const key of ["Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Tab"]) {
      await page.keyboard.press(key);
      expect((await dialogFocusState(page)).inDialog).toBe(true);
    }

    // (a) en (b): herhaalde sluitpogingen, ook op de disabled knoppen.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 5);
    }
    await pendingKnop.click({ force: true });
    for (const knop of await sluitknoppen.all()) await knop.click({ force: true });

    await expect(dialog).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(MELDING);
    expect((await dialogFocusState(page)).inDialog).toBe(true);
    expect(opties.aanroepen()).toBe(1);
  } catch (fout) {
    opties.vast.laatDoor();
    throw fout;
  }
}

/** Contract (d): na afloop is sluiten weer mogelijk. */
export async function expectSluitbaarNaPending(page: Page, dialog: Locator) {
  await expect(dialog).not.toHaveAttribute("aria-busy", "true");
  await expect(overlayStatus(dialog)).toHaveText("");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[inert]")).toHaveCount(0);
}
