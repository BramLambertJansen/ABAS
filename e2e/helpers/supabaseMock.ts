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

/** De geverifieerde TOTP-factor van de nep-gebruiker (ADR 0017: beheer
 *  eist een tweede factor). */
export const FACTOR_ID = "00000000-0000-4000-8000-0000000000fa";
const VERIFIED_FACTOR = {
  id: FACTOR_ID,
  friendly_name: null,
  factor_type: "totp",
  status: "verified",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "femke.bos@aurora.local",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  factors: [VERIFIED_FACTOR],
};

/** De nep-gebruiker zonder tweede factor. */
export const USER_ZONDER_FACTOR = { ...USER, factors: [] as (typeof VERIFIED_FACTOR)[] };

/** Het `session_id`-claim van de nep-sessie: de sleutel van de bar-sessie en
 *  de waarde van het hervat-cookie (ADR 0017). */
export const SESSION_ID = "00000000-0000-4000-8000-0000000000e1";

/**
 * Een nep-sessie. Standaard aal2 met een geverifieerde factor, zodat "Beheer"
 * in de modus-keuze meteen registreert; de code-stap zelf toetst
 * e2e/beheer-tweede-factor.spec.ts met `aal: "aal1"`.
 */
export function fakeSession(
  opties: { aal?: "aal1" | "aal2"; user?: typeof USER | typeof USER_ZONDER_FACTOR; sessionId?: string } = {}
) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = opties.user ?? USER;
  const accessToken = [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      exp,
      email: user.email,
      session_id: opties.sessionId ?? SESSION_ID,
      aal: opties.aal ?? "aal2",
      amr: [{ method: "password", timestamp: exp - 3600 }],
    }),
    "nep-handtekening",
  ].join(".");
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "nep-refresh-token",
    user,
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
  /** Een open dienst elders (`other_shift` in `my_bar_state`), alleen zinvol
   *  in modus bar zolang de sessie geen eigen dienst heeft. `orphan`: geen
   *  actieve koppeling meer. `inBezetting`: het lid van de sessie staat in de
   *  bezetting. Na een geslaagde `resume_orphan_shift` (alleen bij `orphan` en
   *  `inBezetting`) wordt deze dienst de eigen dienst van de sessie. */
  otherShift?: {
    id: string;
    startedAt: string;
    startedByName: string;
    activityTypeName: string | null;
    orphan: boolean;
    inBezetting: boolean;
  } | null;
  /** De sessie geldt als bevestigd in deze browser (het sessiecookie
   *  `abas_bar_bevestigd` met het `session_id`, ADR 0017). Nodig voor een
   *  `voorgeregistreerd` sessie, anders komt eerst het hervatscherm. */
  bevestigd?: boolean;
  /** `session.resumable` in `my_bar_state`; standaard zoals de server: waar
   *  in modus bar, onwaar in modus beheer. */
  resumable?: boolean;
  /** De gebruiker die `GET /auth/v1/user` teruggeeft (standaard met factor). */
  user?: typeof USER | typeof USER_ZONDER_FACTOR;
};

