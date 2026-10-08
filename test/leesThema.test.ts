import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { leesThema, parseThema } from "../src/lib/systeem/leesThema.ts";

/**
 * De tokenparser van /design/systeem (docs/features/ontwerpsysteem.md): de
 * pagina leest het @theme-blok zelf, zodat hij niet van de tokens kan afwijken.
 */

const css = readFileSync("src/app/globals.css", "utf8");
const namen = (tokens: Array<{ naam: string }>) => tokens.map((t) => t.naam);

/** Alle `--<voorvoegsel>*`-declaraties in het themablok van globals.css, onafhankelijk van de parser. */
function ruweNamen(voorvoegsel: string): string[] {
  const blok = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const kaal = blok.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...kaal.matchAll(new RegExp(`(--${voorvoegsel}[\\w-]*)\\s*:`, "g"))].map((m) => m[1] ?? "");
}

test("globals.css: elk --color-, --height-, --radius-, --shadow- en --text-token wordt gevonden", () => {
  const thema = leesThema("src/app/globals.css");
  assert.deepEqual(namen(thema.kleuren), ruweNamen("color-"));
  assert.deepEqual(namen(thema.hoogtes), ruweNamen("height-"));
  assert.deepEqual(namen(thema.radii), ruweNamen("radius-"));
  assert.deepEqual(namen(thema.schaduwen), ruweNamen("shadow-"));
  assert.deepEqual(namen(thema.tekstmaten), ruweNamen("text-").filter((n) => !n.includes("--line-height")));
  for (const lijst of [thema.kleuren, thema.hoogtes, thema.radii, thema.schaduwen, thema.tekstmaten]) {
    assert.ok(lijst.length > 0);
  }
});

test("globals.css: bekende waarden en groepering", () => {
  const thema = leesThema("src/app/globals.css");
  assert.equal(thema.hoogtes.find((t) => t.kort === "control")?.waarde, "44px");
  assert.equal(thema.radii.find((t) => t.naam === "--radius-sheet")?.waarde, "28px");
  assert.equal(thema.kleuren.find((t) => t.naam === "--color-accent")?.waarde, "#ee5a24");
  // Een schaduw met meerdere lagen blijft één waarde.
  assert.match(thema.schaduwen.find((t) => t.kort === "segment")?.waarde ?? "", /^0 1px 2px .*, 0 4px 12px/);
  // Regelhoogte-varianten zijn geen tekstmaat; ze staan in overig.
  assert.ok(!thema.tekstmaten.some((t) => t.naam.includes("--line-height")));
  assert.ok(thema.overig.some((t) => t.naam === "--text-xs--line-height"));
  assert.ok(thema.overig.some((t) => t.naam === "--spacing"));
});

test("`--*: initial` is geen token", () => {
  const thema = parseThema("@theme { --*: initial; --color-a: #fff; --color-*: initial; }");
  assert.deepEqual(namen(thema.kleuren), ["--color-a"]);
  assert.deepEqual(thema.overig, []);
  const alles = Object.values(thema).flat();
  assert.ok(!alles.some((t) => t.waarde === "initial" || t.naam.includes("*")));
});

test("een benoemd token dat op `initial` staat is verwijderd", () => {
  const thema = parseThema("@theme { --color-a: #fff; --color-a: initial; --color-b: #000; }");
  assert.deepEqual(namen(thema.kleuren), ["--color-b"]);
});

test("calc(), meerregelige waarden en commentaar", () => {
  const thema = parseThema(`
    /* buiten het blok: --color-weg: red; */
    @theme {
      /* --color-commentaar: red; */
      --text-xs: 0.75rem;
      --text-xs--line-height: calc(1 / 0.75);
      --shadow-twee:
        0 1px 2px rgba(0, 0, 0, 0.1),
        0 4px 12px -6px rgba(0, 0, 0, 0.28);
      --color-a: #abc; /* na de waarde */
      --font-sans:
        var(--font-x), sans-serif;
      --height-a: calc(var(--spacing) * 11);
    }
  `);
  assert.deepEqual(namen(thema.kleuren), ["--color-a"]);
  assert.equal(thema.kleuren[0]?.waarde, "#abc");
  assert.equal(thema.schaduwen[0]?.waarde, "0 1px 2px rgba(0, 0, 0, 0.1), 0 4px 12px -6px rgba(0, 0, 0, 0.28)");
  assert.equal(thema.hoogtes[0]?.waarde, "calc(var(--spacing) * 11)");
  assert.deepEqual(namen(thema.tekstmaten), ["--text-xs"]);
  assert.equal(thema.overig.find((t) => t.naam === "--text-xs--line-height")?.waarde, "calc(1 / 0.75)");
  assert.equal(thema.overig.find((t) => t.naam === "--font-sans")?.waarde, "var(--font-x), sans-serif");
});

