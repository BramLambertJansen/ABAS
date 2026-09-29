import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAR_INACTIVITY_LIMIT_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
  RESUME_STORAGE_KEY,
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
 * hervatten na "browser dicht" en de herkenning van de zes sessiecodes. De
 * afdwinging zelf staat in de database (supabase/tests/); dit is de UX-helft.
 */

test("de inactiviteitstijd is 60 minuten (spiegel van bar_inactivity_limit in 0028)", () => {
  assert.equal(BAR_INACTIVITY_LIMIT_MS, 60 * 60 * 1000);
});

test("de hartslag gaat hooguit één keer per minuut", () => {
  assert.equal(HEARTBEAT_MIN_INTERVAL_MS, 60 * 1000);
});

// ── Sessiecodes ──────────────────────────────────────────────────────────

test("de zes sessiecodes van de guards", () => {
  assert.deepEqual([...SESSION_ERROR_CODES].sort(), [
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

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

test("zonder vlag is een sessie nog niet bevestigd (browser dicht en weer open)", () => {
  assert.equal(isResumeConfirmed(fakeStorage()), false);
});

test("na 'Verder' of een login is de sessie bevestigd, tot uitloggen", () => {
  const storage = fakeStorage();
  confirmResume(storage);
  assert.equal(storage.data.get(RESUME_STORAGE_KEY), "1");
  assert.equal(isResumeConfirmed(storage), true);
  clearResume(storage);
  assert.equal(isResumeConfirmed(storage), false);
});

test("geen storage (buiten de browser): nooit bevestigd, en niets gooit", () => {
  assert.equal(isResumeConfirmed(null), false);
  assert.doesNotThrow(() => confirmResume(null));
  assert.doesNotThrow(() => clearResume(undefined));
});

test("geblokkeerde storage (privémodus): liever een keer te vaak vragen dan gooien", () => {
  const kapot = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(isResumeConfirmed(kapot), false);
  assert.doesNotThrow(() => confirmResume(kapot));
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
