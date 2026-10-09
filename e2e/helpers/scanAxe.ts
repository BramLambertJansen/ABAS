// kit: generiek
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import axe from "axe-core";

/**
 * De enige ingang voor een axe-scan (docs/features/scan-axe.md). Vaste
 * WCAG 2.2 AA-tagset, optioneel uitgebreid met best-practice; regels
 * uitzetten of gebieden overslaan kan alleen met een reden, en elke
 * uitzondering wordt als annotatie `axe-uitzondering` op de test gezet.
 * Een geslaagde scan is stil, een mislukte faalt via `expect` met een
 * leesbare melding.
 */

/** WCAG 2.2 AA: axe-tags tellen niet op, dus alle vijf. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

export type ScanAxeOpties = {
  /** Beperk de scan tot dit gebied (CSS-selector). */
  binnen?: string;
  /** Voegt de tag `best-practice` toe. Kan alleen uitbreiden. */
  bestPractice?: boolean;
  /** Regel niet uitvoeren. Telt mee in .kit/baseline.json → axe-uitzondering. */
  uitgezet?: readonly { regel: string; reden: string }[];
  /** Gebied niet scannen (exclude). Telt mee in .kit/baseline.json → axe-uitzondering. */
  overslaan?: readonly { selector: string; reden: string }[];
};

const MAX_ELEMENTEN = 5;

function leeg(waarde: string | undefined): boolean {
  return typeof waarde !== "string" || waarde.trim() === "";
}

/** Valideert de uitzonderingen en geeft per uitzondering één regel tekst. */
function uitzonderingen(opties: ScanAxeOpties): string[] {
  const bekend = new Set(axe.getRules().map((r) => r.ruleId));
  const regels: string[] = [];
  for (const { regel, reden } of opties.uitgezet ?? []) {
    if (leeg(regel) || leeg(reden)) throw new Error(`scanAxe: uitzondering zonder reden (${regel ?? ""})`);
    if (!bekend.has(regel)) throw new Error(`scanAxe: onbekende axe-regel "${regel}"`);
    regels.push(`uitgezet: ${regel} — ${reden}`);
  }
  for (const { selector, reden } of opties.overslaan ?? []) {
    if (leeg(selector) || leeg(reden)) throw new Error(`scanAxe: uitzondering zonder reden (${selector ?? ""})`);
    regels.push(`overslaan: ${selector} — ${reden}`);
  }
  return regels;
}

function doelTekst(target: axe.NodeResult["target"]): string {
  return (target as readonly (string | readonly string[])[])
    .map((deel) => (Array.isArray(deel) ? deel.join(" > ") : String(deel)))
    .join(" > ");
}

function melding(url: string, violations: axe.Result[], uitz: string[]): string {
  const n = violations.length;
  const kop = `axe (WCAG 2.2 AA): ${n} ${n === 1 ? "regel" : "regels"} geschonden op ${url}`;
  const blokken = violations.map((v) => {
    const regels = [`${v.id} [${v.impact ?? "onbekend"}] — ${v.help}`, `  ${v.helpUrl}`];
    for (const node of v.nodes.slice(0, MAX_ELEMENTEN)) {
      regels.push(`  • ${doelTekst(node.target)}`);
      for (const r of (node.failureSummary ?? "").split("\n")) regels.push(`    ${r}`);
    }
    if (v.nodes.length > MAX_ELEMENTEN) regels.push(`  (+${v.nodes.length - MAX_ELEMENTEN} meer)`);
    return regels.join("\n");
  });
  return [[kop, ...uitz].join("\n"), ...blokken].join("\n\n");
}

export async function scanAxe(page: Page, opties: ScanAxeOpties = {}): Promise<void> {
  // Vóór de scan: een uitzondering zonder reden of met een onbekende regel faalt meteen.
  const uitz = uitzonderingen(opties);
  for (const beschrijving of uitz) {
    test.info().annotations.push({ type: "axe-uitzondering", description: beschrijving });
  }

  const tags = opties.bestPractice ? [...WCAG_TAGS, "best-practice"] : [...WCAG_TAGS];
  const stap = opties.bestPractice ? "axe: WCAG 2.2 AA + best-practice" : "axe: WCAG 2.2 AA";

  await test.step(stap, async () => {
    let builder = new AxeBuilder({ page }).withTags(tags);
    if (opties.binnen !== undefined) builder = builder.include(opties.binnen);
    for (const { selector } of opties.overslaan ?? []) builder = builder.exclude(selector);
    const uit = (opties.uitgezet ?? []).map((u) => u.regel);
    if (uit.length > 0) builder = builder.disableRules(uit);

    const { violations } = await builder.analyze();
    expect(violations.map((v) => v.id), melding(page.url(), violations, uitz)).toEqual([]);
  });
}
