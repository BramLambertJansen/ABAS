"use client";

import { useEffect } from "react";

// Module-breed, niet per component: na een geslaagde retry in `Assortimentbeheer`
// stuurt het scherm door naar `/` (BarApp, een nieuwe mount). De vlag moet die
// navigatie overleven.
let hadFout = false;

/**
 * Voor de sessiefase `fout` van `BarApp` en `Assortimentbeheer`, die een
 * eigen "Opnieuw proberen"-knop hebben (geen `LeesFout`). Na een geslaagde
 * retry verdwijnt die knop en zou de focus op `body` vallen (docs/features/
 * leesfouten-herstel-actuele-data.md, besluit 9: focus nooit op `body`). Dan
 * gaat de focus naar de kop van het herstelde scherm (`h1`), anders naar het
 * eerste interactieve element. Alleen als de focus echt verloren is; `laden`
 * tijdens de retry, of een scherm zonder kop of knop (laadstand voor een
 * doorverwijzing), telt nog als dezelfde fout.
 */
export function useFocusNaFaseFout(fase: string): void {
  useEffect(() => {
    if (fase === "fout") {
      hadFout = true;
      return;
    }
    if (fase === "laden" || !hadFout) return;
    const actief = document.activeElement;
    if (actief && actief !== document.body) {
      hadFout = false;
      return;
    }
    const kop = document.querySelector<HTMLElement>("main h1");
    const doel = kop ?? document.querySelector<HTMLElement>("main button, main a[href], main input");
    if (!doel) return;
    if (kop && !kop.hasAttribute("tabindex")) kop.tabIndex = -1;
    doel.focus();
    hadFout = false;
  }, [fase]);
}
