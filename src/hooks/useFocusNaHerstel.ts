"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useHerstelFocus } from "./useHerstelFocus";

/**
 * Na een geslaagde retry verdwijnt de foutregel met zijn knop uit de DOM; de
 * focus zou dan op `body` vallen (T06-regel: focus nooit op `body`, docs/
 * features/leesfouten-herstel-actuele-data.md → Gedeelde onderdelen 6). Dit
 * zet hem op de herstelde sectie (`tabIndex={-1}`, met `aria-label`). Alleen
 * als de focus echt verloren is: heeft de gebruiker inmiddels zelf elders
 * gefocust, dan blijft dat zo. Een fout die tijdens de retry even `loading`
 * wordt telt nog als dezelfde fout.
 */
export function useFocusNaHerstel(
  status: "loading" | "error" | "ready",
  sectie: RefObject<HTMLElement | null>
): void {
  const herstelFocus = useHerstelFocus();
  const hadFout = useRef(false);
  useEffect(() => {
    if (status === "error") {
      hadFout.current = true;
    } else if (status === "ready" && hadFout.current) {
      hadFout.current = false;
      const actief = document.activeElement;
      if (!actief || actief === document.body) herstelFocus(sectie.current);
    }
  }, [status, sectie, herstelFocus]);
}
