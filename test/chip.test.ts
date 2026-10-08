import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { chipKlassen, chipOnderdelen, type ChipProps } from "../src/components/chipKlassen.ts";

/**
 * Chip (docs/features/knop.md → Aanvulling PR 2). De stijl en de attributen
 * staan in chipKlassen.ts, zodat deze test geen renderer nodig heeft.
 */

const heeft = (klassen: string, ...tokens: string[]) => {
  const lijst = klassen.split(/\s+/);
  for (const t of tokens) assert.ok(lijst.includes(t), `"${t}" ontbreekt in: ${klassen}`);
};
const mist = (klassen: string, ...tokens: string[]) => {
  const lijst = klassen.split(/\s+/);
  for (const t of tokens) assert.ok(!lijst.includes(t), `"${t}" hoort niet in: ${klassen}`);
};

test("standaard: rust, normaal, altijd een pil", () => {
  const k = chipKlassen({});
  heeft(k, "rounded-full", "px-4", "text-sm", "font-bold", "whitespace-nowrap", "h-control",
    "border", "border-border", "bg-surface", "text-ink", "hover:border-ink");
  mist(k, "bg-accent", "rounded-control", "rounded-card");
  assert.equal(k, chipKlassen({ geselecteerd: false, maat: "normaal" }));
});

test("geselecteerd: donker op accent met hover accent-hover", () => {
  const k = chipKlassen({ geselecteerd: true });
  heeft(k, "border-accent", "bg-accent", "text-rail", "hover:bg-accent-hover");
  mist(k, "bg-surface", "text-white", "bg-accent-active", "bg-ink");
});

test("maat: normaal is h-control, groot is h-control-lg; vorm blijft een pil", () => {
  for (const geselecteerd of [false, true]) {
    const normaal = chipKlassen({ geselecteerd, maat: "normaal" });
    const groot = chipKlassen({ geselecteerd, maat: "groot" });
    heeft(normaal, "h-control", "rounded-full");
    mist(normaal, "h-control-lg");
    heeft(groot, "h-control-lg", "rounded-full");
    mist(groot, "h-control");
  }
});

test("uitgeschakeld: disabled en aria-disabled geven opacity-50 zonder hover", () => {
  heeft(chipKlassen({}), "disabled:cursor-not-allowed", "disabled:opacity-50", "disabled:hover:border-border",
    "aria-disabled:cursor-not-allowed", "aria-disabled:opacity-50", "aria-disabled:hover:border-border");
  heeft(chipKlassen({ geselecteerd: true }), "disabled:cursor-not-allowed", "disabled:opacity-50", "disabled:hover:bg-accent",
    "aria-disabled:cursor-not-allowed", "aria-disabled:opacity-50", "aria-disabled:hover:bg-accent");
});

test("geen afwijkende tekstmaten", () => {
  for (const geselecteerd of [false, true]) assert.ok(!/text-\[/.test(chipKlassen({ geselecteerd })));
});

test("className komt achteraan en voegt alleen toe", () => {
  const k = chipKlassen({ className: "flex-none min-w-16" });
  assert.ok(k.endsWith(" flex-none min-w-16"), k);
  assert.equal(chipKlassen({ className: undefined }), chipKlassen({}));
});

test("standaard type=\"button\"; submit blijft expliciet mogelijk", () => {
  assert.equal(chipOnderdelen({}).type, "button");
  assert.equal(chipOnderdelen({ type: "submit" }).type, "submit");
});

test("aria-pressed alleen als geselecteerd gezet is", () => {
  assert.equal(chipOnderdelen({}).ariaPressed, undefined);
  assert.equal(chipOnderdelen({ geselecteerd: false }).ariaPressed, false);
  assert.equal(chipOnderdelen({ geselecteerd: true }).ariaPressed, true);
});

test("overige attributen (aria-*, disabled, onClick, ref) gaan ongewijzigd door; stijlprops niet", () => {
  const onClick = () => {};
  const o = chipOnderdelen({ geselecteerd: true, maat: "groot", className: "flex-1", disabled: true, onClick, "aria-label": "x", "aria-describedby": "d" });
  const rest = o.rest as Record<string, unknown>;
  assert.equal(rest.disabled, true);
  assert.equal(rest.onClick, onClick);
  assert.equal(rest["aria-label"], "x");
  assert.equal(rest["aria-describedby"], "d");
  for (const sleutel of ["geselecteerd", "maat", "className", "type"]) assert.ok(!(sleutel in rest), sleutel);
});

test("Chip en chipKlassen lezen useShell/density niet (ADR 0026)", () => {
  for (const bestand of ["src/components/Chip.tsx", "src/components/chipKlassen.ts"]) {
    const bron = readFileSync(bestand, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/useShell|density/.test(bron), bestand);
  }
});

test("klassen staan als volledige literals: geen dynamisch samengestelde Tailwind-klassen", () => {
  const bron = readFileSync("src/components/chipKlassen.ts", "utf8");
  assert.ok(!/`[^`]*\$\{/.test(bron), "template literal met interpolatie");
});

// Typecontracten: dit bestand wordt door `npm run typecheck` gecontroleerd.
export function typeContracten() {
  const goed: ChipProps[] = [{}, { geselecteerd: true, maat: "groot" }, { onClick: () => {}, disabled: true }];
  // @ts-expect-error onbekende maat
  const onbekend: ChipProps = { maat: "klein" };
  return [goed, onbekend];
}
