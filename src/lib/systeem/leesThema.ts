// kit: generiek
import { readFileSync } from "node:fs";

/**
 * Leest het `@theme`-blok (Tailwind v4) uit een CSS-bestand en groepeert de
 * tokens op hun naamconventie. Tokennamen worden nooit vastgelegd: wat in het
 * bestand staat, staat in het resultaat. Server-side (`node:fs`).
 */

export type ThemaToken = {
  /** De volledige naam van de custom property, bv. `--color-x`. */
  naam: string;
  /** De naam zonder groepsvoorvoegsel, bv. `x`. */
  kort: string;
  /** De ruwe waarde, witruimte samengevouwen (`calc()` en meerregelige waarden blijven tekst). */
  waarde: string;
};

export type Thema = {
  kleuren: ThemaToken[];
  hoogtes: ThemaToken[];
  radii: ThemaToken[];
  schaduwen: ThemaToken[];
  tekstmaten: ThemaToken[];
  overig: ThemaToken[];
};

export type ThemaGroep = keyof Thema;

const VOORVOEGSELS = {
  kleuren: "--color-",
  hoogtes: "--height-",
  radii: "--radius-",
  schaduwen: "--shadow-",
  tekstmaten: "--text-",
} as const;

function zonderCommentaar(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** De inhoud van elk `@theme { … }`-blok, met accolades in evenwicht. */
function themaBlokken(css: string): string[] {
  const blokken: string[] = [];
  const begin = /@theme\b[^{;]*\{/g;
  for (let treffer = begin.exec(css); treffer !== null; treffer = begin.exec(css)) {
    const start = treffer.index + treffer[0].length;
    let diepte = 1;
    let eind = start;
    while (eind < css.length && diepte > 0) {
      const teken = css.charAt(eind);
      if (teken === "{") diepte++;
      else if (teken === "}") diepte--;
      eind++;
    }
    blokken.push(css.slice(start, diepte === 0 ? eind - 1 : eind));
    begin.lastIndex = eind;
  }
  return blokken;
}

/** Declaraties op het bovenste niveau; geneste blokken (`@keyframes`) vallen weg. */
function declaraties(inhoud: string): string[] {
  const uit: string[] = [];
  let huidig = "";
  let haakjes = 0;
  let accolades = 0;
  let aanhaling: string | null = null;
  for (const teken of inhoud) {
    // Binnen een string (`"a;b"`) tellen `;`, haakjes en accolades niet mee.
    if (aanhaling !== null) {
      if (accolades === 0) huidig += teken;
      if (teken === aanhaling) aanhaling = null;
      continue;
    }
    if (teken === '"' || teken === "'") {
      aanhaling = teken;
      if (accolades === 0) huidig += teken;
      continue;
    }
    if (teken === "{") {
      if (accolades === 0) huidig = "";
      accolades++;
      continue;
    }
    if (teken === "}") {
      accolades = Math.max(0, accolades - 1);
      continue;
    }
    if (accolades > 0) continue;
    if (teken === "(") haakjes++;
    else if (teken === ")") haakjes = Math.max(0, haakjes - 1);
    if (teken === ";" && haakjes === 0) {
      uit.push(huidig);
      huidig = "";
    } else {
      huidig += teken;
    }
  }
  uit.push(huidig);
  return uit;
}

/** Groepeert de tokens van een CSS-tekst; los van het bestand, voor tests. */
export function parseThema(css: string): Thema {
  const tokens = new Map<string, string>();
  for (const blok of themaBlokken(zonderCommentaar(css))) {
    for (const regel of declaraties(blok)) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(regel);
      const naam = m?.[1];
      const waarde = m?.[2]?.replace(/\s+/g, " ");
      // `--*: initial` en `--color-*: initial` komen niet door het patroon; een
      // benoemd token dat op `initial` staat is verwijderd en telt niet mee.
      if (naam === undefined || waarde === undefined) continue;
      if (waarde === "initial") tokens.delete(naam);
      else tokens.set(naam, waarde);
    }
  }

  const thema: Thema = { kleuren: [], hoogtes: [], radii: [], schaduwen: [], tekstmaten: [], overig: [] };
  for (const [naam, waarde] of tokens) {
    let groep: ThemaGroep = "overig";
    let kort = naam.slice(2);
    for (const kandidaat of Object.keys(VOORVOEGSELS) as Array<keyof typeof VOORVOEGSELS>) {
      const voorvoegsel = VOORVOEGSELS[kandidaat];
      if (!naam.startsWith(voorvoegsel)) continue;
      const rest = naam.slice(voorvoegsel.length);
      // `--text-xs--line-height` is een variant van een maat, geen maat.
      if (rest === "" || rest.includes("--")) break;
      groep = kandidaat;
      kort = rest;
      break;
    }
    thema[groep].push({ naam, kort, waarde });
  }
  return thema;
}

/** Leest het thema uit een CSS-bestand, pad ten opzichte van de projectmap. */
export function leesThema(cssPad: string): Thema {
  return parseThema(readFileSync(cssPad, "utf8"));
}
