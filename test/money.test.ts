import { test } from "node:test";
import assert from "node:assert/strict";

import { formatCents, parseEuroToCents } from "../src/lib/money.ts";

/**
 * Unit tests voor src/lib/money.ts. Toegevoegd bij de app-review van
 * 2026-09-21: dit bestand parseert wat een mens in een geldveld tikt en
 * rendert elk bedrag dat de app toont, en had tot dan geen enkele test —
 * de hele TypeScript-kant leunde op `tsc` en de axe-scan.
 *
 * Draait op Node's ingebouwde testrunner met native type-stripping
 * (Node ≥ 22.18), dus zonder testframework als dependency. Twee gevolgen
 * voor de vorm van dit bestand:
 *   - imports hebben een expliciete `.ts`-extensie nodig (Node lost geen
 *     extensieloze TS-paden op) en gebruiken een relatief pad, geen `@/`
 *     — de tsconfig-alias is een bundler-feature die Node niet kent;
 *   - alleen type-annotaties worden gestript, geen TS-constructen die code
 *     genereren (enums, decorators, namespaces). Geen van beide staat in
 *     deze codebase, dus dat is hier geen beperking.
 *
 * Geen vervanging voor de pgTAP-suite: geld wordt server-side berekend
 * (CLAUDE.md → Architectuurbeslissingen). Dit dekt de twee dingen die
 * bewust wél client-side gebeuren — invoer parsen en centen renderen.
 */

// Intl zet een non-breaking space (U+00A0) tussen het euroteken en het
// bedrag. Die staat er terecht, maar hem letterlijk in elke assertie
// overtikken maakt de test onleesbaar en breekt zodra iemand het bestand
// door een editor haalt die NBSP normaliseert.
function normalize(formatted: string): string {
  return formatted.replace(/ /g, " ");
}

test("formatCents rendert hele en gebroken bedragen in nl-NL-notatie", () => {
  assert.equal(normalize(formatCents(453)), "€ 4,53");
  assert.equal(normalize(formatCents(0)), "€ 0,00");
  assert.equal(normalize(formatCents(500)), "€ 5,00");
});

test("formatCents gebruikt een punt als duizendtalscheiding", () => {
  // De €500-cap uit 0016_top_up_maximumbedrag.sql wordt via deze functie
  // aan de bardienst getoond (topUpAmountTooHighMessage).
  assert.equal(normalize(formatCents(50000)), "€ 500,00");
  assert.equal(normalize(formatCents(1234567)), "€ 12.345,67");
});

test("formatCents zet het minteken ná het euroteken, niet ervoor", () => {
  // Een negatief saldo is een normale toestand in deze app (CLAUDE.md →
  // Domein: negatief saldo mag tot de ingestelde limiet), dus dit is geen
  // randgeval maar dagelijkse weergave in het mandje-paneel.
  assert.equal(normalize(formatCents(-100)), "€ -1,00");
});

test("parseEuroToCents accepteert beide decimaalscheidingstekens", () => {
  // Nederlandse toetsenborden geven standaard een komma; een numeriek
  // toetsenblok of plakactie kan een punt opleveren.
  assert.equal(parseEuroToCents("2,50"), 250);
  assert.equal(parseEuroToCents("2.50"), 250);
});

test("parseEuroToCents accepteert een bedrag zonder decimalen", () => {
  assert.equal(parseEuroToCents("2"), 200);
  assert.equal(parseEuroToCents("50"), 5000);
});

test("parseEuroToCents accepteert één decimaal", () => {
  assert.equal(parseEuroToCents("2,5"), 250);
});

test("parseEuroToCents negeert omringende spaties", () => {
  assert.equal(parseEuroToCents("  2,50  "), 250);
});

test("parseEuroToCents geeft null voor leeg of alleen spaties", () => {
  // Callers behandelen null als "nog geen geldig bedrag", nadrukkelijk
  // niet als €0 — zie de docstring in src/lib/money.ts.
  assert.equal(parseEuroToCents(""), null);
  assert.equal(parseEuroToCents("   "), null);
});

test("parseEuroToCents weigert alles wat geen kaal decimaal getal is", () => {
  // parseFloat alleen zou "2.50abc" stilzwijgend als 2.5 accepteren —
  // vandaar de regex ervoor. Dit is de assertie die dat vastlegt.
  assert.equal(parseEuroToCents("2.50abc"), null);
  assert.equal(parseEuroToCents("abc"), null);
  assert.equal(parseEuroToCents("+2.50"), null);
  assert.equal(parseEuroToCents("1e3"), null);
  assert.equal(parseEuroToCents("2,5,0"), null);
  assert.equal(parseEuroToCents("€2,50"), null);
});

test("parseEuroToCents weigert een negatief bedrag", () => {
  assert.equal(parseEuroToCents("-1"), null);
  assert.equal(parseEuroToCents("-1,00"), null);
});

test("parseEuroToCents weigert meer dan twee decimalen", () => {
  // Er bestaat geen halve cent om naartoe af te ronden; stil afronden zou
  // een bedrag opleveren dat de operator niet heeft ingetikt.
  assert.equal(parseEuroToCents("2,555"), null);
});

test("parseEuroToCents geeft 0 voor een ingetikte nul", () => {
  // Bewust géén null: "0" is een geldig getal, alleen geen bruikbaar
  // bedrag. Het onderscheid hoort bij de caller (OpwaarderenOverlay eist
  // `amountCents > 0`), niet bij de parser — vastgelegd zodat een latere
  // "0 is ook maar leeg"-vereenvoudiging opvalt.
  assert.equal(parseEuroToCents("0"), 0);
  assert.equal(parseEuroToCents("0,00"), 0);
});

test("parseEuroToCents rondt geen drijvende-kommafout in", () => {
  // 1,15 * 100 is in IEEE-754 114.99999999999999 — zonder de Math.round()
  // in parseEuroToCents zou dit 114 cent worden.
  assert.equal(parseEuroToCents("1,15"), 115);
  assert.equal(parseEuroToCents("8,45"), 845);
  assert.equal(parseEuroToCents("10,10"), 1010);
});

test("parseEuroToCents verwerkt een bedrag ver boven de opwaardeergrens", () => {
  // De typefout waar 0016_top_up_maximumbedrag.sql voor bestaat ("5000"
  // in plaats van "50,00") moet als getal gewoon door de parser komen —
  // hem hier al weigeren zou de grens op twee plekken leggen en de
  // foutmelding onduidelijk maken.
  assert.equal(parseEuroToCents("5000"), 500000);
});
