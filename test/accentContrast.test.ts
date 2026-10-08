import { test } from "node:test";
import assert from "node:assert/strict";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { knopKlassen } from "../src/components/knopKlassen.ts";
import { chipKlassen } from "../src/components/chipKlassen.ts";
import { segmentKlassen } from "../src/components/segmentKlassen.ts";
import { toetsKlassen } from "../src/components/toetsKlassen.ts";
import { methodLabel } from "../src/lib/betaalmethode.ts";

/**
 * Bewaakt de tekst/achtergrond-paren van de accent-knoppen (#66). axe ziet
 * een :hover-kleur alleen als de cursor toevallig op zo'n knop staat
 * tijdens een scan; deze test meet de tokens zelf. Zie de toelichting bij
 * `--color-accent` in src/app/globals.css voor welk paar waar gebruikt wordt.
 */

/**
 * De tokens staan sinds Tailwind v4 in het `@theme`-blok van
 * src/app/globals.css (ADR 0025 → R4). Dit bouwt daaruit dezelfde vorm als
 * het oude `tailwind.config.ts` (`theme.extend.colors` met `DEFAULT`,
 * `fontSize`, `fontFamily.sans`), zodat de asserties hieronder ongewijzigd
 * blijven.
 */
function themaUitCss(css: string) {
  const blok = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const zonderCommentaar = blok.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = [...zonderCommentaar.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, naam, waarde]) => [naam ?? "", (waarde ?? "").replace(/\s+/g, " ").trim()] as const);
  const kleuren = tokens.filter(([n]) => n.startsWith("color-")).map(([n, v]) => [n.slice(6), v] as const);
  const groepen = new Map<string, Array<readonly [string, string]>>();
  for (const [naam, waarde] of kleuren) {
    const [kop, ...rest] = naam.split("-");
    const lijst = groepen.get(kop ?? "") ?? [];
    lijst.push([rest.join("-"), waarde]);
    groepen.set(kop ?? "", lijst);
  }
  const colors: Record<string, unknown> = {};
  for (const [kop, lijst] of groepen) {
    const enkel = lijst.length === 1 && lijst[0]?.[0] === "" ? lijst[0] : undefined;
    colors[kop] = enkel ? enkel[1] : Object.fromEntries(lijst.map(([sub, v]) => [sub === "" ? "DEFAULT" : sub, v]));
  }
  const fontSize = Object.fromEntries(tokens.filter(([n]) => n.startsWith("text-")).map(([n, v]) => [n.slice(5), v]));
  const sans = (tokens.find(([n]) => n === "font-sans")?.[1] ?? "").split(",").map((d) => d.trim());
  return { theme: { extend: { colors, fontSize, fontFamily: { sans } } } };
}
const config = themaUitCss(readFileSync("src/app/globals.css", "utf8"));

