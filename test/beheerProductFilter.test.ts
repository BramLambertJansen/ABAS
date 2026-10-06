import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterBeheerProducten,
  leegReden,
  telPerStatus,
} from "../src/features/assortimentbeheer/beheerProductFilter.ts";
import { isLaatsteActieveType } from "../src/features/assortimentbeheer/laatsteActieveType.ts";

const P = [
  { name: "Pils", category: "Bier", archived: false },
  { name: "Witbier", category: "Bier", archived: true },
  { name: "Cola", category: "Fris", archived: false },
  { name: "Bierworst", category: "Snacks", archived: false },
];

describe("filterBeheerProducten", () => {
  it("toont zonder zoekterm alleen de gekozen status, in serverVolgorde", () => {
    assert.deepEqual(filterBeheerProducten(P, { query: "", status: "actief" }).map((p) => p.name), ["Pils", "Cola", "Bierworst"]);
    assert.deepEqual(filterBeheerProducten(P, { query: "", status: "uit" }).map((p) => p.name), ["Witbier"]);
  });
  it("trimt en negeert hoofdletters; spaties alleen telt als leeg", () => {
    assert.deepEqual(filterBeheerProducten(P, { query: "  PILS ", status: "actief" }).map((p) => p.name), ["Pils"]);
    assert.equal(filterBeheerProducten(P, { query: "   ", status: "actief" }).length, 3);
  });
  it("zoekt ook op categorie", () => {
    assert.deepEqual(filterBeheerProducten(P, { query: "fris", status: "actief" }).map((p) => p.name), ["Cola"]);
    assert.deepEqual(filterBeheerProducten(P, { query: "bier", status: "actief" }).map((p) => p.name), ["Pils", "Bierworst"]);
  });
});

describe("telPerStatus", () => {
  it("telt alles zonder zoekterm", () => {
    assert.deepEqual(telPerStatus(P, ""), { actief: 3, uit: 1 });
  });
  it("tellers volgen de zoekterm", () => {
    assert.deepEqual(telPerStatus(P, "bier"), { actief: 2, uit: 1 });
    assert.deepEqual(telPerStatus(P, "zzz"), { actief: 0, uit: 0 });
  });
});

describe("leegReden", () => {
  it("onderscheidt geen producten, geen treffers en leeg filter", () => {
    assert.equal(leegReden([], { query: "", status: "actief" }), "geen-producten");
    assert.equal(leegReden([], { query: "x", status: "actief" }), "geen-producten");
    assert.equal(leegReden(P, { query: "zzz", status: "actief" }), "geen-treffers");
    assert.equal(leegReden([P[0]], { query: "", status: "uit" }), "leeg-filter");
    assert.equal(leegReden(P, { query: "", status: "actief" }), null);
  });
  it("zoekterm die alleen in de andere status matcht is geen 'geen treffers'", () => {
    assert.equal(leegReden(P, { query: "witbier", status: "actief" }), "leeg-filter");
    assert.equal(leegReden(P, { query: "  WITBIER ", status: "actief" }), "leeg-filter");
    assert.equal(leegReden(P, { query: "pils", status: "uit" }), "leeg-filter");
    assert.equal(leegReden(P, { query: "witbier", status: "uit" }), null);
  });
});

describe("isLaatsteActieveType", () => {
  const t = (id: string, archived: boolean) => ({ id, archived });
  it("waar bij precies een actief type dat het gekozen type is", () => {
    assert.equal(isLaatsteActieveType([t("a", false), t("b", true)], "a"), true);
  });
  it("onwaar bij twee actieve types", () => {
    assert.equal(isLaatsteActieveType([t("a", false), t("b", false)], "a"), false);
  });
  it("onwaar bij nul actieve types", () => {
    assert.equal(isLaatsteActieveType([t("a", true)], "a"), false);
  });
  it("onwaar als het gekozen type zelf gearchiveerd is", () => {
    assert.equal(isLaatsteActieveType([t("a", false), t("b", true)], "b"), false);
  });
  it("onwaar bij een onbekend id", () => {
    assert.equal(isLaatsteActieveType([t("a", false)], "x"), false);
  });
});
