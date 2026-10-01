import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAR_INACTIVITY_LIMIT_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
  RESUME_COOKIE_NAME,
  SESSION_ERROR_CODES,
  clearResume,
  confirmResume,
  isResumeConfirmed,
  isSessionErrorCode,
  msUntilInactive,
  sessieMeldingReden,
  sessionCodeFromError,
  shouldSendHeartbeat,
} from "../src/lib/barSessie.ts";

/**
 * De pure client-logica van de bar-sessie (docs/features/dienst-per-sessie.md,
 * ADR 0016): de spiegel van de inactiviteitstijd, de hartslag-throttle, het
 * hervatten na "browser dicht" (een sessiecookie per browser, ADR 0017) en de
 * herkenning van de sessiecodes. De
 * afdwinging zelf staat in de database (supabase/tests/); dit is de UX-helft.
 */

test("de inactiviteitstijd is 60 minuten (spiegel van bar_inactivity_limit in 0028)", () => {
  assert.equal(BAR_INACTIVITY_LIMIT_MS, 60 * 60 * 1000);
});

test("de hartslag gaat hooguit één keer per minuut", () => {
  assert.equal(HEARTBEAT_MIN_INTERVAL_MS, 60 * 1000);
});

// ── Sessiecodes ──────────────────────────────────────────────────────────

test("de sessiecodes van de guards, met aal2_required (0034, ADR 0017)", () => {
  assert.deepEqual([...SESSION_ERROR_CODES].sort(), [
    "aal2_required",
    "no_bar_role",
    "no_bar_session",
    "session_ended",
    "session_inactive",
    "session_not_on_shift",
    "wrong_mode",
  ]);
});

for (const code of SESSION_ERROR_CODES) {
  test(`${code} is een sessiecode`, () => {
    assert.equal(isSessionErrorCode(code), true);
    assert.equal(sessionCodeFromError({ message: code }), code);
    assert.equal(sessionCodeFromError(new Error(code)), code);
  });
}

test("een bijna-code is geen sessiecode: exact vergelijken, geen prefix of hoofdletters", () => {
  for (const almost of ["NO_BAR_ROLE", "no_bar_role ", "session", "session_ended_x", "", "no_admin_role"]) {
    assert.equal(isSessionErrorCode(almost), false, almost);
    assert.equal(sessionCodeFromError({ message: almost }), null, almost);
  }
});

test("geen sessiecode: null, undefined, getallen en objecten zonder message", () => {
  for (const value of [null, undefined, 42, {}, { message: 5 }, "session_ended"]) {
    assert.equal(sessionCodeFromError(value), null);
  }
  assert.equal(isSessionErrorCode(undefined), false);
  assert.equal(isSessionErrorCode(null), false);
});

// ── Hartslag ─────────────────────────────────────────────────────────────

test("de eerste tik zet altijd een hartslag", () => {
  assert.equal(shouldSendHeartbeat(null, 1_000), true);
});

test("binnen een minuut geen tweede hartslag, daarna wel", () => {
  const start = 1_000_000;
  assert.equal(shouldSendHeartbeat(start, start + 1), false);
  assert.equal(shouldSendHeartbeat(start, start + 59_999), false);
  assert.equal(shouldSendHeartbeat(start, start + 60_000), true);
  assert.equal(shouldSendHeartbeat(start, start + 3_600_000), true);
});

test("het interval is aan te passen", () => {
  assert.equal(shouldSendHeartbeat(0, 5_000, 10_000), false);
  assert.equal(shouldSendHeartbeat(0, 10_000, 10_000), true);
});

// ── Inactiviteitstimer ───────────────────────────────────────────────────

test("msUntilInactive telt terug vanaf de laatste activiteit", () => {
  const laatste = 10_000_000;
  assert.equal(msUntilInactive(laatste, laatste), BAR_INACTIVITY_LIMIT_MS);
  assert.equal(msUntilInactive(laatste, laatste + 60_000), BAR_INACTIVITY_LIMIT_MS - 60_000);
  assert.equal(msUntilInactive(laatste, laatste + BAR_INACTIVITY_LIMIT_MS), 0);
});

test("msUntilInactive wordt nooit negatief", () => {
  assert.equal(msUntilInactive(0, 10 * BAR_INACTIVITY_LIMIT_MS), 0);
});

// ── Hervatten ────────────────────────────────────────────────────────────

const SESSIE_A = "11111111-1111-4111-8111-111111111111";
const SESSIE_B = "22222222-2222-4222-8222-222222222222";

/** Een nep-`document.cookie`: schrijven voegt toe of vervangt, `Max-Age=0`
 *  verwijdert. `writes` bewaart de ruwe cookie-regels voor de attributen. */
function fakeJar(initial = "", secure = false) {
  const cookies = new Map<string, string>();
  for (const part of initial.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) cookies.set(name, rest.join("="));
  }
  const writes: string[] = [];
  return {
    secure,
    writes,
    read: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    write: (cookie: string) => {
      writes.push(cookie);
      const [pair, ...attrs] = cookie.split(";").map((x) => x.trim());
      const [name, ...rest] = pair.split("=");
      if (attrs.some((a) => a.toLowerCase() === "max-age=0")) cookies.delete(name);
      else cookies.set(name, rest.join("="));
    },
    cookies,
  };
}

test("zonder cookie is een sessie nog niet bevestigd (browser dicht en weer open)", () => {
  assert.equal(isResumeConfirmed(fakeJar(), SESSIE_A), false);
});