const colors = config.theme?.extend?.colors as {
  accent: { DEFAULT: string; hover: string; active: string; pressed: string; soft: string };
  rail: { DEFAULT: string };
  success: string;
  track: string;
  canvas: string;
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

// SALDO-badge in het Logboek (text-success op bg-track, 9px vet — telt als
// kleine tekst) en de groene bedragen/regels op wit en canvas (#88).
test("text-success op track, wit en canvas haalt AA (#88)", () => {
  for (const bg of [colors.track, "#ffffff", colors.canvas]) {
    assert.ok(contrast(colors.success, bg) >= AA, `success op ${bg}`);
  }
});

test("de oude success (#157f4a) zou op track falen", () => {
  assert.ok(contrast("#157f4a", colors.track) < AA);
});

test("witte tekst op accent-pressed (hover/ingedrukt) haalt AA (T12)", () => {
  assert.ok(contrast("#ffffff", colors.accent.pressed) >= AA);
});

test("aanpalende paren: text-accent-active op wit en canvas, text-danger op accent-soft", () => {
  const all = config.theme?.extend?.colors as unknown as { danger: { DEFAULT: string } };
  assert.ok(contrast(colors.accent.active, "#ffffff") >= AA);
  assert.ok(contrast(colors.accent.active, colors.canvas) >= AA);
  assert.ok(contrast(all.danger.DEFAULT, colors.accent.soft) >= AA);
});

// Uitgeschakelde knoppen (`disabled:bg-track disabled:text-muted`) vallen
// buiten WCAG 1.4.3 (uitgeschakelde componenten); de test slaat alle
// `disabled:`-klassen daarom bewust over.

// --- Scan van de werkelijk gebruikte paren ------------------------------

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const name = k === "DEFAULT" ? prefix : prefix ? `${prefix}-${k}` : k;
    if (typeof v === "string") out[name] = v;
    else Object.assign(out, flatten(v as Record<string, unknown>, name));
  }
  return out;
}
const palette: Record<string, string> = {
  ...flatten(config.theme?.extend?.colors as Record<string, unknown>),
  white: "#ffffff",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

type Staat = "rust" | "hover" | "active" | "focus";

/** Rekent per staat het bg/text-paar van een lijst klassen door. */
export function slechteParen(classes: string[]): string[] {
  const kleur = { bg: {} as Record<string, string>, text: {} as Record<string, string> };
  for (const c of classes) {
    const m = c.match(/^(?:(group-hover|hover|active|focus-visible|focus|disabled|[a-z0-9-]+):)?(bg|text)-([a-z0-9-]+)$/);
    if (!m) continue;
    const [, variant, soort, token] = m;
    if (variant === "disabled") continue; // WCAG-uitzondering
    if (!(token in palette)) continue;
    const staat: Staat | null =
      variant === undefined ? "rust"
      : variant === "hover" || variant === "group-hover" ? "hover"
      : variant === "active" ? "active"
      : variant === "focus" || variant === "focus-visible" ? "focus"
      : null; // responsive e.d. varianten: niet beoordeeld
    if (!staat) continue;
    kleur[soort as "bg" | "text"][staat] = palette[token];
  }
  // Grote tekst (WCAG 1.4.3): >= 24px, of vet >= 18,66px -> drempel 3:1.
  const maten: Record<string, number> = { "text-xl": 20, "text-2xl": 24, "text-3xl": 30, "text-4xl": 36 };
  const rollen = config.theme?.extend?.fontSize as Record<string, string> | undefined;
  for (const [rol, maat] of Object.entries(rollen ?? {})) {
    if (/^\d+(?:\.\d+)?px$/.test(maat)) maten[`text-${rol}`] = parseFloat(maat);
  }
  let px = 14;
  for (const c of classes) {
    const arb = c.match(/^text-\[(\d+(?:\.\d+)?)px\]$/);
    if (arb) px = Number(arb[1]);
    else if (c in maten) px = maten[c];
  }
  const vet = classes.some((c) => c === "font-bold" || c === "font-extrabold" || c === "font-black");
  const drempel = px >= 24 || (vet && px >= 18.66) ? 3 : AA;
  const fouten: string[] = [];
  for (const staat of ["rust", "hover", "active", "focus"] as Staat[]) {
    const bg = kleur.bg[staat] ?? (staat === "rust" ? undefined : kleur.bg.rust);
    const tekst = kleur.text[staat] ?? (staat === "rust" ? undefined : kleur.text.rust);
    if (!bg || !tekst) continue;
    if (staat !== "rust" && !(kleur.bg[staat] || kleur.text[staat])) continue;
    const c = contrast(tekst, bg);
    if (c < drempel) fouten.push(`${staat}: ${tekst} op ${bg} = ${c.toFixed(2)}:1`);
  }
  return fouten;
}

function literalen(bron: string): string[] {
  return [...bron.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

test("alle klasse-literals in src/ met bg-<token> + text-<token|white> halen AA in rust, hover, active en focus", () => {
  const fouten: string[] = [];
  for (const file of walk("src")) {
    for (const lit of literalen(readFileSync(file, "utf8"))) {
      if (!/\b(bg|text)-/.test(lit)) continue;
      const bad = slechteParen(lit.split(/\s+/).filter(Boolean));
      for (const b of bad) fouten.push(`${file}: "${lit.slice(0, 120)}" -> ${b}`);
    }
  }
  assert.deepEqual(fouten, []);
});

test("de scan zou het oude geval (bg-accent-active text-white hover:bg-accent) hebben gevangen", () => {
  const bad = slechteParen("bg-accent-active text-white hover:bg-accent".split(" "));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /^hover:/);
  // disabled: telt niet mee
  assert.deepEqual(slechteParen("bg-accent-active text-white disabled:bg-track disabled:text-muted".split(" ")), []);
  // het nieuwe paar is goed
  assert.deepEqual(slechteParen("bg-accent-active text-white hover:bg-accent-pressed active:bg-accent-pressed".split(" ")), []);
});

test("knopKlassen: elke variant/toon/maat haalt AA per staat; geen wit op accent, geen donker met text-white", () => {
  for (const variant of ["primair", "secundair", "gevaar", "tekst"] as const) {
    for (const tone of ["licht", "rail"] as const) {
      for (const maat of ["normaal", "groot"] as const) {
        for (const icoon of [false, true]) {
          const klassen = knopKlassen({ variant, tone, maat, icoon });
          assert.deepEqual(slechteParen(klassen.split(" ")), [], klassen);
        }
      }
    }
  }
  const primair = knopKlassen({ variant: "primair" }).split(" ");
  assert.ok(primair.includes("bg-accent") && primair.includes("text-rail"));
  assert.ok(primair.includes("hover:bg-accent-hover") && !primair.includes("hover:bg-accent"));
  assert.ok(!primair.includes("text-white"));
});

// Paren uit de tabel in docs/features/knop.md. Uitgeschakeld (`disabled:` en
// `aria-disabled:`) valt buiten WCAG 1.4.3 en staat hier dus niet in.
test("Knop-paren: elk paar uit de spec haalt AA (4,5:1)", () => {
  const paren: Array<[string, string, string]> = [
    ["primair: text-rail op accent", "rail", "accent"],
    ["primair hover: text-rail op accent-hover", "rail", "accent-hover"],
    ["gevaar: white op danger", "white", "danger"],
    ["gevaar hover: white op ink", "white", "ink"],
    ["secundair rail: rail-light op surface-rail", "rail-light", "surface-rail"],
    ["secundair rail hover: rail-light op rail-hover", "rail-light", "rail-hover"],
    ["secundair licht: ink op surface", "ink", "surface"],
    ["tekst rail: rail-muted op rail", "rail-muted", "rail"],
    ["tekst rail hover: rail-light op rail", "rail-light", "rail"],
    ["tekst licht: muted op canvas", "muted", "canvas"],
    ["tekst licht hover: ink op canvas", "ink", "canvas"],
    // PR 2 (Chip, Segment, Toets)
    ["chip geselecteerd (ook teller): rail op accent", "rail", "accent"],
    ["chip geselecteerd hover (ook teller): rail op accent-hover", "rail", "accent-hover"],
    ["chip in rust: ink op surface", "ink", "surface"],
    ["segment geselecteerd: ink op surface", "ink", "surface"],
    ["segment in rust: muted-strong op track", "muted-strong", "track"],
    ["teller in rust: muted op surface", "muted", "surface"],
    ["keypad licht en stap: ink op surface", "ink", "surface"],
    ["keypad rail: white op surface-rail", "white", "surface-rail"],
    ["keypad rail hover: white op rail-key-hover", "white", "rail-key-hover"],
  ];
  for (const [naam, tekst, bg] of paren) {
    const t = palette[tekst];
    const b = palette[bg];
    assert.ok(t && b, `${naam}: token ontbreekt in @theme`);
    const c = contrast(t, b);
    assert.ok(c >= AA, `${naam} = ${c.toFixed(2)}:1`);
  }
});

test("PR 2: de literal-scan loopt over chipKlassen, segmentKlassen en toetsKlassen en is groen", () => {
  const bestanden = ["chipKlassen.ts", "segmentKlassen.ts", "toetsKlassen.ts"].map((f) => join("src/components", f));
  const gescand = new Set(walk("src"));
  for (const f of bestanden) {
    assert.ok(gescand.has(f), `${f} zit niet in de scan van src/`);
    const paren = literalen(readFileSync(f, "utf8")).filter((l) => /\b(bg|text)-/.test(l));
    assert.ok(paren.length > 0, `${f}: geen kleurliteral gevonden`);
    for (const lit of paren) assert.deepEqual(slechteParen(lit.split(/\s+/).filter(Boolean)), [], `${f}: ${lit}`);
  }
  // De klassen die het component echt samenstelt, per staat doorgerekend.
  for (const geselecteerd of [false, true]) for (const maat of ["normaal", "groot"] as const) {
    assert.deepEqual(slechteParen(chipKlassen({ geselecteerd, maat }).split(" ")), []);
    assert.deepEqual(slechteParen(segmentKlassen({ geselecteerd, maat }).split(" ")), []);
  }
  for (const k of [toetsKlassen({ soort: "keypad" }), toetsKlassen({ soort: "keypad", tone: "rail" }), toetsKlassen({ soort: "stap" })]) {
    assert.deepEqual(slechteParen(k.split(" ")), [], k);
  }
});

test("taal: 'cash' wordt 'contant' (F27)", () => {
  assert.equal(methodLabel("cash"), "contant");
});

test("taal: geen 'Invite' of 'Annuleer' in UI-tekst (JSX-tekst en stringliteralen)", () => {
  const fouten: string[] = [];
  for (const file of walk("src").filter((f) => f.endsWith(".tsx"))) {
    // commentaar eruit; identifiers (sendInvite, useSendMemberInvite) zijn geen UI-tekst
    const bron = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const ui = [
      ...[...bron.matchAll(/>([^<>{}\n]+)</g)].map((m) => m[1]),
      ...literalen(bron),
    ];
    for (const t of ui) {
      if (/\bInvite\b/.test(t) || /\bAnnuleer\b/i.test(t)) fouten.push(`${file}: ${t.trim()}`);
    }
  }
  assert.deepEqual(fouten, []);
});

// --- Aanvulling tester (T12) --------------------------------------------

test("scan: wit op hover/accent en wit op accent-hover worden gevangen, donker op accent-hover niet", () => {
  assert.equal(slechteParen("bg-accent text-white".split(" ")).length, 1);
  assert.equal(slechteParen("bg-accent-active text-white hover:bg-accent-hover".split(" ")).length, 1);
  assert.deepEqual(slechteParen("bg-accent text-rail hover:bg-accent-hover".split(" ")), []);
  // kleine tekst (arbitraire maat, vet < 18,66px) op accent met wit faalt; groot en vet mag (3:1)
  assert.equal(slechteParen("bg-accent text-white text-[12px] font-bold".split(" ")).length, 1);
  assert.deepEqual(slechteParen("bg-accent text-white text-2xl font-extrabold".split(" ")), []);
});

test("Manrope: woff2 is geldig, licentie staat erbij en er is geen extern fontverzoek in de broncode", () => {
  const woff = readFileSync("src/app/fonts/Manrope-Variable.woff2");
  assert.equal(woff.subarray(0, 4).toString("latin1"), "wOF2");
  assert.ok(woff.length > 10_000);
  assert.match(readFileSync("src/app/fonts/OFL.txt", "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/i);
  for (const file of [...walk("src"), "src/app/globals.css"]) {
    const bron = readFileSync(file, "utf8");
    assert.ok(!/fonts\.(googleapis|gstatic)\.com|next\/font\/google/.test(bron), `${file} verwijst naar Google Fonts`);
  }
  const fam = (config.theme?.extend as { fontFamily: { sans: string[] } }).fontFamily.sans;
  assert.equal(fam[0], "var(--font-manrope)");
  assert.ok(fam.includes("sans-serif"), "fallback ontbreekt");
});

test("kleurparen binnen één JSX-element mogen niet over meerdere literals verdeeld zijn: wit op bg-accent/accent-hover", () => {
  // Beperking van de scan (alleen losse literals): deze test pakt per bestand
  // elke regel waar text-white en een kale accent-/accent-hover-achtergrond in
  // dezelfde className staan, ongeacht literal-grenzen, en eist grote tekst.
  const fouten: string[] = [];
  for (const file of walk("src")) {
    for (const regel of readFileSync(file, "utf8").split("\n")) {
      if (!/\btext-white\b/.test(regel)) continue;
      if (!/(^|[\s"'`:])(?:hover:|active:|focus:)?bg-accent(?:-hover)?(?=[\s"'`]|$)/.test(regel)) continue;
      const px = regel.match(/text-\[(\d+(?:\.\d+)?)px\]/);
      const rollen = config.theme?.extend?.fontSize as Record<string, string> | undefined;
      const rolPx = Object.entries(rollen ?? {}).filter(([rol]) => regel.split(/\s+/).includes(`text-${rol}`)).map(([, maat]) => parseFloat(maat));
      const maat = Math.max(px ? Number(px[1]) : 0, ...rolPx);
      const groot = /text-(2xl|3xl|4xl)/.test(regel) || (maat >= 18.66 && /font-(bold|extrabold|black)/.test(regel));
      if (!groot) fouten.push(`${file}: ${regel.trim().slice(0, 140)}`);
    }
  }
  assert.deepEqual(fouten, []);
});
