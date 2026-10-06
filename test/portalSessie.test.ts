import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DENIED_MESSAGE,
  foutStaat,
  sessieOphaalFoutStaat,
  isActueleRonde,
  isAchtergrondlookup,
  metRetryBezig,
  volgendeSessieStaat,
  type PortalSessionState,
} from "../src/lib/portalSessie.ts";

const IN: PortalSessionState = {
  status: "signed-in",
  userId: "u1",
  email: "a@b.nl",
  name: "Oud",
  role: "lid",
  archived: false,
};
const ROW = { name: "Nieuw", role: "bardienst" as const, archived: false };
const SERVER = { code: "PGRST301", message: "kapot", details: null, hint: null };

test("voorgrond, fout: error met bezig false (nooit denied)", () => {
  for (const huidig of [
    { status: "loading" },
    { status: "signed-out" },
    { status: "denied", message: DENIED_MESSAGE },
  ] as PortalSessionState[]) {
    const s = volgendeSessieStaat(huidig, { soort: "fout", userId: "u1", err: SERVER });
    assert.equal(s.status, "error");
  }
});

test("achtergrond, fout: staat blijft ongewijzigd", () => {
  const s = volgendeSessieStaat(IN, { soort: "fout", userId: "u1", err: SERVER });
  assert.equal(s, IN);
});

test("andere userId tijdens signed-in is voorgrond: fout geeft error", () => {
  assert.equal(isAchtergrondlookup(IN, "u2"), false);
  assert.equal(isAchtergrondlookup(IN, "u1"), true);
  assert.equal(isAchtergrondlookup({ status: "loading" }, "u1"), false);
  const s = volgendeSessieStaat(IN, { soort: "fout", userId: "u2", err: SERVER });
  assert.equal(s.status, "error");
});

test("geen rij met bevestigde sessie is denied, voor- en achtergrond", () => {
  const expected = { status: "denied", message: DENIED_MESSAGE };
  const uitkomst = { soort: "geen-rij" as const, userId: "u1", sessieBevestigd: true };
  assert.deepEqual(volgendeSessieStaat({ status: "loading" }, uitkomst), expected);
  assert.deepEqual(volgendeSessieStaat(IN, uitkomst), expected);
});

test("geen rij met niet-bevestigde sessie is signed-out (ADR 0022), voor- en achtergrond", () => {
  const uitkomst = { soort: "geen-rij" as const, userId: "u1", sessieBevestigd: false };
  for (const huidig of [
    { status: "loading" },
    { status: "error", message: "x", bezig: true },
    IN,
  ] as PortalSessionState[]) {
    assert.deepEqual(volgendeSessieStaat(huidig, uitkomst), { status: "signed-out" });
  }
});

test("rij gevonden: signed-in met userId; achtergrond ververst de gegevens", () => {
  const uitkomst = { soort: "rij" as const, userId: "u1", email: "x@y.nl", rij: ROW };
  const verwacht = { status: "signed-in", userId: "u1", email: "x@y.nl", name: "Nieuw", role: "bardienst", archived: false };
  assert.deepEqual(volgendeSessieStaat({ status: "loading" }, uitkomst), verwacht);
  assert.deepEqual(volgendeSessieStaat(IN, uitkomst), verwacht);
  assert.deepEqual(volgendeSessieStaat({ status: "error", message: "x", bezig: true }, uitkomst), verwacht);
});

test("foutteksten: netwerk en server, nooit de ruwe fout", () => {
  const net = foutStaat(new TypeError("Failed to fetch"));
  assert.deepEqual(net, { status: "error", message: "Kan je account niet laden. Controleer de verbinding.", bezig: false });
  const srv = foutStaat(SERVER);
  assert.deepEqual(srv, {
    status: "error",
    message:
      "Kan je account niet laden. Er ging iets mis aan de serverkant — meld dit bij de beheerder (code PGRST301).",
    bezig: false,
  });
  const raw = foutStaat({ code: "https://x.supabase.co/geheim", message: "secret" });
  assert.ok(raw.status === "error" && !raw.message.includes("geheim") && !raw.message.includes("secret"));
});

test("retry vanuit error zet bezig, andere staten blijven", () => {
  assert.deepEqual(metRetryBezig({ status: "error", message: "m", bezig: false }), {
    status: "error",
    message: "m",
    bezig: true,
  });
  assert.equal(metRetryBezig(IN), IN);
});

test("een oudere ronde wordt genegeerd", () => {
  assert.equal(isActueleRonde(2, 2), true);
  assert.equal(isActueleRonde(1, 2), false);
});

test("mislukte getSession(): signed-in blijft staan, anders error", () => {
  const err = new TypeError("Failed to fetch");
  assert.equal(sessieOphaalFoutStaat(IN, err), IN);
  assert.deepEqual(sessieOphaalFoutStaat({ status: "loading" }, err), foutStaat(err));
});
