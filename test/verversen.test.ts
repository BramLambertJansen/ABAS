import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_VERVERS_INTERVAL_MS,
  PORTAL_TIME_ZONE,
  bijgewerktLabel,
  lezingGeslaagd,
  lezingGestart,
  lezingMislukt,
  maakRondeGuard,
  moetVerversen,
  verversInfo,
  verversMisluktTekst,
  type LezingState,
} from "../src/lib/verversen.ts";
import { loadErrorMessage } from "../src/lib/loadErrors.ts";

/**
 * Unit tests voor src/lib/verversen.ts (docs/features/
 * leesfouten-herstel-actuele-data.md → Teststrategie): de beslisregel voor
 * terugkeer, het Amsterdamse tijdlabel, de stale-machine en de
 * laatste-request-wint-guard. Geen React, geen Supabase.
 */

const NU = 1_000_000_000_000;
const basis = {
  nuMs: NU,
  minIntervalMs: MIN_VERVERS_INTERVAL_MS,
  bezig: false,
  laatsteMislukt: false,
  bron: "zichtbaar" as const,
};

test("terugkeer binnen 30 s na een geslaagde lezing ververst niet", () => {
  assert.equal(moetVerversen({ ...basis, laatsteSuccesMs: NU - 29_999 }), false);
  assert.equal(moetVerversen({ ...basis, laatsteSuccesMs: NU }), false);
});

test("terugkeer precies 30 s of ouder ververst", () => {
  assert.equal(moetVerversen({ ...basis, laatsteSuccesMs: NU - 30_000 }), true);
  assert.equal(moetVerversen({ ...basis, laatsteSuccesMs: NU - 5 * 60_000 }), true);
});

test("een mislukte laatste poging ververst ook binnen 30 s", () => {
  assert.equal(moetVerversen({ ...basis, laatsteSuccesMs: NU - 1_000, laatsteMislukt: true }), true);
});

test("nog nooit geladen ververst", () => {
  assert.equal(moetVerversen({ ...basis, laatsteSuccesMs: null }), true);
});

test("online ververst altijd, ook binnen 30 s", () => {
  assert.equal(moetVerversen({ ...basis, bron: "online", laatsteSuccesMs: NU - 1_000 }), true);
  assert.equal(moetVerversen({ ...basis, bron: "online", laatsteSuccesMs: null }), true);
});

test("een lopende lezing wordt nooit opnieuw gestart, voor elke bron", () => {
  for (const bron of ["zichtbaar", "online"] as const) {
    for (const laatsteSuccesMs of [null, NU - 10 * 60_000, NU]) {
      assert.equal(
        moetVerversen({ ...basis, bron, laatsteSuccesMs, bezig: true, laatsteMislukt: true }),
        false
      );
    }
  }
});

test("bijgewerktLabel gebruikt vast Europe/Amsterdam", () => {
  assert.equal(PORTAL_TIME_ZONE, "Europe/Amsterdam");
  // 12:32 UTC in juli = 14:32 (CEST); 12:32 UTC in januari = 13:32 (CET).
  assert.equal(bijgewerktLabel(Date.UTC(2026, 6, 15, 12, 32)), "Bijgewerkt om 14:32");
  assert.equal(bijgewerktLabel(Date.UTC(2026, 0, 15, 12, 32)), "Bijgewerkt om 13:32");
});

test("bijgewerktLabel rond de zomertijdwissel (25 oktober 2026, 01:00 UTC)", () => {
  assert.equal(bijgewerktLabel(Date.UTC(2026, 9, 25, 0, 59)), "Bijgewerkt om 02:59");
  assert.equal(bijgewerktLabel(Date.UTC(2026, 9, 25, 1, 0)), "Bijgewerkt om 02:00");
  // Zomertijd begint op 29 maart 2026, 01:00 UTC.
  assert.equal(bijgewerktLabel(Date.UTC(2026, 2, 29, 0, 59)), "Bijgewerkt om 01:59");
  assert.equal(bijgewerktLabel(Date.UTC(2026, 2, 29, 1, 0)), "Bijgewerkt om 03:00");
});

test("middernacht is 00:xx en geen 24:xx", () => {
  assert.equal(bijgewerktLabel(Date.UTC(2026, 6, 14, 22, 5)), "Bijgewerkt om 00:05");
});

test("een ongeldige of ontbrekende waarde geeft geen label", () => {
  assert.equal(bijgewerktLabel(null), null);
  assert.equal(bijgewerktLabel(undefined), null);
  assert.equal(bijgewerktLabel(Number.NaN), null);
  assert.equal(bijgewerktLabel(Number.POSITIVE_INFINITY), null);
  assert.equal(bijgewerktLabel(8.64e15 + 1), null);
});