test("geneste blokken (@keyframes) en een laatste declaratie zonder puntkomma", () => {
  const thema = parseThema(`
    @theme {
      --radius-a: 4px;
      @keyframes sheet-in {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
      --radius-b: 8px
    }
    .x { --color-buiten: red; }
  `);
  assert.deepEqual(namen(thema.radii), ["--radius-a", "--radius-b"]);
  assert.deepEqual(thema.kleuren, []);
  assert.deepEqual(thema.overig, []);
});

test("zonder @theme-blok is elke groep leeg", () => {
  const thema = parseThema(".x { --color-a: red; }");
  assert.deepEqual(Object.values(thema).flat(), []);
});

test("leesThema met een niet-bestaand pad gooit", () => {
  assert.throws(() => leesThema("src/app/bestaat-niet.css"), { code: "ENOENT" });
});

test("meerdere @theme-blokken worden samengevoegd, in volgorde", () => {
  const thema = parseThema(`
    @theme { --color-a: #111; }
    .x { color: red; }
    @theme { --color-b: #222; --radius-r: 4px; }
  `);
  assert.deepEqual(namen(thema.kleuren), ["--color-a", "--color-b"]);
  assert.deepEqual(namen(thema.radii), ["--radius-r"]);
});

test("`@theme inline { … }` wordt herkend", () => {
  const thema = parseThema("@theme inline { --color-a: var(--x); --height-h: 10px; }");
  assert.deepEqual(namen(thema.kleuren), ["--color-a"]);
  assert.equal(thema.kleuren[0]?.waarde, "var(--x)");
  assert.deepEqual(namen(thema.hoogtes), ["--height-h"]);
});

test("een dubbel token: de laatste waarde wint, de eerste positie blijft", () => {
  const thema = parseThema("@theme { --color-a: #111; --color-b: #333; --color-a: #222; }");
  assert.deepEqual(namen(thema.kleuren), ["--color-a", "--color-b"]);
  assert.equal(thema.kleuren[0]?.waarde, "#222");
  // Ook over blokken heen.
  const over = parseThema("@theme { --color-a: #111; --color-b: #333; } @theme inline { --color-a: #444; }");
  assert.deepEqual(namen(over.kleuren), ["--color-a", "--color-b"]);
  assert.equal(over.kleuren[0]?.waarde, "#444");
});

test("een `;` binnen url(…) knipt de waarde niet af", () => {
  const thema = parseThema(`@theme {
    --x-data: url(data:image/svg+xml;base64,AAA);
    --x-pad: url("a;b.png");
    --color-a: red;
  }`);
  assert.equal(thema.overig.find((t) => t.naam === "--x-data")?.waarde, "url(data:image/svg+xml;base64,AAA)");
  assert.equal(thema.overig.find((t) => t.naam === "--x-pad")?.waarde, 'url("a;b.png")');
  assert.deepEqual(namen(thema.kleuren), ["--color-a"]);
});

// Bevinding Tester, opgelost: `declaraties()` kent aanhalingstekens, dus een `;`
// binnen een string knipt de waarde niet af.
test("een `;` binnen een string knipt de waarde niet af", () => {
  const thema = parseThema(`@theme { --font-q: "a;b"; --text-q: 'c;d'; --color-a: red; }`);
  assert.equal(thema.overig.find((t) => t.naam === "--font-q")?.waarde, '"a;b"');
  assert.equal(thema.tekstmaten.find((t) => t.naam === "--text-q")?.waarde, "'c;d'");
  assert.deepEqual(namen(thema.kleuren), ["--color-a"]);
});