test("na 'Verder' of een login is de sessie bevestigd, tot uitloggen", () => {
  const jar = fakeJar();
  confirmResume(jar, SESSIE_A);
  assert.equal(jar.cookies.get(RESUME_COOKIE_NAME), SESSIE_A);
  assert.equal(isResumeConfirmed(jar, SESSIE_A), true);
  clearResume(jar);
  assert.equal(jar.cookies.has(RESUME_COOKIE_NAME), false);
  assert.equal(isResumeConfirmed(jar, SESSIE_A), false);
});

test("bevestigd alleen bij een gelijk session_id: een vlag van een vorige sessie bevestigt geen nieuwe login", () => {
  const jar = fakeJar(`${RESUME_COOKIE_NAME}=${SESSIE_A}`);
  assert.equal(isResumeConfirmed(jar, SESSIE_A), true);
  assert.equal(isResumeConfirmed(jar, SESSIE_B), false);
  assert.equal(isResumeConfirmed(jar, null), false);
  assert.equal(isResumeConfirmed(jar, ""), false);
});

test("het cookie is een sessiecookie: Path=/, SameSite=Strict, geen Max-Age/Expires, geen HttpOnly", () => {
  const jar = fakeJar();
  confirmResume(jar, SESSIE_A);
  const regel = jar.writes[0];
  assert.equal(regel, `${RESUME_COOKIE_NAME}=${SESSIE_A}; Path=/; SameSite=Strict`);
  assert.doesNotMatch(regel, /max-age|expires|httponly/i);
});

test("op https krijgt het cookie Secure", () => {
  const jar = fakeJar("", true);
  confirmResume(jar, SESSIE_A);
  assert.match(jar.writes[0], /; Secure$/);
  clearResume(jar);
  assert.match(jar.writes[1], /Max-Age=0; Secure$/);
});

test("wissen zet Max-Age=0 op hetzelfde pad", () => {
  const jar = fakeJar(`${RESUME_COOKIE_NAME}=${SESSIE_A}`);
  clearResume(jar);
  assert.equal(jar.writes[0], `${RESUME_COOKIE_NAME}=; Path=/; SameSite=Strict; Max-Age=0`);
});

test("andere cookies naast het cookie verstoren het lezen niet", () => {
  const jar = fakeJar(`sb-x-auth-token=abc; ${RESUME_COOKIE_NAME}=${SESSIE_B}; abas_andere=1`);
  assert.equal(isResumeConfirmed(jar, SESSIE_B), true);
  const lijkt = fakeJar(`x${RESUME_COOKIE_NAME}=${SESSIE_B}`);
  assert.equal(isResumeConfirmed(lijkt, SESSIE_B), false);
});

test("een ongeldig session_id wordt niet geschreven", () => {
  const jar = fakeJar();
  confirmResume(jar, "geen-uuid; Domain=evil.example");
  assert.deepEqual(jar.writes, []);
});

test("geen cookies (buiten de browser): nooit bevestigd, en niets gooit", () => {
  assert.equal(isResumeConfirmed(null, SESSIE_A), false);
  assert.doesNotThrow(() => confirmResume(null, SESSIE_A));
  assert.doesNotThrow(() => clearResume(undefined));
});

test("geblokkeerde cookies: liever een keer te vaak vragen dan gooien", () => {
  const kapot = {
    secure: false,
    read: () => {
      throw new Error("blocked");
    },
    write: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(isResumeConfirmed(kapot, SESSIE_A), false);
  assert.doesNotThrow(() => confirmResume(kapot, SESSIE_A));
  assert.doesNotThrow(() => clearResume(kapot));
});

// ── Welke melding bij een gesloten sessie ────────────────────────────────

test("een actieve sessie krijgt geen melding", () => {
  assert.equal(sessieMeldingReden({ status: "active", endReason: null, leftShiftOpen: false }), null);
});

test("inactief: met of zonder dienst die open bleef", () => {
  assert.equal(
    sessieMeldingReden({ status: "inactive", endReason: null, leftShiftOpen: false }),
    "inactief"
  );
  assert.equal(
    sessieMeldingReden({ status: "inactive", endReason: null, leftShiftOpen: true }),
    "inactief_met_dienst"
  );
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "inactief", leftShiftOpen: true }),
    "inactief_met_dienst"
  );
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "inactief", leftShiftOpen: false }),
    "inactief"
  );
});

test("afgemeld, rol gewijzigd en gearchiveerd", () => {
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "afgemeld", leftShiftOpen: true }),
    "afgemeld"
  );
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "geen_bar_rol", leftShiftOpen: false }),
    "rol_gewijzigd"
  );
  assert.equal(
    sessieMeldingReden({ status: "no_role", endReason: null, leftShiftOpen: false }),
    "rol_gewijzigd"
  );
});

test("zelf uitgelogd of niet hervat: de eigen actie, dus geen melding", () => {
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "uitgelogd", leftShiftOpen: true }),
    null
  );
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "niet_hervat", leftShiftOpen: false }),
    null
  );
});

test("een onbekende sluitreden krijgt de neutrale melding", () => {
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "iets_nieuws", leftShiftOpen: false }),
    "geen_sessie"
  );
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: null, leftShiftOpen: false }),
    "geen_sessie"
  );
});

test("sessieMeldingReden: beheerder_geworden krijgt een eigen melding, niet rol_gewijzigd (ADR 0017, besloten 11)", () => {
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "beheerder_geworden", leftShiftOpen: false }),
    "beheerder_geworden"
  );
  assert.equal(
    sessieMeldingReden({ status: "ended", endReason: "beheerder_geworden", leftShiftOpen: true }),
    "beheerder_geworden"
  );
});