test("verversMisluktTekst noemt de tijd van de bekende gegevens", () => {
  assert.equal(
    verversMisluktTekst(Date.UTC(2026, 6, 15, 12, 32)),
    "Verversen mislukt. Je ziet de gegevens van 14:32."
  );
  assert.equal(verversMisluktTekst(null), "Verversen mislukt.");
});

test("portal-teksten: netwerk en server (met en zonder code) per hook", () => {
  const netwerk = new TypeError("Failed to fetch");
  const serverMetCode = { code: "PGRST200", message: "x" };
  const serverZonderCode = new Error("boem");
  for (const wat of [
    "Kan het saldo niet laden.",
    "Kan de transacties niet laden.",
    "Kan de instellingen niet laden.",
  ]) {
    assert.equal(loadErrorMessage(wat, netwerk), `${wat} Controleer de verbinding.`);
    assert.equal(
      loadErrorMessage(wat, serverMetCode),
      `${wat} Er ging iets mis aan de serverkant — meld dit bij de beheerder (code PGRST200).`
    );
    assert.equal(
      loadErrorMessage(wat, serverZonderCode),
      `${wat} Er ging iets mis aan de serverkant — meld dit bij de beheerder.`
    );
  }
});

const KLAAR: LezingState<string> = lezingGeslaagd("oud", NU);

test("een mislukte verversing laat ready, data en tijdstip staan", () => {
  const bezig = lezingGestart(KLAAR);
  assert.equal(bezig.status, "ready");
  const mislukt = lezingMislukt(bezig, "boem");
  assert.equal(mislukt.status, "ready");
  if (mislukt.status !== "ready") return;
  assert.equal(mislukt.data, "oud");
  assert.equal(mislukt.bijgewerktOp, NU);
  assert.equal(mislukt.mislukt, true);
  assert.equal(mislukt.bezig, false);
  assert.equal(mislukt.message, "boem");
});

test("een geslaagde verversing wist de mislukt-vlag en zet het nieuwe tijdstip", () => {
  const mislukt = lezingMislukt(lezingGestart(KLAAR), "boem");
  const hersteld = lezingGeslaagd("nieuw", NU + 60_000);
  assert.deepEqual(verversInfo(hersteld), {
    bezig: false,
    mislukt: false,
    bijgewerktOp: NU + 60_000,
    message: null,
  });
  assert.equal(verversInfo(mislukt).mislukt, true);
  // Een nieuwe poging vanuit mislukt toont bezig, de data blijft.
  const opnieuw = lezingGestart(mislukt);
  assert.equal(opnieuw.status, "ready");
  assert.equal(verversInfo(opnieuw).bezig, true);
});

test("de eerste ronde is loading; mislukt is error zonder data", () => {
  const loading: LezingState<string> = { status: "loading" };
  assert.deepEqual(lezingGestart(loading), loading);
  assert.deepEqual(lezingMislukt(loading, "boem"), {
    status: "error",
    message: "boem",
    bezig: false,
  });
  assert.equal(verversInfo(loading).bezig, true);
  assert.equal(verversInfo(loading).bijgewerktOp, null);
});

test("een mislukte retry vanuit error blijft error; de knop blijft gemount (bezig)", () => {
  const fout = lezingMislukt<string>({ status: "loading" }, "boem");
  const retry = lezingGestart(fout);
  assert.equal(retry.status, "error");
  assert.equal(verversInfo(retry).bezig, true);
  const weerMislukt = lezingMislukt(retry, "weer");
  assert.deepEqual(weerMislukt, { status: "error", message: "weer", bezig: false });
});

test("een geslaagde retry vanuit error wordt ready", () => {
  const fout = lezingMislukt<string>({ status: "loading" }, "boem");
  assert.equal(lezingGeslaagd("data", NU).status, "ready");
  assert.equal(lezingGestart(fout).status, "error");
});

test("laatste-request-wint: een oudere ronde en een ronde na unmount tellen niet", () => {
  const guard = maakRondeGuard();
  const eerste = guard.start();
  const tweede = guard.start();
  assert.equal(guard.isActueel(eerste), false);
  assert.equal(guard.isActueel(tweede), true);
  guard.annuleer();
  assert.equal(guard.isActueel(tweede), false);
  const derde = guard.start();
  assert.equal(guard.isActueel(derde), true);
});
