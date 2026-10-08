import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { knopKlassen, knopOnderdelen, type KnopProps } from "../src/components/knopKlassen.ts";

/**
 * Knop (docs/features/knop.md, ADR 0026). De stijl en de keuze knop/link staan
 * in knopKlassen.ts, zodat deze test geen renderer nodig heeft; Knop.tsx is
 * daar alleen een dunne JSX-laag overheen.
 */

const heeft = (klassen: string, ...tokens: string[]) => {
  const lijst = klassen.split(/\s+/);
  for (const t of tokens) assert.ok(lijst.includes(t), `"${t}" ontbreekt in: ${klassen}`);
};
const mist = (klassen: string, ...tokens: string[]) => {
  const lijst = klassen.split(/\s+/);
  for (const t of tokens) assert.ok(!lijst.includes(t), `"${t}" hoort niet in: ${klassen}`);
};

test("standaard: secundair, licht, normaal", () => {
  const k = knopKlassen({});
  heeft(k, "h-control", "rounded-control", "text-sm", "font-bold", "border", "border-border", "bg-surface", "text-ink", "hover:border-ink");
  assert.equal(k, knopKlassen({ variant: "secundair", tone: "licht", maat: "normaal" }));
});

test("primair: donker op accent, hover accent-hover, in beide tonen gelijk", () => {
  for (const tone of ["licht", "rail"] as const) {
    const k = knopKlassen({ variant: "primair", tone });
    heeft(k, "bg-accent", "text-rail", "hover:bg-accent-hover");
    mist(k, "text-white", "bg-accent-active");
  }
  assert.equal(knopKlassen({ variant: "primair", tone: "licht" }), knopKlassen({ variant: "primair", tone: "rail" }));
});

test("secundair: licht en rail", () => {
  heeft(knopKlassen({ tone: "licht" }), "border-border", "bg-surface", "text-ink", "hover:border-ink");
  heeft(knopKlassen({ tone: "rail" }), "border-rail-border", "bg-surface-rail", "text-rail-light", "hover:bg-rail-hover");
  mist(knopKlassen({ tone: "rail" }), "bg-surface", "text-ink");
});

test("gevaar: gevuld rood, wit, hover ink, in beide tonen gelijk", () => {
  for (const tone of ["licht", "rail"] as const) {
    heeft(knopKlassen({ variant: "gevaar", tone }), "bg-danger", "text-white", "hover:bg-ink");
  }
  assert.equal(knopKlassen({ variant: "gevaar", tone: "licht" }), knopKlassen({ variant: "gevaar", tone: "rail" }));
});

test("tekst: muted met onderstreping, rail-variant; geen rand of vlak", () => {
  heeft(knopKlassen({ variant: "tekst" }), "text-muted", "underline", "hover:text-ink");
  heeft(knopKlassen({ variant: "tekst", tone: "rail" }), "text-rail-muted", "underline", "hover:text-rail-light");
  mist(knopKlassen({ variant: "tekst" }), "border", "bg-surface");
});

