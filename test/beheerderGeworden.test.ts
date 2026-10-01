import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * De teksten bij de sluitreden `beheerder_geworden` (docs/features/
 * beheer-tweede-factor.md → `set_member_role`, besloten 11; teksten
 * goedgekeurd door Bram, 2026-10-01). De typecheck dwingt af dát elke reden
 * een tekst heeft, niet wélke: dat bewijst deze test.
 */
register("./fakes/src-alias-resolve.mjs", import.meta.url);

const { SESSIE_MELDINGEN, adminMeldingReden } = await import("../src/features/bar-sessie/teksten.ts");

test("de melding op het apparaat na beheerder_geworden", () => {
  assert.deepEqual(SESSIE_MELDINGEN.beheerder_geworden, {
    titel: "Je bent uitgelogd",
    uitleg: "Je bent nu beheerder. Log opnieuw in om verder te gaan.",
  });
  // Niet de tekst van rol_gewijzigd: die zegt "mag niet meer op de bar werken".
  assert.notEqual(SESSIE_MELDINGEN.beheerder_geworden.uitleg, SESSIE_MELDINGEN.rol_gewijzigd.uitleg);
});

test("de beheerdermelding 'Dienst zonder apparaat' met reden beheerder_geworden", () => {
  assert.equal(
    adminMeldingReden("beheerder_geworden", "Tom Willems"),
    "Tom Willems is beheerder geworden en daarom uitgelogd."
  );
});

test("de beheerdermelding met reden beheerder_geworden zonder bekende naam", () => {
  assert.equal(
    adminMeldingReden("beheerder_geworden", null),
    "Iemand is beheerder geworden en daarom uitgelogd."
  );
});
