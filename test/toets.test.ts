import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { toetsKlassen, toetsOnderdelen, type ToetsProps } from "../src/components/toetsKlassen.ts";

/**
 * Toets (docs/features/knop.md → Aanvulling PR 2). De stijl staat in
 * toetsKlassen.ts, zodat deze test geen renderer nodig heeft.
 */

const heeft = (klassen: string, ...tokens: string[]) => {
  const lijst = klassen.split(/\s+/);
  for (const t of tokens) assert.ok(lijst.includes(t), `"${t}" ontbreekt in: ${klassen}`);
};
const mist = (klassen: string, ...tokens: string[]) => {
  const lijst = klassen.split(/\s+/);
  for (const t of tokens) assert.ok(!lijst.includes(t), `"${t}" hoort niet in: ${klassen}`);
};

test("keypad licht: 52px, rounded-control, rand, hover accent", () => {
  const k = toetsKlassen({ soort: "keypad" });
  heeft(k, "h-control-lg", "rounded-control", "border", "border-border", "bg-surface", "text-ink", "text-lg", "font-bold", "hover:border-accent");
  mist(k, "h-14", "bg-surface-rail");
  assert.equal(k, toetsKlassen({ soort: "keypad", tone: "licht" }));
});

test("keypad rail: eigen toetsmaat h-14, rounded-card, wit op surface-rail, hover rail-key-hover", () => {
  const k = toetsKlassen({ soort: "keypad", tone: "rail" });
  heeft(k, "h-14", "rounded-card", "border", "border-rail-border", "bg-surface-rail", "text-white", "text-lg", "font-bold", "hover:bg-rail-key-hover");
  mist(k, "h-control-lg", "bg-surface", "text-ink");
});

test("stap: h-control, w-11, rounded-control, rand, text-dialog-title", () => {
  const k = toetsKlassen({ soort: "stap" });
  heeft(k, "h-control", "w-11", "rounded-control", "border", "border-border", "bg-surface", "text-ink", "text-dialog-title", "font-bold");
  mist(k, "h-control-lg", "h-14");
});

test("uitgeschakeld: opacity-50 en geen hover", () => {
  heeft(toetsKlassen({ soort: "keypad" }), "disabled:cursor-not-allowed", "disabled:opacity-50", "disabled:hover:border-border");
  heeft(toetsKlassen({ soort: "keypad", tone: "rail" }), "disabled:cursor-not-allowed", "disabled:opacity-50", "disabled:hover:bg-surface-rail");
  heeft(toetsKlassen({ soort: "stap" }), "disabled:cursor-not-allowed", "disabled:opacity-50");
});

test("h-14 komt alleen in de rail-keypadtoets voor, met uitleg in de bron", () => {
  assert.ok(!toetsKlassen({ soort: "keypad" }).split(/\s+/).includes("h-14"));
  assert.ok(!toetsKlassen({ soort: "stap" }).split(/\s+/).includes("h-14"));
  const bron = readFileSync("src/components/toetsKlassen.ts", "utf8");
  assert.ok(/h-14/.test(bron.split("*/")[0] ?? ""), "commentaar noemt h-14");
});

test("className komt achteraan en voegt alleen toe", () => {
  assert.ok(toetsKlassen({ soort: "stap", className: "flex-none" }).endsWith(" flex-none"));
  assert.equal(toetsKlassen({ soort: "stap", className: undefined }), toetsKlassen({ soort: "stap" }));
});

test("standaard type=\"button\"; overige attributen gaan door; stijlprops niet", () => {
  const onClick = () => {};
  const o = toetsOnderdelen({ soort: "keypad", tone: "rail", className: "x", "aria-label": "Cijfer 1", disabled: true, onClick });
  assert.equal(o.type, "button");
  const rest = o.rest as Record<string, unknown>;
  assert.equal(rest["aria-label"], "Cijfer 1");
  assert.equal(rest.disabled, true);
  assert.equal(rest.onClick, onClick);
  for (const sleutel of ["soort", "tone", "className", "type"]) assert.ok(!(sleutel in rest), sleutel);
});

test("Toets en toetsKlassen lezen useShell/density niet (ADR 0026)", () => {
  for (const bestand of ["src/components/Toets.tsx", "src/components/toetsKlassen.ts"]) {
    const bron = readFileSync(bestand, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/useShell|density/.test(bron), bestand);
  }
});

test("klassen staan als volledige literals: geen dynamisch samengestelde Tailwind-klassen", () => {
  const bron = readFileSync("src/components/toetsKlassen.ts", "utf8");
  assert.ok(!/`[^`]*\$\{/.test(bron), "template literal met interpolatie");
});

// Typecontracten: dit bestand wordt door `npm run typecheck` gecontroleerd.
export function typeContracten() {
  const goed: ToetsProps[] = [
    { soort: "keypad", tone: "rail", "aria-label": "Cijfer 1" },
    { soort: "stap", "aria-label": "Eén meer" },
  ];
  // @ts-expect-error een toets heeft een aria-label nodig
  const geenLabel: ToetsProps = { soort: "stap" };
  // @ts-expect-error een stap heeft geen tone
  const stapTone: ToetsProps = { soort: "stap", tone: "rail", "aria-label": "x" };
  // @ts-expect-error soort is verplicht
  const geenSoort: ToetsProps = { "aria-label": "x" };
  return [goed, geenLabel, stapTone, geenSoort];
}