test("elke variant heeft text-sm font-bold; geen afwijkende tekstmaten", () => {
  for (const variant of ["primair", "secundair", "gevaar", "tekst"] as const) {
    for (const tone of ["licht", "rail"] as const) {
      for (const maat of ["normaal", "groot"] as const) {
        for (const icoon of [false, true]) {
          const k = knopKlassen({ variant, tone, maat, icoon });
          heeft(k, "text-sm", "font-bold");
          assert.ok(!/text-\[/.test(k), k);
        }
      }
    }
  }
});

test("maat: normaal is h-control + rounded-control, groot is h-control-lg + rounded-card; ook voor tekst", () => {
  for (const variant of ["primair", "secundair", "gevaar", "tekst"] as const) {
    const normaal = knopKlassen({ variant, maat: "normaal" });
    const groot = knopKlassen({ variant, maat: "groot" });
    heeft(normaal, "h-control", "rounded-control");
    mist(normaal, "h-control-lg", "rounded-card");
    heeft(groot, "h-control-lg", "rounded-card");
    mist(groot, "h-control", "rounded-control");
  }
});

test("icoon: vierkant (breedte = hoogte), 44 of 52px", () => {
  heeft(knopKlassen({ icoon: true }), "h-control", "w-11", "flex-none");
  heeft(knopKlassen({ icoon: true, maat: "groot" }), "h-control-lg", "w-13", "flex-none");
  mist(knopKlassen({ icoon: true }), "px-4");
});

test("uitgeschakeld: disabled en aria-disabled geven dezelfde stijl, hover verandert niets", () => {
  for (const variant of ["primair", "gevaar"] as const) {
    heeft(knopKlassen({ variant }),
      "disabled:cursor-not-allowed", "disabled:bg-track", "disabled:text-muted",
      "aria-disabled:cursor-not-allowed", "aria-disabled:bg-track", "aria-disabled:text-muted",
      "aria-disabled:hover:bg-track", "aria-disabled:active:bg-track");
  }
  for (const tone of ["licht", "rail"] as const) {
    heeft(knopKlassen({ variant: "secundair", tone }),
      "disabled:cursor-not-allowed", "disabled:opacity-50", "aria-disabled:cursor-not-allowed", "aria-disabled:opacity-50");
    heeft(knopKlassen({ variant: "tekst", tone }),
      "disabled:cursor-not-allowed", "disabled:opacity-50", "aria-disabled:cursor-not-allowed", "aria-disabled:opacity-50");
  }
  heeft(knopKlassen({ variant: "secundair" }), "disabled:hover:border-border", "aria-disabled:hover:border-border");
  heeft(knopKlassen({ variant: "secundair", tone: "rail" }), "disabled:hover:bg-surface-rail", "aria-disabled:hover:bg-surface-rail");
});

test("className komt achteraan en voegt alleen toe", () => {
  const k = knopKlassen({ className: "flex-1 w-full" });
  assert.ok(k.endsWith(" flex-1 w-full"), k);
  assert.equal(knopKlassen({ className: undefined }), knopKlassen({}));
});

test("standaard type=\"button\"; submit en reset blijven expliciet mogelijk", () => {
  const standaard = knopOnderdelen({});
  assert.equal(standaard.soort, "knop");
  assert.equal(standaard.soort === "knop" && standaard.type, "button");
  const submit = knopOnderdelen({ type: "submit" });
  assert.equal(submit.soort === "knop" && submit.type, "submit");
});

test("overige attributen (aria-*, disabled, onClick, ref) gaan ongewijzigd door; stijlprops niet", () => {
  const onClick = () => {};
  const o = knopOnderdelen({ variant: "primair", tone: "rail", maat: "groot", className: "w-full", disabled: true, "aria-disabled": true, onClick, "aria-label": "x" });
  assert.equal(o.soort, "knop");
  const rest = o.rest as Record<string, unknown>;
  assert.equal(rest.disabled, true);
  assert.equal(rest["aria-disabled"], true);
  assert.equal(rest["aria-label"], "x");
  assert.equal(rest.onClick, onClick);
  for (const sleutel of ["variant", "tone", "maat", "className", "icoon"]) assert.ok(!(sleutel in rest), sleutel);
});

test("href rendert een link met dezelfde stijl en zonder type", () => {
  const o = knopOnderdelen({ href: "/beheer", variant: "primair", maat: "groot", className: "w-full" });
  assert.equal(o.soort, "link");
  assert.equal((o.rest as { href: string }).href, "/beheer");
  assert.ok(!("type" in o));
  heeft(o.klassen, "bg-accent", "text-rail", "h-control-lg", "rounded-card", "w-full");
  assert.equal(o.klassen, knopKlassen({ variant: "primair", maat: "groot", className: "w-full" }));
});

test("Knop en knopKlassen lezen useShell/density niet (ADR 0026)", () => {
  for (const bestand of ["src/components/Knop.tsx", "src/components/knopKlassen.ts"]) {
    const bron = readFileSync(bestand, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/useShell|density/.test(bron), bestand);
  }
});

test("klassen staan als volledige literals: geen dynamisch samengestelde Tailwind-klassen", () => {
  const bron = readFileSync("src/components/knopKlassen.ts", "utf8");
  assert.ok(!/`[^`]*\$\{/.test(bron), "template literal met interpolatie");
});

// Typecontracten: dit bestand wordt door `npm run typecheck` gecontroleerd. De
// functie draait nooit; een verwijderde @ts-expect-error laat de typecheck falen.
export function typeContracten() {
  const goed: KnopProps[] = [
    {},
    { variant: "gevaar", tone: "rail", maat: "groot" },
    { icoon: true, "aria-label": "Sluiten" },
    { href: "/x", variant: "primair" },
    { type: "submit", onClick: () => {}, disabled: true },
  ];
  // @ts-expect-error een icoonknop heeft een aria-label nodig
  const geenLabel: KnopProps = { icoon: true };
  // @ts-expect-error een link heeft geen onClick
  const linkMetKlik: KnopProps = { href: "/x", onClick: () => {} };
  // @ts-expect-error een link is niet uit te schakelen
  const linkDisabled: KnopProps = { href: "/x", disabled: true };
  // @ts-expect-error onbekende variant
  const onbekend: KnopProps = { variant: "ghost" };
  return [goed, geenLabel, linkMetKlik, linkDisabled, onbekend];
}