export type BarSessieMock = {
  /** De modus waarin de sessie nu geregistreerd is, of `null`. */
  modus: "bar" | "beheer" | null;
  /** De `p_mode` van elke `register_bar_session`-aanroep. */
  registraties: string[];
  /** Zet dit als de eigen dienst gesloten is (bv. na `end_shift`): `my_bar_state`
   *  levert dan geen dienst meer. */
  dienstGesloten: boolean;
  /** De `p_shift_id` van elke `resume_orphan_shift`-aanroep. */
  hervattingen: string[];
  /** De `p_reason` van elke `end_bar_session`-aanroep. */
  beeindigingen: string[];
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
  const staat: BarSessieMock = {
    modus: opties.voorgeregistreerd ?? null,
    registraties: [],
    dienstGesloten: false,
    hervattingen: [],
    beeindigingen: [],
  };
  let hervat = false;
  const nu = new Date().toISOString();

  if (opties.bevestigd) {
    await page.addInitScript((id) => {
      document.cookie = `abas_bar_bevestigd=${id}; Path=/; SameSite=Strict`;
    }, SESSION_ID);
  }

  // `mfa.listFactors()` leest de gebruiker (de tweede factor, ADR 0017).
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return json(route, 200, opties.user ?? USER);
  });

  await page.route(/\/rest\/v1\/rpc\/my_bar_state(\?|$)/, (route) => {
    if (staat.modus === null) return json(route, 200, { session: null });
    const elders = opties.otherShift && staat.modus === "bar" && !hervat ? opties.otherShift : null;
    const eigen =
      staat.modus === "bar" && !staat.dienstGesloten
        ? hervat && opties.otherShift
          ? opties.otherShift
          : opties.shift
        : null;
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
        resumable: opties.resumable ?? staat.modus === "bar",
      },
      shift: eigen
        ? {
            id: eigen.id,
            started_by_name: eigen.startedByName,
            started_at: eigen.startedAt,
            activity_type_name: eigen.activityTypeName,
          }
        : null,
      last_left: null,
      other_shift: elders
        ? {
            id: elders.id,
            started_by_name: elders.startedByName,
            started_at: elders.startedAt,
            activity_type_name: elders.activityTypeName,
            orphan: elders.orphan,
            sessions: [],
            in_bezetting: elders.inBezetting,
          }
        : null,
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
  await page.route(/\/rest\/v1\/rpc\/resume_orphan_shift(\?|$)/, (route) => {
    const shiftId = (route.request().postDataJSON() as { p_shift_id?: string } | null)?.p_shift_id;
    if (shiftId) staat.hervattingen.push(shiftId);
    const o = opties.otherShift;
    if (o && shiftId === o.id && o.orphan && o.inBezetting) {
      hervat = true;
      return json(route, 200, { id: o.id });
    }
    return json(route, 400, { code: "P0001", message: "shift_not_orphan", details: null, hint: null });
  });
  await page.route(/\/rest\/v1\/rpc\/touch_bar_session(\?|$)/, (route) => json(route, 200, {}));
  await page.route(/\/rest\/v1\/rpc\/end_bar_session(\?|$)/, (route) => {
    const reden = (route.request().postDataJSON() as { p_reason?: string } | null)?.p_reason;
    staat.beeindigingen.push(reden ?? "uitgelogd");
    staat.modus = null;
    return route.fulfill({ status: 204, headers: SUPABASE_HEADERS, body: "" });
  });
  await page.route(/\/auth\/v1\/logout/, (route) =>
    route.fulfill({ status: 204, headers: SUPABASE_HEADERS, body: "" })
  );

  return staat;
}

// ── Tweede factor (ADR 0017) ─────────────────────────────────────────────

export type TweedeFactorMock = {
  /** De `code` van elke `verify`-aanroep. */
  codes: string[];
};

/**
 * Mockt `challenge` en `verify` van de TOTP-factor. `verify(n)` geeft per
 * aanroep status en body; standaard slaagt alles, met een aal2-sessie terug.
 */
export async function mockTweedeFactor(
  page: Page,
  verify?: (n: number) => [number, unknown]
): Promise<TweedeFactorMock> {
  const staat: TweedeFactorMock = { codes: [] };
  await page.route(/\/auth\/v1\/factors\/[^/]+\/challenge(\?|$)/, (route) =>
    json(route, 200, { id: "00000000-0000-4000-8000-0000000000c9", type: "totp", expires_at: 9999999999 })
  );
  await page.route(/\/auth\/v1\/factors\/[^/]+\/verify(\?|$)/, (route) => {
    const n = staat.codes.length;
    staat.codes.push(String((route.request().postDataJSON() as { code?: string } | null)?.code));
    const [status, body] = verify?.(n) ?? [200, fakeSession({ aal: "aal2" })];
    return json(route, status, body);
  });
  return staat;
}
