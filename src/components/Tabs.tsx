"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { nextTabIndex, type TabOrientation } from "@/lib/tabKeys";

/**
 * Gedeelde tabbalk (docs/features/dialogen-tabs-landmarks.md → 6. Tabs).
 * Eén implementatie van het APG-patroon voor `PortalDashboard`, `BeheerTabs`
 * en `DienstTabs`: het primitive bepaalt rollen, ids, roving tabindex en
 * toetsen; elke shell levert zijn eigen klassen en inhoud per tab.
 *
 * - Roving tabindex, één tabstop: alleen de geselecteerde tab (bij manuele
 *   activatie: de gefocuste tab) heeft `tabIndex={0}`, de rest `-1`.
 * - Pijlen volgen `orientation` (horizontaal: Links/Rechts, verticaal:
 *   Omhoog/Omlaag), Home/End, wrap-around — zie `src/lib/tabKeys.ts`.
 * - `activation="automatic"`: een pijl selecteert direct. `"manual"`: een pijl
 *   verplaatst alleen de focus, Enter/Space (de klik van de knop) activeert.
 * - `aria-controls` staat alleen op de geselecteerde tab: de panels bestaan
 *   alleen terwijl hun tab actief is. Een tab zonder gemount panel krijgt het
 *   attribuut dus niet; `TabPanel` draagt `aria-labelledby` naar de tab.
 * - De tabs in `items` zijn wat gerenderd wordt: niet-getoonde tabs (bv. de
 *   beheerder-only tabs) horen er niet in en worden dus overgeslagen.
 *
 * Ids komen uit één `idBase` (de aanroeper geeft een `useId()`), zodat tab en
 * panel elkaar vinden zonder hardgecodeerde ids.
 */

export type TabItem = {
  key: string;
  /** Inhoud van de tab; een functie krijgt de selectiestatus. */
  label: ReactNode | ((selected: boolean) => ReactNode);
  /** Klassen per shell, afhankelijk van de selectiestatus. */
  className: (selected: boolean) => string;
};

export function tabElementId(idBase: string, key: string) {
  return `${idBase}-tab-${key}`;
}

export function panelElementId(idBase: string, key: string) {
  return `${idBase}-panel-${key}`;
}

export function TabList({
  idBase,
  label,
  orientation = "horizontal",
  activation = "automatic",
  selected,
  onSelect,
  items,
  className,
}: {
  idBase: string;
  label: string;
  orientation?: TabOrientation;
  activation?: "automatic" | "manual";
  selected: string;
  onSelect: (key: string) => void;
  items: TabItem[];
  className?: string;
}) {
  const buttons = useRef<Map<string, HTMLButtonElement>>(new Map());
  // Alleen relevant bij manuele activatie: de tab waar de focus naartoe
  // gelopen is maar die nog niet geselecteerd is.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const tabStopKey =
    activation === "manual" && focusedKey && items.some((i) => i.key === focusedKey)
      ? focusedKey
      : selected;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (!target) return;
    const current = items.findIndex((i) => tabElementId(idBase, i.key) === target.id);
    const next = nextTabIndex(event.key, current, items.length, orientation);
    if (next === null) return;
    event.preventDefault();
    const key = items[next].key;
    buttons.current.get(key)?.focus();
    if (activation === "automatic") onSelect(key);
    else setFocusedKey(key);
  }

  return (
    // De tablist zelf is bewust niet focusbaar (APG): de toetsen bubbelen
    // op vanaf de tabs, en `onKeyDown` handelt ze alleen af als het doel een tab is.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusedKey(null);
        }
      }}
      className={className}
    >
      {items.map((item) => {
        const isSelected = item.key === selected;
        return (
          <button
            key={item.key}
            ref={(el) => {
              if (el) buttons.current.set(item.key, el);
              else buttons.current.delete(item.key);
            }}
            type="button"
            role="tab"
            id={tabElementId(idBase, item.key)}
            aria-selected={isSelected}
            aria-controls={isSelected ? panelElementId(idBase, item.key) : undefined}
            tabIndex={item.key === tabStopKey ? 0 : -1}
            onClick={() => {
              setFocusedKey(null);
              onSelect(item.key);
            }}
            className={item.className(isSelected)}
          >
            {typeof item.label === "function" ? item.label(isSelected) : item.label}
          </button>
        );
      })}
    </div>
  );
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function TabPanel({
  idBase,
  tabKey,
  className,
  children,
}: {
  idBase: string;
  tabKey: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // W3C-tabspatroon: zonder focusbare inhoud wordt het panel zelf een tabstop,
  // anders slaat Tab het over naar de volgende control buiten de tabs.
  const [ownStop, setOwnStop] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOwnStop(!el.querySelector(FOCUSABLE));
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "tabindex", "href", "hidden", "type"],
    });
    return () => mo.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={panelElementId(idBase, tabKey)}
      role="tabpanel"
      aria-labelledby={tabElementId(idBase, tabKey)}
      tabIndex={ownStop ? 0 : undefined}
      className={className}
    >
      {children}
    </div>
  );
}
