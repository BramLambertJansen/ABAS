/**
 * Gedeelde, DOM-gebonden staat voor open `Overlay`s (docs/features/
 * dialogen-tabs-landmarks.md → 2, 3 en 5): achtergrond `inert`, scrolllock en
 * de plek waar de focus bij sluiten naartoe terugkeert.
 *
 * Eén teller in plaats van per-overlay-staat, zodat de overgang overlay A →
 * overlay B (unmount en mount in één commit, bv. Lid beheren → Bestellingen →
 * Terugdraaien) de achtergrond niet heropent en de oorspronkelijke trigger
 * behoudt. Het loslaten gebeurt daarom uitgesteld (`setTimeout 0`) en wordt
 * geannuleerd als er intussen weer een overlay opent. Gelijktijdig stapelen
 * blijft verboden (ADR 0014); de teller is alleen voor de opeenvolging.
 */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NEXT-ROUTE-ANNOUNCER"]);

let count = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let trigger: HTMLElement | null = null;
let fallback: { current: HTMLElement | null } | null = null;
// Per door ons inert gemaakt element: er is niets om te herstellen behalve
// het verwijderen van het attribuut (al-inerte elementen raken we niet aan).
const inerted = new Set<Element>();
let savedOverflow: string | null = null;
let savedPaddingRight: string | null = null;

function restoreInert() {
  for (const el of inerted) el.removeAttribute("inert");
  inerted.clear();
}

/** `inert` op elke sibling van `root` en van zijn voorouders tot `body`. */
function applyInert(root: HTMLElement) {
  restoreInert();
  let node: HTMLElement | null = root;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || SKIP_TAGS.has(sibling.tagName)) continue;
      if (sibling.hasAttribute("inert")) continue;
      sibling.setAttribute("inert", "");
      inerted.add(sibling);
    }
    node = parent;
  }
}

function lockScroll() {
  const html = document.documentElement;
  const body = document.body;
  savedOverflow = html.style.overflow;
  savedPaddingRight = body.style.paddingRight;
  // Geen layoutverspringing: de verdwijnende scrollbalk vervangen we door
  // padding van dezelfde breedte (0 bij overlay-scrollbars en op touch).
  const scrollbar = window.innerWidth - html.clientWidth;
  html.style.overflow = "hidden";
  if (scrollbar > 0) {
    const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + scrollbar}px`;
  }
}

function unlockScroll() {
  if (savedOverflow === null) return;
  document.documentElement.style.overflow = savedOverflow;
  document.body.style.paddingRight = savedPaddingRight ?? "";
  savedOverflow = null;
  savedPaddingRight = null;
}

function isFocusTarget(el: HTMLElement | null): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  if (el.closest("[inert], [hidden]")) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  return el.getClientRects().length > 0;
}

function focusFirstAvailable(candidates: (HTMLElement | null | undefined)[]) {
  for (const el of candidates) {
    if (!el) continue;
    if (!isFocusTarget(el)) continue;
    if (!el.hasAttribute("tabindex") && !el.matches("a[href], button, input, select, textarea")) {
      el.setAttribute("tabindex", "-1");
    }
    el.focus();
    if (document.activeElement === el) return;
  }
}

function release() {
  releaseTimer = null;
  restoreInert();
  unlockScroll();
  const returnTo = trigger;
  const fallbackEl = fallback?.current ?? null;
  trigger = null;
  fallback = null;
  // Trigger, dan de door de consument opgegeven opvolger, dan het actieve
  // tabpanel, dan main (spec → 5).
  focusFirstAvailable([
    returnTo,
    fallbackEl,
    document.querySelector<HTMLElement>('[role="tabpanel"]'),
    document.querySelector<HTMLElement>("main"),
  ]);
}

/**
 * Meld een geopende overlay aan. `root` is de buitenste (backdrop-)wrapper van
 * de overlay. Geeft de afmeldfunctie terug.
 */
export function acquireOverlay(
  root: HTMLElement,
  returnFocusFallback?: { current: HTMLElement | null }
): () => void {
  if (releaseTimer !== null) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  } else if (count === 0) {
    const active = document.activeElement;
    trigger = active instanceof HTMLElement && active !== document.body ? active : null;
    lockScroll();
  }
  if (returnFocusFallback) fallback = returnFocusFallback;
  count += 1;
  applyInert(root);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
    if (count === 0) releaseTimer = setTimeout(release, 0);
  };
}
