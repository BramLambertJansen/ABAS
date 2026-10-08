import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  segmentBalkKlassen,
  segmentKlassen,
  segmentOnderdelen,
  type SegmentProps,
} from "../src/components/segmentKlassen.ts";

/**
 * Segment en SegmentBalk (docs/features/knop.md → Aanvulling PR 2). De stijl
 * staat in segmentKlassen.ts, zodat deze test geen renderer nodig heeft.
 */

const heeft = (klassen: string, ...tokens: string[]) => {
  const lijst = klassen.split(/\s+/);
  for (const t of tokens) assert.ok(lijst.includes(t), `"${t}" ontbreekt in: ${klassen}`);
};
const mist = (klassen: string, ...tokens: string[]) => {
  const lijst = klassen.split(/\s+/);
  for (const t of tokens) assert.ok(!lijst.includes(t), `"${t}" hoort niet in: ${klassen}`);
};

test("balk: flex, track-ondergrond, rounded-card, p-1", () => {
  heeft(segmentBalkKlassen(), "flex", "rounded-card", "bg-track", "p-1");
});

test("balk: className komt achteraan en voegt alleen toe", () => {
  assert.ok(segmentBalkKlassen("mx-5 mt-4 flex-wrap").endsWith(" mx-5 mt-4 flex-wrap"));
  assert.equal(segmentBalkKlassen(undefined), segmentBalkKlassen());
});

test("segment in rust: muted-strong, hover ink, geen vlak", () => {
  const k = segmentKlassen({});
  heeft(k, "text-muted-strong", "hover:text-ink", "rounded-control", "h-control", "text-sm", "font-bold");
  mist(k, "text-muted", "bg-surface", "shadow-segment", "bg-ink", "text-white");
  assert.equal(k, segmentKlassen({ geselecteerd: false, maat: "normaal" }));
});

test("segment geselecteerd: wit vlak met schaduw, tekst ink", () => {
  const k = segmentKlassen({ geselecteerd: true });
  heeft(k, "bg-surface", "text-ink", "shadow-segment");
  mist(k, "text-muted-strong", "bg-ink", "text-white");
});

test("maat: normaal h-control, groot h-control-lg", () => {
  heeft(segmentKlassen({ maat: "normaal" }), "h-control");
  mist(segmentKlassen({ maat: "normaal" }), "h-control-lg");
  heeft(segmentKlassen({ maat: "groot" }), "h-control-lg");
  mist(segmentKlassen({ maat: "groot" }), "h-control");
});

test("geen afwijkende tekstmaten", () => {
  for (const geselecteerd of [false, true]) assert.ok(!/text-\[/.test(segmentKlassen({ geselecteerd })));
});

test("segment: className komt achteraan en voegt alleen toe", () => {
  assert.ok(segmentKlassen({ className: "flex-1" }).endsWith(" flex-1"));
  assert.equal(segmentKlassen({ className: undefined }), segmentKlassen({}));
});

test("standaard type=\"button\"; aria-pressed alleen als geselecteerd gezet is", () => {
  assert.equal(segmentOnderdelen({}).type, "button");
  assert.equal(segmentOnderdelen({ type: "submit" }).type, "submit");
  assert.equal(segmentOnderdelen({}).ariaPressed, undefined);
  assert.equal(segmentOnderdelen({ geselecteerd: false }).ariaPressed, false);
  assert.equal(segmentOnderdelen({ geselecteerd: true }).ariaPressed, true);
});

test("overige attributen gaan ongewijzigd door; stijlprops niet", () => {
  const onClick = () => {};
  const o = segmentOnderdelen({ geselecteerd: true, maat: "groot", className: "flex-1", onClick, "aria-label": "x" });
  const rest = o.rest as Record<string, unknown>;
  assert.equal(rest.onClick, onClick);
  assert.equal(rest["aria-label"], "x");
  for (const sleutel of ["geselecteerd", "maat", "className", "type"]) assert.ok(!(sleutel in rest), sleutel);
});

test("Segment en segmentKlassen lezen useShell/density niet (ADR 0026)", () => {
  for (const bestand of ["src/components/Segment.tsx", "src/components/segmentKlassen.ts"]) {
    const bron = readFileSync(bestand, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/useShell|density/.test(bron), bestand);
  }
});

test("klassen staan als volledige literals: geen dynamisch samengestelde Tailwind-klassen", () => {
  const bron = readFileSync("src/components/segmentKlassen.ts", "utf8");
  assert.ok(!/`[^`]*\$\{/.test(bron), "template literal met interpolatie");
});

test("TabList stijl=\"segment\" gebruikt dezelfde klassen en laat stijl=\"eigen\" ongemoeid", () => {
  const bron = readFileSync("src/components/Tabs.tsx", "utf8");
  assert.ok(/segmentBalkKlassen/.test(bron) && /segmentKlassen/.test(bron));
  assert.ok(/stijl = "eigen"/.test(bron), "standaard moet eigen zijn");
});

// Typecontracten: dit bestand wordt door `npm run typecheck` gecontroleerd.
export function typeContracten() {
  const goed: SegmentProps[] = [{}, { geselecteerd: true, maat: "groot", className: "flex-1" }];
  // @ts-expect-error onbekende maat
  const onbekend: SegmentProps = { maat: "klein" };
  return [goed, onbekend];
}
