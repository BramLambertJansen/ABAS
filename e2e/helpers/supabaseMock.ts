import type { Page, Route } from "@playwright/test";

/**
 * Gedeelde bouwstenen voor e2e-specs die Supabase mocken via `page.route()`
 * in plaats van een echte stack te gebruiken. De browser-client
 * (src/lib/supabase/client.ts) praat rechtstreeks met
 * `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/...` en `/rest/v1/...`, dus het pad
 * matcht welke host dat ook is.
 *
 * Foutbodies volgen API-versie 2024-01-01 (`code` + `msg`), met de header
 * waaraan auth-js die versie herkent — zonder die header leest auth-js
 * `code` niet.
 */
export const SUPABASE_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "x-supabase-api-version, content-range",
  "content-type": "application/json",
  "x-supabase-api-version": "2024-01-01",
};

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "femke.bos@aurora.local",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

export function fakeSession() {
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

export function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, headers: SUPABASE_HEADERS, body: JSON.stringify(body) });
}

/** De eigen `role="alert"` van het scherm — niet Next.js' route-announcer. */
export function alertOf(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/**
 * Vult het /beheer-inlogformulier in met de methode Wachtwoord en klikt
 * "Inloggen". Wat daarna gebeurt (echte of gemockte login, modus-keuze) is
 * aan de aanroeper.
 *
 * De "Wachtwoord"-radio is `sr-only`; de omhullende <label> is het echte,
 * zichtbare klikdoel. CSS-locators i.p.v. getByLabel("Wachtwoord"): het
 * wachtwoordveld en de inlogmethode-radio delen die toegankelijke naam.
 */
export async function loginMetWachtwoord(page: Page, email: string, password: string) {
  await page.goto("/beheer");
  const emailVeld = page.locator('input[type="email"]');
  await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('label:has(input[value="password"])').click();
  await emailVeld.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Inloggen" }).click();
}

/**
 * Zelfde als `loginMetWachtwoord`, maar voor `/portal` (docs/features/
 * portal-login.md → PortalLogin.tsx) — eigen functie i.p.v. hergebruik: de
 * twee formulieren delen vorm/precedent, niet code (spec → "Herbruik"), en
 * de knoptekst is hier "Inloggen" ná het kiezen van methode Wachtwoord,
 * verder identiek DOM-patroon (sr-only radio, omhullende <label> als
 * klikdoel).
 */
export async function portalLoginMetWachtwoord(page: Page, email: string, password: string) {
  await page.goto("/portal");
  const emailVeld = page.locator('input[type="email"]');
  await emailVeld.waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('label:has(input[value="password"])').click();
  await emailVeld.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Inloggen" }).click();
}

// ── Bar-sessie (dienst-per-sessie, ADR 0016) ─────────────────────────────

export type BarSessieMockOpties = {
  /** Naam en rol van het lid van de sessie (standaard de nep-beheerder). */
  naam?: string;
  rol?: "beheerder" | "bardienst";
  /** De modus van een sessie die al geregistreerd is. Zonder dit is er pas
   *  een bar-sessie na `register_bar_session` (de keuze in ModusKeuze). */
  voorgeregistreerd?: "bar" | "beheer";
  /** De eigen dienst van de sessie (alleen zinvol in modus bar). */
  shift?: {
    id: string;
    startedAt: string;
    startedByName: string;
    activityTypeName: string | null;
  } | null;
  /** De sessie geldt als bevestigd in deze browserstart (een vlag in
   *  sessionStorage). Nodig voor een `voorgeregistreerd` sessie, anders komt
   *  eerst het hervatscherm. */
  bevestigd?: boolean;
};

export type BarSessieMock = {
  /** De modus waarin de sessie nu geregistreerd is, of `null`. */
  modus: "bar" | "beheer" | null;
  /** De `p_mode` van elke `register_bar_session`-aanroep. */
  registraties: string[];
};

/**
 * Mockt de bar-sessie-RPC's (`my_bar_state`, `register_bar_session`,
 * `touch_bar_session`, `end_bar_session`) en het uitloggen, voor specs die
 * Supabase via `page.route()` mocken. Registreer dit ná de algemene
 * `/rest/v1/`-mock van de spec: bij overlappende routes wint de laatst
 * geregistreerde.
 */
export async function mockBarSessie(
  page: Page,
  opties: BarSessieMockOpties = {}
): Promise<BarSessieMock> {
  const naam = opties.naam ?? "Femke Bos";
  const rol = opties.rol ?? "beheerder";
  const staat: BarSessieMock = { modus: opties.voorgeregistreerd ?? null, registraties: [] };
  const nu = new Date().toISOString();

  if (opties.bevestigd) {
    await page.addInitScript(() => window.sessionStorage.setItem("abas.bar.bevestigd", "1"));
  }

  await page.route(/\/rest\/v1\/rpc\/my_bar_state(\?|$)/, (route) => {
    if (staat.modus === null) return json(route, 200, { session: null });
    return json(route, 200, {
      session: {
        id: "00000000-0000-4000-8000-0000000000f1",
        member_id: "00000000-0000-4000-8000-0000000000f2",
        member_name: naam,
        member_role: rol,
        mode: staat.modus,
        status: "active",
        end_reason: null,
        started_at: nu,
        last_activity_at: nu,
        left_shift_open: false,
      },
      shift:
        staat.modus === "bar" && opties.shift
          ? {
              id: opties.shift.id,
              started_by_name: opties.shift.startedByName,
              started_at: opties.shift.startedAt,
              activity_type_name: opties.shift.activityTypeName,
            }
          : null,
      last_left: null,
      other_shift: null,
      notifications: rol === "beheerder" ? [] : undefined,
      admin: rol === "beheerder" && staat.modus === "beheer" ? { shifts: [], sessions: [] } : undefined,
    });
  });
  await page.route(/\/rest\/v1\/rpc\/register_bar_session(\?|$)/, (route) => {
    const mode = (route.request().postDataJSON() as { p_mode?: string } | null)?.p_mode;
    if (mode === "bar" || mode === "beheer") {
      staat.modus = mode;
      staat.registraties.push(mode);
    }
    return json(route, 200, {});
  });
  await page.route(/\/rest\/v1\/rpc\/touch_bar_session(\?|$)/, (route) => json(route, 200, {}));
  await page.route(/\/rest\/v1\/rpc\/end_bar_session(\?|$)/, (route) => {
    staat.modus = null;
    return route.fulfill({ status: 204, headers: SUPABASE_HEADERS, body: "" });
  });
  await page.route(/\/auth\/v1\/logout/, (route) =>
    route.fulfill({ status: 204, headers: SUPABASE_HEADERS, body: "" })
  );

  return staat;
}
