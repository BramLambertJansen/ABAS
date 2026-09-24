import { test } from "node:test";
import assert from "node:assert/strict";

import config from "../tailwind.config.ts";

/**
 * Bewaakt de tekst/achtergrond-paren van de accent-knoppen (#66). axe ziet
 * een :hover-kleur alleen als de cursor toevallig op zo'n knop staat
 * tijdens een scan; deze test meet de tokens zelf. Zie de toelichting bij
 * `accent` in tailwind.config.ts voor welk paar waar gebruikt wordt.
 */

const colors = config.theme?.extend?.colors as {
  accent: { DEFAULT: string; hover: string; active: string };
  rail: { DEFAULT: string };
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

test("donkere tekst (text-rail) op accent haalt AA", () => {
  assert.ok(contrast(colors.rail.DEFAULT, colors.accent.DEFAULT) >= AA);
});

test("donkere tekst (text-rail) op accent-hover haalt AA (#66)", () => {
  assert.ok(contrast(colors.rail.DEFAULT, colors.accent.hover) >= AA);
});

test("witte tekst op accent-active haalt AA", () => {
  assert.ok(contrast("#ffffff", colors.accent.active) >= AA);
});

test("de oude accent-hover (#d94d1a) zou deze test laten falen", () => {
  assert.ok(contrast(colors.rail.DEFAULT, "#d94d1a") < AA);
});
